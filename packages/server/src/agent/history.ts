import type { ConversationEvent, LLMMessage, LLMToolCall } from "@speeq/core";

/**
 * Rebuilds the model conversation from stored audit events, keeping the last `maxTurns` user
 * turns. The store is the only source of history, so this works across serverless instances.
 *
 * It also repairs history the provider would reject: every assistant tool call gets exactly one
 * tool result (a placeholder if the turn was interrupted), and orphan results are dropped.
 */
export function buildHistory(events: readonly ConversationEvent[], maxTurns: number): LLMMessage[] {
  const raw: LLMMessage[] = [];
  for (const e of events) {
    switch (e.type) {
      case "user.message":
        raw.push({ role: "user", content: e.data.text });
        break;
      case "assistant.message": {
        const toolCalls: LLMToolCall[] | undefined = e.data.toolCalls?.map((c) => {
          const call: LLMToolCall = { id: c.id, name: c.name, arguments: c.args };
          if (c.providerMetadata) call.providerMetadata = c.providerMetadata;
          return call;
        });
        raw.push(
          toolCalls?.length
            ? { role: "assistant", content: e.data.text, toolCalls }
            : { role: "assistant", content: e.data.text },
        );
        break;
      }
      case "tool.called":
        raw.push({
          role: "tool",
          toolCallId: e.data.callId,
          name: e.data.name,
          content: e.data.result ?? "",
        });
        break;
      default:
        break;
    }
  }
  return repair(lastTurns(raw, maxTurns));
}

function lastTurns(messages: LLMMessage[], maxTurns: number): LLMMessage[] {
  if (maxTurns <= 0) {
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    return lastUser >= 0 ? messages.slice(lastUser) : [];
  }
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      seen += 1;
      if (seen === maxTurns) return messages.slice(i);
    }
  }
  const first = messages.findIndex((m) => m.role === "user");
  return first >= 0 ? messages.slice(first) : [];
}

function repair(messages: LLMMessage[]): LLMMessage[] {
  const out: LLMMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "tool") continue; // results are attached right after their assistant message
    out.push(m);
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    const results = new Map<string, LLMMessage>();
    let j = i + 1;
    while (j < messages.length && messages[j]?.role === "tool") {
      const t = messages[j];
      if (t?.role === "tool" && !results.has(t.toolCallId)) results.set(t.toolCallId, t);
      j++;
    }
    for (const call of m.toolCalls) {
      out.push(
        results.get(call.id) ?? {
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: '{"error":{"code":"INTERNAL","message":"No result (interrupted)."}}',
        },
      );
    }
    i = j - 1;
  }
  return out;
}
