import {
  type AgentUser,
  type ConversationEvent,
  type ConversationEventOf,
  type ConversationStore,
  createId,
  type ErrorCode,
  isSpeeqError,
  type LLMToolCall,
  type LLMToolDefinition,
  safeJsonStringify,
  truncate,
  type UiResultStatus,
} from "@speeq/core";
import type { z } from "zod";
import type { ResolvedConfig } from "../resolve.js";
import type { TurnRuntime } from "./loop.js";
import { errorContent, issues, toParametersSchema } from "./tools.js";

/** Largest `result` (serialised bytes) the server keeps from a UI action. */
export const UI_RESULT_MAX_BYTES = 2048;
/** How many recent events are scanned for limits and open actions. */
export const UI_EVENT_WINDOW = 300;

/** Model-facing definitions of the declared UI actions. Offered only to opted-in sessions. */
export function buildUiToolDefinitions(config: ResolvedConfig): LLMToolDefinition[] {
  return [...config.uiActions.values()].map((def) => {
    const asks = def.confirm ?? def.risk === "write";
    return {
      name: def.name,
      description: `${def.description} (asks the page to do this${asks ? "; the user will be asked to approve" : ""})`,
      parameters: toParametersSchema(def.input as z.ZodType, def.name),
    };
  });
}

/** True when the session was created by a client that declared the `ui-actions` capability. */
export async function sessionHasUiActions(
  store: ConversationStore,
  sessionId: string,
): Promise<boolean> {
  const [first] = await store.listEvents(sessionId, { limit: 1 });
  return (
    first?.type === "session.started" && first.data.capabilities?.includes("ui-actions") === true
  );
}

/** Text the model sees as the tool result for a finished UI action. */
export function uiResultContent(status: UiResultStatus, result?: unknown): string {
  if (status !== "done" || result === undefined) return safeJsonStringify({ status });
  const text = safeJsonStringify(result);
  if (new TextEncoder().encode(text).length > UI_RESULT_MAX_BYTES) {
    return safeJsonStringify({ status, result: { truncated: true } });
  }
  return safeJsonStringify({ status, result });
}

/** True if a `ui.action.requested` has no `ui.action.resolved` yet. */
export function isUiResolved(events: readonly ConversationEvent[], callId: string): boolean {
  return events.some((e) => e.type === "ui.action.resolved" && e.data.callId === callId);
}

/** Outcome of checking a model's call to a UI action. */
export type UiCallCheck =
  | { status: "emit"; input: unknown; summary: string; confirm: boolean }
  | { status: "rejected"; content: string; errorCode?: ErrorCode };

function rejected(error: string, message: string, errorCode?: ErrorCode): UiCallCheck {
  return {
    status: "rejected",
    content: safeJsonStringify({ error, message }),
    ...(errorCode ? { errorCode } : {}),
  };
}

/**
 * Validates a call to a declared UI action and applies the limits. Nothing reaches the page unless
 * this returns `emit`: arguments are checked against the server-side schema, an earlier decline
 * ends UI actions for the user turn, and the per-turn and per-session caps hold.
 */
export async function checkUiCall<TUser extends AgentUser>(
  rt: Pick<TurnRuntime<TUser>, "config" | "ctx">,
  call: LLMToolCall,
): Promise<UiCallCheck> {
  const { config, ctx } = rt;
  const def = config.uiActions.get(call.name);
  if (!def) return rejected("unknown_action", `Unknown action "${call.name}".`);
  const parsed = (def.input as z.ZodType).safeParse(call.arguments);
  if (!parsed.success) {
    return {
      status: "rejected",
      content: errorContent("INVALID_INPUT", issues(parsed.error)),
      errorCode: "INVALID_INPUT",
    };
  }
  const events = await config.raw.store.listEvents(ctx.session.id, {
    limit: UI_EVENT_WINDOW,
    last: true,
  });
  const lastUser = events.findLastIndex((e) => e.type === "user.message");
  const thisTurn = events.slice(lastUser + 1);
  if (thisTurn.some((e) => e.type === "ui.action.resolved" && e.data.status === "declined")) {
    return rejected("declined_earlier", "The user declined an earlier action. Do not ask again.");
  }
  const requested = (list: readonly ConversationEvent[]) =>
    list.filter((e) => e.type === "ui.action.requested").length;
  if (
    requested(thisTurn) >= config.uiActionsPerTurn ||
    requested(events) >= config.uiActionsPerSession
  ) {
    return rejected(
      "limit_reached",
      "Too many page actions. Answer in text instead.",
      "RATE_LIMITED",
    );
  }
  let summary = `Run "${def.name}"?`;
  try {
    const s = def.summary(parsed.data, ctx);
    if (s) summary = truncate(s, 300).text;
  } catch (error) {
    if (!isSpeeqError(error)) config.logger.error(`UI action "${def.name}" summary threw`, error);
  }
  return {
    status: "emit",
    input: parsed.data,
    summary,
    confirm: def.confirm ?? def.risk === "write",
  };
}

/** Records the pending call and tells the client to run it. The stream ends after this. */
export async function requestUiAction<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  call: LLMToolCall,
  check: Extract<UiCallCheck, { status: "emit" }>,
): Promise<void> {
  const callId = createId("uia");
  // Strict: an action whose request was not stored could never be answered.
  await rt.recorder.recordStrict(
    "ui.action.requested",
    {
      callId,
      toolCallId: call.id,
      name: call.name,
      args: check.input,
      summary: check.summary,
      confirm: check.confirm,
    },
    { turnId: rt.turnId },
  );
  rt.emit({
    type: "ui.action",
    callId,
    name: call.name,
    args: check.input,
    summary: check.summary,
    confirm: check.confirm,
  });
}

/** A new user turn supersedes unanswered UI actions: record them as declined. */
export async function cancelPendingUiActions<TUser extends AgentUser>(
  turn: Pick<TurnRuntime<TUser>, "config" | "ctx" | "recorder" | "turnId">,
): Promise<void> {
  if (turn.config.uiActions.size === 0) return;
  const events = await turn.config.raw.store.listEvents(turn.ctx.session.id, {
    limit: UI_EVENT_WINDOW,
    last: true,
  });
  const open = events.filter(
    (e): e is ConversationEventOf<"ui.action.requested"> =>
      e.type === "ui.action.requested" && !isUiResolved(events, e.data.callId),
  );
  for (const p of open) {
    try {
      await turn.recorder.recordStrict(
        "ui.action.resolved",
        {
          callId: p.data.callId,
          status: "declined",
          userId: turn.ctx.user?.id ?? null,
          reason: "superseded",
        },
        { dedupeKey: `ui:${p.data.callId}`, turnId: turn.turnId },
      );
      await turn.recorder.record(
        "tool.called",
        {
          callId: p.data.toolCallId,
          name: p.data.name,
          kind: "custom",
          args: p.data.args,
          durationMs: 0,
          ok: false,
          result: '{"status":"declined","reason":"superseded"}',
        },
        { turnId: turn.turnId },
      );
    } catch (error) {
      if (!isSpeeqError(error) || error.code !== "CONFLICT") throw error;
    }
  }
}
