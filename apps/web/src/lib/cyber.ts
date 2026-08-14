/**
 * Session 82 / 161 — Cybersecurity Academy & Multi-Cloud Security client.
 *
 * Types are imported for local scope AND re-exported for consumers (the S152
 * lesson, now the standing convention for module clients).
 */
import { api } from "./api";
import type {
  CyberDashboard, CyberLab, CyberCourse, CyberChallenge,
  CyberCertification, CyberCertificationTrack, CyberRange,
  CloudSecurityFinding, CyberConnector,
  CreateFindingInput, UpdateFindingInput, CreateCertificationInput,
  CreateRangeInput, UpdateRangeInput, StartLabInput,
} from "@windels/shared";

export type {
  CyberDashboard, CyberLab, CyberCourse, CyberChallenge,
  CyberCertification, CyberCertificationTrack, CyberRange,
  CloudSecurityFinding, CyberConnector,
  CreateFindingInput, UpdateFindingInput, CreateCertificationInput,
  CreateRangeInput, UpdateRangeInput, StartLabInput,
};
export {
  CYBER_DOMAINS, CYBER_LEVELS, CYBER_CLOUDS, CYBER_RANGE_KINDS,
  FINDING_SEVERITIES, FINDING_STATUSES,
} from "@windels/shared";

export const cybApi = {
  dashboard: () => api<CyberDashboard>("/cyber/dashboard/rollup"),

  // Catalogue
  courses: () => api<CyberCourse[]>("/cyber/courses"),
  challenges: () => api<CyberChallenge[]>("/cyber/challenges"),
  certificationTracks: () => api<CyberCertificationTrack[]>("/cyber/certification-tracks"),
  connectors: () => api<CyberConnector[]>("/cyber/connectors"),
  health: () => api<{
    findings: number; scannerReportedFindings: number; openFindings: number;
    certificationsRecorded: number; connectors: CyberConnector[]; note: string;
  }>("/cyber/health"),

  // Labs
  labs: () => api<CyberLab[]>("/cyber/labs"),
  startLab: (input: StartLabInput) => api<CyberLab>("/cyber/labs", { method: "POST", json: input }),
  stopLab: (id: string) => api<CyberLab>(`/cyber/labs/${id}/stop`, { method: "POST" }),

  // Cloud posture
  findings: () => api<CloudSecurityFinding[]>("/cyber/findings"),
  createFinding: (input: CreateFindingInput) =>
    api<CloudSecurityFinding>("/cyber/findings", { method: "POST", json: input }),
  updateFinding: (id: string, input: UpdateFindingInput) =>
    api<CloudSecurityFinding>(`/cyber/findings/${id}`, { method: "PATCH", json: input }),

  // Certifications
  certifications: () => api<CyberCertification[]>("/cyber/certifications"),
  createCertification: (input: CreateCertificationInput) =>
    api<CyberCertification>("/cyber/certifications", { method: "POST", json: input }),

  // Ranges
  ranges: () => api<CyberRange[]>("/cyber/ranges"),
  createRange: (input: CreateRangeInput) =>
    api<CyberRange>("/cyber/ranges", { method: "POST", json: input }),
  updateRange: (id: string, input: UpdateRangeInput) =>
    api<CyberRange>(`/cyber/ranges/${id}`, { method: "PATCH", json: input }),
};
