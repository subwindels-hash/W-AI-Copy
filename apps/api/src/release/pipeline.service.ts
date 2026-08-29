/**
 * PipelineService - Slice 199: Enterprise Release Pipeline state machine.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  PipelineRelease,
  PipelineReleaseStatus,
  ReleaseEnvironment,
  PipelineDeploymentStrategy,
} from "@windels/shared";

const LIST_KEY = "rel:releases";
const COUNTER_KEY = "rel:counter";
const DETAIL_KEY = (id: string) => `rel:release:${id}`;

function iso() { return new Date().toISOString(); }

async function nextNumber(): Promise<number> {
  return redis.incr(COUNTER_KEY);
}

const SERIALIZED_FIELDS = ["changelog", "ticketRefs"] as const;

async function save(r: PipelineRelease) {
  const hash: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    hash[k] = SERIALIZED_FIELDS.includes(k as any) ? JSON.stringify(v) : String(v ?? "");
  }
  const multi = redis.multi();
  multi.hset(DETAIL_KEY(r.id), hash);
  multi.zadd(LIST_KEY, r.number, r.id);
  await multi.exec();
}

async function get(id: string): Promise<PipelineRelease | null> {
  const raw = await redis.hgetall(DETAIL_KEY(id));
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    number: Number(raw.number),
    title: raw.title,
    version: raw.version,
    service: raw.service,
    environment: raw.environment as ReleaseEnvironment,
    strategy: raw.strategy as PipelineDeploymentStrategy,
    status: raw.status as PipelineReleaseStatus,
    author: raw.author,
    description: raw.description,
    changelog: JSON.parse(raw.changelog || "[]"),
    ticketRefs: JSON.parse(raw.ticketRefs || "[]"),
    risk: raw.risk as PipelineRelease["risk"],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deployedAt: raw.deployedAt || undefined,
    rollbackOf: raw.rollbackOf || undefined,
  };
}

export const PipelineService = {
  async list(limit = 50): Promise<PipelineRelease[]> {
    const ids = await redis.zrange(LIST_KEY, 0, limit - 1, "REV");
    const out: PipelineRelease[] = [];
    for (const id of ids) {
      const r = await get(id);
      if (r) out.push(r);
    }
    return out;
  },
  async get(id: string) { return get(id); },
  async create(input: {
    title: string;
    version: string;
    service: string;
    strategy: PipelineDeploymentStrategy;
    description?: string;
    changelog?: string[];
    ticketRefs?: string[];
    risk?: PipelineRelease["risk"];
    author?: string;
  }): Promise<PipelineRelease> {
    const num = await nextNumber();
    const id = randomUUID();
    const now = iso();
    const rel: PipelineRelease = {
      id,
      number: num,
      title: input.title,
      version: input.version,
      service: input.service,
      environment: "dev",
      strategy: input.strategy,
      status: "draft",
      author: input.author ?? "system",
      description: input.description ?? "",
      changelog: input.changelog ?? [],
      ticketRefs: input.ticketRefs ?? [],
      risk: input.risk ?? "medium",
      createdAt: now,
      updatedAt: now,
    };
    await save(rel);
    return rel;
  },
  async setStatus(id: string, status: PipelineReleaseStatus, environment?: ReleaseEnvironment): Promise<PipelineRelease | null> {
    const r = await get(id);
    if (!r) return null;
    r.status = status;
    r.updatedAt = iso();
    if (environment) r.environment = environment;
    if (status === "deployed" && !r.deployedAt) r.deployedAt = r.updatedAt;
    await save(r);
    return r;
  },
  async rollback(id: string): Promise<PipelineRelease | null> {
    return this.setStatus(id, "rolled_back");
  },
};
