import { afterEach, describe, expect, it } from "vitest";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { ZipFile } from "yazl";
import { inspectModuleArchive } from "./archive.service.js";
import { verifyDetachedSignature, verifyModulePackage } from "./verification.service.js";

const tempDirs: string[] = [];
function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "example-module",
    name: "Example Module",
    version: "1.0.0",
    platform: "windels-ai-os",
    packageType: "module",
    description: "A signed test module for the WINDELS package validator.",
    author: "WINDELS Test",
    vendor: "WINDELS Test",
    license: "Proprietary",
    minimumVersion: "0.1.0",
    apiVersion: "v1",
    dependencies: [],
    permissions: ["ORG_READ"],
    accessRoles: ["super_admin"],
    capabilities: [],
    backend: { enabled: false, mode: "none", routes: [], webhooks: [], backgroundJobs: [], eventHandlers: [] },
    frontend: { enabled: true, mode: "declarative", navigation: [{ label: "Example", path: "/", icon: "Puzzle", order: 500 }], pages: [{ path: "/", title: "Example", sections: [{ type: "info", title: "Ready", body: "Validated declarative page." }] }] },
    database: { migrations: [], mode: "none", rollbackFiles: [], backupRequired: true },
    agents: { definitions: [] }, workflows: { definitions: [] }, configuration: {}, documentation: ["docs/README.md"],
    tests: { command: "npm test", categories: ["unit", "security", "health"] },
    healthChecks: [{ name: "runner", type: "runner", timeoutMs: 5000 }],
    resources: { memoryMb: 128, cpuMillicores: 250, storageMb: 100, networkAccess: false },
    lifecycle: { reloadSupported: true, removable: true },
    upgrade: { from: [">=0.1.0"], rollbackSupported: true, allowDowngrade: false, requiresDowntime: false },
    conflicts: { moduleIds: [], capabilities: [] },
    ...overrides,
  };
}
async function zip(entries: Record<string, string | Buffer>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wmod-test-")); tempDirs.push(dir);
  const file = path.join(dir, "module.wmod");
  const archive = new ZipFile();
  for (const [name, content] of Object.entries(entries)) archive.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  archive.end();
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(file);
    archive.outputStream.pipe(out).on("finish", resolve).on("error", reject);
  });
  return file;
}
afterEach(async () => { await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

describe("WINDELS module package archive", () => {
  it("validates a root manifest and inventories bounded package files without extraction", async () => {
    const file = await zip({ "manifest.json": JSON.stringify(manifest()), "docs/README.md": "# Example", "backend/index.ts": "export const ready = true;" });
    const result = await inspectModuleArchive(file);
    expect(result.manifest).toMatchObject({ id: "example-module", version: "1.0.0", platform: "windels-ai-os" });
    expect(result.fileCount).toBe(3);
    expect(result.entries.map((entry) => entry.path)).toContain("backend/index.ts");
  });

  it("rejects missing, malformed, and internally inconsistent manifests", async () => {
    await expect(inspectModuleArchive(await zip({ "docs/README.md": "no manifest" }))).rejects.toThrow(/manifest.json/);
    await expect(inspectModuleArchive(await zip({ "manifest.json": "{" }))).rejects.toThrow(/valid JSON/);
    const inconsistent = manifest({ backend: { enabled: false, mode: "none", routes: [{ method: "GET", path: "/x", permission: "ORG_READ" }], webhooks: [], backgroundJobs: [], eventHandlers: [] } });
    await expect(inspectModuleArchive(await zip({ "manifest.json": JSON.stringify(inconsistent), "docs/README.md": "x" }))).rejects.toThrow(/manifest validation/i);
  });

  it("rejects case-colliding paths before any code can run", async () => {
    const file = await zip({ "manifest.json": JSON.stringify(manifest()), "docs/README.md": "one", "DOCS/readme.md": "two" });
    await expect(inspectModuleArchive(file)).rejects.toThrow(/case-colliding/i);
  });
});

describe("module verification gate", () => {
  it("verifies detached Ed25519 signatures over the exact package checksum", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const checksum = "a".repeat(64);
    const signature = sign(null, Buffer.from(`windels-module:${checksum}`), privateKey).toString("base64");
    expect(verifyDetachedSignature(checksum, "publisher-1", signature, { "publisher-1": publicKey.export({ type: "spki", format: "pem" }).toString() })).toMatchObject({ status: "PASSED", code: "SIGNATURE_VERIFIED" });
    expect(verifyDetachedSignature("b".repeat(64), "publisher-1", signature, { "publisher-1": publicKey.export({ type: "spki", format: "pem" }).toString() })).toMatchObject({ status: "FAILED" });
  });

  it("passes only with trusted signature, clean malware verdict, compatible permissions and safe files", async () => {
    const file = await zip({ "manifest.json": JSON.stringify(manifest()), "docs/README.md": "safe module" });
    const inspection = await inspectModuleArchive(file);
    const bytes = await fs.readFile(file);
    const checksum = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(`windels-module:${checksum}`), privateKey).toString("base64");
    const report = await verifyModulePackage({ releaseId: "release-1", artifactPath: file, checksum, signatureKeyId: "publisher-1", signature, inspection, platformVersion: "0.1.0", trustedKeys: { "publisher-1": publicKey.export({ type: "spki", format: "pem" }).toString() }, clamScan: async () => ({ configured: true, status: "clean", detail: "stream: OK" }) });
    expect(report.passed).toBe(true);
    expect(report.checks.some((item) => item.code === "MALWARE_SCAN_CLEAN")).toBe(true);
    expect(report.checks.some((item) => item.code === "PERMISSIONS_REUSED")).toBe(true);
  });

  it("fails closed when malware scanning is not configured", async () => {
    const file = await zip({ "manifest.json": JSON.stringify(manifest()), "docs/README.md": "safe module" });
    const inspection = await inspectModuleArchive(file);
    const report = await verifyModulePackage({ releaseId: "release-2", artifactPath: file, checksum: "c".repeat(64), signatureKeyId: "missing", signature: "bad", inspection, platformVersion: "0.1.0", trustedKeys: {}, clamScan: async () => ({ configured: false, status: "not_configured" }) });
    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CHECKSUM_MISMATCH", severity: "critical" }), expect.objectContaining({ code: "MALWARE_SCANNER_NOT_CONFIGURED", severity: "critical" }), expect.objectContaining({ code: "PUBLISHER_KEY_UNTRUSTED", severity: "critical" })]));
  });

  it("blocks destructive platform migration SQL", async () => {
    const unsafeManifest = manifest({ database: { migrations: ["database/001.sql"], mode: "platform_schema", rollbackFiles: ["database/001.down.sql"], backupRequired: true } });
    const file = await zip({ "manifest.json": JSON.stringify(unsafeManifest), "docs/README.md": "x", "database/001.sql": "DROP SCHEMA public CASCADE;", "database/001.down.sql": "SELECT 1;" });
    const inspection = await inspectModuleArchive(file);
    const report = await verifyModulePackage({ releaseId: "release-3", artifactPath: file, checksum: "d".repeat(64), inspection, platformVersion: "0.1.0", clamScan: async () => ({ configured: true, status: "clean" }) });
    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNSAFE_MIGRATION_CONTENT", status: "FAILED" })]));
  });
});
