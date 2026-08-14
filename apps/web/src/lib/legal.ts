/** Session 66 — Legal Intelligence client + public marketing legal docs */
import { api } from "./api";
import type {
  LegalDashboard, LegalResearchItem, RegulatoryUpdate, LegalMatter, Contract,
} from "@windels/shared";
export type {
  LegalDashboard, LegalResearchItem, RegulatoryUpdate, LegalMatter, Contract,
} from "@windels/shared";

export const legalApi = {
  dashboard: () => api<LegalDashboard>("/legal/dashboard/rollup"),
  listMatters: () => api<LegalMatter[]>("/legal/matters"),
  createMatter: (input: { title: string; kind: LegalMatter["kind"]; riskScore: number; dueDate?: string; summary?: string }) =>
    api<LegalMatter>("/legal/matters", { method: "POST", json: input }),
  updateMatterStatus: (id: string, status: LegalMatter["status"]) =>
    api<LegalMatter>(`/legal/matters/${id}/status`, { method: "PATCH", json: { status } }),
  listContracts: () => api<Contract[]>("/legal/contracts"),
  createContract: (input: { title: string; counterparty: string; type: Contract["type"]; valueUsd?: number }) =>
    api<Contract>("/legal/contracts", { method: "POST", json: input }),
  listUpdates: () => api<RegulatoryUpdate[]>("/legal/updates"),
  createUpdate: (input: { jurisdiction: string; title: string; topic: string; impact: RegulatoryUpdate["impact"]; summary?: string }) =>
    api<RegulatoryUpdate>("/legal/updates", { method: "POST", json: input }),
  listResearch: () => api<LegalResearchItem[]>("/legal/research"),
  research: (query: string) => api<LegalResearchItem>("/legal/research", { method: "POST", json: { query } }),
  acknowledge: (id: string) => api<RegulatoryUpdate>(`/legal/updates/${id}/acknowledge`, { method: "POST" }),
};

export interface LegalDoc { id: string; title: string; updated: string; sections: Array<{ heading: string; body: string | string[] }>; }
export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: "terms", title: "Terms of Service", updated: "2026-01-15",
    sections: [
      { heading: "Acceptance", body: "By using WINDELS AI OS you agree to these terms." },
      { heading: "Account Responsibilities", body: ["You are responsible for activity under your account.","Keep credentials secure.","Do not attempt to bypass access controls."] },
      { heading: "Acceptable Use", body: "No unlawful, infringing, or harmful content or activity." },
      { heading: "Termination", body: "We may suspend accounts that violate these terms." },
    ],
  },
  {
    id: "privacy", title: "Privacy Policy", updated: "2026-01-15",
    sections: [
      { heading: "Data We Collect", body: "Account info, usage telemetry, and content you create." },
      { heading: "How We Use Data", body: ["To provide the service.","To improve models (opt-out available).","For security and abuse prevention."] },
      { heading: "Your Rights", body: "Access, correction, deletion, and portability rights apply per GDPR/CCPA." },
    ],
  },
  {
    id: "security", title: "Security", updated: "2026-01-15",
    sections: [
      { heading: "Encryption", body: "TLS in transit; AES-256 at rest." },
      { heading: "Compliance", body: ["SOC 2 Type II","HIPAA BAA available","GDPR processing agreement"] },
      { heading: "Reporting", body: "Report vulnerabilities to security@windels.ai." },
    ],
  },
];
