#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const args = process.argv.slice(2);

function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const name = arg("name", "codex-worker");
const mode = arg("mode", process.env.TENDRILFLOW_CODEX_MODE || "mock");
const codexCommand = arg("codex-command", process.env.TENDRILFLOW_CODEX_COMMAND || "codex");
const cwd = process.env.TENDRILFLOW_CODEX_CWD || arg("cwd", process.cwd());
const sandbox = arg("sandbox", process.env.TENDRILFLOW_CODEX_SANDBOX || "workspace-write");
const model = arg("model", process.env.TENDRILFLOW_CODEX_MODEL || "");
const enableSearch = hasFlag("search") || process.env.TENDRILFLOW_CODEX_SEARCH === "1";
const ignoreUserConfig = hasFlag("ignore-user-config") || process.env.TENDRILFLOW_CODEX_IGNORE_USER_CONFIG === "1";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
let busy = false;
const queue = [];
let activeChild = null;

console.log(`${name} ready as Codex CLI adapter (${mode}).`);

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

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
}

function resolveWindowsCommand(command) {
  if (process.platform !== "win32") {
    return { file: command, argsPrefix: [] };
  }
  const raw = String(command || "").trim();
  if (!raw) {
    return { file: command, argsPrefix: [] };
  }
  const hasPath = /[\\/]/u.test(raw);
  const ext = path.extname(raw).toLowerCase();
  if (hasPath && ext === ".exe" && isExecutableFile(raw)) {
    return { file: raw, argsPrefix: [] };
  }
  if (hasPath && [".cmd", ".bat"].includes(ext) && isExecutableFile(raw)) {
    return { file: "cmd.exe", argsPrefix: ["/d", "/c", raw] };
  }
  if (hasPath && isExecutableFile(raw)) {
    return { file: raw, argsPrefix: [] };
  }

  const pathDirs = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const baseNames = ext ? [raw] : [raw, `${raw}.exe`, `${raw}.cmd`, `${raw}.bat`, `${raw}.com`];
  const candidates = [];
  for (const dir of pathDirs) {
    for (const base of baseNames) {
      candidates.push(path.join(dir, base));
    }
  }
  const sorted = candidates.sort((a, b) => {
    const priority = (candidate) => {
      const candidateExt = path.extname(candidate).toLowerCase();
      if (candidateExt === ".exe") return 0;
      if (candidateExt === ".cmd") return 1;
      if (candidateExt === ".bat") return 2;
      if (candidateExt === ".com") return 3;
      return 4;
    };
    return priority(a) - priority(b);
  });
  const found = sorted.find(isExecutableFile);
  if (!found) {
    return { file: raw, argsPrefix: [] };
  }
  const foundExt = path.extname(found).toLowerCase();
  if ([".cmd", ".bat"].includes(foundExt)) {
    return { file: "cmd.exe", argsPrefix: ["/d", "/c", found] };
  }
  return { file: found, argsPrefix: [] };
}

function codexLaunch(command, commandArgs) {
  if (process.platform === "win32") {
    return { file: "cmd.exe", args: ["/d", "/c", windowsCommandLine(command, commandArgs)] };
  }
  const resolved = resolveWindowsCommand(command);
  return { file: resolved.file, args: [...resolved.argsPrefix, ...commandArgs] };
}

function shouldSuppressCodexStderr(line) {
  const text = String(line || "");
  const trimmed = text.trim();
  return (
    /codex_core_plugins|chatgpt\.com\/backend-api\/plugins|challenge-platform|cf_chl|Cloudflare/i.test(text) ||
    /^<\/?(?:html|head|body|div|script|style|meta|svg|path)\b/i.test(trimmed) ||
    /^window\._cf_chl_opt\b/i.test(trimmed)
  );
}

function forwardCodexStderr(stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!shouldSuppressCodexStderr(line)) {
        process.stderr.write(`${line}\n`);
      }
    }
  });
  stream.on("end", () => {
    if (buffer && !shouldSuppressCodexStderr(buffer)) {
      process.stderr.write(buffer);
    }
    buffer = "";
  });
}

async function runPrompt(prompt) {
  if (mode !== "exec") {
    console.log(
      `${name}: Codex CLI dry-run received "${prompt.slice(0, 160)}". Set this agent command to "--mode exec" to run codex exec.`
    );
    return;
  }

  const execArgs = ["exec", "--cd", cwd, "--sandbox", sandbox, "--skip-git-repo-check", "--color", "never"];
  if (model) {
    execArgs.push("--model", model);
  }
  if (enableSearch) {
    execArgs.push("--search");
  }
  if (ignoreUserConfig) {
    execArgs.push("--ignore-user-config");
  }
  execArgs.push("-");

  console.log(`${name}: starting codex exec.`);
  await new Promise((resolve) => {
    const launch = codexLaunch(codexCommand, execArgs);
    const child = spawn(launch.file, launch.args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    activeChild = child;

    child.stdin.end(`${prompt}\n`);
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    forwardCodexStderr(child.stderr);
    child.on("error", (error) => {
      if (activeChild === child) {
        activeChild = null;
      }
      console.error(`${name}: failed to start codex exec: ${error.message}`);
      resolve();
    });
    child.on("exit", (code) => {
      if (activeChild === child) {
        activeChild = null;
      }
      console.log(`${name}: codex exec exited with code ${code}.`);
      resolve();
    });
  });
}
