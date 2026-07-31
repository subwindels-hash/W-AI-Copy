/** Session 62 — Digital Humans client */
import { api } from "./api";
import type { DigitalHuman, DigitalHumanDashboard, DigitalHumanSession } from "@windels/shared";
export type { DigitalHuman, DigitalHumanDashboard, DigitalHumanSession } from "@windels/shared";

export const dhApi = {
  dashboard: () => api<DigitalHumanDashboard>("/digital-humans/dashboard/rollup"),
  list: () => api<DigitalHuman[]>("/digital-humans/"),
  get: (id: string) => api<DigitalHuman>(`/digital-humans/${id}`),
  create: (input: Partial<DigitalHuman> & { name: string; role: DigitalHuman["role"]; gender: DigitalHuman["gender"]; style: DigitalHuman["style"]; createdBy?: string }) =>
    api<DigitalHuman>("/digital-humans/", { method: "POST", json: input }),
  startSession: (id: string, opts?: { participantId?: string; language?: string }) =>
    api<DigitalHumanSession>(`/digital-humans/${id}/sessions`, { method: "POST", json: opts || {} }),
  endSession: (sid: string, resolution?: "resolved"|"escalated"|"abandoned", rating?: number) =>
    api<DigitalHumanSession>(`/digital-humans/sessions/${sid}/end`, { method: "POST", json: { resolution, rating } }),
};
