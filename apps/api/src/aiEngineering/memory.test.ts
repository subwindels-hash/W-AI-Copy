/**
 * Session 124 — Engineering Memory tests.
 *
 * Pins CRUD, org/repo scoping, tag/kind/search filters and the
 * source-labelling rule (entries are created by people or recorded by the
 * orchestrator from tasks — never invented).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { EngineeringMemoryService } = await import("./memory.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

describe("engineering memory", () => {
  it("creates org-scoped and repo-scoped entries with their source", async () => {
    const orgEntry = await EngineeringMemoryService.create(ORG_A, {
      kind: "standard", scope: "org", title: "Use Zod for validation",
      body: "All API bodies are validated with shared Zod schemas.", tags: ["api", "zod"],
      source: "user", author: "u1",
    });
    expect(orgEntry.id.startsWith("aewm-")).toBe(true);
    expect(orgEntry.source).toBe("user");
    expect(orgEntry.repoId).toBeNull();

    const repoEntry = await EngineeringMemoryService.create(ORG_A, {
      kind: "pattern", scope: "repo", repoId: "aewr-1", title: "Repository pattern",
      body: "Services wrap Prisma.", tags: ["prisma"],
      source: "orchestrator", author: "orchestrator",
    });
    expect(repoEntry.repoId).toBe("aewr-1");

    await expect(
      EngineeringMemoryService.create(ORG_A, {
        kind: "lesson", scope: "repo", title: "Missing repo", body: "x", tags: [],
        source: "user", author: "u1",
      }),
    ).rejects.toThrow(/requires repoId/i);
  });

  it("filters by kind, tag, repo and search text, and stays org-isolated", async () => {
    await EngineeringMemoryService.create(ORG_A, { kind: "decision", scope: "org", title: "Adopt pnpm", body: "Workspaces use pnpm.", tags: ["tooling"], source: "user", author: "u1" });
    await EngineeringMemoryService.create(ORG_A, { kind: "bugfix", scope: "repo", repoId: "aewr-1", title: "Fix unread counts", body: "Exclude own messages.", tags: ["talk"], source: "task", author: "orchestrator" });
    await EngineeringMemoryService.create(ORG_A, { kind: "standard", scope: "org", title: "Commit style", body: "Conventional commits.", tags: ["git"], source: "user", author: "u1" });

    expect(await EngineeringMemoryService.list(ORG_A, { kind: "bugfix" })).toHaveLength(1);
    expect(await EngineeringMemoryService.list(ORG_A, { repoId: "aewr-1" })).toHaveLength(1);
    expect(await EngineeringMemoryService.list(ORG_A, { tag: "git" })).toHaveLength(1);
    expect(await EngineeringMemoryService.list(ORG_A, { search: "pnpm" })).toHaveLength(1);
    expect(await EngineeringMemoryService.list(ORG_A, { search: "unread" })).toHaveLength(1);
    expect(await EngineeringMemoryService.list(ORG_A)).toHaveLength(3);
    expect(await EngineeringMemoryService.list(ORG_B)).toHaveLength(0);
  });

  it("removes entries and 404s on unknown ids", async () => {
    const e = await EngineeringMemoryService.create(ORG_A, { kind: "instruction", scope: "org", title: "Review checklist", body: "Check authz.", tags: [], source: "user", author: "u1" });
    expect(await EngineeringMemoryService.remove(ORG_A, e.id)).toBe(true);
    expect(await EngineeringMemoryService.remove(ORG_A, e.id)).toBe(false);
    expect(await EngineeringMemoryService.list(ORG_A)).toHaveLength(0);
  });
});
