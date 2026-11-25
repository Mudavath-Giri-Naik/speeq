# Run the adoption dashboard

Start both apps with `pnpm dev`, or start just the platform with `pnpm --filter @speeq/platform dev`. Open `/dashboard` on port 3001. The dashboard reads anonymous adoption counters. To review a user's conversation, use your host application's authorized audit viewer instead.

## Local setup

Leave `DATABASE_URL` unset to use PGlite. The platform creates its database under `.data/pglite` and applies migrations on first use. Set `PGLITE_DIR` to choose another directory. Sign in with the development default password `admin`. Without a configured signing secret, restarting the process signs you out.

Stop the local platform before running scripts against the same PGlite directory. Run `pnpm --filter @speeq/platform seed`, then restart it to explore 90 days of sample activity. Overview shows turns and sessions by UTC day. Installs shows SDK versions and runtimes, Projects manages attribution, Features shows adoption among reporting instances, and Reliability shows error counts and latency buckets. Run `pnpm --filter @speeq/platform seed:clear` with the platform stopped to remove the sample data. Both commands refuse production.

## Connect an SDK

On Projects, create a named project and copy its public key. Pass the key as `projectKey` to `createSpeeq` (the demo reads `SPEEQ_PROJECT_KEY`). Set `SPEEQ_PLATFORM_URL` in the SDK server environment to the platform base URL. For the local demo, use `http://localhost:3001`. Send a turn, then check Installs and Overview. A missing, unknown or revoked key still allows anonymous ingestion.

## Deploy with Postgres

Set `DATABASE_URL` to a Postgres connection string. For Supabase or another pooled service, use the pooled Postgres URL at runtime and set `DATABASE_URL_DIRECT` to the direct connection for migrations. Run `pnpm --filter @speeq/platform db:migrate` before starting the app. The platform does not migrate remote databases at startup.

Production login requires both `ADMIN_PASSWORD` and a `SESSION_SECRET` of at least 32 characters. Admin cookies expire after eight hours. Login allows eight attempts per client and 100 globally per UTC-aligned 15-minute window. Clients share an anonymous bucket by default. Set `TRUST_PROXY_HEADERS=1` only behind a proxy that replaces forwarded IP headers. Set `GITHUB_REPO` to an owner/repository pair to enable the GitHub card.

## Ingest and retention limits

Ingest accepts up to 64 KiB per request, ten batches per instance per UTC minute and 1,200 per minute globally. Many fabricated instance IDs can bypass the per-instance limit. The global limit bounds their arrival rate, and retention bounds how long inactive rows remain.

Configure `CRON_SECRET` for the scheduled cleanup request to `/api/cron/cleanup`. The deployment schedule is daily at 03:00 UTC. Supply the secret in the Bearer authorization header. `TELEMETRY_RETENTION_DAYS` defaults to 90. Cleanup removes expired rollups, error counts and inactive instances, and clears throttle windows older than an hour. [Telemetry validation](../reference/telemetry.md) · [Environment reference](../reference/environment.md)
