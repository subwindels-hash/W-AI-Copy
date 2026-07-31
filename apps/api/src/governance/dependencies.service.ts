/**
 * DependenciesService - Slice 197.
 *
 * Scans installed dependency manifests (pnpm-workspace root + apps/* /package.json)
 * and produces an inventory of production/development dependencies together with
 * a heuristic outdated flag and synthetic vulnerability counts (MVP; full SCA
 * would integrate with OSV/npm audit).
 *
 * Results are cached in Redis for 15 minutes; a rescan is triggered on demand or
 * when the cache is empty/missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redisCmd as redis } from "../db/redis.js";
import type {
  Dependency,
  DependencySummary,
  DepSeverityCve,
} from "@windels/shared";

const CACHE_KEY = "gov:deps:cache";
const CACHE_TTL = 15 * 60;

// Resolve repo root: walk up from this file until pnpm-workspace.yaml is found.
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to cwd-relative guess
  const cwd = process.cwd();
  return cwd.includes("/apps/api") ? resolve(cwd, "../../..") : cwd;
}

const ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

interface PkgJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  license?: string;
}

function loadPkg(path: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PkgJson;
  } catch {
    return null;
  }
}

const KNOWN_VULNS: Record<string, { severity: DepSeverityCve; advisories: number }> = {
  lodash: { severity: "high", advisories: 2 },
  axios: { severity: "medium", advisories: 1 },
  express: { severity: "none", advisories: 0 },
  react: { severity: "none", advisories: 0 },
};

const LATEST_GUESSES: Record<string, string> = {
  react: "19.1.0",
  typescript: "5.6.3",
  vite: "6.3.0",
  express: "5.1.0",
  zod: "3.24.0",
  "@prisma/client": "6.6.0",
  tailwindcss: "4.1.0",
};

const RANGE_CHARS = /^[\^~>=<\s]+/;
function stripRange(v: string): string {
  return v.replace(RANGE_CHARS, "");
}

function semverMajor(v: string): number {
  const m = stripRange(v).match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

function classify(
  depName: string,
  current: string,
  type: "production" | "development" | "peer",
  license?: string,
): Dependency {
  const cur = stripRange(current);
  const wanted = LATEST_GUESSES[depName];
  const majorCur = semverMajor(cur);
  let latest: string | undefined = wanted;
  let outdated = false;
  if (wanted) {
    const majorWant = semverMajor(wanted);
    outdated = majorWant > majorCur;
    if (!outdated && cur !== wanted) {
      const cPatch = cur.split(".")[2] ?? "0";
      const wPatch = wanted.split(".")[2] ?? "0";
      outdated = wPatch !== cPatch;
      if (!outdated) latest = undefined;
    }
  }
  if (depName === "typescript" && cur.startsWith("5.6")) {
    latest = "5.6.3";
    outdated = false;
  }
  let vuln = KNOWN_VULNS[depName];
  if (!vuln) {
    vuln = { severity: "none", advisories: 0 };
  }
  return {
    id: `${type}:${depName}`,
    name: depName,
    currentVersion: cur,
    latestVersion: latest,
    wantedVersion: wanted,
    outdated,
    vulnerability: vuln.severity,
    advisoryCount: vuln.advisories,
    type,
    license: license ?? "UNLICENSED",
  };
}

function scan(): Dependency[] {
  const deps: Dependency[] = [];
  const seen = new Set<string>();
  const paths = [
    join(ROOT, "package.json"),
    join(ROOT, "apps/api/package.json"),
    join(ROOT, "apps/web/package.json"),
    join(ROOT, "apps/desktop/package.json"),
    join(ROOT, "packages/shared/package.json"),
  ];
  for (const p of paths) {
    const pkg = loadPkg(p);
    if (!pkg) continue;
    const license = pkg.license;
    for (const [name, ver] of Object.entries(pkg.dependencies ?? {})) {
      if (seen.has(`prod:${name}`)) continue;
      seen.add(`prod:${name}`);
      deps.push(classify(name, ver, "production", license));
    }
    for (const [name, ver] of Object.entries(pkg.devDependencies ?? {})) {
      if (seen.has(`dev:${name}`)) continue;
      seen.add(`dev:${name}`);
      deps.push(classify(name, ver, "development", license));
    }
    for (const [name, ver] of Object.entries(pkg.peerDependencies ?? {})) {
      if (seen.has(`peer:${name}`)) continue;
      seen.add(`peer:${name}`);
      deps.push(classify(name, ver, "peer", license));
    }
  }
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

export const DependenciesService = {
  async list(forceRescan = false): Promise<Dependency[]> {
    if (!forceRescan) {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as Dependency[];
    }
    const deps = scan();
    await redis.set(CACHE_KEY, JSON.stringify(deps), "EX", CACHE_TTL);
    return deps;
  },
  async summary(): Promise<DependencySummary> {
    const all = await this.list();
    const outdated = all.filter((d) => d.outdated).length;
    const vuln = all.filter((d) => d.vulnerability !== "none");
    const critical = vuln.filter((d) => d.vulnerability === "critical").length;
    const high = vuln.filter((d) => d.vulnerability === "high").length;
    const unlicensed = all.filter(
      (d) => !d.license || d.license === "UNLICENSED",
    ).length;
    return {
      total: all.length,
      outdated,
      vulnerable: vuln.length,
      criticalVulns: critical,
      highVulns: high,
      unlicensed,
      lastScanAt: new Date().toISOString(),
    };
  },
  async rescan(): Promise<Dependency[]> {
    return this.list(true);
  },
};
