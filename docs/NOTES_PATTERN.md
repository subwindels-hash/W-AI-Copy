# Notes Pattern — Shared Implementation Guide

**Version:** 1.0  
**Status:** ACTIVE — Use this pattern for all new modules  
**Last Updated:** 2026-08-07  

---

## Problem

Before this pattern, 80+ modules each implemented identical notes CRUD:
```typescript
// EVERY module had this...
router.get("/notes", async (req, res) => { ... });
router.post("/notes", async (req, res) => { ... });
router.patch("/notes/:id", async (req, res) => { ... });
router.delete("/notes/:id", async (req, res) => { ... });
```

This violated the DRY principle and made maintenance painful.

## Solution

Use the shared `@windels/shared/notes` module.

---

## Quick Start

### Option A: Simple Modules (No Database)

For modules that don't have their own database tables, store notes in Redis:

```typescript
import { createNotesService } from "@windels/shared/notes";
import { redisCmd as redis } from "../db/redis.js";

const NOTES_KEY = `notes:${moduleName}:`;

const notesService = createNotesService(moduleName, {
  create: async (data) => {
    const id = cuid();
    await redis.hset(`${NOTES_KEY}${id}`, "_doc", JSON.stringify({
      id, ...data, module: moduleName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }));
    return { id, ...data, module: moduleName } as any;
  },
  findMany: async (orgId) => {
    const keys = await redis.keys(`${NOTES_KEY}*`);
    const notes = await Promise.all(keys.map(k => redis.hgetall(k)));
    return notes.filter(n => n._doc).map(n => JSON.parse(n._doc) as any);
  },
  findUnique: async (id, orgId) => {
    const data = await redis.hgetall(`${NOTES_KEY}${id}`);
    return data._doc ? JSON.parse(data._doc) : null;
  },
  update: async (id, orgId, data) => {
    const existing = await redis.hgetall(`${NOTES_KEY}${id}`);
    const updated = { ...JSON.parse(existing._doc), ...data, updatedAt: new Date().toISOString() };
    await redis.hset(`${NOTES_KEY}${id}`, "_doc", JSON.stringify(updated));
    return updated as any;
  },
  delete: async (id, orgId) => {
    await redis.del(`${NOTES_KEY}${id}`);
  },
});
```

### Option B: Database-Backed Modules

For modules with Prisma schemas, add a notes table:

```prisma
// In your module's Prisma schema
model ModuleNotes {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  module         String   @default("yourModuleName")
  title          String?
  body           String?
  metadata       Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, module])
}
```

Then use the service:

```typescript
import { createNotesService } from "@windels/shared/notes";
import { prisma } from "../db/client.js";

const notesService = createNotesService("yourModuleName", {
  create: (data) => prisma.moduleNotes.create({
    data: { ...data, module: "yourModuleName" }
  }),
  findMany: (orgId) => prisma.moduleNotes.findMany({
    where: { organizationId: orgId, module: "yourModuleName" }
  }),
  findUnique: (id, orgId) => prisma.moduleNotes.findFirst({
    where: { id, organizationId: orgId, module: "yourModuleName" }
  }),
  update: (id, orgId, data) => prisma.moduleNotes.update({
    where: { id, organizationId: orgId, module: "yourModuleName" },
    data,
  }),
  delete: (id, orgId) => prisma.moduleNotes.delete({
    where: { id, organizationId: orgId, module: "yourModuleName" }
  }),
});
```

### Register Routes

```typescript
// In your module's routes file
import { registerNotesRoutes } from "@windels/shared/notes";

// After creating your service:
registerNotesRoutes(router, notesService, "yourModuleName");
```

That's it! This gives you:
- `GET /yourModule/notes` — List notes
- `GET /yourModule/notes/:id` — Get single note
- `POST /yourModule/notes` — Create note
- `PATCH /yourModule/notes/:id` — Update note
- `DELETE /yourModule/notes/:id` — Delete note

---

## Migration Guide

For existing modules with duplicate notes code:

### 1. Add the notes table to your Prisma schema (if using DB)

```bash
cd apps/api
npx prisma migrate dev --name add_module_notes
```

### 2. Create the notes service

```typescript
// In apps/api/src/<yourModule>/notes.service.ts
import { createNotesService } from "@windels/shared/notes";
import { prisma } from "../db/client.js";

export const notesService = createNotesService("<yourModuleName>", {
  create: (data) => prisma.<yourModule>Notes.create({
    data: { ...data, module: "<yourModuleName>" }
  }),
  findMany: (orgId) => prisma.<yourModule>Notes.findMany({
    where: { organizationId: orgId, module: "<yourModuleName>" }
  }),
  findUnique: (id, orgId) => prisma.<yourModule>Notes.findFirst({
    where: { id, organizationId: orgId, module: "<yourModuleName>" }
  }),
  update: (id, orgId, data) => prisma.<yourModule>Notes.update({
    where: { id, organizationId: orgId, module: "<yourModuleName>" },
    data,
  }),
  delete: (id, orgId) => prisma.<yourModule>Notes.delete({
    where: { id, organizationId: orgId, module: "<yourModuleName>" }
  }),
});
```

### 3. Replace route handlers

**Before:**
```typescript
router.get("/notes", async (req, res) => {
  const notes = await prisma.<yourModule>Notes.findMany({ ... });
  res.json({ ok: true, data: notes });
});

router.post("/notes", async (req, res) => {
  const note = await prisma.<yourModule>Notes.create({ ... });
  res.json({ ok: true, data: note });
});
// ... etc
```

**After:**
```typescript
import { registerNotesRoutes } from "@windels/shared/notes";
import { notesService } from "./notes.service.js";

// Replace all individual note routes with:
registerNotesRoutes(router, notesService, "<yourModuleName>");
```

---

## Benefits

1. **Consistency** — All modules have the same notes API
2. **Maintenance** — Fix a bug once, all modules benefit
3. **Type Safety** — Shared TypeScript types
4. **Validation** — Shared Zod schemas for request validation
5. **Documentation** — Single source of truth for notes pattern

---

## Future Enhancements

- [ ] Add search functionality to notes service
- [ ] Add pagination to list endpoint
- [ ] Add soft delete option
- [ ] Add notes archiving
- [ ] Add notes tagging/categorization

---

## Related

- [MODULE_ARCHITECTURE.md](../docs/MODULE_ARCHITECTURE.md) — Module boundaries
- [MODULE_DEPENDENCY_MAP.md](../docs/MODULE_DEPENDENCY_MAP.md) — Module dependencies
