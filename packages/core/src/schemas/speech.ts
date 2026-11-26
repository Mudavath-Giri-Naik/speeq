import { z } from "zod";
import { LanguageSchema } from "./common.js";

/** Voice metadata returned by configured synthesizers. */
export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  languages: z.array(LanguageSchema),
  locale: LanguageSchema.optional(),
  gender: z.enum(["female", "male", "neutral"]).optional(),
  accent: z.string().optional(),
  styles: z.array(z.string()).optional(),
  provider: z.string(),
  processing: z.enum(["local", "remote"]),
  streaming: z.boolean(),
  supports: z.object({
    rate: z.boolean(),
    pitch: z.boolean(),
    volume: z.boolean(),
    style: z.boolean(),
  }),
});

/** Wire schema for TranscribeQuery. */
export const TranscribeQuerySchema = z.object({
  language: LanguageSchema.optional(),
  utteranceId: z.string().min(1).max(100).optional(),
});
/** Validated TranscribeQuery payload. */
export type TranscribeQuery = z.infer<typeof TranscribeQuerySchema>;

/** Wire schema for TranscribeResponse. */
export const TranscribeResponseSchema = z.object({
  text: z.string(),
  silent: z.boolean().optional(),
  language: LanguageSchema.optional(),
  languageConfidence: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  providerId: z.string().optional(),
  providerMs: z.number().nonnegative().optional(),
  audioMs: z.number().nonnegative().optional(),
});
/** Validated TranscribeResponse payload. */
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

/** Wire schema for SynthesizeRequest. */
export const SynthesizeRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: LanguageSchema,
  voiceId: z.string().max(100).optional(),
  rate: z.number().min(0.25).max(4).optional(),
  pitch: z.number().min(0.25).max(4).optional(),
  volume: z.number().min(0).max(1).optional(),
  style: z.string().max(200).optional(),
  format: z.enum(["mp3", "wav", "opus", "pcm16"]).optional(),
});
/** Validated SynthesizeRequest payload. */
export type SynthesizeRequest = z.infer<typeof SynthesizeRequestSchema>;

/** Wire schema for VoicesResponse. */
export const VoicesResponseSchema = z.object({ voices: z.array(VoiceInfoSchema) });
/** Validated VoicesResponse payload. */
export type VoicesResponse = z.infer<typeof VoicesResponseSchema>;
