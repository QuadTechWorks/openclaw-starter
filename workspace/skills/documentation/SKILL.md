---
name: documentation
description: >
  Full project documentation package. README, setup guides, user guide, maintenance guide,
  FAQ, API reference, central index HTML, CHANGELOG. All planning docs already in docs/planning/.
  ALL verticals (DE, DS, SDLC, BD).
  Triggers: "generate documentation", "create README", "write docs", "handover package",
  "setup guide", "user guide", "API docs", "maintenance guide", "CHANGELOG", "final docs"
---

# Documentation Skill

## What it generates (complete handover package — ALL at once, then ask for approval)

| Output | Description |
|---|---|
| `README.md` | Badges + overview + quick start + usage + contributing + license |
| `CHANGELOG.md` | Project history (Keep a Changelog format) |
| `docs/setup-guide.md` | 1-2 command full setup walkthrough |
| `docs/user-guide.md` | End user guide |
| `docs/maintenance-guide.md` | Ops tasks, backup, upgrade notes |
| `docs/faq.md` | Common questions and answers |
| `docs/api-reference.md` | OpenAPI-style API documentation |
| `docs/architecture.md` | Links to all architecture diagrams + descriptions |
| `docs/index.html` | **Central HTML page linking ALL docs** — user opens this one file |
| `docs/planning/` | All planning docs already here from planning bundle |

## Execution Flow

1. **Load full project context** — planning bundle, git log (for CHANGELOG), API endpoints, diagrams
2. **Generate ALL documents in one pass** — never pause between docs
3. **Deliver docs/index.html** — central page linking everything
4. **User approves → only new files need committing** (docs/planning/ already pushed)

## README Structure (MANDATORY)
```markdown
# Project Name
[![CI](badge)] [![Coverage](badge)] [![Security](badge)]

## Overview
2-3 sentences.

## Quick Start
```bash
git clone <url>
./setup.sh
```

## Documentation
- [Setup Guide](docs/setup-guide.md)
- [User Guide](docs/user-guide.md)
- [API Reference](docs/api-reference.md)
- [Architecture](docs/architecture.md)
- [Maintenance](docs/maintenance-guide.md)
- [Full Docs Index](docs/index.html)
```

## docs/index.html
Central clean HTML HTML page with:
- Project overview card
- Links to every document (planning + delivery)
- Status of each doc (generated / approved / pending)
- Quick start commands
- Contact / team information

## Knowledge File
`knowledge/engineering-standards/documentation-standards.md`
