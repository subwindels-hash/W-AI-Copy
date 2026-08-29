import { promises as fs } from "node:fs";
import { createHash, createPublicKey, verify as verifyCrypto } from "node:crypto";
import semver from "semver";
import { Permission } from "@prisma/client";
import { scanBufferWithClamav, type ClamavScanResult } from "../projectContinuity/clamav.service.js";
import { prisma } from "../db/client.js";
import type { ModuleArchiveInspection } from "./archive.service.js";
import type { ModuleCheckResult, ModuleVerificationReport } from "@windels/shared/moduleCenter";

const db = prisma as any;
type Check = ModuleCheckResult;
const check = (code: string, category: Check["category"], status: Check["status"], severity: Check["severity"], message: string, evidence?: Record<string, unknown>): Check => ({ code, category, status, severity, message, ...(evidence ? { evidence } : {}) });

function publisherKeys(): Record<string, string> {
  try {
    const parsed = JSON.parse(process.env.MODULE_TRUSTED_PUBLISHER_KEYS ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

export function verifyDetachedSignature(checksum: string, keyId: string | undefined, signature: string | undefined, keys = publisherKeys()): Check {
  if (!keyId || !signature) return check("SIGNATURE_REQUIRED", "signature", "FAILED", "critical", "A detached Ed25519 package signature and trusted publisher key ID are required.");
  const pem = keys[keyId];
  if (!pem) return check("PUBLISHER_KEY_UNTRUSTED", "signature", "FAILED", "critical", `Publisher key ${keyId} is not in the trusted key registry.`);
  try {
    const ok = verifyCrypto(null, Buffer.from(`windels-module:${checksum}`, "utf8"), createPublicKey(pem), Buffer.from(signature, "base64"));
    return ok
      ? check("SIGNATURE_VERIFIED", "signature", "PASSED", "info", `Detached Ed25519 signature verified with key ${keyId}.`, { keyId })
      : check("SIGNATURE_INVALID", "signature", "FAILED", "critical", "Detached package signature does not match the uploaded bytes.", { keyId });
  } catch (error) {
    return check("SIGNATURE_INVALID", "signature", "FAILED", "critical", `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`, { keyId });
  }
}

function staticChecks(inspection: ModuleArchiveInspection): Check[] {
  const checks: Check[] = [];
  const paths = new Set(inspection.entries.filter((entry) => !entry.directory).map((entry) => entry.path));
  const manifest = inspection.manifest;
  const references = [
    ...manifest.database.migrations, ...manifest.database.rollbackFiles,
    ...manifest.agents.definitions, ...manifest.workflows.definitions,
    ...manifest.documentation,
    ...(manifest.configuration.schema ? [manifest.configuration.schema] : []),
    ...(manifest.configuration.documentation ? [manifest.configuration.documentation] : []),
    ...(manifest.upgrade.instructions ? [manifest.upgrade.instructions] : []),
  ];
  const missing = references.filter((file) => !paths.has(file));
  checks.push(missing.length
    ? check("DECLARED_FILES_MISSING", "manifest", "FAILED", "critical", `Manifest references ${missing.length} missing file(s).`, { files: missing.slice(0, 50) })
    : check("DECLARED_FILES_PRESENT", "manifest", "PASSED", "info", "All manifest-declared files are present."));

  const packageJsonText = inspection.textFiles["package.json"];
  if (packageJsonText) {
    try {
      const packageJson = JSON.parse(packageJsonText);
      const scripts = packageJson?.scripts ?? {};
      const lifecycle = ["preinstall", "install", "postinstall", "prepare"].filter((name) => typeof scripts[name] === "string");
      checks.push(lifecycle.length
        ? check("INSTALL_LIFECYCLE_SCRIPTS", "migration", "FAILED", "critical", "Package manager lifecycle scripts are not permitted in installable modules.", { scripts: lifecycle })
        : check("NO_INSTALL_LIFECYCLE_SCRIPTS", "migration", "PASSED", "info", "No package-manager install lifecycle scripts were declared."));
    } catch {
      checks.push(check("PACKAGE_JSON_INVALID", "manifest", "FAILED", "critical", "package.json is not valid JSON."));
    }
  }

  const risky: Array<{ file: string; pattern: string }> = [];
  const critical: Array<{ file: string; pattern: string }> = [];
  const riskPatterns: Array<[RegExp, string]> = [
    [/\bchild_process\b|\bexecSync\s*\(|\bspawnSync\s*\(/, "process execution"],
    [/\beval\s*\(|new\s+Function\s*\(/, "dynamic code execution"],
    [/process\.binding\s*\(|process\._linkedBinding\s*\(/, "native process binding"],
    [/\b(?:curl|wget)\b.+https?:\/\//, "network download command"],
  ];
  const sqlCritical: Array<[RegExp, string]> = [
    [/\bDROP\s+(?:DATABASE|SCHEMA)\b/i, "drop database/schema"],
    [/\bALTER\s+SYSTEM\b/i, "alter system"],
    [/\bCOPY\b[\s\S]{0,200}\bPROGRAM\b/i, "database program execution"],
    [/\bTRUNCATE\b/i, "truncate data"],
  ];
  for (const [file, content] of Object.entries(inspection.textFiles)) {
    for (const [pattern, label] of riskPatterns) if (pattern.test(content)) risky.push({ file, pattern: label });
    if (/\.sql$/i.test(file)) for (const [pattern, label] of sqlCritical) if (pattern.test(content)) critical.push({ file, pattern: label });
  }
  checks.push(critical.length
    ? check("UNSAFE_MIGRATION_CONTENT", "migration", "FAILED", "critical", "Destructive or host-executing SQL was found.", { findings: critical.slice(0, 50) })
    : check("MIGRATION_STATIC_SCAN", "migration", "PASSED", "info", "No prohibited destructive SQL patterns were found."));
  if (risky.length) checks.push(check("PRIVILEGED_CODE_PATTERNS", "compatibility", "WARNING", "warning", "Privileged code patterns require sandbox and security review; uploaded code is not executed in the API process.", { findings: risky.slice(0, 50) }));
  else checks.push(check("STATIC_SOURCE_SCAN", "compatibility", "PASSED", "info", "No privileged source patterns were detected in inspectable text files."));
  return checks;
}

async function compatibilityChecks(inspection: ModuleArchiveInspection, platformVersion: string): Promise<Check[]> {
  const manifest = inspection.manifest;
  const checks: Check[] = [];
  const validPlatform = semver.valid(platformVersion);
  const minimumOk = validPlatform && semver.gte(platformVersion, manifest.minimumVersion);
  const maximumOk = !manifest.maximumVersion || (validPlatform && semver.lte(platformVersion, manifest.maximumVersion));
  checks.push(minimumOk && maximumOk
    ? check("PLATFORM_VERSION_COMPATIBLE", "compatibility", "PASSED", "info", `Platform ${platformVersion} is within the declared compatibility range.`)
    : check("PLATFORM_VERSION_INCOMPATIBLE", "compatibility", "FAILED", "critical", `Platform ${platformVersion} is outside ${manifest.minimumVersion}..${manifest.maximumVersion ?? "unbounded"}.`));

  const knownPermissions = new Set(Object.values(Permission));
  const unknownPermissions = manifest.permissions.filter((permission) => !knownPermissions.has(permission as Permission));
  const routeUnknown = manifest.backend.routes.map((route) => route.permission).filter((permission) => !knownPermissions.has(permission as Permission));
  const unknown = [...new Set([...unknownPermissions, ...routeUnknown])];
  checks.push(unknown.length
    ? check("UNKNOWN_PLATFORM_PERMISSIONS", "permission", "FAILED", "critical", "Module requests permissions not defined by WINDELS IAM.", { permissions: unknown })
    : check("PERMISSIONS_REUSED", "permission", "PASSED", "info", "All requested permissions reuse the existing WINDELS permission catalog."));

  const modules = await db.platformModule.findMany({ where: { status: { in: ["ACTIVE", "DISABLED"] } } });
  const byKey = new Map(modules.map((module: any) => [module.moduleKey, module]));
  const dependencyFailures: Array<Record<string, unknown>> = [];
  for (const dependency of manifest.dependencies) {
    const installed: any = byKey.get(dependency.id);
    if (!installed && !dependency.optional) dependencyFailures.push({ id: dependency.id, reason: "not installed" });
    else if (installed?.currentVersion && !semver.satisfies(installed.currentVersion, dependency.version, { includePrerelease: true }) && !dependency.optional) dependencyFailures.push({ id: dependency.id, reason: `installed ${installed.currentVersion} does not satisfy ${dependency.version}` });
  }
  checks.push(dependencyFailures.length
    ? check("DEPENDENCIES_UNSATISFIED", "dependency", "FAILED", "critical", "Required module dependencies are not satisfied.", { dependencies: dependencyFailures })
    : check("DEPENDENCIES_SATISFIED", "dependency", "PASSED", "info", "Required module dependencies are satisfied."));

  const conflicts = modules.filter((module: any) => manifest.conflicts.moduleIds.includes(module.moduleKey));
  const activeCapabilities = modules.flatMap((module: any) => Array.isArray(module.manifest?.capabilities) ? module.manifest.capabilities.map((capability: string) => ({ moduleId: module.moduleKey, capability })) : []);
  const capabilityConflicts = activeCapabilities.filter(({ capability }: any) => manifest.conflicts.capabilities.includes(capability));
  checks.push(conflicts.length || capabilityConflicts.length
    ? check("MODULE_CONFLICT", "conflict", "FAILED", "critical", "Declared module or capability conflicts are active.", { modules: conflicts.map((module: any) => module.moduleKey), capabilities: capabilityConflicts })
    : check("NO_DECLARED_CONFLICTS", "conflict", "PASSED", "info", "No declared module or capability conflicts are active."));

  const maxMemory = Number(process.env.MODULE_MAX_MEMORY_MB ?? 4096);
  const maxCpu = Number(process.env.MODULE_MAX_CPU_MILLICORES ?? 4000);
  const resourceOk = manifest.resources.memoryMb <= maxMemory && manifest.resources.cpuMillicores <= maxCpu;
  checks.push(resourceOk
    ? check("RESOURCE_LIMITS_ACCEPTED", "resource", "PASSED", "info", "Declared resources are inside platform policy.", manifest.resources)
    : check("RESOURCE_LIMITS_EXCEEDED", "resource", "FAILED", "critical", `Declared resources exceed policy (${maxMemory} MB, ${maxCpu} millicores).`, manifest.resources));
  return checks;
}

export async function verifyModulePackage(input: {
  releaseId: string;
  artifactPath: string;
  checksum: string;
  signatureKeyId?: string;
  signature?: string;
  inspection: ModuleArchiveInspection;
  platformVersion?: string;
  clamScan?: (buffer: Buffer) => Promise<ClamavScanResult>;
  trustedKeys?: Record<string, string>;
}): Promise<ModuleVerificationReport> {
  const packageBuffer = await fs.readFile(input.artifactPath);
  const actualChecksum = createHash("sha256").update(packageBuffer).digest("hex");
  const integrityOk = actualChecksum === input.checksum;
  const checks: Check[] = [integrityOk
    ? check("CHECKSUM_RECOMPUTED", "integrity", "PASSED", "info", "Stored package bytes still match the bounded streaming-intake SHA-256.", { sha256: actualChecksum })
    : check("CHECKSUM_MISMATCH", "integrity", "FAILED", "critical", "Stored package bytes changed after intake; verification is blocked.", { expected: input.checksum, actual: actualChecksum })];
  checks.push(verifyDetachedSignature(input.checksum, input.signatureKeyId, input.signature, input.trustedKeys ?? publisherKeys()));
  const malware = await (input.clamScan ? input.clamScan(packageBuffer) : scanBufferWithClamav(packageBuffer));
  if (malware.status === "clean") checks.push(check("MALWARE_SCAN_CLEAN", "malware", "PASSED", "info", "ClamAV reported the complete package clean.", { detail: malware.detail }));
  else if (malware.status === "infected") checks.push(check("MALWARE_DETECTED", "malware", "FAILED", "critical", `Malware detected: ${malware.signature ?? "unknown signature"}.`, { detail: malware.detail }));
  else if (malware.status === "not_configured") checks.push(check("MALWARE_SCANNER_NOT_CONFIGURED", "malware", "NOT_CONFIGURED", "critical", "ClamAV is not configured. Production verification fails closed."));
  else checks.push(check("MALWARE_SCAN_ERROR", "malware", "FAILED", "critical", `Malware scanner failed: ${malware.detail ?? "unknown error"}.`));
  checks.push(check("ARCHIVE_STRUCTURE_VALID", "integrity", "PASSED", "info", `Archive paths, sizes, compression ratios, links, encryption flags, and manifest structure passed (${input.inspection.fileCount} files).`));
  checks.push(...staticChecks(input.inspection));
  checks.push(...await compatibilityChecks(input.inspection, input.platformVersion ?? process.env.WINDELS_PLATFORM_VERSION ?? "0.1.0"));
  const passed = !checks.some((item) => item.severity === "critical" && item.status !== "PASSED");
  return {
    releaseId: input.releaseId,
    checksum: input.checksum,
    verifiedAt: new Date().toISOString(),
    passed,
    checks,
    fileCount: input.inspection.fileCount,
    compressedBytes: input.inspection.compressedBytes,
    uncompressedBytes: input.inspection.uncompressedBytes,
  };
}
