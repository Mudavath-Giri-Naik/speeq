---

title: Conversation memory
description: "Session, persistent and preference memory: scope, clearing, retention and what is stored where."
---

# Conversation memory

By default the assistant remembers only the current conversation (`session` mode, as in 0.11). Two
opt-in modes let signed-in users pick up where they left off, and let the agent keep preferences the
user states. Memory never replaces your app's data: a remembered "I'm preparing for DBMS" is not proof
that someone is enrolled in a DBMS course. The agent is told so, and it still checks with your context
sources.

## Choose a mode

```ts
import { createMongoStore } from "speeq/store-mongodb";

createSpeeq({
  resolveUser, // memory is kept only for users your app signs in
  store: createMongoStore({ db: async () => (await clientPromise).db() }),
  memory: {
    mode: "preferences", // "session" (default) | "persistent" | "preferences"
    resumeWithinHours: 72, // older conversations start fresh
    preferenceDays: 180, // stated preferences expire
    categories: ["language", "explanation_depth", "subject"],
    clear: "forget", // or "delete"
  },
  // ...
});
```

| Mode          | What is kept between visits                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `session`     | Nothing. Each visit (or New conversation) starts fresh.                         |
| `persistent`  | The signed-in user's latest conversation, continued when they come back.        |
| `preferences` | The above, plus preferences the user states, such as "always answer in Telugu". |

Anonymous visitors are always in `session` mode. A conversation started before signing in is never
merged into the account: after sign-in the user continues their own latest conversation, or starts a
new one.

## How continuing works

The generated chat box calls `restoreConversation()` when it opens. The server looks up the verified
user's latest conversation in the same tenant, checks that it is theirs, not cleared, not empty and recent
enough, and continues that same conversation with a new token. The browser cannot name a session, so a
user can never open someone else's conversation, also not after an account switch on a shared computer.

With your own UI:

```tsx
const chat = useSpeeq();
useEffect(() => {
  if (chat.memory?.resume) void chat.restoreConversation();
}, [chat.memory?.resume]);
```

`chat.newConversation()` starts fresh and does not continue the old conversation the next time.

## Preferences

In `preferences` mode the agent has a `remember_preference` tool, only for signed-in users. It saves a
preference only when the user states one, in one of these categories: `language`, `explanation_depth`,
`subject`, `product_category`, `communication_style`. Values are at most 120 characters and are refused
when they contain an email address, a long number, a key or a token. Nothing is inferred and nothing about
purchases, access, health or money is saved. The chat box shows "Saved to your preferences."

Preferences are shown to the model as data marked "stated by the user, may be outdated", below your
instructions and above the safety rules, so a preference can never change what the agent is allowed to do.

## Clearing and retention

Signed-in users can clear what SPEEQ keeps about them: the chat box shows a Forget button when
`chat.memory.clear` is true, and `chat.clearMemory()` does the same in your own UI.

- `clear: "forget"` (default) hides the user's conversations from continuing, transcripts and the model.
  The rows stay in the store as your audit log until retention deletes them. Say so in your privacy notice.
- `clear: "delete"` removes the conversations and their events now.
- Preferences are always deleted when the user clears memory.
- `memory.allowClear: false` turns clearing off (for example when your audit policy requires the rows).

Retention: `memory.retentionDays` and `audit.retentionDays` delete conversations by last activity; the
shorter one wins, because conversations and the audit log are the same records. Preferences expire after
`preferenceDays`.

## What is stored where

| Data                       | Where                                         | Removed by                                  |
| -------------------------- | --------------------------------------------- | ------------------------------------------- |
| Active conversation        | Store (`speeq_sessions`, `speeq_events`)      | Retention; clear with `delete`              |
| Continued transcripts      | The same records, never copied                | Clear (`forget` hides, `delete` removes)    |
| Stated preferences         | `speeq_preferences` (MongoDB) or memory store | Clear, or expiry after `preferenceDays`     |
| Your customer data         | Your app only (cart, orders, enrollments)     | Your app. SPEEQ never copies it.            |
| SPEEQ maintainer telemetry | Counters only                                 | Never contains conversations or preferences |

## Stores

The memory store and the MongoDB store support every mode. A custom store needs `getPreferences`,
`setPreference` and `clearScope` (see [Stores](/docs/guides/stores)); without them `createSpeeq` fails at startup
and says which methods are missing. The memory store loses everything on restart, so use MongoDB (or your
own store) for real persistence. `npx speeq setup` configures MongoDB from the terminal.
