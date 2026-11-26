import io
import sys
import wave
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app
from fastapi.testclient import TestClient


def test_routes(monkeypatch, caplog):
    monkeypatch.setenv("SIDECAR_TOKEN", "test")
    client = TestClient(app.app)
    headers = {"authorization": "Bearer test"}
    path = "/v1/audio/transcriptions"
    assert client.post(path).status_code == 401
    audio = io.BytesIO()
    with wave.open(audio, "wb") as w:
        w.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        w.writeframes(bytes(6400))
    files = {"file": ("test.wav", audio.getvalue())}
    assert client.post(path, files=files, headers=headers).status_code == 400
    monkeypatch.setattr(app, "recognize", lambda audio, lang: "private transcript")
    result = client.post(path, files=files, data={"language":"te-IN"}, headers=headers)
    assert result.json() == {"text":"private transcript","language":"te","duration":0.2}
    assert client.get("/health", headers=headers).is_success
    monkeypatch.setenv("MAX_REQUEST_BYTES", "3")
    assert client.post(path, content=b"1234", headers=headers).status_code == 413
    assert "private transcript" not in caplog.text
