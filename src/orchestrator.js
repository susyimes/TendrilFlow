const path = require("node:path");
const { createAdapterSession } = require("./adapters");
const { mapAcpUpdateToEvent } = require("./acpMapping");
const { FileStore } = require("./storage");
const { makeId, normalizeStatus, nowIso } = require("./model");
const { buildCommunicationExecutionProtocol } = require("./protocol");

function quoteShell(value) {
  return `"${String(value || "").replaceAll('"', '\\"')}"`;
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
    return {
      workspaces: await this.store.listWorkspaces(),
      groups: await this.store.listGroups(),
      agents: await this.store.listAgents(),
      tasks: await this.store.listTasks()
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

  async createAgent(input) {
    await this.init();
    return this.store.upsertAgent(input);
  }

  async deleteAgent(agentId) {
    await this.stopAgent(agentId);
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
    const agent = await this.requireAgent(agentId);
    const tasks = await this.store.listTasks();
    const currentTask = agent.current_task_id
      ? tasks.find((task) => task.task_id === agent.current_task_id) || null
      : null;
    return {
      agent,
      session: {
        running: this.sessions.has(agentId),
        status: agent.status,
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

  async startAgent(agentId) {
    const agent = await this.requireAgent(agentId);
    const existing = this.sessions.get(agentId);
    if (existing) {
      await this.store.appendAgentLog(agent, {
        type: "status_change",
        content: { text: "Agent is already running." }
      });
      return this.store.patchAgent(agentId, { status: "running" });
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
    const scopedInput = await this.scopeTaskAgentReferences(input);
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

  async scopeTaskAgentReferences(input) {
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
      participant_agent_ids: participantIds
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

  async taskWithEvents(taskId) {
    const task = await this.requireTask(taskId);
    return {
      task,
      events: await this.store.readEvents(taskId)
    };
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
        skill: command.authority === "host" ? "host_control" : "user_control",
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
        skill: command.authority === "host" ? "host_control" : "user_control",
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
        skill: "host_orchestration",
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

    if (agent.role === "host" && (await this.maybeCreateAgentFromHostCommand(task, agent, message))) {
      return;
    }

    const session = this.sessions.get(agent.id);
    let sent = false;
    if (session) {
      sent = await session.sendMessage(task, await this.buildAgentContextMessage(task, message, agent));
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
      await this.emitRoleResponse(task, agent, message);
    }
  }

  async buildAgentContextMessage(task, message, agent = null) {
    const workspace = await this.store.getWorkspace(task.workspace_id);
    const group = await this.store.getGroup(task.workspace_id, task.group_id);
    const memory = await this.store.readGroupMemory(task.workspace_id, task.group_id);
    const events = await this.store.readEvents(task.task_id).catch(() => []);
    const recentEvents = events.slice(-8).map((event) => {
      const actor = event.actor?.id || event.actor?.kind || "unknown";
      const text = event.content?.text || event.content?.summary || event.content?.title || event.type;
      return `- ${event.type} by ${actor}: ${String(text).slice(0, 240)}`;
    });
    const memorySections = Object.entries(memory)
      .map(([fileName, contents]) => `### ${fileName}\n${String(contents).trim().slice(0, 1200) || "(empty)"}`)
      .join("\n\n");

    return [
      "TendrilFlow task context",
      "",
      `Workspace: ${workspace?.name || task.workspace_id} (${task.workspace_id})`,
      `Workspace root: ${workspace?.root_dir || this.rootDir}`,
      `Group: ${group?.name || task.group_id} (${task.group_id})`,
      `Task: ${task.title}`,
      `Task status: ${task.status}`,
      `Task description: ${task.description || "(none)"}`,
      "",
      buildCommunicationExecutionProtocol(agent || {}),
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
      await this.store.appendEvent(task.task_id, {
        type: "agent_message",
        actor: { kind: "agent", id: agent.id },
        content: {
          text: `I split "${task.title}" into: clarify acceptance criteria, choose owner, execute implementation, request review, then finalize the report.`,
          source: "role_profile"
        }
      });
      await this.store.appendEvent(task.task_id, {
        type: "decision_record",
        actor: { kind: "agent", id: agent.id },
        content: {
          selected_approach: "Keep the task in one visible room and route specialized requests with @mentions.",
          rejected_alternatives: [
            "Create private agent scratchpads",
            "Move the task into an external issue tracker"
          ],
          reason: "The MVP scope requires local task board ownership, visible discussion, and file-backed transcripts.",
          next_owner: task.owner_agent_id || agent.id
        }
      });
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
    return { name, role, provider, mode };
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
        reason: "The group workflow keeps membership explicit and scoped to the current task room.",
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
    await this.updateTask(taskId, { status: "done" });
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
