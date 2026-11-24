import { FakeSpeechOutput } from "@speeq/testing";
import { afterEach, expect, it, vi } from "vitest";
import { createSpeeqClient } from "../src/index.js";

const endpoint = "/api/speeq";
function browser(lang: string) {
  vi.stubGlobal("SpeechRecognition", class {});
  vi.stubGlobal("speechSynthesis", { getVoices: () => [{ lang }], cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
}
afterEach(() => vi.unstubAllGlobals());
it("constructs in Node and keeps text input available without speech", () => {
  for (const key of [
    "SpeechRecognition",
    "webkitSpeechRecognition",
    "SpeechSynthesisUtterance",
    "speechSynthesis",
  ])
    vi.stubGlobal(key, undefined);
  const client = createSpeeqClient({ endpoint });
  expect(client.getSnapshot().support).toEqual({
    speechInput: false,
    speechOutput: false,
    voiceForLanguage: null,
  });
  client.startListening();
  expect(client.getSnapshot().error?.code).toBe("NOT_CONFIGURED");
});
it.each([
  ["en", true],
  ["hi", false],
] as const)("checks the initial voice asynchronously (%s)", async (lang, expected) => {
  browser(lang);
  const client = createSpeeqClient({ endpoint });
  expect(client.getSnapshot().support).toEqual({
    speechInput: true,
    speechOutput: true,
    voiceForLanguage: null,
  });
  await vi.waitFor(() => expect(client.getSnapshot().support.voiceForLanguage).toBe(expected));
  client.destroy();
});
it("supports per-adapter defaults, overrides, and disabling", async () => {
  browser("en");
  const output = new FakeSpeechOutput({ voices: [] });
  const lookup = vi.spyOn(output, "hasVoiceFor");
  const muted = createSpeeqClient({ endpoint, speech: { input: null } });
  const custom = createSpeeqClient({ endpoint, speech: { output } });
  const quiet = createSpeeqClient({ endpoint, speech: { output: null } });
  expect(muted.getSnapshot().support).toMatchObject({ speechInput: false, speechOutput: true });
  expect(custom.getSnapshot().support).toMatchObject({ speechInput: true, speechOutput: true });
  expect(quiet.getSnapshot().support).toMatchObject({ speechInput: true, speechOutput: false });
  await vi.waitFor(() => expect(custom.getSnapshot().support.voiceForLanguage).toBe(false));
  await custom.speak("test");
  expect(lookup).toHaveBeenCalledExactlyOnceWith("en-IN");
  muted.destroy();
  custom.destroy();
  quiet.destroy();
});
