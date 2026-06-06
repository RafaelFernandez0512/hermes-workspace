#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# deploy-tailscale.sh — Build, push, and deploy hermes-workspace via Tailscale
#
# Usage:
#   cp .env.deploy.example .env.deploy
#   # Fill in .env.deploy
#   bash scripts/deploy-tailscale.sh
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${REPO_ROOT}/.env.deploy"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: .env.deploy not found. Copy .env.deploy.example and fill in the values." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "${ENV_FILE}"

: "${TAILSCALE_HOST:?TAILSCALE_HOST is required}"
: "${SSH_USER:?SSH_USER is required}"
: "${SSH_PORT:=22}"
: "${REMOTE_COMPOSE_PATH:?REMOTE_COMPOSE_PATH is required}"
: "${IMAGE_REPO:?IMAGE_REPO is required}"
: "${IMAGE_TAG:=latest}"
: "${REGISTRY_USER:?REGISTRY_USER is required}"
: "${REGISTRY_TOKEN:?REGISTRY_TOKEN is required}"

GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
ROLLBACK_TAG="rollback"

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
echo "==> Building ${IMAGE_REPO}:${IMAGE_TAG} (sha: ${GIT_SHA})"
docker build \
  -t "${IMAGE_REPO}:${IMAGE_TAG}" \
  -t "${IMAGE_REPO}:${GIT_SHA}" \
  "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# 2. Login + push
# ---------------------------------------------------------------------------
echo "==> Logging in to ghcr.io as ${REGISTRY_USER}"
echo "${REGISTRY_TOKEN}" | docker login ghcr.io -u "${REGISTRY_USER}" --password-stdin

echo "==> Tagging current remote as rollback"
docker pull "${IMAGE_REPO}:${IMAGE_TAG}" 2>/dev/null && \
  docker tag "${IMAGE_REPO}:${IMAGE_TAG}" "${IMAGE_REPO}:${ROLLBACK_TAG}" && \
  docker push "${IMAGE_REPO}:${ROLLBACK_TAG}" || true

echo "==> Pushing ${IMAGE_REPO}:${IMAGE_TAG}"
docker push "${IMAGE_REPO}:${IMAGE_TAG}"
docker push "${IMAGE_REPO}:${GIT_SHA}"

# ---------------------------------------------------------------------------
# 3. Remote deploy
# ---------------------------------------------------------------------------
COMPOSE_DIR="$(dirname "${REMOTE_COMPOSE_PATH}")"

echo "==> Deploying to ${SSH_USER}@${TAILSCALE_HOST}:${SSH_PORT}"
# shellcheck disable=SC2087
ssh -p "${SSH_PORT}" \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=15 \
    "${SSH_USER}@${TAILSCALE_HOST}" <<REMOTE
set -euo pipefail
cd "${COMPOSE_DIR}"

echo "-- Pulling latest image"
docker compose pull hermes-workspace

echo "-- Running lifecycle migration"
docker compose run --rm hermes-workspace pnpm tsx scripts/migrate-lifecycle.ts || true

echo "-- Restarting services"
docker compose up -d hermes-workspace hermes-agent

echo "-- Current state"
docker compose ps
REMOTE

# ---------------------------------------------------------------------------
# 4. Healthcheck (retry up to 6x / 30s)
# ---------------------------------------------------------------------------
echo "==> Waiting for service to be healthy..."
for attempt in 1 2 3 4 5 6; do
  sleep 5
  STATUS=$(curl -fsS -o /dev/null -w "%{http_code}" \
    "http://${TAILSCALE_HOST}:3000/api/health" 2>/dev/null || echo "0")
  if [[ "${STATUS}" == "200" ]]; then
    echo "==> Health OK (${STATUS})"
    break
  fi
  echo "    Attempt ${attempt}/6 — status ${STATUS}"
  if [[ "${attempt}" -eq 6 ]]; then
    echo "ERROR: Service did not become healthy. Initiating rollback." >&2
    ssh -p "${SSH_PORT}" "${SSH_USER}@${TAILSCALE_HOST}" <<ROLLBACK
set -euo pipefail
cd "${COMPOSE_DIR}"
docker compose pull --quiet hermes-workspace 2>/dev/null || true
docker tag "${IMAGE_REPO}:${ROLLBACK_TAG}" "${IMAGE_REPO}:${IMAGE_TAG}" 2>/dev/null || true
docker compose up -d hermes-workspace hermes-agent
ROLLBACK
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# 5. Smoke tests
# ---------------------------------------------------------------------------
echo "==> Smoke tests"
BASE="http://${TAILSCALE_HOST}:3000"

smoke() {
  local label="$1"
  local url="$2"
  local code
  code=$(curl -fsS -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null || echo "0")
  if [[ "${code}" == "200" ]]; then
    echo "    [OK] ${label} → ${code}"
  else
    echo "    [WARN] ${label} → ${code} (non-200)"
  fi
}

smoke "health"              "${BASE}/api/health"
smoke "tasks list"          "${BASE}/api/hermes-tasks?limit=1"
smoke "kanban"              "${BASE}/api/swarm-kanban"
smoke "cleanup (dry-run)"  "${BASE}/api/admin/cleanup?dry-run=1"

echo "==> Deploy complete — sha: ${GIT_SHA}"
