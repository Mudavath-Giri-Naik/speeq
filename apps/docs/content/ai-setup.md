---

title: Set up with an AI assistant
description: Copy one prompt into your AI coding tool and let it add speeq to your Next.js app, step by step.
---

# Set up with an AI assistant

**What you will do:** copy one prompt, paste it into your AI coding tool, and review what it builds.

The prompt works with tools like Claude Code, Codex, and Cursor. Open the tool in the root of your Next.js project, then paste the prompt.

The assistant works in small steps. It first looks at your project and asks you questions. Then it builds a working mock assistant, connects your pages and tools, adds a real model, and ends with a production checklist. It stops and asks before it touches any data or secret.

> **Important** Read what the assistant changes before you commit it. Never paste API keys into the chat. The prompt tells the assistant not to read your `.env` files.

## The prompt

Use the **Copy** button on the block below.

````text title="speeq setup prompt"
You are integrating **speeq** into this Next.js project. speeq is a headless voice and text assistant
SDK: a server handler that runs the model, your tools and your data access, and a React client that
streams replies and navigates the app. Work in the stages below, in order. Finish and verify each
stage before starting the next. Keep changes small and reviewable. Do not refactor unrelated code.

## 0. Ground rules

- Use only the APIs shown in this prompt. Do not invent options, imports or props. If you need something
  that is not here, read the speeq docs at https://github.com/Mudavath-Giri-Naik/speeq/tree/main/docs
  (start with `docs/guides/nextjs.md` and `docs/reference/`) or the installed package's `.d.ts` files in
  `node_modules/speeq` and `node_modules/@speeq/*`, and say what you looked up.
- Never read, print, copy or commit values from `.env*` files. Never put a secret in a `NEXT_PUBLIC_*`
  variable, in client code, in a log or in a commit. Add new variable names to `.env.example` with empty
  values only.
- Do not run `git commit`, `git push` or any deploy. Leave changes in the working tree.
- Do not add telemetry endpoints or project keys. speeq's anonymous usage counters stay off unless the
  project owner sets `SPEEQ_PLATFORM_URL` themselves. Do not change that.
- If a step needs a decision that changes what data the assistant can read or change, stop and ask. Do
  not guess.

## 1. Inspect the project (read only, no edits yet)

Find and report in one short message:

1. Next.js version and router. speeq's guide covers the **App Router** (an `app/` directory). If the
   project only has `pages/`, stop and tell me; do not improvise a Pages Router integration.
2. TypeScript or JavaScript, package manager (lockfile), Node version (`engines` or `.nvmrc`; speeq needs
   Node 20 or newer), and whether `zod` is installed. speeq needs **zod 4** as a peer dependency. If the
   project has zod 3, stop and ask before upgrading.
3. How users sign in (NextAuth/Auth.js, Clerk, Supabase Auth, custom cookies, none) and how server code
   gets the current user from a `Request` or cookies.
4. The data layer (Prisma, Drizzle, Mongo, Supabase, REST API, none) and where server-side data access
   functions live.
5. The app's public pages and their URL patterns (list `app/**/page.tsx`), and which of them need
   sign-in.
6. Where the root layout is (`app/layout.tsx`) and whether a client-side provider tree already exists.
7. Whether the app deploys to serverless (Vercel, Netlify) or a long-running server. Report what you
   can infer.

Then ask me only the questions you cannot answer from the code. Likely ones: what should the assistant
be called and how should it behave, which pages may it navigate to, what read or write actions do I
want it to do, and should anonymous visitors be allowed to use it.

## 2. Install and mount the mock assistant

Install with the project's package manager: `speeq@next` and `zod@4` (skip zod if 4 is already
installed). All imports below use `speeq/*` subpaths; each also exists as the matching `@speeq/*` package.

Create `app/api/speeq/[[...speeq]]/route.ts`:

```ts
import { createSpeeq } from "speeq/server";
import { createNextHandler } from "speeq/server/next";
import { createMemoryStore } from "speeq/store-memory";
import { createMockLLMProvider } from "speeq/testing";
import { after } from "next/server";

export const runtime = "nodejs";
const assistant = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Helper", instructions: "Help visitors find their way." },
  store: createMemoryStore(),
  llm: createMockLLMProvider({
    rules: [{ match: /hello/, respond: () => ({ text: "Hello from Helper." }) }],
  }),
  waitUntil: (work) => after(() => work),
});
export const { GET, POST, OPTIONS } = createNextHandler(assistant);
```

Keep the `createSpeeq` call at **module scope**. Do not create it inside the handler functions. In a
JavaScript project, drop the type-only parts and keep the same calls.

Create the client provider as a client component (`"use client"`) and wrap the layout body with it:

```tsx
"use client";
import { SpeeqProvider } from "speeq/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <SpeeqProvider
      endpoint="/api/speeq"
      speakReplies={false}
      onNavigate={({ href }) => router.push(href)}
    >
      {children}
    </SpeeqProvider>
  );
}
```

Then build a small chat widget (a floating button that opens a panel) as another client component,
styled to match the project's existing UI conventions (Tailwind, CSS modules, component library: use
what is already there). It must use `useSpeeq()`:

```tsx
const { sendText, messages, error, state, pendingConfirmation, confirm, cancel } = useSpeeq();
```

Required behavior of the widget:

- Render `messages` (each has `id`, `role` of `"user"` or `"assistant"`, `text`, `status`).
- A text input that calls `sendText(value)` on submit and is disabled while `state` is `"thinking"` or
  `"speaking"`. A stop button calling `cancel()` while a reply is streaming.
- If `error` is set, show `error.message` in an element with `role="alert"`.
- If `pendingConfirmation` is set, show its `summary` with **Approve** and **Reject** buttons that call
  `confirm(pendingConfirmation.confirmationId, true)` and `confirm(..., false)`. Never auto-approve.
- Keyboard accessible: labelled input and buttons, focus moves into the panel when it opens, Escape
  closes it.

Mount the widget once in the layout (inside `AssistantProvider`), not on every page.

**Verify stage 2:** run the project's typecheck and build commands. Start the dev server. In a terminal:

```bash
curl -s http://localhost:3000/api/speeq/health
```

It must return JSON with `ok`. Then open the app, open the widget, type `hello`, and confirm the reply
is "Hello from Helper." Report what you ran and saw. If the project already has a Content-Security-Policy
or middleware that blocks `/api/*`, fix only that. Mention it.

## 3. Describe the assistant and register routes

Update `agent.name` and `agent.instructions` using my answers. Instructions should say what the app is,
what the assistant should and should not do, and that it must say when it cannot help. Keep them plain and
short.

Register navigation. For each page I allowed, add a route definition and pass `routes: [...]` to
`createSpeeq`:

```ts
import { defineRoute } from "speeq/server";
import { z } from "zod";

export const pricing = defineRoute({ id: "pricing", title: "Pricing", path: "/pricing" });
export const article = defineRoute({
  id: "article",
  title: "Article",
  path: "/articles/:slug",
  params: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }),
});
```

Rules:

- Route ids are unique. Every dynamic segment in `path` has a matching zod param, validated tightly.
- Only register pages that are safe for **any** visitor to be sent to. The assistant sending someone to a
  page does not grant access; every protected page must still enforce its own auth check. Verify that
  each registered protected page already redirects or rejects anonymous users, and tell me if one does not.
- Do not register admin, billing-change or destructive pages without asking me.

Optionally, in client components where page state matters, call `useSpeeqContext({ ... })` to share
page data with the assistant. Share only what any user may share with the assistant.

**Verify stage 3:** the mock model cannot navigate, so check only that the routes compile: run the
typecheck and, if the project has tests, add one that imports the route definitions. The real navigation
check happens in stage 5 with the real model.

## 4. Add tools and knowledge (read-only first)

Ask me which operations the assistant should perform. Implement **read-only** ones first.

```ts
import { defineTool, SpeeqError } from "speeq/server";
import { z } from "zod";

export const countOrders = defineTool({
  name: "count_orders",
  description: "Count the signed-in user's orders, optionally filtered by status.",
  input: z.object({ status: z.enum(["open", "shipped", "cancelled"]).optional() }),
  handler: async ({ status }, ctx) => {
    if (!ctx.user) throw new SpeeqError("FORBIDDEN");
    return { count: await countOrdersFor(ctx.user.id, status) };
  },
});
```

(Replace `countOrdersFor` with the project's real data function.)

Rules, all mandatory:

- `ctx.user` is the signed-in user (or `null`). **Every** tool that returns or changes user-specific data
  checks `ctx.user` and scopes the query to `ctx.user.id`. Never trust an id supplied by the model in the
  tool input to identify the user. To refuse, throw `new SpeeqError("FORBIDDEN")` (`SpeeqError` is
  exported from `speeq/server`).
- Validate every input with zod: tight types, `.max()` on strings, enums over free text.
- Return the **minimum** data. No password hashes, tokens, full card data, other users' data or internal
  ids the user could not see on the site.
- Tool output is shown to the model as untrusted data. Do not put secrets in it.
- Names match `[a-zA-Z0-9_-]{1,64}`. Descriptions say what the tool does and when to use it.

For searchable content (help articles, docs, FAQs), add a knowledge source and pass
`knowledge: [help]`:

```ts
import { defineKnowledgeSource } from "speeq/server";

export const help = defineKnowledgeSource({
  id: "help",
  description: "Product help articles",
  async search(query) {
    return [{ id: "plans", title: "Plans", content: "...", href: "/pricing" }];
  },
});
```

**Write tools** (anything that creates, changes, deletes, sends or pays): set `risk: "write"`, provide
`confirmationSummary(input)` returning a precise sentence ("Cancel order #1234?"), and re-check
permissions inside `handler`. Writes require approval by default, and the widget from stage 2 renders
the approval. Make side effects idempotent where you can. Before you add any write tool, tell me exactly
what it does and wait for my go-ahead. Never mark a destructive tool `risk: "read"`.

**Verify stage 4:** typecheck and build. Add unit tests for each tool handler: signed-out user is
refused, one user cannot read another user's data, invalid input is rejected.

## 5. Real model, identity and store

Add the model provider. Pick the one I tell you; default to Groq or Gemini if I have a key.

```ts
import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";
import { createGeminiProvider } from "speeq/llm-gemini";

// Groq or any OpenAI-compatible chat-completions service:
createOpenAICompatibleProvider({
  baseURL: process.env.LLM_BASE_URL!, // e.g. https://api.groq.com/openai/v1
  apiKey: process.env.LLM_API_KEY!,
  model: process.env.LLM_MODEL!,
});
// Gemini:
createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL! });
```

- Read keys and model names from server-side env vars. Add the variable **names** to `.env.example`
  (empty). Tell me to set the real values in `.env.local` myself. Do not ask me to paste keys into chat.
- If the key is missing, fall back to the mock provider in development and fail loudly at startup in
  production. Remove the `speeq/testing` mock import from production paths.

Wire identity with `resolveUser`, using the project's existing session mechanism:

```ts
resolveUser: async (request) => {
  const user = await getUserFromRequest(request); // use the project's real auth helper
  return user ? { id: user.id } : null;
},
allowAnonymous: false, // or true if I said anonymous visitors may use it
```

- `resolveUser` receives the web `Request` (headers and cookies). Return `{ id }` or `null`.
- A resolver that throws is treated as anonymous, so tools must still check `ctx.user` themselves.
- Set `allowAnonymous` explicitly based on my answer. If anonymous use is allowed, make sure no tool
  returns user-specific data without checking `ctx.user`.

Store: in-memory is for development only; it loses everything on restart and does not work across
serverless instances or replicas. If the project uses MongoDB, offer `createMongoStore({ db })` from
`speeq/store-mongodb` (requires installing `mongodb` 6 or newer; it creates `speeq_sessions` and
`speeq_events` collections). For other databases there is no ready adapter; tell me, and do not write a
custom store unless I ask (the contract is in `docs/guides/stores.md`).

**Verify stage 5:** run a real conversation end to end in the browser, not with the mock: ask the
assistant to open a registered page and confirm the app navigates there; ask a read question that uses a
tool; if a write tool exists, confirm the approval dialog appears and that Reject really prevents the
change. Also run, with `<id>` and `<token>` taken from the first response:

```bash
curl -s -X POST http://localhost:3000/api/speeq/session -H 'Content-Type: application/json' -d '{}'
```

If `allowAnonymous` is false, the request without a signed-in cookie must be rejected. Report results.

## 6. Production hardening checklist

Do these, or tell me what blocks them:

1. `SPEEQ_SECRET`: the handler needs a stable signing secret of at least 32 random characters, shared by
   all instances. In production the SDK requires it explicitly. Tell me to generate one (for example
   `openssl rand -base64 32`) and set it in the hosting environment. Add the name to `.env.example`.
2. Durable store as in stage 5. No in-memory store in production.
3. `allowedOrigins`: leave empty for same-origin. Add exact origins only if a browser client on a
   different origin calls the handler.
4. Rate limits are per instance; mention that to me if the app runs on several instances.
5. Streaming: confirm the host and any proxy or CDN in front of the app do not buffer
   `text/event-stream` responses, and that the route's maximum duration allows several model round trips.
6. Audit viewer (only if I want it): add `audit: { authorize: async (request) => /* real admin check */ }`.
   `authorize` must return an explicit `true` only for administrators. Without it the audit routes return 404.
   Then build an admin-only page with `useAuditSessions({ endpoint: "/api/speeq", filter: { limit: 25 } })`
   and `useAuditSession(selectedId, { endpoint: "/api/speeq" })`, protected on the server like any other
   admin page. Hiding the link is not protection.
7. Privacy: audit logs store conversation text. Built-in masking runs first; add `audit.redact` and
   `audit.retentionDays` if I ask. Run `assistant.purgeExpired()` from a protected scheduled job to
   enforce retention. Tell me what is stored (`docs/concepts/privacy.md`).
8. Voice (only if I want it): remove `speakReplies={false}` to let replies be spoken, and add a mic
   button that calls `startListening()` and `stopListening()`. Web Speech support varies by browser;
   keep the text input as the fallback and handle `snapshot.support`.

## 7. Final report

Finish with a short report:

- Files created and modified (paths only).
- Env variable names I must set, and which are secrets.
- What you verified and the exact commands, and what you could not verify and why.
- Anything you skipped, any assumption you made, and any risk you noticed (especially tools that touch
  user data and pages that rely on client-side checks).
- Do not paste any secret value, token or session id into the report.
````

## Next steps

- Prefer doing it by hand? Follow the [Quickstart](/docs/quickstart).
- See every server setting: [Server settings](/docs/reference/server-config).
