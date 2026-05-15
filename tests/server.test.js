const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Orchestrator } = require("../src/orchestrator");
const { createHttpServer } = require("../src/server");

async function startTestServer() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tendrilflow-api-"));
  const orchestrator = new Orchestrator(root);
  await orchestrator.init();
  for (const agent of (await orchestrator.state()).agents) {
    await orchestrator.store.patchAgent(agent.id, { command: "" });
  }
  const server = createHttpServer(orchestrator);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    root,
    baseUrl: `http://127.0.0.1:${address.port}`,
    server
  };
}

test("HTTP API supports the core task room flow", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json());
  assert.ok(state.workspaces.some((workspace) => workspace.workspace_id === "workspace_main"));
  assert.ok(state.groups.some((group) => group.group_id === "group_main"));
  assert.ok(state.agents.some((agent) => agent.id === "agent_host" && agent.name === "host-agent"));
  assert.equal(state.agents.length, 1);
  const meta = await fetch(`${baseUrl}/api/meta`).then((response) => response.json());
  assert.ok(meta.isolationModes.includes("worktree"));

  const created = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "API task",
      owner_agent_id: "agent_host"
    })
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/tasks/${created.task.task_id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "@host 拆分任务" })
  });

  const room = await fetch(`${baseUrl}/api/tasks/${created.task.task_id}`).then((response) =>
    response.json()
  );
  assert.equal(room.task.task_id, created.task.task_id);
  assert.ok(room.events.some((event) => event.type === "decision_record"));
  const graphEvent = room.events.find((event) => event.type === "task_graph");
  assert.ok(graphEvent);

  const applied = await fetch(`${baseUrl}/api/tasks/${created.task.task_id}/task-graph/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph_event_id: graphEvent.event_id, graph: graphEvent.content })
  }).then((response) => response.json());
  assert.ok(applied.tasks.length > 0);
  assert.equal(applied.parent_task.child_task_ids.length, applied.tasks.length);
});

test("static file serving blocks encoded path traversal", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const url = new URL(baseUrl);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: "/%2e%2e%5cpackage.json",
        method: "GET"
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("HTTP API supports launcher mode and delete actions", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const workspaceResponse = await fetch(`${baseUrl}/api/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "API Workspace" })
  }).then((response) => response.json());

  const groupResponse = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "API Group", workspace_id: workspaceResponse.workspace.workspace_id })
  }).then((response) => response.json());

  const agentResponse = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "api-worker",
      role: "work",
      workspace_id: workspaceResponse.workspace.workspace_id,
      group_id: groupResponse.group.group_id,
      mode: "exec",
      provider: "codex",
      command: "node scripts/mock-agent.js --name api-worker",
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  assert.equal(agentResponse.agent.mode, "exec");
  assert.equal(agentResponse.agent.workspace_id, workspaceResponse.workspace.workspace_id);
  assert.equal(agentResponse.agent.group_id, groupResponse.group.group_id);
  assert.equal(agentResponse.agent.transport, "legacy_cli");

  const cliLaunch = await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}/cli`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dry_run: true, platform: "win32" })
  }).then((response) => response.json());

  assert.equal(cliLaunch.agent_id, agentResponse.agent.id);
  assert.match(cliLaunch.command, /^codex resume --include-non-interactive/);
  assert.match(cliLaunch.command, /-C '/);
  assert.equal(cliLaunch.dry_run, true);
  assert.equal(cliLaunch.launcher.file, "cmd.exe");
  assert.match(cliLaunch.launcher.args.join(" "), /start powershell\.exe/);

  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Delete through API",
      workspace_id: workspaceResponse.workspace.workspace_id,
      group_id: groupResponse.group.group_id,
      owner_agent_id: agentResponse.agent.id
    })
  }).then((response) => response.json());

  const deletedAgent = await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}`, {
    method: "DELETE"
  }).then((response) => response.json());
  assert.equal(deletedAgent.deleted, true);

  const deletedTask = await fetch(`${baseUrl}/api/tasks/${taskResponse.task.task_id}`, {
    method: "DELETE"
  }).then((response) => response.json());
  assert.equal(deletedTask.deleted, true);
});

test("HTTP API deletes groups and contained tasks and agents", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const workspaceResponse = await fetch(`${baseUrl}/api/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Delete Group Workspace" })
  }).then((response) => response.json());

  const groupResponse = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Delete Me", workspace_id: workspaceResponse.workspace.workspace_id })
  }).then((response) => response.json());

  const agentResponse = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "delete-group-worker",
      role: "work",
      workspace_id: workspaceResponse.workspace.workspace_id,
      group_id: groupResponse.group.group_id,
      mode: "mock",
      provider: "mock",
      command: "",
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Deleted with group",
      workspace_id: workspaceResponse.workspace.workspace_id,
      group_id: groupResponse.group.group_id,
      owner_agent_id: agentResponse.agent.id
    })
  }).then((response) => response.json());

  const deletedGroup = await fetch(
    `${baseUrl}/api/groups/${workspaceResponse.workspace.workspace_id}/${groupResponse.group.group_id}`,
    { method: "DELETE" }
  ).then((response) => response.json());
  const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json());

  assert.equal(deletedGroup.deleted, true);
  assert.ok(!state.groups.some((group) => group.group_id === groupResponse.group.group_id));
  assert.ok(!state.agents.some((agent) => agent.id === agentResponse.agent.id));
  assert.ok(!state.tasks.some((task) => task.task_id === taskResponse.task.task_id));
});

test("HTTP API supports group handoff rule canvas data", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const worker = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "api-worker",
      role: "work",
      mode: "mock",
      provider: "mock",
      command: "",
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  const policyResponse = await fetch(`${baseUrl}/api/groups/workspace_main/group_main/handoff-rules`).then((response) =>
    response.json()
  );
  assert.equal(policyResponse.policy.managed_by_role, "host");
  assert.equal(policyResponse.policy.skill_id, "host.handoff_policy");
  assert.equal(policyResponse.policy.managed_by_tool, "host.update_handoff_rules");
  assert.deepEqual(policyResponse.policy.rules, []);

  const saved = await fetch(`${baseUrl}/api/groups/workspace_main/group_main/handoff-rules`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rules: [
        {
          from_agent_id: worker.agent.id,
          to_agent_id: "agent_host",
          trigger: "blocked",
          label: "Escalate blockers"
        }
      ]
    })
  }).then((response) => response.json());

  assert.equal(saved.policy.rules.length, 1);
  assert.equal(saved.policy.rules[0].to_agent_id, "agent_host");
});

test("HTTP API exposes editable workspace and group skills", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const list = await fetch(`${baseUrl}/api/skills?workspace_id=workspace_main&group_id=group_main`).then((response) =>
    response.json()
  );
  assert.ok(list.skills.some((skill) => skill.skill_id === "workspace.context" && skill.scope === "workspace"));
  assert.ok(list.skills.some((skill) => skill.skill_id === "host.playbook" && skill.scope === "group"));

  const read = await fetch(
    `${baseUrl}/api/skills/group/host.playbook?workspace_id=workspace_main&group_id=group_main`
  ).then((response) => response.json());
  assert.match(read.skill.body, /Host Playbook/);

  const saved = await fetch(
    `${baseUrl}/api/skills/group/review.evidence_check?workspace_id=workspace_main&group_id=group_main`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roles: ["review"],
        summary: "Review API skill summary.",
        body: "# Review Evidence Check\n\nAPI-edited skill body."
      })
    }
  ).then((response) => response.json());

  assert.equal(saved.skill.skill_id, "review.evidence_check");
  assert.equal(saved.skill.summary, "Review API skill summary.");
  assert.match(saved.skill.body, /API-edited skill body/);
});

test("HTTP API exposes task replay analytics", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const agentResponse = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "api-replay-worker",
      role: "work",
      mode: "mock",
      provider: "mock",
      command: "",
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Replay API",
      owner_agent_id: agentResponse.agent.id
    })
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/tasks/${taskResponse.task.task_id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `@${agentResponse.agent.name} record replay evidence` })
  });

  const replay = await fetch(`${baseUrl}/api/tasks/${taskResponse.task.task_id}/replay`).then((response) =>
    response.json()
  );

  assert.equal(replay.task_summary.task_id, taskResponse.task.task_id);
  assert.ok(replay.metrics.event_count > 0);
  assert.ok(Array.isArray(replay.agent_contributions));
  assert.ok(Array.isArray(replay.timeline));
  assert.ok(Array.isArray(replay.host_replay_suggestions));
});

test("HTTP API exposes agent detail and session logs", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const agentResponse = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "agent_review",
      name: "review-agent",
      role: "review",
      mode: "mock",
      provider: "mock",
      command: "",
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}/start`, { method: "POST" });
  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Agent console API",
      owner_agent_id: agentResponse.agent.id
    })
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/tasks/${taskResponse.task.task_id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "@review-agent inspect this task" })
  });

  const detail = await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}`).then((response) => response.json());
  assert.equal(detail.agent.id, agentResponse.agent.id);
  assert.equal(detail.current_task.task_id, taskResponse.task.task_id);
  assert.ok(detail.logs.some((event) => event.type === "process_started"));

  const logs = await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}/logs?limit=1`).then((response) =>
    response.json()
  );
  assert.equal(logs.logs.length, 1);
  assert.equal(logs.logs[0].agent_id, agentResponse.agent.id);
});

test("HTTP API stop keeps the server alive after stopping a child process", async (t) => {
  const { baseUrl, server } = await startTestServer();
  t.after(() => server.close());

  const scriptPath = path.resolve(__dirname, "..", "scripts", "mock-agent.js");
  const agentResponse = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "agent_http_stop",
      name: "http-stop-agent",
      role: "review",
      mode: "mock",
      provider: "tendrilflow",
      command: `node "${scriptPath}" --role review --name http-stop-agent`,
      cwd: process.cwd()
    })
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}/start`, { method: "POST" });
  await fetch(`${baseUrl}/api/agents/${agentResponse.agent.id}/stop`, { method: "POST" });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json());
  const agent = state.agents.find((candidate) => candidate.id === agentResponse.agent.id);
  assert.equal(agent.status, "stopped");
  assert.equal(agent.current_task_id, null);
});
