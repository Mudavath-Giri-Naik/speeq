# Privacy and data ownership

Your conversation store holds the session and audit events. Your model provider receives the prompt, recent history and any tool or knowledge results you include. Browser speech recognition may use the browser vendor's service. Treat page context and tool output as data you are choosing to share.

The optional telemetry transport receives a random instance ID, optional public project key, runtime and feature metadata, aggregate usage, latency histograms and error-code counts. Its payload excludes conversation text, audio, tool names and arguments, results, routes, user and session identifiers, model IDs and credentials.

Set `SPEEQ_TELEMETRY=0` or `telemetry.enabled: false` to disable collection. Delivery requires a configured endpoint or transport. [Field-by-field telemetry reference](../reference/telemetry.md)
