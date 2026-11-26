import type { ProtocolEvent, SpeechInput } from "@speeq/core";
import { type PublicError, SpeeqError, toPublicError } from "@speeq/core/errors";
import {
  baseLanguage,
  correctWithVocabulary,
  createId,
  guessLanguageFromScript,
  SentenceChunker,
  TypedEmitter,
} from "@speeq/core/utils";
import { pageContext } from "./context.js";
import { LanguageMode } from "./language-mode.js";
import { createMicMonitor, type MicMonitor } from "./mic-monitor.js";
import { ServerSpeechInput, type SpeechRequest } from "./server-speech-input.js";
import { ServerSpeechOutput } from "./server-speech-output.js";
import { sessions } from "./session.js";
import { SpeechQueue } from "./speech-queue.js";
import { RequestError, readEvents } from "./stream.js";
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
  const audioRequest: SpeechRequest = (path, language, init, signal) =>
    request(
      async (base, token) => {
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${token}`);
        const response = await (options.fetch ?? fetch)(`${base}/speech/${path}`, {
          ...init,
          headers,
          signal,
        });
        if (!response.ok) {
          const error = (await response.json().catch(() => null))?.error;
          if (error?.code === "SESSION_EXPIRED" || error?.code === "UNAUTHENTICATED")
            throw new RequestError(response.status, error);
          throw new SpeeqError("SPEECH_UNAVAILABLE");
        }
        return response;
      },
      language || snapshot.language,
      () => undefined,
      signal,
    );
  const browser = new WebSpeechInput();
  let input: SpeechInput | null =
    options.speech?.input === undefined
      ? options.voice?.input === "server"
        ? new ServerSpeechInput(audioRequest, options.voice.endpointMs)
        : browser
      : options.speech.input;
  const output =
    options.speech?.output === undefined
      ? options.voice?.output === "server"
        ? new ServerSpeechOutput(
            audioRequest,
            options.voice.fallbackToBrowserVoice === false ? null : undefined,
          )
        : new WebSpeechOutput()
      : options.speech.output;
  if (output instanceof ServerSpeechOutput) output.voiceId = options.voice?.voiceId;
  const language = options.language ?? options.languages?.[0] ?? "en-IN";
  const mode = new LanguageMode(options.languageMode === "auto");
  if (input instanceof ServerSpeechInput) {
    input.autoLanguage = mode.auto;
    input.keepLastUtterance = options.voice?.keepLastUtterance === true;
  }
  let snapshot: SpeeqSnapshot = freeze({
    inputLanguage: null,
    voice: {
      input: input instanceof ServerSpeechInput ? "server" : "browser",
      output: output instanceof ServerSpeechOutput ? "server" : "browser",
      streaming: input?.capabilities?.streaming ?? "native",
      processing: input?.capabilities?.processing ?? "remote",
    },
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
  const vocabulary = options.vocabulary;
  const correct =
    options.call?.correct ??
    (vocabulary
      ? (t: string) =>
          correctWithVocabulary(t, vocabulary, {
            language: mode.input ?? snapshot.language,
          }).text
      : undefined);
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
    return text.toLowerCase().match(/[\p{L}\p{M}\p{N}']+/gu) ?? [];
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
    if (input instanceof ServerSpeechInput)
      input.capabilities.detectsLanguage = config.speech?.detectsLanguage ?? false;
    const languages =
      options.languages?.filter((l) => config.languages.includes(l)) ?? config.languages;
    const language = languages.includes(snapshot.language)
      ? snapshot.language
      : config.defaultLanguage;
    if (
      options.speech?.input === undefined &&
      input instanceof ServerSpeechInput &&
      config.speech?.stt === false
    ) {
      input.abort();
      input = browser;
      update({
        voice: {
          ...snapshot.voice,
          input: "browser",
          streaming: "native",
          processing: "remote",
          note: "Server recognition is unavailable. Using browser recognition.",
        },
        support: { ...snapshot.support, speechInput: input.supported },
      });
    }
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

  type VoiceMeta = {
    raw: string;
    corrected: boolean;
    ambiguous: string[];
    confidence?: number;
    provider?: string;
  };
  function voiceTurn(heard: string, text: string, submit = true) {
    const server = input instanceof ServerSpeechInput ? input.result : undefined;
    const raw = server?.raw ?? heard;
    const candidates = options.preferredLanguages ??
      snapshot.config?.languages ??
      options.languages ?? [snapshot.language];
    const preferred = mode.input ?? snapshot.language;
    const detected =
      input instanceof ServerSpeechInput
        ? mode.observe(raw, candidates, preferred, server?.language, server?.languageConfidence)
        : preferred;
    if (!(input instanceof ServerSpeechInput)) {
      const guess = guessLanguageFromScript(raw, candidates);
      if (guess.language && baseLanguage(guess.language) !== baseLanguage(preferred))
        emitter.emit("languageSuggestion", {
          suggested: guess.language,
          confidence: guess.confidence,
        });
    }
    update({ inputLanguage: detected });
    const local = options.vocabulary
      ? correctWithVocabulary(heard, options.vocabulary, { language: detected })
      : undefined;
    const ambiguous = [
      ...new Set([...(server?.ambiguous ?? []), ...(local?.ambiguous.map((a) => a.span) ?? [])]),
    ];
    const transcript: VoiceMeta = {
      raw,
      corrected: text !== raw,
      ambiguous,
      confidence: server?.confidence,
      provider: server?.providerId,
    };
    if (submit) return run({ text, inputMode: "voice", inputLanguage: detected, transcript });
  }
  async function run(
    user: {
      text: string;
      inputMode: "voice" | "text";
      inputLanguage?: string;
      transcript?: VoiceMeta;
    } | null,
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
          {
            id: createId("msg"),
            role: "user",
            status: "done",
            text: user.text,
            ...(user.transcript && user.transcript.raw !== user.text
              ? { rawText: user.transcript.raw }
              : {}),
          },
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
          if (
            user?.inputLanguage &&
            (options.replyLanguage === "same-as-input" ||
              (mode.auto && options.replyLanguage !== "fixed"))
          ) {
            const enabled = snapshot.config?.languages ?? snapshot.languages;
            language =
              enabled.find((l) => l === user.inputLanguage) ??
              enabled.find((l) => baseLanguage(l) === baseLanguage(user.inputLanguage ?? "")) ??
              snapshot.config?.defaultLanguage ??
              language;
          }
          if (!(snapshot.config?.languages ?? snapshot.languages).includes(language))
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
      { language: mode.input ?? snapshot.language, interimResults: true },
      {
        onInterim(text) {
          if (listening()) update({ interimTranscript: fix(text) });
        },
        onFinal(raw) {
          if (!listening()) return;
          const text = fix(raw);
          if (options.autoSendOnFinal === false && text.trim()) voiceTurn(raw, text, false);
          if (options.autoSendOnFinal === false || !text.trim())
            update({
              interimTranscript: options.autoSendOnFinal === false ? text : "",
              state: "idle",
            });
          else void voiceTurn(raw, text);
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
  /** Short words that mean something even while the assistant is talking. */
  const STOP_WORD =
    /^(stop|wait|pause|cancel|no|ok|okay|yes|ఆపు|ఆగు|ఆపండి|వద్దు|సరే|అవును|रुको|रुकिए|बस|नहीं|हाँ|ठीक)[.!?]*$/iu;
  /**
   * While the assistant talks, a very short result is almost always a cough, a breath or the
   * speech engine hearing noise. Only a longer or clearly meant phrase should interrupt.
   */
  function tooShortToInterrupt(text: string) {
    if (!audible() && !snapshot.call.interrupted) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return false;
    if (STOP_WORD.test(text.trim())) return false;
    return [...text].filter((c) => /[\p{L}\p{M}\p{N}]/u.test(c)).length < 6;
  }

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
        if (callActive && snapshot.interimTranscript === text) onCallFinal(raw, true);
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
    if (
      (audible() || snapshot.call.interrupted) &&
      (NOISE.test(trimmed) || tooShortToInterrupt(trimmed))
    ) {
      update({ interimTranscript: "" }); // a filler word: let the grace timer resume speech
      return;
    }
    clearGrace();
    committed = early ? key : null;
    void voiceTurn(raw, trimmed);
  }

  function callListen(id: number) {
    if (!callActive || id !== callId || !input) return;
    input.start(
      { language: mode.input ?? snapshot.language, interimResults: true, continuous: true },
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
    if (input instanceof ServerSpeechInput) input.clearLast();
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
    setInputLanguage(tag) {
      if (destroyed) return;
      mode.set(tag);
      update({ inputLanguage: mode.input });
      if (input instanceof ServerSpeechInput) input.autoLanguage = mode.auto;
      if (callActive || snapshot.state === "listening") input?.abort();
    },
    async retranscribeLast(language) {
      if (!(input instanceof ServerSpeechInput) || destroyed) throw new SpeeqError("NOT_FOUND");
      const result = await input.retranscribeLast(language);
      if (!destroyed) update({ interimTranscript: fix(result.text) });
    },
    getSnapshot: () => snapshot,
    subscribe: (cb) => (destroyed ? () => {} : emitter.on("change", cb)),
    on: (event, cb) => (destroyed ? () => {} : emitter.on(event, cb)),
    sendText,
    startListening,
    cancel,
    startCall,
    listVoices: async (lang) =>
      !destroyed && output instanceof ServerSpeechOutput ? output.listVoices(lang) : [],
    setVoice(voiceId) {
      if (output instanceof ServerSpeechOutput) output.voiceId = voiceId ?? undefined;
    },
    async previewVoice(voiceId, lang, text = "Hello! This is how I sound.") {
      if (destroyed || !output) return;
      speech.cancel();
      await output.speak(text, { language: lang, voiceId });
    },
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
      if (input instanceof ServerSpeechInput) {
        input.abort();
        input.clearLast();
      }
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
