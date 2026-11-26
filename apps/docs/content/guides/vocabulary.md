---

title: Domain vocabulary
description: Teach recognition your product names and keep uncertain voice actions safe.
---

# Domain vocabulary

Define canonical terms, likely mishearings, pronunciations and regional forms. Give important terms a higher weight to put them earlier in recognizer prompts. Set `protected: true` for identifiers and sensitive terms that must stay exactly as spoken.

```ts
import { defineVocabulary } from "speeq/core";

const vocabulary = defineVocabulary({
  terms: [
    {
      term: "Dijkstra",
      aliases: ["dike stra"],
      pronunciations: ["dyke-stra"],
      regional: { te: ["డైక్స్ట్రా"], hi: ["डाइकस्ट्रा"] },
      weight: 5,
    },
    { term: "Invoice ID", protected: true },
  ],
});
```

Pass the vocabulary to the server for recognizer hints, deterministic correction and agent prompt hints. Route titles and tool names also supply low-priority terms. Pass a vocabulary to the client for immediate local display and browser speech correction. An explicit `call.correct` takes precedence.

Exact whole aliases and regional phrases take priority. Fuzzy matching applies to longer Latin tokens only. Digits, money, dates, percentages, URLs, emails, protected terms and mixed alphanumeric codes stay intact. Equally close alternatives are returned as ambiguous. The response preserves the raw transcript alongside the corrected text.

If a voice turn contains ambiguous spans or reported confidence below `speech.clarifyBelow` (default 0.5), the server blocks write tools for that turn and asks the model to clarify. Normal confirmation rules apply to the next clear request. Reads and navigation remain available.
