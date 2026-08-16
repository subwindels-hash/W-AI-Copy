import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import semver from "semver";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { auditService } from "../audit/audit.service.js";
import { inspectModuleArchive } from "./archive.service.js";
import { verifyModulePackage } from "./verification.service.js";
import { runModuleAction, type RunnerAction } from "./runner.service.js";
import { PluginRegistry } from "../pluginOs/pluginRegistry.js";
import { CapabilityRegistry } from "../pluginOs/capabilityRegistry.js";
import type { ModuleManifest, ModuleRunnerResult, ModuleRuntimeRegistration } from "@windels/shared/moduleCenter";

const db = prisma as any;
export interface ModuleActor { userId: string; organizationId: string | null }

function packageRoot(): string { return path.resolve(process.env.MODULE_PACKAGE_STORAGE_PATH || path.join(process.cwd(), "module-packages")); }
function sanitizeForApi(value: any, depth = 0): any {
  if (depth > 8 || value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitizeForApi(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(secret|password|token|authorization|artifactpath|sharedpath|serviceurl)/i.test(key)) continue;
    out[key] = sanitizeForApi(item, depth + 1);
  }
  return out;
}
function publicRelease(release: any) { if (!release) return release; const { artifactPath: _artifactPath, ...safe } = release; return sanitizeForApi(safe); }
function publicUpload(upload: any) { if (!upload) return upload; const { artifactPath: _artifactPath, ...safe } = upload; const report = safe.report && typeof safe.report === "object" ? { ...safe.report } : safe.report; if (report) delete report.signature; return sanitizeForApi({ ...safe, report, release: publicRelease(safe.release) }); }
function publicModule(module: any) { return sanitizeForApi({ ...module, releases: Array.isArray(module.releases) ? module.releases.map(publicRelease) : module.releases }); }
function cleanLogs(logs: string[]): string[] { return logs.slice(-200).map((line) => String(line).slice(0, 2000)); }
function signatureKeyCount(): number { try { return Object.keys(JSON.parse(process.env.MODULE_TRUSTED_PUBLISHER_KEYS || "{}")).length; } catch { return 0; } }

async function moveArtifact(source: string, bucket: "quarantine" | "verified", checksum: string): Promise<string> {
  const dir = path.join(packageRoot(), bucket);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
  const target = path.join(dir, `${checksum}.wmod`);
  if (path.resolve(source) === path.resolve(target)) return target;
  try { await fs.rename(source, target); }
  catch (error: any) {
    if (error?.code !== "EXDEV") throw error;
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    await fs.unlink(source);
  }
  await fs.chmod(target, 0o600);
  return target;
}

async function audit(actor: ModuleActor, action: any, resourceType: any, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.log({ organizationId: actor.organizationId ?? undefined, userId: actor.userId, action, resourceType, resourceId, metadata });
}
async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "module-center", kind, payload }); } catch { /* audit and DB remain authoritative */ }
}

async function operation(input: { moduleRegistryId: string; releaseId?: string; type: string; actor: ModuleActor; idempotencyKey: string; fromVersion?: string; toVersion?: string }) {
  const duplicate = await db.platformModuleOperation.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
  if (duplicate) return { row: duplicate, duplicate: true };
  const row = await db.platformModuleOperation.create({ data: {
    moduleRegistryId: input.moduleRegistryId, releaseId: input.releaseId ?? null,
    operationType: input.type, status: "RUNNING", idempotencyKey: input.idempotencyKey,
    correlationId: randomUUID(), requestedById: input.actor.userId,
    fromVersion: input.fromVersion ?? null, toVersion: input.toVersion ?? null,
    startedAt: new Date(), logs: [], result: {},
  } });
  return { row, duplicate: false };
}
async function finishOperation(id: string, ok: boolean, result: Record<string, unknown>, logs: string[] = [], error?: { code: string; message: string }) {
  return db.platformModuleOperation.update({ where: { id }, data: {
    status: ok ? "SUCCEEDED" : "FAILED", result: sanitizeForApi(result), logs: cleanLogs(logs), completedAt: new Date(),
    errorCode: error?.code ?? null, errorMessage: error?.message ?? null,
  } });
}
function runnerStagePassed(result: ModuleRunnerResult, stage: string): boolean {
  const stages: any = result.evidence?.stages;
  return stages?.[stage]?.passed === true || stages?.[stage] === "PASSED";
}
function requiredSandboxStages(manifest: ModuleManifest): string[] {
  const stages = ["startup", "health", "permissions", "resources", "tests"];
  if (manifest.backend.enabled) stages.push("api");
  if (manifest.database.migrations.length) stages.push("database");
  if (manifest.agents.definitions.length) stages.push("agents");
  if (manifest.workflows.definitions.length) stages.push("workflows");
  if (manifest.frontend.enabled) stages.push("frontend");
  return stages;
}
function runnerMeetsSandboxContract(result: ModuleRunnerResult, manifest: ModuleManifest): { ok: boolean; missing: string[] } {
  const missing = requiredSandboxStages(manifest).filter((stage) => !runnerStagePassed(result, stage));
  return { ok: result.ok && result.status === "PASSED" && missing.length === 0, missing };
}
function runtimeUrlAllowed(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return false;
    const allowed = (process.env.MODULE_RUNTIME_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return process.env.NODE_ENV !== "production" && allowed.length === 0 ? ["http:", "https:"].includes(parsed.protocol) : allowed.includes(parsed.origin);
  } catch { return false; }
}

async function runnerInput(module: any, release: any, actor: ModuleActor, action: RunnerAction, correlationId?: string, target?: any) {
  return runModuleAction({
    action, moduleId: module.moduleKey, releaseId: target?.id ?? release.id, version: target?.version ?? release.version,
    checksum: target?.checksum ?? release.checksum, artifactPath: target?.artifactPath ?? release.artifactPath,
    manifest: (target?.manifest ?? release.manifest) as ModuleManifest, actorId: actor.userId, correlationId,
    previousVersion: module.currentVersion ?? undefined, previousReleaseId: module.activeReleaseId ?? undefined,
  });
}

async function syncPluginInfrastructure(actor: ModuleActor, module: any, release: any, runtime: any) {
  const manifest = release.manifest as ModuleManifest;
  if (!manifest.capabilities.length || !actor.organizationId) return;
  const pluginManifest: any = {
    id: manifest.id, name: manifest.name, version: manifest.version, publisher: manifest.vendor,
    description: manifest.description, category: manifest.packageType, tags: [manifest.packageType, "module-center"],
    class: manifest.packageType === "plugin" ? "tool" : "full_module",
    capabilities: manifest.capabilities, permissions: manifest.permissions,
    authentication: ["none"], minPlatformVersion: manifest.minimumVersion,
    endpoint: runtime?.serviceUrl, trust: "verified",
  };
  await PluginRegistry.publish({ manifest: pluginManifest, trustedSource: "module_center" });
  const installed = await PluginRegistry.install(actor.organizationId, actor.userId, manifest.id, { grantedPermissions: manifest.permissions, version: manifest.version });
  await CapabilityRegistry.register(actor.organizationId, pluginManifest, { enabled: true, status: installed.status, authenticated: true });
}

export const ModuleCenterService = {
  async ingest(actor: ModuleActor, upload: { tempPath: string; originalName: string; sizeBytes: number; checksum: string; fields: Record<string, string> }) {
    const duplicate = await db.platformModuleUpload.findFirst({ where: { checksum: upload.checksum }, include: { release: true } });
    if (duplicate) {
      await fs.unlink(upload.tempPath).catch(() => undefined);
      if (duplicate.release && !["ACTIVE", "INSTALLING", "MIGRATING", "HEALTH_CHECK"].includes(duplicate.release.status)) {
        const report = { ...(duplicate.report ?? {}), signature: upload.fields.signature?.slice(0, 2048), duplicateUploadDetected: true, signatureUpdatedAt: new Date().toISOString() };
        const uploadRow = await db.platformModuleUpload.update({ where: { id: duplicate.id }, data: { signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null, status: "UPLOADED", report } });
        const release = await db.platformModuleRelease.update({ where: { id: duplicate.release.id }, data: { signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null, signatureVerified: false, status: "UPLOADED", scanStatus: "PENDING", compatibilityStatus: "PENDING", sandboxStatus: "PENDING", approvalStatus: "PENDING", verificationReport: {}, sandboxReport: {} } });
        await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status: "UPLOADED", health: "UNKNOWN", lastError: null } });
        await audit(actor, "module.signature_updated", "module_upload", duplicate.id, { releaseId: release.id, checksum: upload.checksum, duplicateDetected: true });
        return { upload: publicUpload(uploadRow), release: publicRelease(release), module: publicModule(await this.get(release.moduleRegistryId)), nextAction: "VERIFY", duplicateDetected: true };
      }
      throw AppError.conflict(`This exact package was already uploaded as ${duplicate.id}`);
    }
    const artifactPath = await moveArtifact(upload.tempPath, "quarantine", upload.checksum);
    let inspection;
    try { inspection = await inspectModuleArchive(artifactPath); }
    catch (error) {
      const row = await db.platformModuleUpload.create({ data: {
        originalName: upload.originalName, checksum: upload.checksum, sizeBytes: upload.sizeBytes, artifactPath,
        status: "QUARANTINED", uploadedById: actor.userId,
        signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null,
        report: { accepted: false, error: error instanceof Error ? error.message : String(error) },
      } });
      await audit(actor, "module.upload_rejected", "module_upload", row.id, { checksum: upload.checksum, reason: error instanceof Error ? error.message : String(error) });
      throw AppError.validation("Module package was quarantined during structural validation", { uploadId: row.id, reason: error instanceof Error ? error.message : String(error) });
    }
    const manifest = inspection.manifest;
    let module = await db.platformModule.findFirst({ where: { moduleKey: manifest.id } });
    if (module) {
      const duplicateVersion = await db.platformModuleRelease.findFirst({ where: { moduleRegistryId: module.id, version: manifest.version } });
      if (duplicateVersion) {
        const row = await db.platformModuleUpload.create({ data: { originalName: upload.originalName, checksum: upload.checksum, sizeBytes: upload.sizeBytes, artifactPath, status: "QUARANTINED", uploadedById: actor.userId, manifestId: manifest.id, manifestVersion: manifest.version, signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null, report: { accepted: false, error: "duplicate module version" } } });
        await audit(actor, "module.upload_rejected", "module_upload", row.id, { moduleId: manifest.id, version: manifest.version, reason: "duplicate version" });
        throw AppError.conflict(`Module ${manifest.id} version ${manifest.version} already exists`);
      }
    } else {
      module = await db.platformModule.create({ data: {
        moduleKey: manifest.id, name: manifest.name, packageType: manifest.packageType,
        description: manifest.description, vendor: manifest.vendor, status: "UPLOADED", health: "UNKNOWN",
        manifest, dependencies: manifest.dependencies, permissions: manifest.permissions,
      } });
    }
    const release = await db.platformModuleRelease.create({ data: {
      moduleRegistryId: module.id, version: manifest.version, status: "UPLOADED", checksum: upload.checksum,
      artifactPath, packageSizeBytes: upload.sizeBytes, manifest,
      signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null,
      previousReleaseId: module.activeReleaseId ?? null, uploadedById: actor.userId,
      verificationReport: {}, sandboxReport: {}, healthReport: {}, rollbackMetadata: {},
    } });
    const uploadRow = await db.platformModuleUpload.create({ data: {
      originalName: upload.originalName, checksum: upload.checksum, sizeBytes: upload.sizeBytes, artifactPath,
      status: "UPLOADED", manifestId: manifest.id, manifestVersion: manifest.version,
      signatureKeyId: upload.fields.signatureKeyId?.slice(0, 120) ?? null,
      uploadedById: actor.userId, releaseId: release.id,
      report: { accepted: true, signature: upload.fields.signature?.slice(0, 2048), archive: { fileCount: inspection.fileCount, compressedBytes: inspection.compressedBytes, uncompressedBytes: inspection.uncompressedBytes } },
    } });
    const op = await operation({ moduleRegistryId: module.id, releaseId: release.id, type: "UPLOAD", actor, idempotencyKey: `upload:${upload.checksum}`, toVersion: release.version });
    await finishOperation(op.row.id, true, { uploadId: uploadRow.id, checksum: upload.checksum, executed: false }, ["Package stored in quarantine; no uploaded code was executed."]);
    await db.platformModule.update({ where: { id: module.id }, data: { status: "UPLOADED", name: manifest.name, description: manifest.description, vendor: manifest.vendor, packageType: manifest.packageType } });
    await audit(actor, "module.uploaded", "module_release", release.id, { moduleId: manifest.id, version: manifest.version, checksum: upload.checksum, executed: false });
    return { upload: publicUpload(uploadRow), release: publicRelease(release), module: publicModule(module), nextAction: "VERIFY" };
  },

  async verify(actor: ModuleActor, releaseId: string, idempotencyKey: string) {
    const release = await db.platformModuleRelease.findFirst({ where: { id: releaseId }, include: { moduleRegistry: true, upload: true } });
    if (!release) throw AppError.notFound("Module release not found");
    if (["ACTIVE", "APPROVED", "VALIDATED", "SANDBOX_TEST"].includes(release.status) && release.verificationReport?.passed === true) return publicRelease(release);
    const op = await operation({ moduleRegistryId: release.moduleRegistryId, releaseId, type: "VERIFY", actor, idempotencyKey, toVersion: release.version });
    if (op.duplicate) return publicRelease(release);
    await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "SCANNING", scanStatus: "RUNNING" } });
    await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status: "SCANNING" } });
    try {
      const inspection = await inspectModuleArchive(release.artifactPath);
      const uploadReport: any = release.upload?.report ?? {};
      const report = await verifyModulePackage({
        releaseId: release.id, artifactPath: release.artifactPath, checksum: release.checksum,
        signatureKeyId: release.signatureKeyId ?? undefined, signature: uploadReport.signature,
        inspection,
      });
      const signatureVerified = report.checks.some((item) => item.code === "SIGNATURE_VERIFIED" && item.status === "PASSED");
      const scannerPassed = report.checks.some((item) => item.code === "MALWARE_SCAN_CLEAN" && item.status === "PASSED");
      const artifactPath = report.passed ? await moveArtifact(release.artifactPath, "verified", release.checksum) : release.artifactPath;
      const status = report.passed ? "SANDBOX_TEST" : "QUARANTINED";
      const updated = await db.platformModuleRelease.update({ where: { id: release.id }, data: {
        status, artifactPath, signatureVerified, scanStatus: scannerPassed ? "PASSED" : "FAILED",
        compatibilityStatus: report.passed ? "PASSED" : "FAILED", verificationReport: report, verifiedAt: new Date(),
      } });
      await db.platformModuleUpload.update({ where: { releaseId: release.id }, data: { status, artifactPath, report: { ...uploadReport, verification: report } } });
      await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status, health: report.passed ? "UNKNOWN" : "QUARANTINED", lastError: report.passed ? null : "Package verification failed" } });
      await finishOperation(op.row.id, report.passed, { report }, report.checks.map((item) => `${item.status} ${item.code}: ${item.message}`), report.passed ? undefined : { code: "MODULE_VERIFICATION_FAILED", message: "One or more critical verification checks failed" });
      await audit(actor, report.passed ? "module.verification_succeeded" : "module.verification_failed", "module_release", release.id, { moduleId: release.moduleRegistry.moduleKey, version: release.version, checks: report.checks.length });
      return publicRelease(updated);
    } catch (error) {
      await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "QUARANTINED", scanStatus: "FAILED", compatibilityStatus: "FAILED" } });
      await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status: "QUARANTINED", health: "QUARANTINED", lastError: error instanceof Error ? error.message : String(error) } });
      await finishOperation(op.row.id, false, {}, [], { code: "MODULE_VERIFICATION_ERROR", message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async sandbox(actor: ModuleActor, releaseId: string, idempotencyKey: string) {
    const release = await db.platformModuleRelease.findFirst({ where: { id: releaseId }, include: { moduleRegistry: true } });
    if (!release) throw AppError.notFound("Module release not found");
    if (release.status !== "SANDBOX_TEST") throw AppError.conflict(`Sandbox testing requires SANDBOX_TEST status, found ${release.status}`);
    const op = await operation({ moduleRegistryId: release.moduleRegistryId, releaseId, type: "SANDBOX_TEST", actor, idempotencyKey, toVersion: release.version });
    if (op.duplicate) return publicRelease(release);
    const result = await runnerInput(release.moduleRegistry, release, actor, "SANDBOX_TEST", op.row.correlationId);
    const contract = runnerMeetsSandboxContract(result, release.manifest as ModuleManifest);
    if (contract.missing.length) result.checks.push({ code: "SANDBOX_EVIDENCE_INCOMPLETE", category: "sandbox", status: "FAILED", severity: "critical", message: `Runner did not prove required stages: ${contract.missing.join(", ")}.`, evidence: { missing: contract.missing } });
    const status = contract.ok ? "VALIDATED" : "SANDBOX_TEST";
    const updated = await db.platformModuleRelease.update({ where: { id: release.id }, data: { status, sandboxStatus: contract.ok ? "PASSED" : result.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAILED", sandboxReport: sanitizeForApi(result), sandboxedAt: new Date() } });
    await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status, lastError: contract.ok ? null : "Sandbox validation did not pass" } });
    await finishOperation(op.row.id, contract.ok, { runner: result }, result.logs, contract.ok ? undefined : { code: result.status === "NOT_CONFIGURED" ? "MODULE_RUNNER_NOT_CONFIGURED" : "SANDBOX_VALIDATION_FAILED", message: "Module remains inactive until every sandbox stage passes" });
    await audit(actor, contract.ok ? "module.sandbox_succeeded" : "module.sandbox_failed", "module_release", release.id, { moduleId: release.moduleRegistry.moduleKey, version: release.version, missing: contract.missing });
    return publicRelease(updated);
  },

  async approve(actor: ModuleActor, releaseId: string, idempotencyKey: string) {
    const release = await db.platformModuleRelease.findFirst({ where: { id: releaseId }, include: { moduleRegistry: true } });
    if (!release) throw AppError.notFound("Module release not found");
    if (release.status !== "VALIDATED" || release.verificationReport?.passed !== true || release.sandboxStatus !== "PASSED") throw AppError.conflict("Only a verified release with complete sandbox evidence can be approved");
    const op = await operation({ moduleRegistryId: release.moduleRegistryId, releaseId, type: "APPROVE", actor, idempotencyKey, toVersion: release.version });
    if (op.duplicate) return publicRelease(release);
    const updated = await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "APPROVED", approvalStatus: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
    await db.platformModule.update({ where: { id: release.moduleRegistryId }, data: { status: "APPROVED" } });
    await finishOperation(op.row.id, true, { approved: true }, ["Super Admin approved the verified release. Uploaded code has still not executed in the API process."]);
    await audit(actor, "module.approved", "module_release", release.id, { moduleId: release.moduleRegistry.moduleKey, version: release.version });
    return publicRelease(updated);
  },

  async install(actor: ModuleActor, releaseId: string, idempotencyKey: string) {
    const release = await db.platformModuleRelease.findFirst({ where: { id: releaseId }, include: { moduleRegistry: true } });
    if (!release) throw AppError.notFound("Module release not found");
    if (release.status !== "APPROVED") throw AppError.conflict(`Installation requires APPROVED status, found ${release.status}`);
    const module = release.moduleRegistry;
    const manifest = release.manifest as ModuleManifest;
    if (module.currentVersion && semver.lt(release.version, module.currentVersion) && !manifest.upgrade.allowDowngrade) throw AppError.conflict("Manifest does not permit downgrade; use rollback to a known-good release instead");
    if (module.currentVersion && manifest.upgrade.from.length && !manifest.upgrade.from.some((range) => semver.satisfies(module.currentVersion, range))) throw AppError.conflict(`Version ${module.currentVersion} is not in the release upgrade.from ranges`);
    const type = module.currentVersion ? "UPDATE" : "INSTALL";
    const op = await operation({ moduleRegistryId: module.id, releaseId, type, actor, idempotencyKey, fromVersion: module.currentVersion ?? undefined, toVersion: release.version });
    if (op.duplicate) return publicModule(await this.get(module.id));
    await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "INSTALLING" } });
    await db.platformModule.update({ where: { id: module.id }, data: { status: "INSTALLING", lastError: null } });
    const result = await runnerInput(module, release, actor, "INSTALL", op.row.correlationId);
    const migrationNeeded = manifest.database.migrations.length > 0;
    const backupOk = !migrationNeeded || manifest.database.backupRequired === false || (result.evidence as any)?.backup?.verified === true;
    const migrationOk = !migrationNeeded || (result.evidence as any)?.migrations?.status === "PASSED";
    const integrityOk = !migrationNeeded || (result.evidence as any)?.databaseIntegrity?.passed === true;
    const healthOk = (result.evidence as any)?.health?.passed === true;
    const changesRecorded = (result.evidence as any)?.changes?.recorded === true && Array.isArray((result.evidence as any)?.changes?.components);
    const runtimeOk = !manifest.backend.enabled || runtimeUrlAllowed(result.runtime?.serviceUrl);
    let ok = result.ok && backupOk && migrationOk && integrityOk && healthOk && changesRecorded && runtimeOk;
    if (ok) {
      try { await syncPluginInfrastructure(actor, module, release, result.runtime); }
      catch (error) { ok = false; result.logs.push(`Plugin/Capability Registry integration failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (!ok) {
      let rollback = result.rollbackPerformed === true;
      if (module.activeReleaseId && !rollback) {
        const previous = await db.platformModuleRelease.findFirst({ where: { id: module.activeReleaseId } });
        if (previous) rollback = (await runnerInput(module, release, actor, "ROLLBACK", op.row.correlationId, previous)).ok;
      }
      await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "FAILED", migrationStatus: migrationOk ? "PASSED" : "FAILED", healthReport: sanitizeForApi(result), rollbackMetadata: { rollbackPerformed: rollback } } });
      await db.platformModule.update({ where: { id: module.id }, data: { status: module.activeReleaseId && rollback ? "ACTIVE" : "FAILED", health: module.activeReleaseId && rollback ? module.health : "UNHEALTHY", lastError: "Installation/upgrade validation failed" } });
      await finishOperation(op.row.id, false, { runner: result, backupOk, migrationOk, integrityOk, healthOk, changesRecorded, runtimeOk, rollbackPerformed: rollback }, result.logs, { code: "MODULE_INSTALL_FAILED", message: "The release was not activated because installation evidence was incomplete or failed" });
      await audit(actor, "module.install_failed", "platform_module", module.id, { moduleId: module.moduleKey, version: release.version, rollbackPerformed: rollback });
      return publicModule(await this.get(module.id));
    }
    if (module.activeReleaseId) await db.platformModuleRelease.update({ where: { id: module.activeReleaseId }, data: { status: "APPROVED" } });
    const registration: ModuleRuntimeRegistration & { serviceUrl?: string; instanceId?: string; imageDigest?: string } = {
      moduleId: manifest.id, name: manifest.name, version: manifest.version, packageType: manifest.packageType,
      permissions: manifest.permissions, accessRoles: manifest.accessRoles, capabilities: manifest.capabilities,
      backend: manifest.backend, frontend: manifest.frontend, health: "HEALTHY",
      serviceUrl: result.runtime?.serviceUrl, instanceId: result.runtime?.instanceId, imageDigest: result.runtime?.imageDigest,
    };
    await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "ACTIVE", installedById: actor.userId, installedAt: new Date(), migrationStatus: migrationNeeded ? "PASSED" : "NOT_REQUIRED", healthReport: sanitizeForApi(result), rollbackMetadata: { previousReleaseId: module.activeReleaseId, fromVersion: module.currentVersion, changes: sanitizeForApi((result.evidence as any).changes) } } });
    await db.platformModule.update({ where: { id: module.id }, data: {
      status: "ACTIVE", health: "HEALTHY", currentVersion: release.version, activeReleaseId: release.id, enabled: true,
      manifest, runtimeRegistration: registration, dependencies: manifest.dependencies, permissions: manifest.permissions,
      installedById: actor.userId, installedAt: module.installedAt ?? new Date(), lastHealthCheckAt: new Date(), lastError: null,
    } });
    await finishOperation(op.row.id, true, { runner: result, backupVerified: backupOk, migrations: migrationOk, databaseIntegrity: integrityOk, health: healthOk, changesRecorded, activated: true }, result.logs);
    await audit(actor, type === "UPDATE" ? "module.updated" : "module.installed", "platform_module", module.id, { moduleId: module.moduleKey, fromVersion: module.currentVersion, toVersion: release.version });
    await emitKernel("module.activated", { moduleId: module.moduleKey, version: release.version, releaseId: release.id });
    return publicModule(await this.get(module.id));
  },

  async lifecycleAction(actor: ModuleActor, moduleId: string, action: "ENABLE" | "DISABLE" | "RESTART" | "HEALTH_CHECK", idempotencyKey: string) {
    const module = await db.platformModule.findFirst({ where: { id: moduleId } });
    if (!module || !module.activeReleaseId) throw AppError.notFound("Active module not found");
    const release = await db.platformModuleRelease.findFirst({ where: { id: module.activeReleaseId } });
    if (!release) throw AppError.notFound("Active module release not found");
    const manifest = release.manifest as ModuleManifest;
    if (action === "RESTART" && !manifest.lifecycle.reloadSupported) throw AppError.conflict("This module does not declare restart/reload support");
    if (action === "ENABLE" && module.status !== "DISABLED") throw AppError.conflict("Only a disabled module can be enabled");
    if (action === "DISABLE" && module.status !== "ACTIVE") throw AppError.conflict("Only an active module can be disabled");
    const op = await operation({ moduleRegistryId: module.id, releaseId: release.id, type: action, actor, idempotencyKey, fromVersion: module.currentVersion ?? undefined, toVersion: module.currentVersion ?? undefined });
    if (op.duplicate) return publicModule(await this.get(module.id));
    const result = await runnerInput(module, release, actor, action, op.row.correlationId);
    const healthOk = action === "DISABLE" ? result.ok : result.ok && (result.evidence as any)?.health?.passed === true;
    if (healthOk) {
      const status = action === "DISABLE" ? "DISABLED" : "ACTIVE";
      const health = action === "DISABLE" ? "DISABLED" : "HEALTHY";
      await db.platformModule.update({ where: { id: module.id }, data: { status, health, enabled: action !== "DISABLE", lastHealthCheckAt: new Date(), lastError: null } });
      if (actor.organizationId) {
        if (action === "DISABLE") { await CapabilityRegistry.unregister(actor.organizationId, module.moduleKey); await PluginRegistry.setStatus(actor.organizationId, module.moduleKey, "disabled", actor.userId); }
        else await syncPluginInfrastructure(actor, module, release, result.runtime ?? module.runtimeRegistration);
      }
    } else await db.platformModule.update({ where: { id: module.id }, data: { health: "UNHEALTHY", lastHealthCheckAt: new Date(), lastError: `${action} failed health verification` } });
    await finishOperation(op.row.id, healthOk, { runner: result }, result.logs, healthOk ? undefined : { code: `MODULE_${action}_FAILED`, message: `${action} did not pass runner/health verification` });
    await audit(actor, healthOk ? `module.${action.toLowerCase()}` : "module.lifecycle_failed", "platform_module", module.id, { moduleId: module.moduleKey, action });
    if (healthOk) await emitKernel(`module.${action.toLowerCase()}`, { moduleId: module.moduleKey, version: module.currentVersion });
    return publicModule(await this.get(module.id));
  },

  async rollback(actor: ModuleActor, moduleId: string, idempotencyKey: string) {
    const module = await db.platformModule.findFirst({ where: { id: moduleId } });
    if (!module?.activeReleaseId) throw AppError.notFound("Active module not found");
    const current = await db.platformModuleRelease.findFirst({ where: { id: module.activeReleaseId } });
    if (!current?.previousReleaseId) throw AppError.conflict("No previous known-good release is recorded");
    const target = await db.platformModuleRelease.findFirst({ where: { id: current.previousReleaseId } });
    if (!target) throw AppError.conflict("Previous release artifact is unavailable");
    if (!(current.manifest as ModuleManifest).upgrade.rollbackSupported) throw AppError.conflict("Current release does not declare rollback support");
    const op = await operation({ moduleRegistryId: module.id, releaseId: current.id, type: "ROLLBACK", actor, idempotencyKey, fromVersion: current.version, toVersion: target.version });
    if (op.duplicate) return publicModule(await this.get(module.id));
    await db.platformModule.update({ where: { id: module.id }, data: { status: "ROLLING_BACK" } });
    const result = await runnerInput(module, current, actor, "ROLLBACK", op.row.correlationId, target);
    const ok = result.ok && (result.evidence as any)?.health?.passed === true && (!((current.manifest as ModuleManifest).database.migrations.length) || (result.evidence as any)?.migrations?.rollbackStatus === "PASSED");
    if (ok) {
      await syncPluginInfrastructure(actor, module, target, result.runtime);
      await db.platformModuleRelease.update({ where: { id: current.id }, data: { status: "FAILED", rollbackMetadata: { rolledBackAt: new Date().toISOString(), targetReleaseId: target.id } } });
      await db.platformModuleRelease.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
      const manifest = target.manifest as ModuleManifest;
      await db.platformModule.update({ where: { id: module.id }, data: { status: "ACTIVE", health: "HEALTHY", enabled: true, currentVersion: target.version, activeReleaseId: target.id, manifest, runtimeRegistration: { ...(module.runtimeRegistration ?? {}), version: target.version, serviceUrl: result.runtime?.serviceUrl }, lastHealthCheckAt: new Date(), lastError: null } });
    } else await db.platformModule.update({ where: { id: module.id }, data: { status: "FAILED", health: "UNHEALTHY", enabled: false, lastError: "Rollback failed verification" } });
    await finishOperation(op.row.id, ok, { runner: result, targetReleaseId: target.id }, result.logs, ok ? undefined : { code: "MODULE_ROLLBACK_FAILED", message: "Rollback target did not pass migration/health verification" });
    await audit(actor, ok ? "module.rolled_back" : "module.rollback_failed", "platform_module", module.id, { moduleId: module.moduleKey, fromVersion: current.version, toVersion: target.version });
    return publicModule(await this.get(module.id));
  },

  async remove(actor: ModuleActor, moduleId: string, idempotencyKey: string) {
    const module = await db.platformModule.findFirst({ where: { id: moduleId } });
    if (!module?.activeReleaseId) throw AppError.notFound("Installed module not found");
    if (module.status !== "DISABLED") throw AppError.conflict("Disable the module and verify the disabled state before removal");
    const release = await db.platformModuleRelease.findFirst({ where: { id: module.activeReleaseId } });
    const manifest = release?.manifest as ModuleManifest;
    if (!release || !manifest.lifecycle.removable) throw AppError.conflict("This module is protected from removal");
    const candidates = await db.platformModule.findMany({ where: { status: { in: ["ACTIVE", "DISABLED"] } } });
    const dependents = candidates.filter((candidate: any) => candidate.id !== module.id && Array.isArray(candidate.manifest?.dependencies) && candidate.manifest.dependencies.some((dependency: any) => dependency.id === module.moduleKey && !dependency.optional));
    if (dependents.length) throw AppError.conflict(`Module is required by: ${dependents.map((item: any) => item.moduleKey).join(", ")}`);
    const op = await operation({ moduleRegistryId: module.id, releaseId: release.id, type: "REMOVE", actor, idempotencyKey, fromVersion: module.currentVersion ?? undefined });
    if (op.duplicate) return publicModule(await this.get(module.id));
    await db.platformModule.update({ where: { id: module.id }, data: { status: "REMOVING" } });
    const result = await runnerInput(module, release, actor, "REMOVE", op.row.correlationId);
    const ok = result.ok && (!manifest.database.migrations.length || (result.evidence as any)?.migrations?.removalStatus === "PASSED");
    if (ok) {
      if (actor.organizationId) { await CapabilityRegistry.unregister(actor.organizationId, module.moduleKey); await PluginRegistry.uninstall(actor.organizationId, module.moduleKey, actor.userId); }
      await db.platformModuleRelease.update({ where: { id: release.id }, data: { status: "REMOVED" } });
      await db.platformModule.update({ where: { id: module.id }, data: { status: "REMOVED", health: "DISABLED", enabled: false, activeReleaseId: null, runtimeRegistration: {}, lastError: null } });
    } else await db.platformModule.update({ where: { id: module.id }, data: { status: "DISABLED", lastError: "Removal did not pass runner/migration verification" } });
    await finishOperation(op.row.id, ok, { runner: result }, result.logs, ok ? undefined : { code: "MODULE_REMOVE_FAILED", message: "Safe removal could not be verified" });
    await audit(actor, ok ? "module.removed" : "module.remove_failed", "platform_module", module.id, { moduleId: module.moduleKey, version: module.currentVersion });
    return publicModule(await this.get(module.id));
  },

  async dashboard() {
    const modules = await db.platformModule.findMany({});
    const releases = await db.platformModuleRelease.findMany({});
    return {
      total: modules.length, active: modules.filter((item: any) => item.status === "ACTIVE").length,
      disabled: modules.filter((item: any) => item.status === "DISABLED").length,
      failed: modules.filter((item: any) => item.status === "FAILED").length,
      quarantined: modules.filter((item: any) => item.status === "QUARANTINED").length,
      awaitingApproval: releases.filter((item: any) => item.status === "VALIDATED").length,
      updatesAvailable: modules.filter((module: any) => releases.some((release: any) => release.moduleRegistryId === module.id && release.status === "APPROVED" && release.version !== module.currentVersion)).length,
      runnerConfigured: !!process.env.MODULE_RUNNER_URL && !!process.env.MODULE_RUNNER_HMAC_SECRET,
      scannerConfigured: !!process.env.CLAMD_HOST,
      signatureKeysConfigured: signatureKeyCount(),
    };
  },
  async list() { return (await db.platformModule.findMany({ include: { releases: { orderBy: { createdAt: "desc" } }, operations: { orderBy: { createdAt: "desc" }, take: 10 } }, orderBy: { updatedAt: "desc" } })).map(publicModule); },
  async get(id: string) { const row = await db.platformModule.findFirst({ where: { id }, include: { releases: { orderBy: { createdAt: "desc" } }, operations: { orderBy: { createdAt: "desc" }, take: 200 } } }); if (!row) throw AppError.notFound("Module not found"); return publicModule(row); },
  async uploads(limit = 100) { return (await db.platformModuleUpload.findMany({ include: { release: true }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 200) })).map(publicUpload); },
  async operations(limit = 200) { return (await db.platformModuleOperation.findMany({ include: { moduleRegistry: { select: { id: true, moduleKey: true, name: true } }, release: { select: { id: true, version: true } }, requestedBy: { select: { id: true, email: true, profile: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 500) })).map((row: any) => sanitizeForApi(row)); },
  async runtimeRegistrations(role: string) {
    const modules = await db.platformModule.findMany({ where: { status: "ACTIVE", enabled: true } });
    return modules.map((item: any) => item.runtimeRegistration).filter((registration: any) => registration?.moduleId && Array.isArray(registration.accessRoles) && registration.accessRoles.includes(role)).map((registration: any) => { const { serviceUrl: _serviceUrl, ...safe } = registration; return safe; });
  },
};
