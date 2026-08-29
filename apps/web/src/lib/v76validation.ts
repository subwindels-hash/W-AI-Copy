/**
 * Session 76 — Final Enterprise Integration & Validation API client.
 * Session 195 — wired the new `run`, `history`, and per-org notes
 * methods; every call is now org-scoped via the standard `authenticate`
 * + `orgOf` route guards.
 */
import { api } from "./api";
import type { V76ValidationReport } from "@windels/shared";
export type { V76ValidationReport } from "@windels/shared";

export interface V76ReportSummary {
  id: string;
  generatedAt: string;
  wired: number;
  stubs: number;
  missing: number;
  duplicatesDetected: number;
  consentGateEnforced: boolean;
  governanceGateEnforced: boolean;
}

export interface V76NoteRecord {
  id: string;
  createdAt: string;
  createdBy?: string;
  title: string;
  body: string;
  tags: string[];
}

export const v76Api = {
  /** Most recent report body for the calling org (re-runs the probe on
   *  a fresh org, returns the persisted body afterwards). */
  report: () => api<V76ValidationReport>("/validation/report"),
  /** Re-runs the 22-system probe and persists the result. */
  run: () => api<V76ValidationReport>("/validation/run", { method: "POST" }),
  /** Newest-first list of the calling org's previous reports (capped). */
  history: () => api<V76ReportSummary[]>("/validation/history"),
  // Notes ledger (per-org via tenantStore)
  listNotes: () => api<V76NoteRecord[]>("/validation/notes"),
  createNote: (body: { title: string; body: string; tags?: string[] }) =>
    api<V76NoteRecord>("/validation/notes", { method: "POST", json: body }),
  updateNote: (id: string, body: { title?: string; body?: string; tags?: string[] }) =>
    api<V76NoteRecord>(`/validation/notes/${id}`, { method: "PATCH", json: body }),
  deleteNote: (id: string) =>
    api<void>(`/validation/notes/${id}`, { method: "DELETE" }),
};
