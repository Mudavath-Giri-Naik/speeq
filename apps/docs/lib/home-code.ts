import { codeToHtml } from "shiki";

const server = `import { createSpeeq } from "speeq/server";
import { createNextHandler } from "speeq/server/next";
import { createMemoryStore } from "speeq/store-memory";
import { createMockLLMProvider } from "speeq/testing";
import { after } from "next/server";

const assistant = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Helper", instructions: "Help visitors find their way." },
  store: createMemoryStore(),
  llm: createMockLLMProvider({
    rules: [{ match: /hello/, respond: () => ({ text: "Hello from Helper." }) }],
  }),
  waitUntil: (work) => after(() => work),
});

export const { GET, POST, OPTIONS } = createNextHandler(assistant);`;

const browser = `"use client";
import { SpeeqProvider, useSpeeq } from "speeq/react";
import { useRouter } from "next/navigation";

export function Assistant({ children }) {
  const router = useRouter();
  return (
    <SpeeqProvider
      endpoint="/api/speeq"
      onNavigate={({ href }) => router.push(href)}
    >
      {children}
    </SpeeqProvider>
  );
}

export function Chat() {
  const { sendText, messages } = useSpeeq();
  return (
    <>
      {messages.map((m) => <p key={m.id}>{m.text}</p>)}
      <button onClick={() => sendText("hello")}>Say hello</button>
    </>
  );
}`;

const tool = `import { defineTool, SpeeqError } from "speeq/server";
import { z } from "zod";

export const cancelOrder = defineTool({
  name: "cancel_order",
  description: "Cancel one of the user's open orders.",
  input: z.object({ orderId: z.string().max(40) }),
  risk: "write", // the visitor must approve first
  confirmationSummary: ({ orderId }) => \`Cancel order \${orderId}?\`,
  handler: async ({ orderId }, ctx) => {
    if (!ctx.user) throw new SpeeqError("FORBIDDEN");
    return await cancelFor(ctx.user.id, orderId); // your code
  },
});`;

async function highlight(code: string): Promise<string> {
  return codeToHtml(code, {
    lang: "tsx",
    themes: { light: "github-light", dark: "github-dark-default" },
    defaultColor: false,
  });
}

const voice = `<SpeeqProvider
  endpoint="/api/speeq"
  language="te-IN"
  languages={["en-US", "te-IN", "hi-IN"]}
  voice={{ input: "server", output: "server", fallbackToBrowserVoice: true }}
  onNavigate={({ href }) => router.push(href)}
>
  {children}
</SpeeqProvider>`;

const models = `import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";

// Groq, or any service that speaks the OpenAI chat format.
const llm = createOpenAICompatibleProvider({
  baseURL: process.env.LLM_BASE_URL!, // https://api.groq.com/openai/v1
  apiKey: process.env.LLM_API_KEY!,
  model: process.env.LLM_MODEL!,
});

// Pass it to createSpeeq({ llm, ... }) in place of the mock model.`;

export interface QuickstartTab {
  id: string;
  label: string;
  file: string;
  code: string;
  html: string;
  title: string;
  points: string[];
  href: string;
  cta: string;
}

/** Quickstart tabs, highlighted at build time. Every snippet is taken from the real docs or this site. */
export async function getQuickstartTabs(): Promise<QuickstartTab[]> {
  const items = [
    {
      id: "server",
      label: "Server",
      file: "app/api/speeq/[[...speeq]]/route.ts",
      code: server,
      title: "One route runs the assistant",
      points: [
        "Start with a mock model. No account, no keys.",
        "The store keeps conversations in your own database.",
        "A standard handler, with a ready Next.js adapter.",
      ],
      href: "/docs/guides/nextjs",
      cta: "Next.js guide",
    },
    {
      id: "react",
      label: "React",
      file: "app/assistant.tsx",
      code: browser,
      title: "A provider and a hook",
      points: [
        "SpeeqProvider wraps your app once.",
        "onNavigate opens pages through your router.",
        "useSpeeq gives you messages and send. You build the UI.",
      ],
      href: "/docs/reference/react",
      cta: "React reference",
    },
    {
      id: "tools",
      label: "Tools",
      file: "lib/tools.ts",
      code: tool,
      title: "Expose what you approve",
      points: [
        "Inputs are validated with Zod.",
        "A write tool needs a visitor’s Yes before it runs.",
        "Your handler repeats your own permission checks.",
      ],
      href: "/docs/guides/tools",
      cta: "Tools guide",
    },
    {
      id: "voice",
      label: "Voice",
      file: "app/assistant.tsx",
      code: voice,
      title: "Voice and languages",
      points: [
        "Browser voice by default, server voice when you configure it.",
        "Pick the languages your visitors use.",
        "Falls back to browser voice if the server is unavailable.",
      ],
      href: "/docs/guides/voice",
      cta: "Voice guide",
    },
    {
      id: "models",
      label: "Models",
      file: "lib/model.ts",
      code: models,
      title: "Bring your own model",
      points: [
        "Groq or any OpenAI-style service through one adapter.",
        "Google Gemini has its own adapter.",
        "Model names come from your environment, never from the code.",
      ],
      href: "/docs/guides/models",
      cta: "Connect a model",
    },
  ];
  const html = await Promise.all(items.map((i) => highlight(i.code)));
  return items.map((item, n) => ({ ...item, html: html[n] ?? "" }));
}
