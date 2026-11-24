import type { SpeechInput } from "@speeq/core";
import { recognitionConstructor } from "./web-speech-types.js";

type StartOptions = Parameters<SpeechInput["start"]>[0];
type Handlers = Parameters<SpeechInput["start"]>[1];

function errorCode(error: string): Parameters<NonNullable<Handlers["onError"]>>[0]["code"] {
  switch (error) {
    case "service-not-allowed":
    case "not-allowed":
      return "not-allowed";
    case "aborted":
    case "network":
    case "no-speech":
      return error;
    case "language-not-supported":
      return "unsupported";
    default:
      return "other";
  }
}

/** Recognizes a single utterance using the browser's Web Speech API. */
export class WebSpeechInput implements SpeechInput {
  private active?: { stop(): void; abort(): void };

  get supported(): boolean {
    return !!recognitionConstructor();
  }

  start(options: StartOptions, handlers: Handlers): void {
    this.abort();
    let finalText = "";
    let previousInterim = "";
    let aborted = false;
    let ended = false;
    let session: typeof this.active;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (this.active === session) this.active = undefined;
      try {
        if (!aborted && finalText.trim()) handlers.onFinal(finalText.trim());
      } finally {
        handlers.onEnd?.();
      }
    };
    try {
      const Recognition = recognitionConstructor();
      if (!Recognition) throw new Error("Speech recognition is unavailable.");
      const recognition = new Recognition();
      session = {
        stop: () => recognition.stop(),
        abort: () => {
          aborted = true;
          try {
            recognition.abort();
          } finally {
            finish();
          }
        },
      };
      this.active = session;
      recognition.lang = options.language;
      recognition.interimResults = options.interimResults ?? true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = ({ results }) => {
        if (ended || aborted) return;
        // The result list contains the whole session, including earlier final results.
        finalText = "";
        let interim = "";
        for (const result of Array.from(results)) {
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += text;
          else interim += text;
        }
        const changed = interim !== previousInterim;
        previousInterim = interim;
        if (changed && interim) handlers.onInterim?.(interim);
      };
      recognition.onerror = ({ error, message }) => {
        if (ended) return;
        if (error === "aborted") aborted = true;
        handlers.onError?.({ code: errorCode(error), message: message || error });
      };
      recognition.onend = finish;
      recognition.start();
    } catch {
      if (ended) return;
      aborted = true;
      try {
        handlers.onError?.({ code: "unsupported", message: "Speech recognition is unavailable." });
      } finally {
        finish();
      }
    }
  }

  stop(): void {
    this.active?.stop();
  }
  abort(): void {
    this.active?.abort();
  }
}
