import { z } from "zod";

/** WINDELS signed module package (.wmod ZIP) and Module Center contracts. */
export const MODULE_PACKAGE_TYPES = ["module", "plugin", "integration", "approved_software"] as const;
export const MODULE_LIFECYCLE = [
  "UPLOADED", "SCANNING", "VALIDATING", "COMPATIBILITY_CHECK", "SANDBOX_TEST",
  "VALIDATED", "APPROVED", "INSTALLING", "MIGRATING", "HEALTH_CHECK", "ACTIVE",
  "DISABLED", "FAILED", "ROLLING_BACK", "QUARANTINED", "REMOVING", "REMOVED",
] as const;
export const MODULE_HEALTH = ["UNKNOWN", "HEALTHY", "DEGRADED", "UNHEALTHY", "DISABLED", "QUARANTINED"] as const;
export const MODULE_OPERATIONS = ["UPLOAD", "VERIFY", "SANDBOX_TEST", "APPROVE", "INSTALL", "UPDATE", "ENABLE", "DISABLE", "RESTART", "HEALTH_CHECK", "ROLLBACK", "REMOVE"] as const;

const Semver = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, "strict semantic version required");
const ModuleId = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])$/, "lowercase module id required");
const SafeRelativePath = z.string().min(1).max(240).refine((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."), "safe package-relative path required");
const RelativeRoute = z.string().regex(/^\/(?:[a-zA-Z0-9:_*.-]+\/?)*$/, "relative API route required").refine((value) => !value.includes("..") && !value.startsWith("/api/"), "routes are mounted below the module gateway");

export const ModuleDependencySchema = z.object({
  id: ModuleId,
  version: z.string().min(1).max(80),
  optional: z.boolean().default(false),
}).strict();

export const ModuleApiRouteSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: RelativeRoute,
  permission: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
}).strict();

const FrontendSectionSchema = z.object({
  type: z.enum(["info", "markdown", "links"]),
  title: z.string().min(1).max(120),
  body: z.string().max(10_000).optional(),
  links: z.array(z.object({ label: z.string().min(1).max(80), href: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "module links must use HTTPS") }).strict()).max(20).optional(),
}).strict();

export const ModuleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: ModuleId,
  name: z.string().min(2).max(100),
  version: Semver,
  platform: z.literal("windels-ai-os"),
  packageType: z.enum(MODULE_PACKAGE_TYPES),
  description: z.string().min(10).max(3000),
  author: z.string().min(2).max(120),
  vendor: z.string().min(2).max(120),
  license: z.string().min(1).max(80),
  minimumVersion: Semver,
  maximumVersion: Semver.optional(),
  apiVersion: z.literal("v1"),
  dependencies: z.array(ModuleDependencySchema).max(100).default([]),
  permissions: z.array(z.string().min(2).max(80)).max(100).default([]),
  accessRoles: z.array(z.enum(["user", "admin", "super_admin"])).min(1).default(["super_admin"]),
  capabilities: z.array(z.string().min(2).max(100)).max(100).default([]),
  backend: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(["none", "external_service"]).default("none"),
    routes: z.array(ModuleApiRouteSchema).max(200).default([]),
    healthPath: RelativeRoute.optional(),
    webhooks: z.array(RelativeRoute).max(50).default([]),
    backgroundJobs: z.array(z.string().min(2).max(100)).max(100).default([]),
    eventHandlers: z.array(z.string().min(2).max(120)).max(100).default([]),
  }).strict().default({ enabled: false, mode: "none", routes: [], webhooks: [], backgroundJobs: [], eventHandlers: [] }),
  frontend: z.object({
    enabled: z.boolean().default(false),
    mode: z.literal("declarative").default("declarative"),
    navigation: z.array(z.object({ label: z.string().min(1).max(60), path: RelativeRoute, icon: z.string().max(40).default("Puzzle"), order: z.number().int().min(0).max(10_000).default(500) }).strict()).max(20).default([]),
    pages: z.array(z.object({ path: RelativeRoute, title: z.string().min(1).max(120), description: z.string().max(500).optional(), sections: z.array(FrontendSectionSchema).max(30).default([]) }).strict()).max(50).default([]),
  }).strict().default({ enabled: false, mode: "declarative", navigation: [], pages: [] }),
  database: z.object({
    migrations: z.array(SafeRelativePath).max(100).default([]),
    mode: z.enum(["none", "isolated_schema", "platform_schema"]).default("none"),
    rollbackFiles: z.array(SafeRelativePath).max(100).default([]),
    backupRequired: z.boolean().default(true),
  }).strict().default({ migrations: [], mode: "none", rollbackFiles: [], backupRequired: true }),
  agents: z.object({ definitions: z.array(SafeRelativePath).max(100).default([]) }).strict().default({ definitions: [] }),
  workflows: z.object({ definitions: z.array(SafeRelativePath).max(100).default([]) }).strict().default({ definitions: [] }),
  configuration: z.object({ schema: SafeRelativePath.optional(), documentation: SafeRelativePath.optional() }).strict().default({}),
  documentation: z.array(SafeRelativePath).max(100).default([]),
  tests: z.object({
    command: z.string().min(1).max(500).optional(),
    categories: z.array(z.enum(["unit", "integration", "api", "database", "permission", "security", "health", "frontend", "workflow", "agent"])).min(1),
  }).strict(),
  healthChecks: z.array(z.object({ name: z.string().min(1).max(100), type: z.enum(["http", "runner"]), path: RelativeRoute.optional(), timeoutMs: z.number().int().min(100).max(60_000).default(5000) }).strict()).min(1).max(20),
  resources: z.object({ memoryMb: z.number().int().min(16).max(32_768), cpuMillicores: z.number().int().min(10).max(32_000), storageMb: z.number().int().min(1).max(1_000_000), networkAccess: z.boolean().default(false) }).strict(),
  lifecycle: z.object({ reloadSupported: z.boolean().default(false), removable: z.boolean().default(true) }).strict().default({ reloadSupported: false, removable: true }),
  upgrade: z.object({
    from: z.array(z.string().min(1).max(80)).max(50).default([]),
    rollbackSupported: z.boolean(),
    allowDowngrade: z.boolean().default(false),
    requiresDowntime: z.boolean().default(false),
    instructions: SafeRelativePath.optional(),
  }).strict(),
  conflicts: z.object({ moduleIds: z.array(ModuleId).max(100).default([]), capabilities: z.array(z.string().min(2).max(100)).max(100).default([]) }).strict().default({ moduleIds: [], capabilities: [] }),
}).strict().superRefine((manifest, ctx) => {
  if (manifest.backend.enabled && manifest.backend.mode === "none") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["backend", "mode"], message: "enabled backend requires external_service mode" });
  if (!manifest.backend.enabled && (manifest.backend.routes.length || manifest.backend.backgroundJobs.length || manifest.backend.eventHandlers.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["backend"], message: "disabled backend cannot declare runtime components" });
  if (!manifest.frontend.enabled && (manifest.frontend.navigation.length || manifest.frontend.pages.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frontend"], message: "disabled frontend cannot declare navigation/pages" });
  if (manifest.database.mode === "none" && manifest.database.migrations.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["database"], message: "migration files require a database mode" });
  if (manifest.database.migrations.length && manifest.database.rollbackFiles.length === 0 && manifest.upgrade.rollbackSupported) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["database", "rollbackFiles"], message: "rollback-supported database changes require rollback files" });
  const routeKeys = manifest.backend.routes.map((route) => `${route.method} ${route.path}`);
  if (new Set(routeKeys).size !== routeKeys.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["backend", "routes"], message: "duplicate API routes are not allowed" });
  const pagePaths = manifest.frontend.pages.map((page) => page.path);
  if (new Set(pagePaths).size !== pagePaths.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frontend", "pages"], message: "duplicate frontend page paths are not allowed" });
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export interface ModuleCheckResult {
  code: string;
  category: "integrity" | "signature" | "malware" | "manifest" | "compatibility" | "dependency" | "permission" | "migration" | "conflict" | "resource" | "sandbox" | "health";
  status: "PASSED" | "FAILED" | "WARNING" | "NOT_CONFIGURED" | "SKIPPED";
  severity: "info" | "warning" | "critical";
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ModuleVerificationReport {
  releaseId: string;
  checksum: string;
  verifiedAt: string;
  passed: boolean;
  checks: ModuleCheckResult[];
  fileCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
}

export interface ModuleRunnerResult {
  ok: boolean;
  action: string;
  status: "PASSED" | "FAILED" | "NOT_CONFIGURED";
  checks: ModuleCheckResult[];
  logs: string[];
  evidence: Record<string, unknown>;
  runtime?: { serviceUrl?: string; instanceId?: string; imageDigest?: string };
  rollbackPerformed?: boolean;
}

export interface ModuleRuntimeRegistration {
  moduleId: string;
  name: string;
  version: string;
  packageType: typeof MODULE_PACKAGE_TYPES[number];
  permissions: string[];
  accessRoles: Array<"user" | "admin" | "super_admin">;
  capabilities: string[];
  backend: ModuleManifest["backend"];
  frontend: ModuleManifest["frontend"];
  health: typeof MODULE_HEALTH[number];
}
