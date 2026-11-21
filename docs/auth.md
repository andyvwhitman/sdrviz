# Login, roles and abuse limits (Sprint 3, block B)

## Roles

| Role | Password | Can |
|---|---|---|
| viewer | `SDRVIZ_PASSWORD` | read everything except nodes, sources and receiver settings; listen; acknowledge a feed fault (`POST /api/feeds/{id}/ack`) |
| admin | `SDRVIZ_ADMIN_PASSWORD` | everything |

If `SDRVIZ_ADMIN_PASSWORD` is not set, `SDRVIZ_PASSWORD` logs in as admin (single-password mode, the old behaviour).
Sessions made before the roles existed hold `admin`.

`POST /api/auth/login {password}` picks the role from the password and answers 204 (cookie) or 401.
`GET /api/auth/session` -> `{authenticated: bool, sim: bool, role: "viewer" | "admin" | null}` (`role` is null when not logged in).

## Admin-only routes (403 `{detail: "Admin only"}` for a viewer)

- all of `/api/nodes` (list, create, patch, rekey, revoke, commands), including GET: node keys and health are fleet management;
- `/api/transit/sources` (GET too: URLs and keys), POST, PUT, DELETE, `POST .../refresh`;
- `/api/radio/settings` (GET and PUT);
- feeds: create, update, delete (not `ack`);
- frequencies: create, update, delete;
- `POST /api/sim/jump`;

401 still means "not logged in". The UI can hide admin controls from `role`; the server enforces it regardless.

## Source URLs

Transit source URLs (`static_url`, `rt_*_url`) must be `http` or `https`, have no user name or password, and every address the host
resolves to must be public. Loopback, private, link-local (cloud metadata) and docker-network addresses give 422 with the reason in `detail`.

## Login limits

Only wrong passwords count, per client address (the real one: uvicorn runs with `--proxy-headers`).

| Situation | Answer |
|---|---|
| 5 wrong passwords within 60 s | 429, `Retry-After: <seconds until a try is allowed>` (even for the right password) |
| 15 wrong passwords within 15 min | 423, `Retry-After: <seconds of lockout left>` (15 min) |
| password longer than 256 characters | 422 |

A right password clears the client's failures. Failed node authentications share the same limiter (close code 4429 while blocked).

## Settings checks

When `SDRVIZ_PUBLIC_URL` starts with `https://` (a public site) the server refuses to start if `SDRVIZ_PASSWORD` or
`SDRVIZ_ADMIN_PASSWORD` is a known default or under 8 characters, if `SDRVIZ_SECRET` is a default or under 32 characters, or if the two
passwords are equal. It logs a warning when no admin password is set. The session cookie is `Secure` on https.

## Origin check

`POST`, `PUT`, `PATCH`, `DELETE` and every WebSocket handshake that carries an `Origin` header must name the same host as the `Host` header
(or the host in `SDRVIZ_PUBLIC_URL`); otherwise 403 (HTTP) or close 1008 (WebSocket). Requests without `Origin` (curl, the node agent) pass.
