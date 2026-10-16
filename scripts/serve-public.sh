#!/usr/bin/env bash
# Serves Studio OS to clients from this Mac through a named Cloudflare Tunnel.
#
#   scripts/serve-public.sh start          # checks, builds, starts gateway + API + web + tunnel
#   scripts/serve-public.sh start --local  # same without the tunnel (http allowed), for a rehearsal
#   scripts/serve-public.sh stop
#   scripts/serve-public.sh status
#
# Configuration: .env (the normal local settings) overlaid by .env.public (public
# URLs and the limited browser key; see .env.public.example). The tunnel itself
# is ~/.cloudflared/config.yml (see scripts/cloudflared-config.example.yml).
# Runs production builds, so stop `npm run dev:local` first: both use ports 3000/3001.
# Keeps the Mac awake while the API runs. After a reboot: `colima start`, then start again.
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_DIR=".public-run"
TUNNEL_NAME="${STUDIO_TUNNEL_NAME:-studio-os}"
cmd="${1:-status}"
mode="${2:-}"

load_env() {
  [ -f .env ] || { echo "Missing .env (run npm run setup:local)"; exit 1; }
  set -a
  . ./.env
  [ -f .env.public ] && . ./.env.public
  set +a
  WEB_PORT="${WEB_PORT:-3000}"
  export PORT="${PORT:-3001}" MEDIA_GATEWAY_PORT="${MEDIA_GATEWAY_PORT:-9010}"
}

# A pidfile holds "<pid>|<start time>". After a reboot the pid may belong to an
# unrelated process, so it only counts as ours if the start time still matches.
# (The start time survives `exec`; the command line does not.)
started_at() { ps -p "$1" -o lstart= 2>/dev/null; }
is_running() {
  [ -f "$RUN_DIR/$1.pid" ] || return 1
  local pid stamp
  IFS='|' read -r pid stamp <"$RUN_DIR/$1.pid"
  kill -0 "$pid" 2>/dev/null && [ "$(started_at "$pid")" = "$stamp" ]
}
pid_of() { cut -d'|' -f1 "$RUN_DIR/$1.pid"; }

launch() { # name, command...
  local name="$1"; shift
  if is_running "$name"; then echo "  $name already running (pid $(pid_of "$name"))"; return; fi
  rm -f "$RUN_DIR/$name.pid"
  nohup "$@" >"$RUN_DIR/$name.log" 2>&1 &
  local pid=$!
  echo "$pid|$(started_at "$pid")" >"$RUN_DIR/$name.pid"
  echo "  $name started (pid $pid, log $RUN_DIR/$name.log)"
}

wait_for() { # name, url
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$2" && return 0; sleep 1; done
  echo "  $1 did not come up; see $RUN_DIR/$1.log"; return 1
}

start() {
  load_env
  mkdir -p "$RUN_DIR"
  if [ "$mode" != "--local" ]; then
    command -v cloudflared >/dev/null || { echo "cloudflared is not installed (brew install cloudflared)"; exit 1; }
    [ -f "$HOME/.cloudflared/config.yml" ] || { echo "Missing ~/.cloudflared/config.yml (see scripts/cloudflared-config.example.yml)"; exit 1; }
    # The tunnel must never point at MinIO (9000, demo admin login) or Postgres (5433).
    if grep -E 'service:.*:(9000|5433)([^0-9]|$)' "$HOME/.cloudflared/config.yml" >/dev/null; then
      echo "~/.cloudflared/config.yml points a hostname at MinIO or Postgres; use the media gateway (9010) instead"; exit 1
    fi
    export NODE_ENV=production
  fi

  echo "==> local services and migrations"
  node scripts/setup-local.mjs >/dev/null
  echo "==> readiness checks"
  if [ "$mode" = "--local" ]; then node scripts/check-public-ready.mjs --local; else node scripts/check-public-ready.mjs; fi
  echo "==> production build"
  npx turbo run build --filter=api --filter=web --output-logs=errors-only

  echo "==> starting"
  # The gateway faces the internet: give it only what it needs, not AUTH_SECRET or the admin keys.
  launch gateway env -i PATH="$PATH" R2_BUCKET_NAME="$R2_BUCKET_NAME" \
    R2_PRESIGN_ACCESS_KEY_ID="$R2_PRESIGN_ACCESS_KEY_ID" MEDIA_GATEWAY_PORT="$MEDIA_GATEWAY_PORT" \
    node scripts/media-gateway.mjs
  launch api bash -c 'cd apps/api && exec npm run start:prod'
  launch web bash -c "cd apps/web && exec npx next start -p $WEB_PORT"
  wait_for api "http://localhost:$PORT/health/ready"
  wait_for web "http://localhost:$WEB_PORT/login"
  launch awake caffeinate -ims -w "$(pid_of api)"
  if [ "$mode" != "--local" ]; then
    launch tunnel cloudflared tunnel --no-autoupdate run "$TUNNEL_NAME"
    sleep 4
    is_running tunnel || { echo "cloudflared exited; last log lines:"; tail -5 "$RUN_DIR/tunnel.log"; stop; exit 1; }
  fi

  echo
  echo "Studio OS is up: $WEB_APP_URL"
  [ "$mode" = "--local" ] && echo "(local rehearsal: no tunnel; nothing is reachable from the internet)"
  return 0
}

# npm/npx wrappers leave the real server as a grandchild: stop the whole tree by PID.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

stop() {
  for name in tunnel awake web api gateway; do
    if is_running "$name"; then
      local pid; pid="$(pid_of "$name")"
      kill_tree "$pid"
      echo "  stopped $name (pid $pid)"
    fi
    rm -f "$RUN_DIR/$name.pid"
  done
}

status() {
  for name in gateway api web awake tunnel; do
    if is_running "$name"; then echo "  $name: running (pid $(pid_of "$name"))"; else echo "  $name: stopped"; fi
  done
}

case "$cmd" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: scripts/serve-public.sh start [--local] | stop | status"; exit 2 ;;
esac
