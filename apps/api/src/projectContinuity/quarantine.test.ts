/**
 * Encrypted quarantine — round-trip, delete, retention sweep. In-memory deps.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { quarantineArchive, readQuarantinedArchive, deleteQuarantinedArchive, sweepExpiredQuarantine, type QuarantineDeps } from "./quarantine.service.js";

describe("quarantine", () => {
  let dir: string;
  let deps: QuarantineDeps;
  let clock: number;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "windels-q-"));
    clock = 1_000_000_000_000;
    deps = { rootDir: dir, now: () => clock };
  });

  it("encrypts the archive, removes plaintext, and round-trips", async () => {
    const archivePath = path.join(dir, "archive.bin");
    await fs.writeFile(archivePath, Buffer.from("SECRET-SOURCE-BYTES"));

    const q = await quarantineArchive("org-a", "proj-1", archivePath, "secret detected", deps);
    expect(q.encrypted).toBe(true);
    expect(q.path).toContain("quarantine");
    expect(q.expiresAt).toBeTruthy();
    // Plaintext is gone; the encrypted blob is stored.
    await expect(fs.access(archivePath)).rejects.toThrow();
    const raw = await fs.readFile(q.path, "utf8");
    expect(raw).not.toContain("SECRET-SOURCE-BYTES");

    const back = await readQuarantinedArchive("org-a", "proj-1", deps);
    expect(back.toString()).toBe("SECRET-SOURCE-BYTES");
  });

  it("deletes the encrypted file on demand", async () => {
    const archivePath = path.join(dir, "archive.bin");
    await fs.writeFile(archivePath, Buffer.from("x"));
    const q = await quarantineArchive("org-a", "proj-2", archivePath, "r", deps);
    await deleteQuarantinedArchive("org-a", "proj-2", deps);
    await expect(fs.access(q.path)).rejects.toThrow();
  });

  it("sweep drops expired quarantine records only", async () => {
    const a = path.join(dir, "a.bin");
    await fs.writeFile(a, Buffer.from("x"));
    await quarantineArchive("org-a", "expired", a, "r", deps);
    // Advance clock beyond the TTL (30 days default).
    clock += 31 * 86400_000;
    const b = path.join(dir, "b.bin");
    await fs.writeFile(b, Buffer.from("y"));
    await quarantineArchive("org-a", "fresh", b, "r", deps);

    const swept = await sweepExpiredQuarantine("org-a", [
      { id: "expired", quarantine: { expiresAt: new Date(clock - 86400_000).toISOString() } },
      { id: "fresh", quarantine: { expiresAt: new Date(clock + 86400_000).toISOString() } },
    ], deps);
    expect(swept).toEqual(["expired"]);
    // The expired file is gone; the fresh file remains.
    const freshPath = path.join(dir, "quarantine", "org-a", "fresh.enc");
    await expect(fs.access(freshPath)).resolves.toBeUndefined();
    const expiredPath = path.join(dir, "quarantine", "org-a", "expired.enc");
    await expect(fs.access(expiredPath)).rejects.toThrow();
  });
});
