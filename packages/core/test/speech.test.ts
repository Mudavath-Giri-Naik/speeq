import { expect, it } from "vitest";
import {
  SynthesizeRequestSchema,
  TranscribeQuerySchema,
  TranscribeResponseSchema,
  VoicesResponseSchema,
} from "../src/index.js";

it("validates speech payloads", () => {
  expect(TranscribeQuerySchema.safeParse({ language: "te-IN" }).success).toBe(true);
  expect(TranscribeQuerySchema.safeParse({ language: "bad tag" }).success).toBe(false);
  expect(TranscribeResponseSchema.safeParse({ text: "", silent: true }).success).toBe(true);
  expect(TranscribeResponseSchema.safeParse({ text: "ok", confidence: 2 }).success).toBe(false);
  expect(SynthesizeRequestSchema.safeParse({ text: "hello", language: "en" }).success).toBe(true);
  expect(SynthesizeRequestSchema.safeParse({ text: " ", language: "en" }).success).toBe(false);
  expect(VoicesResponseSchema.safeParse({ voices: [{}] }).success).toBe(false);
});
