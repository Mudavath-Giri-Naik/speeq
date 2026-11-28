---

"speeq": minor
"@speeq/core": minor
"@speeq/server": minor
"@speeq/client": minor
"@speeq/react": minor
"@speeq/integrate": minor
"@speeq/store-memory": minor
"@speeq/store-mongodb": minor
"@speeq/testing": minor
---

Conversation memory. New `memory.mode`: `session` (default, unchanged), `persistent` (signed-in users continue their own latest conversation, chosen and checked by the server for the same user and tenant) and `preferences` (also keeps preferences the user states, through a built-in `remember_preference` tool offered only to signed-in users, in fixed categories, screened for contact details and secrets, shown to the model as "may be outdated" data and never as proof of access). New endpoints `GET /session/:id/messages` (own transcript) and `POST /session/:id/clear-memory` (forget or delete conversations and delete preferences; a cleared session answers `SESSION_EXPIRED`). Stores gain optional `getPreferences`, `setPreference` and `clearScope`; the memory and MongoDB stores implement them and the contract suite tests them. The client adds `restoreConversation()`, `clearMemory()` and `snapshot.memory`, and a session kept across a reload shows its transcript again. The generated chat box continues conversations, offers Forget, and notes saved preferences. `memory.retentionDays` shortens retention together with `audit.retentionDays`.
