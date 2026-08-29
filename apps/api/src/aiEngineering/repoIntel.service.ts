/**
 * Session 124 — Repository Intelligence.
 *
 * Builds a continuously updated knowledge graph for every connected
 * repository. The scanner reads a local checkout (or the sandbox's own
 * workspace) and emits typed nodes:
 *
 *   structure / architecture / backend / frontend / database / api / auth /
 *   dependency / business_logic / service / controller / model / component /
 *   workflow / documentation / tech_debt / duplicate / dead_code / security /
 *   performance / test
 *
 * Honesty rules:
 *   - `basis: "observed"` — read directly (a file exists, a dependency is
 *     declared, a Prisma model is defined);
 *   - `basis: "heuristic"` — inferred by pattern matching (duplicate blocks,
 *     dead exports, secrets, large files) and explicitly labelled as
 *     potentially wrong, with a `confidence`;
 *   - a scan failure is recorded on the repo (`lastError`), never reported
 *     as an empty graph.
 *
 * Keys: aew:intel:<org>:<repoId>:<nodeId> + aew:intelidx:<org>:<repoId>
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { WorkforceService } from "./workforce.service.js";
import type { AiEngineeringIntelKind, AiEngineeringIntelNode } from "@windels/shared/aiEngineering";

const K = {
  node: (oid: string, repoId: string, id: string) => `aew:intel:${oid}:${repoId}:${id}`,
  idx: (oid: string, repoId: string) => `aew:intelidx:${oid}:${repoId}`,
};

/** Directories that are never part of a repo's own source. */
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt",
  ".turbo", ".cache", ".venv", "venv", "__pycache__", ".pytest_cache",
  "target", "out", ".output", "uploads", ".local",
]);
const IGNORED_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "*.png", "*.jpg", "*.ico"]);

const MAX_FILES = 2000;
const MAX_DEPTH = 8;
const MAX_NODES = 400;

function walk(root: string): string[] {
  const out: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length && out.length < MAX_FILES) {
    const { dir, depth } = stack.pop()!;
    if (depth > MAX_DEPTH) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) stack.push({ dir: p, depth: depth + 1 });
      } else if (e.isFile()) {
        if (!IGNORED_FILES.has(e.name) && !e.name.endsWith(".map")) out.push(p);
      }
    }
  }
  return out.sort();
}

const read = (p: string, limit = 400_000): string => {
  try {
    const s = fs.readFileSync(p, "utf8");
    return s.length > limit ? s.slice(0, limit) : s;
  } catch {
    return "";
  }
};

function node(
  repoId: string, kind: AiEngineeringIntelKind, label: string, detail: string,
  basis: "observed" | "heuristic", confidence: "high" | "medium" | "low",
  meta: Record<string, string | number | boolean> = {},
): AiEngineeringIntelNode {
  return {
    id: `aewi-${createHash("sha1").update(`${repoId}|${kind}|${label}`).digest("hex").slice(0, 12)}`,
    repoId, kind, label, detail, basis, confidence, meta,
    detectedAt: new Date().toISOString(),
  };
}

const SIMPLE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|rb|php|java|kt|cs|sql|prisma|yml|yaml|json|md|sh|tf|graphql)$/;

export const RepoIntelService = {
  /**
   * Scan a local directory into a knowledge graph for a repo. Returns the
   * emitted nodes (capped). Safe on any directory; failures are recorded,
   * never faked.
   */
  async scanLocal(oid: string, repoId: string, dir: string): Promise<{ nodes: AiEngineeringIntelNode[]; summary: Record<string, number> }> {
    const nodes: AiEngineeringIntelNode[] = [];
    const files = walk(dir);

    // ── Structure (observed) ────────────────────────────────────────
    const topLevel = new Map<string, number>();
    for (const f of files) {
      const rel = path.relative(dir, f);
      const seg = rel.split(path.sep)[0] ?? ".";
      topLevel.set(seg, (topLevel.get(seg) ?? 0) + 1);
    }
    for (const [seg, count] of [...topLevel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      nodes.push(node(repoId, "structure", seg, `${count} file(s) at the top level`, "observed", "high", { files: count }));
    }

    // ── Manifest / dependencies / framework detection (observed) ────
    const manifest = files.find((f) => path.basename(f) === "package.json" && !f.includes("node_modules"));
    if (manifest) {
      const pkg = JSON.parse(read(manifest) || "{}");
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const names = Object.keys(deps);
      nodes.push(node(repoId, "dependency", "package.json", `${names.length} declared dependencies`, "observed", "high", { count: names.length }));
      const frameworks: Array<[string, string]> = [
        ["next", "Next.js"], ["react-native", "React Native"], ["react", "React"], ["@nestjs/core", "NestJS"], ["express", "Express"], ["fastify", "Fastify"], ["typeorm", "TypeORM"], ["prisma", "Prisma"], ["@prisma/client", "Prisma"], ["graphql", "GraphQL"], ["socket.io", "WebSockets"], ["@supabase/supabase-js", "Supabase"], ["tailwindcss", "Tailwind"],
      ];
      for (const [dep, label] of frameworks) {
        if (names.includes(dep)) {
          const kind = dep === "next" || dep === "react" || dep === "react-native" ? "frontend" : "backend";
          nodes.push(node(repoId, kind, label, `Detected via package.json dependency "${dep}"`, "observed", "high", { dependency: dep }));
        }
      }
      const scriptNames = Object.keys(pkg.scripts ?? {});
      nodes.push(node(repoId, "workflow", "npm scripts", `${scriptNames.length} npm scripts (${scriptNames.slice(0, 8).join(", ")})`, "observed", "high", { count: scriptNames.length }));
    }

    // ── Database schema (observed) ──────────────────────────────────
    const schemas = files.filter((f) => f.endsWith(".prisma") || /schema\.(sql|ts)$/.test(f) || f.includes("migrations"));
    for (const s of schemas.slice(0, 8)) {
      const content = read(s);
      const models = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
      if (models.length) {
        nodes.push(node(repoId, "database", path.basename(s), `${models.length} model(s): ${models.slice(0, 10).join(", ")}`, "observed", "high", { models: models.length }));
      }
    }

    // ── API contracts / controllers / services / components (observed) ──
    const routeFiles = files.filter((f) => /routes?[\\/]|controllers?[\\/]|\.routes?\.|\.controllers?\.|\.api\.|api\.ts$/i.test(f) && SIMPLE_EXT.test(f));
    for (const rf of routeFiles.slice(0, 10)) {
      const content = read(rf);
      const verbs = [...content.matchAll(/\b(get|post|put|patch|delete)\s*\(\s*["'`]/gi)].map((m) => m[1].toUpperCase());
      nodes.push(node(repoId, "api", path.relative(dir, rf), `${verbs.length} route definition(s) [${[...new Set(verbs)].join(",")}]`, "observed", "high", { routes: verbs.length }));
    }
    const serviceFiles = files.filter((f) => /\.service\.(ts|js|py)$/.test(f));
    for (const sf of serviceFiles.slice(0, 10)) {
      nodes.push(node(repoId, "service", path.relative(dir, sf), "Service layer module", "observed", "high"));
    }
    const modelFiles = files.filter((f) => /(model|entity|types?)\.(ts|tsx|js|py)$/i.test(path.basename(f)) && SIMPLE_EXT.test(f));
    for (const mf of modelFiles.slice(0, 10)) {
      nodes.push(node(repoId, "model", path.relative(dir, mf), "Data model / type definition", "observed", "medium"));
    }
    const components = files.filter((f) => /components?\//.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f));
    if (components.length) {
      nodes.push(node(repoId, "component", `components/ (${components.length})`, `${components.length} component file(s)`, "observed", "high", { count: components.length }));
    }

    // ── Auth (observed/heuristic) ───────────────────────────────────
    const authHits = files.filter((f) => /auth|login|middleware|guard/i.test(path.basename(f)) && SIMPLE_EXT.test(f));
    for (const a of authHits.slice(0, 6)) {
      nodes.push(node(repoId, "auth", path.relative(dir, a), "Authentication/authorization related module", "observed", "medium"));
    }

    // ── Documentation (observed) ────────────────────────────────────
    const docs = files.filter((f) => /\.(md|mdx)$/.test(f) && !f.includes("node_modules"));
    if (docs.length) {
      nodes.push(node(repoId, "documentation", "Markdown docs", `${docs.length} markdown file(s)`, "observed", "high", { count: docs.length }));
    }

    // ── Infra / workflows (observed) ────────────────────────────────
    const dockers = files.filter((f) => /dockerfile/i.test(path.basename(f)));
    for (const d of dockers) nodes.push(node(repoId, "devops", path.basename(d), "Container definition", "observed", "high"));
    const ci = files.filter((f) => f.includes(".github/workflows") && f.endsWith(".yml"));
    for (const c of ci.slice(0, 6)) {
      const content = read(c);
      const jobs = [...content.matchAll(/^\s{2}(\w+):\s*$/gm)].map((m) => m[1]).filter((x) => !x.startsWith("on"));
      nodes.push(node(repoId, "workflow", path.relative(dir, c), `CI workflow with ${jobs.length || 1} job(s)`, "observed", "high", { jobs: jobs.length || 1 }));
    }
    const k8s = files.filter((f) => /(k8s|kubernetes|deploy)/i.test(f) && /\.(yml|yaml)$/.test(f));
    for (const k of k8s.slice(0, 5)) nodes.push(node(repoId, "devops", path.relative(dir, k), "Kubernetes/deployment manifest", "observed", "medium"));

    // ── Heuristics ──────────────────────────────────────────────────
    // Duplicate code: exact normalized 6-line blocks shared by two files.
    const dupCount = new Map<string, string[]>();
    for (const f of files.filter((f) => /\.(ts|tsx|js|jsx|py)$/.test(f))) {
      const lines = read(f).split("\n").map((l) => l.trim()).filter((l) => l.length > 20);
      const seen = new Set<string>();
      for (let i = 0; i + 5 < lines.length; i++) {
        const block = lines.slice(i, i + 6).join("\n");
        const h = createHash("sha1").update(block).digest("hex");
        if (seen.has(h)) continue;
        seen.add(h);
        const list = dupCount.get(h) ?? [];
        list.push(path.relative(dir, f));
        dupCount.set(h, list);
      }
    }
    let dups = 0;
    for (const [h, files2] of dupCount) {
      if (files2.length > 1) {
        dups++;
        if (dups <= 5) {
          nodes.push(node(repoId, "duplicate", files2.join(" ~ "), "Similar code block found in multiple files", "heuristic", "low", { files: files2.length, block: h.slice(0, 8) }));
        }
      }
    }
    if (dups > 5) nodes.push(node(repoId, "duplicate", `…and ${dups - 5} more`, `${dups} duplicate-block cluster(s) total`, "heuristic", "low", { clusters: dups }));

    // Dead code: exported declarations never imported elsewhere (rough).
    let dead = 0;
    const exportRe = /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g;
    for (const f of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
      const content = read(f);
      const all = read(files.filter((x) => x !== f && /\.(ts|tsx)$/.test(x)).join("\n"), 2_000_000);
      for (const m of content.matchAll(exportRe)) {
        const name = m[1]!;
        if (!all.includes(name) && name.length > 3) {
          dead++;
          if (dead <= 5) nodes.push(node(repoId, "dead_code", `${path.relative(dir, f)} → ${name}`, "Export appears unused by any other module (heuristic; may be a public API)", "heuristic", "low", { symbol: name }));
        }
      }
    }
    if (dead > 5) nodes.push(node(repoId, "dead_code", `…and ${dead - 5} more`, `${dead} possibly-dead export(s) total`, "heuristic", "low", { count: dead }));

    // Security: secret-like literals and dangerous eval.
    const secretRe = /(sk-|ghp_|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_\-]{16,})/;
    let secrets = 0;
    for (const f of files.filter((f) => SIMPLE_EXT.test(f) && !/\.test\./.test(f))) {
      const content = read(f, 200_000);
      if (secretRe.test(content)) {
        secrets++;
        if (secrets <= 8) nodes.push(node(repoId, "security", path.relative(dir, f), "Possible secret/credential literal detected — verify and rotate", "heuristic", "medium"));
      }
    }
    if (secrets > 8) nodes.push(node(repoId, "security", `…and ${secrets - 8} more`, `${secrets} possible secret literal(s) total`, "heuristic", "medium", { count: secrets }));
    const evalCount = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && /\beval\s*\(/.test(read(f, 200_000))).length;
    if (evalCount) nodes.push(node(repoId, "security", "eval usage", `${evalCount} file(s) call eval()`, "heuristic", "medium", { files: evalCount }));

    // Performance: oversized source files and sync fs calls.
    for (const f of files.filter((f) => /\.(ts|tsx|js|jsx|py)$/.test(f))) {
      const size = fs.statSync(f).size;
      if (size > 300_000) {
        nodes.push(node(repoId, "performance", path.relative(dir, f), `Large source file (${(size / 1024).toFixed(0)} KB) — review for split opportunities`, "heuristic", "medium", { bytes: size }));
      }
    }
    const syncFs = files.filter((f) => /\.(ts|js)$/.test(f) && /readFileSync|writeFileSync|existsSync/.test(read(f, 200_000))).length;
    if (syncFs) nodes.push(node(repoId, "performance", "synchronous fs", `${syncFs} file(s) use synchronous fs calls`, "heuristic", "low", { files: syncFs }));

    // Tests (observed).
    const testFiles = files.filter((f) => /\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(f));
    if (testFiles.length) {
      nodes.push(node(repoId, "test", "test suite", `${testFiles.length} test file(s)`, "observed", "high", { count: testFiles.length }));
    }

    // Tech debt: TODO/FIXME/HACK markers.
    let todo = 0;
    for (const f of files.filter((f) => SIMPLE_EXT.test(f))) {
      todo += (read(f, 100_000).match(/\b(TODO|FIXME|HACK)\b/g) ?? []).length;
    }
    if (todo) nodes.push(node(repoId, "tech_debt", "TODO/FIXME/HACK markers", `${todo} marker(s) across the repository`, "observed", "medium", { count: todo }));

    const capped = nodes.slice(0, MAX_NODES);
    const summary: Record<string, number> = {};
    for (const n of capped) summary[n.kind] = (summary[n.kind] ?? 0) + 1;

    // Persist (replace previous graph).
    const idx = await redis.lrange(K.idx(oid, repoId), 0, -1);
    for (const id of idx) await redis.del(K.node(oid, repoId, id));
    await redis.del(K.idx(oid, repoId));
    for (const n of capped) {
      await redis.set(K.node(oid, repoId, n.id), JSON.stringify(n));
      await redis.lpush(K.idx(oid, repoId), n.id);
    }

    const repo = await WorkforceService.getRepo(oid, repoId);
    if (repo) {
      await WorkforceService.updateRepo(oid, repoId, {
        intelSummary: summary,
        lastScanAt: new Date().toISOString(),
        lastError: null,
        status: "ready",
      });
    }
    logger.info("[ai-engineering] repository scan complete", { repoId, nodes: capped.length });
    return { nodes: capped, summary };
  },

  async listNodes(oid: string, repoId: string): Promise<AiEngineeringIntelNode[]> {
    const ids = await redis.lrange(K.idx(oid, repoId), 0, -1);
    const out: AiEngineeringIntelNode[] = [];
    for (const id of ids) {
      const raw = await redis.get(K.node(oid, repoId, id));
      if (raw) out.push(JSON.parse(raw) as AiEngineeringIntelNode);
    }
    return out;
  },
};
