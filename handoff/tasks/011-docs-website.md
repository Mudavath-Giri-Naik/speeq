# TASK 011 — Public documentation website (`apps/docs`, deployable to Vercel)

Branch: task/011-docs-website (create it from latest main)

## 1. Read first

- `AGENTS.md`, `PLAN.md`, `handoff/INDEX.md`, `handoff/reports/009-docs-release.md`, `handoff/reports/010-umbrella-release.md`.
- Every file under `docs/` (guides, concepts, reference, decisions, `docs/integration/nextjs-integration-prompt.md`, `docs/maintainers/releasing.md`), plus `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `llms.txt`. These are the source of truth for **facts**. The website rewrites them in simpler words but must never contradict them.
- `apps/platform` (Next.js 16 app conventions: tsconfig, scripts, Biome), root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `scripts/check-deps-direction.ts`, `.changeset/config.json`.
- Public APIs when you need to verify a claim: `packages/*/src/index.ts`. Trust the code over prose if they differ, and list the difference in the report.

## 2. Goal

A public website for speeq that can be deployed to Vercel on its own (Vercel project root `apps/docs`). It has a "wow" marketing home page, complete documentation written in very simple words, a live statistics page (npm installs, versions, GitHub numbers), and works and looks premium on phones, tablets and desktops, in dark and light themes. It looks and feels like the best developer docs sites (clean sidebar, search, on-this-page outline, polished code blocks), but it must be original in look; do not copy any brand's assets or exact layout.

## 3. Decisions already made (do NOT change or re-decide)

**Stack**

- New workspace app `apps/docs`, package name `@speeq/docs`, `private: true`, **Next.js 16 App Router + React 19 + TypeScript**, same versions as `apps/platform`. Dev port **3002** (`next dev -p 3002`). Add `"@speeq/docs"` to the `ignore` list in `.changeset/config.json`.
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`, `@tailwindcss/postcss`). No component library, no UI kit, no icon font. Inline SVG icons that you write yourself (a small `Icon` set; or `lucide-react` is allowed as the only extra UI dependency). Animation with CSS and the Web Animations API only: **no** Framer Motion, GSAP or Three.js. Charts are hand-written SVG (no chart library).
- Fonts via `next/font/google`: **Inter** (UI) and **JetBrains Mono** (code), `display: swap`.
- The docs app is **self-contained**: it must not import any `@speeq/*` workspace package, and nothing may depend on it. Deploying with Vercel root directory `apps/docs` must work with a plain `pnpm install` at the monorepo level. Add `apps/docs/vercel.json` only if it is needed (framework `nextjs`); document the Vercel settings in `apps/docs/README.md` (root directory `apps/docs`, "include files outside root directory" on, Node 22, install command `pnpm install --frozen-lockfile`, build command `pnpm build`, env vars below).
- Do not add analytics, trackers, cookies, fonts from other CDNs, or third-party scripts to the site. speeq's selling point is privacy; the site must be cookieless with zero client-side third-party requests. (The server-side stats fetches below are fine.)
- Biome formats and lints the app like every other package. `scripts/check-deps-direction.ts` and its tests must keep passing (update the script only if the new app breaks a rule, and report it).

**Content system**

- Documentation lives in `apps/docs/content/**/*.md` with YAML frontmatter: `title`, `description`, optional `order`. The navigation tree is a typed file `apps/docs/content/nav.ts` (sections, page slugs, titles). One markdown file per page; slug = file path.
- Render at build time with `unified`: `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-slug`, `rehype-autolink-headings`, `rehype-pretty-code` + `shiki` (dual theme, light and dark), `rehype-react`-style rendering via Next (server components). Everything statically generated (`generateStaticParams`), no runtime markdown work, no `eval`, no raw HTML in markdown (`allowDangerousHtml: false`).
- Callouts use this markdown convention, rendered as styled boxes: a blockquote whose first line is `**Note**`, `**Tip**`, `**Warning**` or `**Important**`.
- Code blocks: language label, filename title via ` ```ts title="app/route.ts" `, copy button (client component, accessible, shows "Copied"), horizontal scroll on small screens, never wrapping code. Tabs for npm / pnpm / yarn / bun install commands (remember the choice in `localStorage`; the only storage the site uses, and it must not break if storage is blocked).
- Headings h2/h3 get anchor links and feed the "On this page" outline (scroll-spy highlights the current heading).
- A page footer on every doc: "Edit this page on GitHub" (link to the file in the repo), previous/next page links from `nav.ts` order, and "Last updated" taken from `git log` at build time **if** available, otherwise omitted (must not fail the build on a shallow clone, as on Vercel).
- Search: build-time JSON index (title, headings, plain-text excerpt) generated by a script and loaded lazily on first open. Command palette opens with `Ctrl/Cmd+K` and `/`, keyboard navigation (up/down/enter/escape), results show page title, section and a highlighted snippet. No search service.
- Docs pages are also served as raw Markdown at `<page-url>.md` (and the site serves `/llms.txt` and `/llms-full.txt`, full concatenated docs) so AI tools can read them. Generate these at build time.

**Writing style for the content (this is a core requirement)**

- "Very simple words": short sentences, everyday vocabulary, one idea per paragraph, second person ("you"). Explain jargon the first time it appears (token, SSE, store, webhook...) in one plain sentence or avoid it. Prefer "Here is what happens" explanations and small examples over theory. No marketing fluff, no emojis in docs pages.
- Every guide starts with a one-sentence "What you will build / learn" and ends with "Next steps" links.
- **Accuracy over style.** Simplify wording, never facts. Every code sample is copied from or verified against `docs/` and the real exports; compile-check the Next.js quickstart samples in a scratch app (see section 8). No invented options, no features that do not exist. State plainly that speeq is pre-1.0 (0.2.x, `next` channel) and list known limits (per-instance rate limiter, in-memory store is dev only, Web Speech browser support).
- Page map (create all of these; reuse facts from the repo docs):
  - **Start here:** Introduction (what speeq is, who it is for, what it is not, pre-1.0 notice); Quickstart (5 minutes, mock mode, no API keys); Install (all package managers, the umbrella `speeq` vs scoped `@speeq/*`, requirements: Node 20+, zod 4, React optional); Use an AI assistant to set it up (the integration prompt: render `docs/integration/nextjs-integration-prompt.md` content with a prominent **Copy prompt** button).
  - **Guides:** Add speeq to Next.js; Tools (let the assistant do things); Knowledge (let it answer from your content); Routes and navigation; Confirmations (ask before changing data); Connect a model (Groq, Gemini, any OpenAI-style API, mock mode); Choose a store (memory vs MongoDB, custom store); Voice and languages; Testing; Audit viewer; Deploy to production; The analytics dashboard (platform).
  - **Concepts:** How it works; Sessions and security; Confirmations in depth; Audit log; Privacy and telemetry (what is collected, what never is, how to turn it off).
  - **Reference:** Server config; Client; React; HTTP protocol; Errors; Environment variables; Telemetry.
  - **More:** Packages (table of all ten npm packages: purpose, install command, npm link, live version and weekly downloads from the stats module); Design decisions (ADR index + each ADR rendered); Security policy; FAQ (10 or more plain questions: "Does it send my data to speeq?", "Does it work without voice?", "Can I use my own model?", "Is it free?", "Which browsers support voice?", ...); Releases (version history from the npm registry, newest first, with dates; link each to its CHANGELOG on GitHub).
- Target about 30 pages. Every page needs `title` and a one-sentence `description` (also used for SEO).

**Stats ("installs and analytics")**

- Module `apps/docs/lib/stats.ts` (server only) fetches, with Next fetch caching `revalidate: 3600`:
  - npm downloads for `speeq` and each of the nine `@speeq/*` packages: `https://api.npmjs.org/downloads/point/last-day|last-week|last-month/<name>` and the daily range `https://api.npmjs.org/downloads/range/last-month/<name>` (scoped packages cannot be bulk-queried: one request each). All-time total = `https://api.npmjs.org/downloads/range/2026-11-25:<today>/<name>` summed (the first publish date is 2026-11-25; the API allows at most 18 months per range, so clamp).
  - npm registry document `https://registry.npmjs.org/<name>`: `dist-tags` (latest and next), version list with publish times (for the Releases page and "last published").
  - GitHub repo `https://api.github.com/repos/Mudavath-Giri-Naik/speeq`: stars, forks, open issues, watchers, license, last push, and contributors count (`/contributors?per_page=1` + the `Link` header, or omit if awkward). Use `GITHUB_TOKEN` from env **if present** as a bearer token (server side only, never logged or sent to the client); work without it.
- Page `/stats` ("Adoption"): big number cards (weekly, monthly and all-time installs of `speeq`; total across all packages; GitHub stars and forks; latest version and publish date), a 30-day downloads area chart for `speeq` (SVG, tooltip on hover/touch with date and count, keyboard focusable, table fallback for screen readers), a per-package table (version, weekly downloads, monthly downloads, npm link), release timeline. Show a clear note: "npm numbers update about once a day and include automated installs (CI and mirrors)". The home page shows a small live stats strip (weekly installs, stars, latest version) from the same module.
- **Failure behavior is a hard requirement:** every fetch has a 5 s timeout and its own try/catch. If anything fails (offline build, rate limit, API change), that number renders as an em dash "-" with no error text, the page still builds and deploys, and a stale-while-revalidate refresh fixes it later. Builds must pass with **no network at all**. A new package may legitimately report 0 downloads; render 0, not a dash.
- Internal JSON route `/api/stats` returns the same data (cached 1 h, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`) so a status badge or the platform can reuse it. No secrets in the response.

**Home page (the "wow")**

Dark-first (light theme supported), restrained palette: near-black background, one accent gradient (electric violet to cyan), subtle grain/noise and grid, generous whitespace, large confident type (clamp-based fluid sizes). Sections in order:

1. **Hero:** headline "Give your website a voice." (subline: one plain sentence about a headless assistant that talks, navigates and answers using your own data), primary button "Get started" and secondary "Copy install command" (`npm i speeq@next zod`, with copy feedback), small badges (version, weekly installs, GitHub stars, MIT) from live stats. Behind it an animated aurora/mesh gradient and slow-moving grid built with CSS only.
2. **Live demo, no backend:** an interactive simulated assistant window next to a fake mini website. Scripted conversations (3 presets as chips, plus the user can click them; also a text box that plays the nearest preset) where the assistant "types" streaming text, shows a tool being used ("Looking up your orders..."), asks for **confirmation** with Approve/Reject buttons for a write action, and **navigates** the mini website to another page with a transition. Pure client state, deterministic, no network, clearly labeled "Simulated demo". A waveform animation shows "listening" state. Must work by touch and keyboard.
3. **How it works:** three connected steps (Browser -> Your server -> Your model/tools/data) with an animated data-flow line that draws on scroll (`IntersectionObserver`), each step a plain sentence.
4. **Code that speaks for itself:** tabbed code window (Server, Provider, Tool) with the real minimal snippets from the Next.js guide, syntax highlighted at build time (static, no client highlighter).
5. **Feature bento grid** (8 cards, mixed sizes, hover glow that follows the pointer on desktop only): Voice and text, Navigates your app, Uses your data through tools, Asks before changing things, Full audit log, Anonymous by design, Any model (Groq, Gemini, OpenAI-style), Works with Next.js today.
6. **Trust and privacy:** plain statement of what is and is never collected, with a link to the privacy page.
7. **Packages** strip (ten packages as small cards with live version).
8. **Live adoption** strip (from stats; links to `/stats`).
9. **Final call to action** with the install command and "Read the docs" button; footer with links (Docs, Adoption, GitHub, npm, Security, Releases), license, and "pre-1.0" note.

Motion rules: all animation respects `prefers-reduced-motion` (replace with static states), animations never block interaction, nothing animates above 60 fps cost (use `transform`/`opacity`), no layout shift. Scroll reveals are subtle (fade + 12px rise), once.

**Layout and UX**

- Top bar: logo (a simple original wordmark + mark you create as SVG; no copied brand), nav (Docs, Guides, Reference, Adoption), search button showing `Ctrl K`, theme toggle (system/light/dark, no flash on load via an inline script that sets `data-theme` before paint), GitHub link with live star count, mobile menu.
- Docs layout: left sidebar (collapsible groups, active page highlighted, sticky, own scroll), center content (max about 72ch for prose), right "On this page". On screens narrower than 1024px the sidebar becomes a drawer opened from a "Menu" button, and the outline collapses into a dropdown at the top of the page. Breakpoints tested at 360, 390, 768, 1024, 1280 and 1536 px. No horizontal page scroll at any width (only code blocks and tables scroll inside their own box). Touch targets at least 44 px.
- Accessibility: WCAG 2.2 AA contrast in both themes, visible focus rings, skip-to-content link, landmarks, correct heading order, `aria-current` on active nav, command palette focus trap, all icons have text alternatives or are `aria-hidden`.
- A custom `not-found` page with search, and an `error` boundary.
- SEO: `metadata` per page, canonical URLs from `NEXT_PUBLIC_SITE_URL` (default `https://speeq.dev` is **not** ours: default to `http://localhost:3002` in dev and require the env var for production canonical URLs; if unset on Vercel use `VERCEL_PROJECT_PRODUCTION_URL`), `sitemap.xml`, `robots.txt`, Open Graph/Twitter image generated with `next/og` (`ImageResponse`, one default plus per-page title cards), JSON-LD `SoftwareSourceCode` on the home page.
- Performance budget (measure and report with Lighthouse on the production build, mobile profile, for `/` and one docs page): Performance >= 90, Accessibility >= 95, Best Practices >= 95, SEO >= 95, CLS < 0.05. Home page first-load JS under 200 kB gzip. Fonts preloaded, images none (all SVG/CSS).

**Environment variables (all optional)**

| Name                   | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for metadata and sitemap.                                                    |
| `GITHUB_TOKEN`         | Server-side only, raises the GitHub API rate limit for stats. A read-only token with no scopes. |

Add both to `.env.example` **names only**. Never read, print or copy any real `.env*` file.

## 4. Scope

Create: everything under `apps/docs/**` (app, components, content, lib, scripts, tests, README, `vercel.json` if needed), `handoff/reports/011-docs-website.md`.
Modify: `.changeset/config.json` (ignore list), root `package.json` (add `"dev:docs": "turbo run dev --filter=@speeq/docs"`; do **not** add the docs app to the default `dev` script), `.env.example` (add the two names, empty), `README.md` (one link line to the website under docs; use the placeholder "Website: deployed from `apps/docs`" until a URL exists), `pnpm-lock.yaml`, `llms.txt` (one line), `scripts/check-deps-direction.ts` only if required.
Do NOT touch: `packages/**`, `apps/demo/**`, `apps/platform/**`, `handoff/INDEX.md`, the existing `docs/**` files (read-only source of truth; the website content is new files under `apps/docs/content`), `.github/workflows/release.yml`, `CLAUDE.md`, `AGENTS.md`, local `.env*` files.

## 5. Requirements (numbered, each testable)

1. `pnpm --filter @speeq/docs build` succeeds with **no network** (simulate with `NODE_OPTIONS` blocking or by pointing fetches at an unroutable host via an env switch `DOCS_STATS_OFFLINE=1` that skips fetches) and with network. Output is statically generated for all doc pages.
2. Every page in `nav.ts` exists, every markdown file is in `nav.ts` (no orphans), titles and descriptions are present and unique, and all internal links and `#anchors` across all content resolve (link checker test).
3. Home, `/stats`, every docs page, `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`, `/api/stats`, a `.md` raw route, and the 404 page respond correctly in `next start`.
4. Stats module: parsing is unit-tested with recorded fixtures for npm point, range, registry and GitHub responses; timeouts, non-200, invalid JSON and missing fields produce `null` values (rendered as "-"), never throw. All-time total clamps the 18-month range and sums correctly. A GitHub token is never included in any returned value or log line.
5. Search: index builds in a script (run in `prebuild`), is under 300 kB, and tests cover ranking (title match beats body match), diacritics/case, and empty query.
6. Markdown pipeline tests: callouts, code titles, tabs, heading ids, autolinked headings, table rendering, and that raw HTML in markdown is NOT rendered.
7. Theme toggle works, persists, and does not flash the wrong theme on load. Reduced-motion mode is verified.
8. Responsive: screenshots at 360, 768 and 1440 px for home, one docs page, and `/stats`, in dark and light, stored under `handoff/reports/011-screenshots/` (PNG, each under 400 kB; if too large, use fewer/lower-res). No horizontal overflow at 360 px on any page (an automated Playwright check over all routes, run as a script, not part of CI).
9. The home page simulated demo: three presets run to completion, the confirmation Reject path leaves the mini site unchanged, keyboard-only operation works, and reduced-motion shows the final states without animation.
10. `apps/docs/README.md` explains local run, structure, how to add a page (file + `nav.ts`), how stats work and fail, and the exact Vercel settings.

## 6. Contracts

```ts
// apps/docs/content/nav.ts
export interface NavPage { slug: string; title: string } // slug "guides/nextjs" -> content/guides/nextjs.md
export interface NavSection { title: string; pages: NavPage[] }
export const nav: NavSection[];

// apps/docs/lib/stats.ts  (server only; every field may be null)
export interface PackageStats {
  name: string;               // "speeq", "@speeq/core", ...
  version: string | null;     // dist-tags.latest
  nextVersion: string | null; // dist-tags.next
  lastPublished: string | null; // ISO date
  day: number | null; week: number | null; month: number | null;
}
export interface DailyPoint { day: string; downloads: number } // YYYY-MM-DD
export interface SiteStats {
  fetchedAt: string;
  packages: PackageStats[];
  speeqDaily30: DailyPoint[];       // [] when unavailable
  speeqAllTime: number | null;
  totalWeek: number | null;         // sum over packages with a value, null if none
  github: { stars: number | null; forks: number | null; openIssues: number | null;
            watchers: number | null; license: string | null; pushedAt: string | null } | null;
  releases: { version: string; date: string }[]; // newest first, from the registry "time" map
}
export function getSiteStats(): Promise<SiteStats>; // never rejects
export function parseDownloadsRange(json: unknown, clampFrom?: string): DailyPoint[]; // pure, tested
```

## 7. Tests required

Vitest in `apps/docs/test/`: nav integrity and link checker (section 5.2), stats parsing and failure matrix (5.4, including token redaction), search index and ranking (5.5), markdown pipeline (5.6), the simulated-demo state machine as a pure reducer (presets complete, reject leaves state unchanged, unknown input falls back to the nearest preset, reset works), copy-button/theme logic where it is pure. Component tests with Testing Library for: code-block copy, tabs persistence with blocked `localStorage`, command palette keyboard navigation, mobile drawer focus handling.

## 8. Acceptance

- `bash scripts/verify.sh` passes with no overrides (lint, typecheck, tests, build all include the new app). Report the added time.
- Quickstart and Next.js guide code from the website content is compile-checked: run the existing `bash scripts/pack-test.sh` flow or a scratch app outside the repo using the published `speeq@next` package, and report exactly what you ran.
- Lighthouse mobile scores and the home first-load JS size from `next build` output are reported against the budgets in section 3. If a budget is missed, say by how much and why; do not hide it.
- Screenshots exist for section 5.8. Report any visual issue you noticed and fixed.
- `pnpm --filter @speeq/docs start` serves the production build; open it and report that you looked at the home page, the docs page, the stats page and the mobile drawer.
- `git diff --stat` shows only files in section 4. No secrets, no copied env values. `git log --format=%B main..HEAD | grep -iE "claude|co-authored-by|generated with"` prints nothing.

## 9. Finish

Commit on the branch (Conventional Commits: `feat(docs):`, `chore:`, `test(docs):`; no attribution lines, no Co-Authored-By). Write `handoff/reports/011-docs-website.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push. Do not edit `handoff/INDEX.md`. If a problem needs a change outside section 4, do not fix it silently: report it with file, line, repro and a suggested fix. This is a large task: commit in meaningful steps (scaffold + layout, content system, stats, home page, content pages, tests, polish) so a limit-hit or restart can resume from the last commit; keep the report's "Status" honest (`DONE` or `PARTIAL` with exactly what remains).
