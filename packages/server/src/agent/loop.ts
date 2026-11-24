import {
  type AgentContext,
  type AgentUser,
  createId,
  type LLMMessage,
  type LLMToolCall,
  type LLMToolDefinition,
  type ProtocolEventInput,
  type TurnEndReason,
  type Usage,
} from "@speeq/core";
import type { AuditRecorder } from "../audit/recorder.js";
import type { ResolvedConfig } from "../resolve.js";
import type { TelemetrySink } from "../telemetry/sink.js";
import { executeTool, prepareToolCall, type ToolOutcome } from "./tools.js";

/** Everything one turn needs. Created per request; nothing survives the request. */
export interface TurnRuntime<TUser extends AgentUser = AgentUser> {
  config: ResolvedConfig<TUser>;
  toolDefs: LLMToolDefinition[];
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
    }
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
  const request = {
    messages,
    tools,
    signal: rt.ctx.signal,
    ...(rt.config.raw.agent.temperature !== undefined
      ? { temperature: rt.config.raw.agent.temperature }
      : {}),
  };
  for await (const chunk of rt.config.raw.llm.stream(request)) {
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
      result: outcome.content,
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
