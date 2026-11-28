---

"speeq": minor
"@speeq/core": minor
"@speeq/server": minor
"@speeq/client": minor
"@speeq/react": minor
"@speeq/integrate": minor
"@speeq/llm-gemini": patch
---

The assistant can know the business and sound the way you want. New `business` profile and `agent.description` / `agent.style` (personality, response length, explanation depth, name usage, follow-ups) map to fixed prompt lines that never touch the safety rules. Greetings and starter prompts are now chosen on the server, without a model call, from `greeting` templates (guest, member, returning, per page) and `starters` filtered by sign-in, page and the capabilities the app really has; a template whose value is missing is skipped, so names and counts are never invented. They arrive with the session and with `GET /identity?path=`; the client exposes `snapshot.greeting` and `newConversation()`. Errors carry a stable `reason` (rate limited, quota exhausted, invalid key, model unavailable, busy, network, timeout and more) with calm customer messages, and the server logs one actionable diagnostic line in development without keys or customer data. The generated chat box shows the server greeting and starters, checks who is signed in when it opens, says when an account change started a fresh conversation, and has a New conversation button. Agent presets (general, e-commerce, education, admissions, SaaS, logistics, support, custom) are available as data for the setup wizard.
