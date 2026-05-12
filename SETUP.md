# SETUP.md — Full Setup Guide

> **Target:** macOS or Ubuntu 22.04/24.04. Docker Desktop (Mac/Windows) or Docker Engine (Linux).

---

## Phase 0 — Gather Credentials First

Collect these before starting. You will paste them into `setup.sh`.

| Credential | Required | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create. Starts with `sk-ant-api03-` |
| `OPENAI_API_KEY` | Optional | [platform.openai.com](https://platform.openai.com) → API Keys. Starts with `sk-proj-` |
| `TAVILY_API_KEY` | Optional | [app.tavily.com](https://app.tavily.com) → API Keys. Enables web search skill. |
| `TEAMS_APP_ID` | Teams only | Azure Portal → Azure Bot → Configuration → Microsoft App ID |
| `TEAMS_APP_PASSWORD` | Teams only | Azure Portal → Azure Bot → Configuration → Manage → Client Secrets → New |
| `TEAMS_TENANT_ID` | Teams only | Azure AD → Overview → Tenant ID. Use `common` for multi-tenant. |
| `NGROK_AUTHTOKEN` | Teams only | [dashboard.ngrok.com](https://dashboard.ngrok.com) → Your Authtoken |
| `NGROK_URL` | Teams only | [dashboard.ngrok.com](https://dashboard.ngrok.com) → Domains → Create static domain |

> **Anthropic rate limits:** A new account (Tier 1) gives 30k tokens/min which can cause restarts.
> Fix: add a payment method at [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)
> and spend $5 to reach Tier 2 (400k tokens/min).

---

## Phase 1 — Install Docker

### macOS
Download and install [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/).
Start Docker Desktop. Wait for the whale icon in the menu bar to stop animating.

### Ubuntu 22.04 / 24.04

```bash
# Remove old versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker official apt repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker and add your user
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker --version          # Docker version 26.x.x or newer
docker compose version    # Docker Compose version v2.x.x
```

---

## Phase 2 — Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/openclaw-template.git
cd openclaw-template
```

---

## Phase 3 — Run Setup Wizard

```bash
chmod +x setup.sh
./setup.sh
```

The wizard will:
1. Ask for your agent's name
2. Ask for your Anthropic API key (required)
3. Ask for OpenAI, Tavily keys (optional)
4. Auto-generate a secure gateway token
5. Optionally configure Teams + ngrok
6. Write `.env` and `openclaw.json`
7. Optionally start the stack

---

## Phase 4 — Manual Setup (alternative to wizard)

If you prefer to configure manually:

```bash
# Copy the example files
cp .env.example .env
cp openclaw.json.example openclaw.json
```

Edit `.env`:
- Replace `ANTHROPIC_API_KEY` with your key
- Replace `GATEWAY_TOKEN` with output of: `openssl rand -hex 32`
- Fill optional fields as needed

Edit `openclaw.json`:
- Replace `REPLACE_WITH_GATEWAY_TOKEN` with the same token you put in `.env`
- Replace `YOUR_AGENT_NAME` with your agent's name
- Teams fields can be left as-is if not using Teams

---

## Phase 5 — Start

```bash
# Default (no Teams)
docker compose up -d

# With Teams + ngrok
docker compose -f docker-compose.yml -f docker-compose.teams.yml up -d
```

On first start the gateway container installs Python packages from `requirements.txt`.
This takes 2–5 minutes. Watch progress with:

```bash
docker compose logs -f openclaw-gateway
```

When you see `[entrypoint] Python dependencies installed.` and the healthcheck passes, open:

**http://localhost:18789**

Enter your `GATEWAY_TOKEN` when prompted.

---

## Phase 6 — Personalise Your Agent

### Step 1 — Edit IDENTITY.md

Open `workspace/IDENTITY.md` in your editor. Replace the `YOUR_AGENT_NAME` placeholders with your agent's name, role, and personality.

The watcher detects the save and reloads the agent **without a restart**.

### Step 2 — Edit SOUL.md

Open `workspace/SOUL.md`. Add any mandatory rules you want applied to every session — tone preferences, file delivery rules, formatting standards.

### Step 3 — Add Knowledge

Drop `.md` files into `workspace/knowledge/`. Examples:
- `about-me.md` — your background and preferences
- `coding-standards.md` — your team's conventions
- `project-context.md` — current project goals and architecture

---

## Phase 7 — (Optional) Connect to Teams

1. **Create an Azure Bot:**
   - Azure Portal → Create Resource → Azure Bot
   - Messaging endpoint: `https://YOUR_NGROK_URL/api/messages`
   - Note the App ID

2. **Create a client secret:**
   - Azure Portal → App Registrations → your app → Certificates & secrets → New client secret
   - Copy the **Value** (not the ID)

3. **Get Tenant ID:**
   - Azure AD → Overview → Tenant ID

4. **Update openclaw.json:**
   Set `channels.msteams.enabled` to `true` and fill in `appId`, `appPassword`, `tenantId`.

5. **Start with Teams overlay:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.teams.yml up -d
   ```

6. **Install the Teams app:**
   - Zip the contents of `workspace/skills/` (if you have a Teams app manifest) or use Developer Portal
   - Upload as a custom app in Teams

---

## Troubleshooting

### Gateway not starting
```bash
docker compose logs openclaw-gateway
```
Common causes:
- `openclaw.json` or `.env` missing → run `./setup.sh`
- Port 18789 already in use → change `OPENCLAW_GATEWAY_HOST_PORT` in `.env`
- Anthropic API key invalid → check [console.anthropic.com](https://console.anthropic.com)

### Watcher-client keeps restarting
```bash
docker compose logs openclaw-watcher-client
```
This is usually harmless during startup while it waits for `workspace/system/watcher_client.py` to be reachable. It self-heals once the gateway is healthy.

### Python packages not installing
```bash
docker compose logs openclaw-gateway | grep entrypoint
```
If pip fails, try removing the hash cache:
```bash
rm -rf workspace/.python-packages
docker compose restart openclaw-gateway
```

### Slow first startup
Normal — the gateway downloads the container image and installs Python packages on first run. Subsequent starts are fast.

---

## Updating

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d
```

To update Python packages, edit `requirements.txt` then:
```bash
docker compose restart openclaw-gateway
```
