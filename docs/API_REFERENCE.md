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
