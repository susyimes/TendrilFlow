#!/usr/bin/env node
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const args = process.argv.slice(2);

function arg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const provider = String(arg("provider", "gemini")).trim().toLowerCase();
const name = arg("name", `${provider}-agent`);
const cwd = arg("cwd", process.cwd());
const timeoutMs = Number(arg("timeout-ms", process.env.TENDRILFLOW_PROVIDER_TIMEOUT_MS || 10 * 60 * 1000));

const providerCommand =
  arg(`${provider}-command`) ||
  arg("provider-command") ||
  process.env[`TENDRILFLOW_${provider.toUpperCase()}_COMMAND`] ||
  provider;
let runtimeSessionId =
  arg("session-id") ||
  arg("session") ||
  process.env[`TENDRILFLOW_${provider.toUpperCase()}_SESSION_ID`] ||
  process.env[`TENDRILFLOW_${provider.toUpperCase()}_RESUME`] ||
  "";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const queue = [];
let busy = false;
let activeChild = null;

console.log(`${name} ready as ${provider} CLI adapter (exec).`);

function stopActiveChild() {
  if (activeChild && !activeChild.killed) {
    activeChild.kill();
  }
}

process.on("SIGINT", () => {
  stopActiveChild();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopActiveChild();
  process.exit(143);
});

rl.on("line", (line) => {
  const prompt = line.trim();
  if (!prompt) {
    return;
  }
  queue.push(prompt);
  drainQueue();
});

function drainQueue() {
  if (busy || !queue.length) {
    return;
  }
  const prompt = queue.shift();
  busy = true;
  runPrompt(prompt).finally(() => {
    busy = false;
    drainQueue();
  });
}

function maybePushOption(result, name, value) {
  if (value) {
    result.push(name, value);
  }
}

function quoteCmdArg(value) {
  const text = String(value || "");
  if (text && !/[\s&()^=;!'+,`~|<>"]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "'")}"`;
}

function windowsCommandLine(command, commandArgs) {
  return [command, ...commandArgs].map(quoteCmdArg).join(" ");
}

function geminiBundlePath() {
  if (process.platform !== "win32") {
    return "";
  }
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [
    path.join(appData, "npm", "node_modules", "@google", "gemini-cli", "bundle", "gemini.js"),
    path.join(appData, "npm", "node_modules", "@google", "gemini-cli", "dist", "index.js")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function geminiRootDir() {
  return process.env.TENDRILFLOW_GEMINI_ROOT || path.join(os.homedir(), ".gemini");
}

function firstLine(filePath) {
  const handle = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(handle, buffer, 0, buffer.length, 0);
    const chunk = buffer.subarray(0, bytesRead);
    const newlineIndex = chunk.indexOf(10);
    return chunk.subarray(0, newlineIndex >= 0 ? newlineIndex : chunk.length).toString("utf8");
  } finally {
    fs.closeSync(handle);
  }
}

function geminiSessionPathForId(sessionId) {
  if (!sessionId) {
    return "";
  }
  const tmpDir = path.join(geminiRootDir(), "tmp");
  const stack = [{ dir: tmpDir, depth: 0 }];
  let scanned = 0;
  while (stack.length && scanned < 2000) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 5) {
          stack.push({ dir: candidate, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile() || !/\.jsonl$/i.test(entry.name)) {
        continue;
      }
      scanned += 1;
      let meta = {};
      try {
        meta = JSON.parse(firstLine(candidate) || "{}");
      } catch (_error) {
        meta = {};
      }
      if (meta.sessionId === sessionId) {
        return candidate;
      }
    }
  }
  return "";
}

function providerLaunch(command, commandArgs) {
  const executable = path.basename(String(command || "")).replace(/\.(cmd|bat|exe|ps1)$/i, "").toLowerCase();
  if (process.platform === "win32" && provider === "gemini" && executable === "gemini") {
    const bundle = geminiBundlePath();
    if (bundle) {
      return { file: process.execPath, args: [bundle, ...commandArgs] };
    }
  }
  if (process.platform === "win32") {
    return { file: "cmd.exe", args: ["/d", "/c", windowsCommandLine(command, commandArgs)] };
  }
  return { file: command, args: commandArgs };
}

function claudeProjectDirForCwd(workDir) {
  const projectName = path.resolve(workDir || process.cwd()).replaceAll(":", "-").replace(/[\\/]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", projectName);
}

function claudeSessionPathForId(sessionId) {
  if (!sessionId) {
    return "";
  }
  const filePath = path.join(claudeProjectDirForCwd(cwd), `${sessionId}.jsonl`);
  return fs.existsSync(filePath) ? filePath : "";
}

function providerArgs(prompt) {
  const result = [];
  const model = arg("model", process.env[`TENDRILFLOW_${provider.toUpperCase()}_MODEL`] || "");

  if (provider === "claude") {
    result.push("--print", "--input-format", "text", "--output-format", "text");
    maybePushOption(result, "--name", name);
    if (runtimeSessionId) {
      maybePushOption(result, claudeSessionPathForId(runtimeSessionId) ? "--resume" : "--session-id", runtimeSessionId);
    }
    maybePushOption(result, "--model", model);
    maybePushOption(result, "--permission-mode", arg("permission-mode", process.env.TENDRILFLOW_CLAUDE_PERMISSION_MODE || ""));
    maybePushOption(result, "--tools", arg("tools", process.env.TENDRILFLOW_CLAUDE_TOOLS || ""));
    return result;
  }

  if (provider === "gemini") {
    maybePushOption(result, "--model", model);
    if (runtimeSessionId && geminiSessionPathForId(runtimeSessionId)) {
      maybePushOption(result, "--resume", runtimeSessionId);
    } else {
      maybePushOption(result, "--session-id", runtimeSessionId);
    }
    maybePushOption(result, "--approval-mode", arg("approval-mode", process.env.TENDRILFLOW_GEMINI_APPROVAL_MODE || "plan"));
    if (!hasFlag("no-skip-trust")) {
      result.push("--skip-trust");
    }
    result.push("--output-format", "text", "--prompt", prompt.replace(/\s+/g, " ").trim());
    return result;
  }

  if (provider === "kimi") {
    result.push("--work-dir", cwd);
    maybePushOption(result, "--model", model);
    maybePushOption(result, "--session", runtimeSessionId);
    result.push("--print", "--input-format", "text", "--output-format", "text", "--final-message-only");
    return result;
  }

  result.push(prompt);
  return result;
}

function providerEnv() {
  return {
    ...process.env,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: process.env.TERM || "dumb",
    PYTHONUTF8: process.env.PYTHONUTF8 || "1",
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8"
  };
}

function kimiWorkspaceHash(workDir) {
  return crypto.createHash("md5").update(path.resolve(workDir)).digest("hex");
}

function latestKimiSessionSince(startMs) {
  const workspaceDir = path.join(os.homedir(), ".kimi", "sessions", kimiWorkspaceHash(cwd));
  let entries = [];
  try {
    entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
  } catch (_error) {
    return null;
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sessionDir = path.join(workspaceDir, entry.name);
    const contextPath = path.join(sessionDir, "context.jsonl");
    const statePath = path.join(sessionDir, "state.json");
    let stat = null;
    try {
      stat = fs.statSync(contextPath);
    } catch (_error) {
      try {
        stat = fs.statSync(statePath);
      } catch (_nestedError) {
        stat = null;
      }
    }
    if (stat && stat.mtimeMs >= startMs - 5000) {
      sessions.push({ id: entry.name, mtimeMs: stat.mtimeMs });
    }
  }
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sessions[0] || null;
}

async function runPrompt(prompt) {
  if (!["claude", "gemini", "kimi"].includes(provider)) {
    console.log(`${name}: unsupported provider "${provider}".`);
    return;
  }

  const childArgs = providerArgs(prompt);
  const startedAt = Date.now();
  console.log(`${name}: starting ${provider} headless turn.`);

  await new Promise((resolve) => {
    const launch = providerLaunch(providerCommand, childArgs);
    const child = spawn(launch.file, launch.args, {
      cwd,
      env: providerEnv(),
      shell: false,
      stdio: [provider === "gemini" ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true
    });
    activeChild = child;

    const timer =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            if (!child.killed) {
              child.kill();
            }
            console.error(`${name}: ${provider} turn timed out after ${timeoutMs}ms.`);
          }, timeoutMs)
        : null;

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (activeChild === child) {
        activeChild = null;
      }
      console.error(`${name}: failed to start ${provider}: ${error.message}`);
      resolve();
    });
    child.on("exit", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (activeChild === child) {
        activeChild = null;
      }
      if (code === 0) {
        if (provider === "kimi") {
          const session = runtimeSessionId ? { id: runtimeSessionId } : latestKimiSessionSince(startedAt);
          if (session?.id) {
            runtimeSessionId = session.id;
            console.log(`TENDRILFLOW_PROVIDER_SESSION_ID=${session.id}`);
          }
        } else if (runtimeSessionId) {
          console.log(`TENDRILFLOW_PROVIDER_SESSION_ID=${runtimeSessionId}`);
        }
        console.log(`${name}: ${provider} headless turn completed.`);
      } else {
        console.error(`${name}: ${provider} headless turn exited with code ${code}.`);
      }
      resolve();
    });

    if (child.stdin) {
      child.stdin.end(`${prompt}\n`);
    }
  });
}
