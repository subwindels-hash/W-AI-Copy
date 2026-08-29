/** Session 95 — Enterprise Helpdesk client. */
import { api } from "./api";

export type HdTicketStatus = "new" | "open" | "pending" | "resolved" | "closed";
export type HdPriority = "low" | "medium" | "high" | "urgent";
export type HdChannel = "email" | "chat" | "phone" | "web" | "other";

export interface HdTicket {
  id: string;
  number: string;
  organizationId: string;
  subject: string;
  description: string | null;
  status: HdTicketStatus;
  priority: HdPriority;
  channel: HdChannel;
  requesterName: string;
  requesterEmail: string | null;
  assigneeId: string | null;
  contactId: string | null;
  companyId: string | null;
  tags: string[];
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HdComment {
  id: string;
  organizationId: string;
  ticketId: string;
  authorName: string;
  authorId: string | null;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface HdTicketDetail extends HdTicket {
  comments: HdComment[];
}

export interface HdRollup {
  counts: {
    tickets: number;
    open: number;
    resolved: number;
    closed: number;
    overdue: number;
    unassigned: number;
  };
  byPriority: Array<{ priority: HdPriority; count: number }>;
  slaCompliancePct: number | null;
  avgResolutionHours: number | null;
  byAssignee: Array<{ assigneeId: string | null; count: number }>;
  recentTickets: HdTicket[];
  lastUpdatedAt: string | null;
}

export interface HdTicketCreateInput {
  subject: string;
  description?: string | null;
  status?: HdTicketStatus;
  priority?: HdPriority;
  channel?: HdChannel;
  requesterName: string;
  requesterEmail?: string | null;
  assigneeId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  tags?: string[];
}

export const helpdeskApi = {
  rollup: () => api<HdRollup>("/helpdesk/dashboard/rollup"),
  listTickets: (params?: { status?: HdTicketStatus; priority?: HdPriority; assigneeId?: string; q?: string }) =>
    api<HdTicket[]>("/helpdesk/tickets", { params }),
  createTicket: (input: HdTicketCreateInput) => api<HdTicket>("/helpdesk/tickets", { method: "POST", json: input }),
  getTicket: (id: string) => api<HdTicketDetail>(`/helpdesk/tickets/${id}`),
  updateTicket: (id: string, patch: Partial<HdTicketCreateInput>) =>
    api<HdTicket>(`/helpdesk/tickets/${id}`, { method: "PATCH", json: patch }),
  deleteTicket: (id: string) => api<{ deleted: boolean; id: string }>(`/helpdesk/tickets/${id}`, { method: "DELETE" }),
  assignTicket: (id: string, assigneeId: string | null) =>
    api<HdTicket>(`/helpdesk/tickets/${id}/assign`, { method: "POST", json: { assigneeId } }),
  transitionTicket: (id: string, status: HdTicketStatus) =>
    api<HdTicket>(`/helpdesk/tickets/${id}/transition`, { method: "POST", json: { status } }),

  listComments: (ticketId: string) => api<HdComment[]>(`/helpdesk/tickets/${ticketId}/comments`),
  createComment: (ticketId: string, input: { authorName: string; body: string; internal?: boolean }) =>
    api<HdComment>(`/helpdesk/tickets/${ticketId}/comments`, { method: "POST", json: input }),
  deleteComment: (id: string) => api<{ deleted: boolean; id: string }>(`/helpdesk/comments/${id}`, { method: "DELETE" }),
};
