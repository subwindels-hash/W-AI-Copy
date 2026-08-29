/**
 * Session 124 — Engineering Memory.
 *
 * The workforce's shared knowledge base: decisions, standards, patterns,
 * instructions, lessons and bug fixes, scoped org-wide or per-repository,
 * tagged and searchable. Entries are created by people or recorded by the
 * orchestrator from finished tasks/reviews — the `source` field states
 * which, and the workforce never invents a memory entry.
 *
 * Keys: aew:mem:<org>:<id> / aew:memidx:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { pushActivity } from "./workforce.service.js";
import type {
  AiEngineeringMemoryEntry,
  AiEngineeringMemoryKind,
} from "@windels/shared/aiEngineering";

const K = {
  mem: (oid: string, id: string) => `aew:mem:${oid}:${id}`,
  memidx: (oid: string) => `aew:memidx:${oid}`,
};
const MAX_MEMORY = 2000;

export const EngineeringMemoryService = {
  async create(
    oid: string,
    input: {
      kind: AiEngineeringMemoryKind; scope: "org" | "repo"; repoId?: string;
      title: string; body: string; tags: string[]; source: AiEngineeringMemoryEntry["source"]; author: string;
    },
  ): Promise<AiEngineeringMemoryEntry> {
    const entry: AiEngineeringMemoryEntry = {
      id: `aewm-${randomUUID().slice(0, 8)}`,
      kind: input.kind,
      scope: input.scope,
      repoId: input.scope === "repo" ? input.repoId ?? null : null,
      title: input.title,
      body: input.body,
      tags: input.tags,
      source: input.source,
      author: input.author,
      createdAt: new Date().toISOString(),
    };
    if (entry.scope === "repo" && !entry.repoId) throw AppError.badRequest("A repo-scoped memory entry requires repoId");
    await redis.set(K.mem(oid, entry.id), JSON.stringify(entry));
    await redis.lpush(K.memidx(oid), entry.id);
    await redis.ltrim(K.memidx(oid), 0, MAX_MEMORY - 1);
    await pushActivity(oid, "memory.added", `${entry.kind}: ${entry.title}`);
    return entry;
  },

  async list(
    oid: string,
    q: { kind?: AiEngineeringMemoryKind; repoId?: string; tag?: string; search?: string; limit?: number } = {},
  ): Promise<AiEngineeringMemoryEntry[]> {
    const ids = await redis.lrange(K.memidx(oid), 0, -1);
    const out: AiEngineeringMemoryEntry[] = [];
    for (const id of ids) {
      const raw = await redis.get(K.mem(oid, id));
      if (!raw) continue;
      const e = JSON.parse(raw) as AiEngineeringMemoryEntry;
      if (q.kind && e.kind !== q.kind) continue;
      if (q.repoId && e.repoId !== q.repoId) continue;
      if (q.tag && !e.tags.includes(q.tag)) continue;
      if (q.search) {
        const needle = q.search.toLowerCase();
        if (!e.title.toLowerCase().includes(needle) && !e.body.toLowerCase().includes(needle)) continue;
      }
      out.push(e);
    }
    return out.slice(0, q.limit ?? 100);
  },

  /** Record what a finished task taught the workforce (source: task). */
  async learnFromTask(
    oid: string,
    task: { id: string; title: string; error: string | null; testResult: { passed: number; failed: number } | null; repoId: string },
    author: string,
  ): Promise<AiEngineeringMemoryEntry | null> {
    if (task.error) {
      return this.create(oid, {
        kind: "lesson",
        scope: "repo",
        repoId: task.repoId,
        title: `Task ${task.id} failed: ${task.title}`,
        body: `The autonomous pipeline failed for "${task.title}": ${task.error}. Next runs of similar tasks should pre-check this condition.`,
        tags: ["autonomous", "failure"],
        source: "task",
        author,
      });
    }
    if (task.testResult && task.testResult.failed > 0) {
      return this.create(oid, {
        kind: "lesson",
        scope: "repo",
        repoId: task.repoId,
        title: `Task ${task.id} needed test fixes: ${task.title}`,
        body: `${task.testResult.failed} test(s) failed on the first run and were fixed in the loop. Reuse the fixed patterns for similar changes.`,
        tags: ["autonomous", "testing"],
        source: "task",
        author,
      });
    }
    return null;
  },

  async remove(oid: string, id: string): Promise<boolean> {
    const raw = await redis.get(K.mem(oid, id));
    if (!raw) return false;
    await redis.del(K.mem(oid, id));
    await redis.lrem(K.memidx(oid), 0, id);
    return true;
  },
};
