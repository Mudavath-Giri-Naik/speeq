# Indic voice sidecars

These reference services were **not verified against real weights by the author of this task**. Tests replace inference with stubs. The services buffer each utterance or sentence in memory. They authenticate every route and suppress access logging.

1. Review the model card, gated terms, source and weight licences, training data restrictions and voice-specific terms before commercial use. Record the revision and the terms you accepted. Accept the IndicConformer gate with your own Hugging Face account. Set `HF_TOKEN` for that account and `MODEL_REVISION` to a reviewed commit, because IndicConformer executes repository-supplied model code. [IndicConformer model card](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual) · [Indic Parler model card](https://huggingface.co/ai4bharat/indic-parler-tts)
2. Set `SIDECAR_TOKEN` to a secret shared only with your speeq server. From this directory run `docker compose up --build indic-stt indic-tts`. CPU endpoints are on loopback ports 8101 and 8102. Supply the corresponding `/v1` base URLs to the adapters. For CUDA-capable Docker hosts use `docker compose --profile gpu up --build stt-gpu tts-gpu` instead.
3. STT accepts PCM WAV and requires an Indic language such as `te-IN` or `hi`. Set `DECODER=ctc` or `rnnt`. For a CPU/ONNX deployment, evaluate a language-matched export separately, verify preprocessing and token mapping, and keep the same HTTP contract. This image uses the model loader.
4. TTS accepts one sentence and returns WAV. Select a voice from `GET /v1/voices`. The included voice catalogue is an example. Supply your own reviewed catalogue through `VOICES_FILE`.
5. In each service directory install `requirements-dev.txt` and run `python -m pytest`. Tests require neither model access nor a GPU.

Measure with `bench` on the target hardware.

| Hardware | Model revision | Memory | Latency |
| --- | --- | --- | --- |
| CPU | | | |
| GPU | | | |
