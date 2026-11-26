FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY indic-tts/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY common.py indic-tts/app.py ./
COPY voices.example.json /voices.example.json
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000","--no-access-log"]
