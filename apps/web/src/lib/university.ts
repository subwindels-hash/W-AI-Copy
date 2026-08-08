/**
 * Session 153 — University Education web client
 * (routes/university.ts → /api/v1/university).
 *
 * Typed functions for the Lecturer-AI university platform: the overview
 * (faculties + degrees + research areas), the full catalog, per-faculty
 * courses, the per-faculty degree plan with a single next-recommended
 * course, per-course mastery progress, course search, starting a Lecturer
 * AI session on a course, and course detail.
 */
import { api } from "./api";
import type {
  UniversityCatalogView,
  UniversityCourse,
  UniversityDegreeLevel,
  UniversityDegreePlan,
  UniversityFaculty,
  UniversityOverview,
  UniversityProgressEntry,
} from "@windels/shared";

export type {
  UniversityCatalogView,
  UniversityCourse,
  UniversityDegreeLevel,
  UniversityDegreePlan,
  UniversityFaculty,
  UniversityOverview,
  UniversityPathNode,
  UniversityProgressEntry,
} from "@windels/shared";

export interface UniversitySessionTurn {
  course: UniversityCourse;
  turn: {
    sessionId: string;
    stage: string;
    question?: string;
    modelSource: string;
    warnings?: string[];
    masteryPct?: number;
    level?: string;
  };
}

/** University overview: faculties, degrees offered, research areas. */
export function getUniversityOverview(): Promise<UniversityOverview> {
  return api<UniversityOverview>("/university/overview");
}

/** Full catalog: all faculties and courses. */
export function getUniversityCatalog(): Promise<UniversityCatalogView> {
  return api<UniversityCatalogView>("/university/catalog");
}

/** All faculties. */
export function listUniversityFaculties(): Promise<UniversityFaculty[]> {
  return api<UniversityFaculty[]>("/university/faculties");
}

/** Courses in a faculty, optionally filtered by degree level. */
export function getFacultyCourses(facultyId: string, level?: UniversityDegreeLevel): Promise<UniversityCourse[]> {
  const suffix = level ? `?level=${level}` : "";
  return api<UniversityCourse[]>(`/university/faculties/${facultyId}/courses${suffix}`);
}

/** The degree plan for a faculty: ordered courses with one next-recommended. */
export function getUniversityDegreePlan(facultyId: string): Promise<UniversityDegreePlan> {
  return api<UniversityDegreePlan>(`/university/faculties/${facultyId}/degree-plan`);
}

/** Per-course mastery derived from the real lecturer state. */
export function getUniversityProgress(): Promise<UniversityProgressEntry[]> {
  return api<UniversityProgressEntry[]>("/university/progress");
}

/** Search courses by title, code, department or faculty name. */
export function searchUniversityCourses(q: string): Promise<UniversityCourse[]> {
  return api<UniversityCourse[]>(`/university/search?q=${encodeURIComponent(q)}`);
}

/** Start a Lecturer AI session on a university course. */
export function startUniversityCourse(courseId: string): Promise<UniversitySessionTurn> {
  return api<UniversitySessionTurn>("/university/start", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
}

/** A single course by id. */
export function getUniversityCourse(courseId: string): Promise<UniversityCourse> {
  return api<UniversityCourse>(`/university/courses/${courseId}`);
}
