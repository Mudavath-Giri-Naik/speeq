import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { makeSpeeq } from "../../../packages/server/test/helpers.js";
import { evaluateIntent, IntentCases, summarizeIntent } from "../src/intent.js";

it("validates all six native-review case sets", () => {
  const dir = new URL("../cases/", import.meta.url);
  const ids = new Set();
  for (const file of readdirSync(dir)) {
    const suite = IntentCases.parse(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    expect(suite.review).toContain("native");
    expect(suite.cases.length).toBe(25);
    for (const c of suite.cases) ids.add(c.id);
  }
  expect(ids.size).toBe(150);
});
it("scores tool arguments and language pairs from a scripted server", async () => {
  const { speeq } = makeSpeeq(
    [
      { toolCalls: [{ name: "count_questions", arguments: { subject: "SQL" } }] },
      { text: "Five." },
    ],
    { audit: { authorize: () => true } },
  );
  const row = await evaluateIntent(
    {
      id: "1",
      text: "SQL के सवाल?",
      language: "hi+en",
      replyLanguage: "en-IN",
      expected: { tool: "count_questions", args: { subject: "SQL" } },
    },
    "http://localhost/api",
    (url, init) => speeq.handler(new Request(url, init)),
  );
  expect(row).toMatchObject({ tool: true, args: true, safe: true, clarified: false });
  const result = summarizeIntent([
    row,
    { ...row, language: "te", pair: "te → en-IN", args: false },
  ]);
  expect(result.byLanguage.te?.argumentAccuracy).toBe(0);
  expect(result.byPair["hi+en → en-IN"]?.argumentAccuracy).toBe(1);
});
