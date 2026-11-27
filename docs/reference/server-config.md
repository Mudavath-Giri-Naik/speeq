# Server configuration

Pass a `SpeeqConfig<TUser>` to `createSpeeq`. The return value exposes `handler(request)` and `purgeExpired()`.

| Field          | Type                                                                 | Default and behavior                                                                                                                                        |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent          | AgentConfig                                                          | Required. Configures the assistant below.                                                                                                                   |
| llm            | LLMProvider                                                          | Required. Streams model output and tool calls.                                                                                                              |
| uiActions      | UiActionDefinition[]                                                 | Page actions the agent may ask for (opt-in per session). Limits: guardrails.uiActionsPerTurn (5), uiActionsPerSession (30).                                 |
| store          | ConversationStore                                                    | Required. Stores audit events, history and confirmations.                                                                                                   |
| secret         | string                                                               | Random process secret in development. Required in production. Signs session tokens.                                                                         |
| updateCheck    | boolean                                                              | True. Set false to disable the development npm version check on first handler creation.                                                                     |
| projectKey     | string                                                               | Absent. Optional public telemetry attribution.                                                                                                              |
| resolveUser    | (request: Request) => TUser or null, synchronously or asynchronously | Absent. Resolves the host identity on every session request. Return `{ id, tenantId?, profile? }`; a throw on a signed-in session answers AUTH_UNAVAILABLE. |
| allowAnonymous | boolean                                                              | True when no resolver is supplied, otherwise false.                                                                                                         |
| identity       | { expose?: ("displayName" \| "preferredName" \| "locale")[] }        | `[]`. Profile fields from the resolved user's `profile` that the browser (and later the model) may see. User and tenant ids are never exposed.              |
| routes         | RouteDefinition[]                                                    | Empty. Manifest for navigation.                                                                                                                             |
| tools          | ToolDefinition[]                                                     | Empty. Validated custom actions.                                                                                                                            |
| knowledge      | KnowledgeSource[]                                                    | Empty. Sources for built-in search.                                                                                                                         |
| allowedOrigins | string[]                                                             | Empty. Additional exact browser origins.                                                                                                                    |
| audit          | AuditConfig                                                          | Empty. Configures access, redaction and retention below.                                                                                                    |
| guardrails     | GuardrailsConfig                                                     | Defaults below.                                                                                                                                             |
| telemetry      | TelemetryConfig                                                      | Defaults below.                                                                                                                                             |
| waitUntil      | (promise: Promise<unknown>) => void                                  | Absent. Hands background work to the host. Telemetry otherwise runs in the stream tail.                                                                     |
| logger         | SpeeqLogger                                                          | Prefixed console logger. Implement error and warn accepting a message and optional detail.                                                                  |

| Nested field                           | Type                                                          | Default and behavior                                                            |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| agent.name, agent.instructions         | string                                                        | Both required. Display name and host instructions.                              |
| agent.languages                        | string[]                                                      | en-IN, te-IN, hi-IN. Allowed language tags.                                     |
| agent.defaultLanguage                  | string                                                        | First configured language. Must be in the list.                                 |
| agent.maxSteps                         | number                                                        | 5, clamped to 1–12 model calls.                                                 |
| agent.historyTurns                     | number                                                        | 8 previous user turns, minimum zero.                                            |
| agent.temperature                      | number                                                        | Unset. Passed to the provider.                                                  |
| audit.authorize                        | (request: Request) => boolean or Promise<boolean>             | Absent gives 404 on audit routes. Requires explicit true to permit access.      |
| audit.redact                           | (event: NewConversationEvent) => NewConversationEvent or null | No custom transform. Built-in masking runs first. Null drops the event.         |
| audit.retentionDays                    | number                                                        | Unset. Enables expiry by last session activity.                                 |
| guardrails.maxToolOutputChars          | number                                                        | 8000 characters. Bounds tool output.                                            |
| guardrails.toolTimeoutMs               | number                                                        | 8000 ms. Tool definitions can override it.                                      |
| guardrails.maxRequestBytes             | number                                                        | 32768 bytes of JSON.                                                            |
| guardrails.sessionTtlSeconds           | number                                                        | 43200 seconds until token expiry.                                               |
| guardrails.rateLimit                   | object or false                                               | Enabled per instance. False disables both limiters.                             |
| guardrails.rateLimit.turnsPerMinute    | number                                                        | 20 per user/IP and session.                                                     |
| guardrails.rateLimit.sessionsPerMinute | number                                                        | 10 creations per user/IP.                                                       |
| telemetry.enabled                      | boolean                                                       | True when a destination exists. False or SPEEQ_TELEMETRY=0 disables collection. |
| telemetry.endpoint                     | string                                                        | SPEEQ_PLATFORM_URL. Base URL for default HTTP delivery.                         |
| telemetry.transport                    | TelemetryTransport                                            | Uses HTTP when an endpoint is supplied. A custom transport takes precedence.    |
| telemetry.flushIntervalMs              | number                                                        | 60000 between sends after the first flush.                                      |

[Telemetry fields and delivery](telemetry.md) · [Tool definitions](../guides/tools-and-knowledge.md)
