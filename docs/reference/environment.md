# Environment settings

Keep server settings out of client bundles. The demo and platform load root environment files with app-local precedence. The standalone SDK takes configuration explicitly except for the runtime and telemetry settings below.

| Variable                     | Secret | Consumer and behavior                                                                                                      |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                     | No     | Production requires an explicit SDK signing secret and explicit demo admin credentials.                                    |
| SPEEQ_SECRET                 | Yes    | Demo passes this to createSpeeq and uses it for demo account cookies. Other hosts must supply config.secret themselves.    |
| DEMO_ADMIN_PASSWORD          | Yes    | Demo admin password. Development defaults to admin. Unset disables production admin login.                                 |
| SPEEQ_LLM                    | No     | Demo provider choice: mock, groq or gemini. Automatic selection prefers a configured Groq key, then Gemini, then mock.     |
| GROQ_API_KEY, GEMINI_API_KEY | Yes    | Server-side provider credentials. A selected provider without its key falls back to mock in the demo.                      |
| GROQ_MODEL, GEMINI_MODEL     | No     | Demo provider model overrides.                                                                                             |
| GROQ_BASE_URL                | No     | Demo chat-completions API base.                                                                                            |
| MONGODB_URI                  | Yes    | Demo conversation database connection string. Unset selects in-memory storage.                                             |
| MONGODB_DB                   | No     | Demo database name, default speeq_demo.                                                                                    |
| SPEEQ_PLATFORM_URL           | No     | SDK telemetry destination base URL. No HTTP delivery without a destination.                                                |
| SPEEQ_PROJECT_KEY            | No     | Public attribution key passed by the demo as config.projectKey.                                                            |
| SPEEQ_UPDATE_CHECK           | No     | Set to 0 to disable the development npm update check.                                                                      |
| CI                           | No     | Any defined value disables the npm update check.                                                                           |
| SPEEQ_TELEMETRY              | No     | Set to 0 to disable SDK collection.                                                                                        |
| NEXT_RUNTIME                 | No     | Framework-provided runtime hint used in telemetry detection.                                                               |
| ADMIN_PASSWORD               | Yes    | Platform admin password. Required in production. Development defaults to admin.                                            |
| SESSION_SECRET               | Yes    | Platform admin cookie signing secret, at least 32 characters in production. Development generates a process-local default. |
| TRUST_PROXY_HEADERS          | No     | Set to 1 behind a trusted proxy to use forwarded client addresses for login throttling.                                    |
| GITHUB_REPO                  | No     | Optional owner/repository for the dashboard's public stars and forks.                                                      |
| DATABASE_URL                 | Yes    | Platform Postgres connection string. Unset selects PGlite.                                                                 |
| DATABASE_URL_DIRECT          | Yes    | Optional direct Postgres connection for migrations, falling back to DATABASE_URL.                                          |
| PGLITE_DIR                   | No     | Embedded database directory, default .data/pglite relative to platform.                                                    |
| CRON_SECRET                  | Yes    | Bearer secret for retention cleanup. Unset disables the route.                                                             |
| TELEMETRY_RETENTION_DAYS     | No     | Platform retention in days, integer 1–3650, default 90.                                                                    |
