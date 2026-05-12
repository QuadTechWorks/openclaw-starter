---
name: testing
description: >
  Cross-vertical testing skill. TDD mode, test suite generation, mock/stub/fixtures,
  CI test configuration. DE (pipeline+data validation), DS (model tests), SDLC (unit/integration/E2E).
  Triggers: "set up tests", "write tests", "TDD", "unit test", "integration test",
  "E2E test", "test strategy", "mock generation", "test coverage", "pytest setup"
---

# Testing Skill

## TDD Mode (MANDATORY when writing new functions)
When any function signature is written → generate unit test skeleton BEFORE implementation.
Red (failing test) → Green (passing) → Refactor cycle.

## What it generates

| Output | Description |
|---|---|
| `tests/unit/` | Unit test files — one per module |
| `tests/integration/` | Integration test files |
| `tests/e2e/` | End-to-end tests (SDLC) |
| `tests/security/` | OWASP Top 10 security tests |
| `tests/performance/` | Performance test configs |
| `tests/fixtures/` | Mock objects + test data fixtures |
| `tests/conftest.py` | Shared pytest fixtures |
| `.coveragerc` | Coverage config (min 80%, 100% critical paths) |
| `jest.config.js` | Jest config (if JS/TS) |
| `test-strategy.html` | Full test strategy document |
| `.github/workflows/tests.yml` | CI test job |

## Execution Flow

1. **Generate mocks/stubs/fixtures FIRST** — identify all external dependencies, create test doubles
2. **Generate test files** per vertical type (see below)
3. **Generate test-strategy.html** — scope, types, coverage targets, tools, schedule
4. **Generate CI test YAML** — show to user → approve → push

## Per-Vertical Test Types

### Data Engineering
- Schema validation, null checks, type checks, range checks
- Per-transformation-step isolation tests
- Bronze→Silver→Gold integration tests
- Failure injection (source down, empty, corrupt)
- Row count reconciliation tests

### Data Science
- Data leakage assertion (target not in features)
- Model metrics ≥ baseline thresholds
- Robustness: nulls, outliers, distribution shift
- Reproducibility: same seed → same results
- Train/val/test overlap assertion

### SDLC
- Unit: every public function, Given/When/Then structure
- Integration: API endpoint → service → database
- Functional: complete user flows from BRD use cases
- Security: OWASP Top 10 test cases
- Performance: p95 latency ≤ NFR target
- UAT: mapped to BRD acceptance criteria

## Knowledge File
`knowledge/engineering-standards/testing-standards.md`
