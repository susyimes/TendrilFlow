const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createAdapterSession } = require("./adapters");
const { mapAcpUpdateToEvent } = require("./acpMapping");
const { FileStore } = require("./storage");
const { makeId, normalizeStatus, nowIso, slugify } = require("./model");
const { HOST_DEFAULT_PLAYBOOK, buildCommunicationExecutionProtocol } = require("./protocol");

const TASK_CLAIM_LEASE_MS = 15 * 60 * 1000;
const AGENT_STALE_AFTER_MS = 5 * 60 * 1000;
const execFileAsync = promisify(execFile);

function quoteShell(value) {
  return `"${String(value || "").replaceAll('"', '\\"')}"`;
}

function eventText(event) {
  const content = event?.content;
  if (!content) {
    return event?.type || "";
  }
  if (typeof content === "string") {
    return content;
  }
  return (
    content.text ||
    content.summary ||
    content.title ||
    content.selected_approach ||
    content.verdict ||
    content.outcome ||
    content.reason ||
    event?.type ||
    ""
  );
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function compactList(values, limit = 12) {
  return Array.from(new Set((values || []).filter(Boolean).map(String))).slice(0, limit);
}

class Orchestrator {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.store = new FileStore(this.rootDir);
    this.sessions = new Map();
    this.stoppingAgents = new Set();
    this.detachedSessionsReconciled = false;
  }

  async init() {
    await this.store.init();
    if (!this.detachedSessionsReconciled) {
      await this.reconcileDetachedAgentSessions();
      this.detachedSessionsReconciled = true;
    }
  }

  async reconcileDetachedAgentSessions() {
    const agents = await this.store.listAgents();
    for (const agent of agents) {
      if (agent.status !== "running" || this.sessions.has(agent.id)) {
        continue;
      }
      await this.store.patchAgent(agent.id, {
        status: "stopped",
        current_task_id: null,
        last_error: "Detached from prior TendrilFlow server session; start the agent again."
      });
      await this.store.appendAgentLog(agent, {
        type: "status_change",
        content: {
          text: "Marked stopped because this server has no attached CLI session for the persisted running state."
        }
      });
    }
  }

  async state() {
    await this.init();
    const agents = await this.store.listAgents();
    return {
      workspaces: await this.store.listWorkspaces(),
      groups: await this.store.listGroups(),
      agents: await this.agentsWithHealth(agents),
      tasks: await this.store.listTasks()
    };
  }

  async agentsWithHealth(agents) {
    return Promise.all(
      agents.map(async (agent) => ({
        ...agent,
        health: await this.agentHealth(agent)
      }))
    );
  }

  async agentHealth(agent) {
    const logs = await this.store.readAgentLogs(agent.id, { limit: 50 }).catch(() => []);
    const lastLog = logs.at(-1) || null;
    const relevantLog =
      (agent.current_task_id ? [...logs].reverse().find((event) => event.task_id === agent.current_task_id) : null) ||
      lastLog;
    const hasSession = this.sessions.has(agent.id);
    const lastSeenAt = relevantLog?.timestamp || lastLog?.timestamp || agent.updated_at || agent.created_at || null;
    const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
    const ageMs = Number.isFinite(lastSeenMs) ? Date.now() - lastSeenMs : null;

    let status = "stopped";
    if (agent.status === "failed") {
      status = "failed";
    } else if (agent.status === "running" && !hasSession) {
      status = "detached";
    } else if (agent.status === "running" && agent.current_task_id && ageMs !== null && ageMs > AGENT_STALE_AFTER_MS) {
      status = "stale";
    } else if (agent.status === "running" && agent.current_task_id) {
      status = "active";
    } else if (agent.status === "running") {
      status = "idle";
    }

    return {
      status,
      has_session: hasSession,
      current_task_id: agent.current_task_id || null,
      last_seen_at: lastSeenAt,
      age_ms: ageMs,
      stale_after_ms: AGENT_STALE_AFTER_MS
    };
  }

  async createWorkspace(input) {
    await this.init();
    return this.store.createWorkspace(input);
  }

  async createGroup(input) {
    await this.init();
    return this.store.createGroup(input);
  }

  async handoffPolicy(workspaceId, groupId) {
    await this.init();
    const group = await this.store.getGroup(workspaceId, groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }
    return this.store.readHandoffPolicy(workspaceId, groupId);
  }

  async updateHandoffPolicy(workspaceId, groupId, input) {
    await this.init();
    const group = await this.store.getGroup(workspaceId, groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }
    const agents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === workspaceId && agent.group_id === groupId
    );
    const agentIds = new Set(agents.map((agent) => agent.id));
    const nextInput = { ...input };
    if (Array.isArray(input.rules)) {
      nextInput.rules = input.rules.filter((rule) => agentIds.has(rule.from_agent_id) && agentIds.has(rule.to_agent_id));
    }
    return this.store.updateHandoffPolicy(workspaceId, groupId, nextInput);
  }

  async listSkills(input = {}) {
    await this.init();
    const workspaceId = input.workspace_id || "workspace_main";
    const groupId = input.group_id || "group_main";
    const workspace = await this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    if (input.scope !== "workspace") {
      const group = await this.store.getGroup(workspaceId, groupId);
      if (!group) {
        throw new Error(`Group not found: ${groupId}`);
      }
    }
    return this.store.listSkills({
      workspace_id: workspaceId,
      group_id: groupId,
      scope: input.scope
    });
  }

  async getSkill(input = {}) {
    const scope = input.scope === "workspace" ? "workspace" : "group";
    const skills = await this.listSkills({
      workspace_id: input.workspace_id,
      group_id: input.group_id,
      scope
    });
    const skill = skills.find((candidate) => candidate.skill_id === input.skill_id && candidate.scope === scope);
    if (!skill) {
      throw new Error(`Skill not found: ${input.skill_id}`);
    }
    return this.store.getSkill({ ...input, scope });
  }

  async upsertSkill(input = {}) {
    await this.init();
    const workspaceId = input.workspace_id || "workspace_main";
    const groupId = input.group_id || "group_main";
    const workspace = await this.store.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    if (input.scope !== "workspace") {
      const group = await this.store.getGroup(workspaceId, groupId);
      if (!group) {
        throw new Error(`Group not found: ${groupId}`);
      }
    }
    return this.store.upsertSkill({
      ...input,
      workspace_id: workspaceId,
      group_id: groupId
    });
  }

  async createAgent(input) {
    await this.init();
    return this.store.upsertAgent(input);
  }

  async deleteAgent(agentId) {
    const agent = await this.requireAgent(agentId);
    await this.stopAgent(agentId);
    await this.removeAgentWorktreeIfClean(agent);
    const deleted = await this.store.deleteAgent(agentId);
    if (!deleted) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const tasks = await this.store.listTasks();
    for (const task of tasks) {
      if (task.owner_agent_id === agentId || (task.participant_agent_ids || []).includes(agentId)) {
        const nextParticipants = (task.participant_agent_ids || []).filter((id) => id !== agentId);
        await this.updateTask(task.task_id, {
          owner_agent_id: task.owner_agent_id === agentId ? null : task.owner_agent_id,
          participant_agent_ids: nextParticipants
        });
        await this.store.appendEvent(task.task_id, {
          type: "system_event",
          actor: { kind: "system", id: "orchestrator" },
          content: {
            text: `Agent ${agentId} was deleted from this task room.`
          }
        });
      }
    }
    return true;
  }

  async agentDetail(agentId, limit = 200) {
    let agent = await this.requireAgent(agentId);
    if (agent.isolation_mode === "worktree") {
      agent = await this.refreshAgentWorktreeStatus(agent).catch(() => agent);
    }
    const tasks = await this.store.listTasks();
    const currentTask = agent.current_task_id
      ? tasks.find((task) => task.task_id === agent.current_task_id) || null
      : null;
    return {
      agent: {
        ...agent,
        health: await this.agentHealth(agent)
      },
      session: {
        running: this.sessions.has(agentId),
        status: agent.status,
        health: await this.agentHealth(agent),
        current_task_id: agent.current_task_id || null,
        last_launch_detail: agent.last_launch_detail || null,
        last_exit_code: agent.last_exit_code ?? null,
        last_error: agent.last_error || null
      },
      current_task: currentTask,
      logs: await this.store.readAgentLogs(agentId, { limit })
    };
  }

  async agentLogs(agentId, limit = 200) {
    await this.requireAgent(agentId);
    return this.store.readAgentLogs(agentId, { limit });
  }

  async prepareAgentWorktree(agentId) {
    const agent = await this.requireAgent(agentId);
    if (agent.isolation_mode !== "worktree") {
      throw new Error(`Agent ${agentId} is not configured for worktree isolation.`);
    }
    return this.ensureAgentWorktree(agent);
  }

  async agentWorktreeStatus(agentId) {
    const agent = await this.requireAgent(agentId);
    if (agent.isolation_mode !== "worktree") {
      return {
        isolation_mode: "shared",
        worktree: null
      };
    }
    const next = await this.refreshAgentWorktreeStatus(agent);
    return {
      isolation_mode: next.isolation_mode,
      cwd: next.cwd,
      base_cwd: next.base_cwd,
      worktree: next.worktree
    };
  }

  async runGit(args, options = {}) {
    try {
      const result = await execFileAsync("git", args, {
        cwd: options.cwd || this.rootDir,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      return {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      };
    } catch (error) {
      const stderr = String(error.stderr || error.stdout || error.message || "").trim();
      throw new Error(stderr || `git ${args.join(" ")} failed`);
    }
  }

  async gitRootFor(cwd) {
    const result = await this.runGit(["-C", path.resolve(cwd), "rev-parse", "--show-toplevel"]);
    return path.resolve(result.stdout);
  }

  async hasGitHead(repoRoot) {
    await this.runGit(["-C", repoRoot, "rev-parse", "--verify", "HEAD"]);
  }

  agentWorktreePath(agent) {
    const existingPath = agent.worktree?.path;
    if (existingPath) {
      return path.resolve(existingPath);
    }
    return path.join(this.store.workspaceDir(agent.workspace_id), "worktrees", slugify(agent.id, "agent"));
  }

  agentWorktreeBranch(agent) {
    return agent.worktree?.branch || `tendrilflow/${slugify(agent.id, "agent")}`;
  }

  async ensureAgentWorktree(agent) {
    if (agent.isolation_mode !== "worktree") {
      return agent;
    }

    const workspace = await this.store.getWorkspace(agent.workspace_id);
    const baseCwd = path.resolve(agent.base_cwd || workspace?.root_dir || agent.cwd || this.rootDir);
    const repoRoot = await this.gitRootFor(baseCwd).catch(async (error) => {
      await this.store.patchAgent(agent.id, {
        status: "failed",
        last_error: `Worktree isolation requires a git repository: ${error.message}`,
        worktree: {
          ...(agent.worktree || {}),
          enabled: true,
          status: "unavailable",
          dirty: false,
          last_error: error.message,
          last_checked_at: nowIso()
        }
      });
      throw new Error(`Worktree isolation requires a git repository: ${error.message}`);
    });
    await this.hasGitHead(repoRoot).catch(async (error) => {
      await this.store.patchAgent(agent.id, {
        status: "failed",
        last_error: `Worktree isolation requires a committed HEAD: ${error.message}`,
        base_cwd: repoRoot
      });
      throw new Error(`Worktree isolation requires a committed HEAD: ${error.message}`);
    });

    const worktreePath = this.agentWorktreePath({ ...agent, base_cwd: repoRoot });
    const branch = this.agentWorktreeBranch(agent);
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    if (!(await this.isGitWorktree(worktreePath))) {
      await this.assertWorktreePathIsAvailable(worktreePath);
      try {
        await this.runGit(["-C", repoRoot, "worktree", "add", "-b", branch, worktreePath, "HEAD"]);
      } catch (error) {
        if (!/already exists/i.test(error.message)) {
          throw error;
        }
        await this.runGit(["-C", repoRoot, "worktree", "add", worktreePath, branch]);
      }
    }

    const inspected = await this.inspectWorktree(worktreePath, repoRoot, branch);
    const env = {
      ...(agent.env || {}),
      TENDRILFLOW_AGENT_CWD: worktreePath,
      TENDRILFLOW_WORKTREE_PATH: worktreePath,
      TENDRILFLOW_CODEX_CWD: worktreePath
    };
    const next = await this.store.patchAgent(agent.id, {
      cwd: worktreePath,
      base_cwd: repoRoot,
      env,
      worktree: {
        ...(agent.worktree || {}),
        ...inspected,
        enabled: true,
        path: worktreePath,
        branch,
        base_cwd: repoRoot,
        created_at: agent.worktree?.created_at || nowIso(),
        updated_at: nowIso()
      }
    });
    await this.store.appendAgentLog(next, {
      type: "worktree_prepared",
      content: {
        text: `Prepared isolated worktree at ${worktreePath}.`,
        path: worktreePath,
        branch,
        dirty: inspected.dirty
      }
    });
    return next;
  }

  async assertWorktreePathIsAvailable(worktreePath) {
    const entries = await fs.readdir(worktreePath).catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (entries && entries.length > 0) {
      throw new Error(`Worktree path is not empty and is not a git worktree: ${worktreePath}`);
    }
  }

  async isGitWorktree(worktreePath) {
    return this.runGit(["-C", worktreePath, "rev-parse", "--is-inside-work-tree"])
      .then((result) => result.stdout === "true")
      .catch(() => false);
  }

  async inspectWorktree(worktreePath, repoRoot = null, branch = null) {
    const exists = await fs
      .stat(worktreePath)
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    if (!exists) {
      return {
        enabled: true,
        path: worktreePath,
        branch,
        base_cwd: repoRoot,
        status: "missing",
        dirty: false,
        changed_files: [],
        last_checked_at: nowIso()
      };
    }
    if (!(await this.isGitWorktree(worktreePath))) {
      return {
        enabled: true,
        path: worktreePath,
        branch,
        base_cwd: repoRoot,
        status: "invalid",
        dirty: true,
        changed_files: [],
        last_error: "Path exists but is not a git worktree.",
        last_checked_at: nowIso()
      };
    }
    const status = await this.runGit(["-C", worktreePath, "status", "--porcelain"]);
    const currentBranch = await this.runGit(["-C", worktreePath, "branch", "--show-current"]).catch(() => ({
      stdout: branch || ""
    }));
    const changedFiles = status.stdout
      ? status.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];
    return {
      enabled: true,
      path: worktreePath,
      branch: currentBranch.stdout || branch,
      base_cwd: repoRoot,
      status: "ready",
      dirty: changedFiles.length > 0,
      changed_files: changedFiles,
      last_checked_at: nowIso()
    };
  }

  async refreshAgentWorktreeStatus(agent) {
    const worktreePath = this.agentWorktreePath(agent);
    const repoRoot = agent.base_cwd || agent.worktree?.base_cwd || null;
    const inspected = await this.inspectWorktree(worktreePath, repoRoot, this.agentWorktreeBranch(agent));
    return this.store.patchAgent(agent.id, {
      worktree: {
        ...(agent.worktree || {}),
        ...inspected,
        updated_at: nowIso()
      }
    });
  }

  async removeAgentWorktreeIfClean(agent) {
    if (agent.isolation_mode !== "worktree" || !agent.worktree?.path) {
      return;
    }
    const inspected = await this.inspectWorktree(
      agent.worktree.path,
      agent.base_cwd || agent.worktree.base_cwd,
      agent.worktree.branch
    );
    if (inspected.status === "missing") {
      return;
    }
    if (inspected.status !== "ready") {
      throw new Error(`Agent worktree is not removable because it is ${inspected.status}: ${agent.worktree.path}`);
    }
    if (inspected.dirty) {
      throw new Error(
        `Agent worktree has uncommitted changes and was not removed: ${agent.worktree.path}. Commit, stash, or clean it before deleting the agent.`
      );
    }
    const repoRoot = agent.base_cwd || agent.worktree.base_cwd || this.rootDir;
    await this.runGit(["-C", repoRoot, "worktree", "remove", agent.worktree.path]);
    await this.store.appendAgentLog(agent, {
      type: "worktree_removed",
      content: {
        text: `Removed clean worktree ${agent.worktree.path}.`,
        path: agent.worktree.path
      }
    });
  }

  async startAgent(agentId) {
    let agent = await this.requireAgent(agentId);
    const existing = this.sessions.get(agentId);
    if (existing) {
      await this.store.appendAgentLog(agent, {
        type: "status_change",
        content: { text: "Agent is already running." }
      });
      return this.store.patchAgent(agentId, { status: "running" });
    }
    if (agent.isolation_mode === "worktree") {
      agent = await this.ensureAgentWorktree(agent);
    }

    const logAgentEvent = async (event) => {
      await this.store.appendAgentLog(agent, event).catch(() => undefined);
    };
    const session = createAdapterSession(agent, {
      onTaskEvent: async (taskId, event) => {
        await this.store.appendEvent(taskId, event).catch(() => undefined);
      },
      onSessionEvent: async (id, event) => {
        await logAgentEvent({ ...event, agent_id: id });
      },
      onExit: async (id, code) => {
        const expectedStop = this.stoppingAgents.delete(id);
        await logAgentEvent({
          type: "process_exit",
          content: {
            text: `Process exited with code ${code ?? "unknown"}.`,
            exit_code: code
          }
        });
        await this.store.patchAgent(id, {
          status: expectedStop || code === 0 ? "stopped" : "failed",
          last_exit_code: code
        });
        this.sessions.delete(id);
      },
      onError: async (id, error) => {
        const expectedStop = this.stoppingAgents.delete(id);
        await logAgentEvent({
          type: "error",
          content: {
            text: error.message
          }
        });
        await this.store.patchAgent(id, {
          status: expectedStop ? "stopped" : "failed",
          last_error: error.message
        });
        this.sessions.delete(id);
      }
    });

    try {
      const result = await session.start();
      this.sessions.set(agentId, session);
      return this.store.patchAgent(agentId, {
        status: result.status,
        last_launch_detail: result.detail
      });
    } catch (error) {
      await logAgentEvent({
        type: "error",
        content: {
          text: error.message
        }
      });
      return this.store.patchAgent(agentId, {
        status: "failed",
        last_error: error.message
      });
    }
  }

  async stopAgent(agentId) {
    const agent = await this.store.getAgent(agentId);
    const session = this.sessions.get(agentId);
    if (agent) {
      await this.store.appendAgentLog(agent, {
        type: "status_change",
        content: {
          text: session ? "Stop requested." : "Marked stopped without a running CLI session."
        }
      });
    }
    if (session) {
      this.stoppingAgents.add(agentId);
      await session.stop();
      this.sessions.delete(agentId);
    }
    return this.store.patchAgent(agentId, { status: "stopped", current_task_id: null });
  }

  async createTask(input) {
    await this.init();
    const scopedInput = await this.scopeTaskInput(input);
    const task = await this.store.createTask(scopedInput);
    await this.store.appendEvent(task.task_id, {
      type: "system_event",
      actor: { kind: "system", id: "orchestrator" },
      content: {
        text: "Task room created.",
        room_path: task.room_path
      }
    });
    if (task.owner_agent_id) {
      const owner = await this.store.getAgent(task.owner_agent_id);
      await this.store.patchAgent(task.owner_agent_id, { current_task_id: task.task_id });
      await this.store.appendEvent(task.task_id, {
        type: "status_change",
        actor: { kind: "system", id: "orchestrator" },
        content: {
          field: "owner_agent_id",
          from: null,
          to: task.owner_agent_id,
          text: `Assigned to ${owner?.name || task.owner_agent_id}.`
        }
      });
    }
    return task;
  }

  async deleteTask(taskId) {
    const task = await this.requireTask(taskId);
    const taskAgentIds = Array.from(new Set([task.owner_agent_id, ...(task.participant_agent_ids || [])].filter(Boolean)));
    for (const agentId of taskAgentIds) {
      await this.stopAgent(agentId);
    }
    await this.store.deleteTask(taskId);
    return true;
  }

  async updateTask(taskId, patch) {
    const task = await this.requireTask(taskId);
    const nextPatch = { ...patch };
    if (patch.status) {
      nextPatch.status = normalizeStatus(patch.status);
    }
    if (patch.owner_agent_id !== undefined) {
      nextPatch.owner_agent_id = await this.validAgentIdForTask(task, patch.owner_agent_id);
    }
    if (Array.isArray(patch.participant_agent_ids)) {
      nextPatch.participant_agent_ids = await this.validAgentIdsForTask(task, patch.participant_agent_ids);
    } else if (nextPatch.owner_agent_id !== undefined) {
      nextPatch.participant_agent_ids = Array.from(
        new Set([nextPatch.owner_agent_id, ...(task.participant_agent_ids || [])].filter(Boolean))
      );
    }
    if (Array.isArray(patch.depends_on)) {
      nextPatch.depends_on = await this.validTaskIdsForGroup(
        task.workspace_id,
        task.group_id,
        patch.depends_on,
        task.task_id
      );
    }
    if (Array.isArray(patch.blocked_by)) {
      nextPatch.blocked_by = await this.validTaskIdsForGroup(
        task.workspace_id,
        task.group_id,
        patch.blocked_by,
        task.task_id
      );
    }
    if (patch.parent_task_id !== undefined) {
      const [parentTaskId] = await this.validTaskIdsForGroup(
        task.workspace_id,
        task.group_id,
        patch.parent_task_id ? [patch.parent_task_id] : [],
        task.task_id
      );
      nextPatch.parent_task_id = parentTaskId || null;
    }
    if (Array.isArray(patch.child_task_ids)) {
      nextPatch.child_task_ids = await this.validTaskIdsForGroup(
        task.workspace_id,
        task.group_id,
        patch.child_task_ids,
        task.task_id
      );
    }
    const next = await this.store.patchTask(taskId, nextPatch);
    if (patch.status && patch.status !== task.status) {
      await this.store.appendEvent(taskId, {
        type: "status_change",
        actor: { kind: "system", id: "orchestrator" },
        content: {
          field: "status",
          from: task.status,
          to: next.status,
          text: `Task status changed from ${task.status} to ${next.status}.`
        }
      });
    }
    if (patch.owner_agent_id !== undefined && patch.owner_agent_id !== task.owner_agent_id) {
      await this.store.appendEvent(taskId, {
        type: "status_change",
        actor: { kind: "system", id: "orchestrator" },
        content: {
          field: "owner_agent_id",
          from: task.owner_agent_id,
          to: nextPatch.owner_agent_id,
          text: `Task owner changed to ${nextPatch.owner_agent_id || "unassigned"}.`
        }
      });
    }
    return next;
  }

  async scopeTaskInput(input) {
    const workspaceId = input.workspace_id || "workspace_main";
    const groupId = input.group_id || "group_main";
    const agents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === workspaceId && agent.group_id === groupId
    );
    const validIds = new Set(agents.map((agent) => agent.id));
    const ownerAgentId = validIds.has(input.owner_agent_id) ? input.owner_agent_id : null;
    const participantIds = Array.from(
      new Set([ownerAgentId, ...(input.participant_agent_ids || []).filter((id) => validIds.has(id))].filter(Boolean))
    );
    return {
      ...input,
      workspace_id: workspaceId,
      group_id: groupId,
      owner_agent_id: ownerAgentId,
      participant_agent_ids: participantIds,
      parent_task_id: (await this.validTaskIdsForGroup(workspaceId, groupId, input.parent_task_id ? [input.parent_task_id] : []))[0] || null,
      child_task_ids: await this.validTaskIdsForGroup(workspaceId, groupId, input.child_task_ids || []),
      depends_on: await this.validTaskIdsForGroup(workspaceId, groupId, input.depends_on || []),
      blocked_by: await this.validTaskIdsForGroup(workspaceId, groupId, input.blocked_by || [])
    };
  }

  async validAgentIdForTask(task, agentId) {
    if (!agentId) {
      return null;
    }
    const agent = await this.store.getAgent(agentId);
    return agent?.workspace_id === task.workspace_id && agent?.group_id === task.group_id ? agent.id : null;
  }

  async validAgentIdsForTask(task, agentIds) {
    const valid = [];
    for (const agentId of agentIds || []) {
      const scopedId = await this.validAgentIdForTask(task, agentId);
      if (scopedId) {
        valid.push(scopedId);
      }
    }
    return Array.from(new Set(valid));
  }

  async validTaskIdsForGroup(workspaceId, groupId, taskIds, excludeTaskId = null) {
    const validTasks = (await this.store.listTasks()).filter(
      (task) => task.workspace_id === workspaceId && task.group_id === groupId && task.task_id !== excludeTaskId
    );
    const validIds = new Set(validTasks.map((task) => task.task_id));
    return Array.from(new Set((taskIds || []).filter((taskId) => validIds.has(taskId))));
  }

  async taskWithEvents(taskId) {
    const task = await this.requireTask(taskId);
    return {
      task,
      events: await this.store.readEvents(taskId)
    };
  }

  async taskReplay(taskId) {
    const task = await this.requireTask(taskId);
    const events = await this.store.readEvents(taskId);
    const groupAgents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === task.workspace_id && agent.group_id === task.group_id
    );
    const agentLogs = (
      await Promise.all(
        groupAgents.map(async (agent) =>
          (await this.store.readAgentLogs(agent.id).catch(() => []))
            .filter((log) => !log.task_id || log.task_id === task.task_id || agent.current_task_id === task.task_id)
            .map((log) => ({ ...log, agent }))
        )
      )
    ).flat();
    const healthEntries = await Promise.all(groupAgents.map(async (agent) => [agent.id, await this.agentHealth(agent)]));
    const healthByAgentId = new Map(healthEntries);
    const eventCounts = {};
    const contributions = new Map();
    const decisions = [];
    const risks = [];
    const blockers = [];
    const evidence = [];
    const finalReports = [];
    const firstTimestamp = events[0]?.timestamp || task.created_at;
    const lastTimestamp = events.at(-1)?.timestamp || task.updated_at;

    for (const event of events) {
      increment(eventCounts, event.type || "unknown");
      const actorId = event.actor?.id || event.actor?.kind || "unknown";
      const entry = this.replayContribution(contributions, actorId, event.actor?.kind || "agent");
      entry.event_count += 1;
      entry.first_seen_at = entry.first_seen_at || event.timestamp;
      entry.last_seen_at = event.timestamp || entry.last_seen_at;
      if (event.type === "agent_message") {
        entry.messages += 1;
      } else if (event.type === "tool_call_summary") {
        entry.tool_calls += 1;
        evidence.push(event.content?.text || event.content?.title || eventText(event));
      } else if (event.type === "decision_record") {
        entry.decisions += 1;
        decisions.push({
          event_id: event.event_id,
          timestamp: event.timestamp,
          actor_id: actorId,
          selected_approach: event.content?.selected_approach || event.content?.text || "",
          reason: event.content?.reason || "",
          next_owner: event.content?.next_owner || null,
          tool: event.content?.tool || null
        });
      } else if (event.type === "review_comment") {
        entry.reviews += 1;
        risks.push(...compactList(event.content?.risks || []));
      } else if (event.type === "handoff_note") {
        entry.handoffs += 1;
        if (event.content?.risks) {
          risks.push(event.content.risks);
        }
      } else if (event.type === "final_report") {
        entry.final_reports += 1;
        finalReports.push(event.content);
      } else if (event.type === "status_change") {
        entry.status_changes += 1;
        if (event.content?.to === "blocked" || event.content?.to === "failed") {
          blockers.push(event.content.text || `${event.content.field || "status"} -> ${event.content.to}`);
        }
      }
      if (/block|blocked|阻塞|失败|failed|error/i.test(eventText(event))) {
        blockers.push(eventText(event));
      }
    }

    for (const log of agentLogs) {
      const entry = this.replayContribution(contributions, log.agent_id || log.agent?.id || "unknown", "agent");
      entry.log_count += 1;
      entry.first_seen_at = entry.first_seen_at || log.timestamp;
      entry.last_seen_at = log.timestamp || entry.last_seen_at;
      if (log.type === "stderr" || log.type === "error") {
        entry.errors += 1;
      }
      if (log.type === "process_started") {
        entry.process_starts += 1;
      }
    }

    const timeline = [
      ...events.map((event) => ({
        id: event.event_id,
        timestamp: event.timestamp,
        source: "room",
        type: event.type,
        actor_id: event.actor?.id || event.actor?.kind || "unknown",
        text: String(eventText(event)).slice(0, 420)
      })),
      ...agentLogs.map((log) => ({
        id: log.event_id,
        timestamp: log.timestamp,
        source: "agent_log",
        type: log.type,
        actor_id: log.agent_id,
        text: String(eventText(log)).slice(0, 420)
      }))
    ]
      .filter((item) => item.timestamp)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
      .slice(-240);

    const healthCounts = {};
    for (const [, health] of healthEntries) {
      increment(healthCounts, health.status || "unknown");
    }
    const processErrors = agentLogs.filter((log) => log.type === "stderr" || log.type === "error").length;
    const processStarts = agentLogs.filter((log) => log.type === "process_started").length;
    const metrics = {
      duration_ms: this.durationMs(firstTimestamp, lastTimestamp),
      event_count: events.length,
      log_count: agentLogs.length,
      tool_call_count: eventCounts.tool_call_summary || 0,
      decision_count: eventCounts.decision_record || 0,
      review_count: eventCounts.review_comment || 0,
      handoff_count: eventCounts.handoff_note || 0,
      final_report_count: eventCounts.final_report || 0,
      process_error_count: processErrors,
      retry_count: Math.max(0, processStarts - new Set(agentLogs.map((log) => log.agent_id)).size),
      health_counts: healthCounts
    };
    const suggestions = this.hostReplaySuggestions(task, metrics, {
      decisions,
      risks,
      blockers,
      finalReports,
      healthByAgentId
    });

    return {
      generated_at: nowIso(),
      task_summary: {
        task_id: task.task_id,
        title: task.title,
        status: task.status,
        owner_agent_id: task.owner_agent_id,
        participant_agent_ids: task.participant_agent_ids || [],
        playbook_stage: task.playbook_stage || "intake",
        created_at: task.created_at,
        updated_at: task.updated_at,
        duration_ms: metrics.duration_ms,
        event_count: events.length,
        final_report: finalReports.at(-1) || null
      },
      event_counts: eventCounts,
      agent_contributions: [...contributions.values()].map((entry) => ({
        ...entry,
        agent_name: groupAgents.find((agent) => agent.id === entry.actor_id)?.name || entry.actor_id,
        health: healthByAgentId.get(entry.actor_id)?.status || null
      })),
      decision_risk_summary: {
        decisions,
        risks: compactList(risks, 16),
        blockers: compactList(blockers, 16),
        evidence: compactList(evidence, 16)
      },
      metrics,
      timeline,
      host_replay_suggestions: suggestions
    };
  }

  replayContribution(contributions, actorId, kind) {
    if (!contributions.has(actorId)) {
      contributions.set(actorId, {
        actor_id: actorId,
        kind,
        event_count: 0,
        log_count: 0,
        messages: 0,
        tool_calls: 0,
        decisions: 0,
        reviews: 0,
        handoffs: 0,
        final_reports: 0,
        status_changes: 0,
        process_starts: 0,
        errors: 0,
        first_seen_at: null,
        last_seen_at: null
      });
    }
    return contributions.get(actorId);
  }

  durationMs(start, end) {
    const startMs = Date.parse(start || "");
    const endMs = Date.parse(end || "");
    return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null;
  }

  hostReplaySuggestions(task, metrics, context) {
    const suggestions = [];
    if (!metrics.final_report_count && !["todo", "in_progress"].includes(task.status)) {
      suggestions.push({
        severity: "high",
        title: "Missing final report",
        text: "Task has progressed beyond active work but no final_report is recorded. Ask Host to finalize outcome, evidence, and residual risk."
      });
    }
    if (!metrics.review_count && ["review", "done"].includes(task.status)) {
      suggestions.push({
        severity: "medium",
        title: "No visible review",
        text: "No review_comment exists in the room. Add a review pass before trusting the result."
      });
    }
    if (!metrics.tool_call_count) {
      suggestions.push({
        severity: "medium",
        title: "Weak evidence trail",
        text: "No tool_call_summary is recorded. Ask agents to summarize commands, checks, or artifacts used as evidence."
      });
    }
    if (metrics.process_error_count) {
      suggestions.push({
        severity: "high",
        title: "Process errors present",
        text: `${metrics.process_error_count} stderr/error log entries were observed. Ask debug to inspect failures before finalizing.`
      });
    }
    const unhealthy = Object.entries(metrics.health_counts || {}).filter(([status]) =>
      ["stale", "detached", "failed"].includes(status)
    );
    if (unhealthy.length) {
      suggestions.push({
        severity: "high",
        title: "Unhealthy agents",
        text: `Some agents are ${unhealthy.map(([status, count]) => `${status}:${count}`).join(", ")}. Host should recover, stop, or reassign before continuing.`
      });
    }
    if (!context.decisions.length) {
      suggestions.push({
        severity: "low",
        title: "No decision record",
        text: "No decision_record is present. Capture the selected approach and rejected alternatives for auditability."
      });
    }
    if (context.risks.length && !metrics.final_report_count) {
      suggestions.push({
        severity: "medium",
        title: "Risks need closure",
        text: "Risks were mentioned but no final report closes them. Host should summarize which risks remain."
      });
    }
    if (!suggestions.length) {
      suggestions.push({
        severity: "low",
        title: "Replay looks consistent",
        text: "Trace contains decisions, evidence, and closure signals. Use this replay as the task audit summary."
      });
    }
    return suggestions;
  }

  async postRoomMessage(taskId, text, actor = { kind: "user", id: "local_user" }) {
    const task = await this.requireTask(taskId);
    const message = text.trim();
    if (!message) {
      throw new Error("Message is required.");
    }
    await this.store.appendEvent(taskId, {
      type: "user_message",
      actor,
      content: { text: message }
    });

    const agents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === task.workspace_id && agent.group_id === task.group_id
    );
    const targets = this.resolveMentionTargets(message, agents, task);
    const controlCommand = this.resolveControlCommand(message, actor, agents, targets);
    if (controlCommand) {
      await this.executeControlCommand(task, controlCommand);
      return this.taskWithEvents(taskId);
    }
    if (!targets.length) {
      await this.store.appendEvent(taskId, {
        type: "system_event",
        actor: { kind: "system", id: "orchestrator" },
        content: {
          text: "No agent route matched. Mention an agent or assign an owner."
        }
      });
      return this.taskWithEvents(taskId);
    }

    const delegations = actor.kind === "user" ? this.resolveHostDelegations(message, agents, targets) : [];
    if (delegations.length) {
      for (const delegation of delegations) {
        await this.executeHostDelegationTool(task, delegation);
      }
      const delegatedTargetIds = new Set(delegations.map((delegation) => delegation.target.id));
      const remainingTargets = targets.filter(
        (agent) => agent.role !== "host" && !delegatedTargetIds.has(agent.id)
      );
      for (const agent of remainingTargets) {
        await this.routeToAgent(task, agent, message);
      }
      return this.taskWithEvents(taskId);
    }

    for (const agent of targets) {
      await this.routeToAgent(task, agent, message);
    }
    return this.taskWithEvents(taskId);
  }

  resolveControlCommand(message, actor, agents, targets) {
    const explicitTargets = this.resolveExplicitMentionTargets(message, agents);
    const hostTarget = explicitTargets.find((agent) => agent.role === "host");
    const actorAgent = actor.kind === "agent" ? agents.find((agent) => agent.id === actor.id) : null;
    const hostAuthority = actorAgent?.role === "host" ? actorAgent : hostTarget;
    const userAuthority = actor.kind === "user";
    if (!userAuthority && actorAgent?.role !== "host") {
      return null;
    }

    const stopIntent = /(停止|制止|中止|暂停|刹车|终止|stop|halt|pause|cancel|interrupt)/iu.test(message);
    const stopScope = /(全部|所有|全体|群组|成员|agents?|执行|运行|任务|all|group|members?)/iu.test(message);
    if (stopIntent && (stopScope || explicitTargets.some((agent) => agent.role !== "host"))) {
      return {
        kind: "stop_agents",
        authority: hostAuthority ? "host" : "user",
        actor: hostAuthority ? { kind: "agent", id: hostAuthority.id } : actor,
        host_agent: hostAuthority || null,
        targets: this.resolveControlTargets(agents, stopScope ? [] : explicitTargets, hostAuthority)
      };
    }

    const broadcastIntent = /(广播|通知全体|告诉全体|全体注意|announce|broadcast)/iu.test(message);
    const broadcastScope = /(全体|全部|所有|群组|成员|agents?|all|group|members?)/iu.test(message);
    if (broadcastIntent) {
      return {
        kind: "broadcast_instruction",
        authority: hostAuthority ? "host" : "user",
        actor: hostAuthority ? { kind: "agent", id: hostAuthority.id } : actor,
        host_agent: hostAuthority || null,
        targets: this.resolveControlTargets(agents, broadcastScope ? [] : explicitTargets, hostAuthority),
        instruction: this.extractBroadcastInstruction(message)
      };
    }

    return null;
  }

  resolveControlTargets(agents, targets, hostAuthority = null) {
    const namedTargets = targets.filter((agent) => agent.role !== "host");
    const selected = namedTargets.length ? namedTargets : agents;
    const filtered = selected.filter((agent) => !hostAuthority || agent.id !== hostAuthority.id);
    return Array.from(new Map(filtered.map((agent) => [agent.id, agent])).values());
  }

  extractBroadcastInstruction(message) {
    const withoutMentions = message.replace(/@([^\s@,，.。:：;；!！?？)）\]]+)/gu, "").trim();
    const match = withoutMentions.match(/(?:广播|通知全体|告诉全体|全体注意|announce|broadcast)(?:给全体|给所有成员|给所有agent|to all agents?)?[：:，,\s]*(.+)$/iu);
    return (match?.[1] || withoutMentions || message).trim();
  }

  async executeControlCommand(task, command) {
    if (command.kind === "stop_agents") {
      await this.executeStopAgentsControl(task, command);
      return;
    }
    if (command.kind === "broadcast_instruction") {
      await this.executeBroadcastControl(task, command);
    }
  }

  async executeStopAgentsControl(task, command) {
    const targetIds = command.targets.map((agent) => agent.id);
    await this.store.appendEvent(task.task_id, {
      type: "tool_call_summary",
      actor: command.actor,
      content: {
        tool: command.authority === "host" ? "host.stop_agents" : "user.stop_agents",
        skill: command.authority === "host" ? "host.control" : "user.control",
        text: `${command.authority === "host" ? "Host Agent" : "User"} requested a group control stop.`,
        target_agent_ids: targetIds
      }
    });
    for (const agent of command.targets) {
      await this.stopAgent(agent.id);
    }
    await this.store.appendEvent(task.task_id, {
      type: "system_event",
      actor: { kind: "system", id: "orchestrator" },
      content: {
        text: `Control plane stopped ${targetIds.length} agent(s).`,
        stopped_agent_ids: targetIds
      }
    });
  }

  async executeBroadcastControl(task, command) {
    const targetIds = command.targets.map((agent) => agent.id);
    await this.store.appendEvent(task.task_id, {
      type: "tool_call_summary",
      actor: command.actor,
      content: {
        tool: command.authority === "host" ? "host.broadcast_instruction" : "user.broadcast_instruction",
        skill: command.authority === "host" ? "host.control" : "user.control",
        text: `${command.authority === "host" ? "Host Agent" : "User"} broadcast a high-priority group instruction.`,
        instruction: command.instruction,
        target_agent_ids: targetIds
      }
    });
    await this.store.appendEvent(task.task_id, {
      type: "system_event",
      actor: { kind: "system", id: "orchestrator" },
      content: {
        text: `Broadcast instruction recorded for ${targetIds.length} agent(s).`,
        instruction: command.instruction,
        target_agent_ids: targetIds
      }
    });
    for (const agent of command.targets) {
      await this.sendControlInstruction(task, agent, command.instruction, command);
    }
  }

  async sendControlInstruction(task, agent, instruction, command) {
    const participants = Array.from(new Set([...(task.participant_agent_ids || []), agent.id]));
    await this.store.patchTask(task.task_id, { participant_agent_ids: participants });
    const session = this.sessions.get(agent.id);
    if (!session) {
      await this.store.appendAgentLog(agent, {
        type: "status_change",
        task_id: task.task_id,
        content: {
          text: "Broadcast instruction recorded in the room; agent is not running."
        }
      });
      return false;
    }
    await this.store.patchAgent(agent.id, { current_task_id: task.task_id });
    const controlMessage = [
      "CONTROL BROADCAST",
      `Authority: ${command.authority}`,
      `Instruction: ${instruction}`
    ].join("\n");
    const sent = await session.sendMessage(task, await this.buildAgentContextMessage(task, controlMessage, agent));
    if (!sent) {
      await this.store.appendAgentLog(agent, {
        type: "error",
        task_id: task.task_id,
        content: {
          text: "Could not deliver broadcast instruction to the running session."
        }
      });
    }
    return sent;
  }

  resolveMentionTargets(message, agents, task) {
    const byMention = this.resolveExplicitMentionTargets(message, agents);

    if (byMention.length) {
      return byMention;
    }
    if (task.owner_agent_id) {
      const owner = agents.find((agent) => agent.id === task.owner_agent_id);
      return owner ? [owner] : [];
    }
    return [];
  }

  resolveExplicitMentionTargets(message, agents) {
    const mentions = Array.from(message.matchAll(/@([^\s@,，.。:：;；!！?？)）\]]+)/gu)).map((match) =>
      match[1].toLowerCase()
    );
    const matches = mentions
      .map((mention) =>
        agents.find((agent) => {
          const candidates = [
            agent.id,
            agent.name,
            agent.role,
            `${agent.role}-agent`,
            ...(agent.role === "host" ? ["群主"] : [])
          ].map((value) => String(value || "").toLowerCase());
          return candidates.includes(mention);
        })
      )
      .filter(Boolean);
    return Array.from(new Map(matches.map((agent) => [agent.id, agent])).values());
  }

  resolveHostDelegations(message, agents, targets) {
    const hostTargets = targets.filter((agent) => agent.role === "host");
    if (!hostTargets.length || !this.hasDelegationIntent(message)) {
      return [];
    }
    const alreadyTargeted = new Set(targets.map((agent) => agent.id));
    const targetAgents = this.findNamedDelegationTargets(message, agents).filter(
      (agent) => agent.role !== "host" && !alreadyTargeted.has(agent.id)
    );
    return targetAgents.map((target) => ({
      hostAgent: hostTargets[0],
      target,
      kind: this.delegationKind(message),
      message: this.delegationMessage(message, hostTargets[0], target)
    }));
  }

  hasDelegationIntent(message) {
    return /(给|让|请|叫|安排|交给|转给|派给|看一下|看看|审核|审查|测试|验证|确认|review|test|check|route|assign|handoff)/iu.test(message);
  }

  delegationKind(message) {
    if (/(交接|交给|转给|移交|handoff|assign|owner|负责人)/iu.test(message)) {
      return "handoff";
    }
    if (/(审核|审查|review|看一下|看看|check|确认)/iu.test(message)) {
      return "review";
    }
    if (/(测试|test|验证)/iu.test(message)) {
      return "test";
    }
    return "delegate";
  }

  findNamedDelegationTargets(message, agents) {
    const normalized = message.toLowerCase();
    const matches = [];
    for (const agent of agents) {
      const aliases = [agent.name, agent.id, `${agent.role}-agent`]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
        matches.push(agent);
      }
    }
    return Array.from(new Map(matches.map((agent) => [agent.id, agent])).values());
  }

  async executeHostDelegationTool(task, delegation) {
    const hostAgent = delegation.hostAgent;
    await this.store.appendEvent(task.task_id, {
      type: "tool_call_summary",
      actor: { kind: "agent", id: hostAgent.id },
      content: {
        tool: "host.route_to_agent",
        skill: "host.route_to_agent",
        text: `Host Agent called host.route_to_agent to ask ${delegation.target.name} to respond in the group.`,
        target_agent_id: delegation.target.id,
        target_agent_name: delegation.target.name,
        route_kind: delegation.kind
      }
    });
    await this.store.appendEvent(task.task_id, {
      type: "decision_record",
      actor: { kind: "agent", id: hostAgent.id },
      content: {
        selected_approach: `Call host.route_to_agent for ${delegation.target.name}.`,
        rejected_alternatives: ["Wait for raw agent output to trigger routing automatically"],
        reason: "Host Agent orchestration should use an explicit tool call so the target agent is invoked once without creating agent-output loops.",
        next_owner: task.owner_agent_id || delegation.target.id,
        route_to_agent_id: delegation.target.id,
        route_kind: delegation.kind,
        tool: "host.route_to_agent"
      }
    });
    await this.routeToAgent(task, delegation.target, delegation.message);
  }

  delegationMessage(originalMessage, hostAgent, targetAgent) {
    const action = {
      handoff: "接收群主编排的交接，先确认交接上下文，再说明下一步执行计划",
      test: "测试和验证群主的最新结论，指出可确认事实、缺口和下一步验证项",
      review: "审核群主的最新结论，指出是否认可、风险和缺少的证据",
      delegate: "处理群主转派给你的事项，并在群里回复你的判断"
    }[this.delegationKind(originalMessage)];
    return [
      `@${targetAgent.name} ${action}。`,
      `请只基于当前 Agent Room 的可见 transcript、工具摘要和交接/决策记录作答。`,
      `群主 Agent: ${hostAgent.name}。`,
      `原始编排请求: ${originalMessage}`
    ].join("\n");
  }

  async routeToAgent(task, agent, message) {
    const participants = Array.from(new Set([...(task.participant_agent_ids || []), agent.id]));
    await this.store.patchTask(task.task_id, { participant_agent_ids: participants });
    await this.store.patchAgent(agent.id, { current_task_id: task.task_id });
    const claimedTask = await this.claimTaskForAgent(task, agent);

    if (agent.role === "host" && (await this.maybeCreateAgentFromHostCommand(claimedTask, agent, message))) {
      return;
    }

    const session = this.sessions.get(agent.id);
    let sent = false;
    if (session) {
      sent = await session.sendMessage(claimedTask, await this.buildAgentContextMessage(claimedTask, message, agent));
    }
    if (!sent) {
      const latestAgent = await this.store.getAgent(agent.id);
      if (!session && latestAgent?.status === "running") {
        await this.store.patchAgent(agent.id, {
          status: "stopped",
          current_task_id: null,
          last_error: "No attached CLI session; start the agent again."
        });
      }
      await this.store.appendAgentLog(agent, {
        type: session ? "error" : "status_change",
        task_id: task.task_id,
        content: {
          text: session
            ? "Could not send to the running CLI session; using internal role responder."
            : "No running CLI session; using internal role responder."
        }
      });
      await this.emitRoleResponse(claimedTask, agent, message);
    }
  }

  async claimTaskForAgent(task, agent) {
    const latestTask = (await this.store.getTask(task.task_id)) || task;
    const claimedAt = nowIso();
    const claim = {
      agent_id: agent.id,
      agent_name: agent.name,
      claimed_at: claimedAt,
      lease_until: new Date(Date.now() + TASK_CLAIM_LEASE_MS).toISOString()
    };
    const nextTask = await this.store.patchTask(task.task_id, { claim });
    if (latestTask.claim?.agent_id !== agent.id) {
      await this.store.appendEvent(task.task_id, {
        type: "status_change",
        actor: { kind: "system", id: "orchestrator" },
        content: {
          field: "claim.agent_id",
          from: latestTask.claim?.agent_id || null,
          to: agent.id,
          lease_until: claim.lease_until,
          text: `${agent.name} claimed the task execution lease.`
        }
      });
    }
    return nextTask || { ...latestTask, claim };
  }

  async buildAgentContextMessage(task, message, agent = null) {
    const workspace = await this.store.getWorkspace(task.workspace_id);
    const group = await this.store.getGroup(task.workspace_id, task.group_id);
    const memory = await this.store.readGroupMemory(task.workspace_id, task.group_id);
    const matchedSkills = await this.store.matchedSkillSummaries(task.workspace_id, task.group_id, agent || {});
    const events = await this.store.readEvents(task.task_id).catch(() => []);
    const recentEvents = events.slice(-8).map((event) => {
      const actor = event.actor?.id || event.actor?.kind || "unknown";
      const text = event.content?.text || event.content?.summary || event.content?.title || event.type;
      return `- ${event.type} by ${actor}: ${String(text).slice(0, 240)}`;
    });
    const memorySections = Object.entries(memory)
      .map(([fileName, contents]) => `### ${fileName}\n${String(contents).trim().slice(0, 1200) || "(empty)"}`)
      .join("\n\n");
    const skillSections = matchedSkills.length
      ? matchedSkills
          .map((skill) => {
            const roles = (skill.roles || []).join(", ") || "*";
            return `- ${skill.skill_id} (${skill.scope}, roles: ${roles})\n  ${skill.summary || "(no summary)"}\n  Source: ${skill.path}`;
          })
          .join("\n")
      : "(none)";

    return [
      "TendrilFlow task context",
      "",
      `Workspace: ${workspace?.name || task.workspace_id} (${task.workspace_id})`,
      `Workspace root: ${workspace?.root_dir || this.rootDir}`,
      `Group: ${group?.name || task.group_id} (${task.group_id})`,
      `Task: ${task.title}`,
      `Task status: ${task.status}`,
      `Task description: ${task.description || "(none)"}`,
      `Task playbook stage: ${task.playbook_stage || "intake"}`,
      `Task dependencies: ${(task.depends_on || []).join(", ") || "(none)"}`,
      `Task blocked by: ${(task.blocked_by || []).join(", ") || "(none)"}`,
      `Task claim: ${task.claim?.agent_id ? `${task.claim.agent_id} until ${task.claim.lease_until}` : "(none)"}`,
      `Agent isolation: ${agent?.isolation_mode || "shared"}`,
      `Agent working directory: ${agent?.cwd || workspace?.root_dir || this.rootDir}`,
      agent?.worktree?.path
        ? `Agent worktree: ${agent.worktree.path} (${agent.worktree.dirty ? "dirty" : "clean"})`
        : "Agent worktree: (none)",
      "",
      buildCommunicationExecutionProtocol(agent || {}),
      "",
      "Matched skills:",
      skillSections,
      "",
      "Group memory:",
      memorySections,
      "",
      "Recent room events:",
      recentEvents.join("\n") || "(none)",
      "",
      "Repository instructions:",
      "If your adapter reads AGENTS.md, treat it as repo-level execution guidance under this TendrilFlow context.",
      "",
      "User message:",
      message
    ].join("\n");
  }

  async emitRoleResponse(task, agent, message) {
    if (agent.role === "host") {
      await this.store.patchTask(task.task_id, { playbook_stage: "plan" });
      await this.store.appendEvent(task.task_id, {
        type: "agent_message",
        actor: { kind: "agent", id: agent.id },
        content: {
          text: `Host playbook for "${task.title}": plan, clarify, execute, verify, fix if needed, then finalize the report.`,
          playbook: HOST_DEFAULT_PLAYBOOK,
          playbook_stage: "plan",
          source: "role_profile"
        }
      });
      await this.store.appendEvent(task.task_id, {
        type: "decision_record",
        actor: { kind: "agent", id: agent.id },
        content: {
          selected_approach: "Run the default Host playbook in the visible Agent Room.",
          playbook: HOST_DEFAULT_PLAYBOOK,
          playbook_stage: "plan",
          rejected_alternatives: [
            "Create private agent scratchpads",
            "Move the task into an external issue tracker"
          ],
          reason: "The MVP scope requires local task board ownership, visible discussion, and file-backed transcripts.",
          next_owner: task.owner_agent_id || agent.id
        }
      });
      if (this.shouldGenerateTaskGraph(message)) {
        await this.emitHostTaskGraph(task, agent);
      }
      return;
    }

    if (agent.role === "review") {
      await this.store.appendEvent(task.task_id, {
        type: "review_comment",
        actor: { kind: "agent", id: agent.id },
        content: {
          verdict: "revise",
          text: "Review focus: verify task status transitions, transcript persistence, adapter event mapping, and final report generation before accepting.",
          risks: [
            "Agent command failures must be visible as system or status events.",
            "Transcript tests should read the actual events.jsonl file, not only in-memory state."
          ]
        }
      });
      return;
    }

    if (agent.role === "debug") {
      const events = await this.store.readEvents(task.task_id);
      const lastEvents = events.slice(-5).map((event) => `${event.type}:${event.actor?.id || event.actor?.kind}`);
      await this.store.appendEvent(task.task_id, {
        type: "tool_call_summary",
        actor: { kind: "agent", id: agent.id },
        content: {
          title: "Trace inspection",
          text: `Inspected ${events.length} room events. Recent sequence: ${lastEvents.join(", ") || "none"}.`
        }
      });
      await this.store.appendEvent(task.task_id, {
        type: "agent_message",
        actor: { kind: "agent", id: agent.id },
        content: {
          text: "Debug recommendation: check the latest status_change and tool_call_summary entries, then either unblock the owner or create a handoff with the blocking evidence.",
          source: "role_profile"
        }
      });
      return;
    }

    if (agent.role === "observe") {
      const events = await this.store.readEvents(task.task_id);
      await this.store.appendEvent(task.task_id, {
        type: "agent_message",
        actor: { kind: "agent", id: agent.id },
        content: {
          text: `Observation: ${task.status} task, ${events.length} recorded room events, owner ${task.owner_agent_id || "unassigned"}.`,
          source: "role_profile"
        }
      });
      return;
    }

    await this.store.appendEvent(task.task_id, {
      type: "agent_message",
      actor: { kind: "agent", id: agent.id },
      content: {
        text: `Acknowledged. I will work from the visible task room context for "${task.title}" and report progress as structured events.`,
        source: "role_profile",
        received: message
      }
    });
    if (task.status === "todo") {
      await this.updateTask(task.task_id, { status: "in_progress" });
    }
  }

  shouldGenerateTaskGraph(message) {
    return /(拆分|分解|计划|执行顺序|安排执行|任务图|task graph|decompose|plan|break down|breakdown)/iu.test(message);
  }

  async emitHostTaskGraph(task, hostAgent) {
    const graph = await this.buildHostTaskGraph(task, hostAgent);
    await this.store.appendEvent(task.task_id, {
      type: "task_graph",
      actor: { kind: "agent", id: hostAgent.id },
      content: graph
    });
    return graph;
  }

  async buildHostTaskGraph(task, hostAgent) {
    const agents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === task.workspace_id && agent.group_id === task.group_id
    );
    const roleOwner = (role) => this.pickAgentForRole(agents, role)?.id || null;
    const reassignSuggestions = await this.staleAgentReassignSuggestions(task, agents);
    return {
      tool: "host.task_graph",
      skill: "host.task_graph",
      parent_task_id: task.task_id,
      playbook: HOST_DEFAULT_PLAYBOOK,
      playbook_stage: "plan",
      text: `Host proposed a task graph for "${task.title}". Review it, then accept to create child tasks.`,
      nodes: [
        {
          id: "clarify",
          title: `Clarify acceptance criteria for ${task.title}`,
          role: "host",
          owner_agent_id: hostAgent.id,
          depends_on: []
        },
        {
          id: "execute",
          title: `Execute core work for ${task.title}`,
          role: "work",
          owner_agent_id: roleOwner("work"),
          depends_on: ["clarify"]
        },
        {
          id: "verify",
          title: `Verify evidence and regressions for ${task.title}`,
          role: "review",
          owner_agent_id: roleOwner("review"),
          depends_on: ["execute"]
        },
        {
          id: "fix",
          title: `Fix defects found during verification for ${task.title}`,
          role: "debug",
          owner_agent_id: roleOwner("debug") || roleOwner("work"),
          depends_on: ["verify"]
        },
        {
          id: "finalize",
          title: `Finalize report for ${task.title}`,
          role: "host",
          owner_agent_id: hostAgent.id,
          depends_on: ["verify", "fix"]
        }
      ],
      edges: [
        { from: "clarify", to: "execute" },
        { from: "execute", to: "verify" },
        { from: "verify", to: "fix" },
        { from: "verify", to: "finalize" },
        { from: "fix", to: "finalize" }
      ],
      reassign_suggestions: reassignSuggestions
    };
  }

  pickAgentForRole(agents, role) {
    if (role === "work") {
      return agents.find((agent) => agent.role === "work") || agents.find((agent) => agent.role !== "host") || null;
    }
    return agents.find((agent) => agent.role === role) || null;
  }

  async staleAgentReassignSuggestions(task, agents) {
    const healthEntries = await Promise.all(agents.map(async (agent) => [agent.id, await this.agentHealth(agent)]));
    const healthById = new Map(healthEntries);
    const unhealthyIds = new Set(
      healthEntries
        .filter(([, health]) => ["stale", "detached", "failed"].includes(health.status))
        .map(([agentId]) => agentId)
    );
    if (!unhealthyIds.size) {
      return [];
    }
    const groupTasks = (await this.store.listTasks()).filter(
      (candidate) =>
        candidate.workspace_id === task.workspace_id &&
        candidate.group_id === task.group_id &&
        !["done", "failed"].includes(candidate.status)
    );
    const fallback = agents.find(
      (agent) => agent.role !== "host" && !["stale", "detached", "failed"].includes(healthById.get(agent.id)?.status)
    );
    return groupTasks
      .filter((candidate) => unhealthyIds.has(candidate.owner_agent_id) || unhealthyIds.has(candidate.claim?.agent_id))
      .map((candidate) => ({
        task_id: candidate.task_id,
        title: candidate.title,
        from_agent_id: candidate.claim?.agent_id || candidate.owner_agent_id,
        suggested_to_agent_id: fallback?.id || null,
        reason: "The current owner or claim holder is unhealthy; Host should reassign or ask for recovery evidence."
      }));
  }

  async applyTaskGraph(taskId, input = {}) {
    const parent = await this.requireTask(taskId);
    const graph = input.graph || (await this.latestTaskGraph(parent.task_id));
    if (!graph?.nodes?.length) {
      throw new Error("No task graph is available to apply.");
    }
    const agents = (await this.store.listAgents()).filter(
      (agent) => agent.workspace_id === parent.workspace_id && agent.group_id === parent.group_id
    );
    const tempToTaskId = new Map();
    const createdTasks = [];
    for (const node of graph.nodes) {
      const owner =
        node.owner_agent_id ||
        this.pickAgentForRole(agents, node.role || "work")?.id ||
        null;
      const child = await this.createTask({
        title: node.title || node.id || "Task graph item",
        description: node.description || `Generated from task graph node ${node.id || "unknown"}.`,
        workspace_id: parent.workspace_id,
        group_id: parent.group_id,
        owner_agent_id: owner,
        status: "todo",
        parent_task_id: parent.task_id,
        playbook_stage: node.id || node.role || "execute"
      });
      tempToTaskId.set(node.id, child.task_id);
      createdTasks.push(child);
    }
    for (const [index, node] of graph.nodes.entries()) {
      const dependsOn = (node.depends_on || []).map((id) => tempToTaskId.get(id)).filter(Boolean);
      if (dependsOn.length) {
        createdTasks[index] = await this.updateTask(createdTasks[index].task_id, { depends_on: dependsOn });
      }
    }
    const nextChildTaskIds = Array.from(
      new Set([...(parent.child_task_ids || []), ...createdTasks.map((task) => task.task_id)])
    );
    const updatedParent = await this.updateTask(parent.task_id, {
      child_task_ids: nextChildTaskIds,
      playbook_stage: "execute"
    });
    await this.store.appendEvent(parent.task_id, {
      type: "system_event",
      actor: { kind: "system", id: "orchestrator" },
      content: {
        text: `Applied Host task graph and created ${createdTasks.length} child task(s).`,
        child_task_ids: createdTasks.map((task) => task.task_id),
        graph_event_id: input.graph_event_id || graph.graph_event_id || null
      }
    });
    return {
      parent_task: updatedParent,
      tasks: createdTasks
    };
  }

  async latestTaskGraph(taskId) {
    const events = await this.store.readEvents(taskId);
    const graphEvent = [...events].reverse().find((event) => event.type === "task_graph");
    return graphEvent ? { ...graphEvent.content, graph_event_id: graphEvent.event_id } : null;
  }

  parseHostAgentRequest(message) {
    const lower = message.toLowerCase();
    const wantsAgent =
      /(新增|创建|添加|加入|拉).{0,16}(agent|成员|助手|代理)/iu.test(message) ||
      /(create|add|new).{0,16}(agent|member)/iu.test(lower);
    if (!wantsAgent) {
      return null;
    }

    let provider = "gemini";
    let mode = "acp";
    if (lower.includes("kimi")) {
      provider = "kimi";
    } else if (lower.includes("codex")) {
      provider = "codex";
      mode = "exec";
    } else if (lower.includes("mock") || message.includes("模拟")) {
      provider = "mock";
      mode = "mock";
    } else if (lower.includes("gemini")) {
      provider = "gemini";
    }

    let role = "work";
    if (/review|审查|审核|评审/iu.test(message)) {
      role = "review";
    } else if (/debug|调试|排查/iu.test(message)) {
      role = "debug";
    } else if (/observe|观察/iu.test(message)) {
      role = "observe";
    }

    const nameMatch = message.match(/(?:名称|名字|叫|名为|name|named)\s*[:：]?\s*([a-zA-Z0-9_-]+)/iu);
    const name = nameMatch?.[1] || (role === "work" ? `${provider}-worker` : `${provider}-${role}-agent`);
    const isolation_mode = /(worktree|隔离|独立工作区|独立目录)/iu.test(message) ? "worktree" : "shared";
    return { name, role, provider, mode, isolation_mode };
  }

  commandForAgentSpec(spec, cwd) {
    if (spec.mode === "acp") {
      if (spec.provider === "gemini") {
        return "gemini --acp";
      }
      if (spec.provider === "kimi") {
        return "kimi acp";
      }
      return `node scripts/mock-acp-agent.js --name ${quoteShell(spec.name)}`;
    }
    if (spec.provider === "codex" || spec.mode === "exec") {
      return `node scripts/codex-agent.js --name ${quoteShell(spec.name)} --mode exec --cwd ${quoteShell(cwd)}`;
    }
    return `node scripts/mock-agent.js --role ${spec.role} --name ${quoteShell(spec.name)}`;
  }

  async maybeCreateAgentFromHostCommand(task, hostAgent, message) {
    const spec = this.parseHostAgentRequest(message);
    if (!spec) {
      return false;
    }
    const workspace = await this.store.getWorkspace(task.workspace_id);
    const cwd = workspace?.root_dir || hostAgent.cwd || this.rootDir;
    const agent = await this.createAgent({
      name: spec.name,
      role: spec.role,
      workspace_id: task.workspace_id,
      group_id: task.group_id,
      mode: spec.mode,
      provider: spec.provider,
      cwd,
      base_cwd: cwd,
      isolation_mode: spec.isolation_mode,
      command: this.commandForAgentSpec(spec, cwd)
    });
    await this.store.patchTask(task.task_id, {
      participant_agent_ids: Array.from(new Set([...(task.participant_agent_ids || []), hostAgent.id, agent.id]))
    });
    await this.store.appendEvent(task.task_id, {
      type: "decision_record",
      actor: { kind: "agent", id: hostAgent.id },
      content: {
        selected_approach: `Create ${agent.name} as a ${agent.role} agent in this group.`,
        rejected_alternatives: ["Use global default agents", "Create the agent outside the current group"],
        reason:
          agent.isolation_mode === "worktree"
            ? "The group workflow keeps membership explicit and gives this agent its own git worktree for code changes."
            : "The group workflow keeps membership explicit and scoped to the current task room.",
        next_owner: agent.id
      }
    });
    await this.store.appendEvent(task.task_id, {
      type: "system_event",
      actor: { kind: "system", id: "orchestrator" },
      content: {
        text: `Host created agent ${agent.name}.`,
        agent_id: agent.id,
        provider: agent.provider,
        mode: agent.mode,
        isolation_mode: agent.isolation_mode,
        command: agent.command
      }
    });
    return true;
  }

  async createHandoff(taskId, input) {
    const task = await this.requireTask(taskId);
    const fromAgent = input.from_agent_id
      ? await this.store.getAgent(input.from_agent_id)
      : task.owner_agent_id
        ? await this.store.getAgent(task.owner_agent_id)
        : null;
    const toAgent = await this.requireAgent(input.to_agent_id);
    if (toAgent.workspace_id !== task.workspace_id || toAgent.group_id !== task.group_id) {
      throw new Error(`Agent ${toAgent.id} does not belong to this task group.`);
    }
    const timestamp = nowIso();
    const handoff = await this.store.writeHandoff(taskId, {
      from_agent_id: fromAgent?.id || null,
      to_agent_id: toAgent.id,
      created_at: timestamp,
      current_goal: input.current_goal || task.title,
      completed_work: input.completed_work || "See prior room transcript events.",
      current_status: input.current_status || task.status,
      blockers: input.blockers || "None recorded.",
      related_refs: input.related_refs || task.related_refs || [],
      assumptions: input.assumptions || "Receiver should trust only visible transcript and linked files/logs.",
      recommended_next_step: input.recommended_next_step || "Confirm handoff, inspect recent events, then continue execution.",
      risks: input.risks || "Context may be incomplete if prior agent output was not routed through the room."
    });

    await this.store.appendEvent(taskId, {
      type: "handoff_note",
      actor: { kind: "agent", id: fromAgent?.id || "orchestrator" },
      content: handoff
    });
    await this.updateTask(taskId, {
      owner_agent_id: toAgent.id,
      participant_agent_ids: Array.from(new Set([...(task.participant_agent_ids || []), toAgent.id]))
    });
    await this.store.appendEvent(taskId, {
      type: "agent_message",
      actor: { kind: "agent", id: toAgent.id },
      content: {
        text: "I confirm the handoff card and will continue from the recorded goal, blockers, assumptions, and next step.",
        handoff_id: handoff.handoff_id
      }
    });
    return handoff;
  }

  async finalizeTask(taskId, input = {}) {
    const task = await this.requireTask(taskId);
    const events = await this.store.readEvents(taskId);
    const report = await this.store.writeReport(taskId, {
      created_at: nowIso(),
      summary:
        input.summary ||
        `Task "${task.title}" completed with ${events.length} auditable room events recorded.`,
      outcome: input.outcome || "done",
      evidence: {
        task_path: path.relative(this.rootDir, this.store.taskPathForTask(task)).replaceAll("\\", "/"),
        events_path: task.room_path,
        event_count: events.length
      },
      next_steps: input.next_steps || []
    });
    await this.store.appendEvent(taskId, {
      type: "final_report",
      actor: { kind: "system", id: "orchestrator" },
      content: report
    });
    await this.updateTask(taskId, { status: "done", playbook_stage: "finalize", claim: null });
    return report;
  }

  async ingestAcpUpdate(taskId, agentId, update) {
    await this.requireTask(taskId);
    const agent = await this.requireAgent(agentId);
    return this.store.appendEvent(taskId, mapAcpUpdateToEvent(update, { agent }));
  }

  async requireTask(taskId) {
    const task = await this.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async requireAgent(agentId) {
    const agent = await this.store.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }
}

module.exports = { Orchestrator };
