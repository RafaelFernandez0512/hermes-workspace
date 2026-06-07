#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in the required values." >&2
  exit 1
fi

MODE="prod"
ENABLE_PROXY="0"

# shellcheck disable=SC1091
set -a
source ./.env
set +a

if [[ -z "${TAILSCALE_IP:-}" ]]; then
  TAILSCALE_IP="$(tailscale ip -4 | head -n1 2>/dev/null || true)"
fi

if [[ -n "${HERMES_DOMAIN:-}" ]]; then
  ENABLE_PROXY="1"
fi

usage() {
  cat <<'EOF'
Usage: scripts/docker-update.sh [--dev]

Rebuilds and restarts the Hermes Docker stack.

Options:
  --dev   Use docker-compose.dev.yml for the local source-mount overlay
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      MODE="dev"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

COMPOSE_ARGS=(-f docker-compose.yml)
if [[ "$MODE" == "dev" ]]; then
  COMPOSE_ARGS+=(-f docker-compose.dev.yml)
fi
if [[ "$ENABLE_PROXY" == "1" ]]; then
  COMPOSE_ARGS+=(--profile proxy)
fi

echo "==> Pulling hermes-agent"
docker compose "${COMPOSE_ARGS[@]}" pull hermes-agent

echo "==> Rebuilding workspace stack (${MODE})"
docker compose "${COMPOSE_ARGS[@]}" up -d --build --remove-orphans

echo "==> Waiting for the workspace to become healthy"
TARGET_HOST="${TAILSCALE_IP:-127.0.0.1}"
for _ in {1..60}; do
  if curl -fsS "http://${TARGET_HOST}:3000/api/auth-check" >/dev/null 2>&1; then
    echo "==> Update complete"
    exit 0
  fi
  sleep 2
done

echo "ERROR: workspace did not become healthy in time" >&2
docker compose "${COMPOSE_ARGS[@]}" ps >&2 || true
docker compose "${COMPOSE_ARGS[@]}" logs --tail=100 >&2 || true
exit 1
