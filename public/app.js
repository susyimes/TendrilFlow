const i18n = {
  zh: {
    language: "语言",
    refresh: "刷新",
    workspaces: "Workspace",
    workspacesHint: "长期记忆和群组容器",
    workspaceName: "Workspace 名称",
    workspaceNamePlaceholder: "项目工作区",
    createWorkspace: "创建 Workspace",
    selectedWorkspace: "当前 Workspace",
    noWorkspaces: "还没有 workspace",
    groups: "群组",
    groupsHint: "agent 群组",
    groupName: "群组名称",
    groupNamePlaceholder: "功能开发群",
    createGroup: "创建群组",
    groupTasks: "群组任务",
    groupAgents: "群组成员",
    selectedGroup: "当前群组",
    agentsUnit: "成员",
    tasksUnit: "任务",
    noGroups: "还没有群组",
    tasks: "任务",
    tasksHint: "本地任务板",
    taskTitle: "标题",
    taskTitlePlaceholder: "实现一个功能",
    taskDescription: "描述",
    taskDescriptionPlaceholder: "任务目标、验收标准、上下文",
    moreContext: "补充上下文",
    owner: "负责人",
    createTask: "创建任务",
    agentRoom: "Agent Room",
    agentConsole: "Agent Console",
    backToRoom: "返回群组",
    openCurrentTask: "打开当前任务",
    sessionLog: "运行日志",
    launchDetail: "启动信息",
    exitCode: "退出码",
    lastError: "最近错误",
    noAgentSelected: "选择一个 agent 查看运行日志",
    noAgentLogs: "还没有 agent 运行日志",
    viewConsole: "查看",
    mentionHint: "选择群组成员",
    handoffRules: "交接规则",
    defaultHandoffOwner: "默认交接由群主 Skill 定义",
    customHandoffCanvasHint: "这里编辑群主 handoff skill 的连线状态",
    ruleFrom: "从",
    ruleTo: "到",
    ruleTrigger: "触发条件",
    ruleLabel: "规则名称",
    ruleLabelPlaceholder: "阻塞时交给群主",
    ruleDescription: "说明",
    ruleDescriptionPlaceholder: "何时使用这条交接线",
    addRule: "添加规则",
    noCustomRules: "还没有自定义交接规则",
    removeRule: "删除规则",
    trigger_manual: "手动交接",
    trigger_blocked: "阻塞",
    trigger_ready_for_review: "准备审查",
    trigger_owner_change: "负责人变化",
    trigger_done: "完成后",
    status: "状态",
    deleteTask: "删除任务",
    finalReport: "最终报告",
    messagePlaceholder: "@codex-worker 继续执行",
    send: "发送",
    launcher: "Agent Launcher",
    launcherHint: "创建后加入当前群组",
    agentName: "名称",
    role: "角色",
    workingDir: "工作目录",
    useWorkspaceRoot: "使用项目根目录",
    runMode: "运行方式",
    advancedConfig: "高级配置",
    provider: "Provider",
    provider_codex: "Codex",
    provider_gemini: "Gemini",
    provider_kimi: "Kimi",
    provider_mock: "Mock 测试",
    provider_custom: "Custom",
    command: "启动命令",
    commandPlaceholder: "gemini --acp",
    usePresetCommand: "套用推荐命令",
    createAgent: "创建 Agent",
    agents: "Agents",
    agentsHint: "当前群组内启动、停止、删除",
    unassigned: "未分配",
    noAgents: "还没有 agents",
    noTasks: "还没有任务",
    noEvents: "还没有房间事件",
    selectTask: "选择或创建一个任务",
    start: "启动",
    stop: "停止",
    delete: "删除",
    idle: "空闲",
    confirmDeleteAgent: "确定删除这个 agent 吗？",
    confirmDeleteTask: "确定删除这个任务和 transcript 吗？",
    role_work: "执行",
    role_observe: "观察",
    role_debug: "调试",
    role_review: "审查",
    role_host: "群主",
    mode_mock: "模拟",
    mode_exec: "CLI Exec",
    mode_acp: "ACP",
    status_todo: "待办",
    status_in_progress: "进行中",
    status_blocked: "阻塞",
    status_review: "审查",
    status_done: "完成",
    status_failed: "失败",
    status_stopped: "已停止",
    status_running: "运行中",
    roomOwner: "负责人",
    roomPath: "Transcript",
    taskId: "任务 ID",
    currentTask: "当前任务",
    noCurrentTask: "未绑定任务",
    you: "你",
    system: "系统",
    primaryAction: "当前动作",
    startOwner: "启动负责人",
    continueOwner: "继续执行",
    actionPlan: "拆分计划",
    actionReview: "请求审查",
    actionDebug: "排查阻塞",
    next_todo: "创建后先启动负责人，再让负责人继续",
    next_in_progress: "让负责人继续执行，并在房间里沉淀进展",
    next_blocked: "请求排障，整理阻塞证据",
    next_review: "请求审查，处理 review comments",
    next_done: "任务已完成，可查看最终报告",
    next_failed: "请求排障后重试或交接"
  },
  en: {
    language: "Language",
    refresh: "Refresh",
    workspaces: "Workspaces",
    workspacesHint: "Long-term memory and group containers",
    workspaceName: "Workspace Name",
    workspaceNamePlaceholder: "Project workspace",
    createWorkspace: "Create Workspace",
    selectedWorkspace: "Current Workspace",
    noWorkspaces: "No workspaces yet",
    groups: "Groups",
    groupsHint: "Agent groups",
    groupName: "Group Name",
    groupNamePlaceholder: "Feature crew",
    createGroup: "Create Group",
    groupTasks: "Group Tasks",
    groupAgents: "Group Agents",
    selectedGroup: "Current Group",
    agentsUnit: "agents",
    tasksUnit: "tasks",
    noGroups: "No groups yet",
    tasks: "Tasks",
    tasksHint: "Local task board",
    taskTitle: "Title",
    taskTitlePlaceholder: "Implement a feature",
    taskDescription: "Description",
    taskDescriptionPlaceholder: "Goal, acceptance criteria, context",
    moreContext: "Add context",
    owner: "Owner",
    createTask: "Create Task",
    agentRoom: "Agent Room",
    agentConsole: "Agent Console",
    backToRoom: "Back to Group",
    openCurrentTask: "Open Current Task",
    sessionLog: "Session Log",
    launchDetail: "Launch Detail",
    exitCode: "Exit Code",
    lastError: "Last Error",
    noAgentSelected: "Select an agent to inspect its run log",
    noAgentLogs: "No agent run logs yet",
    viewConsole: "View",
    mentionHint: "Select group member",
    handoffRules: "Handoff Rules",
    defaultHandoffOwner: "Default handoff is owned by the Host Agent skill",
    customHandoffCanvasHint: "Edit the Host handoff skill state as agent-to-agent edges",
    ruleFrom: "From",
    ruleTo: "To",
    ruleTrigger: "Trigger",
    ruleLabel: "Rule Name",
    ruleLabelPlaceholder: "Escalate blockers to Host",
    ruleDescription: "Description",
    ruleDescriptionPlaceholder: "When this handoff edge should be used",
    addRule: "Add Rule",
    noCustomRules: "No custom handoff rules yet",
    removeRule: "Delete Rule",
    trigger_manual: "Manual",
    trigger_blocked: "Blocked",
    trigger_ready_for_review: "Ready for review",
    trigger_owner_change: "Owner changes",
    trigger_done: "After done",
    status: "Status",
    deleteTask: "Delete Task",
    finalReport: "Final Report",
    messagePlaceholder: "@codex-worker continue",
    send: "Send",
    launcher: "Agent Launcher",
    launcherHint: "Create into the current group",
    agentName: "Name",
    role: "Role",
    workingDir: "Working Dir",
    useWorkspaceRoot: "Use Workspace Root",
    runMode: "Run Mode",
    advancedConfig: "Advanced Config",
    provider: "Provider",
    provider_codex: "Codex",
    provider_gemini: "Gemini",
    provider_kimi: "Kimi",
    provider_mock: "Mock/Test",
    provider_custom: "Custom",
    command: "Command",
    commandPlaceholder: "gemini --acp",
    usePresetCommand: "Use Preset Command",
    createAgent: "Create Agent",
    agents: "Agents",
    agentsHint: "Start, stop, and delete inside this group",
    unassigned: "Unassigned",
    noAgents: "No agents yet",
    noTasks: "No tasks yet",
    noEvents: "No room events yet",
    selectTask: "Select or create a task",
    start: "Start",
    stop: "Stop",
    delete: "Delete",
    idle: "Idle",
    confirmDeleteAgent: "Delete this agent?",
    confirmDeleteTask: "Delete this task and transcript?",
    role_work: "Work",
    role_observe: "Observe",
    role_debug: "Debug",
    role_review: "Review",
    role_host: "Host",
    mode_mock: "Mock",
    mode_exec: "CLI Exec",
    mode_acp: "ACP",
    status_todo: "Todo",
    status_in_progress: "In progress",
    status_blocked: "Blocked",
    status_review: "Review",
    status_done: "Done",
    status_failed: "Failed",
    status_stopped: "Stopped",
    status_running: "Running",
    roomOwner: "Owner",
    roomPath: "Transcript",
    taskId: "Task ID",
    currentTask: "Current task",
    noCurrentTask: "No current task",
    you: "You",
    system: "System",
    primaryAction: "Current action",
    startOwner: "Start owner",
    continueOwner: "Continue",
    actionPlan: "Plan",
    actionReview: "Review",
    actionDebug: "Debug",
    next_todo: "Start the owner, then continue the task",
    next_in_progress: "Let the owner continue and keep progress in the room",
    next_blocked: "Ask debug to inspect the visible trace",
    next_review: "Request review and resolve comments",
    next_done: "Task is done. Check the final report",
    next_failed: "Ask debug to recover, retry, or hand off"
  }
};

const state = {
  meta: null,
  workspaces: [],
  groups: [],
  agents: [],
  tasks: [],
  selectedWorkspaceId: localStorage.getItem("tendrilflow.workspaceId") || null,
  selectedGroupId: localStorage.getItem("tendrilflow.groupId") || null,
  selectedTaskId: null,
  selectedTask: null,
  events: [],
  handoffRulesOpen: false,
  handoffPolicy: null,
  agentConsoleId: null,
  agentDetail: null,
  agentLogs: [],
  lastRenderedTaskId: null,
  lastRenderedEventId: null,
  lastRenderedAgentId: null,
  lastRenderedAgentLogId: null,
  shouldStickToBottom: true,
  userPinnedHistory: false,
  consoleShouldStickToBottom: true,
  consoleUserPinnedHistory: false,
  mention: {
    active: false,
    query: "",
    start: -1,
    end: -1,
    index: 0,
    candidates: []
  },
  lang: localStorage.getItem("tendrilflow.lang") || "zh"
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const t = (key) => i18n[state.lang]?.[key] || i18n.en[key] || key;
const PROVIDERS = ["codex", "gemini", "kimi", "mock", "custom"];
const HANDOFF_TRIGGERS = ["manual", "blocked", "ready_for_review", "owner_change", "done"];

function syncRouteFromHash() {
  const agentMatch = window.location.hash.match(/^#\/agents\/([^/?#]+)/);
  state.handoffRulesOpen = /^#\/handoff-rules/.test(window.location.hash);
  state.agentConsoleId = state.handoffRulesOpen || !agentMatch ? null : decodeURIComponent(agentMatch[1]);
}

function openAgentConsole(agentId) {
  state.agentConsoleId = agentId;
  state.handoffRulesOpen = false;
  state.consoleShouldStickToBottom = true;
  state.consoleUserPinnedHistory = false;
  window.location.hash = `/agents/${encodeURIComponent(agentId)}`;
}

function openHandoffRules() {
  state.agentConsoleId = null;
  state.handoffRulesOpen = true;
  window.location.hash = "/handoff-rules";
}

function closeAgentConsole() {
  state.agentConsoleId = null;
  state.agentDetail = null;
  state.agentLogs = [];
  state.handoffRulesOpen = false;
  history.pushState("", document.title, window.location.pathname + window.location.search);
  render();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  qs("#languageSelect").value = state.lang;
  qsa("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  qsa("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
}

function agentName(agentId) {
  return state.agents.find((agent) => agent.id === agentId)?.name || agentId || t("unassigned");
}

function currentWorkspace() {
  return state.workspaces.find((workspace) => workspace.workspace_id === state.selectedWorkspaceId) || null;
}

function currentGroup() {
  return workspaceGroups().find((group) => group.group_id === state.selectedGroupId) || null;
}

function groupName(groupId) {
  return state.groups.find((group) => group.group_id === groupId)?.name || groupId || t("selectedGroup");
}

function getAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId) || null;
}

function workspaceGroups() {
  return state.groups.filter((group) => group.workspace_id === state.selectedWorkspaceId);
}

function groupAgents() {
  return state.agents.filter(
    (agent) => agent.workspace_id === state.selectedWorkspaceId && agent.group_id === state.selectedGroupId
  );
}

function groupTasks() {
  return state.tasks.filter(
    (task) => task.workspace_id === state.selectedWorkspaceId && task.group_id === state.selectedGroupId
  );
}

function ownerAgent() {
  return getAgent(state.selectedTask?.owner_agent_id);
}

function labelFor(prefix, value) {
  return t(`${prefix}_${value}`) || value;
}

function statusClass(status) {
  return `status-${String(status || "").replaceAll(" ", "_")}`;
}

async function loadMeta() {
  state.meta = await api("/api/meta");
  qs("#workspacePath").textContent = state.meta.root;
  fillSelect(
    qs('#agentForm select[name="role"]'),
    state.meta.roles.map((role) => [role, labelFor("role", role)])
  );
  fillSelect(
    qs('#agentForm select[name="mode"]'),
    (state.meta.modes || ["mock", "exec", "acp"]).map((mode) => [mode, labelFor("mode", mode)])
  );
  fillSelect(
    qs("#taskStatusSelect"),
    state.meta.statuses.map((status) => [status, labelFor("status", status)])
  );
  fillSelect(
    qs('#agentForm select[name="provider"]'),
    PROVIDERS.map((provider) => [provider, labelFor("provider", provider)])
  );
  const form = qs("#agentForm");
  form.elements.cwd.value = state.meta.root;
  form.elements.mode.value = "mock";
  form.elements.provider.value = "mock";
  form.elements.command.value = recommendedCommand();
}

async function loadState(keepTask = true) {
  const data = await api("/api/state");
  state.workspaces = data.workspaces || [];
  state.groups = data.groups || [];
  state.agents = data.agents;
  state.tasks = data.tasks;
  if (
    !state.selectedWorkspaceId ||
    !state.workspaces.some((workspace) => workspace.workspace_id === state.selectedWorkspaceId)
  ) {
    state.selectedWorkspaceId = state.workspaces[0]?.workspace_id || state.meta?.defaultWorkspaceId || null;
  }
  localStorage.setItem("tendrilflow.workspaceId", state.selectedWorkspaceId || "");

  const visibleGroups = workspaceGroups();
  if (!state.selectedGroupId || !visibleGroups.some((group) => group.group_id === state.selectedGroupId)) {
    state.selectedGroupId = visibleGroups[0]?.group_id || null;
  }
  localStorage.setItem("tendrilflow.groupId", state.selectedGroupId || "");

  const visibleTasks = groupTasks();
  if (!keepTask || !state.selectedTaskId || !visibleTasks.some((task) => task.task_id === state.selectedTaskId)) {
    state.selectedTaskId = visibleTasks[0]?.task_id || null;
  }
  await loadSelectedTask();
  await loadAgentDetail();
  await loadHandoffPolicy();
  render();
}

async function loadSelectedTask() {
  if (!state.selectedTaskId) {
    state.selectedTask = null;
    state.events = [];
    return;
  }
  const data = await api(`/api/tasks/${state.selectedTaskId}`);
  state.selectedTask = data.task;
  state.events = data.events;
}

async function loadAgentDetail() {
  if (!state.agentConsoleId) {
    state.agentDetail = null;
    state.agentLogs = [];
    return;
  }
  const data = await api(`/api/agents/${encodeURIComponent(state.agentConsoleId)}?limit=300`).catch(() => null);
  state.agentDetail = data;
  state.agentLogs = data?.logs || [];
}

async function loadHandoffPolicy() {
  if (!state.selectedWorkspaceId || !state.selectedGroupId) {
    state.handoffPolicy = null;
    return;
  }
  const data = await api(
    `/api/groups/${encodeURIComponent(state.selectedWorkspaceId)}/${encodeURIComponent(state.selectedGroupId)}/handoff-rules`
  ).catch(() => null);
  state.handoffPolicy = data?.policy || null;
}

function fillSelect(select, entries, selected) {
  select.innerHTML = entries
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  if (selected !== undefined) {
    select.value = selected;
  }
}

function render() {
  applyI18n();
  renderMetaSelects();
  renderGroups();
  renderAgentOptions();
  renderTasks();
  renderMainPanel();
  renderAgents();
}

function renderMainPanel() {
  const showRules = Boolean(state.handoffRulesOpen);
  const showConsole = !showRules && Boolean(state.agentConsoleId);
  qs("#taskRoomView").classList.toggle("hidden", showConsole || showRules);
  qs("#agentConsoleView").classList.toggle("hidden", !showConsole);
  qs("#handoffRulesView").classList.toggle("hidden", !showRules);
  if (showConsole) {
    renderAgentConsole();
  } else if (showRules) {
    renderHandoffRules();
  } else {
    renderRoom();
  }
}

function renderMetaSelects() {
  if (!state.meta) {
    return;
  }
  const form = qs("#agentForm");
  const role = form.elements.role.value || "work";
  const mode = form.elements.mode.value || "mock";
  const provider = form.elements.provider.value || "mock";
  const status = qs("#taskStatusSelect").value || state.selectedTask?.status || "todo";
  fillSelect(
    form.elements.role,
    state.meta.roles.map((item) => [item, labelFor("role", item)]),
    role
  );
  fillSelect(
    form.elements.mode,
    (state.meta.modes || ["mock", "exec", "acp"]).map((item) => [item, labelFor("mode", item)]),
    mode
  );
  fillSelect(
    form.elements.provider,
    PROVIDERS.map((item) => [item, labelFor("provider", item)]),
    provider
  );
  fillSelect(
    qs("#taskStatusSelect"),
    state.meta.statuses.map((item) => [item, labelFor("status", item)]),
    status
  );
}

function renderGroups() {
  const container = qs("#groupList");
  const groups = workspaceGroups();
  if (!groups.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("noGroups"))}</div>`;
    return;
  }
  container.innerHTML = groups
    .map((group) => {
      const tasks = state.tasks.filter(
        (task) => task.workspace_id === group.workspace_id && task.group_id === group.group_id
      );
      const agents = state.agents.filter(
        (agent) => agent.workspace_id === group.workspace_id && agent.group_id === group.group_id
      );
      return `
        <article class="group-item ${group.group_id === state.selectedGroupId ? "active" : ""}" data-group-id="${escapeHtml(group.group_id)}">
          <div class="group-main">
            <div class="group-title">${escapeHtml(group.name)}</div>
            <div class="group-meta">${escapeHtml(agents.length)} ${escapeHtml(t("agentsUnit"))} · ${escapeHtml(tasks.length)} ${escapeHtml(t("tasksUnit"))}</div>
          </div>
          <span class="group-badge">${escapeHtml(tasks.filter((task) => task.status !== "done").length)}</span>
        </article>`;
    })
    .join("");
}

function renderAgentOptions() {
  const agents = groupAgents();
  const entries = [["", t("unassigned")], ...agents.map((agent) => [agent.id, `${agent.name} (${labelFor("role", agent.role)})`])];
  const taskOwner = qs('#taskForm select[name="owner_agent_id"]');
  const preferredOwner = agents.some((agent) => agent.id === taskOwner.value) ? taskOwner.value : "";
  fillSelect(taskOwner, entries, preferredOwner);
  fillSelect(qs("#taskOwnerSelect"), entries, state.selectedTask?.owner_agent_id || "");
}

function renderTasks() {
  const container = qs("#taskBoard");
  const tasks = groupTasks();
  const workspace = currentWorkspace();
  const group = currentGroup();
  qs("#groupTaskHint").textContent = group
    ? `${t("selectedWorkspace")}: ${workspace?.name || state.selectedWorkspaceId} · ${t("selectedGroup")}: ${group.name}`
    : t("selectTask");
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("noTasks"))}</div>`;
    return;
  }
  container.innerHTML = tasks
    .map(
      (task) => `
        <article class="task-item ${task.task_id === state.selectedTaskId ? "active" : ""}" data-task-id="${escapeHtml(task.task_id)}">
          <div class="task-main">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">${escapeHtml(agentName(task.owner_agent_id))}</div>
          </div>
          <div class="task-side">
            <span class="status-pill"><span class="status-dot ${statusClass(task.status)}"></span>${escapeHtml(labelFor("status", task.status))}</span>
            <button class="icon-text danger-text" type="button" data-task-delete="${escapeHtml(task.task_id)}">${escapeHtml(t("delete"))}</button>
          </div>
        </article>`
    )
    .join("");
}

function renderRoom() {
  const task = state.selectedTask;
  qs("#roomTitle").textContent = task ? task.title : t("agentRoom");
  qs("#roomMeta").textContent = task
    ? `${t("roomOwner")}: ${agentName(task.owner_agent_id)} · ${t("roomPath")}: ${task.room_path}`
    : t("selectTask");
  qs("#taskStatusSelect").disabled = !task;
  qs("#taskOwnerSelect").disabled = !task;
  qs("#finalReportButton").disabled = !task;
  qs("#deleteTaskButton").disabled = !task;
  qs("#startOwnerButton").disabled = !task || !task.owner_agent_id;
  qs("#ownerContinueButton").disabled = !task || !task.owner_agent_id;
  qs("#taskStatusSelect").value = task?.status || "todo";
  qs("#taskOwnerSelect").value = task?.owner_agent_id || "";
  qs("#nextActionText").textContent = task ? t(`next_${task.status}`) : t("selectTask");
  qs("#focusOwnerText").textContent = task
    ? `${t("owner")}: ${agentName(task.owner_agent_id)}`
    : "";

  qsa(".quick-actions button[data-room-action]").forEach((button) => {
    button.disabled = !task;
  });
  qsa("#messageForm textarea, #messageForm button").forEach((node) => {
    node.disabled = !task;
  });

  const stream = qs("#eventStream");
  const previousTaskId = state.lastRenderedTaskId;
  const previousEventId = state.lastRenderedEventId;
  const nextEventId = state.events.at(-1)?.event_id || null;
  const taskChanged = previousTaskId !== (task?.task_id || null);
  const eventChanged = previousEventId !== nextEventId;
  const oldScrollTop = stream.scrollTop;
  if (!task) {
    stream.innerHTML = `<div class="empty-state">${escapeHtml(t("selectTask"))}</div>`;
    state.lastRenderedTaskId = null;
    state.lastRenderedEventId = null;
    return;
  }
  if (!state.events.length) {
    stream.innerHTML = `<div class="empty-state">${escapeHtml(t("noEvents"))}</div>`;
    state.lastRenderedTaskId = task.task_id;
    state.lastRenderedEventId = null;
    return;
  }
  stream.innerHTML = state.events.map(renderEvent).join("");
  if (taskChanged || state.shouldStickToBottom || (eventChanged && !state.userPinnedHistory)) {
    stream.scrollTop = stream.scrollHeight;
  } else {
    stream.scrollTop = oldScrollTop;
  }
  state.shouldStickToBottom = false;
  state.lastRenderedTaskId = task.task_id;
  state.lastRenderedEventId = nextEventId;
}

function isNearBottom(element) {
  if (!element) {
    return true;
  }
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function renderAgents() {
  const container = qs("#agentList");
  const agents = groupAgents();
  if (!agents.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("noAgents"))}</div>`;
    return;
  }
  container.innerHTML = agents
    .map(
      (agent) => `
        <article class="agent-row ${agent.id === state.agentConsoleId ? "active" : ""}" data-agent-open="${escapeHtml(agent.id)}">
          <div class="agent-summary">
            <div class="agent-name"><span class="status-dot ${statusClass(agent.status)}"></span>${escapeHtml(agent.name)}</div>
            <div class="agent-meta">${escapeHtml(labelFor("role", agent.role))} · ${escapeHtml(labelFor("mode", agent.mode || "mock"))}</div>
            <div class="agent-meta">${escapeHtml(t("currentTask"))}: ${escapeHtml(agent.current_task_id || t("noCurrentTask"))}</div>
            <div class="agent-cwd">${escapeHtml(agent.cwd || "")}</div>
          </div>
          <div class="agent-actions">
            <button type="button" data-agent-start="${escapeHtml(agent.id)}">${escapeHtml(t("start"))}</button>
            <button type="button" class="ghost-button" data-agent-stop="${escapeHtml(agent.id)}">${escapeHtml(t("stop"))}</button>
            <button type="button" class="danger-button" data-agent-delete="${escapeHtml(agent.id)}">${escapeHtml(t("delete"))}</button>
          </div>
        </article>`
    )
    .join("");
}

function renderHandoffRules() {
  const group = currentGroup();
  const agents = groupAgents();
  const policy = state.handoffPolicy;
  const form = qs("#handoffRuleForm");
  const selectedFrom = form.elements.from_agent_id.value || agents[0]?.id || "";
  const selectedTo =
    form.elements.to_agent_id.value ||
    agents.find((agent) => agent.id !== selectedFrom && agent.role === "host")?.id ||
    agents.find((agent) => agent.id !== selectedFrom)?.id ||
    "";

  qs("#handoffRulesTitle").textContent = group ? `${group.name} · ${t("handoffRules")}` : t("handoffRules");
  qs("#handoffRulesMeta").textContent = policy?.default_policy?.description || t("defaultHandoffOwner");
  fillSelect(
    form.elements.from_agent_id,
    agents.map((agent) => [agent.id, `${agent.name} (${labelFor("role", agent.role)})`]),
    selectedFrom
  );
  fillSelect(
    form.elements.to_agent_id,
    agents.map((agent) => [agent.id, `${agent.name} (${labelFor("role", agent.role)})`]),
    selectedTo
  );
  fillSelect(
    form.elements.trigger,
    HANDOFF_TRIGGERS.map((trigger) => [trigger, labelFor("trigger", trigger)]),
    form.elements.trigger.value || "manual"
  );
  form.querySelector('button[type="submit"]').disabled = agents.length < 2;
  qs("#handoffRulesCanvas").innerHTML = renderHandoffCanvas(agents, policy?.rules || []);
  qs("#handoffRuleList").innerHTML = renderHandoffRuleList(policy?.rules || []);
}

function renderHandoffCanvas(agents, rules) {
  if (!agents.length) {
    return `<div class="empty-state">${escapeHtml(t("noAgents"))}</div>`;
  }
  const nodes = handoffCanvasNodes(agents);
  const validRules = rules.filter((rule) => nodes.has(rule.from_agent_id) && nodes.has(rule.to_agent_id));
  const paths = validRules
    .map((rule, index) => {
      const from = nodes.get(rule.from_agent_id);
      const to = nodes.get(rule.to_agent_id);
      const lift = ((index % 3) - 1) * 24;
      const middleX = (from.x + to.x) / 2;
      const d = `M ${from.x} ${from.y} C ${middleX} ${from.y + lift}, ${middleX} ${to.y - lift}, ${to.x} ${to.y}`;
      return `<path d="${escapeHtml(d)}" /><text x="${escapeHtml(middleX)}" y="${escapeHtml((from.y + to.y) / 2 + lift - 8)}">${escapeHtml(labelFor("trigger", rule.trigger || "manual"))}</text>`;
    })
    .join("");
  const nodeCards = [...nodes.values()]
    .map(
      (node) => `
        <div class="canvas-agent-node role-${escapeHtml(node.agent.role)}" style="left:${node.x / 10}%;top:${node.y / 5.2}%">
          <strong>${escapeHtml(node.agent.name)}</strong>
          <span>${escapeHtml(labelFor("role", node.agent.role))}</span>
        </div>`
    )
    .join("");
  return `
    <svg class="handoff-lines" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="handoffArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z"></path>
        </marker>
      </defs>
      ${paths}
    </svg>
    ${nodeCards}`;
}

function handoffCanvasNodes(agents) {
  const ordered = [...agents].sort((a, b) => {
    if (a.role === "host" && b.role !== "host") {
      return -1;
    }
    if (b.role === "host" && a.role !== "host") {
      return 1;
    }
    return String(a.name).localeCompare(String(b.name));
  });
  const host = ordered.find((agent) => agent.role === "host") || ordered[0];
  const others = ordered.filter((agent) => agent.id !== host.id);
  const entries = [[host.id, { agent: host, x: 180, y: 260 }]];
  const centerX = 660;
  const centerY = 260;
  const radiusX = others.length <= 2 ? 190 : 240;
  const radiusY = others.length <= 2 ? 120 : 180;
  others.forEach((agent, index) => {
    const angle = others.length === 1 ? 0 : -Math.PI / 2 + (Math.PI * 2 * index) / others.length;
    entries.push([
      agent.id,
      {
        agent,
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY
      }
    ]);
  });
  return new Map(entries);
}

function renderHandoffRuleList(rules) {
  const agents = new Map(groupAgents().map((agent) => [agent.id, agent]));
  const visibleRules = rules.filter((rule) => agents.has(rule.from_agent_id) && agents.has(rule.to_agent_id));
  if (!visibleRules.length) {
    return `<div class="empty-state">${escapeHtml(t("noCustomRules"))}</div>`;
  }
  return visibleRules
    .map((rule) => {
      const from = agents.get(rule.from_agent_id);
      const to = agents.get(rule.to_agent_id);
      return `
        <article class="handoff-rule-row">
          <div>
            <strong>${escapeHtml(rule.label || labelFor("trigger", rule.trigger || "manual"))}</strong>
            <span>${escapeHtml(from.name)} -> ${escapeHtml(to.name)} · ${escapeHtml(labelFor("trigger", rule.trigger || "manual"))}</span>
            ${rule.description ? `<p>${escapeHtml(rule.description)}</p>` : ""}
          </div>
          <button class="danger-text" type="button" data-rule-delete="${escapeHtml(rule.rule_id)}">${escapeHtml(t("removeRule"))}</button>
        </article>`;
    })
    .join("");
}

function renderAgentConsole() {
  const detail = state.agentDetail;
  const agent = detail?.agent || getAgent(state.agentConsoleId);
  const logs = state.agentLogs || [];
  qs("#consoleTitle").textContent = agent?.name || t("agentConsole");
  qs("#consoleMeta").textContent = agent
    ? `${labelFor("role", agent.role)} · ${labelFor("mode", agent.mode || "mock")} · ${agent.id}`
    : t("noAgentSelected");
  qs("#consoleStartButton").disabled = !agent;
  qs("#consoleStopButton").disabled = !agent;
  qs("#consoleDeleteButton").disabled = !agent;
  qs("#consoleSummary").innerHTML = agent ? renderConsoleSummary(detail, agent) : `<div class="empty-state">${escapeHtml(t("noAgentSelected"))}</div>`;

  const stream = qs("#agentLogStream");
  const previousAgentId = state.lastRenderedAgentId;
  const previousLogId = state.lastRenderedAgentLogId;
  const nextLogId = logs.at(-1)?.event_id || null;
  const agentChanged = previousAgentId !== (agent?.id || null);
  const logChanged = previousLogId !== nextLogId;
  const oldScrollTop = stream.scrollTop;
  if (!logs.length) {
    stream.innerHTML = `<div class="empty-state">${escapeHtml(t("noAgentLogs"))}</div>`;
    state.lastRenderedAgentId = agent?.id || null;
    state.lastRenderedAgentLogId = null;
    return;
  }
  stream.innerHTML = logs.map(renderAgentLog).join("");
  if (agentChanged || state.consoleShouldStickToBottom || (logChanged && !state.consoleUserPinnedHistory)) {
    stream.scrollTop = stream.scrollHeight;
  } else {
    stream.scrollTop = oldScrollTop;
  }
  state.consoleShouldStickToBottom = false;
  state.lastRenderedAgentId = agent?.id || null;
  state.lastRenderedAgentLogId = nextLogId;
}

function renderConsoleSummary(detail, agent) {
  const currentTask = detail?.current_task;
  const taskAction = currentTask
    ? `<button type="button" class="ghost-button" data-console-task="${escapeHtml(currentTask.task_id)}">${escapeHtml(t("openCurrentTask"))}</button>`
    : `<span class="muted-value">${escapeHtml(t("noCurrentTask"))}</span>`;
  const fields = [
    [t("status"), labelFor("status", agent.status || "stopped")],
    [t("role"), labelFor("role", agent.role)],
    [t("runMode"), labelFor("mode", agent.mode || "mock")],
    [t("provider"), agent.provider || ""],
    [t("currentTask"), currentTask?.title || agent.current_task_id || t("noCurrentTask")],
    [t("launchDetail"), detail?.session?.last_launch_detail || ""],
    [t("exitCode"), detail?.session?.last_exit_code ?? ""],
    [t("lastError"), detail?.session?.last_error || ""]
  ];
  return `
    <div class="console-grid">
      ${fields
        .map(([label, value]) => {
          const displayValue = value === null || value === undefined || value === "" ? "-" : value;
          return `
            <div class="console-field">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(displayValue)}</strong>
            </div>`;
        })
        .join("")}
      <div class="console-field console-path">
        <span>${escapeHtml(t("workingDir"))}</span>
        <strong>${escapeHtml(agent.cwd || "-")}</strong>
      </div>
    </div>
    <div class="console-task-action">${taskAction}</div>`;
}

function renderAgentLog(log) {
  const time = formatTime(log.timestamp);
  const task = log.task_id ? `${t("taskId")}: ${log.task_id}` : t("idle");
  return `
    <article class="log-entry log-${escapeHtml(log.type)}">
      <div class="log-meta">
        <span class="event-type">${escapeHtml(log.type)}</span>
        <span>${escapeHtml(time)}</span>
        <span>${escapeHtml(task)}</span>
      </div>
      <div class="log-body">${renderEventContent(log.content)}</div>
    </article>`;
}

function renderEvent(event) {
  const rowClass = eventRowClass(event);
  const actor = actorLabel(event);
  const initials = actorInitials(actor);
  const time = formatTime(event.timestamp);
  if (rowClass.includes("from-system")) {
    const text = event.content?.text || "";
    const details = systemEventDetails(event.content);
    return `
      <article class="${rowClass}">
        <div class="system-message">
          <div class="system-icon">i</div>
          <div class="system-body">
            <div class="system-meta">
              <span class="event-type">${escapeHtml(event.type)}</span>
              <span>${escapeHtml(time)}</span>
            </div>
            ${text ? `<div class="system-text">${escapeHtml(text)}</div>` : ""}
            ${details ? `<div class="system-details">${details}</div>` : ""}
          </div>
        </div>
      </article>`;
  }
  if (rowClass.includes("event-wide")) {
    return `
      <article class="${rowClass}">
        <div class="event-panel">
          <div class="event-panel-header">
            <span class="event-type">${escapeHtml(event.type)}</span>
            <span class="chat-author">${escapeHtml(actor)}</span>
            <span>${escapeHtml(time)}</span>
          </div>
          <div class="event-content">${renderEventContent(event.content)}</div>
        </div>
      </article>`;
  }
  return `
    <article class="${rowClass}">
      ${rowClass.includes("from-user") ? "" : `<div class="chat-avatar">${escapeHtml(initials)}</div>`}
      <div class="chat-message">
        <div class="chat-meta">
          <span class="chat-author">${escapeHtml(actor)}</span>
          <span>${escapeHtml(time)}</span>
          <span class="event-type">${escapeHtml(event.type)}</span>
        </div>
        <div class="chat-bubble">
          <div class="event-content">${renderEventContent(event.content)}</div>
        </div>
      </div>
      ${rowClass.includes("from-user") ? `<div class="chat-avatar user-avatar">${escapeHtml(initials)}</div>` : ""}
    </article>`;
}

function systemEventDetails(content) {
  if (!content || typeof content !== "object") {
    return "";
  }
  const entries = Object.entries(content).filter(([key, value]) => {
    return key !== "text" && value !== null && value !== undefined && value !== "";
  });
  if (!entries.length) {
    return "";
  }
  return entries
    .map(([key, value]) => `<span><strong>${escapeHtml(formatFieldKey(key))}</strong> ${escapeHtml(formatValue(value))}</span>`)
    .join("");
}

function eventRowClass(event) {
  const actorKind = event.actor?.kind;
  const wideTypes = ["tool_call_summary", "decision_record", "handoff_note", "review_comment", "final_report"];
  const classes = ["chat-row", event.type];
  if (event.type === "system_event" || event.type === "status_change") {
    classes.push("from-system");
  } else if (actorKind === "user" || event.type === "user_message") {
    classes.push("from-user");
  } else {
    classes.push("from-agent");
  }
  if (wideTypes.includes(event.type)) {
    classes.push("event-wide");
  }
  return classes.map(escapeHtml).join(" ");
}

function actorLabel(event) {
  if (event.actor?.kind === "user" || event.type === "user_message") {
    return t("you");
  }
  if (event.actor?.kind === "system") {
    return t("system");
  }
  return agentName(event.actor?.id) || event.actor?.id || "agent";
}

function actorInitials(label) {
  const text = String(label || "").trim();
  if (!text) {
    return "A";
  }
  if (/[\u4e00-\u9fff]/.test(text)) {
    return text.slice(0, 2);
  }
  return text
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString(state.lang === "zh" ? "zh-CN" : "en", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderEventContent(content) {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return escapeHtml(content);
  }
  if (content.text) {
    const extra = Object.entries(content)
      .filter(([key]) => !["text", "source"].includes(key))
      .map(([key, value]) => [key, value])
      .filter(([, value]) => value !== null && value !== undefined && value !== "");
    if (!extra.length) {
      return escapeHtml(content.text);
    }
    return `${escapeHtml(content.text)}${renderDefinitionList(extra)}`;
  }
  return renderDefinitionList(Object.entries(content));
}

function renderDefinitionList(entries) {
  return `<dl class="event-fields">${entries
    .map(([key, value]) => `<dt title="${escapeHtml(key)}">${escapeHtml(formatFieldKey(key))}</dt><dd>${formatFieldValue(value)}</dd>`)
    .join("")}</dl>`;
}

function formatFieldKey(key) {
  return String(key || "").replaceAll("_", " ");
}

function formatFieldValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) {
      return "";
    }
    return `<ul>${value.map((item) => `<li>${formatFieldValue(item)}</li>`).join("")}</ul>`;
  }
  if (value && typeof value === "object") {
    return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  return `<span>${escapeHtml(formatValue(value))}</span>`;
}

function formatValue(value) {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return value;
}

function quoteShell(value) {
  return `"${String(value || "").replaceAll('"', '\\"')}"`;
}

function recommendedCommand() {
  const form = qs("#agentForm");
  const name = form.elements.name.value.trim() || "new-agent";
  const role = form.elements.role.value || "work";
  const mode = form.elements.mode.value || "mock";
  const cwd = form.elements.cwd.value || state.meta?.root || ".";
  const provider = (form.elements.provider.value || "").trim().toLowerCase();

  if (mode === "acp") {
    if (provider === "gemini") {
      return "gemini --acp";
    }
    if (provider === "kimi") {
      return "kimi acp";
    }
    if (provider === "custom") {
      return "";
    }
    return `node scripts/mock-acp-agent.js --name ${quoteShell(name)}`;
  }
  if (mode === "exec") {
    if (provider === "custom") {
      return "";
    }
    if (provider === "codex") {
      return `node scripts/codex-agent.js --name ${quoteShell(name)} --mode exec --cwd ${quoteShell(cwd)}`;
    }
    return `node scripts/codex-agent.js --name ${quoteShell(name)} --mode exec --cwd ${quoteShell(cwd)}`;
  }
  return `node scripts/mock-agent.js --role ${role} --name ${quoteShell(name)}`;
}

function syncProviderDefaults() {
  const form = qs("#agentForm");
  const provider = form.elements.provider.value.trim();
  if (provider === "custom") {
    return;
  }
  if (form.elements.mode.value === "acp") {
    if (!["gemini", "kimi", "mock"].includes(provider)) {
      form.elements.provider.value = "gemini";
    }
  } else if (form.elements.mode.value === "exec") {
    if (provider !== "codex") {
      form.elements.provider.value = "codex";
    }
  } else if (provider !== "mock") {
    form.elements.provider.value = "mock";
  }
}

function syncModeForProvider() {
  const form = qs("#agentForm");
  const provider = form.elements.provider.value;
  if (provider === "gemini" || provider === "kimi") {
    form.elements.mode.value = "acp";
  } else if (provider === "codex") {
    form.elements.mode.value = "exec";
  } else if (provider === "mock") {
    form.elements.mode.value = "mock";
  }
}

function syncCommandPreset() {
  const form = qs("#agentForm");
  const command = recommendedCommand();
  if (command || form.elements.provider.value !== "custom") {
    form.elements.command.value = command;
  }
}

function resetLauncherDefaults(form) {
  form.elements.name.value = "new-agent";
  if (form.elements.provider.value === "custom") {
    return;
  }
  if (form.elements.mode.value === "acp") {
    form.elements.provider.value = "gemini";
  } else if (form.elements.mode.value === "exec") {
    form.elements.provider.value = "codex";
  } else if (form.elements.role.value === "work") {
    form.elements.provider.value = "mock";
  } else {
    form.elements.provider.value = "mock";
  }
  syncCommandPreset();
}

async function startAgent(agentId) {
  await api(`/api/agents/${agentId}/start`, { method: "POST", body: "{}" });
  await loadState();
}

async function stopAgent(agentId) {
  await api(`/api/agents/${agentId}/stop`, { method: "POST", body: "{}" });
  await loadState();
}

async function sendRoomMessage(text) {
  if (!state.selectedTaskId || !text.trim()) {
    return;
  }
  await api(`/api/tasks/${state.selectedTaskId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
  state.shouldStickToBottom = true;
  state.userPinnedHistory = false;
  await loadState();
}

function roomActionMessage(action) {
  const owner = ownerAgent();
  const ownerMention = owner ? `@${owner.name}` : "@codex-worker";
  const messages = {
    plan: {
      zh: "@host 帮我拆分这个任务，给出执行顺序和下一步负责人",
      en: "@host Split this task, propose the execution order, and name the next owner"
    },
    review: {
      zh: "@review-agent 请 review 当前变更，指出必须修改的问题和测试缺口",
      en: "@review-agent Review the current changes, required fixes, and test gaps"
    },
    debug: {
      zh: "@debug-agent 基于房间事件和日志排查阻塞原因，并给出恢复步骤",
      en: "@debug-agent Inspect room events and logs, then propose recovery steps"
    },
    continue: {
      zh: `${ownerMention} 继续执行当前任务，只汇报计划、进展、阻塞和结果`,
      en: `${ownerMention} Continue this task and report only the plan, progress, blockers, and result`
    }
  };
  return messages[action]?.[state.lang] || messages[action]?.en || "";
}

function mentionLabelForAgent(agent) {
  return agent.role === "host" ? "群主" : agent.name;
}

function mentionCandidates(query) {
  const normalizedQuery = String(query || "").toLowerCase();
  return groupAgents()
    .map((agent) => ({
      agent,
      mention: mentionLabelForAgent(agent),
      label: agent.name,
      role: labelFor("role", agent.role)
    }))
    .filter((item) => {
      const haystack = [item.mention, item.label, item.agent.id, item.agent.role, item.role]
        .join(" ")
        .toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    })
    .slice(0, 8);
}

function getMentionContext(textarea) {
  const cursor = textarea.selectionStart;
  const text = textarea.value.slice(0, cursor);
  const atIndex = text.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }
  const query = text.slice(atIndex + 1);
  if (/[\s,，.。:：;；!！?？)）\]]/.test(query)) {
    return null;
  }
  return {
    start: atIndex,
    end: cursor,
    query
  };
}

function hideMentionSuggestions() {
  state.mention = {
    active: false,
    query: "",
    start: -1,
    end: -1,
    index: 0,
    candidates: []
  };
  qs("#mentionSuggest").classList.add("hidden");
}

function renderMentionSuggestions(textarea) {
  const context = getMentionContext(textarea);
  if (!context) {
    hideMentionSuggestions();
    return;
  }
  const candidates = mentionCandidates(context.query);
  if (!candidates.length) {
    hideMentionSuggestions();
    return;
  }
  state.mention = {
    active: true,
    query: context.query,
    start: context.start,
    end: context.end,
    index: Math.min(state.mention.index, candidates.length - 1),
    candidates
  };
  const suggest = qs("#mentionSuggest");
  suggest.classList.remove("hidden");
  suggest.innerHTML = `
    <div class="mention-title">${escapeHtml(t("mentionHint"))}</div>
    ${candidates
      .map(
        (item, index) => `
          <button class="mention-item ${index === state.mention.index ? "active" : ""}" type="button" data-mention-index="${index}">
            <span>@${escapeHtml(item.mention)}</span>
            <em>${escapeHtml(item.role)} · ${escapeHtml(item.agent.status || "stopped")}</em>
          </button>`
      )
      .join("")}`;
}

function insertMention(textarea, candidate) {
  const before = textarea.value.slice(0, state.mention.start);
  const after = textarea.value.slice(state.mention.end);
  const insertion = `@${candidate.mention} `;
  textarea.value = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  hideMentionSuggestions();
}

async function deleteAgent(agentId) {
  if (!confirm(t("confirmDeleteAgent"))) {
    return;
  }
  await api(`/api/agents/${agentId}`, { method: "DELETE" });
  await loadState();
}

async function deleteTask(taskId) {
  if (!confirm(t("confirmDeleteTask"))) {
    return;
  }
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (state.selectedTaskId === taskId) {
    state.selectedTaskId = null;
  }
  await loadState(false);
}

async function saveHandoffRules(rules) {
  if (!state.selectedWorkspaceId || !state.selectedGroupId) {
    return;
  }
  await api(
    `/api/groups/${encodeURIComponent(state.selectedWorkspaceId)}/${encodeURIComponent(state.selectedGroupId)}/handoff-rules`,
    {
      method: "PUT",
      body: JSON.stringify({ rules })
    }
  );
  await loadHandoffPolicy();
  render();
}

function bindEvents() {
  qs("#refreshButton").addEventListener("click", () => loadState());
  qs("#languageSelect").addEventListener("change", (event) => {
    state.lang = event.target.value;
    localStorage.setItem("tendrilflow.lang", state.lang);
    render();
  });

  qs("#groupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.workspace_id = state.selectedWorkspaceId;
    const data = await api("/api/groups", { method: "POST", body: JSON.stringify(payload) });
    state.selectedGroupId = data.group.group_id;
    state.selectedTaskId = null;
    localStorage.setItem("tendrilflow.groupId", state.selectedGroupId);
    event.currentTarget.reset();
    await loadState(false);
  });

  qs("#groupList").addEventListener("click", async (event) => {
    const card = event.target.closest("[data-group-id]");
    if (!card) {
      return;
    }
    state.selectedGroupId = card.dataset.groupId;
    state.selectedTaskId = null;
    state.shouldStickToBottom = true;
    state.userPinnedHistory = false;
    localStorage.setItem("tendrilflow.groupId", state.selectedGroupId);
    await loadState(false);
  });

  qs("#useRootButton").addEventListener("click", () => {
    qs('#agentForm input[name="cwd"]').value = state.meta?.root || "";
    syncCommandPreset();
  });
  qs("#commandPresetButton").addEventListener("click", () => {
    syncCommandPreset();
  });
  qsa('#agentForm select[name="role"], #agentForm select[name="mode"]').forEach((node) => {
    node.addEventListener("change", () => {
      syncProviderDefaults();
      syncCommandPreset();
    });
  });
  qs('#agentForm select[name="provider"]').addEventListener("change", () => {
    syncModeForProvider();
    syncCommandPreset();
  });
  qs('#agentForm input[name="cwd"]').addEventListener("change", () => {
    syncCommandPreset();
  });

  qs("#handoffRulesButton").addEventListener("click", () => {
    openHandoffRules();
  });
  qs("#backFromRulesButton").addEventListener("click", () => closeAgentConsole());
  qs("#handoffRuleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const rule = {
      from_agent_id: form.elements.from_agent_id.value,
      to_agent_id: form.elements.to_agent_id.value,
      trigger: form.elements.trigger.value,
      label: form.elements.label.value.trim() || labelFor("trigger", form.elements.trigger.value),
      description: form.elements.description.value.trim()
    };
    if (!rule.from_agent_id || !rule.to_agent_id || rule.from_agent_id === rule.to_agent_id) {
      return;
    }
    await saveHandoffRules([...(state.handoffPolicy?.rules || []), rule]);
    form.elements.label.value = "";
    form.elements.description.value = "";
  });
  qs("#handoffRuleList").addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-rule-delete]");
    if (!remove) {
      return;
    }
    await saveHandoffRules((state.handoffPolicy?.rules || []).filter((rule) => rule.rule_id !== remove.dataset.ruleDelete));
  });

  qs("#agentList").addEventListener("click", async (event) => {
    const start = event.target.closest("[data-agent-start]");
    const stop = event.target.closest("[data-agent-stop]");
    const remove = event.target.closest("[data-agent-delete]");
    if (start) {
      event.stopPropagation();
      await startAgent(start.dataset.agentStart);
      return;
    }
    if (stop) {
      event.stopPropagation();
      await stopAgent(stop.dataset.agentStop);
      return;
    }
    if (remove) {
      event.stopPropagation();
      await deleteAgent(remove.dataset.agentDelete);
      return;
    }
    const card = event.target.closest("[data-agent-open]");
    if (card) {
      openAgentConsole(card.dataset.agentOpen);
    }
  });

  qs("#agentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.workspace_id = state.selectedWorkspaceId;
    payload.group_id = state.selectedGroupId;
    await api("/api/agents", { method: "POST", body: JSON.stringify(payload) });
    resetLauncherDefaults(event.currentTarget);
    await loadState();
  });

  qs("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.workspace_id = state.selectedWorkspaceId;
    payload.group_id = state.selectedGroupId;
    const data = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    state.selectedTaskId = data.task.task_id;
    state.shouldStickToBottom = true;
    state.userPinnedHistory = false;
    event.currentTarget.reset();
    await loadState();
  });

  qs("#taskBoard").addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-task-delete]");
    if (remove) {
      event.stopPropagation();
      await deleteTask(remove.dataset.taskDelete);
      return;
    }
    const card = event.target.closest("[data-task-id]");
    if (!card) {
      return;
    }
    state.selectedTaskId = card.dataset.taskId;
    state.shouldStickToBottom = true;
    state.userPinnedHistory = false;
    await loadSelectedTask();
    render();
  });

  qs("#deleteTaskButton").addEventListener("click", async () => {
    if (state.selectedTaskId) {
      await deleteTask(state.selectedTaskId);
    }
  });

  qs("#taskStatusSelect").addEventListener("change", async (event) => {
    if (!state.selectedTaskId) {
      return;
    }
    await api(`/api/tasks/${state.selectedTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: event.target.value })
    });
    state.shouldStickToBottom = false;
    await loadState();
  });

  qs("#taskOwnerSelect").addEventListener("change", async (event) => {
    if (!state.selectedTaskId) {
      return;
    }
    await api(`/api/tasks/${state.selectedTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ owner_agent_id: event.target.value || null })
    });
    state.shouldStickToBottom = false;
    await loadState();
  });

  qs("#startOwnerButton").addEventListener("click", async () => {
    const owner = ownerAgent();
    if (owner) {
      await startAgent(owner.id);
    }
  });

  qs("#ownerContinueButton").addEventListener("click", async () => {
    await sendRoomMessage(roomActionMessage("continue"));
  });

  qsa(".quick-actions button[data-room-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await sendRoomMessage(roomActionMessage(button.dataset.roomAction));
    });
  });

  qs("#messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedTaskId) {
      return;
    }
    const textarea = qs('#messageForm textarea[name="text"]');
    await sendRoomMessage(textarea.value);
    textarea.value = "";
    hideMentionSuggestions();
  });
  const messageTextarea = qs('#messageForm textarea[name="text"]');
  messageTextarea.addEventListener("input", () => renderMentionSuggestions(messageTextarea));
  messageTextarea.addEventListener("click", () => renderMentionSuggestions(messageTextarea));
  messageTextarea.addEventListener("blur", () => {
    setTimeout(() => hideMentionSuggestions(), 120);
  });
  messageTextarea.addEventListener("keydown", (event) => {
    if (!state.mention.active) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.mention.index = (state.mention.index + 1) % state.mention.candidates.length;
      renderMentionSuggestions(messageTextarea);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.mention.index =
        (state.mention.index - 1 + state.mention.candidates.length) % state.mention.candidates.length;
      renderMentionSuggestions(messageTextarea);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(messageTextarea, state.mention.candidates[state.mention.index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hideMentionSuggestions();
    }
  });
  qs("#mentionSuggest").addEventListener("mousedown", (event) => {
    event.preventDefault();
    const item = event.target.closest("[data-mention-index]");
    if (!item) {
      return;
    }
    insertMention(messageTextarea, state.mention.candidates[Number(item.dataset.mentionIndex)]);
  });

  qs("#finalReportButton").addEventListener("click", async () => {
    if (!state.selectedTaskId) {
      return;
    }
    await api(`/api/tasks/${state.selectedTaskId}/final-report`, {
      method: "POST",
      body: JSON.stringify({})
    });
    state.shouldStickToBottom = true;
    state.userPinnedHistory = false;
    await loadState();
  });

  qs("#eventStream").addEventListener("scroll", (event) => {
    state.userPinnedHistory = !isNearBottom(event.currentTarget);
  });
  qs("#agentLogStream").addEventListener("scroll", (event) => {
    state.consoleUserPinnedHistory = !isNearBottom(event.currentTarget);
  });
  qs("#backToRoomButton").addEventListener("click", () => closeAgentConsole());
  qs("#consoleStartButton").addEventListener("click", async () => {
    if (state.agentConsoleId) {
      await startAgent(state.agentConsoleId);
    }
  });
  qs("#consoleStopButton").addEventListener("click", async () => {
    if (state.agentConsoleId) {
      await stopAgent(state.agentConsoleId);
    }
  });
  qs("#consoleDeleteButton").addEventListener("click", async () => {
    if (!state.agentConsoleId) {
      return;
    }
    const agentId = state.agentConsoleId;
    await deleteAgent(agentId);
    if (state.agentConsoleId === agentId) {
      closeAgentConsole();
    }
  });
  qs("#consoleSummary").addEventListener("click", async (event) => {
    const taskButton = event.target.closest("[data-console-task]");
    if (!taskButton) {
      return;
    }
    state.selectedTaskId = taskButton.dataset.consoleTask;
    state.shouldStickToBottom = true;
    state.userPinnedHistory = false;
    closeAgentConsole();
    await loadSelectedTask();
    render();
  });
  window.addEventListener("hashchange", async () => {
    syncRouteFromHash();
    await loadAgentDetail();
    await loadHandoffPolicy();
    render();
  });
}

async function main() {
  applyI18n();
  bindEvents();
  await loadMeta();
  syncRouteFromHash();
  await loadState(false);
  setInterval(() => loadState().catch(() => undefined), 2500);
}

main().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
