# sdrviz-api: FastAPI backend. Build context is the repo root (see deploy/compose.yml).
FROM python:3.14-slim

# ffmpeg renders the simulated clips; libopus0 is for Opus decoding of node audio (BE-5).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libopus0 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 sdrviz
WORKDIR /srv/sdrviz

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY data/seed data/seed
COPY data/geo data/geo
COPY data/sim data/sim

# Everything that changes at run time lives in the /data volume; the app expects it under data/.
RUN mkdir -p /data/db /data/transit /data/audio \
    && ln -s /data/db data/db \
    && ln -s /data/transit data/transit \
    && ln -s /data/audio data/audio \
    && chown -R sdrviz:sdrviz /data
VOLUME /data

USER sdrviz
WORKDIR /srv/sdrviz/backend
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/api/auth/session', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
