import { api, apiRaw } from "./api";
import type { ModuleManifest, ModuleRuntimeRegistration, ModuleVerificationReport } from "@windels/shared/moduleCenter";

export interface ModuleReleaseRow {
  id: string; moduleRegistryId: string; version: string; status: string; checksum: string; packageSizeBytes: number;
  manifest: ModuleManifest; signatureKeyId: string | null; signatureVerified: boolean; scanStatus: string;
  compatibilityStatus: string; sandboxStatus: string; approvalStatus: string; migrationStatus: string;
  verificationReport: ModuleVerificationReport | Record<string, never>; sandboxReport: any; healthReport: any;
  rollbackMetadata: any; previousReleaseId: string | null; uploadedAt: string; verifiedAt: string | null;
  sandboxedAt: string | null; approvedAt: string | null; installedAt: string | null;
}
export interface PlatformModuleRow {
  id: string; moduleKey: string; name: string; packageType: string; description: string; vendor: string;
  status: string; health: string; currentVersion: string | null; activeReleaseId: string | null; enabled: boolean;
  manifest: ModuleManifest | Record<string, never>; dependencies: Array<{ id: string; version: string; optional: boolean }>;
  permissions: string[]; installedAt: string | null; lastHealthCheckAt: string | null; lastError: string | null;
  createdAt: string; updatedAt: string; releases: ModuleReleaseRow[]; operations: ModuleOperationRow[];
}
export interface ModuleOperationRow {
  id: string; moduleRegistryId: string; releaseId: string | null; operationType: string; status: string;
  correlationId: string; fromVersion: string | null; toVersion: string | null; result: any; logs: string[];
  errorCode: string | null; errorMessage: string | null; startedAt: string | null; completedAt: string | null; createdAt: string;
  moduleRegistry?: { id: string; moduleKey: string; name: string }; release?: { id: string; version: string } | null;
  requestedBy?: { id: string; email: string; profile?: { displayName?: string } };
}
export interface ModuleUploadRow { id: string; originalName: string; checksum: string; sizeBytes: number; status: string; manifestId: string | null; manifestVersion: string | null; signatureKeyId: string | null; report: any; releaseId: string | null; createdAt: string; release?: ModuleReleaseRow | null }
export interface ModuleDashboard { total: number; active: number; disabled: number; failed: number; quarantined: number; awaitingApproval: number; updatesAvailable: number; runnerConfigured: boolean; scannerConfigured: boolean; signatureKeysConfigured: number }

const actionKey = (action: string) => `module-${action}-${crypto.randomUUID()}`;
export const moduleCenterApi = {
  dashboard: () => api.get<ModuleDashboard>("/super-admin/module-center/dashboard"),
  modules: () => api.get<PlatformModuleRow[]>("/super-admin/module-center/modules"),
  module: (id: string) => api.get<PlatformModuleRow>(`/super-admin/module-center/modules/${id}`),
  uploads: () => api.get<ModuleUploadRow[]>("/super-admin/module-center/uploads"),
  operations: () => api.get<ModuleOperationRow[]>("/super-admin/module-center/operations"),
  upload: async (file: File, signatureKeyId: string, signature: string) => {
    const body = new FormData(); body.set("package", file); body.set("signatureKeyId", signatureKeyId); body.set("signature", signature);
    return (await apiRaw<{ upload: ModuleUploadRow; release: ModuleReleaseRow; module: PlatformModuleRow; nextAction: string }>("/super-admin/module-center/uploads", { method: "POST", body })).data;
  },
  releaseAction: (releaseId: string, action: "verify" | "sandbox-test" | "approve" | "install") => api.post<any>(`/super-admin/module-center/releases/${releaseId}/${action}`, { idempotencyKey: actionKey(action) }),
  moduleAction: (moduleId: string, action: "enable" | "disable" | "restart" | "health-check" | "rollback" | "remove") => api.post<PlatformModuleRow>(`/super-admin/module-center/modules/${moduleId}/${action}`, { idempotencyKey: actionKey(action) }),
};
export const moduleRuntimeApi = {
  registrations: () => api.get<ModuleRuntimeRegistration[]>("/module-runtime/registrations"),
};
