---
name: code-quality
description: >
  Cross-vertical code quality skill. Sets up linting, static analysis, SonarQube,
  pre-commit hooks, and CI quality gates for DE (Python+SQL), DS (Python+notebooks),
  SDLC (Python+JS/TS). Called by engineering-standards or directly by user.
  Triggers: "set up code quality", "run quality check", "linting setup", "code review",
  "sonarqube", "flake8", "pylint", "eslint", "static analysis", "pre-commit hooks"
---

# Code Quality Skill

## What it generates (ALL shown to user before any push)

| Output | Description |
|---|---|
| `sonar-project.properties` | SonarQube project config |
| `.flake8` | Python linter config (max-line=100, complexity=10) |
| `.pylintrc` | Pylint config |
| `pyproject.toml` | Black + isort config |
| `.eslintrc.json` | ESLint config (if JS/TS present) |
| `.prettierrc` | Prettier config (if JS/TS present) |
| `.pre-commit-config.yaml` | Pre-commit hooks — all linters run before every commit |
| `.github/workflows/code-quality.yml` | CI quality gate job (runs on every PR) |
| `code-quality-report.html` | clean HTML analysis report with findings + fix guidance |

## Execution Flow

1. **Detect languages** from planning bundle tools section + any existing code
2. **Generate all config files** per language (Python/JS/SQL/notebooks)
3. **Generate CI quality gate YAML** — stages: flake8 → pylint → black check → isort check → SonarQube
4. **Generate code-quality-report.html** — summary, rules applied, per-file findings, quality score 0-100
5. **Show ALL to user → user approves → push**

## Standards Applied
- Max line length: 100 (Python), 120 (JS/TS)
- Cyclomatic complexity: max 10 per function
- Max function length: 50 lines
- Required docstrings: all public functions/classes
- No bare `except:`, no unused imports, no shadowed variables

## Per-Vertical Rules

### Data Engineering
- Python: flake8 + pylint + black
- SQL: sqlfluff (ANSI dialect or BigQuery/Snowflake if specified)
- Airflow DAGs: DAG-specific pylint rules

### Data Science
- Python: flake8 + pylint + black + isort
- Notebooks: nbqa flake8 + nbqa black (lints inside .ipynb files)
- No hardcoded data/credentials in notebooks

### SDLC
- Python backend: flake8 + pylint + black
- JavaScript/TypeScript: ESLint + Prettier
- Full SonarQube scan: bugs + vulnerabilities + code smells + coverage

## Knowledge File
`knowledge/engineering-standards/code-quality-standards.md`
