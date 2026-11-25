---

title: Sessions and security
description: How speeq knows who is talking, and the limits that protect your server.
---

# Sessions and security

**What you will learn:** how sessions work, how to tell speeq who the visitor is, and what protections are on by default.

## Sessions

When a visitor sends the first message, the server creates a **session** and returns a signed **token**. The browser sends that token with every later message. The token holds the session, the user, and an expiry time. It is signed with your **secret**, so nobody can fake one.

- Tokens last 12 hours by default.
- After that, the browser quietly starts a new session.
- Every server copy needs the **same secret**.

## Who is the visitor?

Pass `resolveUser` to connect speeq to your own login:

```ts
createSpeeq({
  // ...agent, llm, store as before
  resolveUser: async (request) => {
    const user = await getUserFromRequest(request); // your own login check
    return user ? { id: user.id } : null;
  },
  allowAnonymous: false,
});
```

- Return `{ id }` for a signed-in visitor, or `null` for nobody.
- With `resolveUser`, signed-in sessions are the default. Set `allowAnonymous: true` if anonymous visitors may use the assistant too.
- A signed-in session is tied to that account. If someone else's cookie arrives, the request is refused.

> **Warning** If `resolveUser` throws an error, the visitor is treated as anonymous. So **every tool that touches private data must check `ctx.user` itself**.

## Built-in limits

| Limit                   | Default                        |
| ----------------------- | ------------------------------ |
| Size of a request       | 32 KiB                         |
| Length of a message     | 2,000 characters               |
| Time for one tool       | 8 seconds                      |
| Size of tool output     | 8,000 characters               |
| Turns per minute        | 20 per user or IP, per session |
| New sessions per minute | 10 per user or IP              |

You can change these in `guardrails`. The rate limits count inside one running server. For one limit across all copies, add a shared limiter at your edge.

## Origins and CORS

Requests from your own site work. Requests with no Origin header are also accepted. To allow another website, list its exact origin in `allowedOrigins`. CORS only controls which sites a browser lets call you. It does not log anyone in.

## Next steps

- [Asking before changes](/docs/concepts/confirmations)
- [The audit log](/docs/concepts/audit)
