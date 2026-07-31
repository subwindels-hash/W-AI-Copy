import { api } from "./api";

export interface CanvasBlock {
  id: string;
  type: "text" | "sticky" | "ai" | "embed" | "heading" | "todo";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  content: Record<string, any>;
  style: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
  label?: string | null;
  color?: string | null;
}

export interface Canvas {
  id: string;
  title: string;
  description?: string | null;
  access: "private" | "workspace" | "organization";
  backgroundColor?: string | null;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  isTemplate: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  blocks: CanvasBlock[];
  connections: CanvasConnection[];
}

export interface CanvasSummary {
  id: string;
  title: string;
  description?: string | null;
  access: string;
  blocksCount: number;
  connectionsCount: number;
  createdBy: { id: string; displayName: string };
  updatedAt: string;
}

export const canvasApi = {
  list: (params: { page?: number; perPage?: number; q?: string } = {}) =>
    api.get<{ items: CanvasSummary[]; pagination: any }>("/canvases", { page: 1, perPage: 50, ...params }),
  get: (id: string) => api.get<Canvas>(`/canvases/${id}`),
  create: (data: Partial<Canvas>) => api.post<Canvas>("/canvases", data),
  update: (id: string, data: Partial<Canvas>) => api.patch<Canvas>(`/canvases/${id}`, data),
  delete: (id: string) => api.del<{}>(`/canvases/${id}`),
  addBlock: (canvasId: string, block: Partial<CanvasBlock>) =>
    api.post<CanvasBlock>(`/canvases/${canvasId}/blocks`, block),
  updateBlock: (canvasId: string, blockId: string, patch: Partial<CanvasBlock>) =>
    api.patch<CanvasBlock>(`/canvases/${canvasId}/blocks/${blockId}`, patch),
  deleteBlock: (canvasId: string, blockId: string) =>
    api.del<{}>(`/canvases/${canvasId}/blocks/${blockId}`),
  addConnection: (canvasId: string, conn: { fromId: string; toId: string; label?: string; color?: string }) =>
    api.post<CanvasConnection>(`/canvases/${canvasId}/connections`, conn),
  deleteConnection: (canvasId: string, connId: string) =>
    api.del<{}>(`/canvases/${canvasId}/connections/${connId}`),
  generateBlock: (canvasId: string, blockId: string, input: { prompt: string; modelId?: string }) =>
    api.post<{ result: string }>(`/canvases/${canvasId}/blocks/${blockId}/generate`, input),
};
