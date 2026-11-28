---
"@speeq/server": patch
---

A model that goes silent no longer leaves the chat on "thinking". New `agent.modelTimeoutMs` (default 20 s, 3 to 120 s) limits how long a model call may go without sending anything, before the first chunk and between chunks; the turn then ends with `PROVIDER_ERROR` and reason `timeout` ("That took too long. Please try again."), and the development log names the provider and the limit.
