import { promises as fs } from "node:fs";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { ModuleManifestSchema, type ModuleManifest } from "@windels/shared/moduleCenter";
import { AppError } from "../utils/result.js";

const MAX_ENTRIES = 5_000;
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_ENTRY = 25 * 1024 * 1024;
const MAX_MANIFEST = 256 * 1024;
const MAX_SCAN_TEXT = 12 * 1024 * 1024;
const TEXT_FILE = /(?:^|\/)(?:package\.json|manifest\.json|[^/]+\.(?:ts|tsx|js|mjs|cjs|json|sql|yaml|yml|sh|md))$/i;

export interface ModuleArchiveEntry {
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
  crc32: number;
  directory: boolean;
}
export interface ModuleArchiveInspection {
  manifest: ModuleManifest;
  entries: ModuleArchiveEntry[];
  textFiles: Record<string, string>;
  fileCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
}

function openZip(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => yauzl.open(filePath, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => error || !zip ? reject(error ?? new Error("ZIP could not be opened")) : resolve(zip)));
}
function entryBuffer(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) return reject(error ?? new Error("ZIP entry stream unavailable"));
    const chunks: Buffer[] = [];
    let bytes = 0;
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stream.destroy(new Error(`Entry ${entry.fileName} exceeds inspection limit`));
      else chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  }));
}
function unsafePath(name: string): boolean {
  const trimmed = name.endsWith("/") ? name.slice(0, -1) : name;
  return !trimmed || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name) || trimmed.split("/").some((part) => part === ".." || part === "");
}
function isSymlink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

/** Inspect a .wmod ZIP without extracting or executing it. */
export async function inspectModuleArchive(filePath: string): Promise<ModuleArchiveInspection> {
  const header = await fs.readFile(filePath).then((buffer) => buffer.subarray(0, 4));
  if (header.length < 4 || header[0] !== 0x50 || header[1] !== 0x4b || !([0x03, 0x05, 0x07].includes(header[2]!))) {
    throw AppError.validation("Package is not a valid ZIP-based WINDELS module archive");
  }
  const zip = await openZip(filePath).catch((error) => { throw AppError.validation("Package ZIP structure is invalid", { cause: error instanceof Error ? error.message : String(error) }); });
  const entries: ModuleArchiveEntry[] = [];
  const textFiles: Record<string, string> = {};
  const normalized = new Set<string>();
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let scannedTextBytes = 0;
  let manifestRaw: Buffer | null = null;

  return new Promise<ModuleArchiveInspection>((resolve, reject) => {
    const fail = (error: unknown) => { try { zip.close(); } catch {} reject(error); };
    zip.on("error", (error) => fail(AppError.validation("Package ZIP read failed", { cause: error.message })));
    zip.on("entry", async (entry: Entry) => {
      try {
        if (entries.length >= MAX_ENTRIES) throw AppError.validation(`Package exceeds ${MAX_ENTRIES} entries`);
        if (unsafePath(entry.fileName)) throw AppError.validation(`Unsafe archive path rejected: ${entry.fileName}`);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw AppError.validation(`Encrypted ZIP entries are not accepted: ${entry.fileName}`);
        if (isSymlink(entry)) throw AppError.validation(`Symbolic links are not accepted: ${entry.fileName}`);
        const key = entry.fileName.normalize("NFC").toLowerCase();
        if (normalized.has(key)) throw AppError.validation(`Duplicate or case-colliding archive path: ${entry.fileName}`);
        normalized.add(key);
        const directory = entry.fileName.endsWith("/");
        if (!directory && entry.uncompressedSize > MAX_ENTRY) throw AppError.validation(`Archive entry exceeds ${MAX_ENTRY} bytes: ${entry.fileName}`);
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 150) throw AppError.validation(`Suspicious compression ratio rejected: ${entry.fileName}`);
        compressedBytes += entry.compressedSize;
        uncompressedBytes += entry.uncompressedSize;
        if (uncompressedBytes > MAX_UNCOMPRESSED) throw AppError.validation(`Package expands beyond ${MAX_UNCOMPRESSED} bytes`);
        entries.push({ path: entry.fileName, compressedBytes: entry.compressedSize, uncompressedBytes: entry.uncompressedSize, crc32: entry.crc32, directory });
        if (!directory && entry.fileName === "manifest.json") {
          if (entry.uncompressedSize > MAX_MANIFEST) throw AppError.validation("manifest.json exceeds the size limit");
          manifestRaw = await entryBuffer(zip, entry, MAX_MANIFEST);
        } else if (!directory && TEXT_FILE.test(entry.fileName)) {
          const securityRequired = /(?:^|\/)(?:package\.json|[^/]+\.sql)$/i.test(entry.fileName);
          if (securityRequired && entry.uncompressedSize > 2 * 1024 * 1024) throw AppError.validation(`Security-sensitive text entry is too large to inspect: ${entry.fileName}`);
          if (securityRequired || scannedTextBytes + entry.uncompressedSize <= MAX_SCAN_TEXT) {
            const content = await entryBuffer(zip, entry, Math.min(MAX_ENTRY, 2 * 1024 * 1024));
            scannedTextBytes += content.length;
            textFiles[entry.fileName] = content.toString("utf8");
          }
        }
        zip.readEntry();
      } catch (error) { fail(error); }
    });
    zip.on("end", () => {
      try {
        zip.close();
        if (!manifestRaw) throw AppError.validation("Package must contain manifest.json at the archive root");
        let json: unknown;
        try { json = JSON.parse(manifestRaw.toString("utf8")); }
        catch { throw AppError.validation("manifest.json is not valid JSON"); }
        const parsed = ModuleManifestSchema.safeParse(json);
        if (!parsed.success) throw AppError.validation("Module manifest validation failed", parsed.error.flatten());
        resolve({ manifest: parsed.data, entries, textFiles, fileCount: entries.filter((entry) => !entry.directory).length, compressedBytes, uncompressedBytes });
      } catch (error) { reject(error); }
    });
    zip.readEntry();
  });
}
