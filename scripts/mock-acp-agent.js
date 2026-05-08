#!/usr/bin/env node
const readline = require("node:readline");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const name = arg("name", "acp-worker");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

rl.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: { agent: name, protocol: "acp-mock" } });
    return;
  }

  if (message.method === "newSession") {
    write({ jsonrpc: "2.0", id: message.id, result: { sessionId: `session_${Date.now()}` } });
    write({
      method: "session/update",
      params: {
        update: {
          kind: "session_status",
          status: "ready",
          message: `${name} session ready.`
        }
      }
    });
    return;
  }

  if (message.method === "prompt") {
    write({
      method: "session/update",
      params: {
        update: {
          kind: "agent_message",
          message: `${name}: received prompt and will report through ACP updates.`
        }
      }
    });
    write({
      method: "session/update",
      params: {
        update: {
          kind: "tool_call",
          name: "room_context",
          summary: "Read visible task room context."
        }
      }
    });
    write({
      method: "session/update",
      params: {
        update: {
          kind: "prompt_complete",
          message: "ACP mock prompt completed."
        }
      }
    });
    return;
  }

  if (message.method === "cancel") {
    write({ jsonrpc: "2.0", id: message.id, result: { cancelled: true } });
  }
});
