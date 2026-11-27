# @speeq/client

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- 744cdac: Add configurable multilingual voice recognition, conservative vocabulary correction, clarification guards, and explicit Indic speech profiles.
- 7db8074: Add configurable server speech providers and buffered browser audio.
- f98baa6: Add `listVoices`, `setVoice` and `previewVoice` to the client, a `voice.voiceId` option, and a recording cap of 25 seconds so long speech is sent instead of rejected. Fix the Sarvam text-to-speech request field and add every `bulbul:v3` voice as `SARVAM_VOICES`.

### Patch Changes

- 48ab917: Voice calls ignore short sounds such as coughs, clicks and filler words, and only a longer or clearly meant phrase interrupts the assistant. Replies stay in the visitor's language, and the OpenAI-compatible adapter can send `reasoningEffort` so reasoning models answer sooner.

## 0.3.0

### Minor Changes

- 04991ca: Add hands-free calls: `startCall()` and `endCall()` keep the microphone on, show words live, send each phrase, speak replies, pause speech when the visitor talks over it and resume from the same spot if nothing real follows. Speech adapters can now be continuous and can pause and resume.
- 3df2081: Calls now watch the microphone level apart from speech recognition. The assistant pauses within about a tenth of a second when the visitor talks, even softly, and even before any words are recognised, so it can be interrupted while it greets. Add `call.voiceDetection` (on by default), `call.correct` to fix common mishearings, and `client.getMicLevel()` for level meters.

## 0.2.0

### Minor Changes

- 941266b: Add the speeq umbrella package and dev update notice
