/**
 * University Education — Lecturer AI teaching platform.
 *
 * Bridges the full university catalog (`packages/shared/src/university.ts`) to
 * the real Lecturer AI adaptive tutor (`education/lecturer.service.ts`), so the
 * OS can teach bachelor, master and doctoral courses across every faculty.
 *
 * Degree levels → lecturer difficulty:
 *   - bachelor  → beginner
 *   - master    → advanced
 *   - doctor    → advanced (the lecturer's ceiling; set explicitly)
 *
 * Teaching delegates to `LecturerService.start` (real adaptive loop, honest
 * "demo-ai" fallback when no AI provider key is set). Progress is derived from
 * the lecturer's persisted mastery — never fabricated, never a fake 0.
 */
import { LecturerService } from "./lecturer.service.js";
import {
  UNIVERSITY_COURSES,
  UNIVERSITY_FACULTIES,
  universityCourseById,
  universityFacultyById,
  UNIVERSITY_DEGREE_LEVELS,
  type UniversityCatalogView,
  type UniversityCourse,
  type UniversityDegreeLevel,
  type UniversityFaculty,
  type UniversityOverview,
  type UniversityPathNode,
  type UniversityProgressEntry,
  type UniversityDegreePlan,
} from "@windels/shared";

/** Lecturer completion threshold (matches lecturer.service.ts). */
const COMPLETE_MASTERY = 85;

type LecturerLevel = "beginner" | "intermediate" | "advanced";

const LECTURER_LEVEL: Record<UniversityDegreeLevel, LecturerLevel> = {
  bachelor: "beginner",
  master: "advanced",
  doctor: "advanced",
};

const LEVEL_ORDER: Record<UniversityDegreeLevel, number> = {
  bachelor: 0,
  master: 1,
  doctor: 2,
};

export class UniversityCourseNotFoundError extends Error {
  constructor(courseId: string) {
    super(`University course not found: ${courseId}`);
    this.name = "UniversityCourseNotFoundError";
  }
}

export const UniversityService = {
  overview(): UniversityOverview {
    return {
      facultiesCount: UNIVERSITY_FACULTIES.length,
      coursesCount: UNIVERSITY_COURSES.length,
      researchAreasCount: UNIVERSITY_FACULTIES.reduce((n, f) => n + f.researchAreas.length, 0),
      degreesOffered: [...UNIVERSITY_DEGREE_LEVELS],
      faculties: UNIVERSITY_FACULTIES,
    };
  },

  catalog(): UniversityCatalogView {
    return {
      total: UNIVERSITY_COURSES.length,
      faculties: UNIVERSITY_FACULTIES,
      courses: UNIVERSITY_COURSES,
    };
  },

  faculties(): UniversityFaculty[] {
    return UNIVERSITY_FACULTIES;
  },

  getFaculty(facultyId: string): UniversityFaculty | undefined {
    return universityFacultyById(facultyId);
  },

  getCourse(courseId: string): UniversityCourse | undefined {
    return universityCourseById(courseId);
  },

  /** Courses in a faculty, optionally filtered by degree level. */
  coursesByFaculty(facultyId: string, level?: UniversityDegreeLevel): UniversityCourse[] {
    if (!universityFacultyById(facultyId)) return [];
    return UNIVERSITY_COURSES.filter((c) => c.faculty === facultyId && (!level || c.level === level));
  },

  /**
   * Start a Lecturer AI teaching session on a university course.
   */
  async startCourse(
    userId: string,
    courseId: string,
  ): Promise<{ course: UniversityCourse; turn: Awaited<ReturnType<typeof LecturerService.start>> }> {
    const course = universityCourseById(courseId);
    if (!course) throw new UniversityCourseNotFoundError(courseId);
    const turn = await LecturerService.start(userId, course.teachingTopic, LECTURER_LEVEL[course.level]);
    return { course, turn };
  },

  /**
   * Per-course mastery/started/completed derived from the real lecturer state.
   */
  async progress(userId: string): Promise<UniversityProgressEntry[]> {
    const out: UniversityProgressEntry[] = [];
    for (const c of UNIVERSITY_COURSES) {
      const m = await LecturerService.topicMastery(userId, c.teachingTopic);
      const masteryPct = m?.masteryPct ?? null;
      out.push({
        courseId: c.id,
        code: c.code,
        title: c.title,
        faculty: c.faculty,
        department: c.department,
        level: c.level,
        masteryPct,
        started: masteryPct != null,
        completed: masteryPct != null && masteryPct >= COMPLETE_MASTERY,
      });
    }
    return out;
  },

  /**
   * Degree roadmap for one faculty: all its courses in degree order with a
   * single `nextRecommended` node (the first un-completed course whose
   * prerequisites are met at the lowest not-yet-completed degree level).
   */
  async degreePlan(userId: string, facultyId: string): Promise<UniversityDegreePlan | null> {
    const faculty = universityFacultyById(facultyId);
    if (!faculty) return null;
    const prog = await UniversityService.progress(userId);
    const byId = new Map(prog.map((p) => [p.courseId, p]));
    const courses = UNIVERSITY_COURSES.filter((c) => c.faculty === facultyId);

    const nodes: UniversityPathNode[] = courses.map((c) => {
      const p = byId.get(c.id)!;
      const prerequisitesMet = c.prerequisites.every((pid) => byId.get(pid)?.completed ?? false);
      return {
        courseId: c.id,
        code: c.code,
        title: c.title,
        faculty: c.faculty,
        level: c.level,
        prerequisites: c.prerequisites,
        prerequisitesMet,
        masteryPct: p.masteryPct,
        completed: p.completed,
        started: p.started,
        nextRecommended: false,
      };
    });

    // Order: degree level ascending, then by term, then code.
    nodes.sort(
      (a, b) =>
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        (courses.find((x) => x.id === a.courseId)?.term ?? 99) -
          (courses.find((x) => x.id === b.courseId)?.term ?? 99) ||
        a.code.localeCompare(b.code),
    );

    // Mark the next recommended course: lowest degree level with an
    // incomplete, prereqs-met course.
    for (const n of nodes) {
      if (!n.completed && n.prerequisitesMet) {
        n.nextRecommended = true;
        break;
      }
    }

    return {
      facultyId: faculty.id,
      facultyName: faculty.name,
      levels: [...UNIVERSITY_DEGREE_LEVELS],
      courses: nodes,
    };
  },

  /**
   * Search courses across the university by keyword (title/code/department/
   * faculty name). Deterministic substring match, case-insensitive.
   */
  search(query: string): UniversityCourse[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return UNIVERSITY_COURSES.filter((c) => {
      const fac = universityFacultyById(c.faculty)?.name.toLowerCase() ?? "";
      return (
        c.title.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q) ||
        fac.includes(q)
      );
    });
  },
};

export default UniversityService;
