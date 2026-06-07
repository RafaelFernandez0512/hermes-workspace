# Docker

Hermes Workspace is meant to run as a Docker stack:

- **`hermes-agent`** — Hermes gateway + dashboard
- **`hermes-workspace`** — the web UI (`server-entry.js`)
- **`proxy`** — optional HTTPS/domain front door (Caddy)

The workspace talks to the agent over the Docker network (`hermes-agent:8642` / `hermes-agent:9119`), so it never needs `localhost` for agent access.

## Quickstart

```bash
cp .env.example .env
# fill in provider key(s), API_SERVER_KEY, and HERMES_PASSWORD

docker compose up -d --build
```

Open:

```bash
http://localhost:3000
```

## Required env

- Provider key(s) for whichever model provider you use
- `API_SERVER_KEY` (the entrypoint exports it as `HERMES_API_TOKEN` inside the workspace)
- `HERMES_PASSWORD`
- `HERMES_DASHBOARD_INSECURE=1` when the agent dashboard auth gate refuses a Docker bridge bind

Recommended defaults for plain HTTP:

- `COOKIE_SECURE=0`
- `TRUST_PROXY=0`

## Localhost mode

This is the default path:

- agent is published on the machine's Tailscale IP
- workspace is published on the machine's Tailscale IP
- no proxy required

Set `TAILSCALE_IP=$(tailscale ip -4)` in `.env`.

Because the container binds `0.0.0.0` internally, **`HERMES_PASSWORD` is still required** even for localhost-only access.

Useful commands:

```bash
docker compose logs -f hermes-agent
docker compose logs -f hermes-workspace
```

## LAN / Tailscale mode

If you want direct access from another machine, just set `TAILSCALE_IP` to the machine's Tailscale IP and keep the compose stack as-is.

Then:

- keep `HERMES_API_URL=http://hermes-agent:8642`
- keep `HERMES_DASHBOARD_URL=http://hermes-agent:9119`
- keep `API_SERVER_KEY` and `HERMES_PASSWORD`
- keep `COOKIE_SECURE=0` for plain HTTP

If you terminate TLS elsewhere, set:

- `COOKIE_SECURE=1`
- `TRUST_PROXY=1`

## HTTPS / single-domain mode

Enable the optional proxy profile and set a domain:

```bash
HERMES_DOMAIN=workspace.example.com
CADDY_EMAIL=you@example.com
COOKIE_SECURE=1
TRUST_PROXY=1

docker compose --profile proxy up -d --build
```

Caddy will reverse-proxy `hermes-workspace:3000` and handle TLS.

## Development overlay

Build from local source instead of the production runtime image:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

This keeps the same service topology, but mounts the repo into the workspace container and watches the UI build output in-container.

## Update script

For a quick rebuild after code or service changes:

```bash
./scripts/docker-update.sh
# or: pnpm docker:update
```

Use `./scripts/docker-update.sh --dev` (or `pnpm docker:update:dev`) to start the development overlay.

## Rollback

### App rollback

```bash
docker compose down
# restore the previous git commit/tag
git checkout <commit>
./scripts/docker-update.sh
```

### Data rollback

The named volumes survive `docker compose down`.

- `docker compose down` → keeps data
- `docker compose down -v` → deletes data volumes

## Troubleshooting

| Symptom | Fix |
|---|---|
| Workspace login loops on HTTP | Set `COOKIE_SECURE=0` |
| Workspace refuses to start | Set `HERMES_PASSWORD` |
| Agent returns 401 | Make `API_SERVER_KEY` and `HERMES_API_TOKEN` match |
| Agent healthcheck fails | Add a valid provider key to `.env` |
| Proxy returns 502 | Check `hermes-agent` and `hermes-workspace` logs; wait for healthchecks |
| `localhost` works but LAN does not | Publish the workspace port on the host or use the proxy profile |

## UI vs agent

- **UI (`hermes-workspace`)**: browser app, auth, files, terminal, tasks, UI state
- **Agent (`hermes-agent`)**: model gateway, dashboard, sessions, skills, jobs

If the UI is up but features are missing, check the agent logs first.
