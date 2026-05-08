#!/usr/bin/env node
const { spawn } = require("node:child_process");
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
const cwd = arg("cwd", process.env.TENDRILFLOW_CODEX_CWD || process.cwd());
const sandbox = arg("sandbox", process.env.TENDRILFLOW_CODEX_SANDBOX || "workspace-write");
const model = arg("model", process.env.TENDRILFLOW_CODEX_MODEL || "");
const enableSearch = hasFlag("search") || process.env.TENDRILFLOW_CODEX_SEARCH === "1";

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
  execArgs.push(prompt);

  console.log(`${name}: starting codex exec.`);
  await new Promise((resolve) => {
    const child = spawn(codexCommand, execArgs, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    activeChild = child;

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
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
