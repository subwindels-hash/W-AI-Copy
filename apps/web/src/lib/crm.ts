/** Session 90 — Enterprise CRM (Customer Relationship Management) client. */
import { api } from "./api";

export type CrmContactSource = "referral" | "website" | "event" | "inbound" | "outbound" | "partner" | "other";
export type CrmContactStatus = "lead" | "prospect" | "customer" | "churned";
export type CrmCompanySizeBand = "micro" | "small" | "mid" | "large" | "enterprise" | "unknown";
export type CrmDealStageKey = "lead" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost";
export type CrmActivityKind = "note" | "email" | "call" | "meeting" | "task";

export interface CrmContact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  title: string | null;
  source: CrmContactSource;
  status: CrmContactStatus;
  tags: string[];
  ownerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmCompany {
  id: string;
  organizationId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeBand: CrmCompanySizeBand;
  website: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmDeal {
  id: string;
  organizationId: string;
  name: string;
  companyId: string;
  contactId: string | null;
  amountCents: number;
  currency: string;
  stage: CrmDealStageKey;
  probabilityPct: number;
  expectedCloseAt: string | null;
  tags: string[];
  ownerId: string | null;
  stageChangedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  organizationId: string;
  kind: CrmActivityKind;
  subject: string;
  body: string | null;
  contactId: string | null;
  dealId: string | null;
  companyId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CrmPipelineStage {
  key: CrmDealStageKey;
  label: string;
  order: number;
  probabilityPct: number;
}

export interface CrmStageRollup {
  stageKey: CrmDealStageKey;
  label: string;
  order: number;
  count: number;
  sumCents: number;
}

export interface CrmDashboardRollup {
  counts: {
    contacts: number;
    companies: number;
    openDeals: number;
    closedWonDeals: number;
    closedLostDeals: number;
    activities: number;
  };
  pipeline: CrmStageRollup[];
  forecastCents: number;
  openPipelineCents: number;
  closedWonCents: number;
  conversionRate: number | null;
  topDeals: CrmDeal[];
  recentActivities: CrmActivity[];
  lastUpdatedAt: string | null;
}

export interface CrmContactUpsertInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  title?: string | null;
  source?: CrmContactSource;
  status?: CrmContactStatus;
  tags?: string[];
  ownerId?: string | null;
  notes?: string | null;
}

export interface CrmCompanyUpsertInput {
  name: string;
  domain?: string | null;
  industry?: string | null;
  sizeBand?: CrmCompanySizeBand;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  tags?: string[];
}

export interface CrmDealUpsertInput {
  name: string;
  companyId: string;
  contactId?: string | null;
  amountCents: number;
  currency?: string;
  stage?: CrmDealStageKey;
  probabilityPct?: number;
  expectedCloseAt?: string | null;
  tags?: string[];
  ownerId?: string | null;
}

export interface CrmActivityCreateInput {
  kind: CrmActivityKind;
  subject: string;
  body?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
}

export const crmApi = {
  rollup: () => api<CrmDashboardRollup>("/crm/dashboard/rollup"),
  stages: () => api<CrmPipelineStage[]>("/crm/pipeline/stages"),

  listContacts: (params?: { q?: string; companyId?: string; status?: string }) =>
    api<CrmContact[]>("/crm/contacts", { params }),
  createContact: (input: CrmContactUpsertInput) => api<CrmContact>("/crm/contacts", { method: "POST", json: input }),
  updateContact: (id: string, patch: Partial<CrmContactUpsertInput>) =>
    api<CrmContact>(`/crm/contacts/${id}`, { method: "PATCH", json: patch }),
  deleteContact: (id: string) => api<{ deleted: boolean; id: string }>(`/crm/contacts/${id}`, { method: "DELETE" }),

  listCompanies: (params?: { q?: string; industry?: string }) =>
    api<CrmCompany[]>("/crm/companies", { params }),
  createCompany: (input: CrmCompanyUpsertInput) => api<CrmCompany>("/crm/companies", { method: "POST", json: input }),
  updateCompany: (id: string, patch: Partial<CrmCompanyUpsertInput>) =>
    api<CrmCompany>(`/crm/companies/${id}`, { method: "PATCH", json: patch }),
  deleteCompany: (id: string) => api<{ deleted: boolean; id: string }>(`/crm/companies/${id}`, { method: "DELETE" }),

  listDeals: (params?: { stage?: CrmDealStageKey; companyId?: string; open?: boolean }) =>
    api<CrmDeal[]>("/crm/deals", { params }),
  createDeal: (input: CrmDealUpsertInput) => api<CrmDeal>("/crm/deals", { method: "POST", json: input }),
  updateDeal: (id: string, patch: Partial<CrmDealUpsertInput>) =>
    api<CrmDeal>(`/crm/deals/${id}`, { method: "PATCH", json: patch }),
  deleteDeal: (id: string) => api<{ deleted: boolean; id: string }>(`/crm/deals/${id}`, { method: "DELETE" }),

  listActivities: (params?: { contactId?: string; dealId?: string; companyId?: string; kind?: string }) =>
    api<CrmActivity[]>("/crm/activities", { params }),
  createActivity: (input: CrmActivityCreateInput) => api<CrmActivity>("/crm/activities", { method: "POST", json: input }),
  deleteActivity: (id: string) => api<{ deleted: boolean; id: string }>(`/crm/activities/${id}`, { method: "DELETE" }),
};
