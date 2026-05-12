---
name: engineering-standards
description: >
  Cross-vertical orchestrator for 6 engineering best practices: code quality, testing,
  CI/CD, observability, security, and documentation. Callable from DE, DS, SDLC at
  the relevant phase. Also auto-triggered by workflow-guidance at phase gates.
  TRIGGERS: "set up code quality", "run quality check", "set up tests", "write tests",
  "set up CI/CD", "configure pipeline", "set up monitoring", "configure alerting",
  "set up security scan", "generate documentation", "set up engineering standards"
  Routes to: code-quality, testing, cicd, observability, security, documentation.
  design-mocks is SEPARATE — not routed through here.
  NOT FOR: PD+SD diagrams, DE pipeline reports, DS model reports.
---

# Engineering Standards Skill

Cross-vertical orchestrator. Queries workflow.db + planning bundle + knowledge guides.

## Routing Table

| User intent | Sub-skill | Verticals |
|---|---|---|
| Code quality, linting, SonarQube, code review | `code-quality` | DE, DS, SDLC |
| Tests, TDD, unit/integration/E2E, test strategy | `testing` | DE, DS, SDLC |
| CI/CD, pipeline, deployment, Docker | `cicd` | DE, DS, SDLC |
| Monitoring, observability, alerting, dashboards | `observability` | DE, DS, SDLC |
| Security, RBAC, secrets, vulnerability scan | `security` | DE, DS, SDLC |
| README, docs, handover package, setup guide | `documentation` | ALL |

## Auto-trigger Phase Gates

| Gate | Capability |
|---|---|
| Before first git push | code-quality |
| Phase 1 start (technical verticals) | testing |
| Before deployment milestone | cicd + security |
| Deployment milestone start | observability |
| Project delivery / all phases complete | documentation |

## Execution Flow
1. `route_request(user_message, vertical)` → identify sub-skill
2. `load_planning_bundle_context(project)` + read `knowledge/engineering-standards/{capability}-standards.md`
3. `get_proper_way_tasks(vertical, capability)` from workflow.db
4. Execute sub-skill SKILL.md fully
5. Generate ALL outputs → deliver HTML → user approves → push to git

## Diagram Rule (2026-04-19 — Harshita Gupta — PERMANENT)
Every new diagram (EXCLUDES PD+SD skill outputs) MUST have BOTH:
1. `{name}.md` — written description/spec (anchor for all change requests)
2. `{name}.html` — rendered HTML visual
❌ NEVER one without the other.

## Knowledge Sources
- `knowledge/engineering-standards/` — 8 comprehensive standards guides
- `scripts/planning_bundle.load_planning_bundle_context(project)`
- `skills/engineering-standards/scripts/route_engineering_standard.py`
