# REPORT 007 — Platform ingest

**Status** DONE
**Branch / implementation commit** `task/007-platform-ingest` / `571625f`
**Verify** `scripts/verify.sh` passed without overrides. Lint 1s, typecheck 10s, tests 11s (264 passed, 0 failed), build 28s.

**What I did**

- Implemented bounded ingest validation, atomic throttling, project attribution, transactional writes and authenticated retention cleanup.
- Added Drizzle migrations, a Postgres client and a zero-configuration PGlite fallback.
- Applied Amendment A. The standalone approval fixture and both real SDK bookmark batches returned 202. The approval rollup stored one approval, zero requests and zero turns.
- Verified the platform in a clean checkout with no app configuration. Health returned 200, a valid curl POST returned 202 and adding an unknown field returned 400.
- Started both apps with root `pnpm dev`. The demo answered a pricing request and navigated. After shutdown, a SQL join of `instances` and `usage_rollups` found one SDK instance, one turn and one navigation.

**Files** 27 created, 3 modified, 0 deleted.

```text
.gitignore
pnpm-lock.yaml
handoff/reports/007-platform-ingest.md
apps/platform/{package.json,tsconfig.json,next.config.ts,vitest.config.ts,drizzle.config.ts,proxy.ts,vercel.json}
apps/platform/app/{layout.tsx,page.tsx,api/health/route.ts,api/v1/ingest/route.ts,api/cron/cleanup/route.ts}
apps/platform/db/{client.ts,schema.ts,migrations/0000_acoustic_dragon_man.sql,migrations/meta/0000_snapshot.json,migrations/meta/_journal.json}
apps/platform/lib/{env.ts,projects.ts,cron/cleanup.ts}
apps/platform/lib/ingest/{handler.ts,persist.ts,read-body.ts,throttle.ts,validate.ts}
apps/platform/scripts/migrate.ts
apps/platform/test/platform.test.ts
```

**Deviations** The root smoke check forwarded `--hostname ::1` because another app occupied IPv4 port 3000. Both apps used their specified ports.

**Decisions I had to make** A Next.js proxy enforces POST before the framework can generate its automatic OPTIONS response.

**Risks** The first valid POST took 17.3s during cold dev compilation and database initialization. The demo smoke used a warmed endpoint. Database integration was exercised with PGlite only.

**Open questions** None.
