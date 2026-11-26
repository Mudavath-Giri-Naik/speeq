# Collecting consented speech

Ask each volunteer before recording: “May we record these fictional sentences to evaluate speech recognition? The project team will compare transcripts and timing. You may skip any sentence, stop, or request deletion using your recording ID. We will tell you which providers receive audio and when we delete it.” Agree on recipients, access, retention and a deletion date before capture. Obtain separate permission before sending recordings to any remote service.

Use fictional names, parcel IDs and amounts. Exclude real account details, personal stories and background conversations. Record quiet rooms and ordinary background noise separately, using built-in laptop microphones, headsets and phone microphones. Note microphone, distance, environment, language, code-mix and speaking style as tags. Keep consent records separate from pseudonymous manifests. Restrict access, encrypt the recordings, remove local copies on the agreed date and confirm provider deletion procedures.

| Telugu and English           | Hindi and English                       |
| ---------------------------- | --------------------------------------- |
| ₹2,000 లోపు headphones చూపించు | ₹2,000 के budget में headphones दिखाओ      |
| PK42 delivery డిసెంబరు 3కి మార్చు | PK42 की delivery तीन दिसंबर पर shift करो |
| రవి కోసం Linux practice తెరువు  | रवि के लिए Linux practice खोलना          |

Ask native speakers to correct phrasing and reference text before collecting. Store one utterance per WAV and transcribe exactly, including English terms, in the spoken script. Keep a held-out set separate from vocabulary tuning. Follow the manifests README to score each language and tag.

## Tool-selection fixture

Build the workspace packages, set `VOICE_BENCH_LLM` to `gemini`, `groq` or `openai-compatible`, and supply `VOICE_BENCH_MODEL`. For a local compatible endpoint set `VOICE_BENCH_BASE_URL`. Supply `VOICE_BENCH_API_KEY` only when the chosen endpoint needs it. Set a temporary `VOICE_BENCH_AUDIT_TOKEN` in both shells. Run these commands in separate shells from the repository root.

```sh
pnpm --filter @speeq/voice-bench exec tsx src/fixture.ts
pnpm --filter @speeq/voice-bench exec tsx src/cli.ts intent --cases cases/te+en.json --server http://127.0.0.1:4313 --llm openai-compatible
```

The loopback fixture uses synthetic responses. The runner never approves a confirmation. Use the same LLM label as the configured server and inspect `reports/intent.json` for case-level mismatches. The clarification indicator counts a question mark in an assistant answer or a structured clarification result. Review individual answers manually, particularly questions phrased without that punctuation. The Telugu and Hindi cases still need native-speaker review.
