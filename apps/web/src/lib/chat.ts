import { api } from "./api";
import { streamSSE } from "./sse";

export interface Conversation {
  id: string;
  title: string;
  summary: string | null;
  pinned: boolean;
  modelId: string | null;
  lastMessageAt: string;
  messageCount?: number;
  participants: Array<{
    id: string;
    agent: { id: string; name: string; color: string; emoji: string } | null;
    user: { id: string; email: string; displayName: string | null } | null;
  }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  modelId?: string | null;
  createdAt: string;
  user?: { id: string; email: string; displayName: string | null; avatarUrl: string | null } | null;
  agent?: { id: string; name: string; color: string; emoji: string } | null;
  attachments?: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number }>;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string;
  icon: string | null;
  isBuiltIn: boolean;
  usageCount: number;
}

export const chatApi = {
  async listConversations(): Promise<{ items: Conversation[]; pagination: any }> {
    return api("/conversations?perPage=50");
  },
  async createConversation(input: { title?: string; firstMessage?: string; modelId?: string; agentIds?: string[] }) {
    return api<Conversation>("/conversations", { method: "POST", json: input });
  },
  async getConversation(id: string): Promise<Conversation> {
    return api(`/conversations/${id}`);
  },
  async deleteConversation(id: string): Promise<{ deleted: true; id: string }> {
    return api(`/conversations/${id}`, { method: "DELETE" });
  },
  async listMessages(conversationId: string): Promise<{ messages: ChatMessage[] }> {
    return api(`/conversations/${conversationId}/messages`);
  },
  async listTemplates(category?: string): Promise<PromptTemplate[]> {
    return api(`/prompt-templates${category ? `?category=${category}` : ""}`);
  },
  async listModels(): Promise<Array<{ id: string; provider: string; displayName: string }>> {
    return api("/ai/models");
  },
  streamMessage(
    conversationId: string,
    content: string,
    opts: { modelId?: string; agentIds?: string[]; attachmentIds?: string[]; signal?: AbortSignal } = {}
  ) {
    const token = localStorage.getItem("windels:accessToken");
    return streamSSE(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      json: {
        content,
        ...(opts.modelId ? { modelId: opts.modelId } : {}),
        ...(opts.agentIds?.length ? { agentIds: opts.agentIds } : {}),
        ...(opts.attachmentIds?.length ? { attachmentIds: opts.attachmentIds } : {}),
      },
      signal: opts.signal,
    });
  },
};
