/**
 * Enterprise AI Skills Marketplace (Slice 291) singleton.
 * Complements (does not replace) the existing Agent Marketplace.
 */
import { randomUUID } from "node:crypto";
import type {
  MarketplaceSkill, SkillInstallation, SkillAssignment,
  MkSkillCategory, MkSkillStatus, MkInstallStatus, MkAssignmentScope,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const K = {
  skills: "mk:skills",
  installs: "mk:skill-installs",
  assigns: "mk:skill-assigns",
  installsBySkill: (id: string) => `mk:skill:${id}:installs`,
  installsIndex: "mk:skill-installs-idx",
};

function hydrateSkill(raw: Record<string, string>): MarketplaceSkill {
  return {
    id: raw.id, slug: raw.slug, name: raw.name, publisher: raw.publisher,
    category: raw.category as MkSkillCategory, version: raw.version, summary: raw.summary,
    description: raw.description, tags: raw.tags ? JSON.parse(raw.tags) : [],
    priceModel: raw.priceModel as any, priceUsd: raw.priceUsd ? Number(raw.priceUsd) : undefined,
    rating: Number(raw.rating), installs: Number(raw.installs),
    status: raw.status as MkSkillStatus,
    requiredCapabilities: raw.requiredCapabilities ? JSON.parse(raw.requiredCapabilities) : [],
    requiredPermissions: raw.requiredPermissions ? JSON.parse(raw.requiredPermissions) : [],
    documentationUrl: raw.documentationUrl || undefined, repositoryUrl: raw.repositoryUrl || undefined,
    iconColor: raw.iconColor, iconEmoji: raw.iconEmoji || undefined,
    createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  };
}
function dehydrateSkill(s: MarketplaceSkill): Record<string, string> {
  return {
    id: s.id, slug: s.slug, name: s.name, publisher: s.publisher, category: s.category,
    version: s.version, summary: s.summary, description: s.description, tags: JSON.stringify(s.tags),
    priceModel: s.priceModel, priceUsd: s.priceUsd?.toString() ?? "", rating: String(s.rating),
    installs: String(s.installs), status: s.status,
    requiredCapabilities: JSON.stringify(s.requiredCapabilities),
    requiredPermissions: JSON.stringify(s.requiredPermissions),
    documentationUrl: s.documentationUrl ?? "", repositoryUrl: s.repositoryUrl ?? "",
    iconColor: s.iconColor, iconEmoji: s.iconEmoji ?? "",
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}
function hydrateInstall(raw: Record<string, string>): SkillInstallation {
  return {
    id: raw.id, skillId: raw.skillId, orgId: raw.orgId, installedBy: raw.installedBy,
    installedVersion: raw.installedVersion, status: raw.status as MkInstallStatus,
    configuration: raw.configuration ? JSON.parse(raw.configuration) : {},
    enabled: raw.enabled === "true", installedAt: raw.installedAt, updatedAt: raw.updatedAt,
  };
}
function dehydrateInstall(i: SkillInstallation): Record<string, string> {
  return {
    id: i.id, skillId: i.skillId, orgId: i.orgId, installedBy: i.installedBy,
    installedVersion: i.installedVersion, status: i.status,
    configuration: JSON.stringify(i.configuration), enabled: String(i.enabled),
    installedAt: i.installedAt, updatedAt: i.updatedAt,
  };
}
function hydrateAssign(raw: Record<string, string>): SkillAssignment {
  return {
    id: raw.id, installationId: raw.installationId, scope: raw.scope as MkAssignmentScope,
    targetId: raw.targetId, targetName: raw.targetName, assignedBy: raw.assignedBy,
    assignedAt: raw.assignedAt, policyBindingId: raw.policyBindingId || undefined,
  };
}

export const SkillsService = {
  async listSkills(filter?: { category?: MkSkillCategory; status?: MkSkillStatus; q?: string }): Promise<MarketplaceSkill[]> {
    const ids = await redis.zrange(K.skills, 0, -1);
    const out: MarketplaceSkill[] = [];
    for (const id of ids) {
      const raw = await redis.hgetall(`mk:skill:${id}`);
      if (!raw?.id) continue;
      const s = hydrateSkill(raw);
      if (filter?.category && s.category !== filter.category) continue;
      if (filter?.status && s.status !== filter.status) continue;
      if (filter?.q && !(s.name.toLowerCase().includes(filter.q.toLowerCase()) || s.summary.toLowerCase().includes(filter.q.toLowerCase()))) continue;
      out.push(s);
    }
    return out.sort((a,b) => b.installs - a.installs);
  },
  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    const raw = await redis.hgetall(`mk:skill:${id}`);
    return raw?.id ? hydrateSkill(raw) : null;
  },
  async publishSkill(s: Omit<MarketplaceSkill,"id"|"createdAt"|"updatedAt"|"installs"|"rating"> & { rating?: number }): Promise<MarketplaceSkill> {
    const id = "sk-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const full: MarketplaceSkill = { ...s, id, installs: 0, rating: Number(s.rating ?? 4.0), createdAt: now, updatedAt: now };
    const multi = redis.multi();
    multi.zadd(K.skills, 0, id);
    multi.hset(`mk:skill:${id}`, dehydrateSkill(full));
    await multi.exec();
    return full;
  },
  async listInstallations(): Promise<SkillInstallation[]> {
    const ids = await redis.zrange(K.installs, 0, -1);
    const out: SkillInstallation[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:install:${id}`); if (raw?.id) out.push(hydrateInstall(raw)); }
    return out;
  },
  async installSkill(input: { skillId: string; orgId: string; installedBy: string; configuration?: Record<string, any> }): Promise<SkillInstallation> {
    const skill = await this.getSkill(input.skillId);
    if (!skill) throw new Error("skill not found");
    // check if already installed
    const existing = (await this.listInstallations()).find(i => i.skillId === input.skillId && i.orgId === input.orgId);
    if (existing) return existing;
    const id = "si-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const inst: SkillInstallation = {
      id, skillId: input.skillId, orgId: input.orgId, installedBy: input.installedBy,
      installedVersion: skill.version, status: "installed",
      configuration: input.configuration ?? {}, enabled: true, installedAt: now, updatedAt: now,
    };
    const multi = redis.multi();
    multi.zadd(K.installs, Date.now(), id);
    multi.hset(`mk:install:${id}`, dehydrateInstall(inst));
    multi.hincrby(`mk:skill:${input.skillId}`, "installs", 1);
    await multi.exec();
    return inst;
  },
  async uninstallSkill(installId: string): Promise<void> {
    const raw = await redis.hgetall(`mk:install:${installId}`);
    if (raw?.id) {
      const multi = redis.multi();
      multi.zrem(K.installs, installId);
      multi.del(`mk:install:${installId}`);
      if (raw.skillId) multi.hincrby(`mk:skill:${raw.skillId}`, "installs", -1);
      await multi.exec();
    }
  },
  async assignSkill(input: { installationId: string; scope: MkAssignmentScope; targetId: string; targetName: string; assignedBy: string; policyBindingId?: string }): Promise<SkillAssignment> {
    const id = "sa-" + randomUUID().slice(0, 8);
    const full: SkillAssignment = { id, assignedAt: new Date().toISOString(), ...input };
    await redis.zadd(K.assigns, Date.now(), JSON.stringify(full));
    return full;
  },
  async listAssignments(): Promise<SkillAssignment[]> {
    const raw = await redis.zrange(K.assigns, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async summary() {
    const [skills, installs] = await Promise.all([this.listSkills(), this.listInstallations()]);
    const assigns = await this.listAssignments();
    const published = skills.filter(s => s.status === "published").length;
    return {
      skillsAvailable: published,
      skillsInstalled: installs.filter(i => i.status === "installed").length,
      skillsAssigned: assigns.length,
      skillsPendingReview: skills.filter(s => s.status === "draft").length,
    };
  },
};
