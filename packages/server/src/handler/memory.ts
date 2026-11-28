import {
  type AgentUser,
  ClearMemoryRequestSchema,
  type ClearMemoryResponse,
  type ClientMemory,
  type ConversationEvent,
  type MemoryScope,
  PROTOCOL_VERSION,
  type SessionMessagesResponse,
  type SessionSummary,
  SpeeqError,
  type TranscriptMessage,
} from "@speeq/core";
import type { Runtime } from "../runtime.js";
import { json, readJson } from "./http.js";

/** The memory scope of a verified user. Never built from anything the browser sent. */
export function memoryScope(user: AgentUser): MemoryScope {
  return { userId: user.id, tenantId: user.tenantId ?? null };
}

/** What the server remembers for this visitor. Everything is off for anonymous visitors. */
export function clientMemory<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  user: TUser | null,
): ClientMemory {
  const m = rt.config.memory;
  const signedIn = user !== null;
  return {
    resume: signedIn && m.mode !== "session",
    clear: signedIn && m.canClear,
    preferences: signedIn && m.mode === "preferences",
  };
}

/**
 * The signed-in user's latest conversation that may be continued, or `null`. The store filter is a
 * hint: the user and tenant are checked again here, so a store that ignores a filter cannot leak.
 */
export async function findResumable<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  user: TUser,
): Promise<SessionSummary | null> {
  const m = rt.config.memory;
  if (m.mode === "session") return null;
  const tenantId = user.tenantId ?? null;
  const cutoff = new Date(Date.now() - m.resumeWithinHours * 3_600_000).toISOString();
  try {
    const page = await rt.config.raw.store.listSessions({
      userId: user.id,
      ...(tenantId ? { tenantId } : {}),
      limit: 10,
    });
    return (
      page.sessions.find(
        (s) =>
          s.userId === user.id &&
          (s.tenantId ?? null) === tenantId &&
          !s.forgottenAt &&
          s.turnCount > 0 &&
          s.lastEventAt >= cutoff,
      ) ?? null
    );
  } catch (error) {
    rt.config.logger.error("could not look up a conversation to continue", error);
    return null;
  }
}

/** Upper bound of events read for a transcript. */
const TRANSCRIPT_EVENT_WINDOW = 1500;

/** User and assistant text of a session, last `turns` user turns. No tool data, no context. */
export function transcript(
  events: readonly ConversationEvent[],
  turns: number,
): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  for (const e of events) {
    if (e.type === "user.message") out.push({ role: "user", text: e.data.text, ts: e.ts });
    else if (e.type === "assistant.message" && e.data.text.trim())
      out.push({ role: "assistant", text: e.data.text, ts: e.ts });
  }
  let seen = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]?.role === "user" && ++seen === turns) return out.slice(i);
  }
  return out;
}

/** `GET /session/:id/messages`: the transcript of the caller's own session. */
export async function handleMessages<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.authenticate(request, sessionId);
  rt.limitIdentity(request, user?.id ?? null);
  const events = await rt.config.raw.store.listEvents(sessionId, {
    limit: TRANSCRIPT_EVENT_WINDOW,
    last: true,
  });
  const body: SessionMessagesResponse = {
    protocolVersion: PROTOCOL_VERSION,
    messages: transcript(events, rt.config.memory.historyTurns),
  };
  return json(body, 200, headers);
}

/**
 * `POST /session/:id/clear-memory`: forgets (or deletes) the signed-in user's conversations and
 * deletes their preferences. Only the verified user's own scope is ever touched.
 */
export async function handleClearMemory<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.authenticate(request, sessionId);
  const store = rt.config.raw.store;
  if (!user)
    throw new SpeeqError("FORBIDDEN", { message: "Only signed-in users have memory to clear." });
  if (!rt.config.memory.canClear || !store.clearScope)
    throw new SpeeqError("FORBIDDEN", { message: "Clearing memory is turned off here." });
  rt.limitSession(request, user.id);
  const body = await readJson(request, ClearMemoryRequestSchema, rt.config.maxRequestBytes);
  const result = await store.clearScope(memoryScope(user), {
    conversations: rt.config.memory.clear,
    preferences: body.preferences !== false && typeof store.getPreferences === "function",
  });
  const response: ClearMemoryResponse = { protocolVersion: PROTOCOL_VERSION, ...result };
  return json(response, 200, headers);
}
