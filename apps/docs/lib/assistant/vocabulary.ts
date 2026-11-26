import { defineVocabulary } from "speeq/core";

/**
 * Words this site's visitors say that recognisers often get wrong. Used by the server speech
 * route (recogniser prompt and safe correction) and by the browser client for server voice.
 */
export const siteVocabulary = defineVocabulary({
  terms: [
    {
      term: "speeq",
      aliases: [
        "speeq q",
        "speeq queue",
        "speeq cue",
        "speak q",
        "speak queue",
        "speak cue",
        "speed q",
        "speed cue",
        "speed queue",
        "speak you",
        "speak",
        "spec",
        "speaq",
        "speeque",
        "spik",
      ],
      pronunciations: ["speek"],
      regional: { te: ["స్పీక్"], hi: ["स्पीक"] },
      weight: 5,
    },
    { term: "Next.js", aliases: ["next js", "nextjs", "next dot js"], weight: 2 },
    { term: "React", aliases: ["react js", "reactjs"], weight: 2 },
    { term: "TypeScript", aliases: ["type script"], weight: 2 },
    { term: "Vercel", aliases: ["versel", "ver sell"], weight: 2 },
    { term: "Gemini", weight: 1 },
    { term: "Groq", aliases: ["grok"], weight: 1 },
    { term: "OpenAI", aliases: ["open ai"], weight: 1 },
    { term: "MongoDB", aliases: ["mongo db", "mongo d b"], weight: 1 },
    { term: "navigate", weight: 1 },
    { term: "audit log", aliases: ["audit lock"], weight: 1 },
  ],
});
