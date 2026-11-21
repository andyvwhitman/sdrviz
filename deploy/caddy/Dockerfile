# Caddy with the built Svelte app. Build context is the repo root (see deploy/compose.yml).
FROM node:26-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# the Docs page bundles docs/api/*.md from above frontend/ (frontend/src/screens/docs/docs.ts)
COPY docs/api /build/docs/api
RUN npm run build

FROM caddy:2-alpine
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /build/frontend/dist /srv/www
