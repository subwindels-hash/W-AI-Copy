/**
 * Enterprise AI Application Store (Slice 294) singleton.
 * Centralized governance, permissioning, versioning, lifecycle.
 */
import { randomUUID } from "node:crypto";
import type {
  AiApplication, AppInstall, AppVersion, AppKind, AppStatus, MkInstallStatus,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const K = {
  apps: "mk:apps",
  versions: (aid: string) => `mk:app:${aid}:versions`,
  installs: "mk:app-installs",
  updates: "mk:app-updates-available",
};

function hydrateApp(raw: Record<string, string>): AiApplication {
  return {
    id: raw.id, slug: raw.slug, name: raw.name, publisher: raw.publisher,
    kind: raw.kind as AppKind, category: raw.category,
    shortDescription: raw.shortDescription, fullDescription: raw.fullDescription,
    latestVersion: raw.latestVersion, status: raw.status as AppStatus,
    priceModel: raw.priceModel as AiApplication["priceModel"],
    priceUsd: raw.priceUsd ? Number(raw.priceUsd) : undefined,
    rating: Number(raw.rating), installs: Number(raw.installs),
    permissions: raw.permissions ? JSON.parse(raw.permissions) : [],
    dependencies: raw.dependencies ? JSON.parse(raw.dependencies) : [],
    tags: raw.tags ? JSON.parse(raw.tags) : [],
    iconColor: raw.iconColor, iconEmoji: raw.iconEmoji || undefined,
    governanceApproved: raw.governanceApproved === "true",
    createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  };
}
function dehydrateApp(a: AiApplication): Record<string, string> {
  return {
    id: a.id, slug: a.slug, name: a.name, publisher: a.publisher, kind: a.kind,
    category: a.category, shortDescription: a.shortDescription, fullDescription: a.fullDescription,
    latestVersion: a.latestVersion, status: a.status, priceModel: a.priceModel,
    priceUsd: a.priceUsd?.toString() ?? "", rating: String(a.rating), installs: String(a.installs),
    permissions: JSON.stringify(a.permissions), dependencies: JSON.stringify(a.dependencies),
    tags: JSON.stringify(a.tags), iconColor: a.iconColor, iconEmoji: a.iconEmoji ?? "",
    governanceApproved: String(a.governanceApproved), createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}
function hydrateVersion(raw: Record<string, string>): AppVersion {
  return {
    id: raw.id, appId: raw.appId, version: raw.version, changelog: raw.changelog,
    publishedAt: raw.publishedAt, minOsVersion: raw.minOsVersion,
    packageUrl: raw.packageUrl || undefined, sizeKb: Number(raw.sizeKb),
  };
}
function hydrateInstall(raw: Record<string, string>): AppInstall {
  return {
    id: raw.id, appId: raw.appId, orgId: raw.orgId, installedBy: raw.installedBy,
    installedVersion: raw.installedVersion, status: raw.status as MkInstallStatus,
    autoUpdate: raw.autoUpdate === "true", installedAt: raw.installedAt, lastUpdatedAt: raw.lastUpdatedAt,
  };
}

export const AppStoreService = {
  async listApps(filter?: { kind?: AppKind; category?: string; status?: AppStatus; approvedOnly?: boolean }): Promise<AiApplication[]> {
    const ids = await redis.zrange(K.apps, 0, -1);
    const out: AiApplication[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:app:${id}`); if (raw?.id) out.push(hydrateApp(raw)); }
    if (filter?.kind) return out.filter(a => a.kind === filter.kind);
    if (filter?.category) return out.filter(a => a.category === filter.category);
    if (filter?.status) return out.filter(a => a.status === filter.status);
    if (filter?.approvedOnly) return out.filter(a => a.governanceApproved && a.status === "published");
    return out;
  },
  async getApp(id: string): Promise<AiApplication | null> {
    const raw = await redis.hgetall(`mk:app:${id}`);
    return raw?.id ? hydrateApp(raw) : null;
  },
  async publishApp(a: Omit<AiApplication,"id"|"createdAt"|"updatedAt"|"installs"|"rating"> & { rating?: number }): Promise<AiApplication> {
    const id = "app-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const full: AiApplication = { ...a, id, installs: 0, rating: Number(a.rating ?? 4.2), createdAt: now, updatedAt: now };
    const multi = redis.multi();
    multi.zadd(K.apps, 0, id);
    multi.hset(`mk:app:${id}`, dehydrateApp(full));
    await multi.exec();
    // publish initial version
    await this.addVersion({ appId: id, version: full.latestVersion, changelog: "Initial release", minOsVersion: "0.34.0", sizeKb: 128 });
    return full;
  },
  async setApproval(id: string, approved: boolean): Promise<AiApplication | null> {
    const raw = await redis.hgetall(`mk:app:${id}`);
    if (!raw?.id) return null;
    await redis.hset(`mk:app:${id}`, "governanceApproved", String(approved), "status", approved ? "published" : "pending-review");
    return this.getApp(id);
  },
  async addVersion(v: Omit<AppVersion,"id"|"publishedAt">): Promise<AppVersion> {
    const id = "av-" + randomUUID().slice(0, 8);
    const full: AppVersion = { ...v, id, publishedAt: new Date().toISOString() };
    await redis.zadd(K.versions(v.appId), Date.now(), JSON.stringify(full));
    await redis.hset(`mk:app:${v.appId}`, "latestVersion", v.version, "updatedAt", full.publishedAt);
    // mark existing installs of older versions as update-available
    const installs = await this.listInstalls();
    for (const i of installs) {
      if (i.appId === v.appId && i.installedVersion !== v.version && i.autoUpdate) {
        await redis.sadd(K.updates, i.id);
      }
    }
    return full;
  },
  async listVersions(appId: string): Promise<AppVersion[]> {
    const raw = await redis.zrange(K.versions(appId), 0, -1, "REV");
    return raw.map(s => JSON.parse(s));
  },
  async listInstalls(): Promise<AppInstall[]> {
    const ids = await redis.zrange(K.installs, 0, -1);
    const out: AppInstall[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:appinstall:${id}`); if (raw?.id) out.push(hydrateInstall(raw)); }
    return out;
  },
  async installApp(input: { appId: string; orgId: string; installedBy: string; autoUpdate?: boolean }): Promise<AppInstall> {
    const app = await this.getApp(input.appId);
    if (!app) throw new Error("app not found");
    if (!app.governanceApproved) throw new Error("app not approved by governance");
    const existing = (await this.listInstalls()).find(i => i.appId === input.appId && i.orgId === input.orgId);
    if (existing) return existing;
    const id = "ai-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const install: AppInstall = {
      id, appId: input.appId, orgId: input.orgId, installedBy: input.installedBy,
      installedVersion: app.latestVersion, status: "installed", autoUpdate: input.autoUpdate ?? true,
      installedAt: now, lastUpdatedAt: now,
    };
    const multi = redis.multi();
    multi.zadd(K.installs, Date.now(), id);
    multi.hset(`mk:appinstall:${id}`, {
      id: install.id, appId: install.appId, orgId: install.orgId, installedBy: install.installedBy,
      installedVersion: install.installedVersion, status: install.status,
      autoUpdate: String(install.autoUpdate), installedAt: install.installedAt, lastUpdatedAt: install.lastUpdatedAt,
    });
    multi.hincrby(`mk:app:${input.appId}`, "installs", 1);
    await multi.exec();
    return install;
  },
  async uninstallApp(installId: string): Promise<void> {
    const raw = await redis.hgetall(`mk:appinstall:${installId}`);
    if (raw?.id) {
      const multi = redis.multi();
      multi.zrem(K.installs, installId);
      multi.del(`mk:appinstall:${installId}`);
      if (raw.appId) multi.hincrby(`mk:app:${raw.appId}`, "installs", -1);
      await multi.exec();
    }
  },
  async summary() {
    const apps = await this.listApps();
    const installs = await this.listInstalls();
    const pending = apps.filter(a => a.status === "pending-review" || !a.governanceApproved).length;
    const updates = await redis.scard(K.updates);
    return {
      appsAvailable: apps.filter(a => a.governanceApproved && a.status === "published").length,
      appsInstalled: installs.filter(i => i.status === "installed").length,
      appsPendingApproval: pending,
      appUpdatesAvailable: updates,
    };
  },
};
