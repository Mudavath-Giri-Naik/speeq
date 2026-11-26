/** Buffered OpenAI-compatible recognition and synthesis. */
export { createOpenAICompatibleStt, createOpenAICompatibleTts } from "@speeq/core/speech-http";
export { createDetectThenTranscribe } from "./detect-then-transcribe.js";
export { createGeminiStt } from "./gemini-stt.js";
export { createSarvamStt, createSarvamTts, SARVAM_VOICES } from "./sarvam.js";
