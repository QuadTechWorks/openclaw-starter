# TOOLS.md — Tool Configuration Notes
# Document your tool-specific setup, quirks, and preferences here.
# This file is loaded at startup — keep it focused on things the agent needs to know.

---

## Shell & Execution

- Python is available as `python3` inside the container.
- Installed packages are in `/home/node/.local` (persisted across restarts via bind mount).
- The workspace root is `/home/node/.openclaw/workspace` inside the container.

---

## File Paths (inside container)

| Location | Path |
|---|---|
| Workspace root | `/home/node/.openclaw/workspace` |
| Skills | `/home/node/.openclaw/workspace/skills/` |
| Knowledge | `/home/node/.openclaw/workspace/knowledge/` |
| Output | `/home/node/.openclaw/workspace/output/` |
| Reports | `/home/node/.openclaw/workspace/reports/` |
| Python packages | `/home/node/.local` |

---

## Adding Custom Tools

To add a CLI tool or Python package:
1. Add the pip package to `requirements.txt` in the repo root — it installs on next startup.
2. For system packages, extend the gateway image with a custom Dockerfile.

---

## Notes

<!-- Add your own tool notes here. Examples:
- "Always use the requests library for HTTP calls, not curl"
- "Database connection string is in knowledge/db-connections.md"
-->
