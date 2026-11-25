# Deploy the handler

Mount the Fetch handler in your backend. Use a shared signing secret of at least 32 random characters across replicas, a durable conversation store and a server-side identity resolver. Pass the secret explicitly to `createSpeeq`. Keep model credentials and the MongoDB connection string in the server's environment.

Give the host enough request time for multiple model round trips and preserve streaming responses through your proxy. Use `waitUntil` or Next's `after` for background tasks. Run `speeq.purgeExpired()` from a protected scheduled job for reliable audit retention. The opportunistic daily check depends on traffic and instance lifetime.

The SDK rate limiter is per instance. Apply shared limits at the edge if you need a global quota. Configure additional CORS origins individually and replace forwarded headers at a trusted proxy. Enable telemetry by supplying an endpoint or transport if you want anonymous counts. [Environment settings](../reference/environment.md) · [Next.js example](nextjs.md)
