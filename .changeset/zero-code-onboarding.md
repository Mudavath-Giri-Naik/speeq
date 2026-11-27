---

"speeq": minor
"@speeq/core": minor
"@speeq/server": minor
"@speeq/client": minor
"@speeq/react": minor
"@speeq/integrate": minor
"@speeq/cli": minor
---

`npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.
