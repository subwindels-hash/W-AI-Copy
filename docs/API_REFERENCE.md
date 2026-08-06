# API REFERENCE MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Developer Reference  

---

## 1. RESTFUL ENDPOINTS

WINDELS AI OS exposes a strict, JSON-based RESTful API under the `/api/v1` namespace.

---

## 2. CORE REST ROUTES

### 2.1 Authentication & Profile
*   `POST /api/v1/auth/login`: Email and password login.
*   `POST /api/v1/auth/mfa/verify`: TOTP validation.
*   `POST /api/v1/auth/refresh`: JWT token rotations.

### 2.2 ETL Pipelines
*   `GET /api/v1/etl/pipelines`: Retrieve pipelines.
*   `POST /api/v1/etl/pipelines`: Add a pipeline.
*   `POST /api/v1/etl/pipelines/:id/run`: Trigger immediate run.

### 2.3 Surveillance Cameras
*   `GET /api/v1/camera/feeds`: List feeds.
*   `POST /api/v1/camera/feeds`: Register camera.
*   `GET /api/v1/camera/feeds/:id/alerts`: Retrieve alarms.

### 2.4 Cognitive / World Model (Session 110)
*   `GET /api/v1/cognitive/dashboard/rollup`: Platform observability rollup + observations + world model.
*   `GET /api/v1/cognitive/world-model`: Deterministic world-model rollup (counts, coverage, blind spots).
*   `GET|POST /api/v1/cognitive/entities`, `GET|PATCH|DELETE /api/v1/cognitive/entities/:id`: Modelled entities (admin writes).
*   `GET|POST /api/v1/cognitive/observations`, `GET|DELETE /api/v1/cognitive/observations/:id`: Evidence-backed observations; `origin` is `human`, `integration` or `ai_assisted` and confidence is always self-reported.
*   `GET|POST /api/v1/cognitive/hypotheses`, `GET|DELETE /api/v1/cognitive/hypotheses/:id`: Hypotheses; created `open`.
*   `POST /api/v1/cognitive/hypotheses/:id/resolve`: Human resolution (`supported`/`refuted`/`inconclusive`) with a mandatory note.

### 2.5 Global Command Center (Session 111)
*   `GET /api/v1/command/dashboard/rollup`: Session 70 executive rollup + `directives` + the `operations` rollup.
*   `GET /api/v1/command/operations`: Deterministic operations rollup (incident counts, measured MTTR, regional posture, briefing/initiative/directive tallies).
*   `GET|POST /api/v1/command/incidents`, `GET|PATCH|DELETE /api/v1/command/incidents/:id`: Incident register (admin writes); incidents are always created `open`.
*   `POST /api/v1/command/incidents/:id/updates`: Append a human timeline note, optionally moving to `acknowledged`/`mitigating`.
*   `POST /api/v1/command/incidents/:id/acknowledge`: A named human takes ownership (`409` if already acknowledged).
*   `POST /api/v1/command/incidents/:id/resolve`: Human resolution with a mandatory note; this is the only writer of `resolvedAt`, so MTTR is measured.
*   `GET|POST /api/v1/command/regions`, `GET|PATCH|DELETE /api/v1/command/regions/:id`: Declared regional footprint; a region is `unreported` until an operator reports it.
*   `POST /api/v1/command/regions/:id/status`: Operator status report (`400` if `servicesUp` exceeds the declared `servicesTotal`).
*   `GET|POST /api/v1/command/briefings`, `GET|DELETE /api/v1/command/briefings/:id`: Executive briefings; `origin` is `human` or `ai_assisted` (advisory, counted separately).
*   `GET|POST /api/v1/command/initiatives`, `GET|PATCH|DELETE /api/v1/command/initiatives/:id`: Strategic initiatives; `progressPct` is always self-reported.
*   `GET|POST /api/v1/command/directives`, `GET /api/v1/command/directives/:id`, `PATCH /api/v1/command/directives/:id/status`: Session 70 directive log with issuer and transition author.

---

## 3. ERROR SCHEMA

All API validation errors return standard JSON responses:
```json
{
  "success": false,
  "error": "VALIDATION_FAILED",
  "message": "Required fields are missing",
  "details": []
}
```
