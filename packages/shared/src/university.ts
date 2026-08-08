/**
 * University Education — Lecturer AI teaching platform.
 *
 * A university is a high-level institution of learning that:
 *   - teaches after secondary school (post-secondary),
 *   - spans many subjects (multiple faculties / colleges / departments),
 *   - awards degrees at three levels: bachelor (undergraduate),
 *     master (postgraduate) and doctorate/doctor (doctoral research),
 *   - conducts research work.
 *
 * This module models a full university catalog — faculties, departments,
 * courses at each degree level, and research areas — and connects every course
 * to the Lecturer AI adaptive tutor so the OS can actually teach them.
 *
 * Courses are organized into `UniversityFaculty` (e.g. Engineering, Medicine,
 * Business, Law …), each with departments, degree awards, and research areas.
 * Each `UniversityCourse` carries the degree level, code, credits and a
 * `teachingTopic` string handed to the Lecturer AI.
 *
 * Honesty rules carried through from the rest of the education stack:
 *   - teaching delegates to the real Lecturer AI (structured fallback tagged
 *     "demo-ai" when no AI provider key is configured),
 *   - progress is derived from the lecturer's persisted mastery — never
 *     fabricated, never a fake 0 for topics never started.
 */

export const UNIVERSITY_DEGREE_LEVELS = ["bachelor", "master", "doctor"] as const;
export type UniversityDegreeLevel = (typeof UNIVERSITY_DEGREE_LEVELS)[number];

export const UNIVERSITY_DEGREE_LABELS: Record<UniversityDegreeLevel, string> = {
  bachelor: "Bachelor",
  master: "Master",
  doctor: "Doctorate",
};

export interface UniversityFaculty {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** Degree titles awarded at each level, e.g. "B.Sc", "M.Sc", "Ph.D". */
  awards: Record<UniversityDegreeLevel, string>;
  /** The research work this faculty conducts. */
  researchAreas: string[];
}

export interface UniversityCourse {
  id: string;
  faculty: string;          // UniversityFaculty.id
  department: string;
  title: string;
  /** Course code, e.g. "CSC101". */
  code: string;
  level: UniversityDegreeLevel;
  credits: number;
  description: string;
  /** The concrete subject string handed to the Lecturer AI. */
  teachingTopic: string;
  /** Prerequisite course ids. */
  prerequisites: string[];
  /** Semester/term number within the degree programme (1-based). */
  term?: number;
}

export interface UniversityCatalogView {
  total: number;
  faculties: UniversityFaculty[];
  courses: UniversityCourse[];
}

export interface UniversityProgressEntry {
  courseId: string;
  code: string;
  title: string;
  faculty: string;
  department: string;
  level: UniversityDegreeLevel;
  masteryPct: number | null; // null = never started (never a fabricated 0)
  started: boolean;
  completed: boolean;        // mastery >= 85 (lecturer completion threshold)
}

export interface UniversityPathNode {
  courseId: string;
  code: string;
  title: string;
  faculty: string;
  level: UniversityDegreeLevel;
  prerequisites: string[];
  prerequisitesMet: boolean;
  masteryPct: number | null;
  completed: boolean;
  started: boolean;
  nextRecommended: boolean;
}

export interface UniversityDegreePlan {
  facultyId: string;
  facultyName: string;
  levels: UniversityDegreeLevel[];
  courses: UniversityPathNode[];
}

export interface UniversityOverview {
  facultiesCount: number;
  coursesCount: number;
  researchAreasCount: number;
  degreesOffered: UniversityDegreeLevel[];
  faculties: UniversityFaculty[];
}

// ─────────────────────────────────────────────────────────────────────────
// CATALOG — the university's teaching and research programme
// ─────────────────────────────────────────────────────────────────────────

export const UNIVERSITY_FACULTIES: UniversityFaculty[] = [
  {
    id: "engineering",
    name: "Faculty of Engineering",
    shortName: "ENG",
    description: "Applied mathematics and science to design, build and maintain machines, structures, processes and systems.",
    awards: { bachelor: "B.Eng", master: "M.Eng", doctor: "Ph.D (Eng)" },
    researchAreas: ["Materials science", "Robotics & automation", "Sustainable energy systems", "Structural & civil safety", "Additive manufacturing"],
  },
  {
    id: "computing",
    name: "Faculty of Computing & Information Technology",
    shortName: "CSC",
    description: "Computer science, software engineering, data science, artificial intelligence, and information systems.",
    awards: { bachelor: "B.Sc (Comp)", master: "M.Sc (Comp)", doctor: "Ph.D (Comp)" },
    researchAreas: ["Artificial intelligence & machine learning", "Cybersecurity & ethical hacking", "Human-computer interaction", "Distributed & cloud systems", "Data science & big data"],
  },
  {
    id: "natural-sciences",
    name: "Faculty of Natural & Physical Sciences",
    shortName: "SCI",
    description: "Physics, chemistry, biology, mathematics and the fundamental sciences.",
    awards: { bachelor: "B.Sc", master: "M.Sc", doctor: "Ph.D (Sci)" },
    researchAreas: ["Quantum physics", "Climate & environmental science", "Biochemistry & molecular biology", "Pure & applied mathematics", "Materials chemistry"],
  },
  {
    id: "health-sciences",
    name: "Faculty of Health Sciences",
    shortName: "MED",
    description: "Medicine, nursing, pharmacy, public health and allied health professions.",
    awards: { bachelor: "B.Sc / MB.BS", master: "M.P.H / M.Sc", doctor: "Ph.D / M.D" },
    researchAreas: ["Clinical trials & evidence-based medicine", "Public & community health", "Pharmacology & drug discovery", "Epidemiology & biostatistics", "Health informatics"],
  },
  {
    id: "business",
    name: "Faculty of Business & Management",
    shortName: "BUS",
    description: "Accounting, finance, economics, marketing, management and entrepreneurship.",
    awards: { bachelor: "B.B.A", master: "M.B.A", doctor: "Ph.D (Mgmt)" },
    researchAreas: ["Corporate finance & investment", "Organizational behaviour", "Marketing analytics", "Entrepreneurship & innovation", "Managerial economics"],
  },
  {
    id: "law",
    name: "Faculty of Law",
    shortName: "LAW",
    description: "Legal systems, legislation, justice, human rights and legal practice.",
    awards: { bachelor: "LL.B", master: "LL.M", doctor: "Ph.D (Law)" },
    researchAreas: ["International & human-rights law", "Criminal justice", "Constitutional law", "Commercial & corporate law", "Legal technology"],
  },
  {
    id: "humanities",
    name: "Faculty of Humanities & Social Sciences",
    shortName: "HSS",
    description: "Languages, literature, history, philosophy, psychology, sociology and the arts of human culture.",
    awards: { bachelor: "B.A", master: "M.A", doctor: "Ph.D (Arts)" },
    researchAreas: ["Linguistics & language preservation", "Social & cultural studies", "Cognitive psychology", "Public policy & governance", "History & heritage"],
  },
  {
    id: "agriculture",
    name: "Faculty of Agriculture & Environmental Sciences",
    shortName: "AGR",
    description: "Crop and animal production, food science, forestry, and environmental stewardship.",
    awards: { bachelor: "B.Agric", master: "M.Sc (Agric)", doctor: "Ph.D (Agric)" },
    researchAreas: ["Food security & sustainable agriculture", "Soil & water science", "Animal & veterinary science", "Environmental conservation", "Agricultural economics"],
  },
  {
    id: "education",
    name: "Faculty of Education",
    shortName: "EDU",
    description: "Pedagogy, curriculum design, educational technology and teacher training.",
    awards: { bachelor: "B.Ed", master: "M.Ed", doctor: "Ph.D (Educ)" },
    researchAreas: ["Instructional design & ed-tech", "Assessment & learning analytics", "Special & inclusive education", "Curriculum theory", "Higher-education policy"],
  },
  {
    id: "arts",
    name: "Faculty of Arts, Design & Communication",
    shortName: "ART",
    description: "Fine art, design, music, theatre, film, journalism and media production.",
    awards: { bachelor: "B.A (Design)", master: "M.F.A", doctor: "Ph.D (Fine Arts)" },
    researchAreas: ["Visual & communication design", "Film & media studies", "Music & performing arts", "Creative & cultural industries", "Media & journalism ethics"],
  },
];

export const UNIVERSITY_COURSES: UniversityCourse[] = [
  // ── Faculty of Engineering ────────────────────────────────────────
  { id: "eng-101", faculty: "engineering", department: "General Engineering", title: "Introduction to Engineering", code: "ENG101", level: "bachelor", credits: 3, term: 1, description: "Engineering design process, problem solving and professional practice.", teachingTopic: "Introduction to Engineering: the engineering design process, systems thinking, units and measurement, ethics and professional practice at bachelor level", prerequisites: [] },
  { id: "eng-201", faculty: "engineering", department: "Mechanical", title: "Engineering Mechanics", code: "MEC201", level: "bachelor", credits: 4, term: 2, description: "Statics and dynamics, forces, moments and equilibrium.", teachingTopic: "Engineering Mechanics: statics and dynamics, forces, moments, equilibrium, and free-body diagrams at bachelor level", prerequisites: ["eng-101"] },
  { id: "eng-202", faculty: "engineering", department: "Electrical", title: "Circuit Analysis", code: "ELE202", level: "bachelor", credits: 4, term: 2, description: "DC and AC circuits, Kirchhoff's laws, network theorems.", teachingTopic: "Electrical Circuit Analysis: DC and AC circuits, Kirchhoff's laws, Ohm's law, and network theorems at bachelor level", prerequisites: ["eng-101"] },
  { id: "eng-301", faculty: "engineering", department: "Civil", title: "Structural Analysis", code: "CIV301", level: "bachelor", credits: 4, term: 3, description: "Beams, frames, trusses, loads and deflections.", teachingTopic: "Structural Analysis: beams, frames, trusses, loads, deflections, and statically determinate systems at bachelor level", prerequisites: ["eng-201"] },
  { id: "eng-302", faculty: "engineering", department: "Chemical", title: "Thermodynamics", code: "CHE302", level: "bachelor", credits: 3, term: 3, description: "Laws of thermodynamics, energy, entropy and cycles.", teachingTopic: "Engineering Thermodynamics: the laws of thermodynamics, energy, entropy, heat engines, and power cycles at bachelor level", prerequisites: ["eng-201"] },
  { id: "eng-400", faculty: "engineering", department: "Robotics", title: "Robotics & Automation", code: "ROB400", level: "master", credits: 3, description: "Robot kinematics, control, sensors and industrial automation.", teachingTopic: "Robotics and Automation: kinematics, dynamics, control, sensors, actuators, and industrial automation systems at master level", prerequisites: ["eng-302"] },
  { id: "eng-401", faculty: "engineering", department: "Materials", title: "Advanced Materials Science", code: "MAT401", level: "master", credits: 3, description: "Material structure, properties, alloys and composites.", teachingTopic: "Advanced Materials Science: crystal structure, mechanical and thermal properties, alloys, composites, and failure analysis at master level", prerequisites: ["eng-302"] },
  { id: "eng-500", faculty: "engineering", department: "Research", title: "Doctoral Research in Engineering", code: "ENG500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Engineering: defining a research problem, literature review, methodology, experimentation, and thesis writing at doctorate level", prerequisites: ["eng-400"] },

  // ── Faculty of Computing & IT ──────────────────────────────────────
  { id: "csc-101", faculty: "computing", department: "Computer Science", title: "Introduction to Programming", code: "CSC101", level: "bachelor", credits: 3, term: 1, description: "Programming fundamentals: data types, control flow, functions.", teachingTopic: "Introduction to Programming: variables, data types, control flow, functions, and problem solving with code at bachelor level", prerequisites: [] },
  { id: "csc-102", faculty: "computing", department: "Computer Science", title: "Discrete Mathematics", code: "CSC102", level: "bachelor", credits: 3, term: 1, description: "Logic, sets, relations, graphs and proof techniques.", teachingTopic: "Discrete Mathematics: propositional and predicate logic, sets, relations, functions, graph theory, and proof techniques at bachelor level", prerequisites: [] },
  { id: "csc-201", faculty: "computing", department: "Computer Science", title: "Data Structures & Algorithms", code: "CSC201", level: "bachelor", credits: 4, term: 2, description: "Arrays, lists, trees, graphs, sorting and algorithm analysis.", teachingTopic: "Data Structures and Algorithms: arrays, linked lists, stacks, queues, trees, graphs, sorting, and algorithmic complexity at bachelor level", prerequisites: ["csc-101", "csc-102"] },
  { id: "csc-202", faculty: "computing", department: "Computer Science", title: "Computer Architecture", code: "CSC202", level: "bachelor", credits: 3, term: 2, description: "CPU, memory hierarchy, instruction sets and assembly.", teachingTopic: "Computer Architecture: CPU design, instruction set architecture, memory hierarchy, pipelining, and assembly language at bachelor level", prerequisites: ["csc-101"] },
  { id: "csc-301", faculty: "computing", department: "Computer Science", title: "Operating Systems", code: "CSC301", level: "bachelor", credits: 3, term: 3, description: "Processes, threads, scheduling, memory and file systems.", teachingTopic: "Operating Systems: processes, threads, CPU scheduling, memory management, virtual memory, and file systems at bachelor level", prerequisites: ["csc-202"] },
  { id: "csc-302", faculty: "computing", department: "Cybersecurity", title: "Cybersecurity Fundamentals", code: "CSC302", level: "bachelor", credits: 3, term: 3, description: "Threats, cryptography basics, network security and best practice.", teachingTopic: "Cybersecurity Fundamentals: threats and vulnerabilities, cryptographic basics, network security, authentication, and security best practice at bachelor level", prerequisites: ["csc-201"] },
  { id: "csc-303", faculty: "computing", department: "Data Science", title: "Databases & SQL", code: "CSC303", level: "bachelor", credits: 3, term: 3, description: "Relational design, SQL, transactions and normalization.", teachingTopic: "Databases and SQL: relational data model, normalization, SQL queries, transactions, and database design at bachelor level", prerequisites: ["csc-201"] },
  { id: "csc-401", faculty: "computing", department: "Cybersecurity", title: "Ethical Hacking & Penetration Testing", code: "CSC401", level: "master", credits: 3, description: "Recon, scanning, exploitation and responsible disclosure.", teachingTopic: "Ethical Hacking and Penetration Testing: reconnaissance, scanning, exploitation, privilege escalation, and responsible disclosure at master level", prerequisites: ["csc-302"] },
  { id: "csc-402", faculty: "computing", department: "AI", title: "Machine Learning", code: "CSC402", level: "master", credits: 3, description: "Supervised/unsupervised learning, models and evaluation.", teachingTopic: "Machine Learning: supervised and unsupervised learning, regression, classification, clustering, and model evaluation at master level", prerequisites: ["csc-301", "csc-303"] },
  { id: "csc-403", faculty: "computing", department: "AI", title: "Artificial Intelligence", code: "CSC403", level: "master", credits: 3, description: "Search, knowledge representation, reasoning and agents.", teachingTopic: "Artificial Intelligence: search algorithms, knowledge representation, reasoning, planning, and intelligent agents at master level", prerequisites: ["csc-402"] },
  { id: "csc-500", faculty: "computing", department: "Research", title: "Doctoral Research in Computing", code: "CSC500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Computing: research design, algorithm design, experimentation, and thesis writing at doctorate level", prerequisites: ["csc-403"] },

  // ── Faculty of Natural & Physical Sciences ────────────────────────
  { id: "sci-101", faculty: "natural-sciences", department: "Physics", title: "Introductory Physics", code: "PHY101", level: "bachelor", credits: 3, term: 1, description: "Mechanics, waves, heat and electricity.", teachingTopic: "Introductory Physics: mechanics, waves, heat, electricity, and the scientific method at bachelor level", prerequisites: [] },
  { id: "sci-102", faculty: "natural-sciences", department: "Mathematics", title: "Calculus I", code: "MAT101", level: "bachelor", credits: 3, term: 1, description: "Limits, derivatives, integrals and applications.", teachingTopic: "Calculus I: limits, continuity, derivatives, integrals, and applications of differentiation and integration at bachelor level", prerequisites: [] },
  { id: "sci-103", faculty: "natural-sciences", department: "Chemistry", title: "General Chemistry", code: "CHE101", level: "bachelor", credits: 3, term: 1, description: "Atoms, bonding, reactions, and stoichiometry.", teachingTopic: "General Chemistry: atomic structure, chemical bonding, reactions, stoichiometry, and the periodic table at bachelor level", prerequisites: [] },
  { id: "sci-201", faculty: "natural-sciences", department: "Biology", title: "Cell & Molecular Biology", code: "BIO201", level: "bachelor", credits: 3, term: 2, description: "Cell structure, metabolism, and molecular processes.", teachingTopic: "Cell and Molecular Biology: cell structure and function, membranes, metabolism, DNA, and gene expression at bachelor level", prerequisites: ["sci-103"] },
  { id: "sci-202", faculty: "natural-sciences", department: "Physics", title: "Quantum Mechanics", code: "PHY202", level: "bachelor", credits: 3, term: 2, description: "Wave functions, operators and the Schrödinger equation.", teachingTopic: "Quantum Mechanics: wave functions, observables, operators, the Schrödinger equation, and quantum measurement at bachelor level", prerequisites: ["sci-101", "sci-102"] },
  { id: "sci-301", faculty: "natural-sciences", department: "Statistics", title: "Statistical Methods", code: "STA301", level: "bachelor", credits: 3, term: 3, description: "Probability, inference, hypothesis testing and regression.", teachingTopic: "Statistical Methods: probability, sampling, hypothesis testing, confidence intervals, and regression analysis at bachelor level", prerequisites: ["sci-102"] },
  { id: "sci-401", faculty: "natural-sciences", department: "Chemistry", title: "Advanced Physical Chemistry", code: "CHE401", level: "master", credits: 3, description: "Thermodynamics, kinetics, quantum chemistry.", teachingTopic: "Advanced Physical Chemistry: thermodynamics, chemical kinetics, quantum chemistry, and spectroscopy at master level", prerequisites: ["sci-202"] },
  { id: "sci-402", faculty: "natural-sciences", department: "Biology", title: "Advanced Biochemistry", code: "BIO402", level: "master", credits: 3, description: "Enzymes, pathways, and metabolic regulation.", teachingTopic: "Advanced Biochemistry: enzymes, metabolic pathways, bioenergetics, and regulation of metabolism at master level", prerequisites: ["sci-201"] },
  { id: "sci-500", faculty: "natural-sciences", department: "Research", title: "Doctoral Research in Natural Sciences", code: "SCI500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Natural Sciences: hypothesis testing, experimental design, quantitative analysis, and thesis writing at doctorate level", prerequisites: ["sci-401"] },

  // ── Faculty of Health Sciences ────────────────────────────────────
  { id: "med-101", faculty: "health-sciences", department: "Medicine", title: "Anatomy & Physiology I", code: "MED101", level: "bachelor", credits: 4, term: 1, description: "Human body structure and function.", teachingTopic: "Anatomy and Physiology: body organization, organ systems, structure and function of the human body at bachelor level", prerequisites: [] },
  { id: "med-102", faculty: "health-sciences", department: "Public Health", title: "Introduction to Public Health", code: "PHS102", level: "bachelor", credits: 3, term: 1, description: "Population health, epidemiology and prevention.", teachingTopic: "Introduction to Public Health: determinants of health, epidemiology, disease prevention, and health promotion at bachelor level", prerequisites: [] },
  { id: "med-201", faculty: "health-sciences", department: "Nursing", title: "Nursing Practice & Care", code: "NUR201", level: "bachelor", credits: 3, term: 2, description: "Patient care, safety and nursing process.", teachingTopic: "Nursing Practice and Care: the nursing process, patient assessment, safety, and evidence-based care at bachelor level", prerequisites: ["med-101"] },
  { id: "med-301", faculty: "health-sciences", department: "Public Health", title: "Epidemiology", code: "PHS301", level: "bachelor", credits: 3, term: 3, description: "Disease distribution, study designs and biostatistics.", teachingTopic: "Epidemiology: disease distribution, study designs, measures of association, and biostatistics at bachelor level", prerequisites: ["med-102"] },
  { id: "med-302", faculty: "health-sciences", department: "Pharmacy", title: "Pharmacology", code: "PHA302", level: "bachelor", credits: 3, term: 3, description: "Drug action, mechanisms and therapeutics.", teachingTopic: "Pharmacology: drug mechanisms of action, pharmacokinetics, pharmacodynamics, and therapeutic use at bachelor level", prerequisites: ["med-101"] },
  { id: "med-401", faculty: "health-sciences", department: "Public Health", title: "Global Health & Policy", code: "PHS401", level: "master", credits: 3, description: "Health systems, policy and global disease burden.", teachingTopic: "Global Health and Policy: health systems, health policy, global disease burden, and health equity at master level", prerequisites: ["med-301"] },
  { id: "med-402", faculty: "health-sciences", department: "Medicine", title: "Clinical Epidemiology & Evidence-Based Medicine", code: "MED402", level: "master", credits: 3, description: "Critical appraisal and clinical research methods.", teachingTopic: "Evidence-Based Medicine and Clinical Epidemiology: critical appraisal, clinical trials, and research methods at master level", prerequisites: ["med-301"] },
  { id: "med-500", faculty: "health-sciences", department: "Research", title: "Doctoral Research in Health Sciences", code: "MED500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Health Sciences: research ethics, clinical research design, biostatistics, and thesis writing at doctorate level", prerequisites: ["med-402"] },

  // ── Faculty of Business & Management ──────────────────────────────
  { id: "bus-101", faculty: "business", department: "Management", title: "Principles of Management", code: "BUS101", level: "bachelor", credits: 3, term: 1, description: "Planning, organizing, leading and controlling.", teachingTopic: "Principles of Management: planning, organizing, leading, controlling, and organizational structures at bachelor level", prerequisites: [] },
  { id: "bus-102", faculty: "business", department: "Accounting", title: "Financial Accounting", code: "ACC102", level: "bachelor", credits: 3, term: 1, description: "Financial statements, transactions and reporting.", teachingTopic: "Financial Accounting: the accounting cycle, financial statements, transactions, and reporting at bachelor level", prerequisites: [] },
  { id: "bus-201", faculty: "business", department: "Economics", title: "Microeconomics", code: "ECO201", level: "bachelor", credits: 3, term: 2, description: "Supply, demand, markets and firm behaviour.", teachingTopic: "Microeconomics: supply and demand, market structures, elasticity, and firm behaviour at bachelor level", prerequisites: [] },
  { id: "bus-202", faculty: "business", department: "Finance", title: "Corporate Finance", code: "FIN202", level: "bachelor", credits: 3, term: 2, description: "Time value of money, risk, capital budgeting.", teachingTopic: "Corporate Finance: time value of money, risk and return, capital budgeting, and capital structure at bachelor level", prerequisites: ["bus-102"] },
  { id: "bus-301", faculty: "business", department: "Marketing", title: "Marketing Principles", code: "MKT301", level: "bachelor", credits: 3, term: 3, description: "Segmentation, positioning, the marketing mix.", teachingTopic: "Marketing Principles: market segmentation, targeting, positioning, and the 4Ps marketing mix at bachelor level", prerequisites: ["bus-101"] },
  { id: "bus-401", faculty: "business", department: "Management", title: "Strategic Management", code: "BUS401", level: "master", credits: 3, description: "Strategy formulation, analysis and execution.", teachingTopic: "Strategic Management: external and internal analysis, strategy formulation, competitive advantage, and execution at master level", prerequisites: ["bus-301"] },
  { id: "bus-402", faculty: "business", department: "Finance", title: "Advanced Financial Modelling", code: "FIN402", level: "master", credits: 3, description: "Valuation, forecasting and modelling.", teachingTopic: "Advanced Financial Modelling: valuation, forecasting, scenario analysis, and financial modelling techniques at master level", prerequisites: ["bus-202"] },
  { id: "bus-403", faculty: "business", department: "Entrepreneurship", title: "Entrepreneurship & Innovation", code: "ENT403", level: "master", credits: 3, description: "Ventures, business models and funding.", teachingTopic: "Entrepreneurship and Innovation: opportunity recognition, business models, venture funding, and scaling at master level", prerequisites: ["bus-401"] },
  { id: "bus-500", faculty: "business", department: "Research", title: "Doctoral Research in Business", code: "BUS500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Business: research design, quantitative and qualitative methods, and thesis writing at doctorate level", prerequisites: ["bus-403"] },

  // ── Faculty of Law ────────────────────────────────────────────────
  { id: "law-101", faculty: "law", department: "Law", title: "Introduction to Law", code: "LAW101", level: "bachelor", credits: 3, term: 1, description: "Legal systems, sources of law and legal reasoning.", teachingTopic: "Introduction to Law: legal systems, sources of law, legal reasoning, and the structure of the legal profession at bachelor level", prerequisites: [] },
  { id: "law-201", faculty: "law", department: "Law", title: "Constitutional Law", code: "LAW201", level: "bachelor", credits: 3, term: 2, description: "State structure, rights and judicial review.", teachingTopic: "Constitutional Law: the structure of the state, separation of powers, fundamental rights, and judicial review at bachelor level", prerequisites: ["law-101"] },
  { id: "law-202", faculty: "law", department: "Law", title: "Contract Law", code: "LAW202", level: "bachelor", credits: 3, term: 2, description: "Formation, terms, breach and remedies.", teachingTopic: "Contract Law: formation, terms, vitiating factors, breach, and remedies at bachelor level", prerequisites: ["law-101"] },
  { id: "law-301", faculty: "law", department: "Criminal Justice", title: "Criminal Law", code: "LAW301", level: "bachelor", credits: 3, term: 3, description: "Offences, defences and criminal procedure.", teachingTopic: "Criminal Law: elements of offences, defences, criminal responsibility, and criminal procedure at bachelor level", prerequisites: ["law-201"] },
  { id: "law-302", faculty: "law", department: "Law", title: "International Law", code: "LAW302", level: "bachelor", credits: 3, term: 3, description: "Sources, treaties, states and international organisations.", teachingTopic: "International Law: sources of international law, treaties, statehood, and international organisations at bachelor level", prerequisites: ["law-201"] },
  { id: "law-401", faculty: "law", department: "Law", title: "Commercial & Corporate Law", code: "LAW401", level: "master", credits: 3, description: "Business structures, transactions and regulation.", teachingTopic: "Commercial and Corporate Law: business entities, corporate governance, commercial transactions, and regulation at master level", prerequisites: ["law-202"] },
  { id: "law-500", faculty: "law", department: "Research", title: "Doctoral Research in Law", code: "LAW500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Law: legal research methods, comparative analysis, doctrinal research, and thesis writing at doctorate level", prerequisites: ["law-401"] },

  // ── Faculty of Humanities & Social Sciences ───────────────────────
  { id: "hss-101", faculty: "humanities", department: "Psychology", title: "Introduction to Psychology", code: "PSY101", level: "bachelor", credits: 3, term: 1, description: "Mind, behaviour, development and social processes.", teachingTopic: "Introduction to Psychology: perception, learning, memory, development, social behaviour, and mental processes at bachelor level", prerequisites: [] },
  { id: "hss-102", faculty: "humanities", department: "History", title: "World Civilizations", code: "HIS102", level: "bachelor", credits: 3, term: 1, description: "Major civilizations and historical change.", teachingTopic: "World Civilizations: major civilizations, historical change, and the making of the modern world at bachelor level", prerequisites: [] },
  { id: "hss-103", faculty: "humanities", department: "Languages", title: "Linguistics", code: "LIN103", level: "bachelor", credits: 3, term: 1, description: "Language structure, sound and meaning.", teachingTopic: "Linguistics: phonetics, phonology, morphology, syntax, semantics, and language acquisition at bachelor level", prerequisites: [] },
  { id: "hss-201", faculty: "humanities", department: "Philosophy", title: "Ethics & Critical Thinking", code: "PHI201", level: "bachelor", credits: 3, term: 2, description: "Moral reasoning, argument and critical analysis.", teachingTopic: "Ethics and Critical Thinking: moral theories, ethical reasoning, logical argumentation, and critical analysis at bachelor level", prerequisites: [] },
  { id: "hss-202", faculty: "humanities", department: "Sociology", title: "Sociology", code: "SOC202", level: "bachelor", credits: 3, term: 2, description: "Social structures, institutions and change.", teachingTopic: "Sociology: social structures, institutions, inequality, and social change at bachelor level", prerequisites: [] },
  { id: "hss-301", faculty: "humanities", department: "Political Science", title: "Political Science & Governance", code: "POL301", level: "bachelor", credits: 3, term: 3, description: "State, institutions, power and public policy.", teachingTopic: "Political Science and Governance: the state, political institutions, power, democracy, and public policy at bachelor level", prerequisites: ["hss-202"] },
  { id: "hss-401", faculty: "humanities", department: "Psychology", title: "Cognitive Psychology & Research Methods", code: "PSY401", level: "master", credits: 3, description: "Cognition, experiments and research design.", teachingTopic: "Cognitive Psychology and Research Methods: cognition, attention, memory, experimental design, and research at master level", prerequisites: ["hss-201"] },
  { id: "hss-500", faculty: "humanities", department: "Research", title: "Doctoral Research in Humanities", code: "HSS500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Humanities and Social Sciences: qualitative and quantitative methods, theory, and thesis writing at doctorate level", prerequisites: ["hss-401"] },

  // ── Faculty of Agriculture & Environmental Sciences ───────────────
  { id: "agr-101", faculty: "agriculture", department: "Agronomy", title: "Principles of Agronomy", code: "AGR101", level: "bachelor", credits: 3, term: 1, description: "Crop production, soil and plant science.", teachingTopic: "Principles of Agronomy: crop production, soil science, plant growth, and farming systems at bachelor level", prerequisites: [] },
  { id: "agr-201", faculty: "agriculture", department: "Food Science", title: "Food Science & Technology", code: "AGR201", level: "bachelor", credits: 3, term: 2, description: "Food composition, safety and processing.", teachingTopic: "Food Science and Technology: food composition, preservation, safety, and processing at bachelor level", prerequisites: ["agr-101"] },
  { id: "agr-202", faculty: "agriculture", department: "Environmental Science", title: "Environmental Science", code: "ENV202", level: "bachelor", credits: 3, term: 2, description: "Ecosystems, resources and environmental impact.", teachingTopic: "Environmental Science: ecosystems, natural resources, pollution, and environmental impact assessment at bachelor level", prerequisites: [] },
  { id: "agr-301", faculty: "agriculture", department: "Agricultural Economics", title: "Agricultural Economics", code: "AGR301", level: "bachelor", credits: 3, term: 3, description: "Farm economics, markets and policy.", teachingTopic: "Agricultural Economics: farm management, markets, supply chains, and agricultural policy at bachelor level", prerequisites: ["agr-101"] },
  { id: "agr-401", faculty: "agriculture", department: "Environmental Science", title: "Sustainable Resource Management", code: "ENV401", level: "master", credits: 3, description: "Sustainability, conservation and resource policy.", teachingTopic: "Sustainable Resource Management: sustainability principles, conservation, and natural resource policy at master level", prerequisites: ["agr-202"] },
  { id: "agr-500", faculty: "agriculture", department: "Research", title: "Doctoral Research in Agriculture & Environment", code: "AGR500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Agriculture and Environmental Sciences: experimental design, field research, and thesis writing at doctorate level", prerequisites: ["agr-401"] },

  // ── Faculty of Education ──────────────────────────────────────────
  { id: "edu-101", faculty: "education", department: "Education", title: "Foundations of Education", code: "EDU101", level: "bachelor", credits: 3, term: 1, description: "History, philosophy and sociology of education.", teachingTopic: "Foundations of Education: history, philosophy, and sociology of education, and the purposes of schooling at bachelor level", prerequisites: [] },
  { id: "edu-201", faculty: "education", department: "Curriculum", title: "Curriculum Design & Instruction", code: "EDU201", level: "bachelor", credits: 3, term: 2, description: "Planning lessons, units and curriculum.", teachingTopic: "Curriculum Design and Instruction: learning objectives, lesson planning, curriculum development, and instructional strategies at bachelor level", prerequisites: ["edu-101"] },
  { id: "edu-301", faculty: "education", department: "Educational Technology", title: "Educational Technology & E-Learning", code: "EDU301", level: "bachelor", credits: 3, term: 3, description: "Digital tools, LMS and online pedagogy.", teachingTopic: "Educational Technology and E-Learning: learning management systems, digital tools, and online pedagogy at bachelor level", prerequisites: ["edu-201"] },
  { id: "edu-401", faculty: "education", department: "Assessment", title: "Assessment & Learning Analytics", code: "EDU401", level: "master", credits: 3, description: "Assessment design and learning measurement.", teachingTopic: "Assessment and Learning Analytics: assessment design, measurement, and learning analytics at master level", prerequisites: ["edu-301"] },
  { id: "edu-500", faculty: "education", department: "Research", title: "Doctoral Research in Education", code: "EDU500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Education: educational research methods, pedagogy research, and thesis writing at doctorate level", prerequisites: ["edu-401"] },

  // ── Faculty of Arts, Design & Communication ───────────────────────
  { id: "art-101", faculty: "arts", department: "Design", title: "Design Fundamentals", code: "ART101", level: "bachelor", credits: 3, term: 1, description: "Colour, composition, typography and form.", teachingTopic: "Design Fundamentals: colour theory, composition, typography, visual hierarchy, and form at bachelor level", prerequisites: [] },
  { id: "art-201", faculty: "arts", department: "Journalism", title: "Journalism & Media Writing", code: "ART201", level: "bachelor", credits: 3, term: 2, description: "Reporting, writing and media ethics.", teachingTopic: "Journalism and Media Writing: news reporting, feature writing, media ethics, and fact-checking at bachelor level", prerequisites: [] },
  { id: "art-202", faculty: "arts", department: "Music", title: "Music Theory & Performance", code: "ART202", level: "bachelor", credits: 3, term: 2, description: "Harmony, rhythm, notation and practice.", teachingTopic: "Music Theory and Performance: harmony, rhythm, musical notation, and performance practice at bachelor level", prerequisites: [] },
  { id: "art-301", faculty: "arts", department: "Film", title: "Film & Digital Media Production", code: "ART301", level: "bachelor", credits: 3, term: 3, description: "Cinematography, editing and storytelling.", teachingTopic: "Film and Digital Media Production: cinematography, editing, sound, and visual storytelling at bachelor level", prerequisites: ["art-201"] },
  { id: "art-401", faculty: "arts", department: "Design", title: "Advanced Visual & Communication Design", code: "ART401", level: "master", credits: 3, description: "Branding, UX and design strategy.", teachingTopic: "Advanced Visual and Communication Design: branding, user experience, and design strategy at master level", prerequisites: ["art-301"] },
  { id: "art-500", faculty: "arts", department: "Research", title: "Doctoral Research in Fine Arts & Media", code: "ART500", level: "doctor", credits: 0, description: "Independent supervised research and thesis.", teachingTopic: "Doctoral Research in Fine Arts and Media: creative practice research and thesis writing at doctorate level", prerequisites: ["art-401"] },
];

export function universityFacultyById(id: string): UniversityFaculty | undefined {
  return UNIVERSITY_FACULTIES.find((f) => f.id === id);
}

export function universityCourseById(id: string): UniversityCourse | undefined {
  return UNIVERSITY_COURSES.find((c) => c.id === id);
}
