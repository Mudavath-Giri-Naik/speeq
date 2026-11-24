/** One parsed Server-Sent Event. */
export interface SseMessage {
  /** The `event:` field, or `"message"` when absent. */
  event: string;
  /** The joined `data:` lines. */
  data: string;
  id?: string;
}

/** Encodes one SSE message (`event:` + `data:` lines + blank line). */
export function encodeSse(event: string, data: string): string {
  const lines = data.split(/\r?\n/).map((line) => `data: ${line}`);
  return `event: ${event}\n${lines.join("\n")}\n\n`;
}

/**
 * Incremental SSE parser that follows the WHATWG event-stream rules. Feed it decoded text chunks
 * in any split (mid-line, mid-field, CRLF across chunks) and it returns complete messages.
 */
export class SseParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];
  private id: string | undefined;

  /** Adds a chunk and returns every message completed by it. */
  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    for (;;) {
      const match = /\r\n|\r|\n/.exec(this.buffer);
      if (!match) break;
      // A lone trailing "\r" may be the first half of "\r\n": wait for more input.
      if (match[0] === "\r" && match.index === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const message = this.processLine(line);
      if (message) out.push(message);
    }
    return out;
  }

  /** Flushes a final message that was not followed by a blank line (end of stream). */
  end(): SseMessage[] {
    const out = this.buffer.length > 0 ? this.push("\n") : [];
    const last = this.dispatch();
    return last ? [...out, last] : out;
  }

  private processLine(line: string): SseMessage | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
    else if (field === "id") this.id = value;
    return null;
  }

  private dispatch(): SseMessage | null {
    if (this.data.length === 0) {
      this.event = "";
      return null;
    }
    const message: SseMessage = { event: this.event || "message", data: this.data.join("\n") };
    if (this.id !== undefined) message.id = this.id;
    this.event = "";
    this.data = [];
    return message;
  }
}
