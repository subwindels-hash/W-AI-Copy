# MULTI-TENANCY IMPLEMENTATION GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Architecture Standard  

---

## 1. LOGICAL TENANCY DESIGN

WINDELS AI OS uses a shared-database, logically-isolated multi-tenant design:

```
  [API Express Middleware] ──► Parse X-Organization-Id Header
                                       │
                                       ▼
  [Prisma DB Query Layer]  ──► Append organizationId to ALL WHERE clauses
```

---

## 2. MIDDLEWARE GATEWAY

Every request (excluding public authentication paths) runs through the scoping middleware:
1.  **Extract Header**: Parses the `X-Organization-Id` header.
2.  **Verify Association**: Validates that the active authenticated user belongs to the requested organization.
3.  **Scoped Context**: Attaches the organization ID to the Express request context for down-stream query layers.

---

## 3. PRISMA QUERY INTERCEPTION

All database queries append explicit organization boundaries:
```typescript
const pipelines = await prisma.etlPipeline.findMany({
  where: {
    organizationId: req.orgId
  }
});
```
This guarantees zero cross-organization leakage even under parallel request streams.
