---
name: cicd
description: >
  Platform-agnostic CI/CD skill. Any platform: GitHub Actions, GitLab CI, Jenkins,
  Azure DevOps, CircleCI, Bitbucket. Full pipeline config + deployment runbook + Docker.
  DE (validate+refresh), DS (train+evaluate+serve), SDLC (full app CI/CD).
  Triggers: "set up CI/CD", "configure pipeline", "GitHub Actions", "GitLab CI",
  "Jenkins", "deployment pipeline", "Docker setup", "deployment runbook", "release pipeline"
---

# CI/CD Skill

## What it generates (ALL shown to user before any push)

| Output | Description |
|---|---|
| CI/CD YAML | Platform-specific (GitHub Actions / GitLab / Jenkins / Azure / CircleCI) |
| `Dockerfile` | Multi-stage Docker build |
| `docker-compose.yml` | Local dev + staging compose |
| `.env.example` | All environment variables documented |
| `deployment-runbook.html` | Step-by-step deployment guide — clean HTML |
| `environment-configs/` | Per-environment config files (dev/qa/staging/prod) |

## Execution Flow

1. **Ask user**: "Which CI/CD platform?" → GitHub Actions (default) / GitLab CI / Jenkins / Azure DevOps / CircleCI / Bitbucket / Other
2. **Detect vertical + stack** from planning bundle
3. **Generate pipeline config** with stages: build → lint → test → SAST → build-artifact → deploy-staging → smoke-test → deploy-prod
4. **Generate deployment-runbook.html** — pre-deployment checklist, numbered deployment steps, rollback procedure, post-deployment verification
5. **Show all to user → approve → push**

## Pipeline Stages Per Vertical

### Data Engineering
- lint → test (data validation + pipeline) → validate (DQ checks) → refresh-data (scheduled)

### Data Science
- lint → test (model + leakage) → evaluate (metrics vs baseline) → serve (if API deployment)

### SDLC
- lint → test → sast (bandit+semgrep+npm audit) → build (Docker) → deploy-staging → smoke-test → deploy-prod (manual approval gate)

## Deployment Strategies
- **Blue/Green**: maintain two identical environments, switch traffic
- **Canary**: gradually shift % of traffic to new version
- **Rolling**: replace instances one by one
- **Recreate**: stop all, deploy new (for dev/non-prod only)

## Knowledge File
`knowledge/engineering-standards/cicd-standards.md`
