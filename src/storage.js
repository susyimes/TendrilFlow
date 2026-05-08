const fs = require("node:fs/promises");
const path = require("node:path");
const {
  DEFAULT_GROUP_ID,
  DEFAULT_WORKSPACE_ID,
  makeId,
  normalizeMode,
  normalizeRole,
  normalizeStatus,
  nowIso,
  slugify
} = require("./model");
const { redactForStorage } = require("./safety");

const MEMORY_FILES = {
  "MEMORY.md": "# Group Memory\n\n",
  "decisions.md": "# Decisions\n\n",
  "facts.md": "# Facts\n\n",
  "risks.md": "# Risks\n\n"
};

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
    await this.ensureDefaultGroup(DEFAULT_WORKSPACE_ID);
    await this.ensureGroupMemory(DEFAULT_WORKSPACE_ID, DEFAULT_GROUP_ID);
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
      mode: "mock",
      provider: "mock",
      cwd: this.rootDir,
      command: "node scripts/mock-agent.js --role host --name host-agent",
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

  agentsPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "agents.json");
  }

  handoffPolicyPath(workspaceId = DEFAULT_WORKSPACE_ID, groupId = DEFAULT_GROUP_ID) {
    return path.join(this.groupDir(workspaceId, groupId), "handoff_rules.json");
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
        group_id: agent.group_id || location.group_id
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
      const needsHostNormalization =
        agent.id !== "agent_host" || agent.name !== "host-agent" || agent.role !== "host" || legacyCommand;

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
        transport: agent.transport || hostDefault.transport,
        mode: agent.mode || hostDefault.mode,
        provider: agent.provider || hostDefault.provider,
        cwd: agent.cwd || hostDefault.cwd,
        command: legacyCommand ? hostDefault.command : agent.command || hostDefault.command,
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
      if (agents.some((agent) => agent.role === "host")) {
        continue;
      }
      await this.writeJson(agentsPath, [this.hostAgent(group.workspace_id, group.group_id), ...agents]);
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
    await this.ensureDefaultGroup(workspace.workspace_id);
    await this.ensureGroupMemory(workspace.workspace_id, DEFAULT_GROUP_ID);
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
    await this.ensureHandoffPolicy(workspaceId, group.group_id);
    await this.writeJson(this.agentsPath(workspaceId, group.group_id), [this.hostAgent(workspaceId, group.group_id)]);
    return group;
  }

  async readGroupMemory(workspaceId, groupId) {
    await this.ensureGroupMemory(workspaceId, groupId);
    const memory = {};
    for (const fileName of Object.keys(MEMORY_FILES)) {
      memory[fileName] = await fs.readFile(this.groupMemoryPath(workspaceId, groupId, fileName), "utf8");
    }
    return memory;
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
