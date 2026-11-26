---

title: Multilingual speech
description: Choose an input language independently of the language used for replies.
---

# Multilingual speech

Fixed input uses the language you select. To listen without specifying a language, select server input and set `languageMode: "auto"`. Supply ordered `preferredLanguages`, for example `["te-IN", "hi-IN", "en-IN"]`. A server recognizer can report the language. When its result gives no matching candidate, the client counts script letters in the transcript. If the script gives no clear answer, it uses the current preference.

Telugu and English can occur in the same utterance. The heuristic uses the dominant script. Devanagari alone cannot distinguish Hindi from Marathi, Nepali or Sanskrit when those languages are candidates. A strong result can switch the input language immediately. Weak evidence must repeat on consecutive utterances. Browser Web Speech uses the selected input language and can emit a `languageSuggestion` event for the interface to display.

Use `client.setInputLanguage("hi-IN")` to override detection and `client.setInputLanguage("auto")` to enable it again. In auto mode replies follow the detected input by default. Set `replyLanguage: "fixed"` and use `setLanguage` to choose replies separately. A reply language must be enabled by the server.

For a correction interface, opt into `voice.keepLastUtterance`. Call `await client.retranscribeLast("te-IN")` to preview a new transcript in `snapshot.interimTranscript`. The retry stays separate from submitting a turn. The client holds one WAV in memory and drops it when the next utterance begins, the call ends or the client is destroyed.

**Code-mixed recognition has not been validated.** The maintainer's consented-audio benchmark and native-speaker review are pending.
