import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipFile } from "yazl";
import { ModuleManifestSchema } from "@windels/shared/moduleCenter";

const runModuleAction = vi.hoisted(() => vi.fn());
vi.mock("./runner.service.js", () => ({ runModuleAction }));
vi.mock("../audit/audit.service.js", () => ({ auditService: { log: vi.fn(async () => undefined) } }));
vi.mock("../pluginOs/pluginRegistry.js", () => ({ PluginRegistry: { publish: vi.fn(async ({ manifest }: any) => manifest), install: vi.fn(async () => ({ status: "enabled" })), setStatus: vi.fn(async () => ({})), uninstall: vi.fn(async () => ({ ok: true })) } }));
vi.mock("../pluginOs/capabilityRegistry.js", () => ({ CapabilityRegistry: { register: vi.fn(async () => undefined), unregister: vi.fn(async () => undefined) } }));

const { ModuleCenterService } = await import("./moduleCenter.service.js");
const { prisma } = await import("../db/client.js");
const db = prisma as any;
const actor = { userId: "user-admin", organizationId: "org-windels" };
function manifest(version = "1.0.0") {
  return ModuleManifestSchema.parse({
    schemaVersion: 1, id: "lifecycle-module", name: "Lifecycle Module", version,
    platform: "windels-ai-os", packageType: "module", description: "Lifecycle test module for controlled deployment.",
    author: "WINDELS", vendor: "WINDELS", license: "Proprietary", minimumVersion: "0.1.0", apiVersion: "v1",
    dependencies: [], permissions: ["ORG_READ"], accessRoles: ["super_admin"], capabilities: ["test.capability"],
    backend: { enabled: true, mode: "external_service", routes: [{ method: "GET", path: "/health", permission: "ORG_READ" }], healthPath: "/health", webhooks: [], backgroundJobs: [], eventHandlers: [] },
    frontend: { enabled: true, mode: "declarative", navigation: [{ label: "Lifecycle", path: "/", icon: "Puzzle", order: 500 }], pages: [{ path: "/", title: "Lifecycle", sections: [] }] },
    database: { migrations: [], mode: "none", rollbackFiles: [], backupRequired: true }, agents: { definitions: [] }, workflows: { definitions: [] }, configuration: {}, documentation: [],
    tests: { categories: ["unit", "integration", "api", "permission", "security", "health", "frontend"] }, healthChecks: [{ name: "http", type: "http", path: "/health", timeoutMs: 1000 }],
    resources: { memoryMb: 128, cpuMillicores: 200, storageMb: 100, networkAccess: false }, lifecycle: { reloadSupported: true, removable: true },
    upgrade: { from: [">=0.1.0"], rollbackSupported: true, allowDowngrade: false, requiresDowntime: false }, conflicts: { moduleIds: [], capabilities: [] },
  });
}
async function packageFile(m = manifest()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "module-lifecycle-"));
  const file = path.join(dir, "module.wmod");
  const archive = new ZipFile();
  archive.addBuffer(Buffer.from(JSON.stringify(m)), "manifest.json");
  archive.end();
  await new Promise<void>((resolve, reject) => archive.outputStream.pipe(createWriteStream(file)).on("finish", resolve).on("error", reject));
  return { dir, file, bytes: await fs.readFile(file) };
}
function runner(over: Record<string, unknown> = {}) {
  return {
    ok: true, action: "SANDBOX_TEST", status: "PASSED",
    checks: [], logs: ["runner completed"],
    evidence: { stages: { startup: "PASSED", health: "PASSED", permissions: "PASSED", resources: "PASSED", tests: "PASSED", api: "PASSED", frontend: "PASSED" }, health: { passed: true }, tests: { passed: true }, changes: { recorded: true, components: ["backend", "frontend"], files: ["immutable image digest"] } },
    runtime: { serviceUrl: "https://module.test", instanceId: "instance-1", imageDigest: "sha256:abc" },
    ...over,
  };
}
async function seedRelease(status = "SANDBOX_TEST", version = "1.0.0") {
  const m = manifest(version);
  const module = await db.platformModule.create({ data: { moduleKey: m.id, name: m.name, packageType: m.packageType, description: m.description, vendor: m.vendor, status, health: "UNKNOWN", manifest: m, dependencies: [], permissions: m.permissions } });
  const release = await db.platformModuleRelease.create({ data: { moduleRegistryId: module.id, version, status, checksum: `${version}-checksum`, artifactPath: `/protected/${version}.wmod`, packageSizeBytes: 100, manifest: m, signatureVerified: true, scanStatus: "PASSED", compatibilityStatus: "PASSED", sandboxStatus: status === "VALIDATED" ? "PASSED" : "PENDING", approvalStatus: "PENDING", migrationStatus: "NOT_STARTED", verificationReport: { passed: true }, sandboxReport: {}, healthReport: {}, rollbackMetadata: {}, uploadedById: actor.userId } });
  return { module, release };
}
beforeEach(async () => {
  runModuleAction.mockReset();
  await db.platformModuleOperation.deleteMany({});
  await db.platformModuleUpload.deleteMany({});
  await db.platformModuleRelease.deleteMany({});
  await db.platformModule.deleteMany({});
});

describe("Module Center controlled lifecycle", () => {
  it("streams a package into quarantine and never executes it during upload", async () => {
    const pkg = await packageFile();
    const previousRoot = process.env.MODULE_PACKAGE_STORAGE_PATH;
    process.env.MODULE_PACKAGE_STORAGE_PATH = path.join(pkg.dir, "storage");
    try {
      const checksum = createHash("sha256").update(pkg.bytes).digest("hex");
      const result = await ModuleCenterService.ingest(actor, { tempPath: pkg.file, originalName: "module.wmod", sizeBytes: pkg.bytes.length, checksum, fields: { signatureKeyId: "publisher", signature: "detached-signature" } });
      expect(result).toMatchObject({ release: { status: "UPLOADED", signatureVerified: false }, nextAction: "VERIFY" });
      expect(JSON.stringify(result)).not.toContain("artifactPath");
      expect(runModuleAction).not.toHaveBeenCalled();
      const stored = await db.platformModuleRelease.findFirst({ where: { id: result.release.id } });
      expect(stored.artifactPath).toContain("quarantine");
      expect((await fs.stat(stored.artifactPath)).mode & 0o777).toBe(0o600);
    } finally {
      if (previousRoot === undefined) delete process.env.MODULE_PACKAGE_STORAGE_PATH; else process.env.MODULE_PACKAGE_STORAGE_PATH = previousRoot;
      await fs.rm(pkg.dir, { recursive: true, force: true });
    }
  });

  it("requires complete isolated-runner evidence before approval and activation", async () => {
    const seeded = await seedRelease();
    runModuleAction.mockResolvedValueOnce(runner());
    const tested = await ModuleCenterService.sandbox(actor, seeded.release.id, "sandbox-complete-evidence-1");
    expect(tested).toMatchObject({ status: "VALIDATED", sandboxStatus: "PASSED" });
    const approved = await ModuleCenterService.approve(actor, seeded.release.id, "approve-complete-evidence-1");
    expect(approved).toMatchObject({ status: "APPROVED", approvalStatus: "APPROVED" });
    runModuleAction.mockResolvedValueOnce(runner({ action: "INSTALL" }));
    const installed = await ModuleCenterService.install(actor, seeded.release.id, "install-complete-evidence-1");
    expect(installed).toMatchObject({ status: "ACTIVE", health: "HEALTHY", enabled: true, currentVersion: "1.0.0" });
    expect(installed.runtimeRegistration).not.toHaveProperty("artifactPath");
  });

  it("fails closed when sandbox evidence omits a required permission boundary stage", async () => {
    const seeded = await seedRelease();
    const incomplete = runner(); delete (incomplete.evidence as any).stages.permissions;
    runModuleAction.mockResolvedValueOnce(incomplete);
    const result = await ModuleCenterService.sandbox(actor, seeded.release.id, "sandbox-incomplete-evidence-1");
    expect(result.status).toBe("SANDBOX_TEST");
    expect(result.sandboxStatus).toBe("FAILED"); // runner claim cannot override missing platform-required evidence
    await expect(ModuleCenterService.approve(actor, seeded.release.id, "approve-incomplete-evidence-1")).rejects.toThrow(/verified release/i);
  });

  it("rolls back to the recorded immutable previous release only after health verification", async () => {
    const oldManifest = manifest("1.0.0");
    const module = await db.platformModule.create({ data: { moduleKey: oldManifest.id, name: oldManifest.name, packageType: oldManifest.packageType, description: oldManifest.description, vendor: oldManifest.vendor, status: "ACTIVE", health: "HEALTHY", enabled: true, currentVersion: "2.0.0", manifest: manifest("2.0.0"), dependencies: [], permissions: oldManifest.permissions } });
    const oldRelease = await db.platformModuleRelease.create({ data: { moduleRegistryId: module.id, version: "1.0.0", status: "APPROVED", checksum: "old-checksum", artifactPath: "/protected/old.wmod", packageSizeBytes: 100, manifest: oldManifest, signatureVerified: true, scanStatus: "PASSED", compatibilityStatus: "PASSED", sandboxStatus: "PASSED", approvalStatus: "APPROVED", migrationStatus: "NOT_REQUIRED", verificationReport: { passed: true }, sandboxReport: {}, healthReport: {}, rollbackMetadata: {}, uploadedById: actor.userId } });
    const currentRelease = await db.platformModuleRelease.create({ data: { moduleRegistryId: module.id, version: "2.0.0", status: "ACTIVE", checksum: "new-checksum", artifactPath: "/protected/new.wmod", packageSizeBytes: 100, manifest: manifest("2.0.0"), signatureVerified: true, scanStatus: "PASSED", compatibilityStatus: "PASSED", sandboxStatus: "PASSED", approvalStatus: "APPROVED", migrationStatus: "NOT_REQUIRED", verificationReport: { passed: true }, sandboxReport: {}, healthReport: {}, rollbackMetadata: {}, previousReleaseId: oldRelease.id, uploadedById: actor.userId } });
    await db.platformModule.update({ where: { id: module.id }, data: { activeReleaseId: currentRelease.id } });
    runModuleAction.mockResolvedValueOnce(runner({ action: "ROLLBACK" }));
    const rolledBack = await ModuleCenterService.rollback(actor, module.id, "rollback-known-good-1");
    expect(rolledBack).toMatchObject({ status: "ACTIVE", currentVersion: "1.0.0", activeReleaseId: oldRelease.id, health: "HEALTHY" });
    expect(await db.platformModuleRelease.findFirst({ where: { id: currentRelease.id } })).toMatchObject({ status: "FAILED" });
  });

  it("prevents removal while another active module has a required dependency", async () => {
    const seeded = await seedRelease("DISABLED");
    await db.platformModule.update({ where: { id: seeded.module.id }, data: { activeReleaseId: seeded.release.id, currentVersion: "1.0.0", status: "DISABLED", enabled: false } });
    const dependentManifest = { ...manifest("2.0.0"), id: "dependent-module", dependencies: [{ id: "lifecycle-module", version: ">=1.0.0", optional: false }] };
    await db.platformModule.create({ data: { moduleKey: "dependent-module", name: "Dependent", packageType: "module", description: "Depends on lifecycle module", vendor: "WINDELS", status: "ACTIVE", health: "HEALTHY", enabled: true, currentVersion: "2.0.0", manifest: dependentManifest, dependencies: dependentManifest.dependencies, permissions: [] } });
    await expect(ModuleCenterService.remove(actor, seeded.module.id, "remove-required-dependency-1")).rejects.toThrow(/required by/i);
    expect(runModuleAction).not.toHaveBeenCalled();
  });
});
