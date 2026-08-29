/**
 * CollaborationService — Slice 173.
 *
 * Defines AI teams/pods and their members with roles (coordinator / worker /
 * reviewer / observer), supports task handoffs between agents (accept/reject
 * flow + checkpointed context), and routes messages addressed to a team to
 * its current coordinator.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  AgentTeam, AgentTeamMember, TaskHandoff, TeamRole,
} from "@windels/shared/agentComm";

const TEAMS_KEY = "agentComm:teams";
const TEAM_PREFIX = "agentComm:team:";
const HANDOFFS_KEY = "agentComm:handoffs";
const HANDOFF_PREFIX = "agentComm:handoff:";

function teamKey(id: string) { return TEAM_PREFIX + id; }
function handoffKey(id: string) { return HANDOFF_PREFIX + id; }
function now() { return new Date().toISOString(); }

export const CollaborationService = {
  async createTeam(input: {
    name: string;
    mission: string;
    department?: string;
    coordinatorId?: string;
    members?: Array<Omit<AgentTeamMember, "joinedAt">>;
    metadata?: Record<string, unknown>;
  }): Promise<AgentTeam> {
    const id = randomUUID();
    const channel = `team:${id}`;
    const members: AgentTeamMember[] = (input.members ?? []).map((m) => ({ ...m, joinedAt: now() }));
    // If a coordinatorId was provided and isn't in members, auto-add them.
    if (input.coordinatorId && !members.some((m) => m.agentId === input.coordinatorId)) {
      members.push({ agentId: input.coordinatorId, role: "coordinator", joinedAt: now(), skills: [], capacity: 1 });
    } else if (input.coordinatorId) {
      const m = members.find((m) => m.agentId === input.coordinatorId);
      if (m) m.role = "coordinator";
    }
    const team: AgentTeam = {
      id, name: input.name, mission: input.mission,
      department: input.department, coordinatorId: input.coordinatorId,
      members, channel, createdAt: now(), updatedAt: now(),
      metadata: input.metadata ?? {},
    };
    try {
      const pipeline = redisCmd.multi();
      pipeline.set(teamKey(id), JSON.stringify(team));
      pipeline.sadd(TEAMS_KEY, id);
      await pipeline.exec();
    } catch (e) { logger.warn("team create redis failed", { error: (e as Error).message }); }
    return team;
  },

  async getTeam(id: string): Promise<AgentTeam | null> {
    try {
      const raw = await redisCmd.get(teamKey(id));
      return raw ? (JSON.parse(raw) as AgentTeam) : null;
    } catch { return null; }
  },

  async listTeams(): Promise<AgentTeam[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(TEAMS_KEY); } catch { return []; }
    const out: AgentTeam[] = [];
    for (const id of ids) { const t = await this.getTeam(id); if (t) out.push(t); }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async addMember(teamId: string, member: Omit<AgentTeamMember, "joinedAt">): Promise<AgentTeam | null> {
    const t = await this.getTeam(teamId);
    if (!t) return null;
    const existing = t.members.find((m) => m.agentId === member.agentId);
    if (existing) Object.assign(existing, member);
    else t.members.push({ ...member, joinedAt: now() });
    t.updatedAt = now();
    try { await redisCmd.set(teamKey(teamId), JSON.stringify(t)); } catch {}
    return t;
  },

  async removeMember(teamId: string, agentId: string): Promise<AgentTeam | null> {
    const t = await this.getTeam(teamId);
    if (!t) return null;
    t.members = t.members.filter((m) => m.agentId !== agentId);
    if (t.coordinatorId === agentId) {
      const next = t.members.find((m) => m.role === "coordinator") ?? t.members[0];
      t.coordinatorId = next?.agentId;
    }
    t.updatedAt = now();
    try { await redisCmd.set(teamKey(teamId), JSON.stringify(t)); } catch {}
    return t;
  },

  async setMemberRole(teamId: string, agentId: string, role: TeamRole): Promise<AgentTeam | null> {
    const t = await this.getTeam(teamId);
    if (!t) return null;
    if (role === "coordinator") {
      t.members.forEach((m) => { if (m.role === "coordinator") m.role = "worker"; });
      t.coordinatorId = agentId;
    }
    const m = t.members.find((mm) => mm.agentId === agentId);
    if (m) m.role = role;
    t.updatedAt = now();
    try { await redisCmd.set(teamKey(teamId), JSON.stringify(t)); } catch {}
    return t;
  },

  async deleteTeam(id: string): Promise<boolean> {
    try {
      await redisCmd.del(teamKey(id));
      await redisCmd.srem(TEAMS_KEY, id);
      return true;
    } catch { return false; }
  },

  // ── Task handoffs ─────────────────────────────────────────────────
  async createHandoff(input: {
    taskId: string;
    fromAgentId: string;
    toAgentId: string;
    reason: string;
    context?: Record<string, unknown>;
  }): Promise<TaskHandoff> {
    const id = randomUUID();
    const h: TaskHandoff = {
      id, taskId: input.taskId, fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId, reason: input.reason,
      context: input.context ?? {}, status: "pending", createdAt: now(),
    };
    try {
      const pipeline = redisCmd.multi();
      pipeline.set(handoffKey(id), JSON.stringify(h));
      pipeline.sadd(HANDOFFS_KEY, id);
      await pipeline.exec();
    } catch {}
    return h;
  },

  async getHandoff(id: string): Promise<TaskHandoff | null> {
    try { const r = await redisCmd.get(handoffKey(id)); return r ? JSON.parse(r) as TaskHandoff : null; } catch { return null; }
  },

  async listHandoffs(filter?: { taskId?: string; agentId?: string; status?: TaskHandoff["status"] }): Promise<TaskHandoff[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(HANDOFFS_KEY); } catch { return []; }
    const out: TaskHandoff[] = [];
    for (const id of ids) {
      const h = await this.getHandoff(id); if (!h) continue;
      if (filter?.taskId && h.taskId !== filter.taskId) continue;
      if (filter?.status && h.status !== filter.status) continue;
      if (filter?.agentId && h.fromAgentId !== filter.agentId && h.toAgentId !== filter.agentId) continue;
      out.push(h);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async respondHandoff(id: string, accept: boolean, note?: string): Promise<TaskHandoff | null> {
    const h = await this.getHandoff(id);
    if (!h || h.status !== "pending") return null;
    h.status = accept ? "accepted" : "rejected";
    if (accept) h.acceptedAt = now();
    if (note) h.context = { ...h.context, responseNote: note };
    try { await redisCmd.set(handoffKey(id), JSON.stringify(h)); } catch {}
    return h;
  },

  async completeHandoff(id: string): Promise<TaskHandoff | null> {
    const h = await this.getHandoff(id);
    if (!h) return null;
    h.status = "completed"; h.completedAt = now();
    try { await redisCmd.set(handoffKey(id), JSON.stringify(h)); } catch {}
    return h;
  },

  /** Resolve a destination address (agent or team) to an agent id. */
  async resolveDestination(address: string): Promise<string | null> {
    if (address.startsWith("team:")) {
      const t = await this.getTeam(address.slice(5));
      return t?.coordinatorId ?? t?.members[0]?.agentId ?? null;
    }
    return address;
  },
};
