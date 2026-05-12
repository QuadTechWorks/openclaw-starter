# AGENTS.md — Workspace & Routing Rules
# Loaded at every session start.
# Use this file to define routing logic, skill triggers, and persistent rules.

---

## Workspace

This is your agent's home directory. Key locations:

- `skills/`      → Skill plugins. Each skill has a SKILL.md that defines triggers and behaviour.
- `knowledge/`   → Drop your reference documents here (.md files).
- `memory/`      → Per-user and session memory (auto-managed).
- `projects/`    → Self-contained project directories.
- `reports/`     → Generated reports and output files.
- `output/`      → Generated files (code, data, etc.).

---

## Skill Routing

Skills are auto-discovered from `skills/*/SKILL.md`. The agent reads each
SKILL.md at startup and routes tasks to the correct skill based on the triggers
defined in that file.

Currently installed skills:
- `cicd`                  → CI/CD pipeline setup (GitHub Actions, GitLab CI, Docker)
- `code-quality`          → Linting, static analysis, pre-commit hooks
- `documentation`         → README, setup guides, API docs, changelogs
- `engineering-standards` → Orchestrator for code quality, testing, CI/CD, security, observability
- `observability`         → Prometheus, Grafana, structured logging, alerting
- `security`              → SAST/DAST, RBAC, secrets management, OWASP
- `testing`               → Unit, integration, E2E tests, TDD, coverage
- `tavily-search`         → Real-time web search and URL content extraction

---

## Custom Routing Rules

Add your own routing rules here. Examples:

<!-- 
## My Custom Rule
When the user asks about [topic], always read [knowledge/topic.md] first.
-->
