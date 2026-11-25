---

title: Go to production
description: A short checklist before you put the assistant in front of real visitors.
---

# Go to production

**What you will learn:** the few things to fix before real visitors use your assistant.

## The checklist

1. **Set a real secret.** speeq signs each session with a secret. In development it makes a random one. In production you must set your own, at least 32 random characters, and every server copy must use the same one. Example: `openssl rand -base64 32`.
2. **Use a lasting store.** The memory store forgets everything on restart. Use the MongoDB store or your own. See [Choose a store](/docs/guides/stores).
3. **Use a real model.** Remove the mock and add keys as server environment variables. See [Connect a model](/docs/guides/models).
4. **Know who is asking.** Add `resolveUser` so tools know the signed-in visitor. See [Sessions and security](/docs/concepts/security).
5. **Allow time and streaming.** One turn can take several model calls, so give your route enough time. Make sure no proxy or CDN holds back streaming responses.
6. **Check your tools.** Each one must check permissions and return only what is needed.

## Good to know

- **Rate limits are per server.** Limits count inside each running copy. If you need one limit for your whole site, add it at your edge or gateway.
- **Background work.** Use `waitUntil`, for example Next.js `after`, so small jobs can finish after the answer.
- **Clean up.** If you set `audit.retentionDays`, run `speeq.purgeExpired()` from a protected scheduled job. A check also runs on its own, but only when traffic happens.
- **Other websites.** Same-origin requests work out of the box. To allow another website to call your handler, list its exact origin in `allowedOrigins`. CORS does not log anyone in.
- **Secrets.** Keep API keys and database strings in server environment variables only.

## Usage numbers (optional)

speeq can send anonymous counts to a dashboard that you run. It is off unless you set an address. Read [Privacy and telemetry](/docs/concepts/privacy).

## Next steps

- [Environment variables](/docs/reference/environment)
- [Server settings](/docs/reference/server-config)
