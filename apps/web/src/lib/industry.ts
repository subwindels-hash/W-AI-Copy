/**
 * Session 74 / Session 169 — Semantic Intelligence, Industry Solutions & Digital Operations client
 */
import { api } from "./api";
import type {
  IndustryDashboard,
  IndustryAdoption,
  CreateIndustryAdoptionInput,
  UpdateIndustryAdoptionInput,
  IndustrySuite,
} from "@windels/shared";

export type {
  IndustryDashboard,
  IndustryAdoption,
  CreateIndustryAdoptionInput,
  UpdateIndustryAdoptionInput,
  IndustrySuite,
};

export const indApi = {
  dashboard: () => api<IndustryDashboard>("/industry/dashboard/rollup"),
  suites: () => api<Array<{ id: IndustrySuite; name: string }>>("/industry/suites"),
  listAdoptions: () => api<IndustryAdoption[]>("/industry/adoptions"),
  getAdoption: (id: string) => api<IndustryAdoption>(`/industry/adoptions/${id}`),
  createAdoption: (input: CreateIndustryAdoptionInput) =>
    api<IndustryAdoption>("/industry/adoptions", { method: "POST", json: input }),
  updateAdoption: (id: string, patch: UpdateIndustryAdoptionInput) =>
    api<IndustryAdoption>(`/industry/adoptions/${id}`, { method: "PATCH", json: patch }),
  deleteAdoption: (id: string) =>
    api<void>(`/industry/adoptions/${id}`, { method: "DELETE" }),
};
