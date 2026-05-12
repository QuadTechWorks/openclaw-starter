---
name: observability
description: >
  Full observability stack setup. 1-command setup script, Prometheus+Grafana+AlertManager,
  structured logging, alert runbooks. DE (pipeline health), DS (model drift), SDLC (4 golden signals).
  Triggers: "set up monitoring", "configure alerting", "observability setup",
  "Prometheus", "Grafana", "logging setup", "SLO setup", "dashboards", "alerting"
---

# Observability Skill

## What it generates

| Output | Description |
|---|---|
| `observability/prometheus.yml` | Prometheus scrape config |
| `observability/alerts.yml` | Alert rules (AlertManager) |
| `observability/grafana-dashboard.json` | Pre-built Grafana dashboard |
| `observability/docker-compose.observability.yml` | Full monitoring stack |
| `setup-observability.sh` | **1-command setup** — runs after git clone |
| `observability-design.html` | Design doc with architecture diagram + rationale |
| `observability/runbooks/` | One runbook per alert condition |
| `observability/logging-config.py` | Structured JSON logging setup |

## 1-Command Setup
```bash
./setup-observability.sh
# → installs deps → starts Prometheus+Grafana+AlertManager → imports dashboards → prints URLs
```

## 4 Golden Signals (always configured)
1. **Latency** — request duration (p50/p95/p99)
2. **Traffic** — requests per second
3. **Errors** — error rate (4xx/5xx)
4. **Saturation** — CPU/memory/queue depth

## Per-Vertical Dashboards

### Data Engineering
- Pipeline success rate (24h + 7d trend)
- Data freshness per source
- DQ score trend
- Bronze/Silver/Gold row counts
- Alerts: pipeline failed, DQ < threshold, data stale > N hours

### Data Science
- Prediction latency (p50/p95/p99)
- Model drift index (PSI / feature distribution shift)
- Prediction score distribution over time
- Alerts: drift > threshold, latency p99 > SLO

### SDLC
- Request rate + error rate + latency (4 golden signals)
- DORA metrics (deployment frequency, MTTR, change failure rate)
- SLO burn rate
- Alerts: error rate spike, p99 > SLO, SLO burn critical

## Knowledge File
`knowledge/engineering-standards/observability-standards.md`
