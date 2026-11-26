# @speeq/speech

Use `createOpenAICompatibleStt` or `createOpenAICompatibleTts` on the server. Supply a base URL, model and provider kind. Keep credentials in server environment variables. Groq Whisper uses the same STT adapter with `https://api.groq.com/openai/v1`. Free-tier quotas depend on the account. Both HTTP paths buffer an utterance or sentence. Configure TTS voice metadata explicitly.
