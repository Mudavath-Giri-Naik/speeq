import {
  type AgentContext,
  type AgentUser,
  createId,
  type LLMMessage,
  type LLMToolCall,
  type LLMToolDefinition,
  type ProtocolEventInput,
  SpeeqError,
  type TurnEndReason,
  type Usage,
} from "@speeq/core";
import type { AuditRecorder } from "../audit/recorder.js";
import { contextPlaceholder } from "../context/run.js";
import type { ResolvedConfig } from "../resolve.js";
import type { TelemetrySink } from "../telemetry/sink.js";
import { executeTool, prepareToolCall, type ToolOutcome } from "./tools.js";
import { checkUiCall, requestUiAction } from "./ui.js";

/** Everything one turn needs. Created per request; nothing survives the request. */
export interface TurnRuntime<TUser extends AgentUser = AgentUser> {
  inputLanguage?: string;
  clarify?: boolean;
  config: ResolvedConfig<TUser>;
  toolDefs: LLMToolDefinition[];
  /** True when this session declared `ui-actions`; only then may UI actions run. */
  uiEnabled?: boolean;
  recorder: AuditRecorder;
  telemetry: TelemetrySink;
  ctx: AgentContext<TUser>;
  turnId: string;
  emit(event: ProtocolEventInput): void;
  /** `performance.now()` at turn start. */
  startedAt: number;
  firstTokenAt?: number;
  usage: Usage;
}

/** Result of {@link runAgentLoop}. */
export interface LoopResult {
  reason: TurnEndReason;
  steps: number;
}

const MAX_STEPS_MESSAGE = "Sorry, I could not finish that within the step limit.";

/**
 * The agent loop: call the model, stream its text, run the tools it asks for, feed results back,
 * and repeat until it answers, asks for confirmation, or reaches `maxSteps`. On the last step the
 * model gets no tools, so it must answer in text.
 */
export async function runAgentLoop<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  messages: LLMMessage[],
): Promise<LoopResult> {
  const { config } = rt;
  for (let step = 0; step < config.maxSteps; step++) {
    let navigated = 0;
    const lastStep = step === config.maxSteps - 1;
    const { text, calls } = await callModel(rt, messages, lastStep ? [] : rt.toolDefs);
    const acted = calls.length > 0 && !lastStep;

    const toolCalls = acted ? calls : undefined;
    const finalText =
      !acted && lastStep && calls.length > 0 && !text.trim() ? MAX_STEPS_MESSAGE : text;
    if (finalText !== text) rt.emit({ type: "assistant.delta", text: finalText });
    if (finalText.trim() || toolCalls) {
      await rt.recorder.record(
        "assistant.message",
        {
          text: finalText,
          ...(toolCalls ? { toolCalls: toolCalls.map(recordCall) } : {}),
        },
        { turnId: rt.turnId },
      );
    }
    if (finalText.trim()) {
      rt.emit({ type: "assistant.message", messageId: createId("msg"), text: finalText });
    }
    messages.push(
      toolCalls
        ? { role: "assistant", content: text, toolCalls }
        : { role: "assistant", content: finalText },
    );

    if (!acted) return { reason: calls.length > 0 ? "max_steps" : "completed", steps: step + 1 };

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i] as LLMToolCall;
      if (rt.clarify && config.tools.get(call.name)?.def.risk === "write") {
        const content = JSON.stringify({ error: "needs_clarification" });
        const outcome: ToolOutcome = {
          kind: "custom",
          ok: false,
          content,
          durationMs: 0,
          truncated: false,
        };
        emitRejected(rt, call, outcome);
        await recordOutcome(rt, call, call.arguments, outcome);
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
        continue;
      }
      if (rt.uiEnabled && config.uiActions.has(call.name)) {
        const check = await checkUiCall(rt, call);
        if (check.status === "emit") {
          await requestUiAction(rt, call, check);
          for (const skipped of calls.slice(i + 1)) await recordSkipped(rt, skipped);
          return { reason: "ui_action_required", steps: step + 1 };
        }
        const outcome: ToolOutcome = {
          kind: "custom",
          ok: false,
          content: check.content,
          truncated: false,
          durationMs: 0,
          ...(check.errorCode ? { errorCode: check.errorCode } : {}),
        };
        emitRejected(rt, call, outcome);
        await recordOutcome(rt, call, call.arguments, outcome);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: check.content,
        });
        continue;
      }
      const prepared = prepareToolCall(config, call);
      if (prepared.status === "needs-confirmation") {
        await requestConfirmation(rt, call, prepared.input, prepared.summary);
        for (const skipped of calls.slice(i + 1)) await recordSkipped(rt, skipped);
        return { reason: "confirmation_required", steps: step + 1 };
      }
      const outcome =
        prepared.status === "rejected"
          ? prepared.outcome
          : await runWithEvents(
              rt,
              call,
              () => executeTool(config, call.name, prepared, rt.ctx),
              prepared.kind,
            );
      if (prepared.status === "rejected") emitRejected(rt, call, outcome);
      await recordOutcome(
        rt,
        call,
        prepared.status === "rejected" ? call.arguments : prepared.input,
        outcome,
      );
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: outcome.content,
      });
      if (call.name === "navigate" && outcome.ok) navigated++;
    }
    // The model already said its line in the same reply as the page change: another model call would
    // only repeat it and add a second of waiting.
    if (navigated === calls.length && text.trim()) return { reason: "completed", steps: step + 1 };
  }
  return { reason: "max_steps", steps: config.maxSteps };
}

async function callModel<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  messages: LLMMessage[],
  tools: LLMToolDefinition[],
): Promise<{ text: string; calls: LLMToolCall[] }> {
  let text = "";
  const calls: LLMToolCall[] = [];
  // A model that goes silent ends the turn with a clear timeout instead of an endless "thinking".
  const silence = new AbortController();
  const limit = rt.config.modelTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => silence.abort(), limit);
  };
  const request = {
    messages,
    tools,
    signal: AbortSignal.any([rt.ctx.signal, silence.signal]),
    ...(rt.config.raw.agent.temperature !== undefined
      ? { temperature: rt.config.raw.agent.temperature }
      : {}),
  };
  const timedOut = () =>
    new SpeeqError("PROVIDER_ERROR", {
      reason: "timeout",
      retryable: true,
      details: { provider: rt.config.raw.llm.kind, timeoutMs: limit, reason: "timeout" },
    });
  arm();
  try {
    for await (const chunk of rt.config.raw.llm.stream(request)) {
      if (silence.signal.aborted) throw timedOut();
      arm();
      if (chunk.type === "text-delta") {
        if (!chunk.text) continue;
        rt.firstTokenAt ??= performance.now();
        text += chunk.text;
        rt.emit({ type: "assistant.delta", text: chunk.text });
      } else if (chunk.type === "tool-call") {
        calls.push(chunk.call);
      } else if (chunk.usage) {
        addUsage(rt.usage, chunk.usage);
      }
    }
  } catch (error) {
    if (silence.signal.aborted && !rt.ctx.signal.aborted) throw timedOut();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (silence.signal.aborted && !rt.ctx.signal.aborted) throw timedOut();
  return { text, calls };
}

function addUsage(total: Usage, add: Usage): void {
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    const v = add[key];
    if (v !== undefined) total[key] = (total[key] ?? 0) + v;
  }
}

function recordCall(call: LLMToolCall) {
  return {
    id: call.id,
    name: call.name,
    args: call.arguments,
    ...(call.providerMetadata ? { providerMetadata: call.providerMetadata } : {}),
  };
}

/** Runs a tool and emits `tool.started` / `tool.finished` around it. */
export async function runWithEvents<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  call: LLMToolCall,
  run: () => Promise<ToolOutcome>,
  kind: ToolOutcome["kind"],
): Promise<ToolOutcome> {
  rt.emit({ type: "tool.started", callId: call.id, name: call.name, kind });
  const outcome = await run();
  rt.emit({
    type: "tool.finished",
    callId: call.id,
    name: call.name,
    ok: outcome.ok,
    durationMs: outcome.durationMs,
    ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
  });
  return outcome;
}

function emitRejected<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  call: LLMToolCall,
  outcome: ToolOutcome,
) {
  rt.emit({ type: "tool.started", callId: call.id, name: call.name, kind: outcome.kind });
  rt.emit({
    type: "tool.finished",
    callId: call.id,
    name: call.name,
    ok: false,
    durationMs: 0,
    ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
  });
}

/** Stores a tool outcome, emits navigation, and counts telemetry. */
export async function recordOutcome<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  call: LLMToolCall,
  args: unknown,
  outcome: ToolOutcome,
): Promise<void> {
  rt.telemetry.toolCall(outcome.kind);
  if (outcome.errorCode) rt.telemetry.error(outcome.errorCode);
  if (outcome.knowledgeSearch) rt.telemetry.knowledgeSearch();
  await rt.recorder.record(
    "tool.called",
    {
      callId: call.id,
      name: call.name,
      kind: outcome.kind,
      args,
      durationMs: outcome.durationMs,
      ok: outcome.ok,
      // Customer context is never stored: history keeps a note, so later turns fetch fresh data.
      result:
        call.name === "get_context" && outcome.ok
          ? contextPlaceholder((args as { source?: unknown } | undefined)?.source)
          : outcome.content,
      truncated: outcome.truncated,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    },
    { turnId: rt.turnId },
  );
  if (outcome.navigation) {
    const { routeId, href, params } = outcome.navigation;
    rt.emit({ type: "navigate", routeId, href, params });
    rt.telemetry.navigation();
    await rt.recorder.record("navigation", { routeId, href, params }, { turnId: rt.turnId });
  }
}

async function requestConfirmation<TUser extends AgentUser>(
  rt: TurnRuntime<TUser>,
  call: LLMToolCall,
  input: unknown,
  summary: string,
): Promise<void> {
  const confirmationId = createId("cnf");
  await rt.recorder.record(
    "confirmation.requested",
    { confirmationId, callId: call.id, toolName: call.name, args: input, summary },
    { turnId: rt.turnId },
  );
  rt.telemetry.confirmation("requested");
  rt.emit({
    type: "confirmation.required",
    confirmationId,
    toolName: call.name,
    summary,
    args: input,
  });
}

async function recordSkipped<TUser extends AgentUser>(rt: TurnRuntime<TUser>, call: LLMToolCall) {
  await rt.recorder.record(
    "tool.called",
    {
      callId: call.id,
      name: call.name,
      kind: "custom",
      args: call.arguments,
      durationMs: 0,
      ok: false,
      errorCode: "CONFIRMATION_REQUIRED",
      result:
        '{"error":{"code":"CONFIRMATION_REQUIRED","message":"Not run: another action is waiting for the user to confirm."}}',
    },
    { turnId: rt.turnId },
  );
}
