const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { Orchestrator } = require("./orchestrator");
const {
  AGENT_ISOLATION_MODES,
  AGENT_MODES,
  AGENT_ROLES,
  DEFAULT_GROUP_ID,
  DEFAULT_WORKSPACE_ID,
  TASK_STATUSES
} = require("./model");

const ROOT_DIR = process.env.TENDRILFLOW_ROOT || path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function staticContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream"
  );
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": staticContentType(filePath) });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

function createHttpServer(orchestrator) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;
    try {
      if (pathname === "/api/meta" && req.method === "GET") {
        sendJson(res, 200, {
          roles: AGENT_ROLES,
          modes: AGENT_MODES,
          isolationModes: AGENT_ISOLATION_MODES,
          statuses: TASK_STATUSES,
          defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
          defaultGroupId: DEFAULT_GROUP_ID,
          root: ROOT_DIR
        });
        return;
      }

      if (pathname === "/api/state" && req.method === "GET") {
        sendJson(res, 200, await orchestrator.state());
        return;
      }

      if (pathname === "/api/agents" && req.method === "GET") {
        sendJson(res, 200, { agents: (await orchestrator.state()).agents });
        return;
      }

      if (pathname === "/api/workspaces" && req.method === "GET") {
        sendJson(res, 200, { workspaces: (await orchestrator.state()).workspaces });
        return;
      }

      if (pathname === "/api/workspaces" && req.method === "POST") {
        sendJson(res, 201, { workspace: await orchestrator.createWorkspace(await readJson(req)) });
        return;
      }

      if (pathname === "/api/groups" && req.method === "GET") {
        sendJson(res, 200, { groups: (await orchestrator.state()).groups });
        return;
      }

      if (pathname === "/api/groups" && req.method === "POST") {
        sendJson(res, 201, { group: await orchestrator.createGroup(await readJson(req)) });
        return;
      }

      const groupRoute = pathname.match(/^\/api\/groups\/([^/]+)\/([^/]+)$/);
      if (groupRoute && req.method === "DELETE") {
        const [, workspaceId, groupId] = groupRoute.map(decodeURIComponent);
        sendJson(res, 200, { deleted: await orchestrator.deleteGroup(workspaceId, groupId) });
        return;
      }

      const handoffPolicyRoute = pathname.match(/^\/api\/groups\/([^/]+)\/([^/]+)\/handoff-rules$/);
      if (handoffPolicyRoute && req.method === "GET") {
        const [, workspaceId, groupId] = handoffPolicyRoute.map(decodeURIComponent);
        sendJson(res, 200, { policy: await orchestrator.handoffPolicy(workspaceId, groupId) });
        return;
      }
      if (handoffPolicyRoute && req.method === "PUT") {
        const [, workspaceId, groupId] = handoffPolicyRoute.map(decodeURIComponent);
        sendJson(res, 200, { policy: await orchestrator.updateHandoffPolicy(workspaceId, groupId, await readJson(req)) });
        return;
      }

      const groupRoomRoute = pathname.match(/^\/api\/groups\/([^/]+)\/([^/]+)\/room$/);
      if (groupRoomRoute && req.method === "GET") {
        const [, workspaceId, groupId] = groupRoomRoute.map(decodeURIComponent);
        sendJson(res, 200, await orchestrator.groupRoom(workspaceId, groupId, { limit: Number(url.searchParams.get("limit") || 0) }));
        return;
      }

      const groupMessageRoute = pathname.match(/^\/api\/groups\/([^/]+)\/([^/]+)\/messages$/);
      if (groupMessageRoute && req.method === "POST") {
        const [, workspaceId, groupId] = groupMessageRoute.map(decodeURIComponent);
        const body = await readJson(req);
        sendJson(res, 201, await orchestrator.postGroupMessage(workspaceId, groupId, body.text || ""));
        return;
      }

      if (pathname === "/api/skills" && req.method === "GET") {
        sendJson(res, 200, {
          skills: await orchestrator.listSkills({
            workspace_id: url.searchParams.get("workspace_id") || undefined,
            group_id: url.searchParams.get("group_id") || undefined,
            scope: url.searchParams.get("scope") || undefined
          })
        });
        return;
      }

      const skillRoute = pathname.match(/^\/api\/skills\/(workspace|group)\/([^/]+)$/);
      if (skillRoute && req.method === "GET") {
        const [, scope, skillId] = skillRoute.map(decodeURIComponent);
        sendJson(res, 200, {
          skill: await orchestrator.getSkill({
            workspace_id: url.searchParams.get("workspace_id") || undefined,
            group_id: url.searchParams.get("group_id") || undefined,
            scope,
            skill_id: skillId
          })
        });
        return;
      }
      if (skillRoute && req.method === "PUT") {
        const [, scope, skillId] = skillRoute.map(decodeURIComponent);
        sendJson(res, 200, {
          skill: await orchestrator.upsertSkill({
            ...(await readJson(req)),
            workspace_id: url.searchParams.get("workspace_id") || undefined,
            group_id: url.searchParams.get("group_id") || undefined,
            scope,
            skill_id: skillId
          })
        });
        return;
      }

      if (pathname === "/api/agents" && req.method === "POST") {
        sendJson(res, 201, { agent: await orchestrator.createAgent(await readJson(req)) });
        return;
      }

      const agentAction = pathname.match(/^\/api\/agents\/([^/]+)\/(start|stop)$/);
      if (agentAction && req.method === "POST") {
        const [, agentId, action] = agentAction;
        const agent = action === "start" ? await orchestrator.startAgent(agentId) : await orchestrator.stopAgent(agentId);
        sendJson(res, 200, { agent });
        return;
      }

      const agentInitRoute = pathname.match(/^\/api\/agents\/([^/]+)\/init-session$/);
      if (agentInitRoute && req.method === "POST") {
        sendJson(res, 200, await orchestrator.initializeAgentSession(agentInitRoute[1], await readJson(req)));
        return;
      }

      const agentWorktreeRoute = pathname.match(/^\/api\/agents\/([^/]+)\/worktree$/);
      if (agentWorktreeRoute && req.method === "GET") {
        sendJson(res, 200, await orchestrator.agentWorktreeStatus(agentWorktreeRoute[1]));
        return;
      }
      if (agentWorktreeRoute && req.method === "POST") {
        sendJson(res, 200, { agent: await orchestrator.prepareAgentWorktree(agentWorktreeRoute[1]) });
        return;
      }

      const agentLogsRoute = pathname.match(/^\/api\/agents\/([^/]+)\/logs$/);
      if (agentLogsRoute && req.method === "GET") {
        sendJson(res, 200, { logs: await orchestrator.agentLogs(agentLogsRoute[1], Number(url.searchParams.get("limit") || 200)) });
        return;
      }

      const agentCliRoute = pathname.match(/^\/api\/agents\/([^/]+)\/cli$/);
      if (agentCliRoute && req.method === "POST") {
        sendJson(res, 200, await orchestrator.openAgentCli(agentCliRoute[1], await readJson(req)));
        return;
      }

      const agentRoute = pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentRoute && req.method === "GET") {
        sendJson(res, 200, await orchestrator.agentDetail(agentRoute[1], Number(url.searchParams.get("limit") || 200)));
        return;
      }
      if (agentRoute && req.method === "DELETE") {
        sendJson(res, 200, { deleted: await orchestrator.deleteAgent(agentRoute[1]) });
        return;
      }

      if (pathname === "/api/tasks" && req.method === "GET") {
        sendJson(res, 200, { tasks: (await orchestrator.state()).tasks });
        return;
      }

      if (pathname === "/api/tasks" && req.method === "POST") {
        sendJson(res, 201, { task: await orchestrator.createTask(await readJson(req)) });
        return;
      }

      const taskRoute = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskRoute && req.method === "GET") {
        sendJson(res, 200, await orchestrator.taskWithEvents(taskRoute[1]));
        return;
      }
      if (taskRoute && req.method === "PATCH") {
        sendJson(res, 200, { task: await orchestrator.updateTask(taskRoute[1], await readJson(req)) });
        return;
      }
      if (taskRoute && req.method === "DELETE") {
        sendJson(res, 200, { deleted: await orchestrator.deleteTask(taskRoute[1]) });
        return;
      }

      const eventsRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/events$/);
      if (eventsRoute && req.method === "GET") {
        sendJson(res, 200, { events: (await orchestrator.taskWithEvents(eventsRoute[1])).events });
        return;
      }

      const replayRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/replay$/);
      if (replayRoute && req.method === "GET") {
        sendJson(res, 200, await orchestrator.taskReplay(replayRoute[1]));
        return;
      }

      const messageRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/messages$/);
      if (messageRoute && req.method === "POST") {
        const body = await readJson(req);
        sendJson(res, 201, await orchestrator.postRoomMessage(messageRoute[1], body.text || ""));
        return;
      }

      const handoffRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/handoffs$/);
      if (handoffRoute && req.method === "POST") {
        sendJson(res, 201, { handoff: await orchestrator.createHandoff(handoffRoute[1], await readJson(req)) });
        return;
      }

      const finalRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/final-report$/);
      if (finalRoute && req.method === "POST") {
        sendJson(res, 201, { report: await orchestrator.finalizeTask(finalRoute[1], await readJson(req)) });
        return;
      }

      const taskGraphApplyRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/task-graph\/apply$/);
      if (taskGraphApplyRoute && req.method === "POST") {
        sendJson(res, 201, await orchestrator.applyTaskGraph(taskGraphApplyRoute[1], await readJson(req)));
        return;
      }

      const acpRoute = pathname.match(/^\/api\/tasks\/([^/]+)\/acp-updates$/);
      if (acpRoute && req.method === "POST") {
        const body = await readJson(req);
        sendJson(res, 201, { event: await orchestrator.ingestAcpUpdate(acpRoute[1], body.agent_id, body.update) });
        return;
      }

      if (pathname.startsWith("/api/")) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      await serveStatic(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
}

async function listenOnAvailablePort(startPort) {
  await fs.mkdir(path.join(ROOT_DIR, ".tendrilflow"), { recursive: true });
  const orchestrator = new Orchestrator(ROOT_DIR);
  await orchestrator.init();

  let port = startPort;
  while (port < startPort + 20) {
    const server = createHttpServer(orchestrator);
    const started = await new Promise((resolve, reject) => {
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          resolve(false);
        } else {
          reject(error);
        }
      });
      server.listen(port, "127.0.0.1", () => resolve(server));
    });
    if (started) {
      const url = `http://127.0.0.1:${port}`;
      await fs.writeFile(
        path.join(ROOT_DIR, ".tendrilflow", "server.json"),
        `${JSON.stringify({ url, port, started_at: new Date().toISOString() }, null, 2)}\n`,
        "utf8"
      );
      return { server: started, port, url };
    }
    port += 1;
  }
  throw new Error(`No available port found from ${startPort} to ${port - 1}.`);
}

if (require.main === module) {
  const startPort = Number(process.env.PORT || 4317);
  listenOnAvailablePort(startPort)
    .then(({ url }) => {
      console.log(`TendrilFlow running at ${url}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  createHttpServer,
  listenOnAvailablePort
};
