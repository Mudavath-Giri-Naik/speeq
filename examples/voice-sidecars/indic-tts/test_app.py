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
    path = "/v1/audio/speech"
    assert client.post(path).status_code == 401
    assert client.get("/v1/voices", headers=headers).json()["voices"][0]["id"] == "default"
    monkeypatch.setattr(app, "synthesize", lambda text, voice: b"stub wav")
    result = client.post(path, json={"input":"private transcript","speed":1}, headers=headers)
    assert result.content == b"stub wav"
    assert result.headers["X-Speeq-Ignored"] == "speed"
    monkeypatch.setenv("MAX_REQUEST_BYTES", "3")
    assert client.post(path, content=b"1234", headers=headers).status_code == 413
    assert "private transcript" not in caplog.text
