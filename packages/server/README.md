# @speeq/server

The [speeq](../../README.md) runtime. It runs **in your backend**: tools use your database and the
signed-in user's permissions, and conversations go to your own store. speeq (the project) never
sees them.

```bash
pnpm add @speeq/server @speeq/store-mongodb @speeq/llm-openai-compatible zod
```

## Quick start (Next.js App Router)

```ts
// lib/speeq.ts
import { createSpeeq, defineRoute, defineTool } from "@speeq/server";
import { createOpenAICompatibleProvider } from "@speeq/llm-openai-compatible";
import { createMongoStore } from "@speeq/store-mongodb";
import { z } from "zod";

export const speeq = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Helper", instructions: "You help students use this site." },
  llm: createOpenAICompatibleProvider({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY!,
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  }),
  store: createMongoStore({ db: getDb() }),
  resolveUser: async (req) => getUserFromYourAuth(req), // { id, roles } | null
  routes: [defineRoute({ id: "practice", path: "/practice", title: "Practice" })],
  tools: [
    defineTool({
      name: "count_questions",
      description: "Count questions for a subject",
      input: z.object({ subject: z.string() }),
      handler: async ({ subject }, ctx) => ({ count: await countQuestions(subject, ctx.user) }),
    }),
  ],
  audit: { authorize: async (req) => isAdmin(req) },
});
```

```ts
// app/api/speeq/[[...speeq]]/route.ts
import { createNextHandler } from "@speeq/server/next";
import { speeq } from "@/lib/speeq";

export const runtime = "nodejs";
export const { GET, POST, OPTIONS } = createNextHandler(speeq);
```

`speeq.handler` is a plain `(Request) => Promise<Response>`, so it also works with any
Fetch-API server (Hono, Bun, Deno, Node with an adapter).

## What it does on each turn

1. Checks the signed session token and that the same user is still signed in.
2. Stores the user message, then rebuilds history from your store (this is serverless-safe).
3. Builds the system prompt: your instructions, the reply language, your route list, the page
   context and the safety rules.
4. Calls the model, streams `assistant.delta` events, and runs the tools it asks for. Arguments
   are validated with Zod, tools run under a timeout, and output is truncated. It stops at
   `maxSteps`; on the last step the model gets no tools.
5. Write tools (`risk: "write"`) do **not** run. The stream ends with `confirmation.required`,
   and the tool runs only after `POST /session/:id/confirm` with `approved: true`. Each
   confirmation can be answered once, only by its own session and user.
6. Writes every step to the audit log.

## Built-in tools

- `navigate({ routeId, params? })`: only ids from `routes` are accepted, and params are checked
  against the route's schema. The server only **emits** a `navigate` event. Your client decides
  how to route.
- `search_knowledge({ query, sourceId? })`: available when `knowledge` sources are configured.

## Security defaults

| Default                                                                     | How to change it                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Audit routes return 404                                                     | Set `audit.authorize` (403 when it returns false)              |
| Write tools need confirmation                                               | `requiresConfirmation: false` (not recommended)                |
| Same-origin only                                                            | `allowedOrigins: ["https://app.example"]`                      |
| 32 KiB body limit, 8 s tool timeout, 8000-char tool output                  | `guardrails`                                                   |
| 20 turns/min per user or IP and per session                                 | `guardrails.rateLimit` (**best effort**: counted per instance) |
| Secret keys in tool args (`password`, `token`, …) redacted in the audit log | add `audit.redact` for more                                    |

Raw error messages and stack traces never reach the client or the model. Tools can throw
`new SpeeqError("FORBIDDEN", { message })` to give the user a safe reason.

Redaction note: stored events are also the history the model sees on later turns, and a write
tool is re-validated from its stored arguments when it is confirmed. Don't put secrets in
write-tool arguments.

## Configuration

See [`docs/reference/config.md`](../../docs/reference/config.md) for every option and
[`docs/reference/protocol.md`](../../docs/reference/protocol.md) for the wire protocol.
