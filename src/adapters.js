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

class LegacyCliSession {
  constructor(agent, callbacks) {
    this.agent = agent;
    this.callbacks = callbacks;
    this.process = null;
    this.currentTaskId = null;
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
      if (line.trim()) {
        this.emitSessionEvent({
          type: channel,
          task_id: this.currentTaskId,
          content: { text: line }
        });
      }
      if (!this.currentTaskId || !line.trim()) {
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
      this.callbacks.onTaskEvent?.(this.currentTaskId, event);
    });
  }

  async sendMessage(task, text) {
    this.currentTaskId = task.task_id;
    const line = `${text.replace(/\r?\n/g, " ")}\n`;
    if (!this.writeLine(line)) {
      return false;
    }
    this.emitSessionEvent({
      type: "stdin",
      task_id: task.task_id,
      content: { text: line.trim() }
    });
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
    await this.waitForSessionReady();
    return this.sendRpc("prompt", {
      sessionId: this.sessionId,
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
  createAdapterSession
};
