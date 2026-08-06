/** Prompt Templates client (Session 23 → /api/v1/prompt-templates). */
import { api } from "./api";

export interface PromptTemplate {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  category: string;
  icon: string | null;
  content: string;
  usageCount: number;
  isBuiltIn: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateCreateInput {
  title: string;
  description?: string;
  content: string;
  category?: string;
  icon?: string;
}

export interface PromptTemplateUseResult {
  template: PromptTemplate;
  rendered: string;
}

export const promptTemplatesApi = {
  list: (category?: string) => api<PromptTemplate[]>("/prompt-templates", { params: { category } }),
  create: (input: PromptTemplateCreateInput) =>
    api<PromptTemplate>("/prompt-templates", { method: "POST", json: input }),
  use: (id: string, vars: Record<string, string> = {}) =>
    api<PromptTemplateUseResult>(`/prompt-templates/${id}/use`, { method: "POST", json: vars }),
  update: (id: string, patch: Partial<PromptTemplateCreateInput>) =>
    api<PromptTemplate>(`/prompt-templates/${id}`, { method: "PATCH", json: patch }),
  remove: (id: string) => api<void>(`/prompt-templates/${id}`, { method: "DELETE" }),
};
