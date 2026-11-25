---

title: Environment variables
description: Every setting read from the environment, and which ones are secrets.
---

# Environment variables

Keep secrets out of browser code. Never use a `NEXT_PUBLIC_` name for a secret.

## The SDK

The SDK reads almost everything from the options you pass. It reads only these from the environment itself:

| Variable             | Secret? | What it does                                                   |
| -------------------- | ------- | -------------------------------------------------------------- |
| `NODE_ENV`           | No      | In production, the SDK needs an explicit signing secret.       |
| `SPEEQ_TELEMETRY`    | No      | `0` turns off counting.                                        |
| `SPEEQ_PLATFORM_URL` | No      | Where anonymous counters are sent. Nothing is sent without it. |
| `SPEEQ_UPDATE_CHECK` | No      | `0` turns off the development update note.                     |
| `CI`                 | No      | If set to anything, the update note is off.                    |
| `NEXT_RUNTIME`       | No      | Set by Next.js. Used to detect the runtime.                    |

You choose your own names for the signing secret and model keys, and pass them in. The examples use `SPEEQ_SECRET`, `LLM_API_KEY`, and `GEMINI_API_KEY`. These are **secrets**.

## The example app (demo)

| Variable                                      | Secret? | What it does                                        |
| --------------------------------------------- | ------- | --------------------------------------------------- |
| `SPEEQ_SECRET`                                | Yes     | Signing secret passed to `createSpeeq`.             |
| `SPEEQ_LLM`                                   | No      | `mock`, `groq`, or `gemini`.                        |
| `GROQ_API_KEY`, `GEMINI_API_KEY`              | Yes     | Model keys.                                         |
| `GROQ_MODEL`, `GEMINI_MODEL`, `GROQ_BASE_URL` | No      | Model settings.                                     |
| `MONGODB_URI`                                 | Yes     | Database address. Without it, the demo uses memory. |
| `MONGODB_DB`                                  | No      | Database name.                                      |
| `SPEEQ_PROJECT_KEY`                           | No      | Public project key.                                 |
| `DEMO_ADMIN_PASSWORD`                         | Yes     | Password for the demo audit page.                   |

## The usage dashboard

| Variable                   | Secret? | What it does                                                  |
| -------------------------- | ------- | ------------------------------------------------------------- |
| `DATABASE_URL`             | Yes     | Postgres address. Without it, a built-in database is used.    |
| `DATABASE_URL_DIRECT`      | Yes     | Direct address for migrations.                                |
| `PGLITE_DIR`               | No      | Folder for the built-in database.                             |
| `ADMIN_PASSWORD`           | Yes     | Admin password. Required in production.                       |
| `SESSION_SECRET`           | Yes     | Signs the admin cookie. At least 32 characters in production. |
| `CRON_SECRET`              | Yes     | Allows the daily cleanup job.                                 |
| `TELEMETRY_RETENTION_DAYS` | No      | Days to keep data (1 to 3650, default 90).                    |
| `TRUST_PROXY_HEADERS`      | No      | `1` only behind a proxy you trust.                            |
| `GITHUB_REPO`              | No      | `owner/repo` for the stars and forks card.                    |

## This website

| Variable               | Secret? | What it does                                                                    |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | No      | The public address of this site, for links and the sitemap.                     |
| `GITHUB_TOKEN`         | Yes     | Optional. A token with no scopes, to raise the GitHub limit for the stats page. |
