const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { mapAcpUpdateToEvent } = require("./acpMapping");

function parseEnv(env) {
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

function usesTurnCompletionMarkers(command) {
  return /\b(?:codex-agent|provider-agent)\.js\b/i.test(String(command || ""));
}

function isTurnLifecycleLine(line) {
  const value = String(line || "").trim();
  return (
    /^TENDRILFLOW_PROVIDER_SESSION_ID=\S+$/i.test(value) ||
    /^[^:]+ ready as (?:(?:codex|claude|gemini|kimi)\s+)?CLI adapter \([^)]+\)\.$/i.test(value) ||
    /^[^:]+:\s+starting\s+(?:codex exec|(?:claude|gemini|kimi)\s+headless turn)\.$/i.test(value) ||
    /^[^:]+:\s+(?:codex exec exited with code|(?:claude|gemini|kimi)\s+headless turn (?:completed|exited with code\b))/i.test(value)
  );
}

function isTurnCompletionLine(line) {
  const value = String(line || "").trim();
  return /^[^:]+:\s+(?:codex exec exited with code|(?:claude|gemini|kimi)\s+headless turn (?:completed|exited with code\b))/i.test(value);
}

class LegacyCliSession {
  constructor(agent, callbacks) {
    this.agent = agent;
    this.callbacks = callbacks;
    this.process = null;
    this.currentTaskId = null;
    this.usesTurnQueue = usesTurnCompletionMarkers(agent.command);
    this.activeTurn = null;
    this.pendingTurns = [];
  }

  emitSessionEvent(event) {
    this.callbacks.onSessionEvent?.(this.agent.id, event);
  }

  async start() {
    if (!this.agent.command) {
      this.emitSessionEvent({
        type: "process_started",
        content: {
          text: "No command configured; using internal role responder.",
          internal: true
        }
      });
      return { status: "running", detail: "No command configured; using internal role responder." };
    }

    this.process = spawn(this.agent.command, {
      cwd: this.agent.cwd,
      env: { ...process.env, ...parseEnv(this.agent.env) },
      shell: true,
      windowsHide: true
    });
    this.emitSessionEvent({
      type: "process_started",
      content: {
        text: `Started ${this.agent.command}`,
        command: this.agent.command,
        cwd: this.agent.cwd,
        pid: this.process.pid
      }
    });

    this.process.stdin.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    this.watchStream(this.process.stdout, "stdout");
    this.watchStream(this.process.stderr, "stderr");
    this.process.on("exit", (code) => {
      this.callbacks.onExit?.(this.agent.id, code);
    });
    this.process.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    return { status: "running", detail: `Started ${this.agent.command}` };
  }

  watchStream(stream, channel) {
    const reader = readline.createInterface({ input: stream });
    stream.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    reader.on("line", (line) => {
      const taskId = this.usesTurnQueue ? this.activeTurn?.task_id || null : this.currentTaskId;
      if (line.trim()) {
        this.emitSessionEvent({
          type: channel,
          task_id: taskId,
          content: { text: line }
        });
      }
      if (!line.trim()) {
        return;
      }
      if (this.usesTurnQueue && isTurnLifecycleLine(line)) {
        if (isTurnCompletionLine(line)) {
          this.advanceTurn();
        }
        return;
      }
      if (!taskId) {
        return;
      }
      if (/^TENDRILFLOW_PROVIDER_SESSION_ID=\S+$/i.test(line.trim())) {
        return;
      }
      const event =
        channel === "stderr"
          ? {
              type: "tool_call_summary",
              actor: { kind: "agent", id: this.agent.id },
              content: { title: "stderr", text: line }
            }
          : {
              type: "agent_message",
              actor: { kind: "agent", id: this.agent.id },
              content: { text: line, source: "legacy_cli" }
            };
      this.callbacks.onTaskEvent?.(taskId, event);
    });
  }

  activateNextTurn() {
    if (this.activeTurn || !this.pendingTurns.length) {
      return;
    }
    this.activeTurn = this.pendingTurns.shift();
    this.currentTaskId = this.activeTurn.task_id;
  }

  advanceTurn() {
    this.activeTurn = null;
    this.currentTaskId = null;
    this.activateNextTurn();
  }

  async sendMessage(task, text) {
    if (this.usesTurnQueue) {
      this.pendingTurns.push({ task_id: task.task_id });
      this.activateNextTurn();
    } else {
      this.currentTaskId = task.task_id;
    }
    const line = `${text.replace(/\r?\n/g, " ")}\n`;
    if (!this.writeLine(line)) {
      if (this.usesTurnQueue) {
        const index = this.pendingTurns.findIndex((turn) => turn.task_id === task.task_id);
        if (index >= 0) {
          this.pendingTurns.splice(index, 1);
        } else if (this.activeTurn?.task_id === task.task_id) {
          this.advanceTurn();
        }
      }
      return false;
    }
    this.emitSessionEvent({
      type: "stdin",
      task_id: task.task_id,
      content: { text: line.trim() }
    });
    return true;
  }

  writeSessionLine(line) {
    if (this.usesTurnQueue) {
      this.pendingTurns.push({ task_id: null, session_only: true });
      this.activateNextTurn();
    }
    if (!this.writeLine(line)) {
      if (this.usesTurnQueue && this.activeTurn?.session_only) {
        this.advanceTurn();
      }
      return false;
    }
    return true;
  }

  writeLine(line) {
    if (!this.process || this.process.killed || !this.process.stdin.writable) {
      return false;
    }
    try {
      this.process.stdin.write(line);
      return true;
    } catch (error) {
      this.callbacks.onError?.(this.agent.id, error);
      return false;
    }
  }

  async stop() {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.activeTurn = null;
    this.pendingTurns = [];
    this.currentTaskId = null;
  }
}

class AcpSession {
  constructor(agent, callbacks) {
    this.agent = agent;
    this.callbacks = callbacks;
    this.process = null;
    this.currentTaskId = null;
    this.sessionId = null;
    this.resolveSessionReady = null;
    this.sessionReady = new Promise((resolve) => {
      this.resolveSessionReady = resolve;
    });
    this.nextMessageId = 1;
  }

  emitSessionEvent(event) {
    this.callbacks.onSessionEvent?.(this.agent.id, event);
  }

  async start() {
    if (!this.agent.command) {
      this.emitSessionEvent({
        type: "process_started",
        content: {
          text: "No ACP command configured; adapter mapping endpoint remains available.",
          internal: true
        }
      });
      return { status: "running", detail: "No ACP command configured; adapter mapping endpoint remains available." };
    }

    this.process = spawn(this.agent.command, {
      cwd: this.agent.cwd,
      env: { ...process.env, ...parseEnv(this.agent.env) },
      shell: true,
      windowsHide: true
    });
    this.emitSessionEvent({
      type: "process_started",
      content: {
        text: `Started ACP agent ${this.agent.command}`,
        command: this.agent.command,
        cwd: this.agent.cwd,
        pid: this.process.pid
      }
    });
    this.process.stdin.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    this.watchStdout();
    this.watchStderr();
    this.process.on("exit", (code) => this.callbacks.onExit?.(this.agent.id, code));
    this.process.on("error", (error) => this.callbacks.onError?.(this.agent.id, error));
    this.sendRpc("initialize", {
      client: "TendrilFlow",
      clientVersion: "0.1.0"
    });
    this.sendRpc("newSession", {
      cwd: this.agent.cwd,
      agent: this.agent.name
    });
    return { status: "running", detail: `Started ACP agent ${this.agent.command}` };
  }

  watchStdout() {
    const reader = readline.createInterface({ input: this.process.stdout });
    this.process.stdout.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    reader.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      this.emitSessionEvent({
        type: "stdout",
        task_id: this.currentTaskId,
        content: { text: line }
      });
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        if (this.currentTaskId) {
          this.callbacks.onTaskEvent?.(this.currentTaskId, {
            type: "agent_message",
            actor: { kind: "agent", id: this.agent.id },
            content: { text: line, source: "acp" }
          });
        }
        return;
      }

      const sessionId = payload.result?.sessionId || payload.result?.session_id;
      if (sessionId) {
        this.sessionId = sessionId;
        this.resolveSessionReady?.(sessionId);
      }
      if (this.currentTaskId && (payload.method || payload.update || payload.type || payload.kind)) {
        this.callbacks.onTaskEvent?.(
          this.currentTaskId,
          mapAcpUpdateToEvent(payload, { agent: this.agent })
        );
      }
    });
  }

  watchStderr() {
    const reader = readline.createInterface({ input: this.process.stderr });
    this.process.stderr.on("error", (error) => {
      this.callbacks.onError?.(this.agent.id, error);
    });
    reader.on("line", (line) => {
      if (line.trim()) {
        this.emitSessionEvent({
          type: "stderr",
          task_id: this.currentTaskId,
          content: { text: line }
        });
      }
      if (!this.currentTaskId || !line.trim()) {
        return;
      }
      this.callbacks.onTaskEvent?.(this.currentTaskId, {
        type: "tool_call_summary",
        actor: { kind: "agent", id: this.agent.id },
        content: { title: "ACP stderr", text: line }
      });
    });
  }

  sendRpc(method, params) {
    if (!this.process || this.process.killed || !this.process.stdin.writable) {
      return false;
    }
    const message = {
      jsonrpc: "2.0",
      id: this.nextMessageId++,
      method,
      params
    };
    try {
      this.process.stdin.write(`${JSON.stringify(message)}\n`);
      this.emitSessionEvent({
        type: "stdin",
        task_id: this.currentTaskId,
        content: {
          method,
          text: JSON.stringify(message)
        }
      });
      return true;
    } catch (error) {
      this.callbacks.onError?.(this.agent.id, error);
      return false;
    }
  }

  async sendMessage(task, text) {
    this.currentTaskId = task.task_id;
    const env = parseEnv(this.agent.env);
    const timeoutMs = Number(env.TENDRILFLOW_ACP_SESSION_READY_TIMEOUT_MS || 1500);
    const sessionId = await this.waitForSessionReady(timeoutMs);
    if (!sessionId) {
      this.emitSessionEvent({
        type: "error",
        task_id: task.task_id,
        content: {
          text: "ACP session was not ready; prompt was not sent."
        }
      });
      return false;
    }
    return this.sendRpc("prompt", {
      sessionId,
      prompt: text
    });
  }

  async waitForSessionReady(timeoutMs = 1500) {
    if (this.sessionId || !this.process || this.process.killed) {
      return this.sessionId;
    }
    return Promise.race([
      this.sessionReady,
      new Promise((resolve) => setTimeout(() => resolve(this.sessionId), timeoutMs))
    ]);
  }

  async stop() {
    if (this.process && !this.process.killed) {
      this.sendRpc("cancel", { sessionId: this.sessionId });
      this.process.kill();
    }
  }
}

function createAdapterSession(agent, callbacks) {
  if (agent.transport === "acp") {
    return new AcpSession(agent, callbacks);
  }
  return new LegacyCliSession(agent, callbacks);
}

module.exports = {
  AcpSession,
  LegacyCliSession,
  createAdapterSession,
  parseEnv
};
