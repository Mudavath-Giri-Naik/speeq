# @speeq/store-mongodb

A MongoDB `ConversationStore` for [speeq](../../../README.md). It **reuses your app's existing
connection**, so speeq keeps the audit log and conversation history in your own database, next
to your data.

```bash
pnpm add @speeq/store-mongodb@next mongodb
```

`mongodb` (v6 or later) is a peer dependency, so the store uses the driver you already have.

```ts
import { createMongoStore } from "@speeq/store-mongodb";
import clientPromise from "@/lib/mongodb"; // your existing cached MongoClient

export const store = createMongoStore({
  db: async () => (await clientPromise).db(), // Db | Promise<Db> | () => Db | Promise<Db>
});
```

## Collections and indexes

| Collection       | Contents                                        | Indexes (created on first use)                                     |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `speeq_sessions` | one document per session, with summary counters | `userId+startedAt`, `startedAt+_id`, `lastEventAt`                 |
| `speeq_events`   | one document per audit event                    | unique `sessionId+seq`, unique partial `sessionId+dedupeKey`, `ts` |

Change the prefix with `collectionPrefix`. Pass `ensureIndexes: false` if you manage indexes in
migrations.

## Guarantees

- `seq` numbers are reserved atomically (`$inc`), so concurrent serverless requests never collide.
- Each confirmation can be resolved only once: the unique `dedupeKey` index makes a replay or race
  fail with `CONFLICT`.
- A failed batch is rolled back, so `appendEvents` is all-or-nothing.
- `deleteOlderThan` removes old sessions and their events in batches of 500.

No transactions are required, so it works on standalone servers, replica sets and Atlas free tier
(M0). Tested against a real `mongod` with `mongodb-memory-server` and the shared store contract.

[Related guide or reference](../../../docs/guides/stores.md)
