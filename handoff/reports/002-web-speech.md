# REPORT 002 — Web Speech adapters

Status: DONE

Branch / last implementation commit: `task/002-web-speech` / `4b75c29`

Verify: lint ✅ · typecheck ✅ · tests 167 passed / 0 failed · build ✅

Files: 7 created, 5 modified, 0 deleted

- `packages/client/src/web-speech-types.ts`
- `packages/client/src/web-speech-input.ts`
- `packages/client/src/web-speech-output.ts`
- `packages/client/test/web-speech-input.test.ts`
- `packages/client/test/web-speech-output.test.ts`
- `packages/client/test/defaults.test.ts`
- `packages/client/README.md`
- `packages/client/src/client.ts`
- `packages/client/src/types.ts`
- `packages/client/src/index.ts`
- `handoff/INDEX.md`
- `handoff/reports/002-web-speech.md`

What I did:

- Added lazy, SSR-safe Web Speech input and output adapters, including recognition error mapping, voice matching, cancellation and playback options.
- Wired browser adapters as client defaults with per-adapter overrides and an initial asynchronous voice check.
- Rewrote the README with usage, options, snapshot, events, state flow, confirmations, sessions, custom adapters and browser support.
- Added 22 tests. Existing client tests remain unchanged and pass.
- The ESM bundle is **31,221 bytes**. ESM and CommonJS bundles contain neither `@speeq/core` nor `zod`. Both declaration bundles are self-contained, the manifest has no runtime or peer dependencies, and both builds import and construct adapters with browser globals guarded.

Deviations from the brief: none.

Decisions I had to make (please review): none.

Risks / unsure about: Browser behavior is verified with stubbed Web Speech APIs, not live browser microphone or voice services.

Open questions: none.
