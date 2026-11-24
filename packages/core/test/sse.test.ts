import { describe, expect, it } from "vitest";
import { encodeSse, SseParser } from "../src/utils/sse.js";

describe("SSE", () => {
  it("round-trips encoded events", () => {
    const p = new SseParser();
    const text = encodeSse("a", '{"x":1}') + encodeSse("b", "line1\nline2");
    expect(p.push(text)).toEqual([
      { event: "a", data: '{"x":1}' },
      { event: "b", data: "line1\nline2" },
    ]);
  });

  it("handles chunks split at every character", () => {
    const text =
      encodeSse("assistant.delta", '{"text":"héllo"}') + encodeSse("turn.finished", "{}");
    const p = new SseParser();
    const out = [...text].flatMap((ch) => p.push(ch));
    expect(out.map((m) => m.event)).toEqual(["assistant.delta", "turn.finished"]);
    expect(out[0]?.data).toBe('{"text":"héllo"}');
  });

  it("handles CRLF split across chunks and comments", () => {
    const p = new SseParser();
    expect(p.push(": ping\r")).toEqual([]);
    expect(p.push("\nevent: x\r")).toEqual([]);
    expect(p.push("\ndata: 1\r\n\r")).toEqual([]);
    expect(p.push("\n")).toEqual([{ event: "x", data: "1" }]);
  });

  it("defaults the event name and keeps ids", () => {
    const p = new SseParser();
    expect(p.push("id: 7\ndata:no-space\n\n")).toEqual([
      { event: "message", data: "no-space", id: "7" },
    ]);
  });

  it("flushes a trailing message at end of stream", () => {
    const p = new SseParser();
    p.push("event: last\ndata: z");
    expect(p.end()).toEqual([{ event: "last", data: "z" }]);
  });

  it("ignores events without data", () => {
    const p = new SseParser();
    expect(p.push("event: empty\n\n")).toEqual([]);
  });
});
