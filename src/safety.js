const SENSITIVE_KEY_PATTERN =
  /(^|_|\b)(api[_-]?key|access[_-]?key|secret|token|password|passwd|pwd|authorization|cookie|session|private[_-]?key)($|_|\b)/i;

const SECRET_VALUE_PATTERNS = [
  {
    pattern: /(Authorization\s*:\s*(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/giu,
    replacement: "$1[REDACTED]"
  },
  {
    pattern:
      /((?:api[_-]?key|access[_-]?key|secret|token|password|passwd|pwd|authorization|cookie|session)\s*[:=]\s*)(["']?)[^\s"',;]+(\2)/giu,
    replacement: "$1$2[REDACTED]$3"
  },
  {
    pattern: /\b(sk-[A-Za-z0-9_-]{16,})\b/gu,
    replacement: "[REDACTED_SECRET]"
  },
  {
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/gu,
    replacement: "[REDACTED_SECRET]"
  },
  {
    pattern: /-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gu,
    replacement: "[REDACTED_PRIVATE_KEY]"
  }
];

function redactString(value) {
  return SECRET_VALUE_PATTERNS.reduce(
    (next, { pattern, replacement }) => next.replace(pattern, replacement),
    String(value)
  );
}

function redactForStorage(value, depth = 0) {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value !== "object") {
    return value;
  }
  if (depth > 12) {
    return "[REDACTED_DEEP_OBJECT]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForStorage(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactForStorage(entry, depth + 1)
    ])
  );
}

module.exports = {
  redactForStorage,
  redactString
};
