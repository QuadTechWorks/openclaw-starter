#!/usr/bin/env bash
# =============================================================================
# setup.sh — OpenClaw Interactive Setup Wizard
#
# Generates .env and openclaw.json from your answers, then optionally
# starts the stack.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()      { echo -e "${GREEN}[✓]${NC}  $*"; }
info()    { echo -e "${BLUE}[→]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[!]${NC}  $*"; }
fail()    { echo -e "${RED}[✗]${NC}  $*" >&2; exit 1; }
ask()     { echo -e "${CYAN}[?]${NC}  $*"; }
section() { echo -e "\n${YELLOW}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v docker  > /dev/null 2>&1 || fail "Docker not found. Install from https://docs.docker.com/get-docker/"
command -v openssl > /dev/null 2>&1 || fail "openssl not found."

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        OpenClaw Setup Wizard              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# 1 — Agent identity
# =============================================================================
section "Agent Identity"
echo ""
ask "What is your agent's name? (e.g. Aria, Atlas, Max): "
read -r AGENT_NAME
[[ -z "$AGENT_NAME" ]] && fail "Agent name cannot be empty."
ok "Agent name: $AGENT_NAME"

echo ""
ask "Agent role? (e.g. \"Personal AI assistant\", \"Software engineering assistant\") [Personal AI assistant]: "
read -r AGENT_ROLE
AGENT_ROLE="${AGENT_ROLE:-Personal AI assistant}"
ok "Agent role: $AGENT_ROLE"

echo ""
ask "Agent vibe? (e.g. \"Sharp, concise, execution-focused\") [Sharp, concise, execution-focused]: "
read -r AGENT_VIBE
AGENT_VIBE="${AGENT_VIBE:-Sharp, concise, execution-focused}"
ok "Agent vibe: $AGENT_VIBE"

echo ""
ask "Agent emoji? [🤖]: "
read -r AGENT_EMOJI
AGENT_EMOJI="${AGENT_EMOJI:-🤖}"
ok "Agent emoji: $AGENT_EMOJI"

echo ""
ask "One-line description for introductions? (used in \"Hi, I am NAME — DESCRIPTION.\") [your $AGENT_ROLE]: "
read -r AGENT_DESCRIPTION
AGENT_DESCRIPTION="${AGENT_DESCRIPTION:-your $AGENT_ROLE}"
ok "Agent description: $AGENT_DESCRIPTION"

# =============================================================================
# 2 — LLM API Keys
# =============================================================================
section "LLM API Keys"
echo ""
ask "Anthropic API key (required — starts with sk-ant-api03-): "
read -r ANTHROPIC_KEY
[[ -z "$ANTHROPIC_KEY" ]] && fail "Anthropic API key is required."
ok "Anthropic key: ${ANTHROPIC_KEY:0:24}..."

echo ""
ask "OpenAI API key (optional — press Enter to skip): "
read -r OPENAI_KEY
[[ -n "$OPENAI_KEY" ]] && ok "OpenAI key: ${OPENAI_KEY:0:20}..." || info "Skipped OpenAI key."

# =============================================================================
# 3 — Optional integrations
# =============================================================================
section "Optional: Web Search (Tavily)"
echo ""
ask "Tavily API key for web search skill (optional — press Enter to skip): "
read -r TAVILY_KEY
[[ -n "$TAVILY_KEY" ]] && ok "Tavily key set." || info "Skipped — web search skill will not work."

# =============================================================================
# 4 — Auto-generate gateway token
# =============================================================================
section "Gateway Token"
GATEWAY_TOKEN=$(openssl rand -hex 32)
ok "Gateway token generated (saved to .env)."

# =============================================================================
# 5 — Teams integration (optional)
# =============================================================================
section "Optional: Microsoft Teams"
echo ""
ask "Enable Microsoft Teams integration? [y/N]: "
read -r TEAMS_INPUT
TEAMS=$(echo "${TEAMS_INPUT:-N}" | tr '[:lower:]' '[:upper:]')

TEAMS_APP_ID=""
TEAMS_APP_PASSWORD=""
TEAMS_TENANT_ID=""
NGROK_AUTHTOKEN=""
NGROK_URL=""

if [[ "$TEAMS" == "Y" ]]; then
  echo ""
  info "Get these from: Azure Portal → App Registrations → your bot"
  echo ""
  ask "Teams Bot App ID (UUID): "
  read -r TEAMS_APP_ID
  ask "Teams Bot App Password (client secret value): "
  read -r TEAMS_APP_PASSWORD
  ask "Azure Tenant ID [press Enter for default multi-tenant]: "
  read -r TEAMS_TENANT_ID_INPUT
  TEAMS_TENANT_ID="${TEAMS_TENANT_ID_INPUT:-common}"
  ok "Teams credentials set."

  echo ""
  section "Optional: Ngrok (required for Teams public tunnel)"
  ask "Enable ngrok tunnel? [y/N]: "
  read -r NGROK_INPUT
  NGROK=$(echo "${NGROK_INPUT:-N}" | tr '[:lower:]' '[:upper:]')
  if [[ "$NGROK" == "Y" ]]; then
    ask "Ngrok authtoken (from dashboard.ngrok.com): "
    read -r NGROK_AUTHTOKEN
    ask "Ngrok static URL (e.g. https://xxxx.ngrok-free.app): "
    read -r NGROK_URL
    ok "Ngrok credentials set."
  fi
fi

# =============================================================================
# 6 — Write .env
# =============================================================================
section "Writing .env"

cat > "$SCRIPT_DIR/.env" << EOF
# Generated by setup.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── LLM API Keys ──────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
OPENAI_API_KEY=${OPENAI_KEY}

# ── Web Search ────────────────────────────────────────────────────────────────
TAVILY_API_KEY=${TAVILY_KEY}

# ── Gateway ───────────────────────────────────────────────────────────────────
GATEWAY_TOKEN=${GATEWAY_TOKEN}

# ── Ports ─────────────────────────────────────────────────────────────────────
OPENCLAW_GATEWAY_HOST_PORT=18789
OPENCLAW_TEAMS_PORT=3978
OPENCLAW_WATCHER_PORT=18791

# ── UID/GID (run containers as your user) ─────────────────────────────────────
OPENCLAW_UID=$(id -u)
OPENCLAW_GID=$(id -g)

# ── Teams ─────────────────────────────────────────────────────────────────────
TEAMS_APP_ID=${TEAMS_APP_ID}
TEAMS_APP_PASSWORD=${TEAMS_APP_PASSWORD}
TEAMS_TENANT_ID=${TEAMS_TENANT_ID}

# ── Ngrok ─────────────────────────────────────────────────────────────────────
NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
NGROK_URL=${NGROK_URL}
EOF

chmod 600 "$SCRIPT_DIR/.env"
ok ".env written."

# =============================================================================
# 7 — Write openclaw.json
# =============================================================================
section "Writing openclaw.json"

AGENT_NAME_LOWER=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

cat > "$SCRIPT_DIR/openclaw.json" << EOF
{
  "meta": {
    "lastTouchedVersion": "2026.4.21",
    "agentName": "${AGENT_NAME}"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6"
      },
      "models": {
        "anthropic/claude-sonnet-4-6": {
          "params": { "cacheRetention": "short" }
        }
      },
      "workspace": "/home/node/.openclaw/workspace",
      "bootstrapMaxChars": 100000,
      "bootstrapTotalMaxChars": 400000,
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "45m",
        "keepLastAssistants": 6,
        "softTrimRatio": 0.35,
        "hardClearRatio": 0.6,
        "minPrunableToolChars": 800
      },
      "compaction": {
        "mode": "safeguard",
        "reserveTokens": 18000,
        "keepRecentTokens": 22000,
        "reserveTokensFloor": 8000,
        "maxHistoryShare": 0.55,
        "recentTurnsPreserve": 5,
        "postIndexSync": "async"
      },
      "heartbeat": { "every": "20m" },
      "sandbox": { "browser": { "enabled": true } }
    }
  },
  "tools": {
    "profile": "full",
    "exec": {
      "security": "full",
      "pathPrepend": ["/home/node/.openclaw/workspace/bin"]
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "channels": {
    "msteams": {
      "enabled": false,
      "appId": "${TEAMS_APP_ID}",
      "appPassword": "${TEAMS_APP_PASSWORD}",
      "tenantId": "${TEAMS_TENANT_ID}",
      "webhook": { "port": 3978, "path": "/api/messages" },
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "groupPolicy": "open"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "localhost",
    "controlUi": {
      "allowedOrigins": ["http://localhost:18789", "http://127.0.0.1:18789"],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token",
      "token": "${GATEWAY_TOKEN}"
    }
  },
  "plugins": {
    "allow": ["msteams", "anthropic"],
    "entries": {
      "msteams": { "enabled": false },
      "anthropic": { "enabled": true }
    }
  }
}
EOF

chmod 600 "$SCRIPT_DIR/openclaw.json"
ok "openclaw.json written."

# =============================================================================
# 8 — Patch IDENTITY.md with agent name
# =============================================================================
section "Patching workspace/IDENTITY.md"

IDENTITY_FILE="$SCRIPT_DIR/workspace/IDENTITY.md"
if [[ -f "$IDENTITY_FILE" ]]; then
  python3 - "$IDENTITY_FILE" "$AGENT_NAME" "$AGENT_ROLE" "$AGENT_VIBE" "$AGENT_EMOJI" "$AGENT_DESCRIPTION" <<'PYEOF'
import sys, re
path, name, role, vibe, emoji, desc = sys.argv[1:7]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Replace bare placeholders first
text = text.replace("YOUR_AGENT_NAME", name)
text = text.replace("YOUR_SHORT_DESCRIPTION", desc)

# Replace `PLACEHOLDER (e.g. "...")` patterns — drop the example
text = re.sub(r'YOUR_AGENT_ROLE\s*\(e\.g\.\s*"[^"]*"(?:,\s*"[^"]*")*\)', role, text)
text = re.sub(r'YOUR_AGENT_VIBE\s*\(e\.g\.\s*"[^"]*"\)', vibe, text)
text = re.sub(r'YOUR_EMOJI\s*\(e\.g\.\s*[^)]*\)', emoji, text)

# Fallback for any leftover bare tokens
text = text.replace("YOUR_AGENT_ROLE", role)
text = text.replace("YOUR_AGENT_VIBE", vibe)
text = text.replace("YOUR_EMOJI", emoji)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PYEOF
  ok "IDENTITY.md patched with name, role, vibe, emoji, description."
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup complete!                             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Agent      : $AGENT_NAME"
echo "  Gateway UI : http://localhost:18789"
echo ""
echo "  To start:"
if [[ "$TEAMS" == "Y" && -n "$NGROK_AUTHTOKEN" ]]; then
  echo "    docker compose -f docker-compose.yml -f docker-compose.teams.yml up -d"
else
  echo "    docker compose up -d"
fi
echo ""
echo "  To view logs:"
echo "    docker compose logs -f openclaw-gateway"
echo ""
echo "  To stop:"
echo "    docker compose down"
echo ""

ask "Start the stack now? [Y/n]: "
read -r START_INPUT
START=$(echo "${START_INPUT:-Y}" | tr '[:lower:]' '[:upper:]')

if [[ "$START" == "Y" ]]; then
  echo ""
  info "Starting OpenClaw..."
  if [[ "$TEAMS" == "Y" && -n "$NGROK_AUTHTOKEN" ]]; then
    docker compose -f docker-compose.yml -f docker-compose.teams.yml up -d
  else
    docker compose up -d
  fi
  echo ""
  ok "Stack is up. Opening gateway at http://localhost:18789"
fi
