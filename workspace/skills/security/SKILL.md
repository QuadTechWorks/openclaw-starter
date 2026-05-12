---
name: security
description: >
  Cross-vertical security setup. Security design doc, SAST/DAST configs, RBAC design,
  secrets management, OWASP checklist. DE (PII+data access), DS (model+API security), SDLC (full app).
  Triggers: "security setup", "RBAC design", "secrets management", "vulnerability scan",
  "OWASP", "SAST", "DAST", "Bandit", "Semgrep", "security design", "auth setup", "PII handling"
---

# Security Skill

## What it generates (ALL shown to user before any push)

| Output | Description |
|---|---|
| `security-design.html` | Full security design document |
| `security-checklist.html` | OWASP Top 10 (2023) checklist with status |
| `security-scan-report.html` | SAST findings with severity + fix guidance |
| `.bandit` | Bandit config for Python SAST |
| `.semgrep.yml` | Semgrep custom rules |
| `rbac-design.html` | RBAC matrix (roles × permissions) |
| `.gitignore` | Comprehensive (secrets, env files, credentials, keys) |
| `secrets-management.md` | How secrets are handled in this project |
| `.github/workflows/security.yml` | Security scan CI job (every PR) |

## Execution Flow

1. **Threat modelling (STRIDE)** from planning bundle (BRD, NFR, architecture):
   - Spoofing / Tampering / Repudiation / Information Disclosure / DoS / Elevation of Privilege
2. **Generate security-design.html** — auth strategy, RBAC, PII handling, encryption, secrets
3. **Generate RBAC design** from stakeholder roles in planning bundle
4. **Generate scan configs + run Bandit+Semgrep** → security-scan-report.html
5. **Generate security CI job** — runs on every PR: bandit + semgrep + pip-audit/npm audit
6. **Show all → approve → push**

## Per-Vertical Security

### Data Engineering
- PII column detection and SHA256 masking
- Data access RBAC (Bronze/Silver/Gold layer access)
- Secrets: DB credentials, API keys, service accounts
- Audit logging of all data access

### Data Science
- Model artefact access control
- Training data access restrictions
- API key management for model serving
- PII in training data: detect and mask

### SDLC
- Full OWASP Top 10 coverage
- JWT/OAuth2 authentication
- Input validation + sanitisation on all endpoints
- Dependency vulnerability scanning (pip-audit + npm audit)
- Security headers (CSP, HSTS, X-Frame-Options)

## Knowledge File
`knowledge/engineering-standards/security-standards.md`
