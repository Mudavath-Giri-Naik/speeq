import {
  type AgentContext,
  type AgentUser,
  ConfirmRequestSchema,
  type ConversationEvent,
  type ConversationEventOf,
  combineSignals,
  createId,
  isSpeeqError,
  type LLMMessage,
  type PageContext,
  SpeeqError,
  type TurnEndReason,
  TurnRequestSchema,
  toPublicError,
  toSpeeqError,
} from "@speeq/core";
import { buildHistory } from "../agent/history.js";
import {
  type LoopResult,
  recordOutcome,
  runAgentLoop,
  runWithEvents,
  type TurnRuntime,
} from "../agent/loop.js";
import { buildSystemPrompt } from "../agent/prompt.js";
import { executeTool, prepareToolCall } from "../agent/tools.js";
import { needsClarification } from "../agent/voice-guard.js";
import { AuditRecorder } from "../audit/recorder.js";
import type { Runtime } from "../runtime.js";
import { readJson } from "./http.js";
import { type Emit, sseResponse } from "./sse.js";

const HISTORY_EVENT_WINDOW = 300;

interface TurnSetup<TUser extends AgentUser> {
  rt: Runtime<TUser>;
  request: Request;
  sessionId: string;
  user: TUser | null;
  language: string;
  inputLanguage?: string;
  clarify?: boolean;
  pageContext: PageContext | undefined;
  inputMode: "voice" | "text";
  headers: Record<string, string>;
}

/** `POST /session/:id/turn`: one user message → one SSE stream. */
export async function handleTurn<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.authenticate(request, sessionId);
  rt.limitTurn(request, user?.id ?? null, sessionId);
  const body = await readJson(request, TurnRequestSchema, rt.config.maxRequestBytes);
  if (!rt.config.languages.includes(body.language)) {
    throw new SpeeqError("INVALID_INPUT", {
      message: `Language "${body.language}" is not enabled.`,
    });
  }
  const setup: TurnSetup<TUser> = {
    rt,
    request,
    sessionId,
    user,
    headers,
    language: body.language,
    inputLanguage: body.inputLanguage,
    clarify: needsClarification(body, rt.config.raw.speech?.clarifyBelow),
    pageContext: body.context,
    inputMode: body.inputMode ?? "text",
  };
  return streamTurn(setup, async (turn) => {
    await cancelPendingConfirmations(turn);
    await turn.recorder.record(
      "user.message",
      {
        text: body.text,
        language: body.language,
        inputMode: setup.inputMode,
        ...(body.context ? { context: body.context } : {}),
      },
      { turnId: turn.turnId },
    );
    const messages = await loadMessages(turn, body.text);
    return runAgentLoop(turn, messages);
  });
}

/** `POST /session/:id/confirm`: approve or reject a pending write tool, then resume the agent. */
export async function handleConfirm<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.authenticate(request, sessionId);
  rt.limitTurn(request, user?.id ?? null, sessionId);
  const body = await readJson(request, ConfirmRequestSchema, rt.config.maxRequestBytes);
  const events = await rt.config.raw.store.listEvents(sessionId);
  const pending = events.find(
    (e): e is ConversationEventOf<"confirmation.requested"> =>
      e.type === "confirmation.requested" && e.data.confirmationId === body.confirmationId,
  );
  if (!pending) throw new SpeeqError("NOT_FOUND", { message: "Confirmation not found." });
  if (isResolved(events, body.confirmationId)) {
    throw new SpeeqError("CONFLICT", { message: "This confirmation was already answered." });
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
    inputMode: "text",
  };

  // Claim the confirmation atomically before streaming: the store rejects a second claim with
  // CONFLICT (replay or a race between two requests).
  const recorder = new AuditRecorder(rt.config, rt.config.raw.store, sessionId, user?.id ?? null);
  await recorder.recordStrict(
    "confirmation.resolved",
    { confirmationId: body.confirmationId, approved: body.approved, userId: user?.id ?? null },
    {
      dedupeKey: `confirmation:${body.confirmationId}`,
      ...(pending.turnId ? { turnId: pending.turnId } : {}),
    },
  );
  rt.telemetry.confirmation(body.approved ? "approved" : "rejected");

  return streamTurn(
    setup,
    async (turn) => {
      const call = {
        id: pending.data.callId,
        name: pending.data.toolName,
        arguments: pending.data.args,
      };
      if (body.approved) {
        const prepared = prepareToolCall(rt.config, call);
        const outcome =
          prepared.status === "rejected"
            ? prepared.outcome
            : await runWithEvents(
                turn,
                call,
                () => executeTool(rt.config, call.name, { ...prepared, kind: "custom" }, turn.ctx),
                "custom",
              );
        await recordOutcome(turn, call, pending.data.args, outcome);
      } else {
        await recordOutcome(turn, call, pending.data.args, {
          kind: "custom",
          ok: false,
          content: '{"declined":true,"message":"The user declined this action. It was not run."}',
          truncated: false,
          durationMs: 0,
        });
      }
      const messages = await loadMessages(turn, null);
      return runAgentLoop(turn, messages);
    },
    false,
  );
}

function isResolved(events: ConversationEvent[], confirmationId: string): boolean {
  return events.some(
    (e) => e.type === "confirmation.resolved" && e.data.confirmationId === confirmationId,
  );
}

/** A new user turn supersedes unanswered confirmations: record them as declined. */
async function cancelPendingConfirmations<TUser extends AgentUser>(turn: TurnRuntime<TUser>) {
  const events = await turn.config.raw.store.listEvents(turn.ctx.session.id, {
    limit: HISTORY_EVENT_WINDOW,
    last: true,
  });
  const open = events.filter(
    (e): e is ConversationEventOf<"confirmation.requested"> =>
      e.type === "confirmation.requested" && !isResolved(events, e.data.confirmationId),
  );
  for (const p of open) {
    try {
      await turn.recorder.recordStrict(
        "confirmation.resolved",
        {
          confirmationId: p.data.confirmationId,
          approved: false,
          userId: turn.ctx.user?.id ?? null,
        },
        { dedupeKey: `confirmation:${p.data.confirmationId}`, turnId: turn.turnId },
      );
      await turn.recorder.record(
        "tool.called",
        {
          callId: p.data.callId,
          name: p.data.toolName,
          kind: "custom",
          args: p.data.args,
          durationMs: 0,
          ok: false,
          result: '{"declined":true,"message":"Not run: the user moved on without confirming."}',
        },
        { turnId: turn.turnId },
      );
    } catch (error) {
      if (!isSpeeqError(error) || error.code !== "CONFLICT") throw error;
    }
  }
}

async function loadMessages<TUser extends AgentUser>(
  turn: TurnRuntime<TUser>,
  userText: string | null,
) {
  const { config, ctx } = turn;
  const events = await config.raw.store.listEvents(ctx.session.id, {
    limit: HISTORY_EVENT_WINDOW,
    last: true,
  });
  const history = buildHistory(events, config.historyTurns);
  // If storing the user message failed, still answer it.
  if (userText !== null) {
    const last = history.at(-1);
    if (last?.role !== "user" || last.content !== userText)
      history.push({ role: "user", content: userText });
  }
  const system = buildSystemPrompt(config as never, {
    language: ctx.language,
    inputLanguage: turn.inputLanguage,
    clarify: turn.clarify,
    pageContext: ctx.pageContext,
    hasKnowledge: config.knowledge.length > 0,
  });
  return [{ role: "system", content: system } satisfies LLMMessage, ...history];
}

/** Wraps a turn body in an SSE stream with timing, errors, audit and telemetry. */
function streamTurn<TUser extends AgentUser>(
  setup: TurnSetup<TUser>,
  body: (turn: TurnRuntime<TUser>) => Promise<LoopResult>,
  countTurn = true,
): Response {
  const { rt } = setup;
  const turnId = createId("turn");
  const controller = new AbortController();
  const signal = combineSignals([setup.request.signal, controller.signal]);
  return sseResponse(
    async (emit: Emit) => {
      const ctx: AgentContext<TUser> = {
        user: setup.user,
        session: { id: setup.sessionId },
        request: setup.request,
        signal,
        language: setup.language,
        pageContext: setup.pageContext,
      };
      const turn: TurnRuntime<TUser> = {
        inputLanguage: setup.inputLanguage,
        clarify: setup.clarify,
        config: rt.config,
        toolDefs: rt.toolDefs,
        recorder: new AuditRecorder(
          rt.config,
          rt.config.raw.store,
          setup.sessionId,
          setup.user?.id ?? null,
        ),
        telemetry: rt.telemetry,
        ctx,
        turnId,
        emit,
        startedAt: performance.now(),
        usage: {},
      };
      emit({
        type: "turn.started",
        inputLanguage: setup.inputLanguage,
        sessionId: setup.sessionId,
        language: setup.language,
      });
      let reason: TurnEndReason = "completed";
      let steps = 0;
      try {
        ({ reason, steps } = await body(turn));
      } catch (error) {
        reason = signal.aborted ? "aborted" : "error";
        const e = toSpeeqError(error, "PROVIDER_ERROR");
        if (!isSpeeqError(error)) rt.config.logger.error("turn failed", error);
        if (!signal.aborted) emit({ type: "error", ...toPublicError(e) });
        rt.telemetry.error(e.code);
        await turn.recorder.record("error", { code: e.code, message: e.message }, { turnId });
      }
      const latencyMs = Math.round(performance.now() - turn.startedAt);
      const firstTokenMs =
        turn.firstTokenAt !== undefined
          ? Math.round(turn.firstTokenAt - turn.startedAt)
          : undefined;
      const usage = Object.keys(turn.usage).length > 0 ? turn.usage : undefined;
      const timing = {
        latencyMs,
        ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
        ...(usage ? { usage } : {}),
      };
      await turn.recorder.record("turn.finished", { reason, steps, ...timing }, { turnId });
      emit({ type: "turn.finished", reason, ...timing });
      if (countTurn)
        rt.telemetry.turn({
          language: setup.language,
          inputMode: setup.inputMode,
          latencyMs,
          ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
        });
    },
    {
      turnId,
      controller,
      headers: setup.headers,
      beforeClose: () => {
        const flush = rt.telemetry.flushIfDue();
        if (!flush) return null;
        if (rt.config.raw.waitUntil) {
          rt.background(flush);
          return null;
        }
        return flush;
      },
    },
  );
}
