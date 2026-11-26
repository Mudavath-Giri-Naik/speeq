"""One-sentence, buffered Indic Parler synthesis."""
import io
import json
import os
from pathlib import Path
from functools import lru_cache
from fastapi import FastAPI, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from common import authorize, bounded_body

app = FastAPI()


def voices():
    return json.loads(Path(os.environ.get("VOICES_FILE", Path(__file__).resolve().parent.parent / "voices.example.json")).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_model():
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    name = "ai4bharat/indic-parler-tts"
    model = ParlerTTSForConditionalGeneration.from_pretrained(name).to(os.environ.get("DEVICE", "cpu")).eval()
    return model, AutoTokenizer.from_pretrained(name), AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)


def synthesize(text, voice):
    import torch
    import soundfile
    model, tokenizer, descriptions = load_model()
    desc = descriptions(voice["speaker"] + ". " + voice["style"], return_tensors="pt").to(model.device)
    prompt = tokenizer(text, return_tensors="pt").to(model.device)
    with torch.inference_mode():
        audio = model.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask,
                               prompt_input_ids=prompt.input_ids, prompt_attention_mask=prompt.attention_mask)
    out = io.BytesIO()
    soundfile.write(out, audio.cpu().numpy().squeeze(), model.config.sampling_rate, format="WAV")
    return out.getvalue()


@app.get("/v1/voices")
def list_voices(request: Request):
    authorize(request)
    return {"voices": [{"id": key, **voice} for key, voice in voices().items()]}


@app.post("/v1/audio/speech")
async def speak(request: Request):
    data = await bounded_body(request)
    try:
        body = json.loads(data)
    except (ValueError, UnicodeError):
        raise HTTPException(400, "Expected JSON") from None
    if not isinstance(body, dict) or not isinstance(body.get("input"), str) or not 0 < len(body["input"].strip()) <= 1000:
        raise HTTPException(400, "Supply a sentence of up to 1000 characters")
    voice_id = body.get("voice", "default")
    if not isinstance(voice_id, str) or voice_id not in voices() or body.get("response_format", "wav") != "wav":
        raise HTTPException(400, "Unsupported voice or format")
    try:
        wav = await run_in_threadpool(synthesize, body["input"], voices()[voice_id])
    except Exception:
        raise HTTPException(503, "Synthesis unavailable") from None
    return Response(wav, media_type="audio/wav", headers={"X-Speeq-Ignored": "speed"} if "speed" in body else {})
