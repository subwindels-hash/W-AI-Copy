/**
 * Contact & Support Center client.
 */
import { api } from "./api";
import type {
  ContactAiReply,
  ContactCategory,
  ContactDashboardRow,
  ContactFormInput,
  ContactMessageRow,
  ContactRequestRow,
} from "@windels/shared/contactCenter";

export type {
  ContactAiReply,
  ContactCategory,
  ContactDashboardRow,
  ContactMessageRow,
  ContactRequestRow,
} from "@windels/shared/contactCenter";

export const contactApi = {
  /* Public */
  submitForm: (input: ContactFormInput) => api<ContactRequestRow>("/contact/form", { method: "POST", json: input }),
  assistantStart: (message: string, ctx?: { name?: string; email?: string }) =>
    api<ContactAiReply>("/contact/assistant/start", { method: "POST", json: { message, ...(ctx ?? {}) } }),
  assistantMessage: (conversationId: string, message: string) =>
    api<ContactAiReply>("/contact/assistant/message", { method: "POST", json: { conversationId, message } }),

  /* My requests */
  myRequests: () => api<ContactRequestRow[]>("/contact/my/requests"),
  myRequest: (id: string) => api<ContactRequestRow>(`/contact/my/requests/${id}`),
  myMessages: (id: string) => api<ContactMessageRow[]>(`/contact/my/requests/${id}/messages`),

  /* Admin */
  adminDashboard: () => api<ContactDashboardRow>("/contact/admin/dashboard"),
  adminList: (params: Record<string, unknown> = {}) => api<{ items: ContactRequestRow[]; total: number }>("/contact/admin/requests", { params }),
  adminRequest: (id: string) => api<{ request: ContactRequestRow; messages: ContactMessageRow[]; history: any[] }>(`/contact/admin/requests/${id}`),
  adminRespond: (id: string, input: { body: string; isInternal: boolean }) =>
    api<ContactMessageRow>(`/contact/admin/requests/${id}/respond`, { method: "POST", json: input }),
  adminAssign: (id: string, input: { userId?: string; agentId?: string }) =>
    api<ContactRequestRow>(`/contact/admin/requests/${id}/assign`, { method: "POST", json: input }),
  adminTransition: (id: string, to: string) =>
    api<ContactRequestRow>(`/contact/admin/requests/${id}/transition`, { method: "POST", json: { to } }),
};
