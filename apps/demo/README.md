# Vidya Study demo

From the repository root, run `pnpm install` and `pnpm --filter @speeq/demo dev`. The dev command builds the workspace dependencies and starts the demo on port 3000. For a production run, build the workspace with `pnpm build` and run `pnpm --filter @speeq/demo start`.

Configure the root `.env` using the example file. An app-local `.env.local` can override it. With no provider key, the mock assistant uses keyword rules for English, Telugu and Hindi. Set `SPEEQ_LLM=mock` to force that mode. An empty `MONGODB_URI` uses a store that resets when the process restarts.

Choose Asha or Ravi on `/login`. The demo accepts an admin password through `DEMO_ADMIN_PASSWORD` and defaults to `admin` in development. Production requires `SPEEQ_SECRET` for session signing and an explicit admin password to enable admin sign-in. Only the admin account can read the conversation audit endpoints. Sign out clears the signed cookie.

Open **Ask Vidya** on any page to type or speak. On a question page, try “bookmark this question” after signing in. The assistant asks for confirmation before saving it. The admin account can open **Admin** in the main navigation to review sessions and their events.

Run the Chromium test from the repository root after building the workspace dependencies. The test starts a Next.js development server on port 3107 and uses mock replies with in-memory storage.

```sh
pnpm build
pnpm --filter @speeq/demo exec playwright install chromium
pnpm --filter @speeq/demo test:e2e
```
