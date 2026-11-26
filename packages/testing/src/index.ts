/**
 * `@speeq/testing`: test doubles for speeq. The main entry has no test-runner dependency, so the
 * {@link createMockLLMProvider} can also power "mock mode" in apps. The store contract suite
 * (which needs Vitest) lives at `@speeq/testing/store-contract`.
 * @packageDocumentation
 */
export { FakeLLMProvider, type FakeScript, type FakeStep, playStep } from "./fake-llm.js";
export { FakeSpeechInput, FakeSpeechOutput } from "./fake-speech.js";
export { FakeSttProvider, FakeTtsProvider } from "./fake-speech-provider.js";
export {
  assistantText,
  type FetchHandler,
  type JsonRequestOptions,
  jsonRequest,
  readSseEvents,
  startSession,
  type TestSession,
} from "./http.js";
export {
  createMockLLMProvider,
  type MockAfterToolInput,
  type MockLLMOptions,
  type MockRule,
  type MockRuleInput,
} from "./mock-llm.js";
