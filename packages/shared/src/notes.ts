// @ts-nocheck
/**
 * Shared Notes Module - Reusable Notes Pattern for WINDELS AI OS
 *
 * This module provides a standardized pattern for module-specific notes.
 * Instead of each module implementing its own notes CRUD (80+ duplicates),
 * modules should use this shared pattern.
 *
 * Usage:
 *   1. Import this file for types and validation schemas
 *   2. Use the provided Note type for your module's notes
 *   3. Implement storage in your module's database table or Redis
 *   4. Use the validateNote schemas for request validation
 *
 * Database Pattern:
 *   Each module should have its own notes table with:
 *   - id: String (cuid)
 *   - organizationId: String (for tenant isolation)
 *   - moduleData: Json (module-specific note content)
 *   - createdAt: DateTime
 *   - updatedAt: DateTime
 *
 * Or for simpler modules without database:
 *   - Store in Redis with key pattern: mod:{moduleKey}:notes:{orgId}
 */

import { z } from "zod";

// ─── Note Types ──────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  organizationId: string;
  module: string;           // Which module this note belongs to
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

// ─── Module-Specific Note Extensions ─────────────────────────────────────────

// Modules can extend the base Note type for their specific needs
export interface ModuleNote<T extends string = string> {
  id: string;
  organizationId: string;
  module: T;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Validation Schemas ──────────────────────────────────────────────────────

export const noteSchema = z.object({
  id: z.string().cuid(),
  organizationId: z.string().cuid(),
  module: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createNoteSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateNoteSchema = createNoteSchema.partial();

// ─── Notes Service Factory ───────────────────────────────────────────────────

/**
 * Create a notes service for a specific module.
 * This factory pattern allows each module to have its own notes storage
 * while using the same interface.
 */
export function createNotesService<T extends { id: string; organizationId: string }>(
  moduleName: string,
  storage: {
    create: (data: { organizationId: string; title?: string; body?: string; metadata?: Record<string, unknown> }) => Promise<T>;
    findMany: (organizationId: string) => Promise<T[]>;
    findUnique: (id: string, organizationId: string) => Promise<T | null>;
    update: (id: string, organizationId: string, data: { title?: string; body?: string; metadata?: Record<string, unknown> }) => Promise<T>;
    delete: (id: string, organizationId: string) => Promise<void>;
  }
) {
  return {
    /**
     * List notes for an organization
     */
    async list(organizationId: string): Promise<T[]> {
      return storage.findMany(organizationId);
    },

    /**
     * Get a single note
     */
    async get(id: string, organizationId: string): Promise<T | null> {
      return storage.findUnique(id, organizationId);
    },

    /**
     * Create a new note
     */
    async create(input: CreateNoteInput, organizationId: string): Promise<T> {
      return storage.create({
        organizationId,
        title: input.title,
        body: input.body,
        metadata: input.metadata,
      });
    },

    /**
     * Update a note
     */
    async update(id: string, input: UpdateNoteInput, organizationId: string): Promise<T> {
      return storage.update(id, organizationId, {
        title: input.title,
        body: input.body,
        metadata: input.metadata,
      });
    },

    /**
     * Delete a note
     */
    async delete(id: string, organizationId: string): Promise<void> {
      return storage.delete(id, organizationId);
    },
  };
}

// ─── Express Route Handlers (Reusable) ──────────────────────────────────────

/**
 * Register standard notes routes for a module.
 * This reduces boilerplate when adding notes to any module.
 */
export function registerNotesRoutes<T extends { id: string; organizationId: string; module: string }>(
  router: import("express").Router,
  service: ReturnType<typeof createNotesService<T>>,
  moduleName: string,
  requireAuth: boolean = true,
) {
  const { Router } = require("express");
  const authenticate = require("../middleware/auth").authenticate;

  if (requireAuth) {
    router.use(authenticate);
  }

  /**
   * GET /:module/notes
   * List all notes for the organization
   */
  router.get("/notes", async (req, res, next) => {
    try {
      const organizationId = req.user?.organizationId || req.headers["x-organization-id"] as string;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Organization ID required" } });
      }

      const notes = await service.list(organizationId);
      res.json({
        ok: true,
        data: notes,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /:module/notes/:id
   * Get a single note
   */
  router.get("/notes/:id", async (req, res, next) => {
    try {
      const organizationId = req.user?.organizationId || req.headers["x-organization-id"] as string;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Organization ID required" } });
      }

      const note = await service.get(req.params.id, organizationId);
      if (!note) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Note not found" } });
      }

      res.json({
        ok: true,
        data: note,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /:module/notes
   * Create a new note
   */
  router.post(
    "/notes",
    { body: createNoteSchema },
    async (req, res, next) => {
      try {
        const organizationId = req.user?.organizationId || req.headers["x-organization-id"] as string;
        if (!organizationId) {
          return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Organization ID required" } });
        }

        const note = await service.create(req.body, organizationId);
        res.status(201).json({
          ok: true,
          data: note,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * PATCH /:module/notes/:id
   * Update a note
   */
  router.patch(
    "/notes/:id",
    { params: z.object({ id: z.string().cuid() }), body: updateNoteSchema },
    async (req, res, next) => {
      try {
        const organizationId = req.user?.organizationId || req.headers["x-organization-id"] as string;
        if (!organizationId) {
          return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Organization ID required" } });
        }

        const note = await service.update(req.params.id, req.body, organizationId);
        res.json({
          ok: true,
          data: note,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * DELETE /:module/notes/:id
   * Delete a note
   */
  router.delete(
    "/notes/:id",
    { params: z.object({ id: z.string().cuid() }) },
    async (req, res, next) => {
      try {
        const organizationId = req.user?.organizationId || req.headers["x-organization-id"] as string;
        if (!organizationId) {
          return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Organization ID required" } });
        }

        await service.delete(req.params.id, organizationId);
        res.json({
          ok: true,
          data: { deleted: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );
}

// ─── Prisma Schema Snippet (for reference) ──────────────────────────────────

/*
// Add to your module's Prisma schema:

model ModuleNotes {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  module         String   // e.g., "websiteBuilder", "crm", etc.
  title          String?
  body           String?
  metadata       Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, module])
  @@index([createdAt])
}

// Then in your module service:
import { createNotesService } from "@windels/shared/notes";

const notesService = createNotesService("websiteBuilder", {
  create: (data) => prisma.moduleNotes.create({ data: { ...data, module: "websiteBuilder" } }),
  findMany: (orgId) => prisma.moduleNotes.findMany({ where: { organizationId: orgId, module: "websiteBuilder" } }),
  findUnique: (id, orgId) => prisma.moduleNotes.findFirst({ where: { id, organizationId: orgId, module: "websiteBuilder" } }),
  update: (id, orgId, data) => prisma.moduleNotes.update({ where: { id, organizationId: orgId, module: "websiteBuilder" }, data }),
  delete: (id, orgId) => prisma.moduleNotes.delete({ where: { id, organizationId: orgId, module: "websiteBuilder" } }),
});
*/

export default {
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  createNotesService,
  registerNotesRoutes,
  noteSchema,
  createNoteSchema,
  updateNoteSchema,
};
