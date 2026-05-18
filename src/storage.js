const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DEFAULT_GROUP_ID,
  DEFAULT_WORKSPACE_ID,
  makeId,
  normalizeIsolationMode,
  normalizeMode,
  normalizeRole,
  normalizeStatus,
  nowIso,
  slugify
} = require("./model");
const { GROUP_ROUTE_TOOL_ID, HOST_ROUTE_TOOL_ID, buildGroupRouteToolContract } = require("./protocol");
const { redactForStorage } = require("./safety");

const MEMORY_FILES = {
  "MEMORY.md": "# Group Memory\n\n",
  "decisions.md": "# Decisions\n\n",
  "facts.md": "# Facts\n\n",
  "risks.md": "# Risks\n\n"
};

const DEFAULT_WORKSPACE_SKILLS = [
  {
    skill_id: "workspace.context",
    scope: "workspace",
    roles: ["*"],
    title: "Workspace Context",
    summary:
      "Use the workspace root, repository instructions, and visible TendrilFlow room state as the shared execution context.",
    body: [
      "# Workspace Context",
      "",
      "Use this skill as the shared workspace contract for every agent in this TendrilFlow workspace.",
      "",
      "- Treat the workspace root as the default execution boundary.",
      "- Prefer repo-local instructions such as AGENTS.md when the execution adapter supports them.",
      "- Keep durable decisions, facts, risks, and preferences in the group memory files.",
      "- Report evidence back to the Agent Room instead of relying on private side context."
    ].join("\n")
  }
];

const DEFAULT_GROUP_SKILLS = [
  {
    skill_id: "host.playbook",
    scope: "group",
    roles: ["host"],
    title: "Host Playbook",
    summary:
      "Run the visible group playbook: plan, clarify, execute, verify, fix if needed, and finalize with evidence.",
    body: [
      "# Host Playbook",
      "",
      "Use this skill when the user asks the Host Agent to organize a task.",
      "",
      "1. Plan the work and state the current playbook stage.",
      "2. Clarify missing acceptance criteria before execution if needed.",
      "3. Assign or route to one execution owner at a time.",
      "4. Ask review/debug/test agents for evidence when risk is visible.",
      "5. Fix or reassign blocked work with a visible decision record.",
      "6. Finalize with outcome, evidence, and remaining risk."
    ].join("\n")
  },
  {
    skill_id: "host.task_graph",
    scope: "group",
    roles: ["host"],
    title: "Host Task Graph",
    summary:
      "Convert a task into visible subtasks with owners, dependencies, verification, and recovery steps.",
    body: [
      "# Host Task Graph",
      "",
      "Use this skill when a task should be decomposed into a reliable execution graph.",
      "",
      "- Keep graph nodes small enough for one agent to own.",
      "- Make verification explicit instead of treating it as part of execution.",
      "- Add recovery or fix nodes when failure modes are likely.",
      "- Suggest reassignment when owner health is stale, detached, or failed.",
      "- Do not create child tasks until the user accepts the graph."
    ].join("\n")
  },
  {
    skill_id: HOST_ROUTE_TOOL_ID,
    scope: "group",
    roles: ["host"],
    title: "Host Route To Agent",
    summary:
      "Route visible task context to a named group member exactly once and ask that agent to reply in the room.",
    body: [
      "# Host Route To Agent",
      "",
      "Use this skill when the user asks the Host Agent to involve a specific group member.",
      "",
      "- Route only from explicit user or Host intent.",
      "- Include current task context, recent room trace, and the exact request.",
      "- Ask the target agent to answer in the shared Agent Room.",
      "- Emit or trigger the explicit host.route_to_agent tool call; do not rely on prose implying that routing happened.",
      "- Do not route based on another agent's natural-language output.",
      "- Avoid repeated routes that could create loop storms.",
      "- TendrilFlow records the tool call, route delivery, and target response in the visible transcript."
    ].join("\n")
  },
  {
    skill_id: GROUP_ROUTE_TOOL_ID,
    scope: "group",
    roles: ["*"],
    title: "Group Route To Agent",
    summary:
      "Use the explicit group.route_to_agent tool when visible user or Host intent authorizes asking another member to respond.",
    body: [
      "# Group Route To Agent",
      "",
      "Use this skill when you decide another group member should be asked for help inside the visible Agent Room.",
      "",
      buildGroupRouteToolContract({ heading: "Tool contract:" })
    ].join("\n")
  },
  {
    skill_id: "host.control",
    scope: "group",
    roles: ["host"],
    title: "Host Control",
    summary:
      "Use stop and broadcast as visible group safety primitives when execution needs to pause or align.",
    body: [
      "# Host Control",
      "",
      "Use this skill when the visible room intent requires a high-level control action.",
      "",
      "- Stop running agents when the user or Host needs to prevent unsafe or incorrect continuation.",
      "- Broadcast high-priority constraints to running members when the group must align.",
      "- Keep the action visible as a tool_call_summary.",
      "- Control primitives do not replace each agent's own tools or skills."
    ].join("\n")
  },
  {
    skill_id: "host.handoff_policy",
    scope: "group",
    roles: ["host"],
    title: "Host Handoff Policy",
    summary:
      "Own handoff decisions and maintain the group handoff rule state through host.update_handoff_rules.",
    body: [
      "# Host Handoff Policy",
      "",
      "Use this skill when responsibility should move from one agent to another.",
      "",
      "- A handoff should include goal, status, completed work, blockers, assumptions, evidence, risks, and next step.",
      "- Prefer handoff when the current owner is blocked, unhealthy, or the task enters a different specialty.",
      "- Keep custom handoff rules visible in the group handoff rule canvas.",
      "- The receiving agent should confirm the handoff before continuing."
    ].join("\n")
  },
  {
    skill_id: "review.evidence_check",
    scope: "group",
    roles: ["review"],
    title: "Review Evidence Check",
    summary:
      "Review observable artifacts, tests, diffs, room trace, and acceptance criteria with actionable findings.",
    body: [
      "# Review Evidence Check",
      "",
      "Use this skill when reviewing another agent's work.",
      "",
      "- Lead with bugs, regressions, missing evidence, and missing tests.",
      "- Separate verified facts from assumptions.",
      "- Cite files, commands, logs, or room events when possible.",
      "- Keep comments actionable and scoped to the current task."
    ].join("\n")
  },
  {
    skill_id: "debug.recovery",
    scope: "group",
    roles: ["debug"],
    title: "Debug Recovery",
    summary:
      "Diagnose blockers from logs, status changes, tool summaries, and visible outputs without relying on private thoughts.",
    body: [
      "# Debug Recovery",
      "",
      "Use this skill when a task is blocked, failed, stale, or ambiguous.",
      "",
      "- Inspect visible status changes, tool summaries, logs, and recent events.",
      "- Identify the likely root cause and the smallest next recovery step.",
      "- State what evidence is missing before making claims.",
      "- Recommend whether to retry, fix, reassign, or ask the user."
    ].join("\n")
  },
  {
    skill_id: "work.execution_report",
    scope: "group",
    roles: ["work"],
    title: "Execution Report",
    summary:
      "Execute with the agent's own tools and report changed artifacts, commands, verification, blockers, and next steps.",
    body: [
      "# Execution Report",
      "",
      "Use this skill when carrying out implementation or research work.",
      "",
      "- Use your own tools and adapter capabilities for the actual work.",
      "- Report commands, files, outputs, and verification evidence.",
      "- Ask Host for review, debug, testing, or handoff when the next step requires another member.",
      "- Do not claim completion without visible evidence."
    ].join("\n")
  }
];

const LEGACY_DEFAULT_AGENT_IDS = new Set([
  "agent_codex_worker",
  "agent_review",
  "agent_debug",
  "agent_observe",
  "agent_acp_sample"
]);

function normalizeEnv(env) {
  if (!env) {
    return {};
  }
  if (typeof env === "object" && !Array.isArray(env)) {
    return env;
  }
  return String(env)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((result, line) => {
      const index = line.indexOf("=");
      if (index > 0) {
        result[line.slice(0, index)] = line.slice(index + 1);
      }
      return result;
    }, {});
}

function transportFromMode(mode) {
  return mode === "acp" ? "acp" : "legacy_cli";
}

function quoteShell(value) {
  return `"${String(value || "").replaceAll('"', '\\"')}"`;
}

function codexHostCommand(rootDir, name = "host-agent", cwd = rootDir) {
  return [
    "node",
    quoteShell(path.join(rootDir, "scripts", "codex-agent.js")),
    "--name",
    quoteShell(name),
    "--mode",
    "exec",
    "--cwd",
    quoteShell(cwd)
  ].join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCodexHostCommand(command, name = "host-agent") {
  const raw = String(command || "");
  const namePattern = new RegExp(`--name(?:=|\\s+)("${escapeRegExp(name)}"|'${escapeRegExp(name)}'|${escapeRegExp(name)})(?:\\s|$)`);
  return raw.includes("codex-agent.js") && namePattern.test(raw);
}

function normalizeIdList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean).map(String)));
}

function normalizeSkillId(value, fallback = "custom.skill") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return normalized || fallback;
}

function skillFileName(skillId) {
  return `${normalizeSkillId(skillId)}.md`;
}

function normalizeSkillRoles(value) {
  const roles = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,;\s]+/)
        .filter(Boolean);
  return Array.from(
    new Set(
      roles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter((role) => role === "*" || /^[a-z0-9_-]+$/.test(role))
    )
  );
}

function cleanFrontmatterValue(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function skillMarkdown(skill) {
  const roles = normalizeSkillRoles(skill.roles);
  const body = String(skill.body || "").trim();
  return [
    "---",
    `skill_id: ${normalizeSkillId(skill.skill_id)}`,
    `scope: ${skill.scope === "workspace" ? "workspace" : "group"}`,
    `roles: ${roles.join(", ") || "*"}`,
    `title: ${cleanFrontmatterValue(skill.title || skill.skill_id)}`,
    `summary: ${cleanFrontmatterValue(skill.summary || "")}`,
    `updated_at: ${skill.updated_at || nowIso()}`,
    "---",
    "",
    body,
    ""
  ].join("\n");
}

function parseSkillMarkdown(raw, metadata) {
  const lines = String(raw || "").split(/\r?\n/);
  const frontmatter = {};
  let bodyStart = 0;
  if (lines[0] === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index] === "---") {
        bodyStart = index + 1;
        break;
      }
      const match = lines[index].match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        frontmatter[match[1]] = match[2];
      }
    }
  }
  const body = lines.slice(bodyStart).join("\n").trim();
  const skillId = normalizeSkillId(frontmatter.skill_id || path.basename(metadata.file_name, ".md"));
  const title = frontmatter.title || body.match(/^#\s+(.+)$/m)?.[1] || skillId;
  const summary =
    frontmatter.summary ||
    body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("-")) ||
    "";
  return {
    skill_id: skillId,
    scope: frontmatter.scope === "workspace" ? "workspace" : metadata.scope,
    workspace_id: metadata.workspace_id,
    group_id: metadata.scope === "group" ? metadata.group_id : null,
    roles: normalizeSkillRoles(frontmatter.roles || "*"),
    title,
    summary,
    body,
    file_name: metadata.file_name,
    path: metadata.relative_path,
    updated_at: frontmatter.updated_at || null
  };
}

function skillMatchesAgent(skill, agent = {}) {
  const role = String(agent.role || "work").toLowerCase();
  const agentId = String(agent.id || "").toLowerCase();
  const agentName = String(agent.name || "").toLowerCase();
  const roles = new Set(normalizeSkillRoles(skill.roles));
  return (
    roles.has("*") ||
    roles.has(role) ||
    roles.has(agentId) ||
    roles.has(agentName) ||
    String(skill.skill_id || "").startsWith(`${role}.`)
  );
}

class FileStore {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.baseDir = path.join(this.rootDir, ".tendrilflow");
    this.workspacesDir = path.join(this.baseDir, "workspaces");
    this.fileLocks = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }
    await fs.mkdir(this.workspacesDir, { recursive: true });
    await this.clearLegacyFlatData();
    await this.ensureDefaultWorkspace();
    await this.ensureWorkspaceSkills(DEFAULT_WORKSPACE_ID);
    await this.ensureDefaultGroup(DEFAULT_WORKSPACE_ID);
    await this.ensureGroupMemory(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
    await this.ensureGroupSkills(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
    try {
      await fs.access(this.agentsPath(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID));
      await this.migrateLegacyHostNaming(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
      await this.migrateAcpSampleNaming(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
      await this.reconcileDefaultAgents(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
      await this.ensureGroupHosts();
      await this.removeLegacyDefaultAgents();
    } catch {
      await this.writeJson(
        this.agentsPath(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID),
        this.defaultAgents(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID)
      );
    }
    await this.migrateMissingWorkspaceGroupIds();
    await this.ensureAllSkills();
    await this.ensureAllHandoffPolicies();
    this.initialized = true;
  }

  async clearLegacyFlatData() {
    for (const legacyName of ["agents", "groups", "tasks"]) {
      await fs.rm(path.join(this.baseDir, legacyName), { recursive: true, force: true }).catch(() => undefined);
    }
  }

  defaultWorkspace() {
    const createdAt = nowIso();
    return {
      workspace_id: DEFAULT_WORKSPACE_ID,
      name: "Main Workspace",
      description: "Default TendrilFlow workspace.",
      root_dir: this.rootDir,
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  defaultGroup(workspaceId = DEFAULT_WORKSPACE_ID) {
    const createdAt = nowIso();
    return {
      workspace_id: workspaceId,
      group_id: DEFAULT_GROUP_ID,
      name: "Main Group",
      description: "Default TendrilFlow agent group.",
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  hostAgent(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    const createdAt = nowIso();
    const hostId =
      workspaceId === DEFAULT_WORKSPACE_ID && groupId === DEFAULT_GROUP_ID
        ? "agent_host"
        : `agent_${slugify(workspaceId, "workspace")}_${slugify(groupId, "group")}_host`.slice(0, 96);
    return {
      id: hostId,
      name: "host-agent",
      role: "host",
      workspace_id: workspaceId,
      group_id: groupId,
      transport: "legacy_cli",
      mode: "exec",
      provider: "codex",
      cwd: this.rootDir,
      base_cwd: this.rootDir,
      isolation_mode: "shared",
      worktree: null,
      command: codexHostCommand(this.rootDir),
      env: {},
      status: "stopped",
      current_task_id: null,
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  defaultHandoffPolicy(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    const createdAt = nowIso();
    return {
      workspace_id: workspaceId,
      group_id: groupId,
      managed_by_role: "host",
      skill_id: "host.handoff_policy",
      managed_by_tool: "host.update_handoff_rules",
      default_policy: {
        owner: "host-agent",
        description:
          "The Host Agent handoff skill owns handoff decisions. TendrilFlow stores and displays this skill state."
      },
      rules: [],
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  workspaceDir(workspaceId = DEFAULT_WORKSPACE_ID) {
    return path.join(this.workspacesDir, workspaceId);
  }

  workspacePath(workspaceId = DEFAULT_WORKSPACE_ID) {
    return path.join(this.workspaceDir(workspaceId), "workspace.json");
  }

  workspaceSkillsDir(workspaceId = DEFAULT_WORKSPACE_ID) {
    return path.join(this.workspaceDir(workspaceId), "skills");
  }

  workspaceSkillPath(workspaceId = DEFAULT_WORKSPACE_ID, skillId = "workspace.context") {
    return path.join(this.workspaceSkillsDir(workspaceId), skillFileName(skillId));
  }

  groupsDir(workspaceId = DEFAULT_WORKSPACE_ID) {
    return path.join(this.workspaceDir(workspaceId), "groups");
  }

  groupDir(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupsDir(workspaceId), groupId);
  }

  groupPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "group.json");
  }

  groupMemoryDir(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "memory");
  }

  groupMemoryPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID, fileName = "MEMORY.md") {
    return path.join(this.groupMemoryDir(workspaceId, groupId), fileName);
  }

  groupSkillsDir(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "skills");
  }

  groupSkillPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID, skillId = "host.playbook") {
    return path.join(this.groupSkillsDir(workspaceId, groupId), skillFileName(skillId));
  }

  agentsPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "agents.json");
  }

  handoffPolicyPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "handoff_rules.json");
  }

  groupEventsPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "events.jsonl");
  }

  groupRoomPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.relative(this.rootDir, this.groupEventsPath(workspaceId, groupId)).replaceAll("\\", "/");
  }

  agentLogsDir(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "agent_logs");
  }

  agentLogPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID, agentId) {
    return path.join(this.agentLogsDir(workspaceId, groupId), `${agentId}.jsonl`);
  }

  tasksDir(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "tasks");
  }

  taskDirFor(workspaceId, groupId, taskId) {
    return path.join(this.tasksDir(workspaceId, groupId), taskId);
  }

  taskPathFor(workspaceId, groupId, taskId) {
    return path.join(this.taskDirFor(workspaceId, groupId, taskId), "task.json");
  }

  taskPathForTask(task) {
    return this.taskPathFor(task.workspace_id, task.group_id, task.task_id);
  }

  eventsPathForTask(task) {
    return path.join(this.taskDirFor(task.workspace_id, task.group_id, task.task_id), "events.jsonl");
  }

  async ensureDefaultWorkspace() {
    try {
      await fs.access(this.workspacePath(DEFAULT_WORKSPACE_ID));
    } catch {
      await this.writeJson(this.workspacePath(DEFAULT_WORKSPACE_ID), this.defaultWorkspace());
    }
  }

  async ensureDefaultGroup(workspaceId = DEFAULT_WORKSPACE_ID) {
    try {
      await fs.access(this.groupPath(workspaceId, DEFAULT_GROUP_ID));
    } catch {
      await this.writeJson(this.groupPath(workspaceId, DEFAULT_GROUP_ID), this.defaultGroup(workspaceId));
    }
    await fs.mkdir(this.tasksDir(workspaceId, DEFAULT_GROUP_ID), { recursive: true });
    await this.ensureGroupSkills(workspaceId, DEFAULT_GROUP_ID);
  }

  async ensureGroupMemory(workspaceId, groupId) {
    await fs.mkdir(this.groupMemoryDir(workspaceId, groupId), { recursive: true });
    for (const [fileName, contents] of Object.entries(MEMORY_FILES)) {
      const filePath = this.groupMemoryPath(workspaceId, groupId, fileName);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, contents, "utf8");
      }
    }
  }

  async ensureWorkspaceSkills(workspaceId) {
    await fs.mkdir(this.workspaceSkillsDir(workspaceId), { recursive: true });
    for (const skill of DEFAULT_WORKSPACE_SKILLS) {
      const filePath = this.workspaceSkillPath(workspaceId, skill.skill_id);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, skillMarkdown({ ...skill, scope: "workspace" }), "utf8");
      }
    }
  }

  async ensureGroupSkills(workspaceId, groupId) {
    await fs.mkdir(this.groupSkillsDir(workspaceId, groupId), { recursive: true });
    for (const skill of DEFAULT_GROUP_SKILLS) {
      const filePath = this.groupSkillPath(workspaceId, groupId, skill.skill_id);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, skillMarkdown({ ...skill, scope: "group" }), "utf8");
      }
    }
  }

  async ensureAllSkills() {
    for (const workspaceId of await this.listWorkspaceIds()) {
      await this.ensureWorkspaceSkills(workspaceId);
    }
    for (const group of await this.listGroupsRaw()) {
      await this.ensureGroupSkills(group.workspace_id, group.group_id);
    }
  }

  async ensureHandoffPolicy(workspaceId, groupId) {
    try {
      await fs.access(this.handoffPolicyPath(workspaceId, groupId));
    } catch {
      await this.writeJson(this.handoffPolicyPath(workspaceId, groupId), this.defaultHandoffPolicy(workspaceId, groupId));
    }
  }

  async ensureAllHandoffPolicies() {
    for (const group of await this.listGroupsRaw()) {
      await this.ensureHandoffPolicy(group.workspace_id, group.group_id);
    }
  }

  async migrateMissingWorkspaceGroupIds() {
    const agentsByLocation = await this.listAgentLocationsRaw();
    for (const location of agentsByLocation) {
      const nextAgents = location.agents.map((agent) => ({
        ...agent,
        workspace_id: agent.workspace_id || location.workspace_id,
        group_id: agent.group_id || location.group_id,
        base_cwd: agent.base_cwd || agent.cwd || this.rootDir,
        isolation_mode: normalizeIsolationMode(agent.isolation_mode),
        worktree: agent.worktree || null
      }));
      if (JSON.stringify(nextAgents) !== JSON.stringify(location.agents)) {
        await this.writeJson(this.agentsPath(location.workspace_id, location.group_id), nextAgents);
      }
    }

    for (const task of await this.listTasksRaw()) {
      const normalized = {
        ...task,
        workspace_id: task.workspace_id || DEFAULT_WORKSPACE_ID,
        group_id: task.group_id || DEFAULT_GROUP_ID
      };
      if (JSON.stringify(normalized) !== JSON.stringify(task)) {
        await this.writeJson(this.taskPathForTask(normalized), normalized);
      }
    }
  }

  async migrateLegacyHostNaming(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    const legacyRole = ["coord", "inator"].join("");
    const legacyId = `agent_${legacyRole}`;
    const legacyName = legacyRole;
    const hostDefault = this.defaultAgents(workspaceId, groupId).find((agent) => agent.id === "agent_host");
    const agents = await this.readJson(this.agentsPath(workspaceId, groupId), []);
    const nextById = new Map();
    const replacements = new Map();
    let changed = false;

    for (const agent of agents) {
      const isLegacyHost =
        agent.id === legacyId || agent.name === legacyName || agent.role === legacyRole;
      const isHost =
        agent.id === "agent_host" || agent.name === "host-agent" || agent.role === "host";
      const legacyCommand = String(agent.command || "").includes(legacyRole);
      const legacyMockHost =
        String(agent.provider || "").toLowerCase() === "mock" ||
        String(agent.mode || "").toLowerCase() === "mock" ||
        String(agent.command || "").includes("mock-agent.js");
      const codexHostCommandMismatch =
        String(agent.provider || "").toLowerCase() === "codex" &&
        String(agent.mode || "").toLowerCase() === "exec" &&
        !hasCodexHostCommand(agent.command);
      const needsHostNormalization =
        agent.id !== "agent_host" ||
        agent.name !== "host-agent" ||
        agent.role !== "host" ||
        legacyCommand ||
        legacyMockHost ||
        codexHostCommandMismatch;

      if (!isLegacyHost && !isHost) {
        nextById.set(agent.id, agent);
        continue;
      }

      if (isHost && !isLegacyHost && !needsHostNormalization) {
        nextById.set(agent.id, agent);
        continue;
      }

      const normalized = {
        ...hostDefault,
        ...agent,
        workspace_id: workspaceId,
        group_id: groupId,
        id: "agent_host",
        name: "host-agent",
        role: "host",
        transport: legacyMockHost ? hostDefault.transport : agent.transport || hostDefault.transport,
        mode: legacyMockHost ? hostDefault.mode : agent.mode || hostDefault.mode,
        provider: legacyMockHost ? hostDefault.provider : agent.provider || hostDefault.provider,
        cwd: agent.cwd || hostDefault.cwd,
        base_cwd: agent.base_cwd || agent.cwd || hostDefault.base_cwd,
        isolation_mode: normalizeIsolationMode(agent.isolation_mode),
        worktree: agent.worktree || null,
        command:
          legacyCommand || legacyMockHost || codexHostCommandMismatch
            ? codexHostCommand(this.rootDir, "host-agent", agent.cwd || hostDefault.cwd)
            : agent.command || hostDefault.command,
        env: agent.env || hostDefault.env,
        updated_at: nowIso()
      };
      const existing = nextById.get("agent_host");
      nextById.set(
        "agent_host",
        existing ? { ...normalized, ...existing, id: "agent_host", name: "host-agent", role: "host" } : normalized
      );
      if (agent.id !== "agent_host") {
        replacements.set(agent.id, "agent_host");
      }
      changed = changed || isLegacyHost || needsHostNormalization;
    }

    if (!changed) {
      return;
    }

    await this.writeJson(this.agentsPath(workspaceId, groupId), [...nextById.values()]);
    for (const [oldId, newId] of replacements) {
      await this.replaceAgentReferences(oldId, newId);
    }
  }

  async migrateAcpSampleNaming(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    const agents = await this.readJson(this.agentsPath(workspaceId, groupId), []);
    let changed = false;
    const next = agents.map((agent) => {
      const isLegacyAcpSample =
        agent.id === "agent_acp_sample" ||
        agent.provider === "acp-sample" ||
        String(agent.command || "").includes("mock-acp-agent.js");
      if (!isLegacyAcpSample) {
        return agent;
      }
      const shouldNormalizeCommand = !agent.command || String(agent.command).includes("acp-worker");
      const normalized = {
        ...agent,
        name: agent.id === "agent_acp_sample" ? "mock-acp-worker" : agent.name,
        provider: "mock",
        command: shouldNormalizeCommand ? "node scripts/mock-acp-agent.js --name mock-acp-worker" : agent.command,
        updated_at: nowIso()
      };
      changed =
        changed ||
        agent.name !== normalized.name ||
        agent.provider !== normalized.provider ||
        shouldNormalizeCommand;
      return changed ? normalized : agent;
    });

    if (changed) {
      await this.writeJson(this.agentsPath(workspaceId, groupId), next);
    }
  }

  async ensureGroupHosts() {
    for (const group of await this.listGroupsRaw()) {
      const agentsPath = this.agentsPath(group.workspace_id, group.group_id);
      const agents = await this.readJson(agentsPath, []);
      const defaultHost = this.hostAgent(group.workspace_id, group.group_id);
      const hostIndex = agents.findIndex((agent) => agent.role === "host");
      if (hostIndex === -1) {
        await this.writeJson(agentsPath, [defaultHost, ...agents]);
        continue;
      }
      const host = agents[hostIndex];
      const legacyMockHost =
        String(host.provider || "").toLowerCase() === "mock" ||
        String(host.mode || "").toLowerCase() === "mock" ||
        String(host.command || "").includes("mock-agent.js");
      const codexHostCommandMismatch =
        String(host.provider || "").toLowerCase() === "codex" &&
        String(host.mode || "").toLowerCase() === "exec" &&
        !hasCodexHostCommand(host.command);
      if (!legacyMockHost && !codexHostCommandMismatch) {
        continue;
      }
      const cwd = host.cwd || defaultHost.cwd;
      const normalized = {
        ...defaultHost,
        ...host,
        id: defaultHost.id,
        name: "host-agent",
        role: "host",
        workspace_id: group.workspace_id,
        group_id: group.group_id,
        transport: defaultHost.transport,
        mode: defaultHost.mode,
        provider: defaultHost.provider,
        cwd,
        base_cwd: host.base_cwd || cwd,
        command: codexHostCommand(this.rootDir, "host-agent", cwd),
        updated_at: nowIso()
      };
      const next = agents.map((agent, index) => (index === hostIndex ? normalized : agent));
      await this.writeJson(agentsPath, next);
    }
  }

  async removeLegacyDefaultAgents() {
    for (const location of await this.listAgentLocationsRaw()) {
      const next = location.agents.filter((agent) => !LEGACY_DEFAULT_AGENT_IDS.has(agent.id));
      if (next.length === location.agents.length) {
        continue;
      }
      await this.writeJson(this.agentsPath(location.workspace_id, location.group_id), next);
      for (const removed of location.agents.filter((agent) => LEGACY_DEFAULT_AGENT_IDS.has(agent.id))) {
        await this.replaceAgentReferences(removed.id, null);
        await fs.rm(this.agentLogPath(location.workspace_id, location.group_id, removed.id), { force: true }).catch(() => undefined);
      }
    }
  }

  async reconcileDefaultAgents(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    const agentsPath = this.agentsPath(workspaceId, groupId);
    const agents = await this.readJson(agentsPath, []);
    const defaults = this.defaultAgents(workspaceId, groupId);
    const next = [...agents];
    let changed = false;

    for (const defaultAgent of defaults) {
      if (next.some((agent) => agent.id === defaultAgent.id)) {
        continue;
      }

      const sameDefaultProfile = next.find(
        (agent) =>
          agent.name === defaultAgent.name &&
          agent.role === defaultAgent.role &&
          agent.provider === defaultAgent.provider &&
          !defaults.some((candidate) => candidate.id === agent.id)
      );

      if (sameDefaultProfile) {
        const oldId = sameDefaultProfile.id;
        Object.assign(sameDefaultProfile, {
          ...defaultAgent,
          ...sameDefaultProfile,
          workspace_id: workspaceId,
          group_id: groupId,
          id: defaultAgent.id,
          transport: sameDefaultProfile.transport || defaultAgent.transport,
          mode: sameDefaultProfile.mode || defaultAgent.mode,
          command: sameDefaultProfile.command || defaultAgent.command,
          updated_at: nowIso()
        });
        await this.replaceAgentReferences(oldId, defaultAgent.id);
      } else {
        next.push(defaultAgent);
      }
      changed = true;
    }

    if (changed) {
      await this.writeJson(agentsPath, next);
    }
  }

  async replaceAgentReferences(oldId, newId) {
    if (!oldId || oldId === newId) {
      return;
    }
    for (const task of await this.listTasksRaw()) {
      let changed = false;
      if (task.owner_agent_id === oldId) {
        task.owner_agent_id = newId;
        changed = true;
      }
      const participants = (task.participant_agent_ids || []).map((id) => (id === oldId ? newId : id));
      const dedupedParticipants = Array.from(new Set(participants.filter(Boolean)));
      if (JSON.stringify(dedupedParticipants) !== JSON.stringify(task.participant_agent_ids || [])) {
        task.participant_agent_ids = dedupedParticipants;
        changed = true;
      }
      if (changed) {
        task.updated_at = nowIso();
        await this.writeJson(this.taskPathForTask(task), task);
      }
    }
  }

  defaultAgents(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return [this.hostAgent(workspaceId, groupId)];
  }

  async readJson(filePath, fallback) {
    return this.withFileLock(filePath, async () => this.readJsonUnlocked(filePath, fallback));
  }

  async readJsonUnlocked(filePath, fallback) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
      } catch (error) {
        if (error.code === "ENOENT" && fallback !== undefined) {
          return fallback;
        }
        lastError = error;
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw lastError;
  }

  async writeJson(filePath, value) {
    return this.withFileLock(filePath, async () => this.writeJsonUnlocked(filePath, value));
  }

  async writeJsonUnlocked(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async withFileLock(filePath, operation) {
    const key = path.resolve(filePath);
    const previous = this.fileLocks.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tail = next.catch(() => undefined);
    this.fileLocks.set(key, tail);
    try {
      return await next;
    } finally {
      if (this.fileLocks.get(key) === tail) {
        this.fileLocks.delete(key);
      }
    }
  }

  async listWorkspaceIds() {
    const entries = await fs.readdir(this.workspacesDir, { withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  async listWorkspaces() {
    await this.init();
    const workspaces = [];
    for (const workspaceId of await this.listWorkspaceIds()) {
      const workspace = await this.readJson(this.workspacePath(workspaceId), null).catch(() => null);
      if (workspace) {
        workspaces.push(workspace);
      }
    }
    return workspaces.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  async getWorkspace(workspaceId) {
    await this.init();
    return this.readJson(this.workspacePath(workspaceId), null);
  }

  async createWorkspace(input) {
    await this.init();
    const timestamp = nowIso();
    const name = input.name?.trim() || "New Workspace";
    const workspace = {
      workspace_id: input.workspace_id || `workspace_${slugify(name, "workspace")}_${makeId("").slice(1, 7)}`,
      name,
      description: input.description?.trim() || "",
      root_dir: path.resolve(input.root_dir || input.cwd || this.rootDir),
      created_at: timestamp,
      updated_at: timestamp
    };
    await this.writeJson(this.workspacePath(workspace.workspace_id), workspace);
    await this.ensureWorkspaceSkills(workspace.workspace_id);
    await this.ensureDefaultGroup(workspace.workspace_id);
    await this.ensureGroupMemory(workspace.workspace_id, DEFAULT_GROUP_ID);
    await this.ensureGroupSkills(workspace.workspace_id, DEFAULT_GROUP_ID);
    await this.ensureHandoffPolicy(workspace.workspace_id, DEFAULT_GROUP_ID);
    await this.writeJson(this.agentsPath(workspace.workspace_id, DEFAULT_GROUP_ID), [
      this.hostAgent(workspace.workspace_id, DEFAULT_GROUP_ID)
    ]);
    return workspace;
  }

  async listGroups(workspaceId) {
    await this.init();
    return this.listGroupsRaw(workspaceId);
  }

  async listGroupsRaw(workspaceId) {
    const workspaceIds = workspaceId ? [workspaceId] : await this.listWorkspaceIds();
    const groups = [];
    for (const id of workspaceIds) {
      const entries = await fs.readdir(this.groupsDir(id), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const group = await this.readJson(this.groupPath(id, entry.name), null).catch(() => null);
        if (group) {
          groups.push({ ...group, workspace_id: group.workspace_id || id });
        }
      }
    }
    return groups.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  async getGroup(workspaceId, groupId) {
    await this.init();
    return this.readJson(this.groupPath(workspaceId, groupId), null);
  }

  async createGroup(input) {
    const workspaceId = input.workspace_id || DEFAULT_WORKSPACE_ID;
    const timestamp = nowIso();
    const name = input.name?.trim() || "New Group";
    const group = {
      workspace_id: workspaceId,
      group_id: input.group_id || `group_${slugify(name, "group")}_${makeId("").slice(1, 7)}`,
      name,
      description: input.description?.trim() || "",
      created_at: timestamp,
      updated_at: timestamp
    };
    await this.writeJson(this.groupPath(workspaceId, group.group_id), group);
    await fs.mkdir(this.tasksDir(workspaceId, group.group_id), { recursive: true });
    await this.ensureGroupMemory(workspaceId, group.group_id);
    await this.ensureGroupSkills(workspaceId, group.group_id);
    await this.ensureHandoffPolicy(workspaceId, group.group_id);
    await this.writeJson(this.agentsPath(workspaceId, group.group_id), [this.hostAgent(workspaceId, group.group_id)]);
    return group;
  }

  safeGroupDir(workspaceId, groupId) {
    const groupsRoot = path.resolve(this.groupsDir(workspaceId));
    const groupRoot = path.resolve(this.groupDir(workspaceId, groupId));
    const relative = path.relative(groupsRoot, groupRoot);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Invalid group id: ${groupId}`);
    }
    return groupRoot;
  }

  async deleteGroup(workspaceId, groupId) {
    const groupRoot = this.safeGroupDir(workspaceId, groupId);
    const group = await this.readJson(path.join(groupRoot, "group.json"), null).catch(() => null);
    if (!group) {
      return false;
    }
    await fs.rm(groupRoot, { recursive: true, force: true });
    return true;
  }

  async readGroupMemory(workspaceId, groupId) {
    await this.ensureGroupMemory(workspaceId, groupId);
    const memory = {};
    for (const fileName of Object.keys(MEMORY_FILES)) {
      memory[fileName] = await fs.readFile(this.groupMemoryPath(workspaceId, groupId, fileName), "utf8");
    }
    return memory;
  }

  async readSkillsFromDir(dir, metadata) {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const skills = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const filePath = path.join(dir, entry.name);
      const raw = await fs.readFile(filePath, "utf8");
      skills.push(
        parseSkillMarkdown(raw, {
          ...metadata,
          file_name: entry.name,
          relative_path: path.relative(this.rootDir, filePath).replaceAll("\\", "/")
        })
      );
    }
    return skills;
  }

  async listSkills(input = {}) {
    const workspaceId = input.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = input.group_id || DEFAULT_GROUP_ID;
    const scope = input.scope || "all";
    const skills = [];
    if (scope !== "group") {
      await this.ensureWorkspaceSkills(workspaceId);
      skills.push(
        ...(await this.readSkillsFromDir(this.workspaceSkillsDir(workspaceId), {
          scope: "workspace",
          workspace_id: workspaceId,
          group_id: null
        }))
      );
    }
    if (scope !== "workspace" && groupId) {
      await this.ensureGroupSkills(workspaceId, groupId);
      skills.push(
        ...(await this.readSkillsFromDir(this.groupSkillsDir(workspaceId, groupId), {
          scope: "group",
          workspace_id: workspaceId,
          group_id: groupId
        }))
      );
    }
    return skills.sort((a, b) => `${a.scope}:${a.skill_id}`.localeCompare(`${b.scope}:${b.skill_id}`));
  }

  async getSkill(input = {}) {
    const workspaceId = input.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = input.group_id || DEFAULT_GROUP_ID;
    const scope = input.scope === "workspace" ? "workspace" : "group";
    const skillId = normalizeSkillId(input.skill_id || input.id);
    const filePath =
      scope === "workspace"
        ? this.workspaceSkillPath(workspaceId, skillId)
        : this.groupSkillPath(workspaceId, groupId, skillId);
    const raw = await fs.readFile(filePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (raw === null) {
      return null;
    }
    return parseSkillMarkdown(raw, {
      scope,
      workspace_id: workspaceId,
      group_id: scope === "group" ? groupId : null,
      file_name: path.basename(filePath),
      relative_path: path.relative(this.rootDir, filePath).replaceAll("\\", "/")
    });
  }

  async upsertSkill(input = {}) {
    const workspaceId = input.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = input.group_id || DEFAULT_GROUP_ID;
    const scope = input.scope === "workspace" ? "workspace" : "group";
    const skillId = normalizeSkillId(input.skill_id || input.id || input.title);
    const existing = await this.getSkill({
      workspace_id: workspaceId,
      group_id: groupId,
      scope,
      skill_id: skillId
    });
    const next = {
      skill_id: skillId,
      scope,
      roles: normalizeSkillRoles(input.roles !== undefined ? input.roles : existing?.roles || "*"),
      title: input.title !== undefined ? input.title : existing?.title || skillId,
      summary: input.summary !== undefined ? input.summary : existing?.summary || "",
      body: input.body !== undefined ? input.body : input.content !== undefined ? input.content : existing?.body || "",
      updated_at: nowIso()
    };
    const filePath =
      scope === "workspace"
        ? this.workspaceSkillPath(workspaceId, skillId)
        : this.groupSkillPath(workspaceId, groupId, skillId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, skillMarkdown(next), "utf8");
    return this.getSkill({ workspace_id: workspaceId, group_id: groupId, scope, skill_id: skillId });
  }

  async matchedSkillSummaries(workspaceId, groupId, agent = {}) {
    const skills = await this.listSkills({ workspace_id: workspaceId, group_id: groupId });
    return skills
      .filter((skill) => skillMatchesAgent(skill, agent))
      .map((skill) => ({
        skill_id: skill.skill_id,
        scope: skill.scope,
        roles: skill.roles,
        title: skill.title,
        summary: skill.summary,
        path: skill.path
      }));
  }

  normalizeHandoffRule(rule) {
    return {
      rule_id: rule.rule_id || makeId("hrule"),
      from_agent_id: String(rule.from_agent_id || "").trim(),
      to_agent_id: String(rule.to_agent_id || "").trim(),
      trigger: String(rule.trigger || "manual").trim(),
      label: String(rule.label || "Custom handoff").trim(),
      description: String(rule.description || "").trim(),
      enabled: rule.enabled !== false,
      created_at: rule.created_at || nowIso(),
      updated_at: nowIso()
    };
  }

  async readHandoffPolicy(workspaceId, groupId) {
    await this.ensureHandoffPolicy(workspaceId, groupId);
    const defaults = this.defaultHandoffPolicy(workspaceId, groupId);
    const policy = await this.readJson(this.handoffPolicyPath(workspaceId, groupId), defaults);
    return {
      ...defaults,
      ...policy,
      default_policy: {
        ...defaults.default_policy,
        ...(policy.default_policy || {})
      },
      rules: policy.rules || []
    };
  }

  async updateHandoffPolicy(workspaceId, groupId, input = {}) {
    const existing = await this.readHandoffPolicy(workspaceId, groupId);
    const rules = Array.isArray(input.rules)
      ? input.rules
          .map((rule) => this.normalizeHandoffRule(rule))
          .filter((rule) => rule.from_agent_id && rule.to_agent_id && rule.from_agent_id !== rule.to_agent_id)
      : existing.rules || [];
    const next = {
      ...existing,
      workspace_id: workspaceId,
      group_id: groupId,
      managed_by_role: "host",
      skill_id: existing.skill_id || "host.handoff_policy",
      managed_by_tool: existing.managed_by_tool || "host.update_handoff_rules",
      default_policy: {
        ...existing.default_policy,
        ...(input.default_policy || {})
      },
      rules,
      updated_at: nowIso()
    };
    await this.writeJson(this.handoffPolicyPath(workspaceId, groupId), next);
    return next;
  }

  async removeHandoffRulesForAgent(workspaceId, groupId, agentId) {
    const policy = await this.readHandoffPolicy(workspaceId, groupId);
    const nextRules = (policy.rules || []).filter(
      (rule) => rule.from_agent_id !== agentId && rule.to_agent_id !== agentId
    );
    if (nextRules.length !== (policy.rules || []).length) {
      await this.updateHandoffPolicy(workspaceId, groupId, { rules: nextRules });
    }
  }

  async listAgentLocations() {
    await this.init();
    return this.listAgentLocationsRaw();
  }

  async listAgentLocationsRaw() {
    const locations = [];
    for (const group of await this.listGroupsRaw()) {
      const agents = await this.readJson(this.agentsPath(group.workspace_id, group.group_id), []).catch(() => []);
      locations.push({
        workspace_id: group.workspace_id,
        group_id: group.group_id,
        agents
      });
    }
    return locations;
  }

  async listAgents() {
    await this.init();
    return (await this.listAgentLocationsRaw()).flatMap((location) =>
      location.agents.map((agent) => ({
        ...agent,
        workspace_id: agent.workspace_id || location.workspace_id,
        group_id: agent.group_id || location.group_id
      }))
    );
  }

  async saveAgents(agents, workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    await this.writeJson(this.agentsPath(workspaceId, groupId), agents);
  }

  async findAgentLocation(agentId) {
    for (const location of await this.listAgentLocations()) {
      const agent = location.agents.find((candidate) => candidate.id === agentId);
      if (agent) {
        return {
          ...location,
          agent: {
            ...agent,
            workspace_id: agent.workspace_id || location.workspace_id,
            group_id: agent.group_id || location.group_id
          }
        };
      }
    }
    return null;
  }

  async getAgent(agentId) {
    const location = await this.findAgentLocation(agentId);
    return location?.agent || null;
  }

  async upsertAgent(input) {
    const existingLocation = input.id ? await this.findAgentLocation(input.id) : null;
    const existing = existingLocation?.agent || null;
    const timestamp = nowIso();
    const workspaceId = input.workspace_id || existing?.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = input.group_id || existing?.group_id || DEFAULT_GROUP_ID;
    const agent = {
      id: existing?.id || input.id || `agent_${slugify(input.name, "agent")}_${makeId("").slice(1, 7)}`,
      name: input.name?.trim() || "agent",
      role: normalizeRole(input.role),
      workspace_id: workspaceId,
      group_id: groupId,
      mode: normalizeMode(input.mode || (input.transport === "acp" ? "acp" : "mock")),
      provider: input.provider?.trim() || input.transport || "local",
      cwd: path.resolve(input.cwd || this.rootDir),
      base_cwd: path.resolve(input.base_cwd || existing?.base_cwd || input.cwd || this.rootDir),
      isolation_mode: normalizeIsolationMode(input.isolation_mode || existing?.isolation_mode),
      worktree: input.worktree !== undefined ? input.worktree : existing?.worktree || null,
      codex_session_id: input.codex_session_id || existing?.codex_session_id || null,
      codex_session_path: input.codex_session_path || existing?.codex_session_path || null,
      provider_session_id: input.provider_session_id || existing?.provider_session_id || null,
      provider_session_name: input.provider_session_name || existing?.provider_session_name || null,
      claude_session_id: input.claude_session_id || existing?.claude_session_id || null,
      claude_session_name: input.claude_session_name || existing?.claude_session_name || null,
      init_profile: input.init_profile || existing?.init_profile || null,
      init_profile_version: input.init_profile_version || existing?.init_profile_version || null,
      init_prompt: input.init_prompt || existing?.init_prompt || "",
      init_status: input.init_status || existing?.init_status || null,
      init_delivery: input.init_delivery || existing?.init_delivery || null,
      initialized_at: input.initialized_at || existing?.initialized_at || null,
      init_error: input.init_error || existing?.init_error || null,
      command: input.command?.trim() || "",
      env: normalizeEnv(input.env),
      status: existing?.status || "stopped",
      current_task_id: existing?.current_task_id || null,
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp
    };

    agent.transport = transportFromMode(agent.mode);

    if (existingLocation) {
      const oldPath = this.agentsPath(existingLocation.workspace_id, existingLocation.group_id);
      const oldAgents = existingLocation.agents.filter((candidate) => candidate.id !== agent.id);
      await this.writeJson(oldPath, oldAgents);
    }

    const nextAgents = await this.readJson(this.agentsPath(workspaceId, groupId), []);
    await this.writeJson(this.agentsPath(workspaceId, groupId), [
      ...nextAgents.filter((candidate) => candidate.id !== agent.id),
      agent
    ]);
    return agent;
  }

  async patchAgent(agentId, patch) {
    const location = await this.findAgentLocation(agentId);
    if (!location) {
      return null;
    }
    const next = {
      ...location.agent,
      ...patch,
      updated_at: nowIso()
    };
    const nextAgents = location.agents.map((agent) => (agent.id === agentId ? next : agent));
    await this.writeJson(this.agentsPath(location.workspace_id, location.group_id), nextAgents);
    return next;
  }

  async deleteAgent(agentId) {
    const location = await this.findAgentLocation(agentId);
    if (!location) {
      return null;
    }
    const next = location.agents.filter((agent) => agent.id !== agentId);
    await this.writeJson(this.agentsPath(location.workspace_id, location.group_id), next);
    await fs.rm(this.agentLogPath(location.workspace_id, location.group_id, agentId), { force: true }).catch(() => undefined);
    await this.removeHandoffRulesForAgent(location.workspace_id, location.group_id, agentId);
    return true;
  }

  async appendAgentLog(agentOrId, event) {
    const knownAgent = typeof agentOrId === "string" ? await this.getAgent(agentOrId) : agentOrId;
    const agentId = knownAgent?.id || event.agent_id || String(agentOrId);
    const workspaceId = event.workspace_id || knownAgent?.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = event.group_id || knownAgent?.group_id || DEFAULT_GROUP_ID;
    const fullEvent = {
      event_id: event.event_id || makeId("alog"),
      agent_id: agentId,
      workspace_id: workspaceId,
      group_id: groupId,
      timestamp: event.timestamp || nowIso(),
      type: event.type || "status_change",
      ...redactForStorage(event)
    };
    const logPath = this.agentLogPath(workspaceId, groupId, agentId);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(fullEvent)}\n`, "utf8");
    return fullEvent;
  }

  async readAgentLogs(agentId, options = {}) {
    const location = await this.findAgentLocation(agentId);
    if (!location) {
      return [];
    }
    const raw = await fs
      .readFile(this.agentLogPath(location.workspace_id, location.group_id, agentId), "utf8")
      .catch((error) => {
        if (error.code === "ENOENT") {
          return "";
        }
        throw error;
      });
    const logs = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const limit = Number(options.limit || 0);
    return limit > 0 ? logs.slice(-limit) : logs;
  }

  async appendGroupEvent(workspaceId, groupId, event) {
    const group = await this.getGroup(workspaceId, groupId);
    if (!group) {
      throw new Error(`Group not found: ${workspaceId}/${groupId}`);
    }
    const fullEvent = {
      event_id: event.event_id || makeId("gevt"),
      workspace_id: workspaceId,
      group_id: groupId,
      timestamp: event.timestamp || nowIso(),
      type: event.type || "system_event",
      ...redactForStorage(event)
    };
    const eventsPath = this.groupEventsPath(workspaceId, groupId);
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    await fs.appendFile(eventsPath, `${JSON.stringify(fullEvent)}\n`, "utf8");
    return fullEvent;
  }

  async readGroupEvents(workspaceId, groupId, options = {}) {
    const group = await this.getGroup(workspaceId, groupId);
    if (!group) {
      return [];
    }
    const raw = await fs.readFile(this.groupEventsPath(workspaceId, groupId), "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    const events = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const limit = Number(options.limit || 0);
    return limit > 0 ? events.slice(-limit) : events;
  }

  async listTasks() {
    await this.init();
    return this.listTasksRaw();
  }

  async listTasksRaw() {
    const tasks = [];
    for (const group of await this.listGroupsRaw()) {
      const entries = await fs.readdir(this.tasksDir(group.workspace_id, group.group_id), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const task = await this.readJson(this.taskPathFor(group.workspace_id, group.group_id, entry.name), null).catch(() => null);
        if (task) {
          tasks.push({
            ...task,
            workspace_id: task.workspace_id || group.workspace_id,
            group_id: task.group_id || group.group_id
          });
        }
      }
    }
    return tasks.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  async getTask(taskId) {
    return (await this.listTasks()).find((task) => task.task_id === taskId) || null;
  }

  async deleteTask(taskId) {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }
    await fs.rm(this.taskDirFor(task.workspace_id, task.group_id, taskId), { recursive: true, force: true });
    return task;
  }

  async createTask(input) {
    await this.init();
    const timestamp = nowIso();
    const workspaceId = input.workspace_id || DEFAULT_WORKSPACE_ID;
    const groupId = input.group_id || DEFAULT_GROUP_ID;
    const taskId = makeId("task");
    const participantIds = Array.from(
      new Set([input.owner_agent_id, ...(input.participant_agent_ids || [])].filter(Boolean))
    );
    const task = {
      task_id: taskId,
      workspace_id: workspaceId,
      group_id: groupId,
      title: input.title?.trim() || "Untitled task",
      description: input.description?.trim() || "",
      status: normalizeStatus(input.status || (input.owner_agent_id ? "in_progress" : "todo")),
      owner_agent_id: input.owner_agent_id || null,
      participant_agent_ids: participantIds,
      parent_task_id: input.parent_task_id || null,
      child_task_ids: normalizeIdList(input.child_task_ids),
      depends_on: normalizeIdList(input.depends_on),
      blocked_by: normalizeIdList(input.blocked_by),
      claim: input.claim || null,
      playbook_stage: input.playbook_stage || "intake",
      related_refs: Array.isArray(input.related_refs) ? input.related_refs : [],
      created_at: timestamp,
      updated_at: timestamp,
      room_path: path
        .join(".tendrilflow", "workspaces", workspaceId, "groups", groupId, "tasks", taskId, "events.jsonl")
        .replaceAll("\\", "/"),
      handoff_records: [],
      final_report_path: null
    };
    await fs.mkdir(path.join(this.taskDirFor(workspaceId, groupId, taskId), "handoffs"), { recursive: true });
    await fs.mkdir(path.join(this.taskDirFor(workspaceId, groupId, taskId), "reports"), { recursive: true });
    await this.writeJson(this.taskPathForTask(task), task);
    await fs.writeFile(this.eventsPathForTask(task), "", { flag: "a", encoding: "utf8" });
    return task;
  }

  async patchTask(taskId, patch) {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }
    const next = {
      ...task,
      ...patch,
      updated_at: nowIso()
    };
    await this.writeJson(this.taskPathForTask(next), next);
    return next;
  }

  async appendEvent(taskId, event) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const fullEvent = {
      event_id: event.event_id || makeId("evt"),
      task_id: taskId,
      timestamp: event.timestamp || nowIso(),
      ...redactForStorage(event)
    };
    await fs.appendFile(this.eventsPathForTask(task), `${JSON.stringify(fullEvent)}\n`, "utf8");
    await this.patchTask(taskId, { updated_at: nowIso() });
    return fullEvent;
  }

  async readEvents(taskId) {
    const task = await this.getTask(taskId);
    if (!task) {
      return [];
    }
    const raw = await fs.readFile(this.eventsPathForTask(task), "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async writeHandoff(taskId, handoff) {
    const task = await this.getTask(taskId);
    const handoffId = handoff.handoff_id || makeId("handoff");
    const handoffPath = path.join(this.taskDirFor(task.workspace_id, task.group_id, taskId), "handoffs", `${handoffId}.json`);
    const fullHandoff = redactForStorage({ ...handoff, handoff_id: handoffId, path: handoffPath });
    await this.writeJson(handoffPath, fullHandoff);
    await this.patchTask(taskId, {
      handoff_records: [...(task.handoff_records || []), path.relative(this.rootDir, handoffPath).replaceAll("\\", "/")]
    });
    return fullHandoff;
  }

  async writeReport(taskId, report) {
    const task = await this.getTask(taskId);
    const reportId = report.report_id || makeId("report");
    const reportPath = path.join(this.taskDirFor(task.workspace_id, task.group_id, taskId), "reports", `${reportId}.json`);
    const fullReport = redactForStorage({ ...report, report_id: reportId, path: reportPath });
    await this.writeJson(reportPath, fullReport);
    await this.patchTask(taskId, {
      final_report_path: path.relative(this.rootDir, reportPath).replaceAll("\\", "/")
    });
    return fullReport;
  }
}

module.exports = { FileStore, MEMORY_FILES };
