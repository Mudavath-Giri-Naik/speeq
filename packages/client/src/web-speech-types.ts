/** Browser voice metadata exposed to a custom voice selector. */
export interface SpeechSynthesisVoiceLike {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  voiceURI: string;
}

interface RecognitionResult extends ArrayLike<{ transcript: string }> {
  isFinal: boolean;
}

/** Portion of a recognition instance used by the input adapter. */
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onspeechstart?: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/** Portion of an utterance used by the output adapter. */
export interface UtteranceLike {
  lang: string;
  voice: SpeechSynthesisVoiceLike | null;
  rate: number;
  pitch: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** Browser synthesis operations needed for playback and voice discovery. */
export interface SynthesisLike {
  paused: boolean;
  getVoices(): readonly SpeechSynthesisVoiceLike[];
  addEventListener(type: "voiceschanged", listener: () => void): void;
  removeEventListener(type: "voiceschanged", listener: () => void): void;
  pause?(): void;
  resume(): void;
  speak(utterance: UtteranceLike): void;
  cancel(): void;
}

interface SpeechGlobals {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
  speechSynthesis?: SynthesisLike;
  SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
}

function globals(): SpeechGlobals {
  return typeof globalThis === "undefined" ? {} : (globalThis as unknown as SpeechGlobals);
}

/** Looks up the native or prefixed recognition constructor on demand. */
export function recognitionConstructor() {
  const g = globals();
  const ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor : undefined;
}

/** Looks up both native synthesis APIs on demand. */
export function synthesisApi() {
  const { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } = globals();
  if (synth && typeof Utterance === "function") return { synth, Utterance };
  return undefined;
}

/** Reports the speech input and output APIs available in the current environment. */
export function detectSpeechSupport(): { input: boolean; output: boolean } {
  return { input: !!recognitionConstructor(), output: !!synthesisApi() };
}
