import {
  type AgentUser,
  type ConversationEventOf,
  SpeeqError,
  UiResultRequestSchema,
} from "@speeq/core";
import { runAgentLoop } from "../agent/loop.js";
import { isUiResolved, uiResultContent } from "../agent/ui.js";
import { AuditRecorder } from "../audit/recorder.js";
import type { Runtime } from "../runtime.js";
import { readJson } from "./http.js";
import { loadMessages, streamTurn, type TurnSetup, uiEnabled } from "./turn.js";

/**
 * `POST /session/:id/ui-result`: the page reports what happened to a UI action. The call is
 * claimed exactly once (store `dedupeKey`), the outcome becomes the tool result, and the agent
 * resumes in this response, like a confirmation.
 */
export async function handleUiResult<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.authenticate(request, sessionId);
  rt.limitTurn(request, user?.id ?? null, sessionId);
  const body = await readJson(request, UiResultRequestSchema, rt.config.maxRequestBytes);
  const events = await rt.config.raw.store.listEvents(sessionId);
  // Unknown ids and ids of other sessions look the same: nothing leaks.
  const pending = events.find(
    (e): e is ConversationEventOf<"ui.action.requested"> =>
      e.type === "ui.action.requested" && e.data.callId === body.callId,
  );
  if (!pending) throw new SpeeqError("NOT_FOUND", { message: "UI action not found." });
  if (isUiResolved(events, body.callId)) {
    throw new SpeeqError("CONFLICT", { message: "This UI action was already answered." });
  }
  const lastUser = events.findLast(
    (e): e is ConversationEventOf<"user.message"> => e.type === "user.message",
  );
  const setup: TurnSetup<TUser> = {
    rt,
    request,
    sessionId,
    user,
    headers,
    language: lastUser?.data.language ?? rt.config.defaultLanguage,
    pageContext: lastUser?.data.context,
    uiEnabled: await uiEnabled(rt, sessionId),
    inputMode: "text",
  };

  // Claim before streaming: the store rejects a second claim with CONFLICT (replay or a race).
  const recorder = new AuditRecorder(rt.config, rt.config.raw.store, sessionId, user?.id ?? null);
  await recorder.recordStrict(
    "ui.action.resolved",
    { callId: body.callId, status: body.status, userId: user?.id ?? null },
    {
      dedupeKey: `ui:${body.callId}`,
      ...(pending.turnId ? { turnId: pending.turnId } : {}),
    },
  );

  const content = uiResultContent(body.status, body.result);
  const elapsed = Date.now() - Date.parse(pending.ts);
  return streamTurn(
    setup,
    async (turn) => {
      await turn.recorder.record(
        "tool.called",
        {
          callId: pending.data.toolCallId,
          name: pending.data.name,
          kind: "custom",
          args: pending.data.args,
          durationMs: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
          ok: body.status === "done",
          result: content,
        },
        { turnId: turn.turnId },
      );
      const messages = await loadMessages(turn, null);
      return runAgentLoop(turn, messages);
    },
    false,
  );
}
