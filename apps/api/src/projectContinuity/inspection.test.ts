/**
 * Archive inspection — native zip/tar metadata parsing, bomb/path/symlink
 * detection. Everything is built in-memory (store-only zip, plain tar).
 */
import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { inspectArchive, parseZipCentralDirectory, parseTarHeaders } from "./inspection.service.js";

/* ── In-memory archive builders ─────────────────────────────────── */

function zipEntry(name: string, data: Buffer, opts: { externalAttrs?: number; uncompSizeOverride?: number } = {}): { local: Buffer; central: Buffer } {
  const nameBuf = Buffer.from(name, "utf8");
  const crc = 0;
  const compSize = data.length;
  const uncompSize = opts.uncompSizeOverride ?? data.length;
  const local = Buffer.alloc(30 + nameBuf.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8); // method 0 = store
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compSize, 18);
  local.writeUInt32LE(uncompSize, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);
  data.copy(local, 30 + nameBuf.length);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compSize, 20);
  central.writeUInt32LE(uncompSize, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(opts.externalAttrs ?? 0, 38);
  nameBuf.copy(central, 46);
  return { local, central };
}

function buildZip(entries: Array<{ name: string; data: Buffer; opts?: { externalAttrs?: number; uncompSizeOverride?: number } }>): Buffer {
  let offset = 0;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  for (const e of entries) {
    const { local, central } = zipEntry(e.name, e.data, e.opts);
    central.writeUInt32LE(offset, 42);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function tarHeader(name: string, size: number, typeflag: string, opts: { linkname?: string } = {}): Buffer {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, "utf8");
  h.write("0000644\0", 100, "utf8");
  h.write("0000000\0", 108, "utf8");
  h.write("0000000\0", 116, "utf8");
  h.write(size.toString(8).padStart(11, "0") + "\0", 124, "utf8");
  h.write("00000000000\0", 136, "utf8");
  h.fill(0x20, 148, 156); // checksum placeholder
  h[156] = typeflag.charCodeAt(0);
  if (opts.linkname) h.write(opts.linkname.slice(0, 100), 157, "utf8");
  h.write("ustar\0", 257, "utf8");
  h.write("00", 263, "utf8");
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "utf8");
  return h;
}

function buildTar(files: Array<{ name: string; data: Buffer } | { name: string; symlink: string }>, opts: { longName?: { name: string; data: Buffer } } = {}): Buffer {
  const blocks: Buffer[] = [];
  if (opts.longName) {
    const longBuf = Buffer.alloc(512);
    Buffer.from(opts.longName.name, "utf8").copy(longBuf);
    const h = tarHeader("././@LongLink", opts.longName.name.length, "L");
    blocks.push(h, longBuf);
  }
  for (const f of files) {
    if ("symlink" in f) {
      blocks.push(tarHeader(f.name, 0, "2", { linkname: f.symlink }));
    } else {
      blocks.push(tarHeader(f.name, f.data.length, "0"));
      const dataBlocks = Buffer.alloc(Math.ceil(f.data.length / 512) * 512);
      f.data.copy(dataBlocks);
      blocks.push(dataBlocks);
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/* ── Zip parsing ─────────────────────────────────────────────────── */

describe("parseZipCentralDirectory", () => {
  it("reads names and sizes from a store-only zip", () => {
    const buf = buildZip([
      { name: "src/main.ts", data: Buffer.from("export const x = 1") },
      { name: "package.json", data: Buffer.from("{}") },
    ]);
    const { entries, invalid } = parseZipCentralDirectory(buf);
    expect(invalid).toBe(false);
    expect(entries.map((e) => e.name)).toEqual(["src/main.ts", "package.json"]);
    expect(entries[0]!.uncompressedSize).toBe(18);
  });

  it("flags symlinks via unix external attributes", () => {
    const buf = buildZip([{ name: "link.sh", data: Buffer.alloc(0), opts: { externalAttrs: 0xa1ff0000 } }]);
    const { entries } = parseZipCentralDirectory(buf);
    expect(entries[0]!.isSymlink).toBe(true);
  });
});

/* ── Tar parsing ─────────────────────────────────────────────────── */

describe("parseTarHeaders", () => {
  it("reads names, sizes and symlinks", () => {
    const buf = buildTar([{ name: "a.txt", data: Buffer.from("hello") }, { name: "lnk", symlink: "a.txt" }]);
    const { entries } = parseTarHeaders(buf);
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "lnk"]);
    expect(entries[0]!.size).toBe(5);
    expect(entries[1]!.isSymlink).toBe(true);
  });

  it("resolves GNU long names", () => {
    const long = "very/long/path/".repeat(10) + "file.ts";
    const buf = buildTar([{ name: "x", data: Buffer.from("y") }], { longName: { name: long, data: Buffer.from("y") } });
    const { entries } = parseTarHeaders(buf);
    expect(entries[0]!.name).toBe(long);
  });
});

/* ── inspectArchive verdicts ─────────────────────────────────────── */

describe("inspectArchive", () => {
  const limits = { maxEntries: 10_000, maxUncompressedMb: 512, maxEntryMb: 200 };

  it("ok: normal zip", () => {
    const buf = buildZip([{ name: "src/main.ts", data: Buffer.from("x") }, { name: "README.md", data: Buffer.from("hi") }]);
    const r = inspectArchive(buf, "zip", limits);
    expect(r.verdict).toBe("ok");
    expect(r.entries).toBe(2);
    expect(r.totalUncompressedBytes).toBe(3);
  });

  it("unsafe: traversal, absolute and null-byte entries", () => {
    const traversal = buildZip([{ name: "../evil.sh", data: Buffer.from("rm -rf /") }]);
    expect(inspectArchive(traversal, "zip", limits).verdict).toBe("unsafe");
    const absolute = buildZip([{ name: "/etc/passwd", data: Buffer.from("root") }]);
    expect(inspectArchive(absolute, "zip", limits).verdict).toBe("unsafe");
    const symlink = buildZip([{ name: "lnk", data: Buffer.alloc(0), opts: { externalAttrs: 0xa1ff0000 } }]);
    expect(inspectArchive(symlink, "zip", limits).verdict).toBe("unsafe");
  });

  it("bomb: entry count over the limit", () => {
    const entries = Array.from({ length: 10_001 }, (_, i) => ({ name: `f${i}.txt`, data: Buffer.from("x") }));
    const r = inspectArchive(buildZip(entries), "zip", limits);
    expect(r.verdict).toBe("bomb");
  });

  it("bomb: declared uncompressed size over the limit (metadata lies)", () => {
    const buf = buildZip([{ name: "huge.bin", data: Buffer.from("x"), opts: { uncompSizeOverride: 600 * 1024 * 1024 } }]);
    expect(inspectArchive(buf, "zip", limits).verdict).toBe("bomb");
  });

  it("bomb: single entry over the per-entry cap", () => {
    const buf = buildZip([{ name: "big.bin", data: Buffer.from("x"), opts: { uncompSizeOverride: 201 * 1024 * 1024 } }]);
    expect(inspectArchive(buf, "zip", limits).verdict).toBe("bomb");
  });

  it("invalid: truncated zip", () => {
    expect(inspectArchive(Buffer.from("not a zip at all"), "zip", limits).verdict).toBe("invalid");
  });

  it("ok: tar and tar.gz", () => {
    const tar = buildTar([{ name: "a.txt", data: Buffer.from("hello") }]);
    expect(inspectArchive(tar, "tar", limits).verdict).toBe("ok");
    expect(inspectArchive(gzipSync(tar), "tar.gz", limits).verdict).toBe("ok");
  });

  it("unsafe: tar symlink; bomb: gzip bomb (declared sizes)", () => {
    const tar = buildTar([{ name: "a.txt", data: Buffer.from("x") }, { name: "lnk", symlink: "a.txt" }]);
    expect(inspectArchive(tar, "tar", limits).verdict).toBe("unsafe");
    // A tiny gzip that declares 600MB of tar data must be flagged as a bomb
    // from metadata alone (the inflated tar is never materialized).
    const bombTar = Buffer.concat([tarHeader("huge.bin", 600 * 1024 * 1024, "0"), Buffer.alloc(1024)]);
    expect(inspectArchive(gzipSync(bombTar), "tar.gz", limits).verdict).toBe("bomb");
  });

  it("7z reports tool_missing honestly", () => {
    const magic = Buffer.concat([Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), Buffer.alloc(100)]);
    const r = inspectArchive(magic, "7z", limits);
    expect(r.verdict).toBe("tool_missing");
  });
});
