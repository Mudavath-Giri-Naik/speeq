# @speeq/client

Install with `pnpm add @speeq/client`. Mount the speeq server handler in your app and pass its base URL to the client.

```ts
import { createSpeeqClient } from "@speeq/client";

const client = createSpeeqClient({ endpoint: "/api/speeq" });
client.subscribe(() => console.log(client.getSnapshot().messages));
await client.sendText("What can I do here?");
client.destroy();
```

Supply speech input and output through the `speech` option to enable voice. [Task 002 Web Speech adapters](../../handoff/PLAN-REMAINING.md) are coming soon.
