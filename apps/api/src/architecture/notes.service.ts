/**
 * Architecture Module Notes Service
 * 
 * Uses the shared notes pattern from @windels/shared/notes
 */

import { createNotesService } from "@windels/shared/notes";
import { redisCmd as redis } from "../db/redis.js";
import { randomUUID } from "node:crypto";

const NOTES_KEY = "arch:notes:";

export const architectureNotesService = createNotesService("architecture", {
  create: async (data) => {
    const id = randomUUID();
    const note = {
      id,
      organizationId: data.organizationId,
      module: "architecture",
      title: data.title,
      body: data.body,
      metadata: data.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await redis.hset(`${NOTES_KEY}${id}`, "_doc", JSON.stringify(note));
    return note as any;
  },
  findMany: async (organizationId) => {
    const keys = await redis.keys(`${NOTES_KEY}*`);
    const notes: Array<{
      id: string;
      organizationId: string;
      module: string;
      title?: string;
      body?: string;
      metadata: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }> = [];
    
    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (data._doc) {
        const note = JSON.parse(data._doc);
        // Only return notes for this organization
        if (note.organizationId === organizationId) {
          notes.push(note);
        }
      }
    }
    
    return notes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
  findUnique: async (id, organizationId) => {
    const data = await redis.hgetall(`${NOTES_KEY}${id}`);
    if (!data._doc) return null;
    
    const note = JSON.parse(data._doc);
    if (note.organizationId !== organizationId) return null;
    
    return note as any;
  },
  update: async (id, organizationId, data) => {
    const existing = await redis.hgetall(`${NOTES_KEY}${id}`);
    if (!existing._doc) throw new Error("Note not found");
    
    const note = JSON.parse(existing._doc);
    if (note.organizationId !== organizationId) throw new Error("Not authorized");
    
    const updated = {
      ...note,
      title: data.title ?? note.title,
      body: data.body ?? note.body,
      metadata: data.metadata ?? note.metadata,
      updatedAt: new Date().toISOString(),
    };
    
    await redis.hset(`${NOTES_KEY}${id}`, "_doc", JSON.stringify(updated));
    return updated as any;
  },
  delete: async (id, organizationId) => {
    const existing = await redis.hgetall(`${NOTES_KEY}${id}`);
    if (!existing._doc) return;
    
    const note = JSON.parse(existing._doc);
    if (note.organizationId !== organizationId) return;
    
    await redis.del(`${NOTES_KEY}${id}`);
  },
});
