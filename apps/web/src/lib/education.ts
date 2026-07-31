/** Session 67 — Education & Learning client */
import { api } from "./api";
import type { EducationDashboard, TutorSession, LearningPath, Assessment } from "@windels/shared";
export type { EducationDashboard, TutorSession, LearningPath, Assessment } from "@windels/shared";

export const eduApi = {
  dashboard: () => api<EducationDashboard>("/education/dashboard/rollup"),
  startTutor: (topic: string) => api<TutorSession>("/education/tutor/start", { method: "POST", json: { topic } }),
  createPath: (input: { title: string; goal: string; contentIds: string[]; targetDate?: string }) =>
    api<LearningPath>("/education/paths", { method: "POST", json: input }),
  assess: (input: { contentId: string; scorePct: number; correct: number; questions: number; timeSpentSec: number }) =>
    api<Assessment>("/education/assessments", { method: "POST", json: input }),
};
