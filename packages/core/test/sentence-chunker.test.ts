import { describe, expect, it } from "vitest";
import { SentenceChunker } from "../src/utils/sentence-chunker.js";

function chunkAll(deltas: string[], maxLength?: number): string[] {
  const c = new SentenceChunker(maxLength === undefined ? {} : { maxLength });
  const out = deltas.flatMap((d) => c.push(d));
  const rest = c.flush();
  return rest ? [...out, rest] : out;
}

describe("SentenceChunker", () => {
  it("emits sentences as soon as they complete", () => {
    const c = new SentenceChunker();
    expect(c.push("Hello the")).toEqual([]);
    expect(c.push("re. How are")).toEqual(["Hello there."]);
    expect(c.push(" you? Fine")).toEqual(["How are you?"]);
    expect(c.flush()).toBe("Fine");
    expect(c.flush()).toBe("");
  });

  it("does not split decimals across deltas", () => {
    expect(chunkAll(["It is 3.", "5 metres. Done."])).toEqual(["It is 3.5 metres.", "Done."]);
  });

  it("splits on Hindi danda", () => {
    expect(chunkAll(["नमस्ते। आप कैसे हैं? ठीक"])).toEqual(["नमस्ते।", "आप कैसे हैं?", "ठीक"]);
  });

  it("works with Telugu text and newlines", () => {
    expect(chunkAll(["నమస్కారం!\nమీకు ఎలా", " సహాయం చేయగలను?"])).toEqual([
      "నమస్కారం!",
      "మీకు ఎలా సహాయం చేయగలను?",
    ]);
  });

  it("keeps closing quotes with the sentence", () => {
    expect(chunkAll(['He said "go." Then left.'])).toEqual(['He said "go."', "Then left."]);
  });

  it("splits very long text at a soft boundary", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const out = chunkAll([words], 100);
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.length).toBeLessThanOrEqual(100);
    expect(out.join(" ")).toBe(words);
  });

  it("never emits empty strings", () => {
    expect(chunkAll(["\n\n", "Hi.  ", "\n"])).toEqual(["Hi."]);
  });
});
