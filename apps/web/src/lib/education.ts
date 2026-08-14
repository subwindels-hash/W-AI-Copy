/** Session 67 — Education & Learning client (Session 159 list/create). */
import { api } from "./api";
import type {
  EducationDashboard, TutorSession, LearningPath, Assessment, LearningContent, Skill,
} from "@windels/shared";
export type {
  EducationDashboard, TutorSession, LearningPath, Assessment, LearningContent, Skill,
} from "@windels/shared";

export const eduApi = {
  dashboard: () => api<EducationDashboard>("/education/dashboard/rollup"),
  startTutor: (topic: string) => api<TutorSession>("/education/tutor/start", { method: "POST", json: { topic } }),
  createPath: (input: { title: string; goal: string; contentIds: string[]; targetDate?: string }) =>
    api<LearningPath>("/education/paths", { method: "POST", json: input }),
  assess: (input: { contentId: string; scorePct: number; correct: number; questions: number; timeSpentSec: number }) =>
    api<Assessment>("/education/assessments", { method: "POST", json: input }),
  listContent: () => api<LearningContent[]>("/education/content"),
  createContent: (input: {
    title: string; kind: LearningContent["kind"]; description?: string;
    durationMin: number; difficulty: LearningContent["difficulty"]; tags?: string[];
  }) => api<LearningContent>("/education/content", { method: "POST", json: input }),
  listPaths: () => api<LearningPath[]>("/education/paths"),
  listAssessments: () => api<Assessment[]>("/education/assessments"),
  listSkills: () => api<Skill[]>("/education/skills"),
  createSkill: (input: { name: string; category: string; level?: number; target?: number }) =>
    api<Skill>("/education/skills", { method: "POST", json: input }),
  listTutorSessions: () => api<TutorSession[]>("/education/tutor"),
};
