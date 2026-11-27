---

"speeq": minor
"@speeq/integrate": minor
"@speeq/cli": minor
"@speeq/server": patch
---

The generated chat box now opens pages: it passes `onNavigate` to the router, so "open pricing" really moves the page (only to paths on your own site). It starts the conversation with a greeting and tappable suggestions taken from your approved pages, scrolls to the newest message, keeps the message list scrollable, shows "Thinking...", and focuses the input when opened. New configs keep the in-memory store on `globalThis`, so the assistant remembers the conversation after a dev hot reload; `npx speeq setup` offers the same change for an existing `speeq.config.ts`. The system prompt now tells the model to use earlier messages.
