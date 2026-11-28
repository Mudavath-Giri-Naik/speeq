---

"speeq": minor
"@speeq/compiler": minor
"@speeq/integrate": minor
---

Discovery for personalisation. `discoverPersonalization({ root, manifest })` finds the app's sign-in system with file and line evidence (Auth.js v5, NextAuth v4, Supabase Auth, Clerk, Better Auth bound automatically; Kinde and your own helpers flagged for review; Firebase Auth reported as unsupported with what to do), candidate customer data sources from GET endpoints (category, response fields, sensitive fields, auth and user-scope evidence, whether they can be bound without code) and business facts from layout metadata, package.json and the README. It runs separately from `scan`, so rescans stay incremental. The integration engine renders a server-only `resolveUser` for a detected sign-in system and context sources that call your own endpoints with the visitor's cookies, exposing only approved fields; sensitive fields can never be approved and endpoints without a visible sign-in check need an explicit review.
