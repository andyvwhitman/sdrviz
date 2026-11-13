# Requests from `stats`

## Shared kit
- None blocking. `HeroStrip` is not in the kit yet, so the screen writes the `.hero` markup directly (classes from `panels.css`). Fold it into `HeroStrip.svelte` when that lands and swap the markup in `Screen.svelte`.
- `PositionGlyphSvg` supports `fault-past` and `offline` already; no change needed.

## Tooling
- Headless screenshots of any authenticated route need a session cookie, and `shot.sh` starts a fresh Chromium profile each time. Request: a dev-only way to authenticate for screenshots (for example `?devlogin=1` calling `POST /api/auth/login` with the default password when running under Vite dev, or a persistent `--user-data-dir` helper in `scripts/shot.sh`).

## Backend
- `GET /api/stats?range=rolling_24h`: `hour_bins_start_t` and `ten_min_bins_start_t` can be negative and the first and last hour bins are partial. The screen handles this; no change needed. Confirm the real backend keeps this shape.
