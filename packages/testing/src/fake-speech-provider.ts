import type {
  ProviderKind,
  SttProvider,
  SttRequest,
  SttResult,
  TtsProvider,
  TtsRequest,
  VoiceInfo,
} from "@speeq/core";

type Options = { id?: string; kind?: ProviderKind; delayMs?: number };
/** Scripted recognizer that records requests for assertions. */
export class FakeSttProvider implements SttProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly capabilities = {
    streaming: "buffered",
    detectsLanguage: true,
    vocabulary: "prompt",
    languages: "any",
    maxAudioSeconds: 60,
  } as const;
  readonly requests: SttRequest[] = [];
  constructor(
    private script: readonly (string | SttResult | Error)[] = ["hello"],
    private options: Options = {},
  ) {
    this.id = options.id ?? "fake-stt";
    this.kind = options.kind ?? "self-hosted";
  }
  async transcribe(request: SttRequest) {
    const next = this.script[this.requests.length];
    this.requests.push(request);
    if (this.options.delayMs)
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    request.signal?.throwIfAborted();
    if (next instanceof Error) throw next;
    return typeof next === "object" ? next : { text: next ?? "", providerMs: 0 };
  }
}
/** Synthesizer returning a short valid mono PCM16 WAV without external services. */
export class FakeTtsProvider implements TtsProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly requests: TtsRequest[] = [];
  readonly capabilities = { streamingAudio: false, formats: ["wav"], languages: "any" } as const;
  constructor(o: Options = {}) {
    this.id = o.id ?? "fake-tts";
    this.kind = o.kind ?? "self-hosted";
  }
  async listVoices(): Promise<readonly VoiceInfo[]> {
    return [
      {
        id: "test",
        name: "Test voice",
        languages: ["en", "te", "hi"],
        provider: this.id,
        streaming: false,
        processing: "remote",
        supports: { rate: false, pitch: false, volume: false, style: false },
      },
    ];
  }
  async synthesize(req: TtsRequest) {
    this.requests.push(req);
    const bytes = new Uint8Array(44 + 6400),
      v = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
    bytes.set(new TextEncoder().encode("data"), 36);
    v.setUint32(4, bytes.length - 8, true);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true);
    v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    v.setUint32(40, 6400, true);
    return {
      audio: new Blob([bytes]).stream(),
      mimeType: "audio/wav",
      ignored: (["rate", "pitch", "volume", "style"] as const).filter((k) => req[k] !== undefined),
    };
  }
}
