/**
 * Session 154 — WINDELS Universal University & Higher Education Engine web
 * client (routes/universityEngine.ts → /api/v1/education-engine).
 *
 * Typed functions for: the global academic catalog (domains/fields), the
 * education-level groups, deterministic program + course generation, the
 * global university directory and country education profiles, the AI
 * University Advisor (career goal → pathway), semester-by-semester study
 * plans, Lecturer AI teaching, research & thesis guidance, and academic
 * intelligence answers.
 */
import { api } from "./api";
import type {
  AcademicCourse,
  AcademicDomain,
  AcademicField,
  AcademicInsight,
  AcademicProgram,
  AdvisorRecommendation,
  CountryEducationProfile,
  DomainSearchHit,
  EducationLevel,
  ResearchGuidance,
  StudyPlan,
  UniversityRecord,
} from "@windels/shared";

export type {
  AcademicCourse,
  AcademicDomain,
  AcademicField,
  AcademicInsight,
  AcademicProgram,
  AdvisorRecommendation,
  CountryEducationProfile,
  DomainSearchHit,
  EducationLevel,
  ResearchGuidance,
  StudyPlan,
  UniversityRecord,
} from "@windels/shared";

export interface EducationLevelGroup {
  group: string;
  label: string;
  levels: Array<{ id: EducationLevel; label: string }>;
}

export interface TeachTurn {
  topic: string;
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

/** All academic domains with their fields. */
export function listEngineDomains(): Promise<AcademicDomain[]> {
  return api<AcademicDomain[]>("/education-engine/domains");
}

/** A single domain by id. */
export function getEngineDomain(id: string): Promise<AcademicDomain> {
  return api<AcademicDomain>(`/education-engine/domains/${id}`);
}

/** A single field by id. */
export function getEngineField(id: string): Promise<AcademicField> {
  return api<AcademicField>(`/education-engine/fields/${id}`);
}

/** The education levels grouped (undergraduate → doctoral → professional → research). */
export function getEngineEducationLevels(): Promise<EducationLevelGroup[]> {
  return api<EducationLevelGroup[]>("/education-engine/education-levels");
}

/** Search domains and fields by name/description/careers. */
export function searchEngineCatalog(q: string): Promise<DomainSearchHit[]> {
  return api<DomainSearchHit[]>(`/education-engine/search?q=${encodeURIComponent(q)}`);
}

/** Generate a deterministic program for a field at a degree level. */
export function getEngineProgram(field: string, level?: EducationLevel): Promise<AcademicProgram> {
  const suffix = level ? `&level=${level}` : "";
  return api<AcademicProgram>(`/education-engine/program?field=${encodeURIComponent(field)}${suffix}`);
}

/** Generate the courses of a program. */
export function getEngineProgramCourses(field: string, level?: EducationLevel): Promise<AcademicCourse[]> {
  const suffix = level ? `&level=${level}` : "";
  return api<AcademicCourse[]>(`/education-engine/program/courses?field=${encodeURIComponent(field)}${suffix}`);
}

/** The global university directory, optionally filtered by country. */
export function listEngineUniversities(country?: string): Promise<UniversityRecord[]> {
  return api<UniversityRecord[]>(country ? `/education-engine/universities?country=${country}` : "/education-engine/universities");
}

/** A single university record. */
export function getEngineUniversity(id: string): Promise<UniversityRecord> {
  return api<UniversityRecord>(`/education-engine/universities/${id}`);
}

/** All country education profiles. */
export function listEngineCountries(): Promise<CountryEducationProfile[]> {
  return api<CountryEducationProfile[]>("/education-engine/countries");
}

/** A single country education profile by 2-letter code. */
export function getEngineCountry(code: string): Promise<CountryEducationProfile> {
  return api<CountryEducationProfile>(`/education-engine/countries/${code}`);
}

/** AI University Advisor: career goal → recommended pathway + rationale. */
export function adviseEngine(goal: string, level?: EducationLevel): Promise<AdvisorRecommendation> {
  return api<AdvisorRecommendation>("/education-engine/advise", {
    method: "POST",
    body: JSON.stringify({ goal, level }),
  });
}

/** Deterministic semester-by-semester study plan. */
export function createEngineStudyPlan(field: string, level?: EducationLevel, years?: number): Promise<StudyPlan> {
  return api<StudyPlan>("/education-engine/study-plan", {
    method: "POST",
    body: JSON.stringify({ field, level, years }),
  });
}

/** Teach any field or course through the real Lecturer AI. */
export function teachEngine(input: { field?: string; title?: string; level?: EducationLevel }): Promise<TeachTurn> {
  return api<TeachTurn>("/education-engine/teach", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Research & thesis guidance for a field. */
export function getEngineResearch(field: string): Promise<ResearchGuidance> {
  return api<ResearchGuidance>(`/education-engine/research/${field}`);
}

/** Academic intelligence: pathway / compare / career / requirements answers. */
export function engineInsight(q: string): Promise<AcademicInsight> {
  return api<AcademicInsight>(`/education-engine/insight?q=${encodeURIComponent(q)}`);
}
