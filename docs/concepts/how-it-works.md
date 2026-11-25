# How a turn works

A client sends typed text or a final speech transcript with the language and current page context. The first interaction creates a session. Your backend loads recent conversation events, adds your instructions and available tools, and asks the configured model what to do.

Text deltas appear as they arrive. A model tool call returns to your server for schema validation and execution under the current user's permissions. A tool result can lead to another model step, navigation, a confirmation prompt or the final answer. The browser renders these events through your own controls. [Turn protocol](../reference/protocol.md) · [Architecture](../../ARCHITECTURE.md)
