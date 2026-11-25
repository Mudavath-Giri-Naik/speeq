# REPORT 008 — Platform dashboard

**Status** DONE
**Branch / implementation commit** `task/008-platform-dashboard` / `e7e502b`
**Verify** `scripts/verify.sh` passed without overrides. Lint 1s, typecheck 17s, test 18s, build 39s. Tests passed 280/280, including the ten existing platform ingest tests.

**What I did**

- Added password login, signed eight-hour admin cookies, atomic per-client and global throttling, per-page authorization and security headers.
- Built five server-rendered pages with SQL aggregates, UTC reporting windows, latency percentiles and project management.
- Added bounded external-stat requests, a migrated database cache with stale-value fallback, and deterministic seed and clear commands.
- Ran `pnpm --filter @speeq/platform seed` and `pnpm --filter @speeq/platform dev` without app configuration. All five anonymous dashboard requests returned 307 to `/login`. Submitting the default password returned 303 to `/dashboard`. All five signed-in pages returned 200 and displayed fixture data.
- Stopped the server, ran `pnpm --filter @speeq/platform seed:clear`, restarted it and signed in again. All five pages returned 200 with the empty-state instructions. The login response included all four security headers and `cache-control: no-store`.

**Files** 39 created, 8 modified, 0 deleted.

```text
apps/platform/{README.md,package.json,next.config.ts}
apps/platform/app/{globals.css,layout.tsx,page.tsx,login/{actions.ts,page.tsx}}
apps/platform/app/dashboard/{layout.tsx,view.tsx,page.tsx,{features,installs,projects,reliability}/page.tsx,projects/actions.ts}
apps/platform/components/{charts/{bar-chart,distribution,line-chart},ui/{badge,button,card,table}}.tsx
apps/platform/db/{schema.ts,migrations/0001_abnormal_may_parker.sql,migrations/meta/{0001_snapshot,_journal}.json}
apps/platform/lib/{auth/{config,cookie,login,session},cn,external-stats,ingest/throttle}.ts
apps/platform/lib/metrics/{features,histogram,installs,overview,projects,query,range,reliability}.ts
apps/platform/scripts/{seed,seed-clear}.ts
apps/platform/test/dashboard.test.ts
pnpm-lock.yaml
handoff/reports/008-platform-dashboard.md
```

**Deviations** None from the auth rules. Each page passes its validated range and active route to shared server-rendered navigation because Next layouts do not receive page search parameters.

**Decisions I had to make** Reporting windows include the current UTC day. Usage follows server receipt time. Install and feature distributions describe the full known population.

**Risks** The database checks used PGlite. Independently, the existing migration CLI fails under Node 24.15.0 at `apps/platform/scripts/migrate.ts:2`. Running `pnpm --filter @speeq/platform db:migrate` raises a named-export error for `@next/env`. A default import worked for the new seed CLI.

**Open questions** None.
