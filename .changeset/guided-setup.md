---

"speeq": minor
"@speeq/integrate": minor
"@speeq/cli": minor
---

A guided terminal setup. `npx speeq init` now walks through language model, voice, languages and chat box with Back on every choice and a review screen. Each key you paste is checked at once: speeq lists which chat models really work with it (working, busy, rate limited, unavailable) and lets you pick one, and tests Groq Whisper and Gemini speech models so the model ids are filled in for you. Sarvam AI is a new voice choice (speech-to-text and text-to-speech, paid credits, key checked without using credits). `npx speeq setup` changes any of it later, and `npx speeq remove` takes speeq out of the project: only what it added, with a review first. Keys go only to the provider's own host and are never printed; they are saved only in `.env.local`.
