---

title: Choose a store
description: Where conversations are saved. Memory for development, MongoDB for production, or your own.
---

# Choose a store

**What you will learn:** where conversation history lives, and which store to pick.

The **store** saves every conversation: messages, tool calls, and confirmations. It lives in **your** database. speeq reads history back from it on every turn, so the server itself keeps nothing between requests.

## Memory store (development only)

```ts
import { createMemoryStore } from "speeq/store-memory";

const store = createMemoryStore();
```

It keeps everything in the server's memory. When the server restarts, everything is gone. With several servers, each one has its own separate memory. Use it for local work and tests only.

## MongoDB store

```ts
import { createMongoStore } from "speeq/store-mongodb";

const store = createMongoStore({ db }); // db is your connected MongoDB Db
```

- You pass your own connected database. `db` can also be a promise, or a function that returns one.
- It saves to two collections: `speeq_sessions` and `speeq_events`.
- It creates its indexes for you. If you create them yourself, you can turn that off with `ensureIndexes`.
- Install the `mongodb` package (version 6 or newer).

## Your own store

Using another database? Write a store that follows the contract. It needs these methods: `createSession`, `appendEvents`, `listEvents`, `listSessions`, `getSessionSummary`, and `deleteOlderThan`, plus a short `kind` name.

Three rules matter most:

- Give each event an increasing number, safely, even when two requests run at once.
- If an event repeats a "dedupe key" that already exists in that session, reject it with `CONFLICT` and save nothing from that batch.
- Return events in order. Return sessions newest first.

Then run the shared test suite on your store:

```ts
import { runConversationStoreContract } from "@speeq/testing/store-contract";
import { createMemoryStore } from "speeq/store-memory";

runConversationStoreContract("memory", async () => createMemoryStore({ quiet: true }));
```

Replace the factory with a function that returns a fresh, empty copy of your own store. This test helper is only in the scoped package, so install `@speeq/testing` for it.

## Next steps

- [Go to production](/docs/guides/deployment)
- [Build an audit viewer](/docs/guides/audit-viewer)
