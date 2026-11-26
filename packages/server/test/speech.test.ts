import { SpeeqError } from "@speeq/core";
import { FakeSttProvider, FakeTtsProvider, startSession } from "@speeq/testing";
import { expect, it, vi } from "vitest";
import { ServerSpeechInput } from "../../client/src/server-speech-input.js";
import { encodeWav } from "../../client/src/wav.js";
import type { SpeechConfig } from "../src/config.js";
import { readAudio } from "../src/speech/limits.js";
import { selectProviders } from "../src/speech/policy.js";
import { makeSpeeq } from "./helpers.js";

async function mount(speech?: SpeechConfig) {
  const { speeq } = makeSpeeq([], { speech });
  const { token, sessionId } = await startSession(speeq.handler);
  return (path: string, init: RequestInit = {}, auth = true) => {
    const headers = new Headers(init.headers);
    if (auth) headers.set("authorization", `Bearer ${token}`);
    return speeq.handler(
      new Request(`http://localhost/session/${sessionId}/speech/${path}`, {
        method: "POST",
        ...init,
        headers,
      }),
    );
  };
}
const wav = (n = 4800, level = 0.3) => ({
  headers: { "content-type": "audio/wav" },
  body: encodeWav(new Float32Array(n).fill(level)),
});
it("applies listing and both policy switches independently", () => {
  for (const kind of ["self-hosted", "remote-free-tier", "remote-paid"] as const)
    for (const allowRemote of [true, false])
      for (const allowPaid of [true, false])
        for (const listed of [true, false]) {
          const p = { kind, id: "p" };
          const r = selectProviders(
            [p],
            { default: listed ? ["p"] : [] },
            { allowRemote, allowPaid },
            "te-IN",
          );
          const allowed =
            listed &&
            (kind === "self-hosted" || (allowRemote && (kind !== "remote-paid" || allowPaid)));
          expect(r.usable).toEqual(allowed ? [p] : []);
          expect(r.skipped.size).toBe(Number(!allowed));
        }
  const ps = ["tag", "base", "default"].map((id) => ({ id, kind: "self-hosted" as const }));
  const routes = { "te-IN": ["tag"], te: ["base"], default: ["default"] };
  expect(
    ["te-IN", "te-US", "hi"].map((l) => selectProviders(ps, routes, {}, l).usable[0]?.id),
  ).toEqual(["tag", "base", "default"]);
});
it("validates routing and rejects duplicate ids", () => {
  const p = new FakeSttProvider();
  for (const speech of [{ stt: [p, p] }, { routing: { stt: { default: ["missing"] } } }])
    expect(() => makeSpeeq([], { speech })).toThrow(/Duplicate|unknown/);
});
it("requires configuration, authentication and explicit paid permission", async () => {
  const none = await mount();
  for (const path of ["voices", "transcribe", "synthesize"])
    expect((await none(path, { method: path === "voices" ? "GET" : "POST" })).status).toBe(404);
  const p = new FakeSttProvider([], { kind: "remote-paid" });
  const route = await mount({
    stt: [p],
    routing: { stt: { default: [p.id] } },
    policy: { allowRemote: true },
  });
  expect((await route("transcribe", wav(), false)).status).toBe(401);
  expect((await route("transcribe", wav())).status).toBe(503);
  expect(p.requests).toHaveLength(0);
});
it("rejects short, long and silent audio before inference, and replays once", async () => {
  const p = new FakeSttProvider(["hello"]);
  const route = await mount({
    stt: [p],
    routing: { stt: { default: [p.id] } },
    limits: { maxAudioSeconds: 1 },
  });
  expect((await route("transcribe", wav(100))).status).toBe(400);
  expect((await route("transcribe", wav(20000))).status).toBe(413);
  expect(await (await route("transcribe", wav(4000, 0))).json()).toEqual({
    text: "",
    silent: true,
  });
  for (let i = 0; i < 2; i++)
    expect(await (await route("transcribe?utteranceId=x", wav())).json()).toMatchObject({
      text: "hello",
    });
  expect(p.requests).toHaveLength(1);
});
it("cuts off an oversized generated stream", async () => {
  let count = 0;
  const block = new Uint8Array(1000000);
  const cancel = vi.fn();
  const stream = new ReadableStream({
    pull(c) {
      if (count++ < 100) c.enqueue(block);
      else c.close();
    },
    cancel,
  });
  const req = new Request("http://localhost", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await expect(readAudio(req, 5000000)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  expect(count).toBeLessThan(9);
  expect(cancel).toHaveBeenCalledOnce();
});
it.each(["RATE_LIMITED", "PROVIDER_ERROR", "timeout", "INVALID_INPUT"] as const)(
  "handles provider failure %s",
  async (code) => {
    const a = new FakeSttProvider(
      [code === "timeout" ? "late" : new SpeeqError(code, { message: "secret" })],
      { id: "a", delayMs: code === "timeout" ? 100 : 0 },
    );
    const b = new FakeSttProvider(["ok"], { id: "b" });
    const route = await mount({
      stt: [a, b],
      routing: { stt: { default: ["a", "b"] } },
      limits: { providerTimeoutMs: 30 },
    });
    const res = await route("transcribe", wav());
    expect(res.status).toBe(code === "INVALID_INPUT" ? 400 : 200);
    expect(await res.text()).not.toContain("secret");
    expect(b.requests.length).toBe(Number(code !== "INVALID_INPUT"));
  },
);
it("uses separate rate buckets and reports ignored synthesis controls", async () => {
  const p = new FakeSttProvider([new SpeeqError("PROVIDER_ERROR")]);
  const t = new FakeTtsProvider();
  const route = await mount({
    stt: [p],
    tts: [t],
    routing: { stt: { default: [p.id] }, tts: { default: [t.id] } },
    limits: { transcribePerMinute: 1 },
  });
  expect((await route("transcribe", wav())).status).toBe(503);
  expect((await route("transcribe", wav())).status).toBe(429);
  const res = await route("synthesize", {
    body: JSON.stringify({ language: "en", text: "hello", rate: 1, pitch: 1 }),
  });
  expect(res.headers.get("X-Speeq-Ignored")).toBe("rate,pitch");
  expect((await route("voices", { method: "GET" })).status).toBe(200);
});
it("delivers captured synthetic audio through a session route to onFinal", async () => {
  const p = new FakeSttProvider(["transcribed"]);
  const route = await mount({ stt: [p], routing: { stt: { default: [p.id] } } });
  const input = new ServerSpeechInput(
    (path, _lang, init) => route(path, init),
    100,
    async (frame) => {
      for (let i = 0; i < 20; i++) frame(new Float32Array(640).fill(i < 10 ? 0.25 : 0), 16000);
    },
  );
  const final = vi.fn();
  await new Promise<void>((resolve) =>
    input.start({ language: "en" }, { onFinal: final, onEnd: resolve }),
  );
  expect(final).toHaveBeenCalledWith("transcribed");
  expect(p.requests).toHaveLength(1);
});
