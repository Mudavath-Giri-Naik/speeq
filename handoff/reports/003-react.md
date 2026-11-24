# REPORT 003 — React hooks and audit client

Status: DONE

Branch / last implementation commit: `task/003-react` / `b25902d`

Verify: lint ✅ · typecheck ✅ · tests 180 passed / 0 failed · build ✅

Files: 16 created, 5 modified, 0 deleted

- `packages/client/src/audit.ts`
- `packages/client/test/audit.test.ts`
- `packages/client/src/index.ts`
- `packages/client/tsup.config.ts`
- `packages/client/README.md`
- `packages/react/package.json`
- `packages/react/tsconfig.json`
- `packages/react/tsup.config.ts`
- `packages/react/vitest.config.ts`
- `packages/react/README.md`
- `packages/react/src/index.ts`
- `packages/react/src/provider.tsx`
- `packages/react/src/hooks.ts`
- `packages/react/src/context-registry.ts`
- `packages/react/src/audit-hooks.ts`
- `packages/react/test/provider.test.tsx`
- `packages/react/test/ssr.test.tsx`
- `packages/react/test/audit.test.tsx`
- `pnpm-lock.yaml`
- `handoff/INDEX.md`
- `handoff/reports/003-react.md`

What I did:

- Added the audit client for authorized session listing and event history, with abort and error handling.
- Added the headless React provider, conversation hooks, and audit hooks with pagination, refresh, and stale request handling.
- Documented Next.js setup, hook usage, and audit access. Ran `pnpm install` and committed the lockfile.
- Added 13 tests. The React suite ran on 19.3.1, and both React bundles passed an SSR smoke test on React 18.2.0.
- Client ESM is **33,406 bytes**. Both JavaScript bundles passed the core and Zod scan. All five audit types are inlined in self-contained declarations. The client has zero runtime or peer dependencies.
- React ESM is **7,695 bytes**. Both formats start with `"use client";` and import only `react`, `react/jsx-runtime`, and `@speeq/client`. Dependency-direction lint passed.

Deviations from the brief: See the browser initialization decision below.

Decisions I had to make (please review):

- Used the existing client constructor during provider initialization, as specified. On the browser's first render it performs its existing guarded speech capability check. SSR and hydration use the stable snapshot with speech support disabled.
- Reran `bash scripts/verify.sh` with `TURBO_CONCURRENCY=2` after a test worker ran out of memory at the default concurrency. The rerun passed.

Risks / unsure about: React 18.2.0 coverage is limited to the built-package SSR smoke test.

Open questions: none.
