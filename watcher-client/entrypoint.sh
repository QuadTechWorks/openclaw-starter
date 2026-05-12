#!/bin/sh
# entrypoint.sh — runs inside openclaw-watcher-client container
# Waits for the workspace volume and watcher service, then runs watcher_client.py
# with an infinite restart loop (exponential back-off, max 60s).

set -eu

CLIENT_PY="${WORKSPACE_DIR:-/workspace}/system/watcher_client.py"
WATCHER_URL="${WATCHER_URL:-http://openclaw-watcher:18791}"
SESSION_ID="${OPENCLAW_SESSION_ID:-client-$$}"
USER_ID="${OPENCLAW_USER_ID:-unknown}"
CHANNEL="${OPENCLAW_CHANNEL:-webchat}"

# ── Wait for workspace volume ────────────────────────────────────────────────
echo "[entrypoint] Waiting for workspace client: $CLIENT_PY"
retries=60
while [ ! -f "$CLIENT_PY" ]; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "[entrypoint] ERROR: $CLIENT_PY not found after 60 attempts — exiting"
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] Found $CLIENT_PY"

# ── Wait for watcher service ─────────────────────────────────────────────────
echo "[entrypoint] Waiting for watcher service at $WATCHER_URL ..."
retries=30
while true; do
  if python3 -c "import urllib.request,sys,os; r=urllib.request.urlopen(os.environ.get('WATCHER_URL','http://openclaw-watcher:18791')+'/health',timeout=3); sys.exit(0 if r.status==200 else 1)" 2>/dev/null; then
    echo "[entrypoint] Watcher service is ready"
    break
  fi
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "[entrypoint] WARNING: Watcher not reachable — client will self-retry"
    break
  fi
  sleep 3
done

# ── Restart loop ─────────────────────────────────────────────────────────────
backoff=2
attempt=0

while true; do
  attempt=$((attempt + 1))
  echo "[entrypoint] Starting watcher_client.py (attempt $attempt)"

  python3 "$CLIENT_PY" \
    --session-id  "$SESSION_ID" \
    --user-id     "$USER_ID" \
    --channel     "$CHANNEL" \
    --watcher-url "$WATCHER_URL" || true

  echo "[entrypoint] watcher_client.py exited — restarting in ${backoff}s"
  sleep "$backoff"

  # Exponential back-off, cap at 60s
  backoff=$((backoff * 2))
  if [ "$backoff" -gt 60 ]; then
    backoff=60
  fi
done
