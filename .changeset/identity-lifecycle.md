---

"speeq": minor
"@speeq/core": minor
"@speeq/server": minor
"@speeq/client": minor
"@speeq/react": minor
"@speeq/store-memory": minor
"@speeq/store-mongodb": minor
"@speeq/testing": minor
---

The assistant now follows who is signed in. Session tokens are bound to the user and the tenant (`resolveUser` may return `tenantId` and a `profile`), so logging out, logging in, switching account or switching organisation ends the old conversation with the new `IDENTITY_CHANGED` code, and the browser client resets completely: no transcript, pending confirmation, page action, speech or late stream event of the previous user survives, and the stored session is removed. A failing `resolveUser` on a signed-in session now answers `AUTH_UNAVAILABLE` instead of looking like a logout. New `GET /identity` endpoint, `identity` in the session response, `identity.expose` server option, `client.refreshIdentity()` (also run on window focus) and the `useSpeeqIdentity()` React hook. Stores keep the tenant with each session and can filter by it. Older tokens and stored sessions keep working.
