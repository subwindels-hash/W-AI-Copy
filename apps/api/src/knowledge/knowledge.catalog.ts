/**
 * Session 140 — Global Human Knowledge Master Catalog.
 *
 * The 90 master categories from the Session 140 specification (§1), the kind
 * catalog, the audience levels and the eight history eras (§16). The catalog
 * is versioned and intentionally expandable: new categories are added by
 * extending `MASTER_CATEGORIES` and bumping `KNOWLEDGE_CATALOG_VERSION`.
 */
import type { AudienceLevel, KnowledgeKind } from "@windels/shared";

/** Bump when the curated catalog (categories, eras or seed records) changes. */
export const KNOWLEDGE_CATALOG_VERSION = "2026.08.140.1";

export interface MasterCategory {
  id: string;
  name: string;
  description: string;
}

/** The 90 master categories of human knowledge (spec §1). */
export const MASTER_CATEGORIES: MasterCategory[] = [
  { id: "cat-01", name: "Education & Learning", description: "How people learn, teaching methods, study skills and learning systems." },
  { id: "cat-02", name: "Science", description: "The natural sciences and the scientific method." },
  { id: "cat-03", name: "Mathematics", description: "Numbers, structure, space and change." },
  { id: "cat-04", name: "Technology", description: "Tools, machines and systems built by humans." },
  { id: "cat-05", name: "Artificial Intelligence", description: "Machines that perceive, reason, learn and act." },
  { id: "cat-06", name: "Computer Science", description: "Computation, information and algorithms." },
  { id: "cat-07", name: "Software Engineering", description: "Designing, building and maintaining software." },
  { id: "cat-08", name: "Cybersecurity", description: "Protecting systems, networks and data." },
  { id: "cat-09", name: "Business", description: "Organizations, markets and how value is created." },
  { id: "cat-10", name: "Entrepreneurship", description: "Starting and growing new ventures." },
  { id: "cat-11", name: "Finance", description: "Money, risk and value over time." },
  { id: "cat-12", name: "Banking", description: "Institutions that store, lend and move money." },
  { id: "cat-13", name: "Economics", description: "How societies allocate scarce resources." },
  { id: "cat-14", name: "Accounting", description: "Recording, reporting and interpreting financial activity." },
  { id: "cat-15", name: "Investing", description: "Deploying capital to earn returns." },
  { id: "cat-16", name: "Insurance", description: "Sharing risk through pooled contributions." },
  { id: "cat-17", name: "Law & Legal Systems", description: "Rules, rights and the institutions that enforce them." },
  { id: "cat-18", name: "Government", description: "Institutions that make and enforce public decisions." },
  { id: "cat-19", name: "Politics", description: "Power, public decisions and collective action." },
  { id: "cat-20", name: "World History", description: "The human story across time and place." },
  { id: "cat-21", name: "Geography", description: "The Earth's surface, places and human-environment relations." },
  { id: "cat-22", name: "Religion", description: "Belief systems, practices and communities." },
  { id: "cat-23", name: "Philosophy", description: "Fundamental questions about knowledge, reality and ethics." },
  { id: "cat-24", name: "Psychology", description: "Mind, behaviour and mental processes." },
  { id: "cat-25", name: "Sociology", description: "Human society, groups and institutions." },
  { id: "cat-26", name: "Anthropology", description: "Humans across culture and time." },
  { id: "cat-27", name: "Medicine & Health Education", description: "Health, disease and the human body — education, not diagnosis." },
  { id: "cat-28", name: "Nutrition", description: "Food, nutrients and their effect on health." },
  { id: "cat-29", name: "Fitness & Exercise", description: "Physical activity, training and wellbeing." },
  { id: "cat-30", name: "Family & Parenting", description: "Raising children and family life." },
  { id: "cat-31", name: "Relationships", description: "Connections between people." },
  { id: "cat-32", name: "Communication", description: "Exchanging meaning between people." },
  { id: "cat-33", name: "Careers & Employment", description: "Work, jobs and professional life." },
  { id: "cat-34", name: "Professional Development", description: "Growing skills and advancing at work." },
  { id: "cat-35", name: "Travel", description: "Moving between places for work or leisure." },
  { id: "cat-36", name: "Transportation", description: "Moving people and goods." },
  { id: "cat-37", name: "Real Estate", description: "Land, buildings and property markets." },
  { id: "cat-38", name: "Construction", description: "Building structures and infrastructure." },
  { id: "cat-39", name: "Agriculture", description: "Growing food and raising crops and livestock." },
  { id: "cat-40", name: "Environment", description: "Natural systems and human impact." },
  { id: "cat-41", name: "Climate", description: "Long-term weather patterns and change." },
  { id: "cat-42", name: "Energy", description: "Powering human activity." },
  { id: "cat-43", name: "Engineering", description: "Applying science to build solutions." },
  { id: "cat-44", name: "Architecture", description: "Designing buildings and spaces." },
  { id: "cat-45", name: "Manufacturing", description: "Producing goods at scale." },
  { id: "cat-46", name: "Automotive", description: "Cars, trucks and mobility." },
  { id: "cat-47", name: "Aviation", description: "Flight and air transport." },
  { id: "cat-48", name: "Maritime", description: "Ships, oceans and sea transport." },
  { id: "cat-49", name: "Space", description: "Beyond Earth's atmosphere." },
  { id: "cat-50", name: "Arts", description: "Visual and performing expression." },
  { id: "cat-51", name: "Music", description: "Organized sound and musical culture." },
  { id: "cat-52", name: "Film", description: "Motion pictures and cinema." },
  { id: "cat-53", name: "Literature", description: "Written works and storytelling." },
  { id: "cat-54", name: "Languages", description: "Human language systems." },
  { id: "cat-55", name: "Culture", description: "Shared practices, values and meaning." },
  { id: "cat-56", name: "Sports", description: "Physical competition and games." },
  { id: "cat-57", name: "Food & Cooking", description: "Food preparation and culinary practice." },
  { id: "cat-58", name: "Fashion", description: "Clothing and personal style." },
  { id: "cat-59", name: "Beauty & Personal Care", description: "Grooming and self-care practices." },
  { id: "cat-60", name: "Home & Household", description: "Running and maintaining a home." },
  { id: "cat-61", name: "Parenting & Family Education", description: "Practical family and parenting knowledge." },
  { id: "cat-62", name: "Public Safety", description: "Protecting people and communities." },
  { id: "cat-63", name: "Emergency Preparedness", description: "Preparing for and responding to emergencies." },
  { id: "cat-64", name: "Government Services", description: "Public services citizens interact with." },
  { id: "cat-65", name: "International Relations", description: "Relations between states and peoples." },
  { id: "cat-66", name: "Military History", description: "War, armed forces and strategy through history." },
  { id: "cat-67", name: "Philosophy of Religion", description: "Philosophical examination of religion." },
  { id: "cat-68", name: "Ethics", description: "Moral principles and right action." },
  { id: "cat-69", name: "Human Rights", description: "Rights inherent to every person." },
  { id: "cat-70", name: "Media & Journalism", description: "News, reporting and information media." },
  { id: "cat-71", name: "Marketing & Advertising", description: "Promoting products, ideas and brands." },
  { id: "cat-72", name: "Social Media", description: "Platforms for sharing and connecting online." },
  { id: "cat-73", name: "E-commerce", description: "Buying and selling online." },
  { id: "cat-74", name: "Telecommunications", description: "Long-distance communication technology." },
  { id: "cat-75", name: "Internet & Networking", description: "Connected computers and the internet." },
  { id: "cat-76", name: "Cloud Computing", description: "Computing delivered over the network." },
  { id: "cat-77", name: "Data Science", description: "Extracting knowledge from data." },
  { id: "cat-78", name: "Robotics", description: "Machines that sense, decide and act." },
  { id: "cat-79", name: "Electronics", description: "Circuits, components and devices." },
  { id: "cat-80", name: "Renewable Energy", description: "Energy from replenishable sources." },
  { id: "cat-81", name: "Logistics", description: "Moving and storing goods efficiently." },
  { id: "cat-82", name: "Supply Chain", description: "The network that delivers products." },
  { id: "cat-83", name: "Procurement", description: "Acquiring goods and services for an organization." },
  { id: "cat-84", name: "Project Management", description: "Delivering work within scope, time and budget." },
  { id: "cat-85", name: "Leadership", description: "Guiding and enabling people and organizations." },
  { id: "cat-86", name: "Management", description: "Coordinating resources to reach goals." },
  { id: "cat-87", name: "Customer Service", description: "Helping and supporting customers." },
  { id: "cat-88", name: "Productivity", description: "Getting important work done effectively." },
  { id: "cat-89", name: "Personal Development", description: "Deliberate growth of knowledge, skills and character." },
  { id: "cat-90", name: "General Life Skills", description: "Practical abilities for everyday life." },
];

export const MASTER_CATEGORY_IDS = new Set(MASTER_CATEGORIES.map((c) => c.id));

export interface KindMeta {
  kind: KnowledgeKind;
  label: string;
  layer: string;
  description: string;
}

/** The 24 content layers, each mapping to a section of the Session 140 spec. */
export const KNOWLEDGE_KIND_META: KindMeta[] = [
  { kind: "concept", label: "Concept", layer: "What is…?", description: "Definitions, simple and detailed explanations, history, how it works, examples, related concepts and common misconceptions." },
  { kind: "instruction", label: "Instruction", layer: "How do I…?", description: "Step-by-step practical guidance with professional/official assistance flagged where required." },
  { kind: "explanation", label: "Explanation", layer: "Why…?", description: "Causes, contributing factors, uncertainty and competing explanations." },
  { kind: "person", label: "Person", layer: "Who…?", description: "Verified biographical profiles with achievements, historical context and sources." },
  { kind: "timeline_event", label: "Timeline event", layer: "When…?", description: "Chronological events in the global timeline engine." },
  { kind: "place", label: "Place", layer: "Where…?", description: "Countries, cities and sites connected to history, politics, economy and culture." },
  { kind: "comparison", label: "Comparison", layer: "Which is better…?", description: "Criteria-based comparisons that never declare a universal winner." },
  { kind: "discipline", label: "Discipline", layer: "Education", description: "Academic disciplines with beginner → advanced learning paths." },
  { kind: "science_field", label: "Science field", layer: "Science", description: "Science fields with FOUNDATIONS → INTERMEDIATE → ADVANCED → RESEARCH levels." },
  { kind: "technology", label: "Technology", layer: "Technology", description: "How technology works and how people use it." },
  { kind: "business", label: "Business", layer: "Business & money", description: "Business models, money, taxes, budgeting, insurance and commerce." },
  { kind: "career", label: "Career", layer: "Career intelligence", description: "Structured pathways from beginner to professional." },
  { kind: "law", label: "Law & government", layer: "Law & government", description: "Legal education, never personalized legal advice." },
  { kind: "health", label: "Health", layer: "Health & medical education", description: "Educational health knowledge, never diagnosis." },
  { kind: "history_era", label: "History era", layer: "History of humanity", description: "The eight eras of human history." },
  { kind: "culture", label: "Culture", layer: "Culture & society", description: "Languages, customs, traditions and institutions — stereotype-free." },
  { kind: "travel", label: "Travel", layer: "Travel & world", description: "Travel planning; time-sensitive information must be verified." },
  { kind: "relationship", label: "Relationship", layer: "Relationships & communication", description: "Balanced guidance on communication and human connection." },
  { kind: "entertainment", label: "Entertainment", layer: "Entertainment & culture", description: "Movies, music, books, games and sports; current facts verified." },
  { kind: "language", label: "Language", layer: "Language intelligence", description: "Translation, grammar, learning and cultural meaning." },
  { kind: "everyday", label: "Everyday life", layer: "Everyday life", description: "Cooking, cleaning, home, organization, transport and problem solving." },
  { kind: "creative", label: "Creative", layer: "Creative knowledge", description: "Writing, storytelling, design, public speaking and content." },
  { kind: "policy", label: "System policy", layer: "Knowledge confidence", description: "How WINDELS treats knowledge: confidence, verification and honesty." },
  { kind: "current_information", label: "Current information", layer: "Dynamic layer", description: "Fast-changing facts; never memorized without source + date + verification." },
];

export const KNOWLEDGE_KIND_IDS = new Set(KNOWLEDGE_KIND_META.map((k) => k.kind));

/* ────────────────────────────────────────────────────────────────────────────
 * History eras (spec §16)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface HistoryEra {
  id: string;
  name: string;
  dateLabel: string;
  startYear: number | null; // approximate; negative = BCE; null = uncertain
  endYear: number | null;
  summary: string;
}

export const HISTORY_ERAS: HistoryEra[] = [
  {
    id: "era-prehistory",
    name: "Prehistory",
    dateLabel: "Before writing (before c. 3400 BCE)",
    startYear: -300000,
    endYear: -3400,
    summary: "The long span of human existence before written records: the emergence of Homo sapiens in Africa roughly 300 000 years ago, stone tools, fire, language, art (cave paintings), domestication of plants and animals, and the first permanent settlements.",
  },
  {
    id: "era-ancient",
    name: "Ancient civilizations",
    dateLabel: "c. 3400 BCE – c. 500 BCE",
    startYear: -3400,
    endYear: -500,
    summary: "Writing, cities, law codes and states emerge: Sumer and Egypt, the Indus Valley, Shang China, and the Olmec in the Americas. Bronze and then iron reshape economies and warfare.",
  },
  {
    id: "era-classical",
    name: "Classical period",
    dateLabel: "c. 500 BCE – c. 500 CE",
    startYear: -500,
    endYear: 500,
    summary: "Athenian democracy, Greek philosophy and science, the Roman Republic and Empire, the Han dynasty, the Maurya and Gupta empires in India, major world religions expanding, and trans-regional trade along the Silk Roads.",
  },
  {
    id: "era-medieval",
    name: "Medieval period",
    dateLabel: "c. 500 – c. 1450",
    startYear: 500,
    endYear: 1450,
    summary: "Post-Roman kingdoms in Europe, the Byzantine Empire, the rise of Islam and the Islamic Golden Age, the Mali and Ghana empires, Tang/Song China, feudal systems, universities and cathedral schools, and the Black Death.",
  },
  {
    id: "era-early-modern",
    name: "Early modern period",
    dateLabel: "c. 1450 – c. 1789",
    startYear: 1450,
    endYear: 1789,
    summary: "Printing, the Renaissance, the Reformation, the transatlantic slave trade and colonialism, the Scientific Revolution, the Enlightenment, and the expansion of global trade and empires.",
  },
  {
    id: "era-industrial",
    name: "Industrial age",
    dateLabel: "c. 1789 – c. 1914",
    startYear: 1789,
    endYear: 1914,
    summary: "The Industrial Revolution transforms production and society; nationalism and nation-states reshape politics; mass migration; the abolition movements; electricity, railways, steamships and telegraphs shrink the world; imperialism reaches its peak.",
  },
  {
    id: "era-modern",
    name: "Modern era",
    dateLabel: "c. 1914 – c. 1945",
    startYear: 1914,
    endYear: 1945,
    summary: "World War I, the Russian Revolution, the Great Depression, authoritarian regimes, and World War II — the deadliest conflict in history — ending with the founding of the United Nations and the nuclear age.",
  },
  {
    id: "era-contemporary",
    name: "Contemporary history",
    dateLabel: "c. 1945 – present",
    startYear: 1945,
    endYear: null,
    summary: "Decolonization, the Cold War, the digital revolution, globalization, the rise of China and other emerging economies, environmental change, and the spread of the internet and artificial intelligence. The most recent part of this era is dynamic knowledge: it must be verified at query time.",
  },
];
