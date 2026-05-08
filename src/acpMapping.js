function extractText(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return (
      value.text ||
      value.message ||
      value.content ||
      value.summary ||
      value.title ||
      JSON.stringify(value)
    );
  }
  return String(value);
}

function unwrapAcpUpdate(update) {
  if (update?.method && update?.params) {
    return update.params.update || update.params.sessionUpdate || update.params;
  }
  return update?.update || update;
}

function classifyAcpUpdate(update) {
  const normalized = unwrapAcpUpdate(update) || {};
  const kind = String(
    normalized.kind ||
      normalized.type ||
      normalized.event ||
      normalized.status ||
      normalized.phase ||
      ""
  ).toLowerCase();
  const text = extractText(normalized.text || normalized.message || normalized.content || normalized.delta || normalized);

  if (kind.includes("tool") || kind.includes("terminal") || kind.includes("command")) {
    return {
      type: "tool_call_summary",
      content: {
        title: normalized.title || normalized.name || "ACP tool activity",
        text
      }
    };
  }

  if (kind.includes("plan") || kind.includes("decision")) {
    return {
      type: "decision_record",
      content: {
        selected_approach: text || "ACP plan update",
        rejected_alternatives: [],
        reason: "Converted from ACP planning/session update.",
        next_owner: null
      }
    };
  }

  if (kind.includes("status") || kind.includes("permission") || kind.includes("session")) {
    return {
      type: "status_change",
      content: {
        from: normalized.from || null,
        to: normalized.to || normalized.status || normalized.kind || "updated",
        text
      }
    };
  }

  if (kind.includes("complete") || kind.includes("done") || kind.includes("final")) {
    return {
      type: "final_report",
      content: {
        text: text || "ACP prompt completed."
      }
    };
  }

  if (kind.includes("error") || kind.includes("failure")) {
    return {
      type: "system_event",
      content: {
        severity: "error",
        text: text || "ACP adapter reported an error."
      }
    };
  }

  return {
    type: "agent_message",
    content: {
      text: text || "ACP session update received."
    }
  };
}

function mapAcpUpdateToEvent(update, context) {
  const classified = classifyAcpUpdate(update);
  return {
    type: classified.type,
    actor: {
      kind: "agent",
      id: context.agent?.id || context.agentId || "agent_acp"
    },
    content: {
      ...classified.content,
      source: "acp",
      raw_kind: unwrapAcpUpdate(update)?.kind || unwrapAcpUpdate(update)?.type || update?.method || null
    }
  };
}

module.exports = {
  classifyAcpUpdate,
  mapAcpUpdateToEvent
};
