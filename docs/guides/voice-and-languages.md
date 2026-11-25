# Add voice and languages

Configure the server's `agent.languages` and `agent.defaultLanguage`. The default tags are `en-IN`, `te-IN` and `hi-IN`. Bind your picker to the client's `languages` and use `setLanguage(tag)`. A supported server language does not guarantee a matching device voice.

Read `support.speechInput` before enabling a microphone control. Bind it to `startListening()` and `stopListening()` and display `interimTranscript` while listening. The final transcript sends automatically by default. Starting a new interaction can interrupt speech. Keep a typed input and call `sendText(text)` when recognition is unavailable or permission is denied.

Replies can be spoken in chunks. Check `support.speechOutput` and `support.voiceForLanguage`, which can be unknown while the device loads its voices. Set `speakReplies: false` for silent replies. Omit adapters to use browser Web Speech defaults, supply your own via `speech` or pass `null` to disable one side. Recognition availability, permission prompts, language coverage and whether audio is processed remotely depend on the browser. [Client reference](../reference/client.md)
