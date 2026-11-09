FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 HF_HOME=/models HF_HUB_DISABLE_TELEMETRY=1 WHISPER_MODEL=small
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir faster-whisper==1.2.1 av==16.0.1
WORKDIR /app
COPY server.py ./
RUN useradd -m speech && mkdir /models && chown speech:speech /models
USER speech
EXPOSE 8000
CMD ["python", "server.py"]
