/**
 * Session 76 — Final Enterprise Integration & Validation API client.
 */
import { api } from "./api";
import type { V76ValidationReport } from "@windels/shared";
export type { V76ValidationReport } from "@windels/shared";

export const v76Api = {
  report: () => api<V76ValidationReport>("/validation/report"),
};
