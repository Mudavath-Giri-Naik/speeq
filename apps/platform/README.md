# speeq platform

Run `pnpm --filter @speeq/platform dev` and open port 3001. Development defaults to password `admin` and generates a signing secret per process. In production set `ADMIN_PASSWORD` and a `SESSION_SECRET` of at least 32 characters. Admin sessions expire after eight hours. Logout clears the browser cookie.

Login allows eight attempts per client and 100 globally per UTC-aligned 15-minute window. By default clients share one anonymous bucket. Set `TRUST_PROXY_HEADERS=1` on Vercel or behind a trusted reverse proxy that replaces client-supplied forwarding headers. Only a keyed hash of the selected client address is stored.

The platform uses PGlite in `.data/pglite` by default. To use Postgres set `DATABASE_URL` and run `pnpm --filter @speeq/platform db:migrate`; migrations can use `DATABASE_URL_DIRECT`. Stop the platform before running scripts against its local PGlite directory. Run `pnpm --filter @speeq/platform seed` for a 90-day fixture and `pnpm --filter @speeq/platform seed:clear` to remove fixture data. Both refuse production.

Dashboard ranges use UTC calendar days. Set `GITHUB_REPO` to an owner/repository pair for public star and fork counts. Weekly npm downloads and repository counts are cached for six hours. Failed requests are retried after 15 minutes.
