import type { ProtocolEvent } from "@speeq/core";
import { type PublicError, SpeeqError, toPublicError } from "@speeq/core/errors";
import { createId, SentenceChunker, TypedEmitter } from "@speeq/core/utils";
import { pageContext } from "./context.js";
import { createMicMonitor, type MicMonitor } from "./mic-monitor.js";
import { sessions } from "./session.js";
import { SpeechQueue } from "./speech-queue.js";
import { readEvents } from "./stream.js";
import type {
  CallState,
  ChatMessage,
  SpeeqClient,
  SpeeqClientEvents,
  SpeeqClientOptions,
  SpeeqSnapshot,
  SpeeqState,
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
    call: { active: false, interrupted: false },
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

  // Hands-free call state. See startCall().
  const graceMs = options.call?.interruptGraceMs ?? 1000;
  const echoGuard = options.call?.echoGuard !== false;
  const commitAfterMs = options.call?.commitAfterMs ?? 0;
  const ECHO_TAIL_MS = 1500;
  let callActive = false;
  let callId = 0;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  let committed: string | null = null;
  let spoken = "";
  let lastAudioEnd = 0;
  let restarts: number[] = [];
  const correct = options.call?.correct;
  const voiceDetection = options.call?.voiceDetection !== false;
  let monitor: MicMonitor | undefined;
  /** Fixes recognition mistakes, if the app gave a fixer. Never lets a bad fixer break a call. */
  function fix(text: string): string {
    if (!correct) return text;
    try {
      const out = correct(text);
      return typeof out === "string" ? out : text;
    } catch {
      return text;
    }
  }
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

  const restState = (): SpeeqState => (callActive ? "listening" : "idle");
  function setCall(patch: Partial<CallState>) {
    const next = { ...snapshot.call, ...patch };
    if (next.active !== snapshot.call.active || next.interrupted !== snapshot.call.interrupted)
      update({ call: next });
  }
  function remember(text: string) {
    spoken = `${spoken} ${text}`.slice(-1500);
  }
  function wordsOf(text: string) {
    return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  }
  const audible = () => snapshot.state === "speaking";
  /** True when the microphone is probably hearing the assistant's own voice. */
  function isEcho(text: string) {
    if (!echoGuard) return false;
    if (!audible() && Date.now() - lastAudioEnd > ECHO_TAIL_MS) return false;
    const heard = wordsOf(text);
    if (heard.length === 0) return true;
    const known = new Set(wordsOf(spoken));
    return heard.filter((w) => known.has(w)).length / heard.length >= 0.8;
  }
  function clearGrace() {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = undefined;
    setCall({ interrupted: false });
  }
  function clearCommit() {
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = undefined;
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
    clearGrace();
    if (!callActive && snapshot.state === "listening") input?.abort();
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
    spoken = "";
    function enqueue(text: string) {
      if (signal.aborted || !text) return;
      remember(text);
      void speech.enqueue(text, language, () => update({ state: "speaking" }));
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
    lastAudioEnd = Date.now();
    turn = undefined;
    update({
      state: snapshot.error && !callActive ? "error" : speech.pending ? "speaking" : restState(),
      activeTools: snapshot.activeTools.length ? [] : snapshot.activeTools,
    });
  }

  function cancel() {
    if (destroyed) return;
    interrupt(true);
    update({ ...clearActivity(), state: restState() });
  }
  async function sendText(
    text: string,
    { inputMode = "text" }: { inputMode?: "text" | "voice" } = {},
  ) {
    if (!destroyed && text.trim()) await run({ text: text.trim(), inputMode });
  }
  function startListening() {
    if (destroyed || callActive) return;
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
          if (listening()) update({ interimTranscript: fix(text) });
        },
        onFinal(raw) {
          if (!listening()) return;
          const text = fix(raw);
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
  const NOISE = /^(um+|uh+|hm+|mm+|ah+|oh+|er+|erm|huh)$/i;

  /** The visitor is talking. Pause the assistant, and resume if nothing real follows. */
  function pauseForVisitor() {
    if (!callActive || !audible()) return;
    if (speech.canPause) {
      if (!snapshot.call.interrupted) {
        speech.pause();
        setCall({ interrupted: true });
      }
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        graceTimer = undefined;
        if (!callActive || !snapshot.call.interrupted) return;
        speech.resume();
        update({ interimTranscript: "", call: { active: true, interrupted: false } });
      }, graceMs);
    } else {
      // This output cannot pause, so stop talking right away.
      speech.cancel();
      update({ state: restState() });
    }
  }

  function onCallInterim(raw: string) {
    if (!callActive) return;
    const text = fix(raw);
    if (isEcho(text)) return;
    if (committed !== null && wordsOf(text).join(" ") === committed) return;
    pauseForVisitor();
    update({ interimTranscript: text });
    if (commitAfterMs > 0) {
      clearCommit();
      commitTimer = setTimeout(() => {
        commitTimer = undefined;
        if (callActive && snapshot.interimTranscript === text) onCallFinal(text, true);
      }, commitAfterMs);
    }
  }

  function onCallFinal(raw: string, early = false) {
    if (!callActive) return;
    const trimmed = fix(raw).trim();
    if (!trimmed) return;
    clearCommit();
    const key = wordsOf(trimmed).join(" ");
    if (!early && committed !== null) {
      const same = committed === key;
      committed = null;
      if (same) return; // the browser finished a phrase that was already sent early
    }
    if (isEcho(trimmed)) return;
    if ((audible() || snapshot.call.interrupted) && NOISE.test(trimmed)) {
      update({ interimTranscript: "" }); // a filler word: let the grace timer resume speech
      return;
    }
    clearGrace();
    committed = early ? key : null;
    void sendText(trimmed, { inputMode: "voice" });
  }

  function callListen(id: number) {
    if (!callActive || id !== callId || !input) return;
    input.start(
      { language: snapshot.language, interimResults: true, continuous: true },
      {
        onInterim: (t) => id === callId && onCallInterim(t),
        onFinal: (t) => id === callId && onCallFinal(t),
        onError({ code }) {
          if (id !== callId || !callActive) return;
          if (code === "not-allowed")
            endCall({
              code: "FORBIDDEN",
              message: "Microphone permission was denied.",
              retryable: false,
            });
          else if (code === "unsupported" && restarts.length === 0)
            endCall({
              code: "NOT_CONFIGURED",
              message: "Voice input is not available in this browser. Please type instead.",
              retryable: false,
            });
        },
        onEnd() {
          if (id !== callId || !callActive) return;
          // The browser ends recognition now and then (silence, network). Start it again.
          const now = Date.now();
          restarts = restarts.filter((t) => now - t < 5000);
          restarts.push(now);
          if (restarts.length > 8) {
            endCall({
              code: "INTERNAL",
              message: "Voice input keeps stopping. The call was ended.",
              retryable: true,
            });
            return;
          }
          setTimeout(() => callListen(id), restarts.length > 2 ? 500 : 120);
        },
      },
    );
  }

  function startCall() {
    if (destroyed || callActive) return;
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
    callActive = true;
    callId++;
    restarts = [];
    committed = null;
    spoken = "";
    speech.setEnabled(true);
    update({ ...clearActivity(), call: { active: true, interrupted: false }, state: "listening" });
    callListen(callId);
    if (voiceDetection) {
      const handlers = {
        isPlaying: () => audible() && !snapshot.call.interrupted,
        // The visitor is talking, even if quietly or before speech recognition has any words.
        onVoice: pauseForVisitor,
      };
      monitor = options.call?.createMicMonitor?.(handlers) ?? createMicMonitor(handlers);
      const mine = monitor;
      void mine.start().then((ok) => {
        if (!ok && monitor === mine) monitor = undefined; // keep the call, recognition still works
      });
    }
  }

  function endCall(error?: PublicError) {
    if (!callActive) return;
    callActive = false;
    callId++;
    monitor?.stop();
    monitor = undefined;
    clearGrace();
    clearCommit();
    committed = null;
    interrupt(true);
    input?.abort();
    speech.setEnabled(options.speakReplies !== false);
    update({
      ...clearActivity(),
      call: { active: false, interrupted: false },
      state: error ? "error" : "idle",
      ...(error ? { error } : {}),
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb) => (destroyed ? () => {} : emitter.on("change", cb)),
    on: (event, cb) => (destroyed ? () => {} : emitter.on(event, cb)),
    sendText,
    startListening,
    cancel,
    startCall,
    getMicLevel: () => (callActive ? (monitor?.level() ?? 0) : 0),
    endCall: () => endCall(),
    stopListening() {
      if (destroyed) return;
      if (callActive) endCall();
      else if (snapshot.state === "listening") input?.stop();
    },
    async confirm(confirmationId, approved) {
      if (!destroyed) await run(null, { confirmationId, approved });
    },
    setLanguage(language) {
      if (destroyed) return;
      if (!snapshot.languages.includes(language))
        throw new SpeeqError("INVALID_INPUT", { message: `Language not enabled: ${language}` });
      if (snapshot.state === "listening" && !callActive) cancel();
      update({ language, support: { ...snapshot.support, voiceForLanguage: null } });
      if (callActive) input?.abort(); // the call restarts recognition in the new language
      if (output)
        void speech.voice(language).then((voiceForLanguage) => {
          if (!destroyed && snapshot.language === language)
            update({ support: { ...snapshot.support, voiceForLanguage } });
        });
    },
    async speak(text) {
      if (destroyed) return;
      const id = generation;
      remember(text);
      await speech.enqueue(text, snapshot.language, () => {
        const listening = snapshot.state === "listening";
        update({ state: "speaking", interimTranscript: "", ...(turn ? {} : { error: null }) });
        if (listening && !callActive && id === generation) input?.abort();
      });
      lastAudioEnd = Date.now();
      if (id === generation && !turn && !speech.pending && snapshot.state === "speaking")
        update({ state: snapshot.error && !callActive ? "error" : restState() });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      callActive = false;
      callId++;
      clearCommit();
      interrupt(true);
      emitter.clear();
      update({ ...clearActivity(), state: "idle" });
    },
  };
}
