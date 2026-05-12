# WORKSPACE.md — Directory Structure & Rules
# Every file operation MUST follow this structure.

---

## Directory Map

```
workspace/
├── IDENTITY.md         → Agent persona, name, role, domains
├── SOUL.md             → Mandatory rules for all sessions
├── AGENTS.md           → Routing rules and workspace overview
├── TOOLS.md            → Tool config and path notes
├── PERMISSIONS.md      → Access control rules
├── BOOTSTRAP.md        → First-run onboarding flow
├── MEMORY.md           → Persistent memory index (auto-managed)
├── USER.md             → User profile (auto-managed)
├── HEARTBEAT.md        → Liveness signal (auto-managed)
│
├── system/
│   └── watcher_client.py   → Watcher infrastructure (do not edit)
│
├── skills/             → Skill plugins (each has a SKILL.md)
│   ├── cicd/
│   ├── code-quality/
│   ├── documentation/
│   ├── engineering-standards/
│   ├── observability/
│   ├── security/
│   ├── testing/
│   └── tavily-search/
│
├── knowledge/          → Your reference documents (.md files)
│   └── README.md
│
├── memory/             → Session and user memory files (auto-managed, gitignored)
├── projects/           → Self-contained project directories (gitignored)
├── reports/            → Generated HTML/PDF reports (gitignored)
├── output/             → Generated files — code, data, etc. (gitignored)
└── logs/               → Execution logs (gitignored)
```

---

## Rules

1. **Always write output to the correct directory** — reports → `reports/`, code → `projects/<name>/` or `output/`
2. **Never write to `system/`** — infrastructure files only
3. **Knowledge files** go in `knowledge/` as `.md` files — the agent reads them at startup
4. **Memory is auto-managed** — never manually edit files in `memory/`
