import type { SpeechInput } from "@speeq/core";

type SpeechInputOptions = Parameters<SpeechInput["start"]>[0];
type SpeechInputHandlers = Parameters<SpeechInput["start"]>[1];

import { SpeeqError } from "@speeq/core/errors";
import { Endpointing } from "./endpointing.js";
import { openCapture, PreRoll } from "./pcm-capture.js";
import { encodeWav, resample } from "./wav.js";
/** Session-authenticated speech route transport. */
export type SpeechRequest = (
  path: string,
  language: string,
  init: RequestInit,
  signal: AbortSignal,
) => Promise<Response>;
/** Recognition result retained independently of the audio buffer. */
export interface RecognitionResult {
  text: string;
  raw?: string;
  language?: string;
  languageConfidence?: number;
  confidence?: number;
  providerId?: string;
  ambiguous?: string[];
  silent?: boolean;
}
/** Buffered recognition with one upload per detected utterance. */
export class ServerSpeechInput implements SpeechInput {
  readonly capabilities: NonNullable<SpeechInput["capabilities"]> = {
    streaming: "buffered",
    processing: "remote",
    detectsLanguage: false,
  } as const;
  autoLanguage = false;
  keepLastUtterance = false;
  result?: RecognitionResult;
  private last?: Uint8Array<ArrayBuffer>;
  private retry?: AbortController;
  clearLast() {
    this.retry?.abort();
    this.retry = undefined;
    this.last = undefined;
  }
  private async transcribe(
    body: Uint8Array<ArrayBuffer>,
    language: string | undefined,
    sessionLanguage: string,
    signal: AbortSignal,
  ): Promise<RecognitionResult> {
    const query = new URLSearchParams({ utteranceId: crypto.randomUUID() });
    if (language) query.set("language", language);
    const response = await this.request(
      `transcribe?${query}`,
      sessionLanguage,
      { method: "POST", body, headers: { "content-type": "audio/wav" } },
      signal,
    );
    if (!response.ok) throw new SpeeqError("SPEECH_UNAVAILABLE");
    const result = await response.json();
    if (typeof result?.text !== "string") throw new SpeeqError("PROVIDER_ERROR");
    return result;
  }
  async retranscribeLast(language: string) {
    if (!this.last) throw new SpeeqError("NOT_FOUND");
    this.retry?.abort();
    const retry = new AbortController();
    this.retry = retry;
    const result = await this.transcribe(this.last, language, language, retry.signal);
    retry.signal.throwIfAborted();
    return result;
  }
  private active?: { stop(): void; abort(): void };
  constructor(
    private request: SpeechRequest,
    private endpointMs = 700,
    private capture = openCapture,
    /** Sounds shorter than this are ignored instead of being sent for recognition. */
    private minUtteranceMs = 350,
  ) {}
  get supported() {
    return this.capture !== openCapture || !!globalThis.navigator?.mediaDevices?.getUserMedia;
  }
  start(options: SpeechInputOptions, h: SpeechInputHandlers) {
    this.abort();
    const mic = new AbortController(),
      network = new AbortController(),
      detector = new Endpointing({
        endpointMs: this.endpointMs,
        minUtteranceMs: this.minUtteranceMs,
      });
    let pre: PreRoll | undefined,
      frames: Float32Array[] | undefined,
      rate = 16000,
      now = 0,
      ended = false,
      closing = false;
    let tail = Promise.resolve();
    const end = () => {
      if (ended) return;
      ended = true;
      mic.abort();
      network.abort();
      if (this.active === session) this.active = undefined;
      h.onEnd?.();
    };
    const fail = (code: "network" | "not-allowed") => {
      if (!ended) {
        try {
          h.onError?.({
            code,
            message:
              code === "network" ? "Speech recognition failed." : "Microphone permission denied.",
          });
        } finally {
          end();
        }
      }
    };
    const enqueue = () => {
      const parts = frames;
      frames = undefined;
      if (!parts) return false;
      const samples = new Float32Array(parts.reduce((n, x) => n + x.length, 0));
      let offset = 0;
      for (const part of parts) {
        samples.set(part, offset);
        offset += part.length;
      }
      const body = encodeWav(resample(samples, rate));
      if (this.keepLastUtterance) this.last = body;
      tail = tail
        .then(async () => {
          if (ended) return;
          const data = await this.transcribe(
            body,
            this.autoLanguage ? undefined : options.language,
            options.language,
            network.signal,
          );
          if (ended) return;
          this.result = data;
          if (!data.silent && typeof data.text === "string" && data.text.trim())
            h.onFinal(data.text.trim());
          else if (!options.continuous)
            h.onError?.({ code: "no-speech", message: "No speech detected." });
        })
        .catch(() => fail("network"));
      return true;
    };
    const stop = () => {
      if (closing || ended) return;
      closing = true;
      mic.abort();
      if (!enqueue() && !options.continuous)
        h.onError?.({ code: "no-speech", message: "No speech detected." });
      void tail.then(end);
    };
    const session = { stop, abort: end };
    this.active = session;
    void this.capture((samples, sampleRate) => {
      if (closing || ended) return;
      rate = sampleRate;
      pre ??= new PreRoll(Math.ceil(rate * 0.3));
      let power = 0;
      for (const s of samples) power += s * s;
      const event = detector.push({ rms: Math.sqrt(power / samples.length), now });
      now += (samples.length * 1000) / rate;
      if (event === "speechStart") {
        this.clearLast();
        frames = [pre.take()];
        h.onSpeechStart?.();
      }
      if (event === "speechCancel") {
        frames = undefined; // too short to be speech: a click, a cough, a bump on the desk
        pre.push(samples);
        return;
      }
      if (frames) frames.push(samples);
      else pre.push(samples);
      if (event === "speechEnd") {
        if (options.continuous) enqueue();
        else stop();
      }
    }, mic.signal).catch((e) => {
      if (!mic.signal.aborted) fail(e?.name === "NotAllowedError" ? "not-allowed" : "network");
    });
  }
  stop() {
    this.active?.stop();
  }
  abort() {
    this.active?.abort();
  }
}
