# OPENAPI SCHEMA GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Developer Integration  

---

## 1. OPENAPI SPECIFICATION

The platform exposes fully compliant OpenAPI 3.0 specs to allow automatic SDK building.

---

## 2. GENERATION WORKFLOW

1.  **Annotate Endpoints**: Code endpoints using express with standard JSDoc comments.
2.  **Compile Schemas**: Run the workspace OpenAPI compiler:
    ```bash
    pnpm --filter @windels/api compile-swagger
    ```
3.  **Host Swagger Interface**: View specs at `https://api.windels.ai/docs`.

---

## 3. SWAGGER PLAYGROUND

The embedded Swagger playground requires:
*   Standard JWT Bearer token authentication header (`Authorization: Bearer <token>`).
*   Active Organization Scope ID parameter (`X-Organization-Id: <uuid>`).
