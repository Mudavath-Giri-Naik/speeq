# REPORT 001 — Client core

Status: DONE

Branch / last implementation commit: `task/001-client-core` / `ac3ecb6`

Verify: lint ✅ · typecheck ✅ · tests 145 passed / 0 failed · build ✅

Files: 15 created, 1 modified, 0 deleted

- `packages/client/package.json`
- `packages/client/tsconfig.json`
- `packages/client/tsup.config.ts`
- `packages/client/vitest.config.ts`
- `packages/client/README.md`
- `packages/client/src/index.ts`
- `packages/client/src/types.ts`
- `packages/client/src/client.ts`
- `packages/client/src/session.ts`
- `packages/client/src/stream.ts`
- `packages/client/src/speech-queue.ts`
- `packages/client/src/context.ts`
- `packages/client/test/client.test.ts`
- `packages/client/test/integration.test.ts`
- `handoff/reports/001-client-core.md`
- `handoff/INDEX.md`

What I did:

- Implemented lazy sessions, token refresh, streamed messages, navigation and confirmation handling.
- Added immutable snapshots, voice input, ordered sentence playback and barge-in.
- Added 23 client tests, including approval, replay rejection and rate limiting against the real server handler.
- Ran the filtered client build. The ESM bundle is **24,796 bytes**. Both JavaScript bundles passed the scan for `@speeq/core` and `zod`, and both loaded in Node.
- Verified that both declaration bundles are self-contained and the manifest has zero runtime or peer dependencies.

Deviations from the brief: none.

Decisions I had to make (please review):

- Kept the local message ID when authoritative assistant text arrives so subscribers can track the same message throughout streaming.
- Expanded schema-derived types during declaration generation so consumers can typecheck the client without installing core or Zod.

Risks / unsure about: The root lockfile is outside scope. Turbo warned about the missing client entry during verification. A fresh frozen install requires that entry.

Open questions: none.
