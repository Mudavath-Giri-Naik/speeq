# speeq docs website

The public website for speeq: a home page, the documentation, and a live adoption page (npm installs and GitHub numbers). It is a Next.js 16 app (App Router, React 19, Tailwind CSS 4) and it is self-contained. It imports no `@speeq/*` package, so it deploys on its own.

## Run it

```bash
pnpm --filter @speeq/docs dev      # http://localhost:3002
pnpm --filter @speeq/docs build
pnpm --filter @speeq/docs start
pnpm --filter @speeq/docs test
```

## Structure

| Path                                                  | What it is                                             |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `app/page.tsx`                                        | The home page                                          |
| `app/docs/[...slug]/page.tsx`                         | Every markdown documentation page                      |
| `app/docs/packages`, `app/docs/releases`, `app/stats` | Pages that use live npm and GitHub data                |
| `content/**/*.md`                                     | The documentation, one file per page                   |
| `content/nav.ts`                                      | The sidebar and page order                             |
| `lib/markdown.ts`                                     | Markdown to HTML (callouts, code frames, install tabs) |
| `lib/stats.ts`                                        | npm and GitHub numbers, with safe failure              |
| `lib/demo-logic.ts`                                   | The scripted conversation in the home page demo        |
| `components/`                                         | UI pieces                                              |

## Add or edit a page

1. Create `content/<section>/<name>.md` with this frontmatter:

   ```md
   ---
   title: Page title
   description: One sentence that says what the page is for.
   ---
   ```

2. Add `{ slug: "<section>/<name>", title: "Page title" }` to `content/nav.ts`.
3. Link to other pages with absolute paths, like `[Quickstart](/docs/quickstart)`.
4. Run `pnpm --filter @speeq/docs test`. It checks that every page is in the navigation, no file is missing, and every internal link and anchor works.

Writing rules: short sentences, everyday words, one idea per paragraph, say "you". Never claim something the SDK does not do. Check code against `docs/` in the repository and the real exports.

Markdown extras:

- Callouts: start a quote with `**Note**`, `**Tip**`, `**Warning**` or `**Important**`.
- Code title: ` ```ts title="app/route.ts" `.
- Install tabs: a ` ```bash pm ` block with an `npm i ...` command becomes npm, pnpm, yarn and bun tabs.
- Raw HTML is never rendered.

`content/ai-setup.md` holds a copy of `docs/integration/nextjs-integration-prompt.md` (the part below the divider). When that prompt changes, copy the new text over.

## Live numbers

`lib/stats.ts` reads public data on the server and caches it for one hour:

- npm downloads and the registry document for `speeq` and the nine `@speeq/*` packages.
- The GitHub repository (stars, forks, issues).

If any request fails, that number shows as a dash. The build never fails because of the network. Set `DOCS_STATS_OFFLINE=1` to skip all requests (used to prove offline builds). `/api/stats` returns the same data as JSON.

npm download counts update about once a day and include automated installs.

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `apps/docs`.
3. Leave **Include files outside the Root Directory** turned on (the default for monorepos).
4. Framework preset: **Next.js**. Node.js version: **22** or newer.
5. Install command: `pnpm install --frozen-lockfile`. Build command: `pnpm build`.
6. Add these environment variables (both optional):

   | Name                   | Purpose                                                                                                                                                 |
   | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL` | The public address, like `https://your-domain.com`. Used for links, the sitemap and social images. Vercel's production URL is used if you leave it out. |
   | `GITHUB_TOKEN`         | A token with no scopes. Raises the GitHub rate limit for the stats. Server only.                                                                        |

The site sets no cookies and loads nothing from third parties. Fonts are bundled.

## The site's own assistant

The widget in the bottom-right corner is built with speeq. The server is `app/api/speeq/[[...speeq]]/route.ts`, configured in `lib/assistant/`. It can open every page, search the docs and read live install numbers.

- With no keys it uses a small offline guide. For a real model set `GROQ_API_KEY` (fast) or `GEMINI_API_KEY` in Vercel. Optional: `GROQ_MODEL`, `SPEEQ_LLM`.
- Set `SPEEQ_SECRET` (32 or more random characters) so every serverless instance signs sessions the same way.
- This app now depends on the workspace packages (`speeq`), so `vercel.json` builds from the repository root with Turborepo. Keep the Vercel root directory at `apps/docs` and "Include files outside the Root Directory" on.
- The endpoint is public and calls a paid model. Rate limits are per instance (15 turns a minute); add a shared limit if you see abuse.
