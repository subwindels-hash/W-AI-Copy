# OBSERVABILITY & MONITORING GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** DevOps Standard  

---

## 1. OBSERVABILITY TRADITIONS

Obtain real-time system metrics through three core vectors:

```
  [Node/Docker Daemon] ──► Prometheus Scraper ──► Grafana Dashboard
  [Express Logger]     ──► Promtail Daemon    ──► Loki Log Pool
```

---

## 2. METRIC TRACKING (PROMETHEUS & GRAFANA)

The Express API server exposes Prometheus-compatible metrics on the `/metrics` endpoint:
*   **Request Latency**: Histograms measuring response times.
*   **System Telemetry**: Track active event loop delays and RAM allocations.

---

## 3. LOG MANAGEMENT (LOKI & PROMTAIL)

All backend logs are written in structured JSON:
```json
{"level":"info","time":17900000,"msg":"ETL run started","pipelineId":"cuid_1"}
```
Promtail filters the files, automatically masking secret tags before pushing logs to Loki.
