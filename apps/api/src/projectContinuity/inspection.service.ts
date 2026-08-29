/**
 * Session 84 — streaming archive inspection.
 *
 * Reads ONLY archive metadata (zip central directory / tar header blocks) to
 * enforce entry-count and uncompressed-size limits BEFORE any extraction, and
 * to flag unsafe entry paths (traversal, absolute, null bytes, symlinks).
 * No archive content is ever written to disk here.
 */
import { gunzipSync } from "node:zlib";
import type { PcArchiveInspection } from "@windels/shared";

export interface InspectionLimits {
  maxEntries: number;
  maxUncompressedMb: number;
  maxEntryMb: number;
}

export function defaultLimits(): InspectionLimits {
  return {
    maxEntries: Number(process.env.PC_MAX_ENTRIES ?? 10_000),
    maxUncompressedMb: Number(process.env.PC_MAX_UNCOMPRESSED_MB ?? 512),
    maxEntryMb: Number(process.env.PC_MAX_ENTRY_MB ?? 200),
  };
}

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const TAR_BLOCK = 512;

function u16(b: Buffer, off: number): number { return b.readUInt16LE(off); }
function u32(b: Buffer, off: number): number { return b.readUInt32LE(off); }
function u64(b: Buffer, off: number): number { return Number(b.readBigUInt64LE(off)); }

/** Finds the zip End-Of-Central-Directory record (search from the end). */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD) return i;
  }
  return -1;
}

export interface ZipEntryMeta { name: string; uncompressedSize: number; isDir: boolean; isSymlink: boolean }

/** Parses the zip central directory (metadata only). */
export function parseZipCentralDirectory(buf: Buffer): { entries: ZipEntryMeta[]; invalid: boolean } {
  const eocd = findEocd(buf);
  if (eocd < 0) return { entries: [], invalid: true };
  const totalEntries = u16(buf, eocd + 10);
  const cdOffset = u32(buf, eocd + 16);
  const cdSize = u32(buf, eocd + 12);
  if (cdOffset + cdSize > buf.length) return { entries: [], invalid: true };

  const entries: ZipEntryMeta[] = [];
  let p = cdOffset;
  const end = cdOffset + cdSize;
  for (let n = 0; n < totalEntries && p + 46 <= end; n++) {
    if (buf.readUInt32LE(p) !== ZIP_CENTRAL) return { entries, invalid: true };
    const compSize = u32(buf, p + 20);
    const uncompSize = u32(buf, p + 24);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const externalAttrs = u32(buf, p + 38);
    const nameStart = p + 46;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf8");
    const isDir = name.endsWith("/") || (uncompSize === 0 && name.endsWith("/"));
    const isSymlink = (externalAttrs >>> 16) === 0xa1ff || ((externalAttrs >>> 16) & 0xf000) === 0xa000; // 0xA1FF = symlink on most tools
    entries.push({ name, uncompressedSize: uncompSize, isDir, isSymlink });
    p = nameStart + nameLen + extraLen + commentLen;
    void compSize;
  }
  return { entries, invalid: false };
}

export interface TarEntryMeta { name: string; size: number; isDir: boolean; isSymlink: boolean }

/** Parses tar header blocks (metadata only); supports GNU long-name records. */
export function parseTarHeaders(buf: Buffer): { entries: TarEntryMeta[]; invalid: boolean } {
  const entries: TarEntryMeta[] = [];
  let p = 0;
  let pendingLongName: string | null = null;
  while (p + TAR_BLOCK <= buf.length) {
    const block = buf.subarray(p, p + TAR_BLOCK);
    // Two zero blocks = end of archive.
    if (block.every((b) => b === 0)) break;
    const name = block.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeRaw = block.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = /^[0-7]+$/.test(sizeRaw) ? parseInt(sizeRaw, 8) : 0;
    const typeflag = String.fromCharCode(block[156] ?? 0);
    const isDir = typeflag === "5" || name.endsWith("/");
    const isSymlink = typeflag === "2";
    if (typeflag === "L") {
      // GNU long name: next block holds the name (padded to 512).
      const longBuf = buf.subarray(p + TAR_BLOCK, p + 2 * TAR_BLOCK);
      pendingLongName = longBuf.subarray(0, size).toString("utf8").replace(/\0.*$/, "");
      p += TAR_BLOCK * 2;
      continue;
    }
    entries.push({
      name: pendingLongName ?? name,
      size,
      isDir,
      isSymlink,
    });
    pendingLongName = null;
    // Advance by header + data blocks (data may be absent for dirs/symlinks).
    p += TAR_BLOCK + (isDir || isSymlink || size === 0 ? 0 : Math.ceil(size / TAR_BLOCK) * TAR_BLOCK);
  }
  return { entries, invalid: false };
}

function unsafeReason(name: string): string | null {
  if (!name) return "empty entry name";
  if (name.includes("\0")) return "null byte in path";
  if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) return "absolute path";
  if (name.split(/[\\/]+/).includes("..")) return "path traversal (..)";
  return null;
}

/**
 * Inspects an archive buffer without extracting. Verdicts:
 *  - "ok": within limits, no unsafe entries
 *  - "bomb": entry count or uncompressed size exceeds limits
 *  - "unsafe": contains traversal/absolute/null/symlink entries
 *  - "invalid": archive metadata unreadable
 *  - "tool_missing": no native parser for this kind (7z)
 */
export function inspectArchive(buffer: Buffer, kind: string, limits: InspectionLimits = defaultLimits()): PcArchiveInspection {
  const maxUncompressedBytes = limits.maxUncompressedMb * 1024 * 1024;
  const maxEntryBytes = limits.maxEntryMb * 1024 * 1024;
  const base: Omit<PcArchiveInspection, "verdict" | "unsafeEntries" | "note"> = {
    inspectedAt: new Date().toISOString(),
    kind,
    entries: 0,
    totalUncompressedBytes: 0,
    maxEntryBytes: 0,
    limits,
  };

  const unsafeEntries: Array<{ name: string; reason: string }> = [];
  let entries = 0;
  let total = 0;
  let maxEntry = 0;

  const evaluate = (verdict: "ok" | "bomb" | "unsafe" | "invalid" | "tool_missing", note?: string): PcArchiveInspection => ({
    ...base,
    entries,
    totalUncompressedBytes: total,
    maxEntryBytes: maxEntry,
    unsafeEntries,
    verdict,
    ...(note ? { note } : {}),
  });

  try {
    if (kind === "zip") {
      const { entries: z, invalid } = parseZipCentralDirectory(buffer);
      if (invalid && z.length === 0) return evaluate("invalid", "zip central directory could not be parsed");
      for (const e of z) {
        if (e.isDir) continue;
        if (e.isSymlink) unsafeEntries.push({ name: e.name, reason: "symlink entry" });
        const reason = unsafeReason(e.name);
        if (reason) unsafeEntries.push({ name: e.name, reason });
        entries++;
        total += e.uncompressedSize;
        maxEntry = Math.max(maxEntry, e.uncompressedSize);
      }
    } else if (kind === "tar" || kind === "tar.gz") {
      let tarBuf = buffer;
      if (kind === "tar.gz") {
        // Bound inflation so a gzip bomb cannot exhaust memory.
        try {
          tarBuf = gunzipSync(buffer, { maxOutputLength: maxUncompressedBytes + 1024 * 1024 });
        } catch {
          return evaluate("bomb", "gzip stream exceeds the uncompressed inspection limit (possible bomb)");
        }
      }
      const { entries: t, invalid } = parseTarHeaders(tarBuf);
      if (invalid && t.length === 0) return evaluate("invalid", "tar headers could not be parsed");
      for (const e of t) {
        if (e.isDir) continue;
        if (e.isSymlink) unsafeEntries.push({ name: e.name, reason: "symlink entry" });
        const reason = unsafeReason(e.name);
        if (reason) unsafeEntries.push({ name: e.name, reason });
        entries++;
        total += e.size;
        maxEntry = Math.max(maxEntry, e.size);
      }
    } else if (kind === "7z") {
      return evaluate("tool_missing", "7z metadata inspection requires the system 7z tool; archives are quarantined until a configured extractor exists");
    } else {
      return evaluate("invalid", "unsupported archive kind");
    }
  } catch {
    return evaluate("invalid", "archive could not be inspected");
  }

  if (unsafeEntries.length > 0) return evaluate("unsafe");
  if (entries > limits.maxEntries || total > maxUncompressedBytes || maxEntry > maxEntryBytes) return evaluate("bomb");
  return evaluate("ok");
}
