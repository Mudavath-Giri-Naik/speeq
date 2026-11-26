import { expect, it } from "vitest";
import { errors, Manifest, normalize, percentile } from "../src/metrics.js";
import { markdown, report } from "../src/report.js";

it("scores normalized words and graphemes", () => {
  expect(normalize("  HéLLo,  YOU। ")).toBe("héllo you");
  expect(errors("hello world", "hello").wordEdits).toBe(1);
  expect(errors("కా", "కి")).toEqual({ wordEdits: 1, words: 1, charEdits: 1, chars: 1 });
  expect(errors("नमस्ते।", "नमस्ते").charEdits).toBe(0);
  expect(normalize("क्‍ष", true)).toBe("क्ष");
  expect(normalize("क्‍ष")).toContain("\u200d");
  expect(percentile([100, 10, 20], 95)).toBe(100);
});
it("validates manifests and keeps languages and tags separate", () => {
  expect(Manifest.safeParse({ name: "n", items: [] }).success).toBe(false);
  const r = report(
    [
      { language: "en", tags: ["short"], reference: "hi", text: "hi" },
      { language: "te", reference: "కా", text: "కి" },
    ],
    { provider: "test", runs: 1, concurrency: 1 },
  );
  expect(r.metrics.map((m) => m.wer)).toEqual([0, 0, 1]);
  expect(markdown(r)).toContain("Measured on the above conditions only.");
});
