---
"@speeq/compiler": patch
---

Filters are found where real apps keep them: literal `useSearchParams().get("x")` reads in client components that a page imports from its own route folder (for example `./QuestionsClient` or `./_components/filters`, two levels deep) now become the route's query parameters, so the assistant can open the page already filtered. Shared components outside the route folder are never followed, and editing such a component re-runs discovery for the page.
