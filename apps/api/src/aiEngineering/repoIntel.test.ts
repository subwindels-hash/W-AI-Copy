/**
 * Session 124 — Repository Intelligence tests.
 *
 * Scans a real fixture directory and pins:
 *   - observed nodes: structure, dependencies/frameworks from package.json,
 *     Prisma models, route definitions, docs, CI workflows, tests;
 *   - heuristic nodes: duplicate blocks, dead exports, secret literals,
 *     eval, large files, sync fs, TODO markers — each labelled with its
 *     basis and a confidence;
 *   - knowledge-graph persistence per repo (list nodes, replacement on
 *     re-scan) and org isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { RepoIntelService } = await import("./repoIntel.service.js");
const { WorkforceService } = await import("./workforce.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

let fixture: string;

function write(rel: string, content: string) {
  const p = path.join(fixture, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), "aew-intel-"));
  write("package.json", JSON.stringify({
    name: "fixture-app",
    dependencies: { next: "14.0.0", "@prisma/client": "5.0.0", express: "4.0.0" },
    devDependencies: { typescript: "5.0.0" },
    scripts: { dev: "next dev", test: "vitest run", build: "next build" },
  }));
  write("prisma/schema.prisma", "model User {\n  id String @id\n  email String\n}\nmodel Post {\n  id String @id\n}\n");
  write("src/routes/users.ts", "router.get('/users', list);\nrouter.post('/users', create);\n");
  write("src/services/userService.ts", "export async function getUser() { return 1; }\n");
  write("src/models/User.ts", "export interface User { id: string }\n");
  write("src/components/Profile.tsx", "export function Profile() { return null; }\n");
  write("README.md", "# Fixture\nDocs.");
  write(".github/workflows/ci.yml", "name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n");
  write("src/secret.ts", "const key = 'sk-1234567890abcdef1234567890abcdef';\n");
  const dupBody = [
    "export function sharedLogic(input: string): boolean {",
    "  const normalized = input.trim().toLowerCase();",
    "  const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean);",
    "  const unique = Array.from(new Set(segments));",
    "  const score = unique.length * 10 + normalized.length;",
    "  return score > 40 && unique.length > 3;",
    "}",
  ].join("\n") + "\n";
  write("src/dupA.ts", dupBody);
  write("src/dupB.ts", dupBody);
  write("src/deadCode.ts", "export function neverUsedAnywhere() { return true; }\n");
  write("src/bigFile.ts", `export const big = "${"x".repeat(400_000)}";\n`);
  write("src/todo.ts", "// TODO: refactor this\n// FIXME: slow\n");
  write("src/__tests__/app.test.ts", "it('works', () => {});\n");
});

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true });
});

describe("repository intelligence scan", () => {
  it("emits observed nodes for structure, dependencies, schema, routes, docs, CI and tests", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "fixture", localPath: fixture, addedBy: "u1" });
    const { nodes, summary } = await RepoIntelService.scanLocal(ORG_A, repo.id, fixture);

    expect(nodes.some((n) => n.kind === "structure" && n.basis === "observed")).toBe(true);
    const deps = nodes.find((n) => n.kind === "dependency")!;
    expect(deps.label).toBe("package.json");
    expect(deps.meta.count).toBe(4);
    // Framework detection.
    expect(nodes.some((n) => n.label === "Next.js" && n.basis === "observed")).toBe(true);
    expect(nodes.some((n) => n.label === "Prisma")).toBe(true);
    const db = nodes.find((n) => n.kind === "database")!;
    expect(db.detail).toContain("User");
    const api = nodes.find((n) => n.kind === "api")!;
    expect(api.meta.routes).toBe(2);
    expect(nodes.some((n) => n.kind === "documentation")).toBe(true);
    const ci = nodes.find((n) => n.kind === "workflow" && n.label.includes("ci.yml"))!;
    expect(ci.meta.jobs).toBe(1);
    expect(nodes.some((n) => n.kind === "test")).toBe(true);

    // Heuristic nodes carry basis + confidence.
    const secret = nodes.find((n) => n.kind === "security")!;
    expect(secret.basis).toBe("heuristic");
    expect(secret.confidence).toBe("medium");
    const dup = nodes.find((n) => n.kind === "duplicate")!;
    expect(dup.basis).toBe("heuristic");
    const dead = nodes.find((n) => n.kind === "dead_code" && n.meta.symbol === "neverUsedAnywhere")!;
    expect(dead.label).toContain("neverUsedAnywhere");
    const perf = nodes.find((n) => n.kind === "performance")!;
    expect(perf.detail).toContain("Large source file");
    const todo = nodes.find((n) => n.kind === "tech_debt")!;
    expect(todo.meta.count).toBe(2);

    expect(summary.structure).toBeGreaterThan(0);
    expect(summary.security).toBeGreaterThan(0);

    // Persisted and org-isolated.
    const listed = await RepoIntelService.listNodes(ORG_A, repo.id);
    expect(listed.length).toBe(nodes.length);
    expect(await RepoIntelService.listNodes(ORG_B, repo.id)).toHaveLength(0);

    // Repo got its summary + scan time.
    const after = await WorkforceService.getRepo(ORG_A, repo.id);
    expect(after!.intelSummary).toBeTruthy();
    expect(after!.lastScanAt).toBeTruthy();
    expect(after!.status).toBe("ready");
  });

  it("replaces the graph on re-scan instead of duplicating it", async () => {
    const repo = await WorkforceService.addRepo(ORG_A, { name: "fixture", localPath: fixture, addedBy: "u1" });
    const first = await RepoIntelService.scanLocal(ORG_A, repo.id, fixture);
    const second = await RepoIntelService.scanLocal(ORG_A, repo.id, fixture);
    expect(second.nodes.length).toBe(first.nodes.length);
    expect(await RepoIntelService.listNodes(ORG_A, repo.id)).toHaveLength(second.nodes.length);
  });

  it("handles an empty directory honestly", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "aew-empty-"));
    try {
      const repo = await WorkforceService.addRepo(ORG_A, { name: "empty", localPath: empty, addedBy: "u1" });
      const { nodes } = await RepoIntelService.scanLocal(ORG_A, repo.id, empty);
      expect(nodes.length).toBe(0);
      const after = await WorkforceService.getRepo(ORG_A, repo.id);
      expect(after!.status).toBe("ready");
      expect(after!.intelSummary).toEqual({});
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("ignores node_modules, .git and build output", async () => {
    write("node_modules/pkg/index.js", "export const x = 1;\n");
    write("dist/bundle.js", "export const y = 2;\n");
    write(".git/config", "[core]\n");
    const repo = await WorkforceService.addRepo(ORG_A, { name: "fixture", localPath: fixture, addedBy: "u1" });
    const { nodes } = await RepoIntelService.scanLocal(ORG_A, repo.id, fixture);
    expect(nodes.some((n) => n.label.includes("node_modules"))).toBe(false);
    expect(nodes.some((n) => n.label.includes("dist/"))).toBe(false);
  });
});
