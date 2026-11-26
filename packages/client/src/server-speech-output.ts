import type { SpeechOutput } from "@speeq/core";

type SpeakOptions = Parameters<SpeechOutput["speak"]>[1];
type VoiceInfo = Awaited<ReturnType<NonNullable<SpeechOutput["listVoices"]>>>[number];

import { SpeeqError } from "@speeq/core/errors";
import type { SpeechRequest } from "./server-speech-input.js";
import { WebSpeechOutput } from "./web-speech-output.js";
/** Buffered sentence playback with up to three speculative decodes. */
export class ServerSpeechOutput implements SpeechOutput {
  private context?: AudioContext;
  private tail = Promise.resolve();
  private paused = false;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private controllers = new Set<AbortController>();
  private stop?: () => void;
  private generation = 0;
  private voices = new Map<string, Promise<readonly VoiceInfo[]>>();
  constructor(
    private request: SpeechRequest,
    private fallback: SpeechOutput | null = new WebSpeechOutput(),
    private makeContext = () => new AudioContext(),
  ) {}
  get supported() {
    return typeof AudioContext !== "undefined" || !!this.fallback?.supported;
  }
  private key(text: string, o: SpeakOptions) {
    return JSON.stringify([text, o.language, o.voiceId, o.rate, o.pitch, o.volume, o.style]);
  }
  private async load(text: string, o: SpeakOptions) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const signal = o.signal ? AbortSignal.any([o.signal, controller.signal]) : controller.signal;
    try {
      const { signal: _signal, ...params } = o;
      const res = await this.request(
        "synthesize",
        o.language,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, ...params }),
        },
        signal,
      );
      if (!res.ok) throw new SpeeqError("SPEECH_UNAVAILABLE");
      const bytes = await res.arrayBuffer();
      signal.throwIfAborted();
      this.context ??= this.makeContext();
      return await this.context.decodeAudioData(bytes);
    } finally {
      this.controllers.delete(controller);
    }
  }
  prepare(text: string, o: SpeakOptions) {
    const key = this.key(text, o);
    if (this.cache.has(key) || this.cache.size >= 3) return;
    const promise = this.load(text, o);
    this.cache.set(key, promise);
    void promise.catch(() => {});
  }
  speak(text: string, o: SpeakOptions) {
    const generation = this.generation;
    const next = this.tail.then(() => {
      if (this.generation === generation) return this.play(text, o);
    });
    this.tail = next.catch(() => {});
    return next;
  }
  private async play(text: string, o: SpeakOptions) {
    const key = this.key(text, o),
      generation = this.generation;
    const abort = () => this.cancel();
    if (o.signal?.aborted) return;
    o.signal?.addEventListener("abort", abort, { once: true });
    try {
      const pending = this.cache.get(key) ?? this.load(text, o);
      this.cache.delete(key);
      const audio = await pending;
      if (this.generation !== generation || !this.context) return;
      if (!this.paused && this.context.state === "suspended") await this.context.resume();
      if (this.generation !== generation) return;
      const source = this.context.createBufferSource();
      source.buffer = audio;
      source.connect(this.context.destination);
      await new Promise<void>((resolve) => {
        const finish = () => {
          source.onended = null;
          source.disconnect();
          this.stop = undefined;
          resolve();
        };
        this.stop = () => {
          source.stop();
          finish();
        };
        source.onended = finish;
        source.start();
      });
    } catch {
      if (generation !== this.generation) return;
      if (!this.fallback) throw new SpeeqError("SPEECH_UNAVAILABLE");
      await this.fallback.speak(text, o);
    } finally {
      o.signal?.removeEventListener("abort", abort);
    }
  }
  async listVoices(language = ""): Promise<readonly VoiceInfo[]> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await this.request(
        `voices${language ? `?${new URLSearchParams({ language })}` : ""}`,
        language,
        { method: "GET" },
        controller.signal,
      );
      if (!response.ok) throw new SpeeqError("SPEECH_UNAVAILABLE");
      return (await response.json()).voices as readonly VoiceInfo[];
    } finally {
      this.controllers.delete(controller);
    }
  }
  async hasVoiceFor(language: string) {
    let result = this.voices.get(language);
    if (!result) {
      result = this.listVoices(language);
      this.voices.set(language, result);
    }
    try {
      const base = language.split("-")[0]?.toLowerCase();
      if (
        (await result).some((v) =>
          v.languages.some((l) => l === "*" || l.toLowerCase().split("-")[0] === base),
        )
      )
        return true;
    } catch {
      this.voices.delete(language);
    }
    return (await this.fallback?.hasVoiceFor(language)) ?? false;
  }
  cancel() {
    this.generation++;
    this.tail = Promise.resolve();
    this.paused = false;
    for (const c of this.controllers) c.abort();
    this.cache.clear();
    this.stop?.();
    this.fallback?.cancel();
  }
  pause() {
    this.paused = true;
    void this.context?.suspend();
    this.fallback?.pause?.();
  }
  resume() {
    this.paused = false;
    void this.context?.resume();
    this.fallback?.resume?.();
  }
}
