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
- Litestream backups are set aside for now.

## On Hetzner Cloud

1. Once, in the console: create a project, then an API token in it (Read & Write). On your Mac:
   `brew install hcloud` and `hcloud context create sdrviz` (paste the token).
2. `deploy/hetzner/provision.sh`: creates the SSH key, private network, firewall (80, 443 and 22 open; SSH is key only,
   using the first key in ~/.ssh/*.pub), a 20 GB Volume and the server in Ashburn, then prints the IP. Safe to re-run. Settings are at the top of the script.
3. Add an A record (and AAAA) for your subdomain pointing at that IP.
4. `scp deploy/server/setup.sh root@<ip>:` then `ssh root@<ip> 'bash setup.sh sdrviz.<yourdomain>'`. It installs
   Docker and git, keeps Docker's storage (database, certificates) on the Volume, clones the repo to /opt/sdrviz,
   writes `deploy/.env` with a generated password (printed once) and starts the stack. Re-run it to update.

The server clones from GitHub, so push `main` first. No VPN: SSH is open to the internet with password login turned off (keys only). To narrow it, re-run
provision.sh with `SDRVIZ_SSH_FROM=<your ip>/32`. The server runs the simulated radio (`SDRVIZ_SIM` defaults to true) until a node is enrolled.

## LAN receiver

Set `SDRVIZ_RTLTCP_HOST` (for example `sdr.local`) in `.env` and the API container streams from that rtl_tcp server.
The container must be able to resolve and reach that host.

## Notes

- The API image has no `.env`, tests or `node_modules`. Check: `docker compose run --rm --entrypoint ls api -a /srv/sdrviz`.
- The API healthcheck uses `/api/auth/session` until a dedicated `/api/health` route exists.
