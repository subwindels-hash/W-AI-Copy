/**
 * WINDELS Universal University & Higher Education Engine — service layer.
 *
 * Understand. Choose. Learn. Research. Graduate. Build Your Future.
 *
 * Implements the Universal Academic Knowledge Architecture over the curated
 * domain catalog (`@windels/shared`):
 *
 *   Domain → Field → Program → Degree Level → Course → (Lecturer AI teaching)
 *
 * Capabilities:
 *   - discover / browse the global academic catalog and education levels
 *   - global university directory + country-system profiles
 *   - AI University Advisor: career goal → recommended pathway + study plan
 *   - learning: hand any course/topic to the real Lecturer AI
 *   - research & thesis guidance
 *   - academic intelligence (pathway/compare/career answers)
 *
 * Honesty: program generation is deterministic from curated field data; course
 * teaching delegates to the real Lecturer AI (honest "demo-ai" fallback without
 * an AI provider key); progress is derived from lecturer mastery, never faked.
 */
import { LecturerService } from "./lecturer.service.js";
import {
  DOMAIN_BY_ID,
  FIELD_BY_ID,
  UNIVERSITY_DOMAINS,
  COUNTRY_EDUCATION_PROFILES,
  UNIVERSITY_DIRECTORY,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVEL_GROUPS,
  type AcademicCourse,
  type AcademicField,
  type AcademicProgram,
  type AdvisorRecommendation,
  type CountryEducationProfile,
  type DomainSearchHit,
  type EducationLevel,
  type ResearchGuidance,
  type ResearchMethodology,
  type StudyPlan,
  type UniversityRecord,
} from "@windels/shared";

// Representative award short forms per degree level.
const AWARDS: Record<EducationLevel, string> = {
  undergraduate_certificate: "Cert.",
  undergraduate_diploma: "Dip.",
  associate_degree: "A.Sc",
  bachelor: "B.Sc",
  postgraduate_diploma: "PG Dip.",
  master: "M.Sc",
  professional_master: "M.Prof",
  phd: "Ph.D",
  professional_doctorate: "D.Prof",
  doctor_of_education: "Ed.D",
  doctor_of_business_administration: "D.B.A",
  other_doctoral: "D.Phil",
  postdoctoral: "Postdoc",
  professional_certification: "Cert.",
  continuing_education: "CE",
  executive_education: "Exec. Ed",
};

const LECTURER_LEVEL: Record<string, "beginner" | "intermediate" | "advanced"> = {
  undergraduate_certificate: "beginner",
  undergraduate_diploma: "beginner",
  associate_degree: "beginner",
  bachelor: "beginner",
  postgraduate_diploma: "intermediate",
  master: "advanced",
  professional_master: "advanced",
  phd: "advanced",
  professional_doctorate: "advanced",
  doctor_of_education: "advanced",
  doctor_of_business_administration: "advanced",
  other_doctoral: "advanced",
  postdoctoral: "advanced",
  professional_certification: "intermediate",
  continuing_education: "intermediate",
  executive_education: "advanced",
};

/** Common core course names per field, used to generate a deterministic program. */
const CORE_COURSES: Record<string, string[]> = {
  "computer-science": ["Programming Fundamentals", "Data Structures & Algorithms", "Discrete Mathematics", "Operating Systems", "Databases", "Computer Networks"],
  "artificial-intelligence": ["Mathematics for AI", "Machine Learning", "Deep Learning", "Natural Language Processing", "Computer Vision", "AI Ethics & Safety"],
  "data-science": ["Statistics for Data Science", "Python for Data Science", "Machine Learning", "Data Visualization", "Big Data Engineering", "Experimental Design"],
  cybersecurity: ["Network Security", "Cryptography", "Ethical Hacking", "Digital Forensics", "Security Operations", "Risk Management"],
  "software-engineering": ["Software Design", "Web Development", "Software Testing", "DevOps", "Software Architecture", "Requirements Engineering"],
  "mechanical-engineering": ["Engineering Mechanics", "Thermodynamics", "Fluid Mechanics", "Materials Science", "Machine Design", "Manufacturing Processes"],
  medicine: ["Anatomy", "Physiology", "Biochemistry", "Pathology", "Pharmacology", "Clinical Medicine"],
  finance: ["Financial Accounting", "Corporate Finance", "Investment Analysis", "Financial Markets", "Derivatives", "Risk Management"],
  "business-administration": ["Principles of Management", "Organizational Behaviour", "Marketing", "Financial Management", "Strategic Management", "Business Ethics"],
  law: ["Legal Method", "Constitutional Law", "Contract Law", "Criminal Law", "Tort Law", "Jurisprudence"],
  psychology: ["Cognitive Psychology", "Developmental Psychology", "Social Psychology", "Research Methods", "Biopsychology", "Psychopathology"],
};

const DEFAULT_COURSES = ["Introduction to the Field", "Core Principles", "Applied Practice", "Research & Analysis", "Capstone Project"];

function programId(domainId: string, fieldId: string, level: string): string {
  return `${domainId}:${fieldId}:${level}`;
}

function buildProgram(domainId: string, fieldId: string, level: EducationLevel): AcademicProgram {
  const entry = FIELD_BY_ID[fieldId];
  const fieldName = entry?.field.name ?? fieldId;
  const domainName = entry?.domain.name ?? domainId;
  const cores = CORE_COURSES[fieldId] ?? DEFAULT_COURSES;
  const credit = { undergraduate_certificate: 30, undergraduate_diploma: 60, associate_degree: 60, bachelor: 120, postgraduate_diploma: 60, master: 90, professional_master: 60, phd: 0, professional_doctorate: 60, doctor_of_education: 90, doctor_of_business_administration: 60, other_doctoral: 0, postdoctoral: 0, professional_certification: 20, continuing_education: 15, executive_education: 15 }[level];
  return {
    id: programId(domainId, fieldId, level),
    domainId,
    fieldId,
    title: `${fieldName} (${domainName}) — ${EDUCATION_LEVEL_LABELS[level]}`,
    level,
    award: AWARDS[level],
    coreModules: cores,
    totalCredits: credit,
  };
}

function buildCourse(prog: AcademicProgram, idx: number): AcademicCourse {
  const field = FIELD_BY_ID[prog.fieldId];
  const fieldName = field?.field.name ?? prog.fieldId;
  const title = prog.coreModules[idx] ?? prog.coreModules[0];
  const prefix = codePrefix(prog.domainId);
  const num = 100 + idx * 10;
  return {
    id: `${prog.id}:c${idx}`,
    programId: prog.id,
    title,
    code: `${prefix}${num}`,
    credits: prog.totalCredits > 0 ? 3 : 0,
    teachingTopic: `${title} in ${fieldName} — ${EDUCATION_LEVEL_LABELS[prog.level]} level`,
  };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Derive a short course-code prefix from a domain id. */
function codePrefix(domainId: string): string {
  const words = domainId.split("-").filter(Boolean);
  const short = words.length >= 2
    ? words.slice(0, 3).map((w) => w[0]).join("").toUpperCase()
    : domainId.slice(0, 3).toUpperCase();
  return short || "FLD";
}

export class FieldNotFoundError extends Error {
  constructor(fieldId: string) { super(`Academic field not found: ${fieldId}`); this.name = "FieldNotFoundError"; }
}
export class UniversityNotFoundError extends Error {
  constructor(id: string) { super(`University not found: ${id}`); this.name = "UniversityNotFoundError"; }
}

export const UniversityEngineService = {
  // ── Catalog & discovery ─────────────────────────────────────────
  domains() { return UNIVERSITY_DOMAINS; },
  domainById(id: string) { return DOMAIN_BY_ID[id]; },
  fieldById(id: string) { return FIELD_BY_ID[id]; },
  educationLevels() {
    return Object.entries(EDUCATION_LEVEL_GROUPS).map(([group, levels]) => ({
      group,
      label: group.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      levels: levels.map((l) => ({ id: l, label: EDUCATION_LEVEL_LABELS[l] })),
    }));
  },
  search(query: string): DomainSearchHit[] {
    const q = normalize(query);
    if (!q) return [];
    const hits: DomainSearchHit[] = [];
    for (const d of UNIVERSITY_DOMAINS) {
      if (normalize(d.name).includes(q)) hits.push({ kind: "domain", id: d.id, name: d.name, domainName: d.name });
      for (const f of d.fields) {
        const hay = normalize(`${f.name} ${f.description} ${f.careers.join(" ")} ${d.name}`);
        if (hay.includes(q)) hits.push({ kind: "field", id: f.id, name: f.name, domainName: d.name });
      }
    }
    return hits.slice(0, 25);
  },

  // ── Program generation (deterministic, data-driven) ─────────────
  program(domainId: string, fieldId: string, level: EducationLevel): AcademicProgram {
    return buildProgram(domainId, fieldId, level);
  },
  courses(domainId: string, fieldId: string, level: EducationLevel): AcademicCourse[] {
    const prog = buildProgram(domainId, fieldId, level);
    return prog.coreModules.map((_, i) => buildCourse(prog, i));
  },
  fieldPrograms(fieldId: string, levels: EducationLevel[]): AcademicProgram[] {
    return levels.map((l) => buildProgram(FIELD_BY_ID[fieldId]?.domain.id ?? "?", fieldId, l));
  },

  // ── Global university directory ─────────────────────────────────
  universities(country?: string): UniversityRecord[] {
    if (country) return UNIVERSITY_DIRECTORY.filter((u) => u.country.toUpperCase() === country.toUpperCase());
    return UNIVERSITY_DIRECTORY;
  },
  university(id: string): UniversityRecord | undefined {
    return UNIVERSITY_DIRECTORY.find((u) => u.id === id);
  },
  countries(): CountryEducationProfile[] { return COUNTRY_EDUCATION_PROFILES; },
  country(code: string): CountryEducationProfile | undefined {
    return COUNTRY_EDUCATION_PROFILES.find((c) => c.country.toUpperCase() === code.toUpperCase());
  },

  // ── AI University Advisor ────────────────────────────────────────
  /**
   * Match a career goal against field names + career keywords and recommend a
   * degree pathway (field → program) with an AI narrative.
   */
  async advise(goal: string, targetLevel: EducationLevel = "bachelor"): Promise<AdvisorRecommendation> {
    const tokens = normalize(goal).split(" ").filter((t) => t.length > 2);
    const scored: Array<{ field: AcademicField; domainId: string; domainName: string; score: number }> = [];
    for (const d of UNIVERSITY_DOMAINS) {
      for (const f of d.fields) {
        let score = 0;
        const hay = normalize(`${f.name} ${f.description} ${f.careers.join(" ")} ${d.name}`);
        for (const t of tokens) if (hay.includes(t)) score += 1;
        if (score > 0) scored.push({ field: f, domainId: d.id, domainName: d.name, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);

    // Build a recommended pathway through degree levels.
    const order: EducationLevel[] = ["undergraduate_certificate", "bachelor", "master", "phd"];
    const pathLevel = order.includes(targetLevel) ? order.indexOf(targetLevel) : 1;
    const chosen = top[0];
    const pathway = top.length ? order.slice(0, pathLevel + 1).map((lv) => {
      const p = buildProgram(chosen.domainId, chosen.field.id, lv);
      return { fieldId: chosen.field.id, fieldName: chosen.field.name, domainId: chosen.domainId, degreeLevel: lv, award: p.award, programTitle: p.title };
    }) : [];

    const rationale = top.length
      ? `Your goal "${goal}" best matches the field of ${chosen.field.name} (within ${chosen.domainName}). This field builds skills in ${chosen.field.description} and leads to careers such as ${chosen.field.careers.slice(0, 3).join(", ")}.`
      : `We could not strongly match "${goal}" to a specific field. Browse the academic catalog to explore options; each field includes its career pathways.`;

    return {
      goal,
      matchedFields: top.map((t) => ({ fieldId: t.field.id, fieldName: t.field.name, domainId: t.domainId, domainName: t.domainName, score: t.score })),
      recommendedPathway: pathway,
      rationale,
      careerOutcomes: top.flatMap((t) => t.field.careers).slice(0, 8),
    };
  },

  /** Deterministic semester-by-semester study plan for a field at a degree level. */
  createStudyPlan(fieldId: string, level: EducationLevel, years: number): StudyPlan {
    const entry = FIELD_BY_ID[fieldId];
    if (!entry) throw new FieldNotFoundError(fieldId);
    const prog = buildProgram(entry.domain.id, fieldId, level);
    const cores = prog.coreModules;
    const nSemesters = Math.max(1, years * 2);
    const semesters = [];
    for (let s = 0; s < nSemesters; s++) {
      const yr = Math.floor(s / 2) + 1;
      const sem = (s % 2) + 1;
      // Rotate through core modules deterministically; fill with progression.
      const courseCount = 4;
      const courses = Array.from({ length: courseCount }, (_, i) => {
        const mod = cores[(s + i) % cores.length];
        const levelNum = 100 + yr * 100 + (sem - 1) * 10 + i;
        return { code: `${codePrefix(entry.domain.id)}${levelNum}`, title: mod, credits: 3 };
      });
      semesters.push({
        semester: s + 1,
        label: `Year ${yr} · Semester ${sem}`,
        courses,
        totalCredits: courses.reduce((n, c) => n + c.credits, 0),
      });
    }
    return {
      goal: `Study ${prog.title}`,
      fieldId,
      fieldName: entry.field.name,
      degreeLevel: level,
      award: prog.award,
      years,
      totalCredits: prog.totalCredits || semesters.reduce((n, s) => n + s.totalCredits, 0),
      semesters,
    };
  },

  // ── Learning: teach any field/course via the real Lecturer AI ───
  /**
   * Start a Lecturer AI session teaching a field at a degree level (or an
   * explicit course title). Delegates to the real adaptive tutor.
   */
  async teach(userId: string, input: { fieldId?: string; title?: string; level?: EducationLevel }): Promise<{ topic: string; turn: Awaited<ReturnType<typeof LecturerService.start>> }> {
    let topic: string;
    let lvl: EducationLevel = "bachelor";
    if (input.fieldId && FIELD_BY_ID[input.fieldId]) {
      const f = FIELD_BY_ID[input.fieldId];
      lvl = input.level ?? "bachelor";
      topic = `${f.field.name} — ${EDUCATION_LEVEL_LABELS[lvl]} level. ${f.field.description} Cover the core concepts and skills needed in this field at ${EDUCATION_LEVEL_LABELS[lvl]} level.`;
    } else if (input.title) {
      lvl = input.level ?? "bachelor";
      topic = `${input.title} — ${EDUCATION_LEVEL_LABELS[lvl]} level`;
    } else {
      throw new Error("Provide a fieldId or a course title to teach.");
    }
    const turn = await LecturerService.start(userId, topic, LECTURER_LEVEL[lvl]);
    return { topic, turn };
  },

  // ── Research & thesis system ────────────────────────────────────
  researchGuidance(fieldId: string): ResearchGuidance {
    const entry = FIELD_BY_ID[fieldId];
    if (!entry) throw new FieldNotFoundError(fieldId);
    const methodologies: ResearchMethodology[] = [
      { name: "Systematic Literature Review", description: "Structured search and synthesis of existing research.", when: "Establish the state of the art and research gap." },
      { name: "Quantitative / Experimental", description: "Controlled experiments, measurements and statistical analysis.", when: "Test hypotheses with measurable outcomes." },
      { name: "Qualitative / Case Study", description: "In-depth exploration of cases, interviews and observation.", when: "Understand context, process and meaning." },
      { name: "Design Science / Applied", description: "Build and evaluate an artefact, prototype or system.", when: "Solve a practical problem and evaluate a solution." },
    ];
    return {
      fieldId,
      fieldName: entry.field.name,
      suggestedTopics: entry.field.careers.slice(0, 4).map((c) => `Emerging challenges and future directions in ${entry.field.name} (for ${c})`),
      methodologies,
      thesisStages: ["Topic & research question", "Proposal & ethics approval", "Literature review", "Methodology & data collection", "Analysis", "Writing & revision", "Defence & submission"],
    };
  },

  // ── Academic intelligence (pathway / compare / career) ──────────
  insight(question: string): { question: string; category: string; answer: string; related: string[] } {
    const q = normalize(question);
    let category = "general";
    let answer = "Browse the academic catalog, use the advisor with your goal, or ask me to teach or plan a course.";
    let related: string[] = [];

    if (/what.*(study|course).*computer science/i.test(q) || /courses.*computer science/i.test(q)) {
      category = "pathway";
      const f = FIELD_BY_ID["computer-science"];
      answer = `To study Computer Science you would typically take ${f.field.description} Core modules include ${(CORE_COURSES["computer-science"] ?? []).join(", ")}. You can start a Lecturer AI session on this field at any level.`;
      related = ["Data Structures & Algorithms", "Machine Learning", "Software Engineering"];
    } else if (/difference.*(computer science|software engineering)/i.test(q) || /vs/i.test(q)) {
      category = "compare";
      answer = "Computer Science focuses on the theoretical foundations of computation (algorithms, systems, how computers work), while Software Engineering focuses on the practical, disciplined construction and maintenance of software products. CS → research/systems; SE → building and shipping software. I can teach you either.";
      related = ["Computer Science", "Software Engineering"];
    } else if (/what.*(do|can).*(with|do).*degree.*(economics|finance|law|biology|engineering|psychology)/i.test(q) || /career.*(economics|finance|law|biology|engineering|psychology)/i.test(q)) {
      category = "career";
      const m = q.match(/(economics|finance|law|biology|engineering|psychology)/);
      const key = m?.[1] ?? "";
      const f = FIELD_BY_ID[key] ?? FIELD_BY_ID[`${key}-engineering`];
      answer = f ? `A degree in ${f.field.name} leads to careers such as ${f.field.careers.join(", ")}. The AI Advisor can build you a personalised pathway from your goal.` : "Tell me the subject and I'll map its career paths.";
      related = f ? f.field.careers.slice(0, 4) : [];
    } else if (/what.*(bachelor|degree|required).*study/i.test(q) || /required.*(bachelor|course)/i.test(q)) {
      category = "requirements";
      answer = "A bachelor's degree is typically a 3–4 year (120-credit) programme combining major/core courses, breadth/electives and a capstone project. Admission usually requires secondary-school completion and country-specific exams. Use a country profile or a specific field to see details.";
      related = ["Bachelor's Degree"];
    } else if (/teach.*(me|this).*(subject|course|topic)/i.test(q)) {
      category = "learning";
      answer = "I can teach any course through the Lecturer AI. Pick a field or give me a course title and a level (bachelor/master), and I'll start an adaptive tutoring session.";
      related = ["Lecturer AI"];
    }
    return { question, category, answer, related };
  },
};

export default UniversityEngineService;
