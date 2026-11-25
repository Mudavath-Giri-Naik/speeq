# Report 011 — Public documentation website

Status: DONE (built by the architect at the owner's request, not by Codex)

Branch: task/011-docs-website

## What exists

`apps/docs` (`@speeq/docs`): Next.js 16, React 19, Tailwind 4. Self-contained, no `@speeq/*` imports, no cookies, no third-party requests, bundled fonts.

- Home page: aurora hero, live stats badges, a simulated assistant demo (presets, tool chips, Approve/Reject, page navigation, simulated voice), how-it-works, tabbed highlighted code, feature grid, privacy section, packages and adoption strip, call to action.
- Docs: 30 pages in simple words, sidebar, `Ctrl K` search palette, on-this-page outline, install tabs (npm, pnpm, yarn, bun), copy buttons, callouts, previous/next, edit-on-GitHub, raw Markdown at `/docs/raw/<slug>.md`.
- `/stats`: installs (week, month, all time), per-package table, 30 day SVG chart, GitHub numbers, releases. `/docs/packages` and `/docs/releases` use the same live data. `/api/stats` returns JSON.
- `/llms.txt`, `/llms-full.txt`, `sitemap.xml`, `robots.txt`, Open Graph image, 404 and error pages, JSON-LD.
- Dark and light themes, no flash on load, reduced-motion respected.

## Verification

- `bash scripts/verify.sh`: lint, typecheck, tests (378 total, 45 in the docs app) and build pass.
- Build with `DOCS_STATS_OFFLINE=1` (no network) passes. Failed fetches render a dash. A 404 from the npm download API (new package) renders 0.
- Browser checks (Playwright Chromium, production build): no horizontal overflow and no console errors at 1440 px and 390 px on home, docs, stats, light and dark. The simulated demo ran through the cancel flow, search palette opened with `Ctrl K` and navigated with Enter, mobile menu opened as a drawer.
- Lighthouse was NOT run. Bundle size was not measured. Check both after the first Vercel deploy.

## Notes and deviations from brief 011

- `content/ai-setup.md` is a copy of `docs/integration/nextjs-integration-prompt.md`; re-copy when that file changes.
- Markdown under `apps/docs/content` is formatted by Biome like the rest of the repo, which also formats embedded code. Two samples were rewritten so Biome keeps them valid.
- Root `biome.json` gained `css.parser.tailwindDirectives` and an override for `apps/docs/**/*.css`.
- No `.env.example` edit at the root (the owner's local copy has uncommitted edits). `apps/docs/.env.example` lists the two optional names.
- `speeq/testing/store-contract` does not exist in the umbrella package; the stores page uses `@speeq/testing/store-contract`.

## Deploy

Vercel: root directory `apps/docs`, Node 22+, install `pnpm install --frozen-lockfile`, build `pnpm build`. Optional env: `NEXT_PUBLIC_SITE_URL`, `GITHUB_TOKEN`. See `apps/docs/README.md`.
