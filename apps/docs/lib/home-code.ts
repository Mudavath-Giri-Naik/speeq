import { codeToHtml } from "shiki";
import type { CodeTab } from "../components/home/code-tabs";

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

/** Highlighted at build time, so the home page ships no highlighter to the browser. */
export async function getHomeCodeTabs(): Promise<CodeTab[]> {
  const [a, b, c] = await Promise.all([highlight(server), highlight(browser), highlight(tool)]);
  return [
    { id: "server", label: "Server", file: "app/api/speeq/[[...speeq]]/route.ts", html: a },
    { id: "browser", label: "Browser", file: "app/assistant.tsx", html: b },
    { id: "tool", label: "A tool", file: "lib/tools.ts", html: c },
  ];
}
