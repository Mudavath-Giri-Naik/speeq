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

## Hands-free calls

For a phone-style conversation, call `startCall()` from a button. The microphone stays on, your words appear live, each phrase you finish is sent, and the replies are spoken. Call `endCall()` to stop.

```tsx
const { startCall, endCall, call, interimTranscript } = useSpeeq();
```

- `call.active` is true during a call. `interimTranscript` shows what the visitor is saying right now.
- **Talking over the assistant.** If the visitor starts talking while the assistant speaks, the speech pauses. If real words follow, the assistant stops and answers the new question. If nothing real follows within a second (a cough, a filler word like "um"), it continues from where it stopped. While paused, `call.interrupted` is true.
- **Echo guard.** If your speakers are loud, the microphone can hear the assistant. speeq ignores words that match what it is saying, so it does not interrupt itself. Headphones work best.
- **Quiet voices.** speeq also watches the microphone level, apart from speech recognition, so it notices a voice within about a tenth of a second, even a soft one, and pauses the assistant before any words are recognized. It asks the browser for echo cancellation and automatic gain. This works best with headphones. If the microphone cannot be opened for this, the call still works and relies on speech recognition alone. Turn it off with `voiceDetection: false`.
- **Fixing mishearings.** Pass `correct` a function that fixes common recognition mistakes, for example turning "speak" into your product name. It runs on every live and final phrase, so keep it fast. If it throws, the original words are used.
- **Level meter.** `client.getMicLevel()` returns the visitor's loudness from 0 to 1 during a call, for drawing a meter or an orb. Read it on each animation frame.
- **Tuning.** Pass `call={{ interruptGraceMs: 1000, commitAfterMs: 700, echoGuard: true, voiceDetection: true, correct }}` to the provider. `commitAfterMs` sends a phrase after that long without new words, instead of waiting for the browser to finish it. Lower is faster but may cut people off.

`startCall()` must run from a click or tap, because browsers ask for microphone permission. A call keeps going while the visitor moves between pages, as long as the provider stays mounted.

## Server speech

For buffered recognition or synthesis through your own backend, see [Voice providers](/docs/guides/voice-providers). Browser Web Speech remains the default.

See [Multilingual speech](/docs/guides/multilingual) for language selection and [Domain vocabulary](/docs/guides/vocabulary) for recognition hints.
