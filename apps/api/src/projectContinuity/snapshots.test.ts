/**
 * Change control — snapshots, manifest diffs, rollback. Temp dirs + FakeKv.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSnapshot, listSnapshots, diffSnapshots, rollbackToSnapshot, buildManifest, listChangelog } from "./snapshots.service.js";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import type { SnapshotDeps } from "./snapshots.service.js";

const ORG = "org-snap";
const PROJ = "proj-1";
const ACTOR = "user-1";

describe("snapshots / diff / rollback", () => {
  let dir: string;
  let workspace: string;
  let archivePath: string;
  let kv: FakeKv;
  let deps: SnapshotDeps;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "windels-snap-"));
    workspace = path.join(dir, "workspace");
    archivePath = path.join(dir, "archive.bin");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(archivePath, Buffer.from("ARCHIVE-V1"));
    kv = new FakeKv();
    deps = { rootDir: dir, kv: kv as any, now: () => 1_000_000 };
  });

  async function writeWorkspace(files: Record<string, string>) {
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(workspace, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content);
    }
  }

  it("creates a manifest + snapshot and lists them newest-first", async () => {
    await writeWorkspace({ "src/main.ts": "export const a = 1", "README.md": "docs" });
    const snap = await createSnapshot(ORG, PROJ, ACTOR, { workspacePath: workspace, archivePath, note: "initial" }, deps);
    expect(snap.files).toBe(2);
    expect(snap.archiveSnapshotPath).toContain("snapshots");
    await expect(fs.access(snap.archiveSnapshotPath)).resolves.toBeUndefined();
    expect((await listSnapshots(ORG, PROJ, deps)).map((s) => s.id)).toEqual([snap.id]);
    const manifest = await buildManifest(workspace, deps);
    expect(manifest.find((m) => m.path === "src/main.ts")?.sha256).toHaveLength(64);
  });

  it("diffs added/removed/changed between two snapshots", async () => {
    await writeWorkspace({ "a.ts": "v1", "b.ts": "same" });
    const s1 = await createSnapshot(ORG, PROJ, ACTOR, { workspacePath: workspace, archivePath }, deps);
    await writeWorkspace({ "a.ts": "v2 changed", "c.ts": "new" });
    const s2 = await createSnapshot(ORG, PROJ, ACTOR, { workspacePath: workspace, archivePath }, deps);

    const diff = await diffSnapshots(ORG, PROJ, s1.id, s2.id, deps);
    expect(diff.added).toBe(1);
    expect(diff.changed).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.entries.find((e) => e.path === "b.ts")?.kind).toBe("removed");
    expect(diff.entries.find((e) => e.path === "a.ts")?.kind).toBe("changed");
  });

  it("rollback restores the snapshot archive and resets the workspace", async () => {
    await writeWorkspace({ "a.ts": "v1" });
    const snap = await createSnapshot(ORG, PROJ, ACTOR, { workspacePath: workspace, archivePath }, deps);
    // Mutate the active archive + workspace.
    await fs.writeFile(archivePath, Buffer.from("ARCHIVE-V2"));
    await writeWorkspace({ "a.ts": "v2", "b.ts": "extra" });

    const out = await rollbackToSnapshot(ORG, PROJ, snap.id, ACTOR, archivePath, workspace, deps);
    expect(out.restored).toBe(true);
    expect((await fs.readFile(archivePath)).toString()).toBe("ARCHIVE-V1");
    await expect(fs.access(workspace)).rejects.toThrow();
  });

  it("records every action in the change log", async () => {
    await writeWorkspace({ "a.ts": "x" });
    await createSnapshot(ORG, PROJ, ACTOR, { workspacePath: workspace, archivePath }, deps);
    const log = await listChangelog(ORG, PROJ, deps);
    expect(log[0]?.action).toBe("snapshot");
    expect(log[0]?.actorId).toBe(ACTOR);
  });
});
