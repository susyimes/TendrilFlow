const { DEFAULT_GROUP_ID, DEFAULT_WORKSPACE_ID } = require("./model");

const A2A_PROTOCOL_VERSION = "1.0.0";
const A2A_ACTOR = { kind: "user", id: "a2a_client" };

function buildAgentCard(baseUrl) {
  const root = String(baseUrl || "http://127.0.0.1").replace(/\/+$/, "");
  return {
    name: "TendrilFlow",
    description: "Local-first task room and agent collaboration adapter.",
    protocolVersion: A2A_PROTOCOL_VERSION,
    version: "0.1.0",
    url: `${root}/a2a/jsonrpc`,
    preferredTransport: "JSONRPC",
    supportedInterfaces: [
      {
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        tenant: "",
        transport: "JSONRPC",
        url: `${root}/a2a/jsonrpc`
      },
      {
        protocolBinding: "HTTP+JSON",
        protocolVersion: "1.0",
        tenant: "",
        transport: "HTTP+JSON",
        url: `${root}/a2a`
      }
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: []
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [
      {
        id: "tendrilflow.task-room.delegate",
        name: "Delegate to a TendrilFlow task room",
        description: "Create a local TendrilFlow task room, route the message to the room owner, and expose the transcript as an A2A task.",
        tags: ["task-room", "delegation", "local-agents"],
        examples: ["Ask TendrilFlow to delegate a coding task to the group Host Agent."],
        inputModes: ["text"],
        outputModes: ["text"],
        securityRequirements: []
      }
    ],
    signatures: []
  };
}

function jsonRpcSuccess(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: "2.0", id: id ?? null, error };
}

function extractTextPart(part) {
  if (part == null) {
    return "";
  }
  if (typeof part === "string") {
    return part;
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  if (part.content?.$case === "text") {
    return String(part.content.value || "");
  }
  if (part.kind === "text" && part.value) {
    return String(part.value);
  }
  return "";
}

function extractMessageText(message) {
  if (!message) {
    return "";
  }
  if (typeof message === "string") {
    return message;
  }
  if (typeof message.text === "string") {
    return message.text;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts.map(extractTextPart).filter(Boolean).join("\n");
  }
  if (Array.isArray(message.content)) {
    return message.content.map(extractTextPart).filter(Boolean).join("\n");
  }
  return "";
}

function normalizeSendParams(params = {}) {
  const message = params.message || params;
  const metadata = {
    ...(params.metadata || {}),
    ...(message.metadata || {})
  };
  const text = extractMessageText(message).trim();
  return {
    text,
    messageId: message.messageId || message.message_id || params.messageId || params.message_id || null,
    contextId: message.contextId || message.context_id || params.contextId || params.context_id || null,
    workspaceId: metadata.workspace_id || metadata.workspaceId || DEFAULT_WORKSPACE_ID,
    groupId: metadata.group_id || metadata.groupId || DEFAULT_GROUP_ID,
    ownerAgentId: metadata.owner_agent_id || metadata.ownerAgentId || metadata.agent_id || metadata.agentId || null
  };
}

function taskIdFromParams(params = {}) {
  if (typeof params === "string") {
    return params;
  }
  return params.id || params.taskId || params.task_id || params.task?.id || params.task?.task_id || "";
}

function shortTitle(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > 70 ? `${normalized.slice(0, 67)}...` : normalized || "A2A message";
}

async function resolveOwnerAgentId(orchestrator, workspaceId, groupId, requestedAgentId) {
  const agents = (await orchestrator.store.listAgents()).filter(
    (agent) => agent.workspace_id === workspaceId && agent.group_id === groupId
  );
  if (requestedAgentId && agents.some((agent) => agent.id === requestedAgentId)) {
    return requestedAgentId;
  }
  return agents.find((agent) => agent.role === "host")?.id || null;
}

function eventText(event) {
  const content = event?.content || {};
  return (
    content.text ||
    content.summary ||
    content.selected_approach ||
    content.title ||
    content.verdict ||
    JSON.stringify(content)
  );
}

function eventToA2aMessage(event) {
  const text = String(eventText(event) || "").trim();
  if (!text) {
    return null;
  }
  return {
    kind: "message",
    messageId: event.event_id,
    role: event.actor?.kind === "user" ? "ROLE_USER" : "ROLE_AGENT",
    parts: [{ text, mediaType: "text/plain" }],
    metadata: {
      source: "tendrilflow",
      event_type: event.type,
      actor: event.actor || null,
      timestamp: event.timestamp
    }
  };
}

function taskStatusState(task) {
  if (task.a2a_status === "canceled") {
    return "TASK_STATE_CANCELED";
  }
  return (
    {
      todo: "TASK_STATE_SUBMITTED",
      in_progress: "TASK_STATE_WORKING",
      blocked: "TASK_STATE_INPUT_REQUIRED",
      review: "TASK_STATE_WORKING",
      done: "TASK_STATE_COMPLETED",
      failed: "TASK_STATE_FAILED"
    }[task.status] || "TASK_STATE_UNSPECIFIED"
  );
}

function latestReportArtifact(events) {
  const finalReport = [...events].reverse().find((event) => event.type === "final_report");
  if (!finalReport) {
    return null;
  }
  return {
    artifactId: finalReport.event_id,
    name: "final_report",
    parts: [{ text: eventText(finalReport), mediaType: "text/plain" }],
    metadata: {
      source: "tendrilflow",
      event_type: "final_report"
    }
  };
}

function toA2aTask(task, events = []) {
  const history = events.map(eventToA2aMessage).filter(Boolean);
  const artifact = latestReportArtifact(events);
  return {
    kind: "task",
    id: task.task_id,
    contextId: `${task.workspace_id}:${task.group_id}`,
    status: {
      state: taskStatusState(task),
      timestamp: task.updated_at
    },
    history,
    artifacts: artifact ? [artifact] : [],
    metadata: {
      source: "tendrilflow",
      workspace_id: task.workspace_id,
      group_id: task.group_id,
      room_path: task.room_path,
      tendrilflow_status: task.status,
      a2a_status: task.a2a_status || null
    }
  };
}

function sendMessageResponse(task) {
  return { task };
}

async function sendA2aMessage(orchestrator, params = {}) {
  const normalized = normalizeSendParams(params);
  if (!normalized.text) {
    throw new Error("A2A message text is required.");
  }
  const ownerAgentId = await resolveOwnerAgentId(
    orchestrator,
    normalized.workspaceId,
    normalized.groupId,
    normalized.ownerAgentId
  );
  const task = await orchestrator.createTask({
    title: `A2A: ${shortTitle(normalized.text)}`,
    description: [
      "Created from an external A2A message.",
      `A2A message id: ${normalized.messageId || "unknown"}`,
      `A2A context id: ${normalized.contextId || "none"}`
    ].join("\n"),
    workspace_id: normalized.workspaceId,
    group_id: normalized.groupId,
    owner_agent_id: ownerAgentId,
    related_refs: normalized.messageId ? [`a2a-message:${normalized.messageId}`] : []
  });
  await orchestrator.postRoomMessage(task.task_id, normalized.text, A2A_ACTOR);
  return getA2aTask(orchestrator, task.task_id);
}

async function getA2aTask(orchestrator, taskId) {
  const task = await orchestrator.requireTask(taskId);
  const events = await orchestrator.store.readEvents(taskId);
  return toA2aTask(task, events);
}

async function listA2aTasks(orchestrator) {
  const tasks = (await orchestrator.state()).tasks;
  return {
    tasks: await Promise.all(tasks.map((task) => getA2aTask(orchestrator, task.task_id)))
  };
}

async function cancelA2aTask(orchestrator, taskId) {
  const task = await orchestrator.requireTask(taskId);
  if (task.a2a_status !== "canceled" && !["done", "failed"].includes(task.status)) {
    await orchestrator.store.appendEvent(taskId, {
      type: "system_event",
      actor: { kind: "system", id: "a2a_adapter" },
      content: {
        text: "A2A client requested task cancellation.",
        source: "a2a"
      }
    });
    await orchestrator.updateTask(taskId, {
      status: "failed",
      a2a_status: "canceled",
      playbook_stage: "finalize",
      claim: null
    });
  }
  return getA2aTask(orchestrator, taskId);
}

async function handleJsonRpc(orchestrator, envelope) {
  if (Array.isArray(envelope)) {
    return Promise.all(envelope.map((item) => handleJsonRpc(orchestrator, item)));
  }
  if (!envelope || envelope.jsonrpc !== "2.0" || !envelope.method) {
    return jsonRpcError(envelope?.id, -32600, "Invalid JSON-RPC request.");
  }
  const id = envelope.id;
  const method = String(envelope.method);
  try {
    if (["SendMessage", "message/send", "tasks/send"].includes(method)) {
      return jsonRpcSuccess(id, sendMessageResponse(await sendA2aMessage(orchestrator, envelope.params || {})));
    }
    if (["SendStreamingMessage", "message/stream", "tasks/sendSubscribe"].includes(method)) {
      return jsonRpcSuccess(id, sendMessageResponse(await sendA2aMessage(orchestrator, envelope.params || {})));
    }
    if (["GetTask", "tasks/get"].includes(method)) {
      return jsonRpcSuccess(id, await getA2aTask(orchestrator, taskIdFromParams(envelope.params)));
    }
    if (["CancelTask", "tasks/cancel"].includes(method)) {
      return jsonRpcSuccess(id, await cancelA2aTask(orchestrator, taskIdFromParams(envelope.params)));
    }
    return jsonRpcError(id, -32601, `A2A method not found: ${method}`);
  } catch (error) {
    return jsonRpcError(id, -32000, error.message);
  }
}

module.exports = {
  buildAgentCard,
  cancelA2aTask,
  getA2aTask,
  handleJsonRpc,
  listA2aTasks,
  sendA2aMessage
};
