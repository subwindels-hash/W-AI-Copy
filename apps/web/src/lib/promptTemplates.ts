/**
 * Session 23 → /api/v1/prompt-templates typed client (Session 119 completion).
 *
 * Session 23's client declared every shape by hand. Session 119 imports the
 * shared contract (`@windels/shared/promptTemplates`) so the API and the web
 * app compile against one definition; the original method names and paths are
 * unchanged. New: `get`, `stats` and `duplicate`.
 *
 * The `use` response now carries `unresolved` — the variables that were
 * neither supplied nor defaulted — so the console can show the hole instead
 * of silently presenting a gapped prompt as complete.
 */
import { api } from "./api";
import type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateDuplicateInput,
  PromptTemplateStats,
  PromptTemplateUpdateInput,
  PromptTemplateUseResult,
} from "@windels/shared/promptTemplates";

export type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateDuplicateInput,
  PromptTemplateStats,
  PromptTemplateUpdateInput,
  PromptTemplateUseResult,
} from "@windels/shared/promptTemplates";

export type PromptTemplateListParams = Record<string, unknown> & {
  category?: string;
  /** Case-insensitive substring match over title/content/description. */
  q?: string;
  limit?: number;
};

export const promptTemplatesApi = {
  list: (params: PromptTemplateListParams = {}) =>
    api<PromptTemplate[]>("/prompt-templates", { params }),
  get: (id: string) => api<PromptTemplate>(`/prompt-templates/${id}`),
  create: (input: PromptTemplateCreateInput) =>
    api<PromptTemplate>("/prompt-templates", { method: "POST", json: input }),
  use: (id: string, vars: Record<string, string> = {}) =>
    api<PromptTemplateUseResult>(`/prompt-templates/${id}/use`, { method: "POST", json: vars }),
  duplicate: (id: string, input: PromptTemplateDuplicateInput = {}) =>
    api<PromptTemplate>(`/prompt-templates/${id}/duplicate`, { method: "POST", json: input }),
  stats: (days: number = 7) =>
    api<PromptTemplateStats>("/prompt-templates/stats", { params: { days } }),
  update: (id: string, patch: PromptTemplateUpdateInput) =>
    api<PromptTemplate>(`/prompt-templates/${id}`, { method: "PATCH", json: patch }),
  remove: (id: string) => api<void>(`/prompt-templates/${id}`, { method: "DELETE" }),
};
