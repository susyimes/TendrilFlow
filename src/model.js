const crypto = require("node:crypto");

const TASK_STATUSES = ["todo", "in_progress", "blocked", "review", "done", "failed"];
const AGENT_ROLES = ["work", "observe", "debug", "review", "host"];
const AGENT_MODES = ["mock", "exec", "acp"];
const AGENT_ISOLATION_MODES = ["shared", "worktree"];
const DEFAULT_WORKSPACE_ID = "workspace_main";
const DEFAULT_GROUP_ID = "group_main";
const EVENT_TYPES = [
  "user_message",
  "agent_message",
  "system_event",
  "tool_call_summary",
  "status_change",
  "decision_record",
  "task_graph",
  "handoff_note",
  "review_comment",
  "final_report"
];

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function normalizeRole(role) {
  return AGENT_ROLES.includes(role) ? role : "work";
}

function normalizeMode(mode) {
  return AGENT_MODES.includes(mode) ? mode : "mock";
}

function normalizeIsolationMode(mode) {
  return AGENT_ISOLATION_MODES.includes(mode) ? mode : "shared";
}

function normalizeStatus(status) {
  return TASK_STATUSES.includes(status) ? status : "todo";
}

module.exports = {
  AGENT_ISOLATION_MODES,
  AGENT_MODES,
  AGENT_ROLES,
  DEFAULT_GROUP_ID,
  DEFAULT_WORKSPACE_ID,
  EVENT_TYPES,
  TASK_STATUSES,
  makeId,
  normalizeIsolationMode,
  normalizeMode,
  normalizeRole,
  normalizeStatus,
  nowIso,
  slugify
};
