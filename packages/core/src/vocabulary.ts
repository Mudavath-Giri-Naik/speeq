import { z } from "zod";
import { indexFor, type Vocabulary } from "./utils/vocabulary.js";

export type {
  CorrectionChange,
  CorrectionOptions,
  CorrectionResult,
  Vocabulary,
  VocabularyTerm,
} from "./utils/vocabulary.js";
export {
  autoVocabulary,
  correctWithVocabulary,
  sttPromptFromVocabulary,
  vocabularyHints,
} from "./utils/vocabulary.js";

function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
/** Validate, copy and deeply freeze a vocabulary for repeated recognition. */
export function defineVocabulary(v: Vocabulary): Vocabulary {
  const term = z.string().trim().min(1),
    forms = z.array(term).optional();
  const parsed = z
    .object({
      terms: z.array(
        z.object({
          term,
          aliases: forms,
          pronunciations: forms,
          regional: z.record(z.string(), z.array(term)).optional(),
          protected: z.boolean().optional(),
          weight: z.number().finite().optional(),
        }),
      ),
    })
    .parse(v);
  const frozen = freeze(parsed);
  indexFor(frozen);
  return frozen;
}
