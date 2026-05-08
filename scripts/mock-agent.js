#!/usr/bin/env node
const readline = require("node:readline");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const role = arg("role", "work");
const name = arg("name", `${role}-agent`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

console.log(`${name} ready as ${role}.`);

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) {
    return;
  }
  if (role === "host") {
    console.log(`${name}: split request into owner selection, execution, review, and final report.`);
    return;
  }
  if (role === "review") {
    console.log(`${name}: review note recorded. Check transcript persistence, status transitions, and test coverage.`);
    return;
  }
  if (role === "debug") {
    console.log(`${name}: debug note recorded. Inspect latest status and tool summaries before retrying.`);
    return;
  }
  if (role === "observe") {
    console.log(`${name}: observation recorded for the current room state.`);
    return;
  }
  console.log(`${name}: acknowledged "${text.slice(0, 140)}". Plan, progress, and result will stay in the room transcript.`);
});
