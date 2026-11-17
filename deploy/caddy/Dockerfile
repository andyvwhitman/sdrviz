# Caddy with the built Svelte app. Build context is the repo root (see deploy/compose.yml).
FROM node:26-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /build/dist /srv/www
