/**
 * WINDELS Universal University & Higher Education Engine.
 *
 * A scalable "Universal Academic Knowledge Architecture" rather than a
 * hand-coded list of every course on Earth:
 *
 *   Academic Domain → Field (course family) → Program → Degree Level → Course
 *     → Module → Topic → Learning Objective → Assessment
 *
 * Domains and fields are curated structured data (the world's major university
 * faculties and course families). Programs, courses and modules are generated
 * deterministically from that data on demand (never a hard-coded exhaustively
 * hand-written catalog), and education providers can populate further detail
 * through imports / admin / university APIs. Every course can be *taught* by
 * handing its teaching topic to the Lecturer AI.
 *
 * A university is a high-level institution that teaches post-secondary across
 * many subjects, awards degrees (bachelor / master / doctor), and does research.
 * This engine understands that globally, recognising that degree names,
 * admission requirements, grading, academic calendars and accreditation differ
 * by country and institution.
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. EDUCATION LEVELS (global)
// ─────────────────────────────────────────────────────────────────────────

export const EDUCATION_LEVELS = [
  // Undergraduate
  "undergraduate_certificate",
  "undergraduate_diploma",
  "associate_degree",
  "bachelor",
  // Postgraduate
  "postgraduate_diploma",
  "master",
  "professional_master",
  // Doctoral
  "phd",
  "professional_doctorate",
  "doctor_of_education",
  "doctor_of_business_administration",
  "other_doctoral",
  // Research & continuing
  "postdoctoral",
  "professional_certification",
  "continuing_education",
  "executive_education",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LEVEL_GROUPS: Record<string, EducationLevel[]> = {
  undergraduate: ["undergraduate_certificate", "undergraduate_diploma", "associate_degree", "bachelor"],
  postgraduate: ["postgraduate_diploma", "master", "professional_master"],
  doctoral: ["phd", "professional_doctorate", "doctor_of_education", "doctor_of_business_administration", "other_doctoral"],
  research: ["postdoctoral"],
  professional: ["professional_certification", "continuing_education", "executive_education"],
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  undergraduate_certificate: "Undergraduate Certificate",
  undergraduate_diploma: "Undergraduate Diploma",
  associate_degree: "Associate Degree",
  bachelor: "Bachelor's Degree",
  postgraduate_diploma: "Postgraduate Diploma",
  master: "Master's Degree",
  professional_master: "Professional Master's",
  phd: "Doctor of Philosophy (PhD)",
  professional_doctorate: "Professional Doctorate",
  doctor_of_education: "Doctor of Education (EdD)",
  doctor_of_business_administration: "Doctor of Business Administration (DBA)",
  other_doctoral: "Other Doctoral Program",
  postdoctoral: "Postdoctoral Research",
  professional_certification: "Professional Certification",
  continuing_education: "Continuing Education",
  executive_education: "Executive Education",
};

// ─────────────────────────────────────────────────────────────────────────
// 2. ACADEMIC KNOWLEDGE ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────

/** A course family / major within a domain (e.g. "Robotics", "Finance"). */
export interface AcademicField {
  id: string;
  name: string;
  description: string;
  /** Typical career outcomes for graduates of this field. */
  careers: string[];
  /** Whether this field commonly continues into a research doctorate. */
  researchPathway?: boolean;
}

/** A major university faculty / discipline grouping (e.g. Engineering). */
export interface AcademicDomain {
  id: string;
  name: string;
  description: string;
  fields: AcademicField[];
}

/** A specific program / degree title in a field at a given level. */
export interface AcademicProgram {
  id: string;
  domainId: string;
  fieldId: string;
  title: string;
  level: EducationLevel;
  /** Degree award short form, e.g. "B.Sc", "M.Eng", "Ph.D". */
  award: string;
  /** Core module names for the programme (generated, curated per field). */
  coreModules: string[];
  /** Total credit requirement (varies by country; representative). */
  totalCredits: number;
}

/** A course / module instance in the knowledge graph. */
export interface AcademicCourse {
  id: string;
  programId: string;
  title: string;
  code: string;
  credits: number;
  /** Handed to the Lecturer AI when a user asks to be taught. */
  teachingTopic: string;
}

export interface DomainSearchHit {
  kind: "domain" | "field";
  id: string;
  name: string;
  domainName: string;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. GLOBAL UNIVERSITY DIRECTORY
// ─────────────────────────────────────────────────────────────────────────

export interface UniversityRecord {
  id: string;
  name: string;
  country: string;      // ISO-3166 alpha-2
  city: string;
  type: "university" | "college" | "polytechnic" | "institute" | "professional_school" | "technical";
  ownership: "public" | "private";
  founded?: number;
  website?: string;
  /** Faculties / domains the university is known for (AcademicDomain ids). */
  domains: string[];
  degreesOffered: EducationLevel[];
  /** Free-form notable facts (accreditation, ranking, international students). */
  notes: string[];
}

export interface CountryEducationProfile {
  country: string;         // ISO-3166 alpha-2
  name: string;
  region: string;
  system: string;          // e.g. "Bologna", "4-year bachelor", "polytechnic"
  bachelorDurationYears: number;
  bachelorYearLabel: string;   // e.g. "Year 1", "Level 1", "Freshman"
  gradingSystem: string;
  academicCalendar: string;
  accreditation: string;
  notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// 4. AI UNIVERSITY ADVISOR OUTPUT
// ─────────────────────────────────────────────────────────────────────────

export interface AdvisorRecommendation {
  goal: string;
  matchedFields: Array<{ fieldId: string; fieldName: string; domainId: string; domainName: string; score: number }>;
  recommendedPathway: Array<{
    fieldId: string;
    fieldName: string;
    domainId: string;
    degreeLevel: EducationLevel;
    award: string;
    programTitle: string;
  }>;
  rationale: string;
  careerOutcomes: string[];
}

export interface StudyPlanSemester {
  semester: number;
  label: string;           // e.g. "Year 1 · Semester 1"
  courses: Array<{ code: string; title: string; credits: number }>;
  totalCredits: number;
}

export interface StudyPlan {
  goal: string;
  fieldId: string;
  fieldName: string;
  degreeLevel: EducationLevel;
  award: string;
  years: number;
  totalCredits: number;
  semesters: StudyPlanSemester[];
}

// ─────────────────────────────────────────────────────────────────────────
// 5. RESEARCH & THESIS SYSTEM
// ─────────────────────────────────────────────────────────────────────────

export interface ResearchMethodology {
  name: string;
  description: string;
  when: string;
}

export interface ResearchGuidance {
  fieldId: string;
  fieldName: string;
  suggestedTopics: string[];
  methodologies: ResearchMethodology[];
  thesisStages: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// 6. ACADEMIC INTELLIGENCE (Q&A answers)
// ─────────────────────────────────────────────────────────────────────────

export interface AcademicInsight {
  question: string;
  category: string;   // e.g. "pathway", "compare", "career", "requirements"
  answer: string;
  related: string[];
}
