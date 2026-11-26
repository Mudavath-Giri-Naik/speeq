import { expect, it } from "vitest";
import {
  autoVocabulary,
  baseLanguage,
  correctWithVocabulary,
  defineVocabulary,
  detectScripts,
  guessLanguageFromScript,
  sttPromptFromVocabulary,
  TranscribeResponseSchema,
  TurnRequestSchema,
  TurnStartedEventSchema,
  toIso639_1,
  vocabularyHints,
} from "../src/index.js";

it.each([
  ["latin", "hello there", "en"],
  ["devanagari", "नमस्ते कैसे हो", "hi"],
  ["telugu", "మీరు ఎలా ఉన్నారు", "te"],
  ["tamil", "எப்படி இருக்கிறீர்கள்", "ta"],
  ["kannada", "ನೀವು ಹೇಗಿದ್ದೀರಿ", "kn"],
  ["malayalam", "സുഖമാണോ ഇന്ന്", "ml"],
  ["bengali", "আপনি কেমন আছেন", "bn"],
  ["gujarati", "તમે કેમ છો", "gu"],
  ["gurmukhi", "ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ", "pa"],
  ["odia", "ଆପଣ କେମିତି ଅଛନ୍ତି", "or"],
  ["arabic", "آپ کیسے ہیں", "ur"],
])("counts %s letters", (script, text, lang) => {
  expect(detectScripts(text).dominant).toBe(script);
  expect(guessLanguageFromScript(text, [lang]).language).toBe(lang);
});
it("constrains detection, canonicalizes ISO subtags and ignores digits", () => {
  expect(baseLanguage("TE-in")).toBe("te");
  expect(toIso639_1("eng-US")).toBe("en");
  expect(detectScripts("१२३ ₹123")).toMatchObject({ counts: {}, mixed: false });
  expect(guessLanguageFromScript("नमस्ते", ["hi", "mr"]).language).toBeUndefined();
  expect(guessLanguageFromScript("తెలుగు మాట్లాడండి OK", ["te-IN", "en"])).toMatchObject({
    language: "te-IN",
    mixed: true,
  });
  expect(guessLanguageFromScript("hello", ["te"]).language).toBeUndefined();
});
const vocab = defineVocabulary({
  terms: [
    {
      term: "Dijkstra",
      aliases: ["dike stra", "café"],
      pronunciations: ["dyke-stra"],
      regional: { te: ["డైక్స్ట్రా"] },
      weight: 9,
    },
    { term: "March", protected: true },
    { term: "Alpha", aliases: ["rupees", "dollars", "March"] },
    { term: "C++", aliases: ["see plus plus"] },
  ],
});
it("corrects only whole forms, preserves raw text and is idempotent", () => {
  const raw = "CAFÉ Cafe\u0301, DIKE STRA డైక్స్ట్రా दिखाओ see plus plus";
  const result = correctWithVocabulary(raw, vocab);
  expect(result.raw).toBe(raw);
  expect(result.text).toBe("Dijkstra Dijkstra, Dijkstra Dijkstra दिखाओ C++");
  expect(correctWithVocabulary(result.text, vocab).text).toBe(result.text);
  expect(correctWithVocabulary("డైక్స్ట్రా", vocab, { regionalToCanonical: false }).changes).toEqual([]);
  expect(correctWithVocabulary("CAFÉteria", vocab).text).toBe("CAFÉteria");
});
it("leaves protected spans, codes, dates, emails and URLs intact", () => {
  const raw =
    "March 12 March 12/03/2026 2026-03-12 ₹2,000 $300 €4 £5 13% dollars 50 30 rupees AB1234 dijkstra@example.org https://test.local/café";
  expect(correctWithVocabulary(raw, vocab).text).toBe(raw);
  expect(correctWithVocabulary("Marcj", vocab).text).toBe("Marcj");
});
it("uses Latin length and distance thresholds and never resolves an equal-distance tie by weight", () => {
  const v = {
    terms: [{ term: "parcel", weight: 9 }, { term: "parsel", weight: 1 }, { term: "headphones" }],
  };
  expect(correctWithVocabulary("parzel", v)).toMatchObject({
    text: "parzel",
    ambiguous: [{ span: "parzel", candidates: ["parcel", "parsel"] }],
  });
  expect(correctWithVocabulary("parcell headphonas", v).text).toBe("parcel headphones");
  expect(correctWithVocabulary("parc hxadxxonxs", v).changes).toHaveLength(0);
});
it("validates, freezes and bounds hints while keeping automatic terms low priority", () => {
  expect(Object.isFrozen(vocab.terms[0]?.aliases)).toBe(true);
  expect(() => defineVocabulary({ terms: [{ term: " " }] })).toThrow();
  expect(vocabularyHints(vocab, 1)).toEqual(["Dijkstra"]);
  expect(sttPromptFromVocabulary(vocab, { maxChars: 19 })).toContain("dyke-stra");
  expect(sttPromptFromVocabulary(vocab, { maxChars: 2 }).length).toBeLessThanOrEqual(2);
  expect(
    autoVocabulary({
      routes: [{ id: "a", title: "Orders" }],
      tools: [{ name: "track" }],
    }).terms.map((x) => x.term),
  ).toEqual(["Orders", "track"]);
  expect(correctWithVocabulary("unchanged", { terms: [] }).changes).toEqual([]);
});
it("indexes a large vocabulary and handles long unmatched input", () => {
  const terms = Array.from({ length: 2000 }, (_, i) => ({
    term: `product${String.fromCharCode(97 + (i % 26), 97 + (Math.floor(i / 26) % 26), 97 + Math.floor(i / 676))}`,
  }));
  const v = defineVocabulary({ terms });
  const sentence = Array.from(
    { length: 30 },
    (_, i) => `unknown${String.fromCharCode(97 + (i % 26))}`,
  ).join(" ");
  const timings = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    correctWithVocabulary(sentence, v);
    timings.push(performance.now() - start);
  }
  expect(timings.sort((a, b) => a - b)[4]).toBeLessThan(5);
  expect(correctWithVocabulary("x".repeat(10000), v).changes).toEqual([]);
});
it("accepts optional wire metadata and refuses invalid confidences", () => {
  const turn = {
    text: "a",
    language: "en",
    inputLanguage: "te",
    transcript: { raw: "a", confidence: 0.2, ambiguous: ["a"] },
  };
  expect(TurnRequestSchema.parse(turn)).toEqual(turn);
  expect(
    TurnRequestSchema.safeParse({ ...turn, transcript: { raw: "", confidence: 2 } }).success,
  ).toBe(false);
  expect(TranscribeResponseSchema.parse({ raw: "x", text: "y", corrected: true }).raw).toBe("x");
  expect(
    TurnStartedEventSchema.parse({
      protocolVersion: 1,
      type: "turn.started",
      turnId: "t",
      sessionId: "s",
      language: "en",
      inputLanguage: "te",
    }).inputLanguage,
  ).toBe("te");
});

it("protects identifiers even when an ordinary-word alias is supplied", () => {
  const v = {
    terms: [
      { term: "AB1234", aliases: ["parcel"] },
      { term: "Other", aliases: ["sample"] },
    ],
  };
  expect(correctWithVocabulary("parcell sample.example/path AB1234", v).changes).toEqual([]);
});
