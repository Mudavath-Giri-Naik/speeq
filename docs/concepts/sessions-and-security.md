# Sessions and security

Supply a stable signing secret to every replica. The server signs session, user and expiry claims with HMAC-SHA256. A signed-in turn or confirmation must present its bearer token and resolve to the original account. The client can establish a fresh session after expiry. Keep account-specific browser state separate when a user signs out.

Pass `resolveUser(request)` to verify your app's session. Its presence makes authenticated sessions the default. Set `allowAnonymous` explicitly for public access. A resolver exception is treated as anonymous, so each privileged tool must check `ctx.user` and enforce object-level access itself.

The handler allows same-origin requests and accepts requests without an Origin header. For trusted cross-origin browser clients list exact `allowedOrigins`. Configure your reverse proxy to replace client-supplied forwarded host, protocol and IP headers. CORS does not authenticate callers.

Default guards cap JSON at 32 KiB, a turn at 2,000 characters, and tools at eight seconds and 8,000 output characters. Rate limits count turns per user/IP and session within each process. Use a shared gateway limiter if you need a deployment-wide quota. Audit redaction also changes future model history. [Server configuration](../reference/server-config.md)
