# speeq

## 0.3.0

### Minor Changes

- bd5a5ea: Add a `thinkingBudget` option to the Gemini adapter. Setting it to `0` turns thinking off on models that allow it, so replies start sooner.
- 04991ca: Add hands-free calls: `startCall()` and `endCall()` keep the microphone on, show words live, send each phrase, speak replies, pause speech when the visitor talks over it and resume from the same spot if nothing real follows. Speech adapters can now be continuous and can pause and resume.
- 3df2081: Calls now watch the microphone level apart from speech recognition. The assistant pauses within about a tenth of a second when the visitor talks, even softly, and even before any words are recognised, so it can be interrupted while it greets. Add `call.voiceDetection` (on by default), `call.correct` to fix common mishearings, and `client.getMicLevel()` for level meters.

### Patch Changes

- Updated dependencies [bd5a5ea]
- Updated dependencies [04991ca]
- Updated dependencies [3df2081]
  - @speeq/llm-gemini@0.3.0
  - @speeq/core@0.3.0
  - @speeq/client@0.3.0
  - @speeq/react@0.3.0
  - @speeq/testing@0.3.0
  - @speeq/llm-openai-compatible@0.3.0
  - @speeq/store-memory@0.3.0
  - @speeq/store-mongodb@0.3.0
  - @speeq/server@0.3.0

## 0.2.0

### Minor Changes

- 941266b: Add the speeq umbrella package and dev update notice

### Patch Changes

- Updated dependencies [941266b]
  - @speeq/core@0.2.0
  - @speeq/client@0.2.0
  - @speeq/react@0.2.0
  - @speeq/server@0.2.0
  - @speeq/testing@0.2.0
  - @speeq/llm-openai-compatible@0.2.0
  - @speeq/llm-gemini@0.2.0
  - @speeq/store-memory@0.2.0
  - @speeq/store-mongodb@0.2.0
