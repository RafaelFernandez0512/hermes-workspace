#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_USER=workspace
WORKSPACE_GROUP=workspace
WORKSPACE_HOME="$(getent passwd "$WORKSPACE_USER" | cut -d: -f6)"
TARGET_UID="${HERMES_UID:-}"
TARGET_GID="${HERMES_GID:-}"
WAIT_TIMEOUT_SECONDS="${HERMES_WAIT_TIMEOUT_SECONDS:-60}"

log() {
  printf '%s %s\n' '[docker-entrypoint]' "$*"
}

fail() {
  printf '%s %s\n' '[docker-entrypoint] ERROR:' "$*" >&2
  exit 1
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

fix_owner_if_needed() {
  local path="$1"
  if [ ! -e "$path" ]; then
    return
  fi

  local actual_uid current_uid
  actual_uid=$(id -u "$WORKSPACE_USER")
  current_uid=$(stat -c %u "$path" 2>/dev/null || true)
  if [ -n "$current_uid" ] && [ "$current_uid" != "$actual_uid" ]; then
    chown -R "$WORKSPACE_USER:$WORKSPACE_GROUP" "$path" 2>/dev/null || \
      log "warning: chown failed for $path (continuing anyway)"
  fi
}

if [ "$(id -u)" = "0" ]; then
  current_uid=$(id -u "$WORKSPACE_USER")
  current_gid=$(id -g "$WORKSPACE_USER")

  if [ -S /var/run/docker.sock ]; then
    docker_sock_gid=$(stat -c %g /var/run/docker.sock 2>/dev/null || true)
    if [ -n "$docker_sock_gid" ]; then
      docker_group_name=$(getent group "$docker_sock_gid" | cut -d: -f1 || true)
      if [ -z "$docker_group_name" ]; then
        docker_group_name="docker-sock"
        if ! getent group "$docker_group_name" >/dev/null 2>&1; then
          groupadd -o -g "$docker_sock_gid" "$docker_group_name" 2>/dev/null || true
        fi
      fi
      if [ -n "$docker_group_name" ]; then
        usermod -aG "$docker_group_name" "$WORKSPACE_USER" 2>/dev/null || true
      fi
    fi
  fi

  if [ -n "$TARGET_GID" ] && [ "$TARGET_GID" != "$current_gid" ]; then
    log "changing workspace GID to $TARGET_GID"
    groupmod -o -g "$TARGET_GID" "$WORKSPACE_GROUP" 2>/dev/null || true
  fi

  if [ -n "$TARGET_UID" ] && [ "$TARGET_UID" != "$current_uid" ]; then
    log "changing workspace UID to $TARGET_UID"
    usermod -o -u "$TARGET_UID" "$WORKSPACE_USER"
  fi

  mkdir -p "$WORKSPACE_HOME/.hermes" /workspace
  fix_owner_if_needed "$WORKSPACE_HOME"
  fix_owner_if_needed /workspace

  log "dropping root privileges"
  export HOME="$WORKSPACE_HOME"
  export USER="$WORKSPACE_USER"
  export LOGNAME="$WORKSPACE_USER"
  exec setpriv \
    --reuid "$WORKSPACE_USER" \
    --regid "$WORKSPACE_GROUP" \
    --init-groups \
    --inh-caps=-all \
    "$0" "$@"
fi

workspace_password="${HERMES_PASSWORD:-${CLAUDE_PASSWORD:-}}"
if [ -n "$workspace_password" ]; then
  export HERMES_PASSWORD="$workspace_password"
fi

if [ -z "${HERMES_API_URL:-}" ]; then
  fail "HERMES_API_URL is required (set it to the agent service URL, usually http://hermes-agent:8642)"
fi

if [ -z "${HERMES_DASHBOARD_URL:-}" ]; then
  fail "HERMES_DASHBOARD_URL is required (set it to the dashboard service URL, usually http://hermes-agent:9119)"
fi

if [ -z "${HERMES_API_TOKEN:-}" ] && [ -n "${API_SERVER_KEY:-}" ]; then
  export HERMES_API_TOKEN="$API_SERVER_KEY"
fi

if [ -n "${HERMES_API_TOKEN:-}" ] && [ -z "${API_SERVER_KEY:-}" ]; then
  export API_SERVER_KEY="$HERMES_API_TOKEN"
fi

if [ -n "${HERMES_API_TOKEN:-}" ] && [ -n "${API_SERVER_KEY:-}" ] && [ "$HERMES_API_TOKEN" != "$API_SERVER_KEY" ]; then
  fail "HERMES_API_TOKEN and API_SERVER_KEY must match if both are set"
fi

if [ -z "${HERMES_API_TOKEN:-}" ]; then
  fail "HERMES_API_TOKEN is required (set it directly or provide API_SERVER_KEY so the entrypoint can export it)"
fi

if [ -z "$workspace_password" ]; then
  fail "HERMES_PASSWORD is required for Docker deployments (set HERMES_PASSWORD or CLAUDE_PASSWORD in .env)"
fi

wait_for_http() {
  local url="$1"
  local label="$2"
  local start_ts now code curl_args
  start_ts=$(date +%s)

  while true; do
    curl_args=(--silent --show-error --output /dev/null --write-out '%{http_code}')
    if [ -n "${HERMES_API_TOKEN:-}" ]; then
      curl_args+=(-H "Authorization: Bearer ${HERMES_API_TOKEN}")
    fi

    code=$(curl "${curl_args[@]}" "$url" 2>/dev/null || true)
    if [ "$code" = "200" ] || [ "$code" = "204" ]; then
      log "$label is ready"
      return 0
    fi

    if [ "$code" = "401" ] || [ "$code" = "403" ]; then
      fail "$label returned HTTP $code — check that the token matches on both sides"
    fi

    now=$(date +%s)
    if [ $((now - start_ts)) -ge "$WAIT_TIMEOUT_SECONDS" ]; then
      fail "timed out waiting for $label at $url after ${WAIT_TIMEOUT_SECONDS}s"
    fi

    sleep 2
  done
}

if is_truthy "${HERMES_WAIT_FOR_DEPENDENCIES:-1}"; then
  wait_for_http "${HERMES_API_URL%/}/health" "Hermes Agent gateway"
  wait_for_http "${HERMES_DASHBOARD_URL%/}/api/status" "Hermes Agent dashboard"
fi

exec "$@"
