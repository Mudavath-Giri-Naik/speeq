import type { ProtocolEvent } from "@speeq/core";
import { type PublicError, SpeeqError, toPublicError } from "@speeq/core/errors";
import { createId, SentenceChunker, TypedEmitter } from "@speeq/core/utils";
import { pageContext } from "./context.js";
import { sessions } from "./session.js";
import { SpeechQueue } from "./speech-queue.js";
import { readEvents } from "./stream.js";
import type {
  ChatMessage,
  SpeeqClient,
  SpeeqClientEvents,
  SpeeqClientOptions,
  SpeeqSnapshot,
} from "./types.js";
import { WebSpeechInput } from "./web-speech-input.js";
import { WebSpeechOutput } from "./web-speech-output.js";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/** Creates a headless client. The first turn or confirmation establishes the session. */
export function createSpeeqClient(options: SpeeqClientOptions): SpeeqClient {
  const { input = new WebSpeechInput(), output = new WebSpeechOutput() } = options.speech ?? {};
  const language = options.language ?? options.languages?.[0] ?? "en-IN";
  let snapshot: SpeeqSnapshot = freeze({
    state: "idle",
    language,
    languages: [...(options.languages ?? [language])],
    messages: [],
    interimTranscript: "",
    pendingConfirmation: null,
    error: null,
    activeTools: [],
    support: {
      speechInput: !!input?.supported,
      speechOutput: !!output?.supported,
      voiceForLanguage: null,
    },
    config: null,
    sessionId: null,
  } satisfies SpeeqSnapshot);
  const emitter = new TypedEmitter<{ [K in keyof SpeeqClientEvents]: SpeeqClientEvents[K] }>();
  const speech = new SpeechQueue(output, options.speakReplies !== false);
  let generation = 0;
  let turn: AbortController | undefined;
  let destroyed = false;
  if (snapshot.support.speechOutput) {
    setTimeout(() => {
      if (destroyed || snapshot.language !== language) return;
      void speech.voice(language).then((voiceForLanguage) => {
        if (
          !destroyed &&
          snapshot.language === language &&
          snapshot.support.voiceForLanguage !== voiceForLanguage
        )
          update({ support: { ...snapshot.support, voiceForLanguage } });
      });
    }, 0);
  }
  function update(patch: Partial<SpeeqSnapshot>) {
    const previous = snapshot;
    if (
      Object.entries(patch).every(([key, value]) => previous[key as keyof SpeeqSnapshot] === value)
    )
      return;
    const next = freeze({ ...previous, ...patch });
    snapshot = next;
    emitter.emit("change", next);
    if (snapshot !== next) return;
    if (next.state !== previous.state) emitter.emit("state", next.state);
    if (next.error && next.error !== previous.error) emitter.emit("error", next.error);
  }

  const request = sessions(options, ({ sessionId, config }) => {
    const languages =
      options.languages?.filter((l) => config.languages.includes(l)) ?? config.languages;
    const language = languages.includes(snapshot.language)
      ? snapshot.language
      : config.defaultLanguage;
    update({
      sessionId,
      config,
      languages,
      language,
      support:
        language === snapshot.language
          ? snapshot.support
          : { ...snapshot.support, voiceForLanguage: null },
    });
  });

  function markStreaming(status: "interrupted" | "error") {
    return snapshot.messages.some((m) => m.status === "streaming")
      ? snapshot.messages.map((m) => (m.status === "streaming" ? { ...m, status } : m))
      : snapshot.messages;
  }
  function interrupt(force = false) {
    generation++;
    if (force || turn || speech.pending || snapshot.state === "speaking") speech.cancel();
    turn?.abort();
    turn = undefined;
    if (snapshot.state === "listening") input?.abort();
  }
  function clearActivity() {
    return {
      messages: markStreaming("interrupted"),
      interimTranscript: "",
      error: null,
      activeTools: snapshot.activeTools.length ? [] : snapshot.activeTools,
    };
  }

  async function run(
    user: { text: string; inputMode: "voice" | "text" } | null,
    confirmation?: { confirmationId: string; approved: boolean },
  ) {
    interrupt();
    const controller = new AbortController();
    turn = controller;
    const { signal } = controller;
    const cleared = clearActivity();
    const messages: ChatMessage[] = user
      ? [
          ...cleared.messages,
          { id: createId("msg"), role: "user", status: "done", text: user.text },
        ]
      : cleared.messages;
    let language = snapshot.language;
    update({ ...cleared, messages, pendingConfirmation: null, state: "thinking" });
    let chunker = new SentenceChunker();
    function enqueue(text: string) {
      if (!signal.aborted) void speech.enqueue(text, language, () => update({ state: "speaking" }));
    }
    function fail(error: PublicError) {
      update({ error, messages: markStreaming("error") });
    }
    function handle(e: ProtocolEvent) {
      switch (e.type) {
        case "assistant.delta":
        case "assistant.message": {
          const last = snapshot.messages.at(-1);
          const streaming = last?.status === "streaming";
          const final = e.type === "assistant.message";
          const message: ChatMessage = {
            role: "assistant",
            turnId: e.turnId,
            id: streaming ? last.id : createId("msg"),
            text: streaming && !final ? last.text + e.text : e.text,
            status: final ? "done" : "streaming",
          };
          update({
            messages: [
              ...(streaming ? snapshot.messages.slice(0, -1) : snapshot.messages),
              message,
            ],
          });
          if (final) {
            enqueue(chunker.flush());
            chunker = new SentenceChunker();
          } else for (const sentence of chunker.push(e.text)) enqueue(sentence);
          break;
        }
        case "tool.started":
          update({
            activeTools: [
              ...snapshot.activeTools.filter((t) => t.callId !== e.callId),
              { callId: e.callId, name: e.name },
            ],
          });
          break;
        case "tool.finished":
          update({ activeTools: snapshot.activeTools.filter((t) => t.callId !== e.callId) });
          break;
        case "navigate": {
          const { routeId, href, params } = e;
          const action = { routeId, href, params };
          try {
            options.onNavigate?.(action);
          } catch (error) {
            console.error("[speeq] onNavigate threw", error);
          }
          emitter.emit("navigate", action);
          break;
        }
        case "confirmation.required": {
          const { confirmationId, toolName, summary, args } = e;
          update({ pendingConfirmation: { confirmationId, toolName, summary, args } });
          break;
        }
        case "error": {
          const { code, message, retryable, retryAfterMs } = e;
          fail({ code, message, retryable, ...(retryAfterMs !== undefined && { retryAfterMs }) });
          break;
        }
      }
    }
    try {
      const response = await request(
        user ? "turn" : "confirm",
        language,
        () => {
          if (!snapshot.languages.includes(language))
            language = snapshot.config?.defaultLanguage ?? language;
          return user
            ? { ...user, language, context: pageContext(options.getContext) }
            : confirmation;
        },
        signal,
      );
      for await (const event of readEvents(response, signal)) {
        if (signal.aborted) return;
        handle(event);
        emitter.emit("event", event);
      }
    } catch (error) {
      if (!signal.aborted) fail(toPublicError(error));
    }
    if (signal.aborted) return;
    await speech.drain();
    if (signal.aborted) return;
    turn = undefined;
    update({
      state: snapshot.error ? "error" : speech.pending ? "speaking" : "idle",
      activeTools: snapshot.activeTools.length ? [] : snapshot.activeTools,
    });
  }

  function cancel() {
    if (destroyed) return;
    interrupt(true);
    update({ ...clearActivity(), state: "idle" });
  }
  async function sendText(
    text: string,
    { inputMode = "text" }: { inputMode?: "text" | "voice" } = {},
  ) {
    if (!destroyed && text.trim()) await run({ text: text.trim(), inputMode });
  }
  function startListening() {
    if (destroyed) return;
    interrupt(true);
    if (!input?.supported) {
      update({
        ...clearActivity(),
        state: "error",
        error: {
          code: "NOT_CONFIGURED",
          message: "Voice input is not supported in this browser. Please type instead.",
          retryable: false,
        },
      });
      return;
    }
    const id = generation;
    const listening = () => generation === id && snapshot.state === "listening";
    update({ ...clearActivity(), state: "listening" });
    if (!listening()) return;
    input.start(
      { language: snapshot.language, interimResults: true },
      {
        onInterim(text) {
          if (listening()) update({ interimTranscript: text });
        },
        onFinal(text) {
          if (!listening()) return;
          if (options.autoSendOnFinal === false || !text.trim())
            update({
              interimTranscript: options.autoSendOnFinal === false ? text : "",
              state: "idle",
            });
          else void sendText(text, { inputMode: "voice" });
        },
        onError({ code }) {
          if (!listening()) return;
          if (code === "no-speech" || code === "aborted")
            update({ state: "idle", interimTranscript: "" });
          else
            update({
              state: "error",
              interimTranscript: "",
              error:
                code === "not-allowed"
                  ? {
                      code: "FORBIDDEN",
                      message: "Microphone permission was denied.",
                      retryable: false,
                    }
                  : {
                      code: "INTERNAL",
                      message: "Voice input failed. Please try again.",
                      retryable: true,
                    },
            });
        },
        onEnd() {
          if (listening()) update({ state: "idle", interimTranscript: "" });
        },
      },
    );
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (cb) => (destroyed ? () => {} : emitter.on("change", cb)),
    on: (event, cb) => (destroyed ? () => {} : emitter.on(event, cb)),
    sendText,
    startListening,
    cancel,
    stopListening() {
      if (!destroyed && snapshot.state === "listening") input?.stop();
    },
    async confirm(confirmationId, approved) {
      if (!destroyed) await run(null, { confirmationId, approved });
    },
    setLanguage(language) {
      if (destroyed) return;
      if (!snapshot.languages.includes(language))
        throw new SpeeqError("INVALID_INPUT", { message: `Language not enabled: ${language}` });
      if (snapshot.state === "listening") cancel();
      update({ language, support: { ...snapshot.support, voiceForLanguage: null } });
      if (output)
        void speech.voice(language).then((voiceForLanguage) => {
          if (!destroyed && snapshot.language === language)
            update({ support: { ...snapshot.support, voiceForLanguage } });
        });
    },
    async speak(text) {
      if (destroyed) return;
      const id = generation;
      await speech.enqueue(text, snapshot.language, () => {
        const listening = snapshot.state === "listening";
        update({ state: "speaking", interimTranscript: "", ...(turn ? {} : { error: null }) });
        if (listening && id === generation) input?.abort();
      });
      if (id === generation && !turn && !speech.pending && snapshot.state === "speaking")
        update({ state: snapshot.error ? "error" : "idle" });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      interrupt(true);
      emitter.clear();
      update({ ...clearActivity(), state: "idle" });
    },
  };
}
