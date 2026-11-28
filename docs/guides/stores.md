# Choose a conversation store

Use `createMemoryStore()` for a single-process demo or isolated test. A restart discards sessions. For multiple replicas, use `createMongoStore({ db })` from `@speeq/store-mongodb` with your existing MongoDB `Db`, a promise or a function returning one. Its default collections are `speeq_sessions` and `speeq_events`. Let it create indexes or provision equivalent indexes before disabling `ensureIndexes`.

A custom `ConversationStore` implements `createSession`, `appendEvents`, `listEvents`, `listSessions`, `getSessionSummary` and `deleteOlderThan` and exposes a short `kind`. Assign increasing sequence numbers atomically. Reject duplicate per-session dedupe keys with `CONFLICT` and roll back the whole append. Return events in sequence order, sessions newest first with opaque cursors, and delete child events when expiring a session.

Persistent memory (`memory.mode: "persistent"` or `"preferences"`, see [Memory](memory.md)) needs three optional methods, which both built-in stores have: `getPreferences(scope)`, `setPreference(scope, category, value, expiresAt)` and `clearScope(scope, { conversations, preferences })`. A scope is `{ userId, tenantId }`, matched exactly (`tenantId: null` matches only records without a tenant). `forget` sets `forgottenAt` on the scope's sessions and keeps their events; `delete` removes both. The MongoDB store keeps preferences in `speeq_preferences`, created on first use. Without the methods, `createSpeeq` fails at startup with a message naming what is missing.

Run the shared suite in a Vitest test file. Substitute a fresh empty instance of your implementation in the factory.

```ts
import { runConversationStoreContract } from "@speeq/testing/store-contract";
import { createMemoryStore } from "@speeq/store-memory";
runConversationStoreContract("memory", async () => createMemoryStore({ quiet: true }));
```
