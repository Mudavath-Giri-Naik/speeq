import { describe, expect, it } from "vitest";
import { selectModel } from "../lib/assistant/llm";
import { findPage } from "../lib/assistant/pages";
import { correctTranscript } from "../lib/assistant/transcript";

describe("assistant page lookup", () => {
  it("ignores command words, so 'open the privacy page' finds the privacy page", () => {
    expect(findPage("open the privacy page")?.id).toBe("concepts-privacy");
    expect(findPage("take me to the install page")?.id).toBe("install");
    expect(findPage("show me the adoption numbers")?.id).toBe("adoption");
  });
});

describe("assistant model choice", () => {
  it("uses the offline guide with no key", () => {
    expect(selectModel({}).mode).toBe("offline");
  });

  async function run(content: string) {
    const real = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("busy", { status: 503 });
    }) as typeof fetch;
    try {
      const { mode, provider } = selectModel({
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-x",
      });
      expect(mode).toBe("gemini");
      const chunks = [];
      for await (const c of provider.stream({
        messages: [{ role: "user", content }],
        tools: [],
      }))
        chunks.push(c);
      const said = chunks.map((c) => (c.type === "text-delta" ? c.text : "")).join("");
      return { calls, said };
    } finally {
      globalThis.fetch = real;
    }
  }

  it("keeps answering when every Gemini model fails", async () => {
    const { calls, said } = await run("explain how streaming works");
    expect(calls.length).toBe(4);
    expect(said.length).toBeGreaterThan(0);
  }, 30_000);

  it("answers quick requests locally, without waiting for the model", async () => {
    const { calls, said } = await run("what can you do");
    expect(calls.length).toBe(0);
    expect(said).toContain("speeq guide");
  });

  it("does not take 'how do I install' for the install-count question", async () => {
    const { calls } = await run("how do I install speeq");
    expect(calls.length).toBe(4);
  }, 30_000);
});

describe("transcript fixes", () => {
  it("turns common mishearings of the product name into speeq", () => {
    expect(correctTranscript("what is speak")).toBe("What is speeq?");
    expect(correctTranscript("how does speed q work")).toBe("How does speeq work?");
    expect(correctTranscript("install speak sdk")).toBe("Install speeq SDK");
  });

  it("leaves the verb 'speak' alone", () => {
    expect(correctTranscript("can i speak to a person")).toBe("Can i speak to a person?");
  });

  it("fixes tech names and adds a question mark to questions", () => {
    expect(correctTranscript("does it work with next js and open a i")).toBe(
      "Does it work with Next.js and OpenAI?",
    );
    expect(correctTranscript("show the audit lock")).toBe("Show the audit log");
    expect(correctTranscript("")).toBe("");
  });
});
