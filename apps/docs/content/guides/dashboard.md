---

title: The usage dashboard
description: Run the optional dashboard that shows anonymous counts, like turns and installs.
---

# The usage dashboard

**What you will learn:** how to run the optional dashboard and connect your server to it.

The dashboard is a small app in the speeq repository (`apps/platform`). It shows **anonymous counters**: how many sessions and turns, which versions are running, which features are used, and error counts. It never sees conversation text. To read conversations, use your own [audit viewer](/docs/guides/audit-viewer).

The dashboard is optional. speeq works fine without it.

## Run it on your computer

Start the apps from the repository root with `pnpm dev`, or only the dashboard with `pnpm --filter @speeq/platform dev`. Open `/dashboard` on port 3001.

- With no `DATABASE_URL`, it uses a built-in database (PGlite) that needs no setup.
- In development, the password is `admin`.
- To see sample data, stop the dashboard, run `pnpm --filter @speeq/platform seed`, and start it again. Remove it later with `seed:clear`.

## Connect your server

1. Open **Projects**, create a project, and copy its public key.
2. Pass the key to `createSpeeq` as `projectKey`.
3. Set `SPEEQ_PLATFORM_URL` in your server environment to the dashboard's address, for example `http://localhost:3001`.
4. Send a message, then look at **Installs** and **Overview**.

Without a project key, counts still arrive, but they are not tied to a project.

## Run it for real

- Set `DATABASE_URL` to a Postgres database. Run `pnpm --filter @speeq/platform db:migrate` first. The dashboard does not migrate a remote database for you.
- Set `ADMIN_PASSWORD` and a `SESSION_SECRET` of at least 32 characters. Login is limited to a few tries.
- Set `CRON_SECRET` so the daily cleanup can run. Old data is deleted after 90 days by default (`TELEMETRY_RETENTION_DAYS`).

## Limits

The dashboard accepts up to 64 KiB per request, 10 batches per minute for each server, and 1,200 per minute in total. Someone who invents many fake server IDs can get around the per-server limit. The total limit and the cleanup job keep the damage small.

## Next steps

- [Telemetry fields](/docs/reference/telemetry)
- [Environment variables](/docs/reference/environment)
