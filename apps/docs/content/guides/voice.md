---

title: Voice and languages
description: Add a microphone and spoken replies, and handle browsers that do not support them.
---

# Voice and languages

**What you will learn:** how to add speaking and listening, and what to do when the browser cannot.

speeq uses the **Web Speech** features built into browsers. They are free, and they need no extra setup. But they depend on the browser, so always keep a text box too.

## Languages

On the server, set the languages the assistant may use:

```ts
agent: {
  name: "Helper",
  instructions: "Help visitors.",
  languages: ["en-IN", "hi-IN"],
  defaultLanguage: "en-IN",
}
```

The defaults are `en-IN`, `te-IN` and `hi-IN`. In the browser, the client tells you the list in `languages`. Call `setLanguage(tag)` when a visitor picks one.

> **Note** A language that your server supports might not have a voice on the visitor's device. Do not promise a voice. Check support first.

## Listen

Check `support.speechInput` before you show a microphone button. Then:

- Call `startListening()` when the button is pressed.
- Show `interimTranscript` while the visitor is talking.
- The final text is sent automatically by default.
- Call `stopListening()` to stop.

## Speak

Replies are spoken by default. Set `speakReplies={false}` on the provider to keep them silent. Check `support.speechOutput` first. Starting a new request interrupts speech that is playing.

## Always keep a text fallback

Recognition may be missing. The visitor may also deny the microphone. In both cases, keep a typed input that calls `sendText(text)`.

## Privacy

With the default adapters, the browser vendor may process the audio on its own servers. This depends on the browser. Tell your visitors if that matters for your product. To use your own speech service, pass your own `speech.input` or `speech.output`, or `null` to turn one side off.

## Next steps

- [Browser client reference](/docs/reference/client)
- [React hooks](/docs/reference/react)
