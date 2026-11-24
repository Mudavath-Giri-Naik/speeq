# TASK 004 — apps/demo: fake data, pages, demo auth, speeq wiring, mock LLM

Branch: task/004-demo-wiring (create it from latest main)

## 1. Read first

- `AGENTS.md` (all rules apply)
- `docs/SPEC.md` §8 "Demo app" (if the file is missing, this brief is complete)
- `packages/server/README.md`, `packages/server/src/config.ts`, `packages/server/src/define.ts`,
  `packages/server/src/next.ts`, `packages/server/src/agent/prompt.ts` (system prompt format)
- `packages/testing/src/mock-llm.ts` (`createMockLLMProvider`) and `packages/testing/src/http.ts`
  (`startSession`, `readSseEvents`, `assistantText`, `jsonRequest`)
- `packages/adapters/store-memory`, `packages/adapters/store-mongodb/README.md`,
  `packages/adapters/llm-openai-compatible/README.md`, `packages/adapters/llm-gemini/README.md`
- `.env.example`, `turbo.json`, `biome.json`, `tooling/tsconfig/nextjs.json`

## 2. Goal

`apps/demo` (package `@speeq/demo`) becomes a small Next.js exam-prep site with fake in-memory
data. It has server-rendered content pages, a demo sign-in, and a fully wired
`/api/speeq/[[...speeq]]` route: routes manifest, tools (including a confirmed write tool), a
knowledge source, and `audit.authorize`. With no API key it runs on a keyword mock LLM that
handles English, Telugu and Hindi. **No speeq UI in this task.** The mic button, transcript and
dialogs, `/admin/conversations` and Playwright come in task 005.

## 3. Decisions already made (do NOT change or re-decide)

1. **Stack.** Next.js `16.4.6`, React/React DOM `19.3.1`, App Router, TypeScript,
   `export const runtime = "nodejs"` on the speeq route. Pin exact versions. Styling is one plain
   `app/globals.css` (no Tailwind, no UI library). The tsconfig extends
   `@speeq/tsconfig/nextjs.json`. Port 3000. Depend on workspace packages with `workspace:*`:
   `@speeq/server`, `@speeq/client`, `@speeq/react`, `@speeq/store-memory`,
   `@speeq/store-mongodb`, `@speeq/llm-openai-compatible`, `@speeq/llm-gemini`, `@speeq/testing`
   (a runtime dependency here, because the mock LLM ships in the demo), plus `zod` and `mongodb`.
   The package is `"private": true`.
2. **Layout.**
   - `lib/data/` has the fake data and the repository.
   - `lib/demo-auth.ts` is the demo auth.
   - `lib/llm.ts` selects the provider.
   - `lib/mock-rules.ts` has the mock LLM rules.
   - `lib/speeq-config.ts` is the factory `createDemoSpeeq(options)`, which tests can construct.
   - `lib/speeq.ts` is the app singleton.
   - `app/api/speeq/[[...speeq]]/route.ts` is the route.
3. **Fake data** (original, simple and factually correct; no copied exam content). 6 subjects
   (`physics`, `chemistry`, `mathematics`, `biology`, `history`, `geography`), **10 questions
   each** (ids 1–60, unique), each with `subject`, `topic`, `difficulty` (`easy|medium|hard`),
   `prompt`, 4 `options`, `answerIndex` and `explanation`. Each subject has 3–4 topics, and each
   topic has a 1–2 sentence `summary` (used by the knowledge source). Each subject has display
   names `{ en, te, hi }` (e.g. physics: Physics / భౌతిక శాస్త్రం / भौतिकी). Access goes through a
   small `QuestionRepository` interface (`listSubjects`, `getSubject`, `listQuestions(filter)`,
   `countQuestions(filter)`, `getQuestion(id)`, `listTopics(subject)`, `search(query, limit)`), with an
   in-memory implementation.
4. **Pages** (server components, read via the repository):
   - `/` Home
   - `/subjects`
   - `/subjects/[slug]` (`notFound()` for unknown slugs)
   - `/practice` (filters `subject`, `difficulty`, `q` from `searchParams`, via a plain GET form)
   - `/questions/[id]`
   - `/pricing` (three fake plans in ₹)
   - `/about`
   - `/login`
   - A shared header with a nav and the signed-in user's name plus Sign out.
5. **Routes manifest** (`lib/routes.ts`, `defineRoute`). Ids: `home /`, `subjects /subjects`,
   `subject /subjects/:slug` (params `{ slug: z.enum(<the 6 slugs>) }`), `practice /practice`
   (params, all optional: `subject` enum, `difficulty` enum, `q` string max 100),
   `question /questions/:id` (params `{ id: z.string().regex(/^\d{1,4}$/) }`), `pricing`, `about`,
   `login`. Each has a short `description`. Do not add `/admin/*` (task 005 adds it).
6. **Demo auth (security-relevant: implement exactly this).**
   - `DemoUser = { id: string; name: string; role: "student" | "admin" }`. A fixed list:
     `student-1` "Asha" (student), `student-2` "Ravi" (student), `admin` "Demo admin" (admin).
   - Cookie name `speeq_demo_session`. Value `<payload>.<sig>`. `payload` = base64url(UTF-8 JSON
     `{ "sub": string, "exp": number }`) where `exp` is in Unix **seconds**. `sig` = base64url(HMAC-SHA256
     over the ASCII `payload` string). The key is the raw bytes of HMAC-SHA256(key = UTF-8 secret,
     message = `"speeq-demo-auth-v1"`), for domain separation from the speeq session tokens. Use
     Web Crypto (`crypto.subtle`).
   - Verification returns `null` (never throws) unless all of these hold: exactly one `.`,
     both parts are valid base64url, the signature verifies via `crypto.subtle.verify`
     (constant-time), the payload parses to an object with string `sub` and number `exp`,
     `exp > now`, and `sub` is in the fixed list. **The role always comes from the fixed list.**
     Extra payload fields are ignored.
   - Secret: `SPEEQ_SECRET`. If it is unset and `NODE_ENV !== "production"`, use the constant
     `"speeq-demo-dev-secret-not-for-production"`. If it is unset in production, signing fails and
     verification returns `null` (fail closed). The login page then shows "Server is not configured".
   - Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when
     `NODE_ENV === "production"`, `Max-Age` = 7 days (and the same `exp`).
   - `/login` uses **server actions**.
     - "Continue as Asha/Ravi": students only. Reject ids that are not students.
     - "Admin" with a password field. The password is `DEMO_ADMIN_PASSWORD`. If that is unset, it is
       `"admin"` only when `NODE_ENV !== "production"`. In production without it, admin sign-in is
       disabled.
     - Compare the SHA-256 digests of both strings with `crypto.timingSafeEqual` (`node:crypto`).
     - A wrong password waits 500 ms, then shows an error.
     - "Sign out" deletes the cookie.
     - After sign-in, redirect to `/` (no open redirect: ignore any `next` param).
   - Exports: `readDemoUser(request: Request)` (parses the `Cookie` header; multiple cookies,
     spaces, and missing header are all handled) and `getCurrentUser()` (via `next/headers`
     `cookies()`, for pages and actions). Keep the signing/verifying core in pure functions that take
     `secret` and `now` parameters, so they can be tested without Next.
7. **speeq config** (`createDemoSpeeq({ env, waitUntil?, mockDelayMs? })`):
   - `secret: env.SPEEQ_SECRET` (the dev fallback from decision 6 applies only to demo auth. speeq
     itself already handles missing secrets in dev).
   - `projectKey: env.SPEEQ_PROJECT_KEY`.
   - `agent`: name `"Vidya"`, short exam-prep instructions, `languages: ["en-IN","te-IN","hi-IN"]`.
   - `resolveUser: readDemoUser`, `allowAnonymous: true`.
   - `audit: { authorize: async (req) => (await readDemoUser(req))?.role === "admin", retentionDays: 30 }`.
   - Store: `MONGODB_URI` set → `createMongoStore({ db: <MongoClient(uri).connect() → db(MONGODB_DB ?? "speeq_demo")> })`.
     Otherwise use `MemoryStore` and log one warning ("in-memory store: conversations reset on
     restart"). The MongoClient, MemoryStore and bookmarks map are singletons on `globalThis` in
     `lib/speeq.ts`, so they survive dev hot reloads. Tests use a fresh MemoryStore.
   - The route file passes `waitUntil: (p) => after(p)` from `next/server`.
   - Telemetry: nothing extra. The server reads `SPEEQ_PLATFORM_URL`/`SPEEQ_TELEMETRY` itself.
8. **LLM selection** (`selectLlm(env)` → `{ provider, mode: "groq" | "gemini" | "mock" }`):
   - If `SPEEQ_LLM` is `groq|gemini|mock`, use it. If the chosen provider has no key, fall back to
     mock and log a warning.
   - Otherwise use Groq if `GROQ_API_KEY` is set, then Gemini if `GEMINI_API_KEY` is set, else mock.
   - Groq: `createOpenAICompatibleProvider({ baseURL: GROQ_BASE_URL ?? "https://api.groq.com/openai/v1", apiKey, model: GROQ_MODEL ?? "llama-3.3-70b-versatile" })`.
   - Gemini: `createGeminiProvider({ apiKey, model: GEMINI_MODEL ?? "gemini-3.8-flash" })`.
   - Export `llmMode` from `lib/speeq.ts` for the mock badge in task 005.
9. **Tools** (`lib/tools.ts`, `defineTool`, typed with `DemoUser`):
   - `list_subjects({})` returns `{ subjects: [{ slug, name, questionCount }] }`.
   - `count_questions({ subject?, topic?, difficulty? })` returns `{ count, filter }`.
   - `list_topics({ subject })` returns `{ subject, topics: [{ name, count }] }`.
   - `get_question({ id: number int 1..9999 })` returns the question, or
     `SpeeqError("NOT_FOUND", { message: "No question with that number." })`.
   - `list_bookmarks({})`: anonymous gets `{ bookmarks: [] , signedIn: false }`.
   - `bookmark_question({ questionId: number int })`: `risk: "write"` (confirmation by default) with
     `confirmationSummary` = `Bookmark question <id>: "<prompt, max 60 chars>…"?`.
     - Handler: anonymous → `SpeeqError("FORBIDDEN", { message: "Sign in to bookmark questions." })`.
     - Unknown id → NOT_FOUND.
     - Otherwise add it to the in-memory `Map<userId, Set<id>>` (idempotent) and return
       `{ bookmarked: true, questionId, total }`.
10. **Knowledge source** `questions`. It searches topic summaries and questions (prompt, topic,
    explanation) with simple case-insensitive token scoring and returns the top 5.
    - Topic hits: `{ id: "topic:<subject>:<topic>", title, content: summary, href: "/subjects/<slug>" }`.
    - Question hits: `{ id: "q:<id>", title: "Question <id>", content: prompt + explanation, href: "/questions/<id>" }`.
11. **Mock LLM** (`createDemoMockLlm({ repo, delayMs })` using `createMockLLMProvider`).
    - Reply language: parse the session language from the system prompt line
      `Always reply in <Name> (<tag>)` (first system message). The default is `en-IN`. All mock reply text
      comes from a small `{ "en-IN", "te-IN", "hi-IN" }` string table.
    - Page context: parse the JSON between `<page_context>` and `</page_context>` (ignore errors).
    - Rules, in this order (match English, Telugu and Hindi keywords; subjects are matched by slug or
      any of their en/te/hi names):
      1. bookmark (`bookmark|బుక్‌మార్క్|बुकमार्क`): use the number in the text, else
         `pageContext.data.questionId`, and call `bookmark_question`. If neither exists, reply
         "Open a question first, then say bookmark this question."
      2. count (`how many|count|ఎన్ని|कितने`): call `count_questions` with the matched subject (if any).
      3. topics (`topics|అంశాలు|विषय सूची`) + subject: call `list_topics`.
      4. navigation (`go to|take me|open|show|తీసుకెళ్ళు|చూపించు|తెరువు|ले चलो|खोलो|दिखाओ`, or a bare page
         word): pricing (`pricing|price|plans|ధర|ధరలు|कीमत|प्राइसिंग`), practice
         (`practice|ప్రాక్టీస్|अभ्यास`), subjects, about, home, login, a subject name → `subject`,
         `question <n>` → `question`. Call `navigate`.
      5. knowledge (`tell me about|what is|explain|గురించి|के बारे में`): call `search_knowledge`
         with the remaining words.
      6. greeting / fallback: a localized one-line help text listing two example phrases.
    - `afterTool` gives localized templates per tool. Navigate: "Opening <title>." Count: "There are
      <n> questions in <subject name>." or "There are <n> questions." Topics: the list. Search: the
      first hit's content, max 300 chars. Bookmark: "Bookmarked question <id>." List bookmarks.
      Error results (non-JSON or `{error}`): "Sorry, that did not work: <message>".
    - `delayMs`: the app uses 15. Tests use 0.
12. **Turbo/dev.** `pnpm dev` from a fresh clone must start the demo (deps are built first via the
    existing `dev` → `^build`). The demo's scripts are `dev` (`next dev -p 3000`), `build`
    (`next build`), `start`, `typecheck` (must work without a prior `next build`: commit a
    `next-env.d.ts`, or run `next typegen` first, your choice), and `test` (vitest, node environment).
    If `next build` needs the env at build time, read env lazily (no top-level throw on missing keys).
13. **One env file at the repo root.**
    - `next.config.ts` calls `loadEnvConfig(<repo root>)` from `@next/env` (it ships with Next), so the
      root `.env` / `.env.local` is used. An `apps/demo/.env.local`, if present, still wins (it is loaded
      by Next as usual). Tests never load env files: they pass `env` explicitly.
    - `selectLlm` and the auth helpers `trim()` every env value and treat empty strings as unset.

## 4. Scope

Create:

- `apps/demo/**` (package.json, next.config.ts, tsconfig.json, vitest.config.ts, .env.example
  with the demo variables only, README.md (short: run, env, mock mode, how auth works),
  `app/**`, `lib/**`, `test/**`)

Modify:

- `.env.example`: add `MONGODB_URI=` and `MONGODB_DB=speeq_demo` to the demo section, with a comment
  ("optional, in-memory store when empty").
- `pnpm-lock.yaml`
- `handoff/INDEX.md` (add row 004 `in-progress` at start)
- `biome.json` / `turbo.json` only if strictly needed for the app (say why in the report).

Do NOT touch: `packages/**`, `scripts/**`, `.github/**`, `docs/**`. If a package bug blocks you,
stop and describe it under "Open questions". Do not work around it inside the package.

## 5. Requirements

1. All of decisions 1–13 are implemented as written.
2. On a fresh clone with no `.env`, `pnpm --filter @speeq/demo dev` serves every page with no
   runtime error, and `POST /api/speeq/session` returns 200 in mock mode.
3. Every manifest route path has a matching page file. Every subject slug in the route enum
   equals the data slugs.
4. No secret value is ever logged. Errors to the browser never include stack traces.
5. The repository, tools and mock rules have JSDoc on exports. The code is example quality: short,
   readable, and commented where the "why" is not obvious (developers will copy it).

## 6. Contracts

```ts
// lib/demo-auth.ts
export interface DemoUser { id: string; name: string; role: "student" | "admin" }
export const DEMO_USERS: readonly DemoUser[];
export const DEMO_COOKIE = "speeq_demo_session";
export function signDemoSession(sub: string, secret: string, nowSeconds: number): Promise<string>;
export function verifyDemoSession(value: string | undefined, secret: string, nowSeconds: number): Promise<DemoUser | null>;
export function demoAuthSecret(env?: NodeJS.ProcessEnv): string | null;
export function checkAdminPassword(input: string, env?: NodeJS.ProcessEnv): boolean; // false when disabled
export function readDemoUser(request: Request): Promise<DemoUser | null>;
export function getCurrentUser(): Promise<DemoUser | null>;

// lib/speeq-config.ts
export interface DemoSpeeqOptions {
  env: Record<string, string | undefined>;
  waitUntil?: (p: Promise<unknown>) => void;
  mockDelayMs?: number;
  store?: ConversationStore;          // tests inject MemoryStore
  bookmarks?: Map<string, Set<number>>;
}
export function createDemoSpeeq(options: DemoSpeeqOptions): { speeq: Speeq; llmMode: "groq" | "gemini" | "mock" };
```

## 7. Tests required (vitest in `apps/demo/test`, node environment)

1. **Data:** 6 subjects, 60 questions, unique ids 1–60, every subject has 10 questions, every question's
   subject/topic exists, `answerIndex` is in range, and te/hi names exist.
2. **Repository:** counts by subject/topic/difficulty, topics with counts, search ranking (a topic
   name query returns that topic first), unknown id → `undefined`.
3. **Auth:**
   - sign/verify roundtrip
   - tampered payload, tampered signature, wrong secret, expired, unknown `sub`
   - a payload with an extra `role:"admin"` for `student-1` still gives the student role
   - malformed values: empty, no dot, two dots, bad base64, non-JSON, `exp` as a string
   - cookie header parsing with several cookies or a missing header
   - secret rules (dev fallback, production null)
   - admin password: dev default works, production without the env is disabled, wrong password is false
4. **End-to-end via `speeq.handler`** (mock LLM, fresh MemoryStore, `@speeq/testing` helpers):
   - "take me to pricing" → a `navigate` event to `/pricing`.
   - "how many questions are there in physics" → the text contains `10`.
   - "show me subject chemistry" → navigate to `/subjects/chemistry`.
   - "tell me about <a topic>" → the text contains that topic's summary.
   - Telugu (`te-IN` session) "ధరలు చూపించు" → navigate to `/pricing`, and the reply is the Telugu string.
   - Hindi (`hi-IN`) "भौतिकी में कितने प्रश्न हैं" → the reply contains `10`, in Hindi.
   - Bookmark as a signed-in student (cookie header): "bookmark question 12" → `confirmation.required`
     with the summary. Approve → bookmarked, and `list_bookmarks` shows 12. Reject → not stored.
   - "bookmark this question" with `context.data.questionId = 7` → a confirmation for 7.
   - Anonymous bookmark → after approval, the error message "Sign in to bookmark questions."
   - Audit: `GET /api/speeq/audit/sessions` with no cookie → 403, a student → 403, the admin → 200 and
     lists the sessions.
5. **Routes:** every manifest path maps to a file under `app/` (scan the filesystem), and the slug enum
   matches the data.
6. **LLM selection:** the full matrix of decision 8 (no network: just check `mode` and `provider.kind`).

## 8. Acceptance

- `bash scripts/verify.sh` passes (it now includes the demo's lint, typecheck, test and `next build`).
- `pnpm --filter @speeq/demo build && pnpm --filter @speeq/demo start`, then `curl` `/`, `/practice?subject=physics`,
  `/questions/12`, `/pricing`, and `POST /api/speeq/session` with `{"language":"en-IN"}`. Report the
  status codes.
- In the report, give the numbers of the test cases that cover each auth rule in decision 6.

## 9. Finish

Commit on the branch (Conventional Commits, e.g. `feat(demo): add demo site with speeq wiring`, no
attribution). Write `handoff/reports/004-demo-wiring.md` using `handoff/REPORT_TEMPLATE.md` and
print it at the end. Do not merge to main. Do not push.
