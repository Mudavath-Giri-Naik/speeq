---

"@speeq/client": patch
"@speeq/server": patch
"@speeq/llm-openai-compatible": minor
"speeq": minor
---

Voice calls ignore short sounds such as coughs, clicks and filler words, and only a longer or clearly meant phrase interrupts the assistant. Replies stay in the visitor's language, and the OpenAI-compatible adapter can send `reasoningEffort` so reasoning models answer sooner.
