/**
 * Session 84 — encrypted quarantine storage with retention controls.
 *
 * Quarantined project archives are re-encrypted with the Slice 112 AES-256-GCM
 * envelope (encryptString) and written as <id>.enc under the org quarantine
 * dir; the plaintext intake copy is removed. Retention = `quarantineExpiresAt`
 * (default PC_QUARANTINE_TTL_DAYS=30) enforced by an explicit sweep; a delete
 * endpoint removes file + record immediately.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { encryptString, decryptString } from "../security/encryption.js";
import { AppError } from "../utils/result.js";

export interface QuarantineDeps {
  rootDir: string;
  now?: () => number;
  readFile?: (p: string) => Promise<Buffer>;
  writeFile?: (p: string, data: Buffer) => Promise<void>;
  unlink?: (p: string) => Promise<void>;
}

export const quarantineDir = (deps: QuarantineDeps) => path.join(deps.rootDir, "quarantine");

function defaultDeps(): QuarantineDeps {
  const root = path.resolve(process.cwd(), "project-intake");
  return {
    rootDir: root,
    readFile: (p) => fs.readFile(p),
    writeFile: (p, d) => fs.writeFile(p, d, { mode: 0o600 }),
    unlink: (p) => fs.unlink(p).catch(() => undefined),
  };
}

export function quarantineTtlDays(): number {
  return Number(process.env.PC_QUARANTINE_TTL_DAYS ?? 30);
}

export function quarantinePath(orgId: string, projectId: string, deps: QuarantineDeps): string {
  return path.join(quarantineDir(deps), orgId, `${projectId}.enc`);
}

/**
 * Encrypts an intake archive in place: reads the plaintext archive, writes the
 * encrypted blob to the quarantine dir, removes the plaintext. Returns the
 * quarantine metadata (path + expiry).
 */
export async function quarantineArchive(
  orgId: string,
  projectId: string,
  archivePath: string,
  reason: string,
  deps: QuarantineDeps = defaultDeps(),
): Promise<{ path: string; encrypted: true; expiresAt: string; reason: string }> {
  const read = deps.readFile ?? ((p: string) => fs.readFile(p));
  const write = deps.writeFile ?? ((p: string, d: Buffer) => fs.writeFile(p, d, { mode: 0o600 }));
  const unlink = deps.unlink ?? ((p: string) => fs.unlink(p).catch(() => undefined));

  const buf = await read(archivePath).catch(() => {
    throw AppError.internal("Quarantine failed: archive file unreadable.");
  });
  const enc = encryptString(buf.toString("base64"));
  const target = quarantinePath(orgId, projectId, deps);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await write(target, Buffer.from(JSON.stringify(enc), "utf8"));
  await unlink(archivePath);

  const expiresAt = new Date((deps.now?.() ?? Date.now()) + quarantineTtlDays() * 86400_000).toISOString();
  return { path: target, encrypted: true, expiresAt, reason };
}

/** Reads + decrypts a quarantined archive (used by security review flows). */
export async function readQuarantinedArchive(
  orgId: string,
  projectId: string,
  deps: QuarantineDeps = defaultDeps(),
): Promise<Buffer> {
  const read = deps.readFile ?? ((p: string) => fs.readFile(p));
  const raw = await read(quarantinePath(orgId, projectId, deps)).catch(() => {
    throw AppError.notFound("Quarantined archive not found.");
  });
  try {
    const blob = JSON.parse(raw.toString("utf8"));
    const b64 = decryptString(blob);
    return Buffer.from(b64 ?? "", "base64");
  } catch {
    throw AppError.internal("Quarantined archive could not be decrypted.");
  }
}

/** Deletes a quarantined archive file immediately. */
export async function deleteQuarantinedArchive(
  orgId: string,
  projectId: string,
  deps: QuarantineDeps = defaultDeps(),
): Promise<void> {
  const unlink = deps.unlink ?? ((p: string) => fs.unlink(p).catch(() => undefined));
  await unlink(quarantinePath(orgId, projectId, deps));
}

/**
 * Retention sweep: given the org's project records, drops quarantine state for
 * every record whose quarantine expired. Returns the ids swept.
 */
export async function sweepExpiredQuarantine(
  orgId: string,
  records: Array<{ id: string; quarantine?: { expiresAt?: string } }>,
  deps: QuarantineDeps = defaultDeps(),
): Promise<string[]> {
  const now = deps.now?.() ?? Date.now();
  const swept: string[] = [];
  for (const rec of records) {
    if (!rec.quarantine?.expiresAt) continue;
    if (Date.parse(rec.quarantine.expiresAt) <= now) {
      await deleteQuarantinedArchive(orgId, rec.id, deps);
      swept.push(rec.id);
    }
  }
  return swept;
}
