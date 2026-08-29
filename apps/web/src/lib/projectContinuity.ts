/**
 * Session 84 — Project Continuity Engine API client.
 */
import { api } from "./api";
import type {
  PcProject, PcInventory, PcVerification, PcSnapshot, PcDiffResult, PcChangeLogEntry,
  PcHealthReport, PcArchitectureMap, PcSandboxResult, PcArchiveInspection,
} from "@windels/shared";
export type {
  PcProject, PcInventory, PcVerification, PcSnapshot, PcDiffResult, PcChangeLogEntry,
  PcHealthReport, PcArchitectureMap, PcSandboxResult, PcArchiveInspection,
} from "@windels/shared";

/** Legacy admin-tab client shape (PlatformPage Session 84 tab). The real
 *  backend records are adapted to include the friendly fields the tab reads. */
export type ProjectIntakeRecord = Omit<PcProject, "status"> & {
  originalname: string;
  size: number;
  hash: string;
  status: PcProject["status"] | "scanning";
};

function toLegacyRecord(p: PcProject): ProjectIntakeRecord {
  return { ...p, originalname: p.filename, size: p.sizeBytes, hash: p.sha256 };
}

export const projectContinuityApi = {
  list: async (): Promise<ProjectIntakeRecord[]> => (await api.get<PcProject[]>("/projects")).map(toLegacyRecord),
  extract: async (id: string): Promise<ProjectIntakeRecord> => toLegacyRecord(await api.post<PcProject>(`/projects/${id}/extract`)),
  inventory: async (id: string): Promise<ProjectIntakeRecord> => toLegacyRecord(await api.post<PcProject>(`/projects/${id}/inventory`)),
  verify: async (id: string): Promise<ProjectIntakeRecord> => toLegacyRecord(await api.post<PcProject>(`/projects/${id}/verify`)),
};

export const projectsApi = {
  list: () => api.get<PcProject[]>("/projects"),
  get: (id: string) => api.get<PcProject>(`/projects/${id}`),
  intake: uploadProjectArchive,
  extract: (id: string) => api.post<PcProject>(`/projects/${id}/extract`),
  inventory: (id: string) => api.post<PcInventory>(`/projects/${id}/inventory`),
  verify: (id: string) => api.post<PcVerification>(`/projects/${id}/verify`),
  sandbox: (id: string) => api.post<PcSandboxResult>(`/projects/${id}/sandbox-validate`),
  health: (id: string) => api.get<PcHealthReport>(`/projects/${id}/health`),
  architecture: (id: string) => api.get<PcArchitectureMap>(`/projects/${id}/architecture`),
  snapshot: (id: string, note?: string) => api.post<PcSnapshot>(`/projects/${id}/snapshot`, note ? { note } : undefined),
  snapshots: (id: string) => api.get<PcSnapshot[]>(`/projects/${id}/snapshots`),
  diff: (id: string, from: string, to: string) => api.post<PcDiffResult>(`/projects/${id}/diff`, { from, to }),
  rollback: (id: string, snapshotId: string) => api.post(`/projects/${id}/rollback`, { snapshotId }),
  changelog: (id: string) => api.get<PcChangeLogEntry[]>(`/projects/${id}/changelog`),
  quarantine: () => api.get<PcProject[]>("/projects/quarantine"),
  quarantineRelease: (id: string) => api.post<PcProject>(`/projects/quarantine/${id}/release`),
  quarantineDelete: (id: string) => api.del(`/projects/quarantine/${id}`),
  quarantineSweep: () => api.post("/projects/quarantine/sweep"),
  quarantineInspect: (id: string) => api.post<{ id: string; sha256: string; sizeBytes: number; findings: unknown[] }>(`/projects/quarantine/${id}/inspect`),
  remove: (id: string) => api.del(`/projects/${id}`),
};

/** Multipart upload (FormData — the JSON client cannot send it). */
async function uploadProjectArchive(file: File): Promise<PcProject> {
  const { useAuthStore } = await import("@/store/auth");
  const token = useAuthStore.getState().accessToken;
  const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
  const fd = new FormData();
  fd.append("archive", file, file.name);
  const res = await fetch(`${base}/projects/intake`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error?.message ?? `Upload failed (HTTP ${res.status})`);
  }
  return body.data as PcProject;
}
