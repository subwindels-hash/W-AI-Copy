/**
 * Browser-side direct upload — storage naming, metadata records, list/delete.
 * Runs fully in-memory: FakeKv replaces Redis, a temp dir replaces disk.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveUpload, listUploads, deleteUploadFile, storageName, type UploadDeps } from "./uploads.js";
import { FakeKv } from "./fakeKv.js";

const OID = "org-up";
const UID = "user-up";

describe("storageName", () => {
  it("maps known mime types to extensions", () => {
    expect(storageName("video/mp4", "x.weird")).toMatch(/^[0-9a-f]{32}\.mp4$/);
    expect(storageName("image/png", "x")).toMatch(/\.png$/);
  });
  it("falls back to an allowlisted original extension and rejects everything else", () => {
    expect(storageName("application/octet-stream", "clip.MOV")).toMatch(/\.mov$/);
    expect(storageName("application/pdf", "doc.pdf")).toBeNull();
    expect(storageName("text/plain", "notes.txt")).toBeNull();
  });
});

describe("upload persistence", () => {
  let kv: FakeKv;
  let dir: string;
  let deps: UploadDeps;

  beforeEach(async () => {
    kv = new FakeKv();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "windels-upload-"));
    deps = { kv: kv as any, dir, now: () => 1_000_000 };
  });

  it("saves a file to disk and records org-scoped metadata", async () => {
    const rec = await saveUpload(OID, UID, { buffer: Buffer.from("mp4-bytes"), mimetype: "video/mp4", originalname: "briefing.mp4", size: 9 }, deps);
    expect(rec.url).toBe(`/api/v1/media-factory/render/${rec.file}`);
    expect(rec.fileName).toBe("briefing.mp4");
    expect(rec.sizeBytes).toBe(9);
    const onDisk = await fs.readFile(path.join(dir, rec.file));
    expect(onDisk.toString()).toBe("mp4-bytes");

    const listed = await listUploads(OID, 10, deps);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.url).toBe(rec.url);
  });

  it("rejects empty uploads and non video/image types", async () => {
    await expect(saveUpload(OID, UID, { buffer: Buffer.alloc(0), mimetype: "video/mp4", originalname: "e.mp4", size: 0 }, deps)).rejects.toThrow(/empty/i);
    await expect(saveUpload(OID, UID, { buffer: Buffer.from("x"), mimetype: "application/pdf", originalname: "doc.pdf", size: 1 }, deps)).rejects.toThrow(/unsupported media type/i);
  });

  it("deletes the disk file and metadata", async () => {
    const rec = await saveUpload(OID, UID, { buffer: Buffer.from("x"), mimetype: "image/png", originalname: "img.png", size: 1 }, deps);
    await deleteUploadFile(OID, rec.file, deps);
    expect(await listUploads(OID, 10, deps)).toHaveLength(0);
    await expect(fs.access(path.join(dir, rec.file))).rejects.toThrow();
  });

  it("orders listings newest-first and skips corrupt metadata", async () => {
    await saveUpload(OID, UID, { buffer: Buffer.from("a"), mimetype: "image/png", originalname: "a.png", size: 1 }, { ...deps, now: () => 1_000 });
    await saveUpload(OID, UID, { buffer: Buffer.from("b"), mimetype: "image/png", originalname: "b.png", size: 1 }, { ...deps, now: () => 2_000 });
    await kv.set(`pub:${OID}:upload:zzz`, "not-json");
    const listed = await listUploads(OID, 10, deps);
    expect(listed.map((u) => u.fileName)).toEqual(["b.png", "a.png"]);
  });
});
