import { autoVocabulary, defineVocabulary, SpeeqError, type Vocabulary } from "@speeq/core";
import type { RouteDefinition } from "../define.js";

type Settings = {
  vocabulary?: Vocabulary;
  routes?: RouteDefinition[];
  tools?: readonly { name: string; title?: string }[];
  speech?: { clarifyBelow?: number };
};
const cache = new WeakMap<Settings, Vocabulary>();
/** Validate and index configured and automatically derived terms once per instance. */
export function domainVocabulary(config: Settings) {
  let vocabulary = cache.get(config);
  if (vocabulary) return vocabulary;
  const threshold = config.speech?.clarifyBelow;
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1))
    throw new SpeeqError("NOT_CONFIGURED", {
      message: "clarifyBelow must be between zero and one.",
    });
  try {
    const explicit = config.vocabulary ? defineVocabulary(config.vocabulary).terms : [];
    const names = new Set(explicit.map((t) => t.term.toLowerCase()));
    vocabulary = defineVocabulary({
      terms: [
        ...explicit,
        ...autoVocabulary(config).terms.filter((t) => !names.has(t.term.toLowerCase())),
      ],
    });
  } catch {
    throw new SpeeqError("NOT_CONFIGURED", { message: "Invalid voice vocabulary." });
  }
  cache.set(config, vocabulary);
  return vocabulary;
}
