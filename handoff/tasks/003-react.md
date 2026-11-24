# TASK 003 — @speeq/react hooks + audit client in @speeq/client

Branch: task/003-react (create it from latest main)

## 1. Read first

- `AGENTS.md` (all rules apply)
- `docs/SPEC.md` §6.4 (if the file is missing, this brief is complete)
- `packages/client/src/types.ts`, `client.ts`, `index.ts`, `tsup.config.ts` (how core types are materialized into the client's `.d.ts`)
- Audit API on the server: `packages/server/src/handler/audit.ts`. Response schemas: `packages/core/src/schemas/audit.ts` (`SessionListResponse`, `SessionDetailResponse`, `SessionSummary`, `ConversationEvent`)
- `scripts/deps-rules.ts` (react may depend on `@speeq/client` and peer `react` only)

## 2. Goal

1. Add a framework-agnostic **audit client** (`createAuditClient`) to `@speeq/client`, for building a developer's own admin page.
2. Create `@speeq/react`: a provider plus hooks. It ships no UI components, is SSR-safe, works with React 18.2+ and 19, and is marked `"use client"`.

## 3. Decisions already made (do NOT change or re-decide)

1. **`@speeq/react` dependencies:** `dependencies: { "@speeq/client": "workspace:*" }`, `peerDependencies: { "react": "^18.2.0 || ^19.0.0" }`. It must **not** import `@speeq/core` at all, not even types. Everything it needs (types, `SpeeqError`) comes from `@speeq/client`. Its built `dist` keeps `@speeq/client` and `react` external.
2. **Client additions** (still zero runtime deps):
   - `createAuditClient` and its types in `packages/client/src/audit.ts`.
   - Re-export `SpeeqError` and `isSpeeqError` from `@speeq/client` (bundled from `@speeq/core/errors`).
   - Extend the type materialization in `packages/client/tsup.config.ts` so that `SessionListResponse`, `SessionDetailResponse`, `SessionSummary`, `ConversationEvent` and `SessionFilter` are inlined like `ClientConfig`/`ProtocolEvent`.
   - Export all of them as types from `@speeq/client`.
3. **Audit HTTP**
   - `GET {endpoint}/audit/sessions?userId&from&to&limit&cursor`: omit params that are undefined, null or `""`.
   - `GET {endpoint}/audit/sessions/{encodeURIComponent(id)}`.
   - Default `credentials: "include"`, so the developer's own cookies authenticate.
   - Non-2xx with a JSON body `{ error: { code, message, retryable } }` → throw `new SpeeqError(code, { message, retryable })`. Non-JSON → `SpeeqError("INTERNAL")`. `fetch` throws (not abort) → `SpeeqError("INTERNAL", { message: "Could not reach the server.", retryable: true })`. Abort → rethrow the abort error as-is.
   - Light shape check on success (the `sessions` array / `session` + `events` array present), otherwise `SpeeqError("INTERNAL")`.
4. **Provider creates the client once** with `useState(() => createSpeeqClient(...))`. `endpoint`, `languages`, `language`, `speech`, `speakReplies`, `autoSendOnFinal`, `persistSession` and `fetch` are read **once** (document it). `onNavigate` and `getContext` are read through refs, so changing their identity never recreates the client. A `client` prop (bring your own) is used as-is, and the provider never cancels it.
5. **Unmount:** the provider calls `client.cancel()` in its effect cleanup, **not** `destroy()`, so React StrictMode's double mount keeps working.
6. **SSR / hydration:** `useSyncExternalStore(client.subscribe, client.getSnapshot, getServerSnapshot)`. `getServerSnapshot` returns **one constant object per client**: the client's initial snapshot with `support = { speechInput: false, speechOutput: false, voiceForLanguage: null }`. Server HTML and the hydration render therefore match. No browser globals are touched during render.
7. **Page context:** `useSpeeqContext(data)` registers a `Record<string, unknown>` in a provider-owned registry, kept in a ref and updated on every render, with no effect-dependency churn. It is removed on unmount. The provider's `getContext` passed to the client merges, in order: the `getContext` prop result, then `data` from every registered hook in mount order (shallow merge into `context.data`).
8. **Hook outside the provider** → throw `Error("useSpeeq must be used inside <SpeeqProvider>")` (same pattern for the other provider hooks).
9. **`"use client"`:** both the ESM and the CJS output of `@speeq/react` start with `"use client";`. Use the tsup `banner`, and verify that it is the first line of each built file.
10. **Audit hooks** own their state. There is no SWR or react-query. Aborting on unmount or param change and ignoring stale responses are required. `useAuditSessions` resets when the filter changes (compare a stable JSON key of the filter).

## 4. Scope

Create:

- `packages/client/src/audit.ts`, `packages/client/test/audit.test.ts`
- `packages/react/` (`package.json`, `tsconfig.json` with `"jsx": "react-jsx"`, `tsup.config.ts`, `vitest.config.ts`, `README.md`)
- `packages/react/src/index.ts`, `provider.tsx`, `hooks.ts`, `context-registry.ts`, `audit-hooks.ts`
- `packages/react/test/*.test.tsx`

Modify:

- `packages/client/src/index.ts`, `packages/client/tsup.config.ts`, `packages/client/README.md` (add an "Audit client" section)
- `pnpm-lock.yaml` (via `pnpm install`)
- `handoff/INDEX.md` (add row 003 `in-progress`)

Do NOT touch: `packages/core`, `packages/server`, `packages/testing`, adapters, `scripts/`, root configs. Existing client behavior and contracts must not change.

## 5. Requirements

1. The audit client works per decision 3. The React provider and hooks work per decisions 4–10 and §6.
2. `useSpeeq()` returns snapshot fields plus **referentially stable** action functions (same identity across renders).
3. `useSpeeqEvent(event, handler)` subscribes to `client.on(event, …)`. The handler is held in a ref, so a changing handler identity does not resubscribe.
4. `useAuditSessions` supports `loadMore()` (uses `nextCursor`, appends), `refresh()` (resets), `hasMore`, `loading`, `error`. `useAuditSession(id)` returns `{ session, events, loading, error, refresh }`, and with `id === null` it does nothing and returns empty state.
5. JSDoc on every export. README: install; Next.js App Router example (provider in a client component wired to `useRouter().push` for `onNavigate`); `useSpeeq` fields table; `useSpeeqContext` example (e.g. the current question id); `useSpeeqEvent`; audit hooks example for an admin page; the SSR/hydration note (decision 6); and the "options read once" note.

## 6. Contracts

```ts
// @speeq/client (additions)
export interface AuditClientOptions {
  endpoint: string;
  fetch?: typeof fetch;
  /** Default "include". */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}
export interface AuditListParams {
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
}
export interface AuditClient {
  listSessions(params?: AuditListParams, signal?: AbortSignal): Promise<SessionListResponse>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetailResponse>;
}
export function createAuditClient(options: AuditClientOptions): AuditClient;
export { SpeeqError, isSpeeqError };
export type {
  SessionListResponse,
  SessionDetailResponse,
  SessionSummary,
  ConversationEvent,
  SessionFilter,
};

// @speeq/react
export interface SpeeqProviderProps extends SpeeqClientOptions {
  children: React.ReactNode;
  /** Use an existing client instead of creating one. The other options are then ignored. */
  client?: SpeeqClient;
}
export function SpeeqProvider(props: SpeeqProviderProps): React.JSX.Element;

export interface UseSpeeqResult extends SpeeqSnapshot {
  client: SpeeqClient;
  sendText: SpeeqClient["sendText"];
  startListening: SpeeqClient["startListening"];
  stopListening: SpeeqClient["stopListening"];
  cancel: SpeeqClient["cancel"];
  setLanguage: SpeeqClient["setLanguage"];
  confirm: SpeeqClient["confirm"];
  speak: SpeeqClient["speak"];
}
export function useSpeeq(): UseSpeeqResult;
export function useSpeeqContext(data: Record<string, unknown>): void;
export function useSpeeqEvent<K extends keyof SpeeqClientEvents>(
  event: K,
  handler: (payload: SpeeqClientEvents[K]) => void,
): void;

export function useSpeeqAudit(options: AuditClientOptions): AuditClient; // memoized on endpoint + credentials
export interface UseAuditSessionsOptions extends AuditClientOptions {
  filter?: Omit<AuditListParams, "cursor">;
}
export interface UseAuditSessionsResult {
  sessions: SessionSummary[];
  loading: boolean;
  error: SpeeqError | null;
  hasMore: boolean;
  loadMore(): void;
  refresh(): void;
}
export function useAuditSessions(options: UseAuditSessionsOptions): UseAuditSessionsResult;
export interface UseAuditSessionResult {
  session: SessionSummary | null;
  events: ConversationEvent[];
  loading: boolean;
  error: SpeeqError | null;
  refresh(): void;
}
export function useAuditSession(
  sessionId: string | null,
  options: AuditClientOptions,
): UseAuditSessionResult;

// Re-export for convenience (types only + SpeeqError/isSpeeqError values) from @speeq/client:
export type {
  SpeeqSnapshot,
  SpeeqState,
  ChatMessage,
  PendingConfirmation,
  NavigateAction,
  SpeeqClient,
  SpeeqClientOptions,
  SpeeqClientEvents,
  AuditClient,
  AuditClientOptions,
  AuditListParams,
  SessionSummary,
  ConversationEvent,
} from "@speeq/client";
export { SpeeqError, isSpeeqError } from "@speeq/client";
```

## 7. Tests required

Audit client (`packages/client/test/audit.test.ts`). Use a real `createSpeeq` handler from `@speeq/server` with `audit.authorize` plus a fake `fetch`:

1. Lists sessions and gets one session with ordered events. Query params are encoded, empty params are omitted, `credentials` defaults to `"include"`, and custom headers are sent.
2. 404 (no `authorize`) → `SpeeqError` code `NOT_FOUND`. 403 → `FORBIDDEN`. Non-JSON 500 → `INTERNAL`. `fetch` throws → `INTERNAL` "Could not reach the server.". Abort rethrows the abort error. Malformed success body → `INTERNAL`.

React (use `@testing-library/react` with a `jsdom` test environment set in `packages/react/vitest.config.ts`; add `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/dom` and `jsdom` as **devDependencies** only, at current stable versions):

3. `useSpeeq` outside the provider throws the exact message.
4. A text turn through a fake `fetch` (or a real handler) updates `messages`/`state` in a rendered component. Action identities are stable across re-renders.
5. `onNavigate` prop changes identity between renders → the client is **not** recreated, and the latest callback is called.
6. `useSpeeqContext` from two components → both `data` objects are merged into the turn request body's `context.data`. Unmounting one removes its data. The value updates without remounting.
7. `useSpeeqEvent` receives `navigate`/`event` payloads. Changing the handler does not resubscribe (count `client.on` calls via a spy on a provided `client`).
8. StrictMode: the provider still works after the double mount (a turn completes).
9. A provided `client` prop is used and not cancelled on unmount.
10. SSR: `renderToString` (from `react-dom/server`, node environment; put this test in a separate file with `// @vitest-environment node`) renders `state` and `support.speechInput=false` without throwing. `getServerSnapshot` returns the same object on repeated calls.
11. `useAuditSessions`: first page, `loadMore` appends with the cursor, `hasMore` false at the end, a filter change resets, `error` set on 403, stale response ignored after a filter change, abort on unmount (no state update warning).
12. `useAuditSession(null)` does nothing. `useAuditSession(id)` loads events. `refresh()` reloads.

## 8. Acceptance

- `scripts/verify.sh` passes.
- `pnpm --filter @speeq/client build`: still no `@speeq/core`/`zod` in `dist/index.js`/`.cjs`, the `.d.ts` is self-contained (the new audit types are inlined), and the dependencies list is still empty. Report the new ESM size.
- `pnpm --filter @speeq/react build`: `dist/index.js` and `dist/index.cjs` start with `"use client";`, and import only `react`, `react/jsx-runtime` and `@speeq/client`. Report the ESM size.
- `pnpm lint` dependency-direction check passes, with no rule changes.

## 9. Finish

Commit on the branch (Conventional Commits, e.g. `feat(react): add provider, hooks and audit hooks`, plus a separate `feat(client): add audit client` commit is fine; no attribution). Write `handoff/reports/003-react.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push.
