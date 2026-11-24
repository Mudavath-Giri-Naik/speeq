/** Options for {@link SentenceChunker}. */
export interface SentenceChunkerOptions {
  /** Force a split (at the last comma or space) once a sentence grows past this length. */
  maxLength?: number;
}

// Sentence enders: Latin . ! ?, ellipsis, CJK 。！？ and Devanagari danda । ॥ (used in Hindi),
// optionally followed by closing quotes/brackets, and then whitespace.
const END_RE = /([.!?…。！？।॥]+["')\]]*)\s+/u;

/**
 * Splits streamed text deltas into whole sentences, so text-to-speech can start speaking the
 * first sentence while the rest is still generating.
 *
 * A sentence ends at end-punctuation followed by whitespace, or at a newline. Punctuation at the
 * very end of the buffer waits for more input, so `3.` + `5` stays `3.5`. Overlong text is split
 * at the last comma or space before `maxLength`.
 *
 * @example
 * const c = new SentenceChunker();
 * c.push("Hello the"); // []
 * c.push("re. How are"); // ["Hello there."]
 * c.flush(); // "How are"
 */
export class SentenceChunker {
  private buffer = "";
  private readonly maxLength: number;

  constructor(options: SentenceChunkerOptions = {}) {
    this.maxLength = options.maxLength ?? 220;
  }

  /** Adds a delta and returns every sentence it completed (never empty strings). */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (let s = this.take(); s !== null; s = this.take()) {
      if (s.length > 0) out.push(s);
    }
    return out;
  }

  /** Returns the buffered remainder (trimmed, may be empty) and resets the chunker. */
  flush(): string {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest;
  }

  private take(): string | null {
    const match = END_RE.exec(this.buffer);
    const endIdx = match ? match.index + (match[1]?.length ?? 0) : -1;
    const newline = this.buffer.indexOf("\n");
    const candidates = [endIdx, newline].filter((i) => i >= 0);
    if (candidates.length > 0) return this.cut(Math.min(...candidates));

    if (this.buffer.length > this.maxLength) {
      const window = this.buffer.slice(0, this.maxLength);
      const soft = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
      return this.cut(soft > this.maxLength / 3 ? soft + 1 : this.maxLength);
    }
    return null;
  }

  private cut(at: number): string {
    const sentence = this.buffer.slice(0, at).trim();
    this.buffer = this.buffer.slice(at).replace(/^\s+/, "");
    return sentence;
  }
}
