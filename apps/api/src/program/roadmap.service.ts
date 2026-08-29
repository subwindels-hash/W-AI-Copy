/**
 * RoadmapService - Slice 205: Roadmap Planning Agent.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Initiative, Milestone, Quarter, Roadmap, RoadmapStatus } from "@windels/shared";
// Deterministic demo RNG — stable within a running process.



const LIST_KEY = "pgm:roadmaps";
const COUNTER_KEY = "pgm:init:counter";
const DETAIL = (id: string) => `pgm:roadmap:${id}`;
const INITS = (rid: string) => `pgm:roadmap:${rid}:initiatives`;

function iso() { return new Date().toISOString(); }

function serialize<T>(v: T): string { return JSON.stringify(v); }

export const RoadmapService = {
  async list(): Promise<Roadmap[]> {
    const ids = await redis.lrange(LIST_KEY, 0, -1);
    const out: Roadmap[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as Roadmap);
    }
    return out;
  },
  async get(id: string): Promise<Roadmap | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as Roadmap) : null;
  },
  async create(input: Partial<Roadmap>): Promise<Roadmap> {
    const id = randomUUID();
    const now = iso();
    const r: Roadmap = {
      id,
      title: input.title ?? "Untitled roadmap",
      year: input.year ?? new Date().getFullYear(),
      vision: input.vision ?? "",
      themes: input.themes ?? [],
      status: (input.status as RoadmapStatus) ?? "draft",
      createdAt: now,
      updatedAt: now,
    };
    await redis.set(DETAIL(id), serialize(r));
    await redis.lpush(LIST_KEY, id);
    return r;
  },
  async addInitiative(roadmapId: string, input: Partial<Initiative>): Promise<Initiative> {
    const roadmap = await this.get(roadmapId);
    if (!roadmap) throw new Error("roadmap not found");
    const num = await redis.incr(COUNTER_KEY);
    const id = randomUUID();
    const init: Initiative = {
      id,
      roadmapId,
      title: input.title ?? `Initiative ${num}`,
      description: input.description ?? "",
      quarter: (input.quarter as Quarter) ?? "Q1",
      year: input.year ?? roadmap.year,
      priority: input.priority ?? "p2",
      owner: input.owner ?? "tbd",
      status: (input.status as RoadmapStatus) ?? "proposed",
      progressPct: input.progressPct ?? 0,
      dependencies: input.dependencies ?? [],
      milestones: (input.milestones as Milestone[]) ?? [],
      okrSummary: input.okrSummary,
      // Presented in the UI as an AI assessment of delivery confidence, but
      // it was a random 60-95 assigned the moment the initiative was created,
      // before anything could have been analysed. Undefined until scored.
      aiConfidence: undefined,
    };
    await redis.hset(INITS(roadmapId), id, serialize(init));
    roadmap.updatedAt = iso();
    await redis.set(DETAIL(roadmapId), serialize(roadmap));
    return init;
  },
  async listInitiatives(roadmapId: string): Promise<Initiative[]> {
    const raw = await redis.hgetall(INITS(roadmapId));
    return Object.values(raw).map((s) => JSON.parse(s) as Initiative);
  },
  async updateInitiative(roadmapId: string, initId: string, patch: Partial<Initiative>): Promise<Initiative | null> {
    const raw = await redis.hget(INITS(roadmapId), initId);
    if (!raw) return null;
    const init = { ...(JSON.parse(raw) as Initiative), ...patch } as Initiative;
    await redis.hset(INITS(roadmapId), initId, serialize(init));
    return init;
  },
};
