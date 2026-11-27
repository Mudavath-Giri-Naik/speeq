---

"speeq": minor
"@speeq/core": minor
"@speeq/server": minor
"@speeq/client": minor
"@speeq/compiler": minor
---

Customer and page context. `defineContext` wraps a service your app already has (cart, enrollments, subscriptions, recent activity) so the agent can read the signed-in customer's current data through the new built-in `get_context` tool, or in the prompt with `load: "initial"`. Every result goes through the server-verified user, a sign-in check, a timeout, the output schema, a projection to the `expose` paths only, removal of restricted fields and secret-looking values, and size limits; it is cached for one request and never stored in conversation history. Page context gains an allow-list (`context.page.allow`), secret query parameters are removed from the path in the browser and on the server, and the store keeps context key names only by default for apps that set the allow-list. The system prompt now separates trusted instructions from data blocks (signed-in state, exposed profile, customer context, page context) with `<` and `>` escaped, and keeps the safety rules last. The sensitive-name list is shared between the compiler and the runtime.
