/**
 * Global Platform — CDN (Slice 102).
 *
 * MVP control-plane: exposes cache configuration, purge log, and a signed-URL
 * helper. Actual CDN provisioning (Cloudflare/Fastly/CloudFront) is infra; this
 * module provides the API surface the UI and future provisioning workers will use.
 */

import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

interface CdnRule {
  pathPattern: string;
  ttlSeconds: number;
  staleWhileRevalidate: number;
  cacheKeyIncludes: string[]; // headers/query to include
  enabled: boolean;
}

interface PurgeEntry {
  id: string;
  paths: string[];
  status: "pending" | "complete";
  createdAt: string;
  completedAt?: string;
}

const DEFAULT_RULES: CdnRule[] = [
  { pathPattern: "/assets/*", ttlSeconds: 60 * 60 * 24 * 365, staleWhileRevalidate: 0, cacheKeyIncludes: [], enabled: true },
  { pathPattern: "/api/rest/v1/*", ttlSeconds: 0, staleWhileRevalidate: 0, cacheKeyIncludes: ["Authorization"], enabled: false },
  { pathPattern: "/*", ttlSeconds: 0, staleWhileRevalidate: 0, cacheKeyIncludes: [], enabled: true }, // no cache for HTML by default
];

// In-memory store; MVP has no persistence needed for CDN config preview.
let rules: CdnRule[] = [...DEFAULT_RULES];
const purges: PurgeEntry[] = [];

export function getCdnConfig() {
  return {
    enabled: true,
    provider: "windels-edge",
    popCount: 42,
    cacheHitRate: 0.87, // simulated
    bandwidthGb: 12.4,
    rules,
    recentPurges: purges.slice(0, 20),
  };
}

export function updateCdnRules(updated: CdnRule[]) {
  rules = updated.map((r) => ({ ...r }));
  return rules;
}

export async function purgeCache(paths: string[]): Promise<PurgeEntry> {
  const entry: PurgeEntry = {
    id: "purg_" + randomBytes(8).toString("hex"),
    paths, status: "pending", createdAt: new Date().toISOString(),
  };
  purges.unshift(entry);
  // Simulate async purge completing instantly in MVP; real impl would call provider API.
  await new Promise((r) => setTimeout(r, 150));
  entry.status = "complete";
  entry.completedAt = new Date().toISOString();
  if (purges.length > 100) purges.length = 100;
  return entry;
}

export function signUrl(url: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  // Strip any existing sig
  const u = new URL(url, "http://localhost");
  u.searchParams.set("cdn_exp", String(exp));
  const sig = createHmac("sha256", env.JWT_SECRET).update(u.pathname + u.search).digest("hex").slice(0, 32);
  u.searchParams.set("cdn_sig", sig);
  return u.pathname + u.search;
}
