# Deploying sdrviz with Docker Compose

Two containers: `caddy` (TLS, the built Svelte app, proxy for `/api` and `/ws`) and `api` (FastAPI).
State lives in three named volumes: `data` (SQLite, transit caches, audio), `caddy_data` (certificates), `caddy_config`.

## Run on a laptop

```sh
cd deploy
cp .env.example .env        # then set SDRVIZ_PASSWORD and SDRVIZ_SECRET
docker compose up --build
```

Open https://localhost (accept the warning: Caddy signs with its own CA). If ports 80 or 443 are taken, set
`SDRVIZ_HTTP_PORT` and `SDRVIZ_HTTPS_PORT` in `.env` and open `https://localhost:<port>`.

Stop with `docker compose down` (add `-v` to also delete the data volumes).

## What changes on a server

- `SDRVIZ_DOMAIN` is the real host name; DNS must point at the server and ports 80 and 443 must be open, then
  Caddy gets a Let's Encrypt certificate by itself.
- Use a long `SDRVIZ_PASSWORD` and a random `SDRVIZ_SECRET`. Keep `.env` mode 0600.
- The API port 8100 is not published; only Caddy is reachable.
- Server stand-up scripts and Litestream backups arrive in Sprint 3.

## LAN receiver

Set `SDRVIZ_RTLTCP_HOST` (for example `sdr.local`) in `.env` and the API container streams from that rtl_tcp server.
The container must be able to resolve and reach that host.

## Notes

- The API image has no `.env`, tests or `node_modules`. Check: `docker compose run --rm --entrypoint ls api -a /srv/sdrviz`.
- The API healthcheck uses `/api/auth/session` until a dedicated `/api/health` route exists.
