import type { ConversationEvent, NewSession, SessionSummary } from "./schemas/audit.js";

const PREVIEW_CHARS = 140;

/** Creates an empty {@link SessionSummary} for a new session. For store adapters. */
export function emptySummary(session: NewSession): SessionSummary {
  return {
    id: session.id,
    userId: session.userId,
    tenantId: session.tenantId ?? null,
    language: session.language,
    startedAt: session.startedAt,
    lastEventAt: session.startedAt,
    eventCount: 0,
    turnCount: 0,
    toolCallCount: 0,
    navigationCount: 0,
    errorCount: 0,
  };
}

/**
 * Returns the summary after `event` is applied, without mutating the input. Store adapters use
 * this so every store computes counts the same way.
 */
export function applyEventToSummary(
  summary: SessionSummary,
  event: ConversationEvent,
): SessionSummary {
  const next: SessionSummary = {
    ...summary,
    eventCount: summary.eventCount + 1,
    lastEventAt: event.ts.localeCompare(summary.lastEventAt) > 0 ? event.ts : summary.lastEventAt,
  };
  switch (event.type) {
    case "user.message":
      next.turnCount += 1;
      if (next.preview === undefined) next.preview = event.data.text.slice(0, PREVIEW_CHARS);
      break;
    case "tool.called":
      next.toolCallCount += 1;
      break;
    case "navigation":
      next.navigationCount += 1;
      break;
    case "error":
      next.errorCount += 1;
      break;
    default:
      break;
  }
  return next;
}

/** Encodes a keyset cursor (`startedAt` + `id`) as an opaque URL-safe string. */
export function encodeCursor(startedAt: string, id: string): string {
  return toBase64Url(JSON.stringify([startedAt, id]));
}

/** Decodes a cursor made by {@link encodeCursor}, or returns `null` if it is malformed. */
export function decodeCursor(cursor: string): { startedAt: string; id: string } | null {
  try {
    const value: unknown = JSON.parse(fromBase64Url(cursor));
    if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string") {
      return { startedAt: value[0], id: value[1] };
    }
  } catch {
    // fall through
  }
  return null;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** True if a session (newest-first order) comes after the cursor position. */
export function isAfterCursor(
  session: { startedAt: string; id: string },
  cursor: { startedAt: string; id: string },
): boolean {
  if (session.startedAt !== cursor.startedAt) return session.startedAt < cursor.startedAt;
  return session.id < cursor.id;
}
