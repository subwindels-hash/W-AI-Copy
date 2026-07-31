import { create } from "zustand";
import { api } from "./api";

export type AgentStatus = "online" | "working" | "idle" | "error";
export interface Agent {
  id: string;
  name: string;
  role: string;
  color: "azure" | "violet" | "teal" | "fuchsia" | "amber" | "crimson" | "emerald";
  emoji: string;
  status: AgentStatus;
  lastActivityAt: string;
  activeTask: { id: string; title: string; progress: number } | null;
}
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate: string | null;
  createdAt: string;
  agent: Pick<Agent, "id" | "name" | "color" | "emoji"> | null;
  assignee: { id: string; email: string; displayName: string | null } | null;
  creator: { id: string; email: string; displayName: string | null };
}
export type ActivityType =
  | "TASK_CREATED" | "TASK_COMPLETED" | "TASK_UPDATED" | "USER_JOINED"
  | "WORKSPACE_UPDATED" | "AGENT_STATUS_CHANGED" | "NOTE_ADDED" | "FILE_UPLOADED"
  | "COMMENT_ADDED" | "SYSTEM";
export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  user: { id: string; email: string; displayName: string | null } | null;
  agent: Pick<Agent, "id" | "name" | "emoji" | "color"> | null;
}
export interface DashboardData {
  organization: { id: string; name: string; slug: string };
  workspace: { id: string; name: string; slug: string } | null;
  stats: {
    agentsTotal: number;
    agentsOnline: number;
    tasksActive: number;
    tasksPending: number;
    tasksDone: number;
  };
  agents: Agent[];
  tasks: Task[];
  activities: Activity[];
}

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  createTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus, progress?: number) => Promise<void>;
}

export const useDashboard = create<DashboardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  async fetch() {
    set({ loading: true, error: null });
    try {
      const data = await api<DashboardData>("/workspace/dashboard");
      set({ data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  async createTask(title: string) {
    await api("/workspace/tasks", { method: "POST", json: { title } });
    await get().fetch();
  },
  async updateTaskStatus(taskId, status, progress) {
    await api(`/workspace/tasks/${taskId}`, {
      method: "PATCH",
      json: { status, ...(progress !== undefined ? { progress } : {}) },
    });
    await get().fetch();
  },
}));
