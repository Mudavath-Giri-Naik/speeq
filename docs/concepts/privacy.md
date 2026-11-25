# Privacy and data ownership

Your conversation store holds the session and audit events. Your model provider receives the prompt, recent history and any tool or knowledge results you include. Browser speech recognition may use the browser vendor's service. Treat page context and tool output as data you are choosing to share.

The optional telemetry transport receives a random instance ID, optional public project key, runtime and feature metadata, aggregate usage, latency histograms and error-code counts. Its payload excludes conversation text, audio, tool names and arguments, results, routes, user and session identifiers, model IDs and credentials.

Set `SPEEQ_TELEMETRY=0` or `telemetry.enabled: false` to disable collection. Delivery requires a configured endpoint or transport. [Field-by-field telemetry reference](../reference/telemetry.md)

## Development update notice

On first handler creation, a Node server outside production and CI requests `https://registry.npmjs.org/-/package/speeq/dist-tags` once. This GET uses default headers, no query or body, and a two-second deadline. npm can see ordinary connection metadata such as the server IP. The SDK compares the installed version locally. No installed version, application identifiers or conversation data are sent. Set `SPEEQ_UPDATE_CHECK=0`, `SPEEQ_TELEMETRY=0` or `updateCheck: false` to disable the request. The check needs no platform endpoint.
