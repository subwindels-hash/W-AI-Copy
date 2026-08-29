/**
 * Shared Notes Utility - Replaces duplicate notes implementations across modules
 * 
 * This utility provides a standardized way to handle notes for any module.
 * Instead of each module implementing its own notes CRUD, use this shared utility.
 */

import { redisCmd as redis } from "../db/redis.js";
import { randomUUID } from "node:crypto";

export interface NoteData {
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredNote {
  id: string;
  organizationId: string;
  module: string;
  title?: string;
  body?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NotesService {
  list(organizationId: string): Promise<StoredNote[]>;
  get(id: string, organizationId: string): Promise<StoredNote | null>;
  create(input: NoteData, organizationId: string): Promise<StoredNote>;
  update(id: string, input: Partial<NoteData>, organizationId: string): Promise<StoredNote | null>;
  delete(id: string, organizationId: string): Promise<boolean>;
}

/**
 * Create a notes service for a specific module
 */
export function createNotesService(moduleName: string): NotesService {
  const keyPrefix = `notes:${moduleName}:`;

  return {
    list: async (organizationId: string): Promise<StoredNote[]> => {
      const keys = await redis.keys(`${keyPrefix}*`);
      const notes: StoredNote[] = [];

      for (const key of keys) {
        const data = await redis.hgetall(key);
        if (data._doc) {
          const note = JSON.parse(data._doc);
          if (note.organizationId === organizationId) {
            notes.push(note);
          }
        }
      }

      return notes.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },

    get: async (id: string, organizationId: string): Promise<StoredNote | null> => {
      const data = await redis.hgetall(`${keyPrefix}${id}`);
      if (!data._doc) return null;

      const note = JSON.parse(data._doc);
      if (note.organizationId !== organizationId) return null;

      return note;
    },

    create: async (input: NoteData, organizationId: string): Promise<StoredNote> => {
      const now = new Date().toISOString();
      const note: StoredNote = {
        id: randomUUID(),
        organizationId,
        module: moduleName,
        title: input.title,
        body: input.body,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      };

      await redis.hset(`${keyPrefix}${note.id}`, "_doc", JSON.stringify(note));
      return note;
    },

    update: async (id: string, input: Partial<NoteData>, organizationId: string): Promise<StoredNote | null> => {
      const data = await redis.hgetall(`${keyPrefix}${id}`);
      if (!data._doc) return null;

      const note = JSON.parse(data._doc);
      if (note.organizationId !== organizationId) return null;

      const updated: StoredNote = {
        ...note,
        title: input.title !== undefined ? input.title : note.title,
        body: input.body !== undefined ? input.body : note.body,
        metadata: input.metadata !== undefined ? input.metadata : note.metadata,
        updatedAt: new Date().toISOString(),
      };

      await redis.hset(`${keyPrefix}${id}`, "_doc", JSON.stringify(updated));
      return updated;
    },

    delete: async (id: string, organizationId: string): Promise<boolean> => {
      const data = await redis.hgetall(`${keyPrefix}${id}`);
      if (!data._doc) return false;

      const note = JSON.parse(data._doc);
      if (note.organizationId !== organizationId) return false;

      await redis.del(`${keyPrefix}${id}`);
      return true;
    },
  };
}

/**
 * Register standard notes routes for a module
 */
export function registerNotesRoutes(router: any, service: NotesService) {
  router.get("/notes", async (req: any, res: any, next: any) => {
    try {
      const oid = req.user?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const notes = await service.list(oid);
      res.json({ ok: true, data: notes, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/notes/:id", async (req: any, res: any, next: any) => {
    try {
      const oid = req.user?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const note = await service.get(req.params.id, oid);
      if (!note) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: note, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", async (req: any, res: any, next: any) => {
    try {
      const oid = req.user?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const note = await service.create(req.body, oid);
      res.status(201).json({ ok: true, data: note, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", async (req: any, res: any, next: any) => {
    try {
      const oid = req.user?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const note = await service.update(req.params.id, req.body, oid);
      if (!note) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: note, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", async (req: any, res: any, next: any) => {
    try {
      const oid = req.user?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const deleted = await service.delete(req.params.id, oid);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
