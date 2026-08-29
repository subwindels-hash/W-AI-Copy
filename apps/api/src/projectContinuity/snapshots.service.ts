/**
 * Session 84 — change control: snapshots, diffs, rollback points (S84.10).
 *
 * A snapshot = file manifest (path, size, sha256) of the extracted workspace +
 * a byte copy of the intake archive (so rollback can restore the exact source).
 * Diff compares two manifests; rollback restores the snapshot archive and
 * resets the project to "accepted" (re-extract rebuilds the workspace), then
 * records the change in the project's append-only change log.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import type { PcChangeLogEntry, PcDiffResult, PcManifestEntry, PcSnapshot } from "@windels/shared";

export interface SnapshotDeps {
  rootDir: string;
  kv: Pick<typeof redis, "get" | "set" | "del" | "lpush" | "ltrim" | "lrange" | "zadd" | "zrange">;
  now?: () => number;
  readFile?: (p: string) => Promise<Buffer>;
  writeFile?: (p: string, data: Buffer) => Promise<void>;
  copyFile?: (src: string, dst: string) => Promise<void>;
  walk?: (root: string) => Promise<string[]>;
}

const MAX_MANIFEST_FILES = 20_000;

const K = {
  snapshots: (org: string, projectId: string) => `project84:${org}:snapshots:${projectId}`,
  snapshot: (org: string, projectId: string, id: string) => `project84:${org}:snapshot:${projectId}:${id}`,
  changelog: (org: string, projectId: string) => `project84:${org}:changelog:${projectId}`,
};

function defaultDeps(): SnapshotDeps {
  const root = path.resolve(process.cwd(), "project-intake");
  return { rootDir: root, kv: redis as unknown as SnapshotDeps["kv"] };
}

async function listFilesRecursive(dir: string, base: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await listFilesRecursive(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full));
  }
}

/** Builds a workspace manifest (path, size, sha256). Capped; skips .git/node_modules/dist. */
export async function buildManifest(workspacePath: string, deps: SnapshotDeps = defaultDeps(), maxFiles = MAX_MANIFEST_FILES): Promise<PcManifestEntry[]> {
  const walk = deps.walk ?? ((root: string) => { const out: string[] = []; return listFilesRecursive(root, root, out).then(() => out); });
  const read = deps.readFile ?? ((p: string) => fs.readFile(p));
  const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "target", ".venv", "__pycache__"]);
  const files = (await walk(workspacePath))
    .filter((f) => !ignored.has(f.split(/[\\/]/)[0] ?? ""))
    .slice(0, maxFiles);
  const out: PcManifestEntry[] = [];
  for (const rel of files) {
    const buf = await read(path.join(workspacePath, rel)).catch(() => null);
    if (!buf) continue;
    out.push({ path: rel, size: buf.byteLength, sha256: createHash("sha256").update(buf).digest("hex") });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createSnapshot(
  orgId: string,
  projectId: string,
  actorId: string,
  opts: { workspacePath: string; archivePath: string; note?: string },
  deps: SnapshotDeps = defaultDeps(),
): Promise<PcSnapshot> {
  const now = deps.now?.() ?? Date.now();
  const manifest = await buildManifest(opts.workspacePath, deps);
  const id = `snap-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const archiveSnapshotPath = path.join(deps.rootDir, orgId, projectId, "snapshots", `${id}.bin`);
  const copy = deps.copyFile ?? ((s, d) => fs.copyFile(s, d));
  await fs.mkdir(path.dirname(archiveSnapshotPath), { recursive: true });
  await copy(opts.archivePath, archiveSnapshotPath);

  const snap: PcSnapshot = {
    id,
    projectId,
    createdAt: new Date(now).toISOString(),
    actorId,
    files: manifest.length,
    totalBytes: manifest.reduce((s, m) => s + m.size, 0),
    archiveSnapshotPath,
    ...(opts.note ? { note: opts.note } : {}),
  };
  await deps.kv.set(K.snapshot(orgId, projectId, id), JSON.stringify(snap));
  await deps.kv.zadd(K.snapshots(orgId, projectId), now, id);
  await deps.kv.set(`${K.snapshot(orgId, projectId, id)}:manifest`, JSON.stringify(manifest));
  await appendChangelog(orgId, projectId, actorId, "snapshot", `snapshot ${id} — ${manifest.length} files, ${Math.round(snap.totalBytes / 1024)} KB`, deps);
  return snap;
}

export async function listSnapshots(orgId: string, projectId: string, deps: SnapshotDeps = defaultDeps()): Promise<PcSnapshot[]> {
  const ids = await deps.kv.zrange(K.snapshots(orgId, projectId), 0, -1, "REV");
  const out: PcSnapshot[] = [];
  for (const id of ids) {
    const raw = await deps.kv.get(K.snapshot(orgId, projectId, id));
    if (raw) out.push(JSON.parse(raw) as PcSnapshot);
  }
  return out;
}

async function loadManifest(orgId: string, projectId: string, snapshotId: string, deps: SnapshotDeps): Promise<PcManifestEntry[]> {
  const raw = await deps.kv.get(`${K.snapshot(orgId, projectId, snapshotId)}:manifest`);
  if (!raw) throw AppError.notFound("Snapshot not found");
  return JSON.parse(raw) as PcManifestEntry[];
}

export async function diffSnapshots(
  orgId: string,
  projectId: string,
  fromId: string,
  toId: string,
  deps: SnapshotDeps = defaultDeps(),
): Promise<PcDiffResult> {
  const from = await loadManifest(orgId, projectId, fromId, deps);
  const to = await loadManifest(orgId, projectId, toId, deps);
  const fromMap = new Map(from.map((m) => [m.path, m]));
  const toMap = new Map(to.map((m) => [m.path, m]));
  const entries: PcDiffResult["entries"] = [];
  for (const m of to) {
    const prev = fromMap.get(m.path);
    if (!prev) entries.push({ path: m.path, kind: "added", to: { size: m.size, sha256: m.sha256 } });
    else if (prev.size !== m.size || prev.sha256 !== m.sha256) entries.push({ path: m.path, kind: "changed", from: { size: prev.size, sha256: prev.sha256 }, to: { size: m.size, sha256: m.sha256 } });
  }
  for (const m of from) {
    if (!toMap.has(m.path)) entries.push({ path: m.path, kind: "removed", from: { size: m.size, sha256: m.sha256 } });
  }
  return {
    fromSnapshot: fromId,
    toSnapshot: toId,
    added: entries.filter((e) => e.kind === "added").length,
    removed: entries.filter((e) => e.kind === "removed").length,
    changed: entries.filter((e) => e.kind === "changed").length,
    entries: entries.slice(0, 500),
  };
}

/**
 * Rollback: restores the snapshot archive as the project's active archive and
 * resets the project to "accepted" (extraction state cleared). The workspace is
 * removed; the caller re-extracts to rebuild it from the restored archive.
 */
export async function rollbackToSnapshot(
  orgId: string,
  projectId: string,
  snapshotId: string,
  actorId: string,
  archivePath: string,
  workspacePath: string,
  deps: SnapshotDeps = defaultDeps(),
): Promise<{ restored: boolean; snapshotId: string; note: string }> {
  const raw = await deps.kv.get(K.snapshot(orgId, projectId, snapshotId));
  if (!raw) throw AppError.notFound("Snapshot not found");
  const snap = JSON.parse(raw) as PcSnapshot;
  const copy = deps.copyFile ?? ((s, d) => fs.copyFile(s, d));
  await copy(snap.archiveSnapshotPath, archivePath);
  await fs.rm(workspacePath, { recursive: true, force: true });
  await appendChangelog(orgId, projectId, actorId, "rollback", `rolled back to snapshot ${snapshotId} (${snap.files} files)`, deps);
  return { restored: true, snapshotId, note: "Archive restored to snapshot state; re-extract to rebuild the workspace." };
}

export async function appendChangelog(
  orgId: string,
  projectId: string,
  actorId: string,
  action: PcChangeLogEntry["action"],
  summary: string,
  deps: SnapshotDeps = defaultDeps(),
): Promise<void> {
  const entry: PcChangeLogEntry = { id: `cl-${randomUUID().replace(/-/g, "").slice(0, 12)}`, at: new Date().toISOString(), actorId, action, summary };
  await deps.kv.lpush(K.changelog(orgId, projectId), JSON.stringify(entry));
  await deps.kv.ltrim(K.changelog(orgId, projectId), 0, 199);
}

export async function listChangelog(orgId: string, projectId: string, deps: SnapshotDeps = defaultDeps()): Promise<PcChangeLogEntry[]> {
  const raw = await deps.kv.lrange(K.changelog(orgId, projectId), 0, 199);
  return raw.map((r) => JSON.parse(r) as PcChangeLogEntry);
}
