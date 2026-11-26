"""Buffered IndicConformer transcription service."""
import io
import os
import wave
from email.parser import BytesParser
from email.policy import default
from functools import lru_cache
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from common import authorize, bounded_body

app = FastAPI()
LANGUAGES = set("as bn brx doi gu hi kn kok ks mai ml mni mr ne or pa sa sat sd ta te ur".split())


@lru_cache(maxsize=1)
def load_model():
    from transformers import AutoModel
    return AutoModel.from_pretrained(
        "ai4bharat/indic-conformer-600m-multilingual",
        revision=os.environ["MODEL_REVISION"], trust_remote_code=True,
        token=os.environ.get("HF_TOKEN")
    ).to(os.environ.get("DEVICE", "cpu")).eval()


def recognize(audio, language):
    import torch
    import torchaudio
    import soundfile
    samples, rate = soundfile.read(io.BytesIO(audio), dtype="float32", always_2d=True)
    wav = torch.from_numpy(samples.mean(axis=1)).unsqueeze(0)
    wav = torchaudio.functional.resample(wav, rate, 16000).to(os.environ.get("DEVICE", "cpu"))
    decoder = os.environ.get("DECODER", "ctc").lower()
    if decoder not in ("ctc", "rnnt"):
        raise ValueError("Invalid decoder")
    with torch.inference_mode():
        return load_model()(wav, language, decoder)


@app.get("/health")
def health(request: Request):
    authorize(request)
    return {"ok": True}


@app.post("/v1/audio/transcriptions")
async def transcribe(request: Request):
    data = await bounded_body(request)
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data") or "\n" in content_type or "\r" in content_type:
        raise HTTPException(400, "Expected multipart form")
    message = BytesParser(policy=default).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + data)
    fields = {part.get_param("name", header="content-disposition"): part.get_payload(decode=True)
              for part in message.iter_parts()}
    language = fields.get("language", b"").decode("ascii", errors="replace").lower().split("-")[0]
    if language not in LANGUAGES:
        raise HTTPException(400, "Specify a supported Indic speech language")
    audio = fields.get("file", b"")
    try:
        with wave.open(io.BytesIO(audio), "rb") as source:
            duration = source.getnframes() / source.getframerate()
    except (wave.Error, EOFError, ZeroDivisionError):
        raise HTTPException(400, "Expected a PCM WAV file") from None
    try:
        text = await run_in_threadpool(recognize, audio, language)
    except Exception:
        raise HTTPException(503, "Recognition unavailable") from None
    return {"text": text, "language": language, "duration": duration}
