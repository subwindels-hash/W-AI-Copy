/**
 * Session 140 — Curated knowledge seed (part 3: education disciplines,
 * science fields, technology, business, careers, law, health, culture,
 * travel, relationships, entertainment, languages, everyday life, creative
 * work and comparisons).
 *
 * All records are curated educational content with confidence labels and
 * sources. Health and law records carry professional-assistance notes; the
 * system educates but never diagnoses or gives legal advice. Comparisons
 * present criteria with labeled scores only where the catalog has them —
 * never a universal winner.
 */
import type { KnowledgeRecord } from "@windels/shared";
import { KNOWLEDGE_SEED_DATE } from "./knowledge.seed.js";
import type { KnowledgeReference } from "@windels/shared";

const SRC_BRITANNICA: KnowledgeReference = { label: "Encyclopaedia Britannica", url: "https://www.britannica.com" };
const SRC_UN: KnowledgeReference = { label: "United Nations", url: "https://www.un.org" };
const SRC_WHO: KnowledgeReference = { label: "World Health Organization", url: "https://www.who.int" };
const SRC_NASA: KnowledgeReference = { label: "NASA", url: "https://www.nasa.gov" };

interface SeedInput {
  id: string;
  title: string;
  aliases?: string[];
  question: string;
  categoryIds: string[];
  summary: string;
  sections: Partial<Record<string, string>>;
  examples?: string[];
  misconceptions?: KnowledgeRecord["misconceptions"];
  steps?: KnowledgeRecord["steps"];
  criteria?: KnowledgeRecord["criteria"];
  relatedIds?: string[];
  sources?: KnowledgeReference[];
  confidence?: KnowledgeRecord["confidence"];
  verificationNote?: string;
  professionalAssistanceNote?: string;
}

function build(kind: KnowledgeRecord["kind"], tier: KnowledgeRecord["tier"], intents: KnowledgeRecord["intents"], input: SeedInput): KnowledgeRecord {
  return {
    id: input.id,
    kind,
    categoryIds: input.categoryIds,
    title: input.title,
    aliases: input.aliases ?? [],
    question: input.question,
    intents,
    tier,
    confidence: input.confidence ?? "well_supported",
    provenance: "catalog",
    summary: input.summary,
    sections: input.sections,
    examples: input.examples,
    misconceptions: input.misconceptions,
    steps: input.steps,
    criteria: input.criteria,
    relatedIds: input.relatedIds,
    sources: input.sources,
    lastUpdated: KNOWLEDGE_SEED_DATE,
    verificationNote: input.verificationNote,
    professionalAssistanceNote: input.professionalAssistanceNote,
  };
}

const concept = (input: SeedInput): KnowledgeRecord =>
  build("concept", "stable", ["definition", "explanation"], input);

const discipline = (input: SeedInput): KnowledgeRecord =>
  build("discipline", "stable", ["education", "definition"], input);

const scienceField = (input: SeedInput): KnowledgeRecord =>
  build("science_field", "stable", ["education", "explanation"], input);

const technology = (input: SeedInput): KnowledgeRecord =>
  build("technology", "stable", ["definition", "explanation", "education"], input);

const business = (input: SeedInput): KnowledgeRecord =>
  build("business", "stable", ["definition", "instruction", "explanation"], input);

const career = (input: SeedInput): KnowledgeRecord =>
  build("career", "stable", ["education", "instruction", "personal_guidance"], input);

const law = (input: SeedInput): KnowledgeRecord =>
  build("law", "stable", ["definition", "education"], input);

const health = (input: SeedInput): KnowledgeRecord =>
  build("health", "stable", ["definition", "explanation", "education"], input);

const culture = (input: SeedInput): KnowledgeRecord =>
  build("culture", "stable", ["definition", "explanation"], input);

const travel = (input: SeedInput): KnowledgeRecord =>
  build("travel", "stable", ["instruction", "recommendation"], input);

const relationship = (input: SeedInput): KnowledgeRecord =>
  build("relationship", "stable", ["personal_guidance", "explanation"], input);

const entertainment = (input: SeedInput): KnowledgeRecord =>
  build("entertainment", "stable", ["definition", "explanation"], input);

const language = (input: SeedInput): KnowledgeRecord =>
  build("language", "stable", ["education", "instruction"], input);

const everyday = (input: SeedInput): KnowledgeRecord =>
  build("everyday", "stable", ["instruction", "personal_guidance"], input);

const creative = (input: SeedInput): KnowledgeRecord =>
  build("creative", "stable", ["creative", "instruction"], input);

const comparison = (input: SeedInput): KnowledgeRecord =>
  build("comparison", "stable", ["comparison", "recommendation"], input);

/* ════════════════════════════════════════════════════════════════════════════
 * Supporting concepts referenced across the catalog
 * ════════════════════════════════════════════════════════════════════════════ */

const SUPPORT_CONCEPTS: KnowledgeRecord[] = [
  concept({
    id: "con.human-rights",
    title: "Human rights",
    aliases: ["fundamental rights", "basic rights"],
    question: "What are human rights?",
    categoryIds: ["cat-69", "cat-17"],
    summary: "Human rights are the basic rights and freedoms that belong to every person, recognized in international law through the Universal Declaration of Human Rights (1948).",
    sections: {
      definition: "Rights inherent to all human beings, regardless of nationality, sex, ethnicity, religion or any other status: the right to life, liberty and security, equality before the law, freedom of expression, religion and assembly, and economic and social rights such as education and health.",
      simple: "Human rights are the things every person is entitled to just because they are human — like being safe, free to speak, and treated fairly.",
      detailed: "International human rights law is built on the Universal Declaration of Human Rights (1948) and treaties such as the International Covenants on Civil and Political Rights and on Economic, Social and Cultural Rights (1966). States that ratify them take on legal obligations; enforcement happens through courts, regional bodies (e.g. the African, European and Inter-American human rights systems) and UN mechanisms. Human rights are universal in principle, but their realization varies widely in practice.",
      history: "Ideas of natural rights developed through the Enlightenment and the American and French revolutions. The horrors of World War II led to the UDHR in 1948 — the first global statement of rights. Decolonization and social movements extended and deepened the framework through the 20th century.",
      how_it_works: "States ratify treaties, pass laws and build institutions (courts, commissions) to protect rights; victims can petition courts and international bodies; monitoring by the UN and civil society holds states accountable; violations are documented and can carry consequences.",
      examples: "The right to a fair trial; freedom of peaceful assembly; the right to education; protection from torture and slavery.",
      guidance: "Whether a specific situation violates human rights law is a legal question for qualified professionals and official bodies.",
    },
    misconceptions: [
      { misconception: "Human rights are a Western imposition.", correction: "The UDHR was drafted with participation from across the world, and human-rights ideas exist in many legal and philosophical traditions." },
      { misconception: "Human rights only protect individuals against government.", correction: "They primarily bind states, but human-rights law also addresses private actors through state duties to protect." },
    ],
    relatedIds: ["when.udhr", "law.human-rights", "con.democracy"],
    sources: [SRC_UN],
  }),
  concept({
    id: "con.banking",
    title: "Banking",
    aliases: ["banks", "banking system"],
    question: "What is banking?",
    categoryIds: ["cat-12", "cat-11"],
    summary: "Banking is the business of safeguarding deposits, lending money and moving payments — the plumbing of a modern economy.",
    sections: {
      definition: "The system of institutions — commercial banks, central banks and other financial intermediaries — that accept deposits, make loans, process payments and manage risk in an economy.",
      simple: "Banks keep people's money safe, lend it to others who need it (charging interest), and help money move from one person to another.",
      detailed: "Commercial banks take deposits and lend most of them out, earning the difference between deposit and loan interest. This 'fractional reserve' system creates money in the economy and makes banks central to growth — and to crises when runs or bad loans hit. Central banks (e.g. the Federal Reserve, Central Bank of Nigeria, Bank of England) issue currency, set interest rates, supervise banks and act as lender of last resort. Regulation and deposit insurance exist because public trust in banks is the system's foundation.",
      history: "Banking traces to ancient temples and moneylenders; modern banking grew in Renaissance Italy (Medici), with the Bank of England (1694) pioneering central banking. Mobile money (e.g. M-Pesa, 2007) extended banking to millions previously excluded.",
      how_it_works: "Depositors place money; the bank keeps a reserve and lends the rest to borrowers; borrowers repay with interest; payments move between accounts; central banks steer rates and stability; supervision and insurance protect the system.",
      examples: "Current accounts and savings accounts; loans and mortgages; wire transfers and card payments; mobile money wallets.",
      guidance: "Bank fees, interest rates and regulations change frequently — they are dynamic information to verify with the institution.",
    },
    misconceptions: [
      { misconception: "Banks keep all deposited money in a vault.", correction: "Banks lend most deposits; reserves cover only a fraction, which is why regulation and deposit insurance exist." },
      { misconception: "All banks are the same.", correction: "Commercial banks, central banks, investment banks and microfinance institutions do very different jobs." },
    ],
    relatedIds: ["con.money", "con.mortgage", "ins.send-money", "bus.saving"],
    sources: [SRC_BRITANNICA],
  }),
  concept({
    id: "con.cybersecurity",
    title: "Cybersecurity",
    aliases: ["computer security", "information security"],
    question: "What is cybersecurity?",
    categoryIds: ["cat-08", "cat-04"],
    summary: "Cybersecurity is the practice of protecting computers, networks, programs and data from attack, damage or unauthorized access.",
    sections: {
      definition: "The set of technologies, processes and practices designed to protect systems, networks and data from cyber threats: confidentiality (only authorized access), integrity (no unauthorized change) and availability (systems keep working).",
      simple: "Cybersecurity is keeping your computer, phone and accounts safe from people who want to steal information or cause damage.",
      detailed: "Threats include malware, phishing, ransomware, denial-of-service attacks, insider misuse and social engineering. Defences operate in layers: strong authentication (passwords, MFA), encryption, firewalls, updates and patching, access control, backups, monitoring, incident response and user education — people are the most targeted and most important layer. Organizations follow frameworks (NIST, ISO 27001) and regulations (data-protection laws like the GDPR) to manage risk systematically.",
      history: "Security concerns grew with networking: the first computer worms and viruses appeared in the 1970s–80s; the commercial internet made cybercrime an industry; ransomware and state-sponsored attacks made it a national-security issue in the 2010s–2020s.",
      how_it_works: "Attackers find weaknesses — weak passwords, unpatched software, tricked users; defenders reduce exposure: authenticate users, encrypt data, restrict permissions, monitor for anomalies, patch quickly, and plan recovery so incidents are contained.",
      examples: "Using a password manager and two-factor authentication; recognizing phishing emails; keeping software updated; backing up important files.",
      guidance: "Security is continuous, not a one-time fix; current threats and best practices change and should be verified with reputable sources.",
    },
    misconceptions: [
      { misconception: "Cybersecurity is only an IT department's job.", correction: "Users are the front line; most breaches start with a human action like clicking a phishing link." },
      { misconception: "Antivirus software makes you invulnerable.", correction: "Antivirus is one layer; phishing, misconfiguration and insider threats bypass it." },
    ],
    relatedIds: ["tech.internet", "tech.computers", "day.cleaning"],
    sources: [SRC_BRITANNICA],
  }),
  concept({
    id: "con.international-relations",
    title: "International relations",
    aliases: ["foreign affairs", "global politics"],
    question: "What is international relations?",
    categoryIds: ["cat-65", "cat-19"],
    summary: "International relations is the study and practice of how states and other actors — international organizations, multinational companies, NGOs — interact in a world without a single world government.",
    sections: {
      definition: "The field concerned with relations between sovereign states and other international actors: diplomacy, war and peace, trade, international law, international organizations and global issues like climate and migration.",
      simple: "International relations is how countries deal with each other: making deals, forming alliances, trading, arguing — and sometimes fighting — because no single government rules the world.",
      detailed: "Because the international system is anarchic (no world government), states pursue security and interests through power, diplomacy and institutions. The United Nations, the World Trade Organization, regional bodies (African Union, European Union, ASEAN) and thousands of treaties create rules and forums. Non-state actors — companies, banks, NGOs, terrorist groups, social movements — also shape outcomes. Competing theories (realism, liberalism, constructivism) explain why states cooperate or conflict.",
      history: "The modern state system grew from the Peace of Westphalia (1648). The League of Nations (1919) and the United Nations (1945) institutionalized diplomacy; decolonization multiplied the number of states; globalization and technology deepened interdependence.",
      how_it_works: "States conduct diplomacy through embassies and summits; negotiate treaties; join organizations that set rules; use economic tools (trade, sanctions, aid); and as a last resort, use force — constrained by international law and the balance of power.",
      examples: "UN peacekeeping missions; the Paris climate agreement; regional trade blocs; sanctions regimes; refugee conventions.",
      guidance: "Current events in international relations are dynamic knowledge and must be verified at query time.",
    },
    misconceptions: [
      { misconception: "The UN is a world government.", correction: "The UN is an intergovernmental organization of sovereign states with limited, member-granted powers." },
      { misconception: "International relations is only about states.", correction: "Companies, banks, NGOs, media and international organizations are major actors too." },
    ],
    relatedIds: ["when.un-founded", "why.war", "why.migration", "con.government"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
  concept({
    id: "con.education-path",
    title: "Education pathways",
    aliases: ["school system", "education levels", "academic path"],
    question: "What are the levels of education?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Education is organized in levels — primary, secondary, vocational and tertiary — each with its own qualifications, and pathways differ by country.",
    sections: {
      definition: "The structured sequence of learning: primary education (foundational literacy and numeracy), secondary education, vocational education and training, and tertiary education (colleges and universities), plus professional qualifications and lifelong learning.",
      simple: "School goes in steps: primary school first, then secondary school, then college or university or job training — and you can also learn as an adult.",
      detailed: "Primary education builds literacy, numeracy and basic knowledge; secondary education deepens subjects and leads to school-leaving qualifications. Vocational education teaches specific occupations (trades, technicians, nursing, IT) often with apprenticeships combining work and study. Tertiary education — colleges and universities — offers certificates, diplomas, bachelor's, master's and doctoral degrees. National systems differ in structure, ages and qualifications; international frameworks (e.g. UNESCO's ISCED) classify levels for comparison.",
      history: "Formal schooling for elites is ancient; compulsory primary education spread in the 19th century; mass secondary and higher education expanded in the 20th; online learning has reshaped access since the 2010s.",
      how_it_works: "Students progress through levels based on age and assessment; qualifications are awarded by schools, examination boards and universities; employers and further institutions recognize them; national authorities set curricula and standards.",
      examples: "A student moving from primary to secondary school, then to a university degree or a vocational apprenticeship; an adult earning a professional certificate while working.",
      guidance: "Exact structures, ages and qualifications vary by country and change over time — verify with official education authorities.",
    },
    misconceptions: [
      { misconception: "University is the only path to success.", correction: "Vocational and technical paths are vital, well-paid and in high demand in most economies." },
      { misconception: "Education ends with graduation.", correction: "Lifelong learning — courses, certificates, on-the-job training — is increasingly the norm." },
    ],
    relatedIds: ["con.university", "cmp.degree-vs-apprenticeship", "disc.medicine", "ins.apply-university"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
  concept({
    id: "con.religion-diversity",
    title: "World religions",
    aliases: ["religious traditions", "major religions"],
    question: "What are the world's major religions?",
    categoryIds: ["cat-22", "cat-67", "cat-55"],
    summary: "The world's major religious families — Abrahamic (Judaism, Christianity, Islam), Dharmic (Hinduism, Buddhism, Sikhism, Jainism), East Asian traditions and Indigenous religions — together guide the lives of most of humanity.",
    sections: {
      definition: "The major religious traditions of the world, classified by origin and family: the Abrahamic faiths, the Dharmic religions of South Asia, the East Asian traditions, African traditional religions, Indigenous traditions and new religious movements.",
      simple: "People around the world follow many religions — Christianity, Islam, Hinduism, Buddhism and others. Each has its own beliefs, stories, holy books and festivals.",
      detailed: "Christianity and Islam are the largest religions by adherents, followed by Hinduism and Buddhism; Judaism, Sikhism and many other traditions have millions of followers; many people also practise Indigenous or traditional religions, and a growing share of humanity is religiously unaffiliated. Every tradition is internally diverse, with denominations, regions and interpretations differing widely. Religious identity also interacts with culture, politics and law in different ways in different countries.",
      history: "Religions have evolved over millennia, spreading through migration, trade, empire and mission, and adapting to every continent. The modern era brought unprecedented global mixing, dialogue and pluralism.",
      how_it_works: "Religions are transmitted through scripture, ritual, family life, education and community; they shape ethics, festivals, law and identity; they adapt as societies change.",
      examples: "Christianity's Easter, Islam's Ramadan, Hinduism's Diwali, Buddhism's Vesak, Judaism's Passover — each tradition's calendar and practices express its history.",
      guidance: "Descriptions of religions must be accurate and respectful; adherents' own accounts are the primary source for what a faith means in practice.",
    },
    misconceptions: [
      { misconception: "Religion is dying out everywhere.", correction: "Religious adherence remains high globally and is growing in many regions, while secularism also grows in others." },
      { misconception: "One religion has a single worldwide culture.", correction: "Every major religion spans many cultures, languages and practices." },
    ],
    relatedIds: ["con.christianity", "why.religions-differ", "con.philosophy-religion", "cult.diversity"],
    sources: [SRC_BRITANNICA],
  }),
  concept({
    id: "con.philosophy-religion",
    title: "Philosophy of religion",
    aliases: ["religious philosophy"],
    question: "What is the philosophy of religion?",
    categoryIds: ["cat-67", "cat-23", "cat-22"],
    summary: "Philosophy of religion examines religious concepts with the tools of philosophy: arguments about God's existence, the problem of evil, faith and reason, and the nature of religious language.",
    sections: {
      definition: "The branch of philosophy that critically examines religious beliefs and concepts: the existence and nature of God, the problem of evil, miracles, religious experience, faith versus reason, and the meaning of religious language.",
      simple: "Philosophy of religion asks big questions about religion using logic: Is there a God? Why does suffering exist if God is good? Can faith and reason both be trusted?",
      detailed: "Classic arguments include the cosmological (the world needs an explanation), teleological (design in nature), ontological and moral arguments for God's existence, alongside the problem of evil — the strongest challenge: if God is all-good and all-powerful, why does evil exist? Thinkers explore faith and reason (Aquinas, Kierkegaard), religious experience (James), and whether religious language describes reality or expresses attitudes. The field is philosophically rich and includes both believers and non-believers.",
      history: "Philosophical reflection on religion began in antiquity (Greece, India, China) and flourished in medieval Islamic, Jewish and Christian thought (Avicenna, Maimonides, Aquinas). Modern philosophy (Hume, Kant) sharpened the critiques; analytic philosophy of religion revived the field in the 20th century.",
      how_it_works: "Philosophers clarify concepts, construct and test arguments, consider counterexamples, and examine the coherence of beliefs — using reason and evidence, whether or not the philosopher is a believer.",
      examples: "The problem of evil; Pascal's wager; the debate over whether miracles are possible; William James on religious experience.",
      guidance: "Philosophy of religion is a scholarly field; it neither proves nor disproves any religion, and personal religious questions involve faith beyond argument.",
    },
    misconceptions: [
      { misconception: "Philosophy of religion tries to disprove religion.", correction: "It examines arguments on all sides; many of its greatest contributors were believers." },
      { misconception: "Faith and reason are opposites.", correction: "Many traditions hold that faith and reason complement each other; the relationship is itself a philosophical question." },
    ],
    relatedIds: ["con.religion-diversity", "why.religions-differ", "con.christianity"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 9. EDUCATION & UNIVERSITY KNOWLEDGE — disciplines
 * ════════════════════════════════════════════════════════════════════════════ */

const DISCIPLINE_RECORDS: KnowledgeRecord[] = [
  discipline({
    id: "disc.medicine",
    title: "Medicine",
    aliases: ["medical studies", "mbbs", "becoming a doctor"],
    question: "What does studying medicine involve?",
    categoryIds: ["cat-27", "cat-01"],
    summary: "Medicine is the science and practice of diagnosing, treating and preventing disease — studied through pre-clinical sciences, clinical training and lifelong specialization.",
    sections: {
      definition: "The discipline of preventing, diagnosing and treating illness and injury, combining biological sciences (anatomy, physiology, pathology, pharmacology) with clinical training in hospitals and continuous professional practice.",
      simple: "Doctors study how the body works, what makes people sick, and how to make them well — first in classrooms, then in hospitals with real patients under supervision.",
      detailed: "A typical path: undergraduate prerequisites or a direct-entry medical degree (e.g. MBBS/MD, often 5–6 years), pre-clinical sciences, then clinical rotations in medicine, surgery, paediatrics, obstetrics, psychiatry and more; followed by internship and residency (specialist training) lasting 3–7 years; then continuous professional development. Entry is competitive; practice is regulated by medical councils; ethics and patient safety are core.",
      learning_path: "FOUNDATIONS: biology, chemistry, physics, mathematics. UNDERGRADUATE: anatomy, physiology, biochemistry, pharmacology, pathology. CLINICAL: rotations and clerkships. RESIDENCY: specialization. RESEARCH: clinical trials, biomedical research, public health.",
      guidance: "Becoming a doctor is a long, demanding path requiring strong grades, dedication and sustained study; requirements differ by country.",
    },
    misconceptions: [
      { misconception: "Medical school is 4 years everywhere.", correction: "Programs range from about 5–6 years (direct entry, e.g. many countries) to 4 years after a bachelor's (US-style)." },
      { misconception: "Doctors learn everything in school.", correction: "Medicine changes constantly; lifelong learning and specialization are mandatory." },
    ],
    relatedIds: ["con.dna", "hlth.body", "car.doctor", "sci.biology"],
    sources: [SRC_BRITANNICA, SRC_WHO],
    professionalAssistanceNote: "Medical education content is not medical advice; consult qualified health professionals for personal health questions.",
  }),
  discipline({
    id: "disc.engineering",
    title: "Engineering",
    aliases: ["engineering studies", "becoming an engineer"],
    question: "What does studying engineering involve?",
    categoryIds: ["cat-43", "cat-01"],
    summary: "Engineering applies mathematics and science to design and build solutions — from bridges and machines to software and energy systems.",
    sections: {
      definition: "The discipline of applying mathematics, science and judgment to design, build and maintain structures, machines, systems and processes that serve practical purposes.",
      simple: "Engineers solve real problems — how to build a bridge that stands, an app that works, or a power grid that stays on — using math and science.",
      detailed: "Engineering has major branches: civil (structures, transport), mechanical (machines, energy), electrical (power, electronics), chemical (processes, materials), computer and software engineering, and many more. A typical degree (4–5 years, e.g. BEng) covers mathematics, physics, engineering science, design and a final project; professional licensing and continuing education follow in many countries.",
      learning_path: "FOUNDATIONS: mathematics, physics, chemistry, computing. UNDERGRADUATE: engineering science, design, labs, specialization. GRADUATE: advanced analysis, research. PROFESSIONAL: licensing, specialization, management.",
      guidance: "Engineering is practice-based: projects, internships and licensed experience matter as much as coursework.",
    },
    misconceptions: [
      { misconception: "Engineering is only about math.", correction: "Math is a tool; engineering is about design, judgment, teamwork and real-world constraints." },
      { misconception: "Engineers build things alone.", correction: "Engineering is deeply collaborative across disciplines and with other professions." },
    ],
    relatedIds: ["disc.computer-science", "sci.physics", "tech.renewable-energy", "con.electricity"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.computer-science",
    title: "Computer science",
    aliases: ["computing", "cs degree"],
    question: "What does studying computer science involve?",
    categoryIds: ["cat-06", "cat-01", "cat-07"],
    summary: "Computer science is the study of computation: algorithms, data structures, programming languages, systems, and the theory of what can be computed.",
    sections: {
      definition: "The study of computation and information: algorithms and their efficiency, data structures, programming languages, computer systems, networks, artificial intelligence and the theoretical limits of computation.",
      simple: "Computer science is the science of how computers think: how to give them instructions (algorithms), how to organize information (data), and what computers can and cannot do.",
      detailed: "Core topics: programming, algorithms and data structures, discrete mathematics, computer architecture, operating systems, databases, networks, software engineering, and electives such as AI, security, graphics and theory. A degree builds both practical programming and theoretical foundations; the field changes fast, so self-learning is a permanent part of it. Career outcomes include software engineering, data science, research and many hybrid roles.",
      learning_path: "FOUNDATIONS: programming, discrete math, algorithms. UNDERGRADUATE: systems, databases, networks, software engineering. GRADUATE: theory, AI, research. INDUSTRY: engineering practice, specializations.",
      guidance: "Computer science degrees emphasize theory; software engineering emphasizes practice — choose by your goals.",
    },
    misconceptions: [
      { misconception: "Computer science is just programming.", correction: "Programming is a tool; the field also covers theory, systems and the limits of computation." },
      { misconception: "You must be a math prodigy.", correction: "Discrete math and logic matter, but advanced calculus is rarely needed for most roles." },
    ],
    relatedIds: ["con.algorithm", "tech.programming", "car.software-engineer", "con.artificial-intelligence"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.law",
    title: "Law",
    aliases: ["legal studies", "becoming a lawyer"],
    question: "What does studying law involve?",
    categoryIds: ["cat-17", "cat-01"],
    summary: "Law is the study of rules and justice: how laws are made, interpreted and applied — leading to careers as lawyers, judges, and legal professionals.",
    sections: {
      definition: "The discipline of studying legal systems: the sources of law (constitutions, statutes, precedents), legal reasoning, and the institutions — courts, legislatures, regulators — that make and apply rules.",
      simple: "Law is the study of the rules that govern society: what they mean, how they're made, and how they're applied when people disagree.",
      detailed: "Law students study core subjects — constitutional law, contracts, torts, criminal law, property, evidence — plus the legal method: reading cases and statutes, reasoning by analogy, and arguing both sides. Programs include a first degree in law (e.g. LLB, often 3–4 years) followed by professional training and bar qualification, which varies by country. Skills: analysis, writing, argument, ethics.",
      learning_path: "FOUNDATIONS: reading, writing, argument, history. UNDERGRADUATE: core subjects, legal method. PROFESSIONAL: law school, bar exams, pupillage/articling. PRACTICE: specialization (corporate, criminal, human rights, etc.).",
      guidance: "Law study is intellectually demanding and competitive; qualifications and licensing differ significantly between countries.",
    },
    misconceptions: [
      { misconception: "Law school teaches you every law.", correction: "It teaches legal method; laws change constantly and lawyers specialize." },
      { misconception: "Law is only about arguing in court.", correction: "Most legal work is contracts, advice, compliance and negotiation outside courtrooms." },
    ],
    relatedIds: ["con.constitution", "law.courts", "law.contracts", "car.lawyer"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.business",
    title: "Business studies",
    aliases: ["business administration", "bba", "mba"],
    question: "What does studying business involve?",
    categoryIds: ["cat-09", "cat-01"],
    summary: "Business studies covers how organizations work: management, marketing, finance, accounting, operations and strategy.",
    sections: {
      definition: "The academic and practical study of how organizations create and deliver value: management, marketing, finance, accounting, operations, human resources and strategy.",
      simple: "Business studies teaches how companies work: how they make money, manage people, market products and make decisions.",
      detailed: "Core subjects: accounting and finance (reading and managing money), marketing (understanding customers), management and leadership (organizing people), operations (delivering products), and strategy (choosing direction). Degrees range from BBA to MBA; practical experience, internships and case learning matter as much as theory. Careers span management, consulting, finance, marketing, entrepreneurship and general management.",
      learning_path: "FOUNDATIONS: economics, accounting, communication. UNDERGRADUATE: core functions (marketing, finance, ops, HR). GRADUATE: strategy, leadership, analytics. PRACTICE: management rotations, entrepreneurship.",
      guidance: "Business education is most valuable combined with practice — start projects, internships and ventures while studying.",
    },
    misconceptions: [
      { misconception: "An MBA guarantees a top job.", correction: "It opens doors, but outcomes depend on experience, skills and how you use the network." },
      { misconception: "Business is just common sense.", correction: "Business combines disciplines — finance, psychology, analytics, law — with real analytical depth." },
    ],
    relatedIds: ["ins.start-business", "bus.business-models", "con.capitalism", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.economics",
    title: "Economics",
    aliases: ["economic studies"],
    question: "What does studying economics involve?",
    categoryIds: ["cat-13", "cat-01"],
    summary: "Economics studies how people and societies allocate scarce resources — from individual choices to global markets and policy.",
    sections: {
      definition: "The social science of how individuals, firms, governments and societies allocate scarce resources: microeconomics (individual decisions and markets) and macroeconomics (growth, inflation, employment, trade).",
      simple: "Economics is the study of choices: what people buy, why prices change, why some countries are rich and others poor, and how governments can help or hurt.",
      detailed: "Microeconomics covers supply and demand, prices, firms, competition, labour and market failure. Macroeconomics covers growth, inflation, unemployment, money, interest rates, fiscal and monetary policy, and international trade. Modern economics is heavily empirical — using statistics and econometrics to test theories with data. It informs business, policy and everyday decisions, while remaining a field of competing schools and honest uncertainty.",
      learning_path: "FOUNDATIONS: mathematics, statistics, history. UNDERGRADUATE: micro, macro, econometrics. GRADUATE: advanced theory, applied research. PRACTICE: policy, finance, data, academia.",
      guidance: "Economics is a social science: its predictions carry uncertainty, and economists often disagree — that disagreement is part of the field.",
    },
    misconceptions: [
      { misconception: "Economics predicts the future perfectly.", correction: "Economics explains patterns and probabilities; forecasts are frequently wrong." },
      { misconception: "Economics is only about money.", correction: "It studies all choices under scarcity — time, health, environment and more." },
    ],
    relatedIds: ["con.inflation", "why.economy-grows", "why.inflation", "con.capitalism"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.mathematics",
    title: "Mathematics",
    aliases: ["math", "pure mathematics", "applied mathematics"],
    question: "What does studying mathematics involve?",
    categoryIds: ["cat-03", "cat-01"],
    summary: "Mathematics is the study of structure, pattern and quantity — from abstract proof to the applied math behind science, engineering and data.",
    sections: {
      definition: "The discipline of studying patterns, structure, quantity and change through rigorous reasoning: algebra, analysis, geometry, number theory, probability and statistics, and their applications.",
      simple: "Mathematics is the science of patterns and logic. It starts with numbers and shapes and grows into deep structures used everywhere from money to rockets.",
      detailed: "Pure mathematics pursues truth through proof — definitions, theorems, logical deduction. Core areas: algebra (structures), analysis (limits, continuity), geometry and topology (space), number theory, logic, and probability/statistics. Applied mathematics uses these tools in physics, engineering, finance, biology and data science. A mathematics degree develops rigorous thinking prized in finance, technology, research and teaching.",
      learning_path: "FOUNDATIONS: calculus, linear algebra, proof writing. UNDERGRADUATE: algebra, analysis, probability, electives. GRADUATE: specialization and research. APPLICATION: statistics, quantitative finance, data science, academia.",
      guidance: "Mathematics builds slowly — mastering foundations matters more than speed.",
    },
    misconceptions: [
      { misconception: "Math is only arithmetic.", correction: "Arithmetic is a small corner; mathematics is the study of structure and proof." },
      { misconception: "Some people are just not 'math people'.", correction: "Ability develops with practice and good teaching; mindset and method matter enormously." },
    ],
    relatedIds: ["con.algorithm", "disc.computer-science", "tech.data-science", "sci.physics"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.physics",
    title: "Physics",
    aliases: ["physical sciences"],
    question: "What does studying physics involve?",
    categoryIds: ["cat-02", "cat-01"],
    summary: "Physics is the science of matter, energy, space and time — from particles to galaxies — seeking the fundamental laws of nature.",
    sections: {
      definition: "The natural science that studies matter, energy, motion and force at every scale — from subatomic particles to the cosmos — through theory, mathematics and experiment.",
      simple: "Physics asks how the universe works: why things move, how light behaves, what matter is made of — and answers with experiments and math.",
      detailed: "Classical physics covers mechanics, electromagnetism, thermodynamics and waves; modern physics adds relativity (space and time at high speeds and strong gravity) and quantum mechanics (the strange rules of the very small). Physics degrees emphasize mathematics, problem solving, laboratory work and theory; physicists work in research, technology, finance, energy and teaching.",
      learning_path: "FOUNDATIONS: mechanics, calculus, electromagnetism. UNDERGRADUATE: quantum, relativity, thermodynamics, labs. GRADUATE: specialization (particle, condensed matter, astrophysics). RESEARCH: experiments, theory, computation.",
      guidance: "Physics requires strong mathematics; it rewards curiosity and patience with hard problems.",
    },
    misconceptions: [
      { misconception: "Physics is only for geniuses.", correction: "Physics is learned through practice, like any skill — it is demanding but accessible." },
      { misconception: "Physics is finished — everything is known.", correction: "Open questions remain in cosmology, quantum gravity and beyond; the field is active." },
    ],
    relatedIds: ["con.electricity", "who.einstein", "sci.astronomy", "disc.mathematics"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.biology",
    title: "Biology",
    aliases: ["life sciences"],
    question: "What does studying biology involve?",
    categoryIds: ["cat-02", "cat-01", "cat-27"],
    summary: "Biology is the science of life — from molecules and cells to organisms, ecosystems and evolution.",
    sections: {
      definition: "The natural science of living organisms: their structure, function, growth, origin, evolution and interactions — spanning molecular biology, genetics, physiology, ecology and evolution.",
      simple: "Biology is the study of living things: how plants and animals work, how life began, how bodies stay healthy, and how species change over time.",
      detailed: "Core themes: cell biology and biochemistry (the chemistry of life), genetics (inheritance and DNA), physiology (how organisms function), evolution (how life changes), ecology (how organisms interact) and diversity (classification). Modern biology is molecular and data-driven — genomics and bioinformatics are central. Careers span medicine, research, agriculture, conservation and biotechnology.",
      learning_path: "FOUNDATIONS: chemistry, cell biology, genetics. UNDERGRADUATE: physiology, ecology, evolution, labs. GRADUATE: molecular biology, research. APPLICATION: medicine, biotech, conservation.",
      guidance: "Biology builds on chemistry; lab and field experience are essential parts of training.",
    },
    misconceptions: [
      { misconception: "Biology is just memorizing facts.", correction: "Modern biology is about mechanisms, systems and data — understanding, not only recall." },
      { misconception: "Evolution is 'just a theory'.", correction: "In science, a theory is a well-tested explanation; evolution by natural selection is one of the best-supported in biology." },
    ],
    relatedIds: ["con.dna", "sci.genetics", "sci.ecology", "disc.medicine"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.psychology",
    title: "Psychology",
    aliases: ["psychological studies"],
    question: "What does studying psychology involve?",
    categoryIds: ["cat-24", "cat-01"],
    summary: "Psychology is the scientific study of mind and behaviour — from perception and learning to emotion, development, social behaviour and mental health.",
    sections: {
      definition: "The scientific study of mind and behaviour: how people perceive, think, feel, learn and interact, examined through experiments, observation and measurement.",
      simple: "Psychology studies why people think, feel and act the way they do — using science rather than guesswork.",
      detailed: "Major areas: cognitive psychology (thinking, memory, perception), developmental (how people change across life), social (how others influence us), biological/neuroscience (brain and behaviour), clinical (mental health and therapy), and organizational (work behaviour). Degrees emphasize research methods and statistics; clinical practice requires graduate training and licensure.",
      learning_path: "FOUNDATIONS: research methods, statistics, brain and behaviour. UNDERGRADUATE: core areas. GRADUATE: clinical, cognitive, social, organizational specializations. PRACTICE: supervised training, licensure.",
      guidance: "Psychology is a science — its conclusions are probabilistic, and popular 'psychology facts' should be checked against research.",
    },
    misconceptions: [
      { misconception: "Psychology is just common sense.", correction: "Research regularly overturns intuitions; that is exactly why it is measured." },
      { misconception: "Studying psychology makes you a therapist.", correction: "Therapy requires graduate clinical training and licensure; most psychology graduates work elsewhere." },
    ],
    relatedIds: ["hlth.mental-health", "rel.communication", "why.sleep"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 10. SCIENCE KNOWLEDGE — fields with FOUNDATIONS → RESEARCH levels
 * ════════════════════════════════════════════════════════════════════════════ */

const SCIENCE_FIELD_RECORDS: KnowledgeRecord[] = [
  scienceField({
    id: "sci.physics",
    title: "Physics",
    aliases: ["physical science", "physics field"],
    question: "What is physics?",
    categoryIds: ["cat-02", "cat-01"],
    summary: "Physics is the science of matter, energy, space and time — from particles to galaxies — seeking the fundamental laws of nature.",
    sections: {
      definition: "The natural science that studies matter, energy, motion and force at every scale, through theory, mathematics and experiment.",
      simple: "Physics is how the universe works: why things move, what light is, what matter is made of — answered with experiments and math.",
      levels: "FOUNDATIONS: mechanics, electromagnetism, thermodynamics, calculus. INTERMEDIATE: waves, quantum ideas, relativity. ADVANCED: quantum mechanics, statistical physics, field theory. RESEARCH: particle physics, condensed matter, cosmology.",
      guidance: "Physics requires strong mathematics; it rewards curiosity and patient problem solving.",
    },
    misconceptions: [
      { misconception: "Physics is finished — everything is known.", correction: "Open questions remain in cosmology, quantum gravity and beyond." },
      { misconception: "Physics is only for geniuses.", correction: "It is learned through practice like any skill." },
    ],
    relatedIds: ["disc.physics", "who.einstein", "con.electricity", "sci.astronomy"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.chemistry",
    title: "Chemistry",
    aliases: ["chemical science"],
    question: "What is chemistry?",
    categoryIds: ["cat-02", "cat-01"],
    summary: "Chemistry is the science of matter: what substances are made of, how they change, and how atoms combine into molecules.",
    sections: {
      definition: "The natural science of matter at the atomic and molecular level: composition, structure, properties, reactions and the energy changes that accompany them.",
      simple: "Chemistry studies what things are made of and how they change — why iron rusts, how medicine works, how food cooks.",
      levels: "FOUNDATIONS: atoms, elements, the periodic table, chemical bonds. INTERMEDIATE: reactions, stoichiometry, organic chemistry. ADVANCED: thermodynamics, kinetics, quantum chemistry. RESEARCH: materials, biochemistry, green chemistry.",
      guidance: "Chemistry connects to biology, medicine, materials and energy; lab safety is a core professional skill.",
    },
    misconceptions: [
      { misconception: "Chemicals are dangerous additives.", correction: "Everything is made of chemicals; water is a chemical. Risk depends on the substance and dose." },
      { misconception: "Chemistry is only about mixing liquids in labs.", correction: "It spans materials, medicines, energy, food and the atmosphere." },
    ],
    relatedIds: ["disc.biology", "who.curie", "hlth.nutrition"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.biology",
    title: "Biology",
    aliases: ["life science", "biology field"],
    question: "What is biology?",
    categoryIds: ["cat-02", "cat-01", "cat-27"],
    summary: "Biology is the science of life — from molecules and cells to organisms, ecosystems and evolution.",
    sections: {
      definition: "The natural science of living organisms: their structure, function, growth, origin, evolution and interactions.",
      simple: "Biology is the study of living things: how plants and animals work, how life began and how species change.",
      levels: "FOUNDATIONS: cell biology, chemistry, genetics. INTERMEDIATE: physiology, ecology, evolution. ADVANCED: molecular biology, genomics. RESEARCH: biotechnology, conservation, medicine.",
      guidance: "Biology builds on chemistry; modern biology is molecular and data-driven.",
    },
    misconceptions: [
      { misconception: "Biology is just memorizing names.", correction: "It is the study of mechanisms and systems — understanding, not only recall." },
      { misconception: "Evolution is 'just a theory'.", correction: "In science a theory is a well-tested explanation; evolution is among the best-supported." },
    ],
    relatedIds: ["disc.biology", "con.dna", "sci.genetics", "sci.ecology"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.astronomy",
    title: "Astronomy",
    aliases: ["space science", "astrophysics"],
    question: "What is astronomy?",
    categoryIds: ["cat-49", "cat-02"],
    summary: "Astronomy is the study of everything beyond Earth — stars, planets, galaxies and the universe itself.",
    sections: {
      definition: "The natural science of celestial objects and phenomena: stars, planets, moons, galaxies, black holes, cosmology — studied through observation, telescopes and physical theory.",
      simple: "Astronomy is the science of the sky: what stars are, how planets move, and how the universe began and grows.",
      detailed: "Astronomers use telescopes across the electromagnetic spectrum and space missions to study the cosmos. Key fields: planetary science, stellar astronomy (how stars live and die), galactic astronomy, and cosmology (the universe's origin and fate). Discoveries include exoplanets, black holes, dark matter and the expansion of the universe.",
      levels: "FOUNDATIONS: physics, mathematics, the solar system, star patterns. INTERMEDIATE: stellar physics, orbital mechanics, telescopes. ADVANCED: galaxies, cosmology, relativity. RESEARCH: observational campaigns, space missions, theoretical cosmology.",
      guidance: "Space exploration current events (missions, launches) are dynamic information to verify.",
    },
    misconceptions: [
      { misconception: "Astronomy and astrology are the same.", correction: "Astronomy is a science; astrology is a belief system with no scientific basis." },
      { misconception: "The Sun is a unique star.", correction: "The Sun is an ordinary star — one of hundreds of billions in the Milky Way." },
    ],
    relatedIds: ["sci.physics", "when.moon-landing", "disc.physics"],
    sources: [SRC_NASA, SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.geology",
    title: "Geology",
    aliases: ["earth science", "geosciences"],
    question: "What is geology?",
    categoryIds: ["cat-40", "cat-02"],
    summary: "Geology is the science of the Earth: its rocks, minerals, processes, history and the forces that shape its surface.",
    sections: {
      definition: "The Earth science studying the planet's solid materials, structure and history: rocks and minerals, plate tectonics, volcanoes, earthquakes, erosion and deep time.",
      simple: "Geology is the study of the Earth itself: what rocks are made of, how mountains rise, why volcanoes erupt, and how the planet changes over millions of years.",
      detailed: "Geology explains the Earth through deep time: plate tectonics moves continents, builds mountains and triggers earthquakes and volcanoes; erosion and sedimentation reshape landscapes; the rock cycle recycles materials. Geologists find the water, minerals and energy humanity depends on, and assess natural hazards. The geologic timescale spans 4.54 billion years.",
      levels: "FOUNDATIONS: minerals, rocks, maps, Earth structure. INTERMEDIATE: plate tectonics, geomorphology, stratigraphy. ADVANCED: geophysics, geochemistry, hydrogeology. RESEARCH: deep-Earth processes, planetary geology, climate archives.",
      guidance: "Earthquakes and eruption forecasts are probabilistic — current hazard information is dynamic and official sources should be followed.",
    },
    misconceptions: [
      { misconception: "Earth is 6 000 years old.", correction: "Radiometric dating consistently places Earth at about 4.54 billion years." },
      { misconception: "Continents never move.", correction: "They drift a few centimetres per year — measurable by GPS." },
    ],
    relatedIds: ["sci.environmental-science", "why.climate-change", "sci.astronomy"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.environmental-science",
    title: "Environmental science",
    aliases: ["environmental studies"],
    question: "What is environmental science?",
    categoryIds: ["cat-40", "cat-02", "cat-41"],
    summary: "Environmental science studies the natural environment and how human activity affects it — combining biology, chemistry, geology and social science.",
    sections: {
      definition: "The interdisciplinary study of the environment and the impact of human activity: ecosystems, pollution, climate, resources and sustainability, drawing on biology, chemistry, geology and social science.",
      simple: "Environmental science studies nature and how people change it: pollution, climate, forests, water and wildlife — and what can be done.",
      detailed: "It links the science of how ecosystems work with the pressures humanity places on them: greenhouse-gas emissions and climate change, pollution of air and water, biodiversity loss, land use and waste. Solutions-oriented fields include renewable energy, conservation, restoration, environmental policy and green technology.",
      levels: "FOUNDATIONS: ecology, chemistry, Earth systems. INTERMEDIATE: pollution science, climate systems, conservation. ADVANCED: environmental modelling, policy, impact assessment. RESEARCH: climate science, biodiversity, sustainability transitions.",
      guidance: "Environmental data (pollution levels, species status, climate records) is dynamic and must be sourced and dated.",
    },
    misconceptions: [
      { misconception: "Environmental problems are someone else's problem.", correction: "Causes and solutions span individual, corporate and government action everywhere." },
      { misconception: "Environmental protection always hurts the economy.", correction: "Clean energy and efficiency often create jobs and savings; the trade-offs are real but more complex than a simple conflict." },
    ],
    relatedIds: ["why.climate-change", "sci.ecology", "tech.renewable-energy", "who.maathai"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.neuroscience",
    title: "Neuroscience",
    aliases: ["brain science"],
    question: "What is neuroscience?",
    categoryIds: ["cat-24", "cat-02", "cat-27"],
    summary: "Neuroscience is the scientific study of the nervous system — how the brain produces perception, thought, emotion and behaviour.",
    sections: {
      definition: "The interdisciplinary science of the nervous system: neurons and synapses, brain circuits, development, sensation, movement, memory, emotion, and disorders of the nervous system.",
      simple: "Neuroscience studies the brain: how billions of nerve cells work together to make you see, think, feel, remember and move.",
      detailed: "Neuroscience spans scales: molecular (neurotransmitters, receptors), cellular (neurons and synapses), systems (circuits for vision, memory), behavioural (cognition, emotion) and clinical (neurological and psychiatric disorders). Methods include imaging (fMRI, EEG), electrophysiology, genetics and computation. It is one of the fastest-moving sciences.",
      levels: "FOUNDATIONS: biology, chemistry, psychology. INTERMEDIATE: neurons, synapses, brain anatomy. ADVANCED: systems neuroscience, imaging, computation. RESEARCH: cognition, disorders, brain-machine interfaces.",
      guidance: "Neuroscience headlines are often exaggerated; check claims against primary research.",
    },
    misconceptions: [
      { misconception: "Humans use only 10% of their brains.", correction: "Imaging shows activity across the whole brain; the claim is a myth." },
      { misconception: "Left-brained and right-brained people differ in kind.", correction: "Both hemispheres cooperate in nearly every task; personality differences are not explained by hemisphere dominance." },
    ],
    relatedIds: ["disc.psychology", "hlth.mental-health", "why.sleep"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.genetics",
    title: "Genetics",
    aliases: ["genomics", "genes"],
    question: "What is genetics?",
    categoryIds: ["cat-02", "cat-27"],
    summary: "Genetics is the study of genes, heredity and how traits are passed from parents to offspring.",
    sections: {
      definition: "The branch of biology studying genes, genetic variation and heredity in living organisms — from single-gene traits to the whole genome.",
      simple: "Genetics studies how living things pass traits to their children: why you have your parents' eye colour, and how DNA carries those instructions.",
      detailed: "Classical genetics tracks how traits are inherited (Mendel's laws); molecular genetics studies DNA structure and function; genomics reads and compares whole genomes. Applications include medicine (genetic testing, gene therapy), agriculture (improved crops), forensics (DNA identification) and evolutionary biology.",
      levels: "FOUNDATIONS: cell biology, DNA, inheritance patterns. INTERMEDIATE: molecular genetics, gene expression. ADVANCED: genomics, population genetics. RESEARCH: gene therapy, epigenetics, genome editing.",
      guidance: "Genetic test results have medical and ethical dimensions — interpret them with qualified professionals.",
    },
    misconceptions: [
      { misconception: "Genes fix your fate.", correction: "Most traits involve many genes interacting with environment; few are destiny." },
      { misconception: "You inherit exactly 50% from each parent.", correction: "You inherit half your DNA from each parent, but which variants you receive is random per gene, and relatives share variable amounts." },
    ],
    relatedIds: ["con.dna", "disc.biology", "sci.neuroscience"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.ecology",
    title: "Ecology",
    aliases: ["ecosystems"],
    question: "What is ecology?",
    categoryIds: ["cat-40", "cat-02"],
    summary: "Ecology is the study of how organisms interact with each other and their environment — from individuals to ecosystems and the biosphere.",
    sections: {
      definition: "The branch of biology studying the relationships between organisms and their environment: populations, communities, ecosystems, energy flow and nutrient cycles.",
      simple: "Ecology studies nature's connections: how plants, animals, water, soil and climate depend on each other in places like forests, oceans and savannahs.",
      detailed: "Ecologists study populations (how numbers change), communities (how species interact — predation, competition, symbiosis), and ecosystems (energy and matter flow). Concepts include food webs, carrying capacity, biodiversity and succession. Ecology underpins conservation and our understanding of environmental change.",
      levels: "FOUNDATIONS: biology, species and habitats. INTERMEDIATE: populations, communities, food webs. ADVANCED: ecosystem science, modelling. RESEARCH: biodiversity, climate-ecosystem feedbacks, restoration.",
      guidance: "Ecology explains patterns in nature; current conservation status of species is dynamic data from official sources.",
    },
    misconceptions: [
      { misconception: "Ecology is just about saving animals.", correction: "It is a quantitative science of relationships; conservation is one application." },
      { misconception: "Nature stays in balance if left alone.", correction: "Ecosystems change constantly; 'balance' is a simplification." },
    ],
    relatedIds: ["sci.biology", "sci.environmental-science", "con.photosynthesis"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 11. TECHNOLOGY KNOWLEDGE
 * ════════════════════════════════════════════════════════════════════════════ */

const TECHNOLOGY_RECORDS: KnowledgeRecord[] = [
  technology({
    id: "tech.computers",
    title: "Computers",
    aliases: ["personal computers", "how computers work"],
    question: "How do computers work?",
    categoryIds: ["cat-04", "cat-06"],
    summary: "A computer is a machine that processes information: input, processing (CPU), memory and storage, and output — running programs that are just very precise instructions.",
    sections: {
      definition: "A programmable machine that executes sequences of instructions (programs) to process data: input devices feed it information, the CPU and memory process it, and output devices present results.",
      simple: "A computer takes instructions and data in, thinks about them with its brain (the processor) using working memory, and shows you the result — and it can save things to remember later.",
      detailed: "The CPU executes billions of simple operations per second — reading, comparing, adding, storing — guided by a program. Memory (RAM) holds active work; storage (SSD/hard disk) keeps data when power is off. Peripherals (screen, keyboard, mouse, network) connect it to the world. Software — operating system and applications — turns the hardware into a useful machine. The same design scales from phones to data centres.",
      history: "Computing evolved from mechanical calculators, through the first electronic computers (1940s, e.g. ENIAC), the transistor (1947) and integrated circuits, to personal computers in the 1970s–80s and the ubiquitous devices of today. Moore's law described the doubling of transistor density roughly every two years.",
      how_it_works: "Programs are compiled or interpreted into machine instructions; the CPU fetches, decodes and executes them; data flows between registers, cache, RAM and storage; results reach you through output devices and networks.",
      examples: "Typing a document, browsing the web, editing a photo, running a game — all are programs executing on the same hardware principles.",
      guidance: "Current computer specifications and prices are dynamic information.",
    },
    misconceptions: [
      { misconception: "Computers are infallible.", correction: "They follow instructions exactly — which means bugs, bad input and design flaws produce errors." },
      { misconception: "Restarting fixes nothing.", correction: "Restarting clears stuck software state and is a legitimate first troubleshooting step." },
    ],
    relatedIds: ["why.computers-memory", "tech.internet", "tech.databases", "con.algorithm"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.internet",
    title: "The internet",
    aliases: ["net", "world wide web", "online"],
    question: "How does the internet work?",
    categoryIds: ["cat-75", "cat-04"],
    summary: "The internet is a global network of networks that moves data between computers using standardized protocols (TCP/IP) — the Web is one service that runs on it.",
    sections: {
      definition: "A worldwide system of interconnected computer networks that communicate using the TCP/IP protocol suite, carrying the Web, email, streaming, messaging and countless other services.",
      simple: "The internet is like a worldwide postal system for computers: every device has an address, and data is split into packets that travel through many networks to reach their destination.",
      detailed: "Every device gets an IP address; data is broken into packets that routers forward across networks; TCP ensures packets arrive complete and in order. The Domain Name System (DNS) translates names like example.org into addresses. The World Wide Web — hyperlinked documents served over HTTP — is the most visible service, but email, messaging, streaming and gaming all run on the same network. Data travels through undersea cables, fibre, mobile towers and satellites.",
      history: "ARPANET (1969) pioneered packet switching; TCP/IP became the standard in 1983; the Web (1989–1991) made the internet accessible; smartphones and broadband made it universal in the 2000s–2010s.",
      how_it_works: "Your device sends packets to a router, which forwards them across networks to the destination; the receiving device reassembles them; protocols handle addressing, reliability, security (HTTPS) and presentation.",
      examples: "Loading a webpage (DNS + HTTP), sending email (SMTP), video calls (UDP-based streaming), and internet of things devices.",
      guidance: "Internet access statistics and regulations are dynamic information.",
    },
    misconceptions: [
      { misconception: "The internet and the Web are the same.", correction: "The Web is one service on the internet, like email and messaging." },
      { misconception: "Data travels through satellites mostly.", correction: "The vast majority of international data travels through undersea fibre-optic cables." },
    ],
    relatedIds: ["when.web", "tech.computers", "con.cloud-computing", "con.cybersecurity"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.databases",
    title: "Databases",
    aliases: ["sql", "data storage"],
    question: "What is a database?",
    categoryIds: ["cat-77", "cat-06"],
    summary: "A database is an organized collection of data stored and queried by software — the backbone of nearly every application.",
    sections: {
      definition: "An organized collection of structured data, managed by a database management system (DBMS) that stores, retrieves, updates and protects it — relational (SQL) or non-relational (NoSQL).",
      simple: "A database is a very organized digital filing cabinet. Apps put data in it and ask questions (queries) to get it back.",
      detailed: "Relational databases (PostgreSQL, MySQL) store data in tables with rows and columns, queried with SQL, and enforce relationships and integrity. NoSQL databases (MongoDB, Redis, Cassandra) trade some structure for flexibility or speed. Databases provide transactions (all-or-nothing updates), indexing (fast lookup), backups and access control. Nearly every app — banking, social media, e-commerce — rests on one or more databases.",
      history: "File systems gave way to hierarchical and network models in the 1960s; the relational model (Codd, 1970) became dominant; the web era added open-source and NoSQL systems; cloud databases now dominate new deployments.",
      how_it_works: "An application connects to the DBMS and sends queries; the DBMS plans execution using indexes, enforces schema and permissions, writes changes durably (often to a log), and returns results — with transactions ensuring consistency.",
      examples: "A bank's account ledger, an e-commerce product catalog, user accounts on a social app, analytics warehouses.",
      guidance: "Choosing a database is an engineering trade-off; current product capabilities are dynamic information.",
    },
    misconceptions: [
      { misconception: "A spreadsheet is a database.", correction: "Spreadsheets lack the integrity, concurrency and query power of a real DBMS." },
      { misconception: "All databases use SQL.", correction: "NoSQL systems use other models (documents, key-value, graphs); SQL is one (very common) model." },
    ],
    relatedIds: ["why.computers-memory", "tech.computers", "tech.data-science", "disc.computer-science"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.programming",
    title: "Programming languages",
    aliases: ["coding languages", "python", "javascript"],
    question: "What is a programming language?",
    categoryIds: ["cat-06", "cat-07"],
    summary: "A programming language is a formal language for writing instructions a computer can execute — each language balances human clarity, speed and purpose.",
    sections: {
      definition: "A formal language with precise syntax and semantics for expressing computation: source code written by humans is translated (compiled or interpreted) into instructions machines execute.",
      simple: "A programming language is how humans talk to computers: a precise language where every word and symbol has a strict meaning.",
      detailed: "Languages differ in style and purpose: Python and JavaScript are widely used and approachable; C/C++ give close control of hardware; Java and C# power large systems; SQL queries data; Rust emphasizes safety. Higher-level languages trade a little speed for clarity; compilers and interpreters bridge the gap to machine code. Choosing a language depends on the task, ecosystem and team — there is no single best language.",
      history: "Machine code gave way to assembly, then to high-level languages: FORTRAN and COBOL (1950s), C (1972), C++ (1985), Python (1991), Java (1995), JavaScript (1995), Go (2009), Rust (2015).",
      how_it_works: "Source code is compiled into machine code or bytecode, or interpreted at runtime; libraries and frameworks provide ready-made building blocks; the result executes on the CPU, often inside an operating system or runtime.",
      examples: "Python for data and scripting; JavaScript for web pages; SQL for queries; Swift/Kotlin for mobile apps; C for embedded systems.",
      guidance: "Language popularity and tooling change; current trends are dynamic information.",
    },
    misconceptions: [
      { misconception: "You must learn one language perfectly first.", correction: "Concepts transfer between languages; learning several early is normal and useful." },
      { misconception: "Some languages are objectively best.", correction: "Languages are tools with trade-offs; the right choice depends on the job." },
    ],
    relatedIds: ["ins.learn-programming", "disc.computer-science", "con.algorithm", "cmp.python-vs-js"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.cybersecurity",
    title: "Cybersecurity basics",
    aliases: ["online safety", "protecting accounts", "phishing"],
    question: "How do I protect myself online?",
    categoryIds: ["cat-08", "cat-04", "cat-90"],
    summary: "Protecting yourself online means strong unique passwords, two-factor authentication, recognizing phishing, updating software and backing up data.",
    sections: {
      definition: "The everyday practices that protect personal accounts, devices and data: strong authentication, phishing awareness, updates, backups and privacy settings.",
      simple: "Stay safe online by using strong passwords, adding a second lock (two-factor), not clicking suspicious links, and keeping your phone and computer updated.",
      detailed: "Most account takeovers start with phishing (fake messages that steal passwords) or reused passwords from data breaches. Defences: a password manager generating unique passwords, two-factor authentication (app or hardware key preferred over SMS), checking sender addresses and URLs, updating devices (patches fix known holes), locking screens, and backing up important files (3-2-1 rule). On public Wi-Fi, use HTTPS and avoid sensitive logins without a VPN if the network is untrusted.",
      history: "Security guidance evolves with threats: from antivirus (1990s) to password managers and MFA (2010s) to passkeys and zero-trust (2020s).",
      how_it_works: "Attackers exploit the weakest link — usually the human or a forgotten device; layered defences mean one failure does not lose everything: MFA stops stolen passwords, backups survive ransomware, updates close known holes.",
      examples: "Enabling two-factor on email and banking; using a password manager; checking a link before clicking; making offline backups.",
      guidance: "Threats evolve; follow current guidance from reputable security organizations.",
    },
    misconceptions: [
      { misconception: "Only important people get hacked.", correction: "Most attacks are automated and opportunistic — anyone can be targeted." },
      { misconception: "Antivirus alone is enough.", correction: "MFA, updates and awareness matter more than antivirus alone." },
    ],
    relatedIds: ["con.cybersecurity", "tech.internet", "tech.computers"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.data-science",
    title: "Data science",
    aliases: ["analytics", "machine learning data"],
    question: "What is data science?",
    categoryIds: ["cat-77", "cat-05", "cat-03"],
    summary: "Data science extracts knowledge from data — combining statistics, programming and domain knowledge to measure, predict and decide.",
    sections: {
      definition: "The interdisciplinary field of turning data into insight and action: statistics, programming, data wrangling, visualization, machine learning and communication of results.",
      simple: "Data science means using data to answer real questions: what's happening, why, what will happen next, and what to do about it.",
      detailed: "The workflow: collect data, clean it (the most time-consuming step), explore and visualize, apply statistics or machine learning, and communicate findings so decisions improve. Machine learning (predictive models from examples) is one powerful tool among many — much of data science is careful measurement and descriptive analysis. Ethics matter: models can encode bias, and privacy must be respected.",
      history: "Statistics is centuries old; 'data science' emerged with big data in the 2000s–2010s, combining statistics, computing and machine learning into a distinct profession.",
      how_it_works: "Data is gathered from systems and experiments; cleaning fixes errors and gaps; analysis finds patterns; models generalize patterns to new data; results are validated (never trusting a single metric) and presented with uncertainty.",
      examples: "A retailer forecasting demand; a health service tracking outcomes; a fraud team scoring transactions; a product team running A/B tests.",
      guidance: "Current tools and techniques change; the fundamentals — statistics, critical thinking, communication — do not.",
    },
    misconceptions: [
      { misconception: "Data science is just machine learning.", correction: "Most data science is cleaning, measuring and explaining; ML is a subset of the toolkit." },
      { misconception: "More data means better answers.", correction: "Bad data and wrong questions produce confident nonsense; quality and design matter." },
    ],
    relatedIds: ["disc.mathematics", "tech.databases", "con.artificial-intelligence", "disc.economics"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.web-development",
    title: "Web development",
    aliases: ["frontend", "backend", "full-stack"],
    question: "What is web development?",
    categoryIds: ["cat-07", "cat-75"],
    summary: "Web development is building websites and web applications: frontend (what users see), backend (servers and data) and the infrastructure connecting them.",
    sections: {
      definition: "The work of building and maintaining websites and web applications: frontend development (HTML, CSS, JavaScript), backend development (servers, APIs, databases) and deployment.",
      simple: "Web developers build what you see in the browser and the hidden parts that store data and make pages work.",
      detailed: "Frontend developers craft interfaces with HTML (structure), CSS (styling) and JavaScript (interaction), often with frameworks like React. Backend developers build servers, APIs and databases (Node, Python, Go, SQL). Full-stack developers do both. Deployment involves hosting, domains, HTTPS, monitoring and scaling. The field changes quickly, so fundamentals — HTTP, accessibility, performance, security — matter most.",
      history: "Static pages (1990s) → dynamic sites and databases → web apps with rich interfaces (2010s) → cloud-native and AI-assisted development (2020s).",
      how_it_works: "The browser requests a URL; DNS finds the server; the server responds with HTML or data (via APIs); the browser renders it; JavaScript adds interactivity; forms and clicks trigger new requests.",
      examples: "An e-commerce storefront, a news site, a banking web app, a dashboard — all web development.",
      guidance: "Frameworks and tools change rapidly — verify current options rather than assuming.",
    },
    misconceptions: [
      { misconception: "Web development is just making pages pretty.", correction: "It spans data, security, performance and architecture — visual design is one part." },
      { misconception: "You learn it once and stop.", correction: "The ecosystem evolves continuously; learning is part of the job." },
    ],
    relatedIds: ["ins.build-website", "tech.programming", "tech.databases", "con.cloud-computing"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.mobile-development",
    title: "Mobile app development",
    aliases: ["android development", "ios development", "cross-platform"],
    question: "What is mobile app development?",
    categoryIds: ["cat-07", "cat-04"],
    summary: "Mobile development is building apps for phones and tablets — natively (Android/iOS), cross-platform, or as web apps — each with its own trade-offs.",
    sections: {
      definition: "Building software for mobile devices: native development (Kotlin for Android, Swift for iOS), cross-platform frameworks (Flutter, React Native), or web-based apps delivered through the browser.",
      simple: "Mobile developers build the apps on your phone — either separately for each phone type or once in a way that works on both.",
      detailed: "Native apps use each platform's languages and tools, giving best performance and full access to device features, at double the cost (two codebases). Cross-platform frameworks write once and run on both, trading some performance and platform intimacy. Web apps run in the browser, need no store, but have less access to device features. Publishing goes through the Apple App Store and Google Play, with their rules and fees.",
      history: "From WAP sites and J2ME (2000s) to iPhone/Android native apps (2008+) to cross-platform frameworks (2010s) and app stores as major economies.",
      how_it_works: "Code is compiled or interpreted for the platform; apps are packaged, signed and submitted to stores; stores review and distribute; updates ship through the same pipeline; device capabilities (camera, GPS, push) are accessed through platform APIs.",
      examples: "A delivery app built with Flutter; a bank's native Android app; a mobile web storefront.",
      guidance: "Store policies, fees and device ecosystems change — verify current official documentation.",
    },
    misconceptions: [
      { misconception: "Apps work identically on all phones.", correction: "Screen sizes, hardware and OS versions vary widely; testing is essential." },
      { misconception: "A website and an app are interchangeable.", correction: "Apps offer push, offline and device integration; websites offer instant reach without installation." },
    ],
    relatedIds: ["ins.build-app", "tech.programming", "tech.web-development"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.renewable-energy",
    title: "Renewable energy",
    aliases: ["solar energy", "wind energy", "clean energy"],
    question: "What is renewable energy?",
    categoryIds: ["cat-80", "cat-42", "cat-41"],
    summary: "Renewable energy comes from sources that replenish naturally — sunlight, wind, water, geothermal and biomass — and is central to the response to climate change.",
    sections: {
      definition: "Energy from sources that are naturally replenished on human timescales: solar, wind, hydroelectric, geothermal, biomass and ocean energy — in contrast to finite fossil fuels.",
      simple: "Renewable energy comes from nature's ongoing sources — the sun, the wind, rivers, heat from the ground — instead of burning coal, oil or gas.",
      detailed: "Solar panels convert sunlight directly to electricity; wind turbines harvest the wind; hydroelectric dams use flowing water; geothermal taps underground heat; biomass burns or converts organic matter. Renewables have become the cheapest new electricity in much of the world, but they are variable (sun and wind fluctuate), so grids need storage, transmission and flexible demand. Electrifying transport and industry with renewable power is the core of the energy transition.",
      history: "Wind and water powered mills for centuries; modern renewables grew after the 1970s oil crises, accelerated by falling costs — solar and wind prices fell by over 80% in the 2010s — and climate policy.",
      how_it_works: "Generators convert a natural flow into electricity: photons knock electrons loose in solar cells; wind turns blades driving a turbine; falling water spins turbines; grids balance variable supply with storage, interconnectors and demand management.",
      examples: "Utility-scale solar farms, rooftop panels, offshore wind parks, hydroelectric dams like the Grand Ethiopian Renaissance Dam, and geothermal plants in Kenya and Iceland.",
      guidance: "Energy prices, capacity and policy change frequently — current figures are dynamic information.",
    },
    misconceptions: [
      { misconception: "Renewables cannot power modern economies.", correction: "Several countries already run on high shares of renewables; storage and grids are solving variability." },
      { misconception: "Solar panels stop working in winter.", correction: "They produce less but still work; output depends on light, not heat." },
    ],
    relatedIds: ["why.climate-change", "sci.environmental-science", "con.electricity"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 12. BUSINESS & MONEY KNOWLEDGE
 * ════════════════════════════════════════════════════════════════════════════ */

const BUSINESS_RECORDS: KnowledgeRecord[] = [
  business({
    id: "bus.budgeting",
    title: "Budgeting and financial planning",
    aliases: ["personal finance basics", "money management"],
    question: "What is budgeting and financial planning?",
    categoryIds: ["cat-11", "cat-88", "cat-90"],
    summary: "Budgeting and financial planning match income to spending and savings deliberately — track money, cover needs, build an emergency fund, reduce debt and save toward goals.",
    sections: {
      definition: "The practices of planning and controlling personal or household money: budgeting (matching income to planned spending), saving, debt management, insurance and goal-based investing.",
      simple: "Financial planning is deciding what your money does before you spend it: cover needs, save some, and don't spend more than comes in.",
      detailed: "The essentials: track income and spending; keep fixed needs covered; build an emergency fund (3–6 months of expenses); manage debt (pay high-interest debt first); save for goals; insure against unaffordable losses; and invest surplus according to time horizon and risk. Financial planning is a skill, not a personality trait — and it compounds: small early decisions matter enormously over decades.",
      how_it_works: "A plan starts from real numbers (income, expenses, debts); it allocates money to needs, wants, savings and debt; tracking turns the plan into feedback; reviews adjust it as life changes.",
      guidance: "For major decisions (debt restructuring, investments, taxes), consult qualified financial professionals; rules and products differ by country.",
    },
    misconceptions: [
      { misconception: "Financial planning is only for the wealthy.", correction: "It matters most for people with limited means — small savings and debt decisions compound." },
      { misconception: "A budget is a restriction.", correction: "A budget is an allocation: it makes spending on what matters possible, not impossible." },
    ],
    relatedIds: ["ins.create-budget", "bus.saving", "con.money", "con.inflation"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.business-models",
    title: "Business models",
    aliases: ["how businesses make money"],
    question: "What is a business model?",
    categoryIds: ["cat-09", "cat-10"],
    summary: "A business model describes how an organization creates, delivers and captures value — who it serves, what it offers and how it earns money.",
    sections: {
      definition: "The logic by which a business creates value for customers and captures value for itself: value proposition, customer segments, channels, revenue streams, costs and key activities.",
      simple: "A business model is the answer to: who are your customers, what do you give them, and how do you get paid for it?",
      detailed: "Common patterns: direct sales, subscriptions (recurring fees), marketplace (connecting buyers and sellers), platform (network effects), freemium (free base, paid upgrades), advertising (free service funded by ads), and razor-and-blades (cheap device, profitable refills). A model works when value delivered to customers exceeds what they pay, and revenue exceeds costs over time. Models evolve — many firms pivot when the first version fails.",
      history: "Business models existed as long as trade; the term became central with the internet economy, where new models (subscriptions, platforms, marketplaces) spread quickly.",
      how_it_works: "The model aligns the value proposition with a customer segment, sets pricing and revenue mechanics, and structures costs so the business is sustainable and scalable.",
      examples: "Netflix (subscription), Amazon (retail + marketplace + cloud), MTN (network + mobile money), Jumia (marketplace), Google (advertising).",
      guidance: "Choosing a model is a core strategic decision; test it with real customers before scaling.",
    },
    misconceptions: [
      { misconception: "A great product guarantees a great business model.", correction: "Many great products failed on monetization; the model is a separate design problem." },
      { misconception: "Free means no business model.", correction: "Free products are often funded by ads, upgrades or data — the model is just indirect." },
    ],
    relatedIds: ["ins.start-business", "disc.business", "why.businesses-fail", "bus.ecommerce"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.taxes",
    title: "Taxes and tax systems",
    aliases: ["taxation", "income tax", "vat"],
    question: "What are taxes and how do they work?",
    categoryIds: ["cat-13", "cat-18", "cat-14"],
    summary: "Taxes are compulsory payments to government that fund public services; systems differ by country but share common types — income, sales/VAT, corporate and property taxes.",
    sections: {
      definition: "Compulsory contributions levied by governments on income, consumption, wealth and transactions, used to fund public goods and services and redistribute resources.",
      simple: "Taxes are the money citizens and companies pay so the government can provide schools, roads, hospitals and security.",
      detailed: "Main types: income tax (on earnings, often progressive — higher earners pay higher rates), sales tax/VAT (on consumption), corporate tax (on company profits), property tax and customs duties. Employers usually deduct income tax and social contributions from salaries (PAYE-style systems); businesses collect VAT and file returns; annual filing and registration rules vary by country. Tax systems are also policy tools — incentives steer investment, and rates reflect political choices.",
      history: "Taxation is as old as states (ancient Egypt, Rome, China). The income tax became widespread in the 19th–20th centuries to fund wars and welfare states; VAT spread from the mid-20th century.",
      how_it_works: "Laws define who owes what; employers and platforms withhold at source; taxpayers file returns; tax authorities assess, collect and audit; the revenue funds public budgets.",
      examples: "PAYE income tax on salaries; VAT on purchases; company tax on profits; property rates paid to local government.",
      guidance: "Tax rules are country-specific, detailed and change frequently — always consult a qualified accountant or tax professional and the official tax authority.",
    },
    misconceptions: [
      { misconception: "Tax evasion and avoidance are the same.", correction: "Evasion (hiding income illegally) is a crime; avoidance (using legal rules to reduce tax) is legal, though often regulated." },
      { misconception: "Only the rich pay tax.", correction: "Everyone pays consumption taxes; most workers pay income tax; systems differ in how progressive they are." },
    ],
    relatedIds: ["bus.budgeting", "ins.register-company", "con.government", "ins.start-business"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.saving",
    title: "Saving and emergency funds",
    aliases: ["savings", "emergency fund"],
    question: "How should I save money?",
    categoryIds: ["cat-11", "cat-88"],
    summary: "Saving means setting income aside before spending: an emergency fund first (3–6 months of expenses), then goal-based savings — with interest, inflation and access in mind.",
    sections: {
      definition: "Setting aside money rather than spending it — first into an emergency fund for unexpected costs, then toward goals — balancing safety, return, inflation and access.",
      simple: "Saving means paying yourself first: put some money away before you spend, starting with a cushion for emergencies.",
      detailed: "Financial planners recommend: an emergency fund covering 3–6 months of essential expenses in an accessible, low-risk account (before investing); then saving toward goals (house, education, retirement) with appropriate vehicles — bank savings, fixed deposits, retirement accounts — considering interest rates, inflation (which erodes cash), fees and access. Automating transfers ('pay yourself first') beats relying on willpower.",
      history: "Saving is ancient; modern savings institutions (banks, postal savings, microfinance) industrialized it, and mobile money brought it to billions.",
      how_it_works: "Income arrives → transfer a fixed amount to savings immediately → the rest is for spending; emergency savings sit in liquid, low-risk accounts; longer goals use higher-return vehicles with more risk and less access.",
      examples: "An emergency fund of three months' rent in a savings account; a fixed deposit for a planned purchase; automatic monthly transfers.",
      guidance: "Interest rates and products change — verify current terms; for complex goals consult qualified financial professionals.",
    },
    misconceptions: [
      { misconception: "You need a high income to save.", correction: "Small, consistent amounts compound; the habit matters more than the size." },
      { misconception: "Cash under the mattress is safest.", correction: "Inflation erodes cash, and uninsured cash is at risk from theft and loss; regulated accounts offer protection." },
    ],
    relatedIds: ["ins.create-budget", "con.banking", "con.inflation", "bus.insurance"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.insurance",
    title: "Insurance",
    aliases: ["insurance basics"],
    question: "What is insurance and how does it work?",
    categoryIds: ["cat-16", "cat-11"],
    summary: "Insurance pools the risk of many people so a few large losses are affordable: you pay a premium, and the insurer pays covered claims.",
    sections: {
      definition: "A contract in which an insurer promises to pay for specified losses in exchange for regular payments (premiums), pooling risk across many policyholders.",
      simple: "Insurance is a safety net: many people pay a little each month, and when something bad happens to one of them, the insurer pays the big cost.",
      detailed: "Common types: health, life, motor/auto, home/property, travel, and business insurance. How it works: premiums from many policyholders fund claims for the few who suffer losses; insurers price premiums using risk statistics; policies define what is covered, excluded and limited. Insurance matters most for losses you could not otherwise afford — it is not a savings plan or investment, though some products (whole life) mix both.",
      history: "Marine insurance existed in ancient trade; modern insurance grew in 17th-century London (Lloyd's), expanded to life, fire and health in the 19th–20th centuries, and is now regulated everywhere.",
      how_it_works: "You apply; the insurer assesses risk and sets a premium; you pay regularly; if a covered event occurs, you file a claim; the insurer verifies and pays per the policy terms.",
      examples: "Health insurance covering hospital bills; car insurance covering accidents; travel insurance covering trip disruption; business insurance covering liability.",
      guidance: "Policy terms differ sharply between providers and countries — read the policy, compare offers, and consult qualified advisors for major cover.",
    },
    misconceptions: [
      { misconception: "Insurance is a waste of money if nothing happens.", correction: "It is a risk-transfer purchase, not an investment; its value is the protection, not the payout." },
      { misconception: "Insurance covers everything.", correction: "Policies define exclusions and limits — read them before you need them." },
    ],
    relatedIds: ["ins.travel-international", "bus.saving", "trv.safety"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.ecommerce",
    title: "E-commerce",
    aliases: ["online selling", "online shopping"],
    question: "What is e-commerce?",
    categoryIds: ["cat-73", "cat-09"],
    summary: "E-commerce is buying and selling over the internet — from marketplaces and storefronts to payments, logistics and customer trust.",
    sections: {
      definition: "The buying and selling of goods and services online: storefronts and marketplaces, online payments, delivery logistics, and the marketing and trust systems that make them work.",
      simple: "E-commerce is shopping online: stores on the internet, paying with cards or mobile money, and goods delivered to your door.",
      detailed: "Models: B2C (business to consumer), B2B, C2C (marketplaces like Jumia, Amazon, eBay) and D2C (brands selling directly). The stack: an online catalog, payments (cards, mobile money, bank transfer, cash on delivery — still common in many markets), order fulfilment and delivery, returns, and customer support. Trust is the core asset: reviews, secure payment, clear policies. Cross-border e-commerce adds currencies, customs and delivery complexity.",
      history: "Online retail began in the 1990s (Amazon, eBay); broadband and mobile payments expanded it globally; the COVID-19 pandemic accelerated adoption dramatically in 2020.",
      how_it_works: "Customers browse and order; payment is authorized and captured; the seller picks, packs and ships (or hands to delivery); the customer receives and can return; disputes go through the platform or payment provider.",
      examples: "A fashion brand's online store; Jumia or Amazon marketplaces; a restaurant taking orders via an app; a business selling digital courses.",
      guidance: "Marketplaces, fees and regulations change — verify current platform terms and local consumer laws.",
    },
    misconceptions: [
      { misconception: "An online store succeeds automatically.", correction: "Traffic, trust, logistics and margins decide success; most stores need real marketing." },
      { misconception: "E-commerce killed physical retail.", correction: "The two blend — omnichannel retail is the norm in many markets." },
    ],
    relatedIds: ["bus.business-models", "ins.build-website", "ins.send-money",],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 13. CAREER INTELLIGENCE
 * ════════════════════════════════════════════════════════════════════════════ */

const CAREER_RECORDS: KnowledgeRecord[] = [
  career({
    id: "car.software-engineer",
    title: "Software engineer",
    aliases: ["software developer", "how to become a software engineer"],
    question: "What do I need to become a software engineer?",
    categoryIds: ["cat-07", "cat-33", "cat-06"],
    summary: "Becoming a software engineer means learning programming fundamentals, building projects, mastering tools and teamwork, and demonstrating skill through work — a degree helps but is not the only path.",
    sections: {
      definition: "A professional who designs, builds, tests and maintains software systems — combining programming skill, engineering discipline (design, testing, review), tools and teamwork.",
      simple: "Software engineers build the apps and websites we use. You start by learning to code, build things, and keep improving.",
      detailed: "The field values demonstrated ability: fundamentals (algorithms, data structures, systems), at least one language deeply, version control (Git), testing, debugging and communication. Paths: a computer science degree (strong theory and recruiting pipelines), bootcamps (fast, practical), or self-study (cheapest, hardest to get the first job). The first job is the hardest step; internships, open-source contributions and projects help. The field rewards continuous learning.",
      guidance: "Salaries, job markets and required skills are dynamic information; verify current data at query time.",
    },
    steps: [
        { order: 1, title: "Learn programming fundamentals", detail: "Python or JavaScript: variables, logic, loops, functions, data structures.", requiresProfessional: false },
        { order: 2, title: "Build projects", detail: "3–5 finished projects you can show, growing in complexity.", requiresProfessional: false },
        { order: 3, title: "Learn engineering tools", detail: "Git, testing, debugging, code review, deployment basics.", requiresProfessional: false },
        { order: 4, title: "Choose a specialization", detail: "Web, mobile, data, systems, or AI — and study it in depth.", requiresProfessional: false },
        { order: 5, title: "Get experience", detail: "Internships, freelance work, open source, or a junior role.", requiresProfessional: false },
        { order: 6, title: "Keep learning", detail: "The ecosystem changes; continuous learning is part of the career.", requiresProfessional: false },
    ],
    misconceptions: [
      { misconception: "You need a computer science degree.", correction: "Many engineers are self-taught or bootcamp-trained; demonstrated skill matters most." },
      { misconception: "The work is typing code alone.", correction: "It is collaborative: design, review, communication and problem-solving dominate." },
    ],
    relatedIds: ["disc.computer-science", "ins.learn-programming", "tech.programming", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.doctor",
    title: "Doctor (physician)",
    aliases: ["medical doctor", "how to become a doctor"],
    question: "What do I need to become a doctor?",
    categoryIds: ["cat-27", "cat-33"],
    summary: "Becoming a doctor requires strong science grades, a medical degree, clinical training and licensure — a long, structured path that differs by country.",
    sections: {
      definition: "A licensed medical professional who diagnoses, treats and prevents illness — trained through medical school, supervised clinical practice and continuing education.",
      simple: "Doctors study for many years: first the science of the body, then treating patients under supervision, then specializing.",
      detailed: "Typical path: strong secondary-school science (biology, chemistry, physics, math); a medical degree (MBBS/MD, 5–6 years direct entry in many countries, or 4 years after a bachelor's in the US); internship and residency (specialization, 3–7+ years); registration with the medical council; and lifelong learning. Entry is highly competitive; the path demands sustained academic performance, empathy, resilience and ethical practice.",
      guidance: "Entry requirements, fees and licensing differ by country and change — verify with official medical councils and universities.",
    },
    steps: [
        { order: 1, title: "Excel in science subjects", detail: "Biology, chemistry, physics and mathematics at secondary school.", requiresProfessional: false },
        { order: 2, title: "Pass medical school admission", detail: "Entrance exams and interviews; requirements vary by country.", requiresProfessional: false },
        { order: 3, title: "Complete a medical degree", detail: "Pre-clinical sciences then clinical rotations (5–6 years typical).", requiresProfessional: false },
        { order: 4, title: "Complete internship and registration", detail: "Supervised practice and medical council registration.", requiresProfessional: true },
        { order: 5, title: "Specialize (residency)", detail: "3–7 years in a specialty, depending on the country and field.", requiresProfessional: true },
        { order: 6, title: "Practice and learn continuously", detail: "Licensing renewal and continuing medical education.", requiresProfessional: true },
    ],
    misconceptions: [
      { misconception: "Doctors study for exactly the same time everywhere.", correction: "Programs and residency lengths differ substantially between countries." },
      { misconception: "Good grades alone make a good doctor.", correction: "Communication, empathy and judgment are as essential as knowledge." },
    ],
    relatedIds: ["disc.medicine", "hlth.body", "hlth.mental-health"],
    sources: [SRC_WHO, SRC_BRITANNICA],
  }),
  career({
    id: "car.lawyer",
    title: "Lawyer",
    aliases: ["attorney", "how to become a lawyer"],
    question: "What do I need to become a lawyer?",
    categoryIds: ["cat-17", "cat-33"],
    summary: "Becoming a lawyer requires a law degree, professional training and bar admission — with paths differing sharply by country.",
    sections: {
      definition: "A licensed legal professional who advises clients, drafts documents, negotiates and represents people in courts and tribunals.",
      simple: "Lawyers study the law, pass professional exams, and help people and organizations understand and use their legal rights.",
      detailed: "Common path: a law degree (LLB, typically 3–4 years), professional law school or vocational training, and bar admission (exams, character review, and often an apprenticeship period — pupillage/articling). Lawyers then specialize: corporate, litigation, criminal defence, family, human rights, tax, intellectual property. The work is reading, analysis, writing and advocacy — for clients, not always in courtrooms.",
      guidance: "Qualifications differ greatly between countries (e.g. US JD, UK/Commonwealth LLB + Bar/LPC, civil-law systems) — verify with the local bar association.",
    },
    steps: [
        { order: 1, title: "Develop analytical and writing skills", detail: "Reading, argument, clear writing — the core of legal work.", requiresProfessional: false },
        { order: 2, title: "Earn a law degree", detail: "LLB or equivalent (3–4 years); entry is competitive.", requiresProfessional: false },
        { order: 3, title: "Complete professional training", detail: "Law school / vocational course, per country.", requiresProfessional: false },
        { order: 4, title: "Pass bar admission", detail: "Exams, character review and apprenticeship where required.", requiresProfessional: true },
        { order: 5, title: "Practise and specialize", detail: "Choose a field; continuing legal education is required.", requiresProfessional: true },
    ],
    misconceptions: [
      { misconception: "Lawyers spend most of their time in court.", correction: "Most legal work is drafting, negotiation, compliance and advice." },
      { misconception: "You can practise after any law degree.", correction: "Bar admission is a separate, mandatory professional step in every jurisdiction." },
    ],
    relatedIds: ["disc.law", "law.courts", "law.contracts", "law.human-rights"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.entrepreneur",
    title: "Entrepreneur",
    aliases: ["business owner", "founder"],
    question: "What do I need to become an entrepreneur?",
    categoryIds: ["cat-10", "cat-33", "cat-09"],
    summary: "Entrepreneurship is solving a real problem for paying customers: there is no licence or degree — the requirements are a validated idea, execution and resilience.",
    sections: {
      definition: "A person who starts and runs a venture, taking financial risk to create value — characterized by opportunity spotting, resourcefulness, execution and learning from failure.",
      simple: "An entrepreneur starts their own business: finds a problem people have, builds a solution, and makes it work.",
      detailed: "Unlike licensed professions, entrepreneurship has no formal entry: the market is the examiner. Practical requirements: a problem worth solving, customer insight, a viable model, basic financial literacy, and the discipline to sell and deliver. Founders often start while employed or studying, validate cheaply, then commit. Skills — selling, budgeting, hiring, managing — are learned by doing. Failure is common and informative.",
      guidance: "Legal, tax and financial steps need professional help in most countries; entrepreneurship is high-risk — plan accordingly.",
    },
    steps: [
        { order: 1, title: "Find a real problem", detail: "Talk to potential customers before building anything.", requiresProfessional: false },
        { order: 2, title: "Validate demand", detail: "Sell a first version or pre-orders to prove willingness to pay.", requiresProfessional: false },
        { order: 3, title: "Choose structure and register", detail: "Legal structure, registration, tax basics — with local advice.", requiresProfessional: true },
        { order: 4, title: "Manage money rigorously", detail: "Separate accounts, bookkeeping, cash-flow discipline.", requiresProfessional: true },
        { order: 5, title: "Sell and iterate", detail: "Customer feedback drives the product; repeat.", requiresProfessional: false },
    ],
    misconceptions: [
      { misconception: "Entrepreneurs are born, not made.", correction: "The skills are learnable; most successful founders built them through practice." },
      { misconception: "You need a big idea and big money.", correction: "Most businesses start small, serve a niche, and grow with reinvested earnings." },
    ],
    relatedIds: ["ins.start-business", "bus.business-models", "why.businesses-fail", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.career-paths",
    title: "Career planning",
    aliases: ["choosing a career", "career change"],
    question: "How do I choose a career path?",
    categoryIds: ["cat-33", "cat-34", "cat-89"],
    summary: "Choosing a career means knowing your interests and constraints, researching real jobs and their requirements, testing through experience, and planning steps — knowing the path can change.",
    sections: {
      definition: "The process of choosing and pursuing a professional direction: self-assessment (interests, values, constraints), labour-market research, skill building, experience and adjustment.",
      simple: "Pick a direction by asking what you enjoy, what you're good at, what pays, and what the job is really like — then test it.",
      detailed: "A sound process: assess interests, strengths, values and constraints (location, family, finances); research occupations — real job descriptions, requirements, pay ranges and growth; test through internships, volunteering, projects or informational interviews; build the required skills and credentials; apply; and review regularly, since careers rarely follow straight lines. Avoid choosing on salary alone or on one person's opinion; and remember most people change careers — sometimes several times.",
      history: "Careers as lifelong vocations are a modern idea; the 21st-century labour market rewards adaptability and continuous skill building.",
      how_it_works: "Labour markets reward skills that solve problems; research reduces guesswork; experience validates fit; networks and credentials open doors; periodic review keeps the path aligned with reality.",
      examples: "Shadowing a nurse before studying nursing; building side projects before a software career; taking a short course to test interest in data science.",
      guidance: "Salaries and job outlooks are dynamic information — verify current data from official statistics and credible industry sources.",
    },
    misconceptions: [
      { misconception: "You must choose one career for life.", correction: "Career changes are common and often valuable." },
      { misconception: "The highest-paying path is the best path.", correction: "Fit, growth and working conditions matter as much as pay." },
    ],
    relatedIds: ["ins.write-cv", "ins.interview", "cmp.degree-vs-apprenticeship", "car.software-engineer"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 14. LAW & GOVERNMENT EDUCATION
 * ════════════════════════════════════════════════════════════════════════════ */

const LAW_RECORDS: KnowledgeRecord[] = [
  law({
    id: "law.courts",
    title: "Courts and the judiciary",
    aliases: ["how courts work", "judicial system", "rule of law"],
    question: "How do courts work?",
    categoryIds: ["cat-17", "cat-18"],
    summary: "Courts resolve disputes and interpret the law through an independent judiciary — applying laws to facts in open, reasoned proceedings.",
    sections: {
      definition: "The institutions of the judiciary that hear and decide legal disputes — criminal, civil and constitutional — applying the law to the facts of each case through fair procedures.",
      simple: "Courts are where disagreements about the law get decided fairly: a judge (and sometimes a jury) hears both sides and applies the rules.",
      detailed: "Courts typically form a hierarchy: trial courts hear evidence first; appellate courts review legal errors; supreme or constitutional courts sit at the top. Criminal courts decide whether the state has proved guilt; civil courts resolve disputes between people and organizations; constitutional courts review laws against the constitution. Independence — judges not subject to political pressure — is the cornerstone; fair process includes notice, evidence, representation and appeal.",
      history: "Formal courts date to ancient civilizations (Egypt, Mesopotamia, Rome); the common-law tradition (judge-made precedent) grew in England, the civil-law tradition from Roman law in continental Europe; both spread worldwide.",
      how_it_works: "A case is filed; parties exchange pleadings and evidence; a hearing or trial examines evidence and arguments; the judge (or jury) decides; the loser can appeal on legal grounds; higher courts set precedents that bind future cases.",
      examples: "A criminal trial for theft; a civil suit over a broken contract; a constitutional challenge to a law; small-claims courts for everyday disputes.",
      guidance: "Court procedures and laws differ by jurisdiction; for a specific case, consult a qualified lawyer — this is education, not legal advice.",
    },
    misconceptions: [
      { misconception: "Judges make up the law freely.", correction: "They decide according to law, precedent and procedure — within a framework of accountability." },
      { misconception: "Going to court is the only way to resolve disputes.", correction: "Negotiation, mediation and arbitration resolve most disputes without trial." },
    ],
    relatedIds: ["con.constitution", "disc.law", "car.lawyer", "law.contracts"],
    sources: [SRC_BRITANNICA],
  }),
  law({
    id: "law.elections",
    title: "Elections and electoral systems",
    aliases: ["voting systems", "how elections work"],
    question: "How do elections work?",
    categoryIds: ["cat-18", "cat-19"],
    summary: "Elections translate votes into power through rules — who may vote, how votes are cast and counted, and how seats are allocated — and credible elections require independent administration.",
    sections: {
      definition: "The formal process by which citizens choose representatives: voter registration, campaigning, voting (by ballot, machine or mail), counting, verification and the peaceful transfer of power.",
      simple: "Elections are how citizens choose their leaders: people vote, votes are counted honestly, and the winner takes office — and can be replaced next time.",
      detailed: "Electoral systems differ: first-past-the-post (winner in each constituency), proportional representation (seats match vote shares), mixed systems, and ranked-choice variants. Key elements: an independent electoral commission, voter rolls, secret ballots, transparent counting, observation, and dispute mechanisms. Credibility depends on the perception of fairness across parties — which is why electoral integrity is a field of study and practice.",
      history: "Modern elections grew with representative government: expanding suffrage in the 19th–20th centuries, secret ballots, and independent commissions; technology (electronic voting, biometric registers) now shapes practice everywhere.",
      how_it_works: "The electoral law defines the system; the commission registers voters and candidates; campaigning happens under rules; voting day proceeds; results are counted publicly and certified; disputes go to courts; winners take office on the prescribed date.",
      examples: "Presidential elections, parliamentary elections, local elections and referendums — each with its own rules.",
      guidance: "Specific electoral rules and dates are dynamic information — verify with the official electoral commission.",
    },
    misconceptions: [
      { misconception: "The candidate with the most total votes always wins.", correction: "In some systems (e.g. first-past-the-post), seat allocation can differ from the national vote share." },
      { misconception: "Electronic voting is automatically fraudulent.", correction: "Technology can improve integrity or undermine it — the safeguards around it decide." },
    ],
    relatedIds: ["why.elections", "con.democracy", "con.government"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
  law({
    id: "law.contracts",
    title: "Contracts",
    aliases: ["agreements", "contract law"],
    question: "What is a contract?",
    categoryIds: ["cat-17", "cat-09"],
    summary: "A contract is a legally enforceable agreement between parties — formed by offer, acceptance and consideration — setting out what each side promises.",
    sections: {
      definition: "A legally binding agreement between two or more parties, formed through offer, acceptance and consideration (something of value exchanged), which courts will enforce.",
      simple: "A contract is a promise the law will keep: 'I give you this, you give me that' — written down or sometimes just agreed.",
      detailed: "Formation requires: offer, acceptance, consideration, capacity (adults of sound mind) and lawful purpose. Terms may be express or implied; some contracts must be written (land, marriage, large guarantees). Breach gives the injured party remedies — damages, performance or cancellation. Standard-form contracts (terms and conditions) are binding when accepted, which is why reading them matters. Unfair terms and duress can make clauses unenforceable.",
      history: "Contract law descends from Roman law, the lex mercatoria of medieval trade, and the common law of England; modern consumer-protection law limits the harshest terms.",
      how_it_works: "Parties negotiate terms; an offer is accepted; the agreement is recorded (or implied by conduct); each side performs its obligations; if one fails, the other can sue for remedies; courts interpret and enforce per the law.",
      examples: "A rental agreement; an employment offer letter; a sale of goods; a service agreement between a client and a freelancer.",
      guidance: "Contract law varies by country, and specific documents need qualified legal review — this is education, not legal advice.",
    },
    misconceptions: [
      { misconception: "An agreement is only binding if written.", correction: "Many contracts are oral and binding; writing is required only for certain types." },
      { misconception: "Signing means you must accept everything.", correction: "Unfair, illegal or unconscionable terms can be unenforceable — but litigation is costly." },
    ],
    relatedIds: ["law.courts", "disc.law", "car.lawyer", "ins.start-business"],
    sources: [SRC_BRITANNICA],
  }),
  law({
    id: "law.human-rights",
    title: "Human rights law",
    aliases: ["international human rights", "rights protections"],
    question: "What is human rights law?",
    categoryIds: ["cat-69", "cat-17", "cat-65"],
    summary: "Human rights law is the body of international and national law protecting fundamental rights — treaties, courts and institutions that hold states accountable.",
    sections: {
      definition: "The legal framework — international treaties, customary law, constitutions and statutes — that protects fundamental rights and provides remedies when they are violated.",
      simple: "Human rights law turns the idea of basic rights into real rules countries must follow, with courts and bodies that can step in when they don't.",
      detailed: "The Universal Declaration of Human Rights (1948) set the standard; binding treaties followed: the ICCPR and ICESCR (1966), and issue-specific conventions (racial discrimination, women, children, torture, disability). Regional systems (European, Inter-American, African) provide courts and commissions. National constitutions and bills of rights are enforced by domestic courts. Human rights law covers civil and political rights and economic, social and cultural rights — both are legally recognized.",
      history: "From the UDHR (1948) through decolonization and the fall of apartheid, human rights law expanded in scope and enforcement; the African Charter (1981) and African Court are key regional instruments.",
      how_it_works: "States ratify treaties and incorporate them into law; individuals and groups bring cases to courts and treaty bodies; UN mechanisms (Universal Periodic Review, special rapporteurs) monitor; violations carry legal and reputational consequences.",
      examples: "A person challenging unlawful detention; a commission investigating discrimination; a regional court ordering a state to change a law.",
      guidance: "Applying human rights law to a specific situation requires qualified legal advice.",
    },
    misconceptions: [
      { misconception: "Human rights are only civil and political.", correction: "Economic, social and cultural rights (health, education, work) are equally part of the law." },
      { misconception: "Human rights law is unenforceable.", correction: "Enforcement is imperfect but real: courts, treaty bodies and regional systems regularly order remedies." },
    ],
    relatedIds: ["con.human-rights", "when.udhr", "law.courts", "con.international-relations"],
    sources: [SRC_UN],
  }),
  law({
    id: "law.immigration",
    title: "Immigration law",
    aliases: ["visas and permits", "entry requirements"],
    question: "How does immigration law work?",
    categoryIds: ["cat-17", "cat-35", "cat-65"],
    summary: "Immigration law governs who may enter, stay, work and settle in a country — through visas, permits and statuses defined by each state's laws, which change frequently.",
    sections: {
      definition: "The body of national law regulating entry, stay, work, family reunification, asylum, citizenship and removal of non-citizens — each state sets its own rules.",
      simple: "Every country has its own rules about who can visit, work and live there — immigration law is those rules, and they change.",
      detailed: "Typical categories: visitor visas, student visas, work permits (often tied to an employer and skills), family reunification, investor routes, asylum/refugee status under international law, and permanent residence and citizenship. Requirements commonly include passports, proof of funds, health checks, no criminal record and biometrics. States enforce through border control and immigration agencies; violations can lead to refusal, detention or deportation. Asylum is governed by international law (the 1951 Refugee Convention) but procedures vary.",
      history: "Passports and border controls are largely 20th-century inventions; the Refugee Convention (1951) created the modern asylum framework; labour migration systems expanded and contracted with economies.",
      how_it_works: "Applicants apply to the relevant authority with evidence; the state decides per its rules and quotas; successful applicants receive status with conditions (work rights, time limits); renewal and settlement follow defined paths.",
      examples: "A student visa with work rights; a skilled-worker visa sponsored by an employer; family reunion; an asylum claim assessed under the refugee definition.",
      guidance: "Immigration rules change frequently and are strictly enforced — always verify with official government sources and consult qualified immigration professionals.",
    },
    misconceptions: [
      { misconception: "Asylum seekers are illegal immigrants.", correction: "Seeking asylum is a legal right under international law; the claim must be assessed." },
      { misconception: "A visa guarantees entry.", correction: "Border officials can still refuse entry if conditions are unmet." },
    ],
    relatedIds: ["trv.visas", "ins.travel-international", "why.migration", "con.human-rights"],
    sources: [SRC_UN],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 15. HEALTH & MEDICAL EDUCATION (educational only — never diagnosis)
 * ════════════════════════════════════════════════════════════════════════════ */

const HEALTH_RECORDS: KnowledgeRecord[] = [
  health({
    id: "hlth.body",
    title: "The human body",
    aliases: ["anatomy", "body systems", "physiology"],
    question: "How does the human body work?",
    categoryIds: ["cat-27", "cat-02"],
    summary: "The human body is a system of systems — skeleton, muscles, circulation, respiration, digestion, nerves and more — each with a job, all coordinated to keep you alive and healthy.",
    sections: {
      definition: "The human body comprises organ systems — skeletal, muscular, cardiovascular, respiratory, digestive, nervous, endocrine, immune, urinary and reproductive — working together to maintain life (homeostasis).",
      simple: "Your body is like a city with many departments: bones are the frame, the heart is the pump, lungs bring air, the brain is the control centre.",
      detailed: "The heart pumps blood carrying oxygen and nutrients; lungs exchange gases; the digestive system breaks food into fuel; the brain and nerves coordinate everything in milliseconds; hormones regulate growth, energy and mood; the immune system defends; kidneys filter; skin protects. These systems regulate temperature, water, salt and sugar within narrow ranges — homeostasis. Exercise, sleep and nutrition strengthen the systems; disease occurs when they break down.",
      history: "Anatomy was studied in ancient Egypt, Greece (Hippocrates, Galen), the Islamic world (Ibn al-Nafis) and Renaissance Europe (Vesalius); physiology advanced with circulation (Harvey, 1628) and modern imaging.",
      how_it_works: "Cells form tissues, tissues form organs, organs form systems; the nervous and endocrine systems coordinate them; feedback loops keep conditions stable; energy comes from food and oxygen.",
      examples: "Running raises heart rate and breathing to deliver oxygen to muscles; eating triggers digestion and insulin regulation; sleep repairs tissue.",
      guidance: "This is educational anatomy and physiology, not medical advice — for symptoms or health concerns, consult qualified health professionals.",
    },
    misconceptions: [
      { misconception: "The heart is on the left side.", correction: "It sits near the centre of the chest, tilted slightly left." },
      { misconception: "You only breathe with your lungs.", correction: "Breathing involves the diaphragm and chest muscles moving air; lungs exchange the gases." },
    ],
    relatedIds: ["disc.medicine", "hlth.nutrition", "hlth.fitness", "why.sleep"],
    sources: [SRC_WHO, SRC_BRITANNICA],
    professionalAssistanceNote: "Educational content only; consult qualified health professionals for personal health questions.",
  }),
  health({
    id: "hlth.nutrition",
    title: "Nutrition basics",
    aliases: ["healthy eating", "balanced diet", "food groups"],
    question: "What is healthy nutrition?",
    categoryIds: ["cat-28", "cat-27"],
    summary: "Healthy nutrition means eating a balanced variety of foods — vegetables, fruits, whole grains, protein and healthy fats — in amounts that match your energy needs.",
    sections: {
      definition: "The science of how food provides the nutrients the body needs — carbohydrates, proteins, fats, vitamins, minerals and water — and the practice of eating to support health.",
      simple: "Eat a mix of foods: plenty of vegetables and fruit, whole grains, some protein, and not too much sugar, salt or fatty junk.",
      detailed: "Nutrients have jobs: carbohydrates and fats supply energy; protein builds and repairs tissue; vitamins and minerals enable countless functions; water carries everything. Balanced dietary patterns — vegetables, fruits, whole grains, legumes, fish or lean protein, limited sugar, salt and processed foods — are consistently associated with lower risk of chronic disease. Portions matter as much as choices; needs vary by age, activity, health and pregnancy. Fad diets are usually not supported by evidence.",
      history: "Nutrition science grew from the discovery of vitamins (early 20th century) and essential nutrients; dietary guidelines emerged in the late 20th century and are regularly updated.",
      how_it_works: "Digestion breaks food into nutrients; the body absorbs them and uses them for energy, repair and regulation; excess energy is stored; deficiencies and excesses both cause disease over time.",
      examples: "A plate with vegetables, a whole-grain staple (rice, ugali, bread), and a protein source (beans, fish, chicken); drinking water instead of sugary drinks.",
      guidance: "Nutrition advice should come from qualified professionals for medical conditions — this is general education, not dietary advice.",
    },
    misconceptions: [
      { misconception: "Carbs are bad.", correction: "Whole-grain and starchy staples are essential energy sources; refined sugars and flours are the problem." },
      { misconception: "Supplements replace food.", correction: "Foods provide nutrients in complex, beneficial combinations; supplements help specific deficiencies." },
    ],
    relatedIds: ["hlth.body", "hlth.fitness", "day.cooking", "con.photosynthesis"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "Educational content only; consult qualified health professionals for personal dietary questions.",
  }),
  health({
    id: "hlth.fitness",
    title: "Fitness and exercise",
    aliases: ["exercise basics", "physical activity"],
    question: "How much exercise do I need?",
    categoryIds: ["cat-29", "cat-27"],
    summary: "Regular physical activity — roughly 150 minutes of moderate activity per week for adults — strengthens heart, muscles and mind; any amount beats none.",
    sections: {
      definition: "Physical activity performed to improve or maintain health and fitness: aerobic (heart and lungs), strength (muscles), flexibility and balance work.",
      simple: "Move your body most days: walking, running, dancing, sports, strength training. Any movement is better than none.",
      detailed: "World Health Organization guidance for adults: 150–300 minutes of moderate aerobic activity (or 75–150 minutes vigorous) per week, plus muscle-strengthening on two or more days. Benefits include lower risk of heart disease, diabetes, some cancers, depression and falls; better sleep and energy. Start gradually, choose activities you enjoy, and combine aerobic and strength work. Consistency beats intensity.",
      history: "Exercise as health practice is ancient (gymnastics in Greece, yoga in India, martial arts in China); its medical benefits were established by 20th-century epidemiology.",
      how_it_works: "Exercise stresses the body mildly and systematically; the body adapts — the heart pumps more efficiently, muscles grow stronger, bones denser, metabolism improves, mood-regulating chemicals increase.",
      examples: "Brisk walking, jogging, cycling, swimming, football, strength training with weights or bodyweight, and stretching.",
      guidance: "Anyone with health conditions should check with a qualified professional before starting intense programs — general guidance, not medical advice.",
    },
    misconceptions: [
      { misconception: "You must exercise hard to benefit.", correction: "Moderate activity — brisk walking — already delivers most health benefits." },
      { misconception: "Strength training is only for athletes.", correction: "Resistance training prevents muscle loss with age and supports every adult." },
    ],
    relatedIds: ["hlth.body", "hlth.nutrition", "why.sleep", "hlth.mental-health"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "Educational content only; consult qualified health professionals before starting intense programs if you have health conditions.",
  }),
  health({
    id: "hlth.mental-health",
    title: "Mental health",
    aliases: ["mental wellbeing", "stress", "depression", "anxiety"],
    question: "What is mental health?",
    categoryIds: ["cat-24", "cat-27"],
    summary: "Mental health is emotional, psychological and social wellbeing — it affects how we think, feel and act, and it can be protected and treated like physical health.",
    sections: {
      definition: "A state of wellbeing in which a person realizes their abilities, copes with normal stresses, works productively and contributes to community — a continuum, not a binary of 'healthy' or 'ill'.",
      simple: "Mental health is how your mind feels and copes. Everyone has mental health, it changes over time, and help exists when things get hard.",
      detailed: "Mental health conditions — depression, anxiety, bipolar disorder, schizophrenia, and many others — are real, common and treatable; about one in eight people worldwide lives with one. Protective factors: sleep, exercise, social connection, purpose, manageable stress. Treatments include psychological therapy (CBT and others), medication, social support and lifestyle change. Stigma prevents people from seeking help — the single biggest barrier — and recovery is the norm with support.",
      history: "Mental illness was long misunderstood as possession or character failure; the 20th century brought psychiatric medicine, psychotherapy and, recently, awareness and de-stigmatization campaigns.",
      how_it_works: "Mental health emerges from the interaction of biology (genes, brain chemistry), psychology (thought patterns, coping) and environment (stress, relationships, poverty, trauma); treatment targets these levels through therapy, medication and support.",
      examples: "Stress management, talking to a friend, therapy for depression, medication under medical supervision, workplace mental-health programmes.",
      guidance: "If you or someone you know is struggling, contact a qualified health professional or a crisis helpline — this is education, not diagnosis.",
    },
    misconceptions: [
      { misconception: "Mental illness is a sign of weakness.", correction: "It is a health condition like diabetes; it has biological and environmental causes and effective treatments." },
      { misconception: "Talking about it makes it worse.", correction: "Open conversation and support are protective; silence and stigma are the harm." },
    ],
    relatedIds: ["disc.psychology", "why.sleep", "rel.communication", "hlth.fitness"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "If you are in crisis, contact a qualified professional or a local crisis helpline immediately.",
  }),
  health({
    id: "hlth.first-aid",
    title: "First aid basics",
    aliases: ["emergency response", "basic life support"],
    question: "What are the basics of first aid?",
    categoryIds: ["cat-63", "cat-27"],
    summary: "First aid is the immediate help given before professional care arrives: check safety, assess the person, and act — for emergencies like unconsciousness, bleeding and choking, specific steps save lives.",
    sections: {
      definition: "Immediate assistance given to an injured or ill person before professional medical help arrives — preserving life, preventing worsening, and promoting recovery.",
      simple: "First aid is what you do right after an accident: stay calm, make sure it's safe, call for help, and do the basic things that keep someone alive until professionals come.",
      detailed: "The core sequence: check the scene is safe, check the person's response, call emergency services, and act. For an unresponsive person not breathing normally: start CPR (chest compressions) and use an AED if available. For severe bleeding: press firmly on the wound. For choking: back blows and abdominal thrusts. For burns: cool with running water. First aid courses (with hands-on practice) are the reliable way to learn — reading alone is not enough.",
      history: "Organized first aid grew from military medicine and the Red Cross movement in the 19th century; modern guidelines are set by bodies like the International Liaison Committee on Resuscitation and national organizations.",
      how_it_works: "In cardiac arrest, every minute without CPR reduces survival chances by about 10%; compressions keep blood flowing to brain and heart until defibrillation; stopping bleeding controls the most common preventable trauma death.",
      examples: "CPR on a collapsed person; pressure on a bleeding wound; the recovery position for an unconscious person who is breathing; cooling a burn.",
      guidance: "Emergency numbers and procedures differ by country; take a certified first-aid course — this summary is not a substitute for training.",
    },
    misconceptions: [
      { misconception: "CPR is only for trained professionals.", correction: "Bystander CPR dramatically improves survival; doing something is far better than nothing." },
      { misconception: "You can learn first aid from videos alone.", correction: "Hands-on practice with feedback is essential for skills like CPR." },
    ],
    relatedIds: ["hlth.body", "law.courts", "day.cleaning"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "In an emergency, call your local emergency number immediately; first aid is immediate care, not a substitute for professional treatment.",
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 17–23. CULTURE, TRAVEL, RELATIONSHIPS, ENTERTAINMENT, LANGUAGES,
 *         EVERYDAY LIFE, CREATIVE
 * ════════════════════════════════════════════════════════════════════════════ */

const CULTURE_RECORDS: KnowledgeRecord[] = [
  culture({
    id: "cult.diversity",
    title: "Cultural diversity",
    aliases: ["cultures of the world", "customs and traditions"],
    question: "What is cultural diversity?",
    categoryIds: ["cat-55", "cat-26", "cat-25"],
    summary: "Cultural diversity is the variety of human ways of life — languages, customs, values, arts and institutions — shaped by history and place, and never reducible to stereotypes.",
    sections: {
      definition: "The range of human cultures — the learned beliefs, customs, arts and institutions of communities — and the recognition that each culture is internally diverse and historically shaped.",
      simple: "People around the world live differently: different languages, foods, festivals and family ways. That variety is cultural diversity.",
      detailed: "Culture shapes how people communicate, eat, celebrate, marry, mourn, worship and organize work and family. It is learned and transmitted — through family, education, media and institutions — and it changes constantly through contact, migration and innovation. No culture is monolithic: individuals within a culture differ by age, gender, class, region and personal choice, and cultures borrow from each other. Respecting diversity means describing real practices accurately without stereotyping.",
      history: "Human cultures have always mixed — through trade, migration, empire and technology; globalization has intensified exchange while also raising questions about preserving heritage.",
      how_it_works: "Communities transmit culture across generations; contact produces borrowing and adaptation; institutions (schools, media, religion, law) carry and reshape it; individuals negotiate it in daily life.",
      examples: "The same meal, festival or family role is experienced differently across and within cultures; diaspora communities blend home and host cultures.",
      guidance: "When learning about a culture, prefer the accounts of its own members and treat generalizations as starting points, not verdicts.",
    },
    misconceptions: [
      { misconception: "Culture explains every individual's behaviour.", correction: "Individuals vary within every culture; culture is a pattern, not a rule for each person." },
      { misconception: "Cultures are fixed and pure.", correction: "All cultures change and borrow; 'authenticity' debates are themselves contested." },
    ],
    relatedIds: ["why.religions-differ", "cult.festivals", "lng.learning", "place.nigeria"],
    sources: [SRC_UN],
  }),
  culture({
    id: "cult.festivals",
    title: "Festivals and celebrations",
    aliases: ["cultural festivals", "holidays around the world"],
    question: "What are cultural festivals?",
    categoryIds: ["cat-55", "cat-56", "cat-57"],
    summary: "Festivals are shared celebrations that express a community's history, faith, seasons and values — from religious holidays to harvests, arts and sports.",
    sections: {
      definition: "Recurring public celebrations — religious, seasonal, historical or artistic — through which communities express identity, mark time and renew social bonds.",
      simple: "Festivals are big celebrations: times when communities come together to honour their history, faith or seasons with food, music and ritual.",
      detailed: "Festivals follow calendars — lunar (Eid, Diwali, Chinese New Year), solar (Christmas, New Year), seasonal (harvests), historical (independence days) or artistic (carnivals, film festivals). They combine ritual, food, music, dress and games, and they transmit culture joyfully across generations. The same festival is celebrated differently in different regions; festivals also evolve, and new ones emerge.",
      history: "Festivals are ancient — harvest rites, religious calendars and civic games (the Olympics of ancient Greece); industrialization and globalization added arts festivals and globalized celebrations.",
      how_it_works: "A community shares a calendar and meaning; preparation builds anticipation; the celebration gathers people in shared activity; afterwards the memory and identity persist.",
      examples: "Ramadan and Eid, Christmas and Easter, Diwali, Vesak, Hanukkah, harvest festivals, independence-day parades, Carnival in Brazil, and film and music festivals worldwide.",
      guidance: "Festival dates follow calendars that vary by year and community — verify current dates rather than assuming.",
    },
    misconceptions: [
      { misconception: "A festival means the same thing everywhere.", correction: "Meanings and practices vary by region, community and era." },
      { misconception: "Festivals are only religious.", correction: "Many are seasonal, historical, civic or artistic." },
    ],
    relatedIds: ["cult.diversity", "con.religion-diversity", "place.brazil"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.indigenous",
    title: "Indigenous cultures",
    aliases: ["indigenous peoples", "traditional cultures"],
    question: "What are indigenous cultures?",
    categoryIds: ["cat-26", "cat-55", "cat-69"],
    summary: "Indigenous peoples — hundreds of millions of people across every continent — carry distinct cultures, languages and knowledge systems tied to their ancestral lands.",
    sections: {
      definition: "The cultures of peoples who have inhabited their territories before colonization or the formation of modern states, and who maintain distinct identities, languages, institutions and relationships to land.",
      simple: "Indigenous peoples are communities with their own languages and ways of life connected to the lands their ancestors lived on for thousands of years.",
      detailed: "The UN estimates over 476 million Indigenous people across 90+ countries, speaking most of the world's languages. Their knowledge systems — medicine, agriculture, ecology — are increasingly recognized as valuable science. Indigenous peoples have faced displacement, assimilation and discrimination; international law (the UN Declaration on the Rights of Indigenous Peoples, 2007) affirms their rights to lands, cultures and self-determination. Every Indigenous culture is distinct; none is frozen in time.",
      history: "Colonization and nation-building dispossessed Indigenous peoples worldwide; the 20th century brought recognition movements; the UN Declaration (2007) marked a turning point in international recognition.",
      how_it_works: "Indigenous cultures transmit knowledge through language, ceremony, kinship and practice; legal recognition protects lands and rights; contemporary Indigenous communities blend tradition with modern life on their own terms.",
      examples: "Maasai communities in East Africa, Aboriginal peoples of Australia, Māori in New Zealand, First Nations in North America, the San in Southern Africa, and Amazonian peoples.",
      guidance: "Learn about specific Indigenous peoples from their own representatives and organizations; never generalize across peoples.",
    },
    misconceptions: [
      { misconception: "Indigenous peoples are relics of the past.", correction: "They are contemporary communities with living cultures, rights movements and modern members." },
      { misconception: "All Indigenous peoples are alike.", correction: "They are immensely diverse in language, economy, belief and history." },
    ],
    relatedIds: ["cult.diversity", "con.human-rights", "law.human-rights", "lng.learning"],
    sources: [SRC_UN],
  }),
];

const TRAVEL_RECORDS: KnowledgeRecord[] = [
  travel({
    id: "trv.visas",
    title: "Visas and entry requirements",
    aliases: ["visa requirements", "do i need a visa"],
    question: "How do visas and entry requirements work?",
    categoryIds: ["cat-35", "cat-17"],
    summary: "A visa is a country's permission to enter for a purpose and period — requirements depend on your nationality, destination and trip purpose, and they change frequently.",
    sections: {
      definition: "Official authorization to enter a country for a specified purpose (tourism, work, study) and duration — granted by the destination country, with requirements varying by nationality.",
      simple: "A visa is permission from a country to enter it. Whether you need one depends on your passport and where you're going — and the rules change.",
      detailed: "Visa categories: tourist, business, student, work, transit, and visa-free or visa-on-arrival arrangements. Requirements typically include a valid passport (with validity margins), application forms, fees, proof of funds, travel bookings and sometimes biometrics and interviews. Some countries use e-visas; others require applications at embassies; regional blocs (e.g. ECOWAS, Schengen) allow free movement between members. Entry is always at the border officer's discretion even with a visa.",
      history: "Visas became standard with passport controls in the 20th century; regional free-movement agreements and e-visas have expanded access in recent decades.",
      how_it_works: "You apply to the destination's authority with evidence of purpose and ties; they decide per nationality-based rules; if granted, you travel and present the visa at the border, where conditions are re-checked.",
      examples: "A Nigerian citizen applying for a UK visitor visa; an East African travelling within the EAC visa-free; an e-visa for Kenya or India.",
      guidance: "Visa rules change frequently and are nationality-specific — always verify with the destination's official immigration website before planning.",
    },
    misconceptions: [
      { misconception: "A visa guarantees entry.", correction: "Border officials verify conditions at arrival and can refuse entry." },
      { misconception: "Visa rules are the same for every nationality.", correction: "They are among the most nationality-specific rules in the world." },
    ],
    relatedIds: ["law.immigration", "ins.travel-international", "trv.safety"],
    sources: [SRC_UN],
  }),
  travel({
    id: "trv.safety",
    title: "Travel safety",
    aliases: ["safe travel", "travel advice"],
    question: "How do I stay safe while travelling?",
    categoryIds: ["cat-35", "cat-62", "cat-63"],
    summary: "Travel safety means preparing before you go — research, insurance, documents, health — and staying aware while away: belongings, surroundings, transport and emergencies.",
    sections: {
      definition: "The practices that reduce risk while travelling: pre-trip research and preparation (official advice, insurance, documents, health), situational awareness, secure handling of belongings and money, and knowing emergency procedures.",
      simple: "Before you travel, learn about the place, get insurance, and keep copies of documents. While there: watch your belongings, stay aware, and know the emergency numbers.",
      detailed: "Before departure: check official travel advice for the destination, arrange insurance covering health and evacuation, register with your embassy if recommended, and prepare copies of documents. On the ground: keep valuables divided and hidden, avoid flashing cash, use registered transport, be cautious at night, keep family informed of plans, and know local emergency numbers and the nearest embassy or hospital. Health preparation includes vaccinations and medication for the destination.",
      history: "Travel-safety advice professionalized with the growth of mass tourism and the internet; governments now publish official destination assessments that travellers can check.",
      how_it_works: "Risk is destination- and behaviour-specific: preparation reduces exposure (insurance covers the unaffordable), awareness reduces opportunity for crime, and knowing emergency routes shortens response when something goes wrong.",
      examples: "Copying your passport and keeping the original in the hotel safe; using official taxis or ride apps; checking a country's official travel advisory before booking.",
      guidance: "Security situations change quickly — official advisories are dynamic information; check them shortly before and during travel.",
    },
    misconceptions: [
      { misconception: "Travel insurance is unnecessary for short trips.", correction: "Medical emergencies abroad can cost more than a home; insurance is cheap relative to the risk." },
      { misconception: "Tourist areas are always safe.", correction: "Crime often concentrates exactly where tourists gather; awareness matters everywhere." },
    ],
    relatedIds: ["ins.travel-international", "trv.visas", "bus.insurance"],
    sources: [SRC_UN],
  }),
];

const RELATIONSHIP_RECORDS: KnowledgeRecord[] = [
  relationship({
    id: "rel.communication",
    title: "Communication skills",
    aliases: ["effective communication", "listening", "assertiveness"],
    question: "How can I communicate better?",
    categoryIds: ["cat-32", "cat-31", "cat-88"],
    summary: "Good communication is listening before speaking, saying what you mean clearly and respectfully, and checking understanding — in personal, work and digital settings.",
    sections: {
      definition: "The skills of exchanging meaning effectively: active listening, clear and respectful expression, reading non-verbal signals, adapting to the audience, and managing difficult conversations.",
      simple: "Talk and listen well: pay attention when others speak, say what you mean kindly, and check that you understood each other.",
      detailed: "Key practices: listen to understand rather than reply (paraphrase, ask questions); use 'I' statements ('I feel… when…') instead of blame; be specific rather than vague; match the channel to the message (important or sensitive topics deserve care, not just text); notice tone, body language and timing; and in conflict, address the issue, not the person. Communication is a skill — it improves with deliberate practice.",
      history: "Rhetoric was studied in ancient Greece and Rome; modern communication research grew with psychology and media studies in the 20th century; digital communication added new contexts and pitfalls.",
      how_it_works: "A message is encoded by the sender, transmitted, and decoded by the receiver; noise (emotion, distraction, ambiguity) distorts it; feedback and checking close the loop — most misunderstandings come from skipped checking.",
      examples: "Paraphrasing a colleague's point before answering; giving feedback privately and specifically; pausing before replying in anger; asking clarifying questions in meetings.",
      guidance: "Communication norms vary across cultures and contexts — adapt, and when in doubt, ask.",
    },
    misconceptions: [
      { misconception: "Communication means talking well.", correction: "Listening is more than half of it; most failures are listening failures." },
      { misconception: "More words mean better communication.", correction: "Clarity beats volume; short, specific messages travel furthest." },
    ],
    relatedIds: ["rel.conflict", "disc.psychology", "cre.public-speaking", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.conflict",
    title: "Conflict resolution",
    aliases: ["resolving disagreements", "difficult conversations"],
    question: "How do I resolve a conflict?",
    categoryIds: ["cat-31", "cat-32", "cat-88"],
    summary: "Conflicts resolve best when people separate the person from the problem, listen to each other's real interests, and work toward solutions both can accept.",
    sections: {
      definition: "The process of addressing disagreements constructively: understanding each side's interests, communicating without escalation, and finding agreements that respect both parties.",
      simple: "When people disagree, the way out is usually: calm down, listen to each other's side, find what each really needs, and agree on something workable.",
      detailed: "A constructive sequence: manage emotions first (pause, breathe); state your perspective without blame; genuinely listen to the other's perspective; identify underlying interests (what each side actually needs); brainstorm options; agree on a concrete plan; follow up. In workplaces, mediation and clear procedures help; in personal relationships, repair attempts and timing matter — avoid resolving conflicts when exhausted or angry.",
      history: "Conflict resolution draws on negotiation theory (Fisher & Ury's 'Getting to Yes'), mediation practice, and psychology research on relationships (Gottman's work on repair).",
      how_it_works: "Conflict escalates through threats and misperception; de-escalation comes from listening, validation and reframing the problem as shared; agreements hold when they meet real interests and include concrete follow-up.",
      examples: "Two colleagues negotiating task ownership; partners discussing finances calmly; a customer complaint resolved by acknowledging the issue and offering a fix.",
      guidance: "Every situation differs — there is no single solution for every conflict; seek mediation or professional help when conflicts are severe or recurring.",
    },
    misconceptions: [
      { misconception: "Winning the argument is the goal.", correction: "Resolution that leaves one side crushed tends to resurface; sustainable agreements respect both." },
      { misconception: "Avoiding conflict is the same as resolving it.", correction: "Avoidance usually lets the issue grow; timely, respectful confrontation is healthier." },
    ],
    relatedIds: ["rel.communication", "disc.psychology", "hlth.mental-health"],
    sources: [SRC_BRITANNICA],
  }),
];

const ENTERTAINMENT_RECORDS: KnowledgeRecord[] = [
  entertainment({
    id: "ent.film",
    title: "Film and cinema",
    aliases: ["movies", "cinema history"],
    question: "How does film work?",
    categoryIds: ["cat-52", "cat-50", "cat-55"],
    summary: "Film is a visual art and industry: moving images arranged through direction, cinematography, editing and sound to tell stories — with global centres from Hollywood to Nollywood.",
    sections: {
      definition: "The art and industry of motion pictures: stories and ideas expressed through moving images, sound and editing, produced and distributed through studios, cinemas and streaming platforms.",
      simple: "Movies are stories told with moving pictures: people act scenes, cameras film them, and editors join the shots into a story with music and sound.",
      detailed: "A film is built in stages: development (script), pre-production (planning), production (shooting), post-production (editing, sound, effects) and distribution. Key crafts: directing, cinematography, editing, production design, scoring. Genres — drama, comedy, action, documentary, animation — shape audience expectations. Cinema industries worldwide (Hollywood, Bollywood, Nollywood, European and Asian cinemas) each have distinct traditions and global reach.",
      history: "Motion pictures began in the 1890s; narrative cinema matured in the 1910s–1920s; sound (1927) and colour transformed it; television and streaming reshaped distribution; Nollywood became one of the world's largest film industries by output.",
      how_it_works: "Cameras capture many shots; editors select and order them into scenes; sound and music are mixed; the finished film is distributed to cinemas, platforms or broadcasters; audiences watch, critics review, and awards mark excellence.",
      examples: "A studio blockbuster, an independent drama, a documentary, a Nollywood production, a film festival screening.",
      guidance: "Current releases, rankings and awards change constantly — they are dynamic information to verify.",
    },
    misconceptions: [
      { misconception: "Films are shot in story order.", correction: "Scenes are shot out of order for efficiency; editing assembles the story." },
      { misconception: "Box office equals quality.", correction: "Commercial success and artistic quality are different measures." },
    ],
    relatedIds: ["cult.festivals", "cre.writing", "place.india", "place.nigeria"],
    sources: [SRC_BRITANNICA],
  }),
];

const LANGUAGE_RECORDS: KnowledgeRecord[] = [
  language({
    id: "lng.learning",
    title: "Learning a language",
    aliases: ["language acquisition", "learn a language"],
    question: "How do I learn a language?",
    categoryIds: ["cat-54", "cat-01"],
    summary: "Learning a language takes consistent practice across four skills — listening, speaking, reading, writing — with input you understand and regular use with real people.",
    sections: {
      definition: "The process of acquiring a new language: building vocabulary and grammar through comprehensible input, practice in the four skills, and sustained daily contact with the language.",
      simple: "To learn a language: use it every day — listen, speak, read a little, and don't be afraid of mistakes.",
      detailed: "Research supports: input you mostly understand (comprehensible input) at the right difficulty; spaced repetition for vocabulary; regular speaking practice even with errors; immersion where possible (media, apps, exchange partners); and motivation that lasts. Realistic progress: months to basic conversation, years to fluency. The bottleneck is almost always consistent practice, not talent.",
      history: "Language teaching evolved from grammar-translation to communicative methods; technology added apps, AI tutors and online exchange in the 2010s–2020s.",
      how_it_works: "The brain builds language from repeated exposure and use: comprehension comes first, production follows; memory strengthens with spaced retrieval; errors fade with corrective feedback and more input.",
      examples: "30 minutes daily with an app plus weekly conversation practice; watching shows with subtitles; keeping a journal in the language.",
      guidance: "Choose a language for your own goals; the best method is the one you sustain.",
    },
    misconceptions: [
      { misconception: "Adults cannot learn languages well.", correction: "Adults learn differently (faster analytically, with accents) but can reach high proficiency." },
      { misconception: "Fluency comes quickly.", correction: "Basic communication in months, fluency in years — sustained practice is the real variable." },
    ],
    relatedIds: ["cult.diversity", "lng.translation", "con.education-path"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.translation",
    title: "Translation and meaning",
    aliases: ["translating", "interpretation"],
    question: "How does translation work?",
    categoryIds: ["cat-54", "cat-32"],
    summary: "Translation conveys meaning between languages — but meaning lives in culture, idiom and context, so good translation preserves intent, not just words.",
    sections: {
      definition: "Rendering a text's meaning from one language into another — balancing fidelity to the original with naturalness in the target language, and preserving cultural meaning where possible.",
      simple: "Translation is saying in another language what someone said — not word for word, but so it means the same thing and sounds natural.",
      detailed: "Literal translation fails on idioms, humour, formality and cultural references ('it's raining cats and dogs' means nothing translated word-for-word). Translators work with register, context and audience; interpreting (oral translation) adds real-time pressure. Machine translation (Google Translate, LLMs) is fast and useful for gist, but struggles with nuance, accuracy and culture — human review matters for anything important: contracts, medical texts, literature.",
      history: "Translation is as old as writing — the Rosetta Stone, the Septuagint, medieval translators of science and scripture; machine translation began in the 1950s and reached wide use with neural systems in the 2010s.",
      how_it_works: "The translator (human or model) decodes meaning, context and intent, then re-encodes them in the target language's natural forms — choosing equivalents, not replacements.",
      examples: "Localizing an app for a new market; translating a contract with legal review; subtitling a film; machine translation for a quick email.",
      guidance: "For legal, medical or official documents, use qualified human translators — machine output must be verified.",
    },
    misconceptions: [
      { misconception: "Word-for-word translation is accurate.", correction: "It produces nonsense for idioms and cultural references; meaning is translated, not words." },
      { misconception: "Machine translation is now perfect.", correction: "It is impressive but still errs on nuance, context and rare languages." },
    ],
    relatedIds: ["lng.learning", "cult.diversity", "con.artificial-intelligence"],
    sources: [SRC_BRITANNICA],
  }),
];

const EVERYDAY_RECORDS: KnowledgeRecord[] = [
  everyday({
    id: "day.cooking",
    title: "Cooking basics",
    aliases: ["cooking for beginners", "meal preparation"],
    question: "How do I learn to cook?",
    categoryIds: ["cat-57", "cat-90", "cat-28"],
    summary: "Cooking is a learnable skill: master a few core techniques — boiling, frying, roasting, knife skills — and build meals from simple, fresh ingredients.",
    sections: {
      definition: "The practical skill of preparing food safely and enjoyably: basic techniques (boiling, frying, roasting, steaming), knife skills, seasoning, food safety and meal planning.",
      simple: "Cooking is easy to start: learn a few basics — boil rice, fry eggs, roast vegetables — and grow from there.",
      detailed: "Start with a handful of reliable recipes and repeat them until comfortable; master basic techniques that transfer across recipes; taste as you cook and season gradually; keep a clean workspace and follow food-safety basics (handwashing, separating raw meat, cooking to safe temperatures, refrigerating leftovers). Meal planning reduces cost and waste. Cooking at home is generally cheaper and healthier than eating out.",
      history: "Cooking with fire is among humanity's oldest technologies; cuisines evolved from local ingredients and techniques; modern cooking media (shows, apps) have made home cooking widely accessible.",
      how_it_works: "Heat transforms food — browning builds flavour, heat kills pathogens, starches and proteins change structure; seasoning balances salt, acid, fat and heat; practice builds the judgment recipes can't fully convey.",
      examples: "Boiling pasta, frying an egg, roasting vegetables, making a simple stew or stir-fry, baking bread.",
      guidance: "Follow food-safety rules from official health agencies; dietary needs are personal — consult professionals for medical conditions.",
    },
    misconceptions: [
      { misconception: "Cooking requires talent.", correction: "It is a skill of practice and basic technique, learnable by anyone." },
      { misconception: "Recipes must be followed exactly.", correction: "Recipes are starting points; tasting and adjusting is how cooks actually work." },
    ],
    relatedIds: ["hlth.nutrition", "day.cleaning", "bus.budgeting"],
    sources: [SRC_WHO],
  }),
  everyday({
    id: "day.cleaning",
    title: "Cleaning and home maintenance",
    aliases: ["household cleaning", "home upkeep"],
    question: "How do I keep a home clean and maintained?",
    categoryIds: ["cat-60", "cat-90"],
    summary: "A clean, maintained home comes from routines, not marathons: daily tidying, weekly cleaning, seasonal deep tasks — and prompt repairs that prevent bigger costs.",
    sections: {
      definition: "The routines and practices of household upkeep: daily tidying, weekly cleaning (kitchen, bathroom, floors), laundry, waste handling, and preventive maintenance of appliances, plumbing and safety devices.",
      simple: "Keep your home livable with small regular habits: tidy daily, clean weekly, fix small problems quickly before they become big ones.",
      detailed: "An effective system: daily 10–15 minutes of tidying; weekly tasks (kitchen surfaces, bathroom, floors, laundry, bins); monthly (fridge, oven, filters); seasonal (windows, gutters, deep cleaning); and immediate attention to leaks, damp and damage — small problems become expensive ones. Test smoke and carbon-monoxide alarms regularly. Use cleaning products safely (never mix bleach with ammonia).",
      history: "Home cleaning followed changing ideas of hygiene: the germ theory (19th century) transformed it from appearance to health; modern appliances and products industrialized it.",
      how_it_works: "Routines prevent buildup — small regular effort beats occasional deep cleans; cleaning works by removing dirt (detergents), killing germs (disinfectants where needed) and controlling moisture (mould prevention); maintenance extends the life of everything in the home.",
      examples: "Wiping kitchen counters daily; cleaning the bathroom weekly; testing alarms monthly; unclogging drains early; sealing gaps before winter.",
      guidance: "For electrical, gas or structural work, use qualified professionals — safety comes first.",
    },
    misconceptions: [
      { misconception: "Cleaners must be harsh to work.", correction: "Most daily cleaning needs only soap, water and friction; disinfectants are for specific surfaces and situations." },
      { misconception: "A spotless home is a healthy home.", correction: "Reasonable cleanliness supports health; obsessive cleaning can waste time, money and health." },
    ],
    relatedIds: ["day.cooking", "bus.budgeting", "hlth.body"],
    sources: [SRC_WHO],
  }),
  everyday({
    id: "day.time-management",
    title: "Time management",
    aliases: ["productivity", "getting things done"],
    question: "How do I manage my time better?",
    categoryIds: ["cat-88", "cat-89", "cat-90"],
    summary: "Time management is deciding what matters and protecting time for it: prioritize, plan in advance, work in focused blocks, and manage attention, not just hours.",
    sections: {
      definition: "The practices of using time intentionally: setting priorities, planning (daily/weekly), focusing on one task at a time, limiting distractions, and reviewing how time is actually spent.",
      simple: "Manage time by deciding what's important first, planning your day ahead, and focusing on one thing at a time.",
      detailed: "Proven practices: write down priorities (a short list beats a long one); plan the day the night before; use focused work blocks (e.g. 25–50 minutes) with breaks; batch similar tasks; say no to what doesn't matter; track time occasionally to see where it really goes; and protect sleep — it is the foundation of productivity. Attention is the scarce resource: notifications, multitasking and context-switching are its main thieves.",
      history: "Time management industrialized with scientific management (early 1900s), matured with self-management literature (Covey, Allen's GTD), and now addresses digital distraction.",
      how_it_works: "Priorities set the plan; planning moves decisions to calm moments instead of reactive ones; focused blocks let deep work happen; reviews create feedback so the system improves.",
      examples: "Planning tomorrow's top three tasks tonight; putting the phone away during work blocks; a weekly review of what worked; saying no to a low-value meeting.",
      guidance: "Systems vary by person — use what you sustain; perfectionism about the system itself is a common trap.",
    },
    misconceptions: [
      { misconception: "Being busy means being productive.", correction: "Busyness and progress differ; priorities and outcomes are the measure." },
      { misconception: "Multitasking doubles your output.", correction: "Task-switching costs time and quality; focus beats multitasking." },
    ],
    relatedIds: ["ins.study-effectively", "bus.budgeting", "hlth.mental-health"],
    sources: [SRC_BRITANNICA],
  }),
];

const CREATIVE_RECORDS: KnowledgeRecord[] = [
  creative({
    id: "cre.writing",
    title: "Writing and storytelling",
    aliases: ["creative writing", "storytelling", "how to write"],
    question: "How do I become a better writer?",
    categoryIds: ["cat-53", "cat-50", "cat-32"],
    summary: "Writing improves through reading, writing regularly, revising ruthlessly and knowing your audience — storytelling adds character, conflict and structure.",
    sections: {
      definition: "The craft of expressing ideas in written form: clarity, structure and voice for non-fiction; character, conflict and narrative for stories — improved by practice and revision.",
      simple: "Write a little every day, read a lot, and rewrite your work — that's how writing gets better.",
      detailed: "For clarity: know your audience, say one main thing, use plain words, cut ruthlessly, and read aloud to hear problems. For stories: characters who want something, conflict that blocks them, and a structure (beginning, middle, end) that resolves the tension; show, don't only tell; revise — first drafts are for getting it down, later drafts for making it good. Feedback from readers is essential.",
      history: "Writing systems enabled literature; rhetoric and storytelling traditions span every culture; the internet opened publishing to everyone, raising the value of craft.",
      how_it_works: "Reading builds a mental model of good writing; regular writing builds fluency; revision builds quality; feedback corrects blind spots; each cycle compounds.",
      examples: "A blog post for a professional audience; a short story with a clear arc; an essay with a strong thesis; rewriting a draft based on feedback.",
      guidance: "AI tools can draft and edit, but your voice, judgment and verification remain the writer's job.",
    },
    misconceptions: [
      { misconception: "Great writers write perfect first drafts.", correction: "Virtually all writers revise; drafting and editing are separate skills." },
      { misconception: "Writer's block is a permanent condition.", correction: "It is usually a signal to lower the bar, change method or get input — not a fate." },
    ],
    relatedIds: ["lng.learning", "ent.film", "cre.public-speaking", "rel.communication"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.public-speaking",
    title: "Public speaking",
    aliases: ["presentations", "speaking skills"],
    question: "How do I speak in public with confidence?",
    categoryIds: ["cat-32", "cat-50", "cat-88"],
    summary: "Public speaking improves with preparation, structure and practice: know your audience and message, organize simply, rehearse aloud, and treat nerves as normal.",
    sections: {
      definition: "The skill of addressing an audience clearly and persuasively: structuring a message, delivering with voice and body language, managing nerves, and adapting to the room.",
      simple: "To speak well: know what you want to say, keep it simple, practise out loud, and remember that nervousness is normal.",
      detailed: "Preparation: define the one message you want remembered; structure (opening, three points, close); know the audience and room; prepare notes, not scripts (scripts sound read). Delivery: slow down, breathe, make eye contact, use pauses; movement and slides support, not replace, your words. Nerves are physiological and normal — reframe them as energy; rehearsal reduces them more than anything.",
      history: "Rhetoric was a core discipline in ancient Greece and Rome; modern public speaking training grew with business, politics and media.",
      how_it_works: "Audiences remember structure and stories, not details; confidence comes from preparation and repeated exposure; feedback after each talk improves the next.",
      examples: "A project update at work, a wedding toast, a class presentation, a pitch to investors.",
      guidance: "Join a speaking club or class for structured practice — reading about speaking helps far less than doing it.",
    },
    misconceptions: [
      { misconception: "Great speakers never feel nervous.", correction: "Most do; they manage it through preparation and practice." },
      { misconception: "More slides make a better talk.", correction: "Fewer, simpler slides usually make a stronger talk." },
    ],
    relatedIds: ["cre.writing", "rel.communication", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 8. "WHICH IS BETTER?" KNOWLEDGE — comparisons with criteria, no winners
 * ════════════════════════════════════════════════════════════════════════════ */

const COMPARISON_RECORDS: KnowledgeRecord[] = [
  comparison({
    id: "cmp.python-vs-js",
    title: "Python vs JavaScript",
    aliases: ["python or javascript", "which language first"],
    question: "Which is better: Python or JavaScript?",
    categoryIds: ["cat-06", "cat-07", "cat-01"],
    summary: "Python and JavaScript are both excellent first languages with different strengths: Python leads in data, AI and automation; JavaScript rules the web. The right choice depends on your goal.",
    sections: {
      definition: "A criteria-based comparison of the two most popular beginner languages: Python (general-purpose, data/AI strength) and JavaScript (the language of the web).",
      simple: "Both are great first languages: choose Python for data and AI, JavaScript for websites and apps.",
      detailed: "Python: clean syntax, huge ecosystem for data science, machine learning and automation, widely used in research and backend. JavaScript: runs in every browser, essential for web and mobile web apps, with Node.js for backend. Both have strong communities and jobs; learning one makes the second far easier.",
      criteria: "Ease for beginners (Python 85, JavaScript 75); Web development (Python 40, JavaScript 95); Data science and AI (Python 95, JavaScript 30); Automation and scripting (Python 90, JavaScript 60); Job market breadth (Python 80, JavaScript 85); Performance (Python 45, JavaScript 65).",
      guidance: "If you want websites → JavaScript; data/AI → Python; unsure → Python, then JavaScript.",
      examples: "Python: data analysis, machine learning, scripts. JavaScript: interactive websites, web apps, mobile web.",
    },
    misconceptions: [
      { misconception: "One language is objectively better.", correction: "They serve different ecosystems; the best choice depends on the goal." },
      { misconception: "Learning one means learning the other is wasted.", correction: "Concepts transfer; most developers eventually use both." },
    ],
    relatedIds: ["tech.programming", "ins.learn-programming", "disc.computer-science", "cmp.item.python", "cmp.item.javascript"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.degree-vs-apprenticeship",
    title: "University degree vs apprenticeship",
    aliases: ["college or apprenticeship", "university vs vocational"],
    question: "Which is better: university or apprenticeship?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "University and apprenticeships are different routes with different costs, timelines and outcomes — the right choice depends on the field, your goals and your situation.",
    sections: {
      definition: "A criteria-based comparison of the two main post-secondary routes: university degrees (broad, theory-based, credential-led) vs apprenticeships (paid, work-based, occupation-specific).",
      simple: "University gives you a degree and broad knowledge; apprenticeships pay you to learn a specific job. Both can lead to great careers.",
      detailed: "University: 3–4+ years, tuition costs, broad education, access to professions requiring degrees (medicine, law, engineering), research and networks. Apprenticeships: paid while learning, direct work experience, occupation-specific, strong for trades, IT and many technical roles, no tuition debt. Many fields (nursing, IT, engineering) now offer both routes. Outcomes depend on the field and individual more than the route itself.",
      criteria: "Cost (degree 30, apprenticeship 85 — paid training); Time to earnings (degree 35, apprenticeship 90); Breadth of education (degree 90, apprenticeship 50); Career ceiling in regulated professions (degree 90, apprenticeship 40); Hands-on experience (degree 40, apprenticeship 95); Flexibility to change fields (degree 80, apprenticeship 55).",
      guidance: "Regulated professions (medicine, law, engineering) require degrees; many technical and trade careers reward apprenticeships; hybrid paths exist.",
      examples: "Medicine or law → university route; plumbing, electrical, many IT roles → apprenticeship route; nursing and engineering → both.",
    },
    misconceptions: [
      { misconception: "University is always the better investment.", correction: "For many occupations, apprenticeships offer faster, debt-free paths to solid careers." },
      { misconception: "Apprenticeships are only for trades.", correction: "They now cover IT, finance, engineering and more." },
    ],
    relatedIds: ["con.university", "con.education-path", "car.career-paths", "cmp.item.degree", "cmp.item.apprenticeship"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.rent-vs-buy",
    title: "Renting vs buying a home",
    aliases: ["rent or buy", "buying a house"],
    question: "Which is better: renting or buying a home?",
    categoryIds: ["cat-37", "cat-11", "cat-90"],
    summary: "Renting and buying both have real advantages — flexibility vs ownership — and the better choice depends on your finances, plans and local market.",
    sections: {
      definition: "A criteria-based comparison of renting (paying for housing with no ownership) vs buying (a mortgage builds equity but ties you down with costs and risk).",
      simple: "Renting is flexible and simple; buying builds ownership but costs a lot upfront and ties you down. It depends on your situation.",
      detailed: "Buying builds equity, offers stability and freedom to modify, and can hedge rent rises — but requires a down payment, carries maintenance, taxes, insurance and interest, ties up capital, and is hard to exit quickly. Renting requires little capital, offers flexibility and predictable short-term costs, but builds no equity and exposes you to rent increases and moves. The decision depends on how long you'll stay, local prices and rents, and your financial stability.",
      criteria: "Upfront cost (rent 80, buy 20); Monthly flexibility (rent 85, buy 50); Building wealth (rent 20, buy 85); Freedom to modify (rent 15, buy 90); Mobility (rent 90, buy 25); Long-term stability (rent 35, buy 85).",
      guidance: "General rule of thumb: the longer you plan to stay, the more buying makes sense — but run the real numbers for your market.",
      examples: "A young professional likely to move for work → rent; a family settled for 5+ years with savings → consider buying.",
    },
    misconceptions: [
      { misconception: "Rent is always wasted money.", correction: "Interest, taxes, maintenance and lost flexibility are also 'wasted' costs of owning; rent buys mobility." },
      { misconception: "Buying always makes you richer.", correction: "Prices can fall, and costs are high; many owners would have been better off renting." },
    ],
    relatedIds: ["con.mortgage", "bus.budgeting", "bus.saving", "cmp.item.renting", "cmp.item.buying"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.cloud-platforms",
    title: "Cloud platforms compared",
    aliases: ["aws vs azure vs gcp", "which cloud"],
    question: "Which cloud platform should I use?",
    categoryIds: ["cat-76", "cat-04"],
    summary: "AWS, Azure and Google Cloud all offer reliable, mature services — the right choice depends on your workloads, existing stack, skills and budget, and the market changes constantly.",
    sections: {
      definition: "A criteria-based comparison of the major public cloud providers — noting that capabilities, pricing and market positions are dynamic and must be verified at query time.",
      simple: "The big clouds are all good. Choose based on what your team already knows, what you're building, and price.",
      detailed: "Amazon Web Services: largest catalog and market share, first mover. Microsoft Azure: deep integration with Microsoft tools (Windows, Office, .NET), strong in enterprise. Google Cloud: leadership in data, AI and Kubernetes. All three offer compute, storage, databases and AI services with global regions. Pricing is complex and changes; lock-in and skills availability matter as much as features.",
      criteria: "Service catalog breadth (AWS 90, Azure 85, GCP 70); Enterprise Microsoft integration (AWS 30, Azure 95, GCP 35); Data & AI services (AWS 75, Azure 70, GCP 90); Open-source/Kubernetes friendliness (AWS 75, Azure 65, GCP 85); Global regions (AWS 95, Azure 90, GCP 80).",
      guidance: "No universal winner: match the platform to your workloads, skills and compliance needs — and verify current pricing and features.",
      examples: "A .NET enterprise → Azure; a data/AI startup → GCP; a broad startup needing everything → AWS.",
    },
    misconceptions: [
      { misconception: "The biggest cloud is always the best.", correction: "Market share is not a verdict for your workload; fit and cost matter more." },
      { misconception: "Cloud prices are stable and simple.", correction: "Pricing is complex, negotiable and changes frequently — verify current terms." },
    ],
    relatedIds: ["con.cloud-computing", "tech.databases", "cmp.python-vs-js", "cmp.item.aws", "cmp.item.azure", "cmp.item.gcp"],
    sources: [SRC_BRITANNICA],
    verificationNote: "Provider capabilities, pricing and market shares are dynamic information; the criteria here are educational, not current market data.",
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * Comparison ITEM records — the objects of "which is better?" questions.
 * Each carries structured labeled criteria (values 0–100, curated, with
 * notes); the comparison records above explain the trade-offs in text.
 * The compare engine scores only labeled criteria and never invents values.
 * ════════════════════════════════════════════════════════════════════════════ */

const COMPARISON_ITEM_RECORDS: KnowledgeRecord[] = [
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.python",
    title: "Python (comparison profile)",
    aliases: ["python language"],
    question: "What are Python's strengths?",
    categoryIds: ["cat-06", "cat-07"],
    summary: "Python's comparison profile: a general-purpose language with exceptional strength in data science, AI and automation, and an easy learning curve.",
    sections: {
      definition: "Comparison profile for Python used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "ease_learning", label: "Ease of learning for beginners", value: 85, note: "Simple, readable syntax; huge beginner ecosystem." },
      { key: "web", label: "Web development", value: 40, note: "Possible (Django, Flask) but not its main strength." },
      { key: "data_ai", label: "Data science and AI", value: 95, note: "The dominant ecosystem (pandas, PyTorch, scikit-learn)." },
      { key: "automation", label: "Automation and scripting", value: 90, note: "Excellent for scripts, glue code and tooling." },
      { key: "jobs", label: "Job market breadth", value: 80, note: "Broad demand across data, backend and AI roles." },
      { key: "performance", label: "Runtime performance", value: 45, note: "Interpreted; slower than compiled languages for compute." },
    ],
    relatedIds: ["cmp.python-vs-js", "cmp.item.javascript"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.javascript",
    title: "JavaScript (comparison profile)",
    aliases: ["js language"],
    question: "What are JavaScript's strengths?",
    categoryIds: ["cat-06", "cat-07"],
    summary: "JavaScript's comparison profile: the language of the web, unmatched for browser and web-app development, with strong backend reach through Node.js.",
    sections: {
      definition: "Comparison profile for JavaScript used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "ease_learning", label: "Ease of learning for beginners", value: 75, note: "Approachable, but async quirks take time." },
      { key: "web", label: "Web development", value: 95, note: "The only language that runs natively in every browser." },
      { key: "data_ai", label: "Data science and AI", value: 30, note: "Growing (TensorFlow.js) but far behind Python." },
      { key: "automation", label: "Automation and scripting", value: 60, note: "Possible via Node.js; Python is more common." },
      { key: "jobs", label: "Job market breadth", value: 85, note: "Enormous demand across frontend and full-stack roles." },
      { key: "performance", label: "Runtime performance", value: 65, note: "JIT-compiled; fast for most web workloads." },
    ],
    relatedIds: ["cmp.python-vs-js", "cmp.item.python"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation", "education"], {
    id: "cmp.item.degree",
    title: "University degree (comparison profile)",
    aliases: ["university route"],
    question: "What are a university degree's strengths?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Comparison profile for the university route: broad education, access to regulated professions, and strong signalling — at significant cost and time.",
    sections: {
      definition: "Comparison profile for a university degree used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "cost", label: "Cost to the student", value: 30, note: "Tuition and foregone earnings; varies hugely by country." },
      { key: "time_to_earnings", label: "Time to earnings", value: 35, note: "3–4+ years before full-time earnings." },
      { key: "breadth", label: "Breadth of education", value: 90, note: "Broad theory, electives and research exposure." },
      { key: "regulated_ceiling", label: "Access to regulated professions", value: 90, note: "Medicine, law and engineering require degrees." },
      { key: "hands_on", label: "Hands-on work experience", value: 40, note: "Depends on internships; not guaranteed." },
      { key: "flexibility", label: "Flexibility to change fields", value: 80, note: "A degree signals transferable skills." },
    ],
    relatedIds: ["cmp.degree-vs-apprenticeship", "cmp.item.apprenticeship", "con.university"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation", "education"], {
    id: "cmp.item.apprenticeship",
    title: "Apprenticeship (comparison profile)",
    aliases: ["vocational route", "work-based training"],
    question: "What are an apprenticeship's strengths?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Comparison profile for the apprenticeship route: paid training, direct work experience and no tuition debt — focused on a specific occupation.",
    sections: {
      definition: "Comparison profile for an apprenticeship used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "cost", label: "Cost to the student", value: 85, note: "Paid training; usually no tuition debt." },
      { key: "time_to_earnings", label: "Time to earnings", value: 90, note: "Earns while learning from the start." },
      { key: "breadth", label: "Breadth of education", value: 50, note: "Focused on one occupation's skills." },
      { key: "regulated_ceiling", label: "Access to regulated professions", value: 40, note: "Not accepted for degree-only professions." },
      { key: "hands_on", label: "Hands-on work experience", value: 95, note: "Real work from day one." },
      { key: "flexibility", label: "Flexibility to change fields", value: 55, note: "Skills are occupation-specific." },
    ],
    relatedIds: ["cmp.degree-vs-apprenticeship", "cmp.item.degree", "con.education-path"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.renting",
    title: "Renting (comparison profile)",
    aliases: ["renting a home"],
    question: "What are the strengths of renting?",
    categoryIds: ["cat-37", "cat-11"],
    summary: "Comparison profile for renting: low upfront cost, mobility and predictable short-term costs — without building equity.",
    sections: {
      definition: "Comparison profile for renting used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "upfront", label: "Upfront cost", value: 80, note: "Deposit and first month, far below a down payment." },
      { key: "monthly_flex", label: "Monthly cost flexibility", value: 85, note: "Move or downsize without selling costs." },
      { key: "wealth", label: "Building wealth", value: 20, note: "No equity accumulation." },
      { key: "modify", label: "Freedom to modify the home", value: 15, note: "Landlord permission required." },
      { key: "mobility", label: "Mobility", value: 90, note: "Easy to relocate for work or life." },
      { key: "stability", label: "Long-term stability", value: 35, note: "Rents rise; leases end; landlords can sell." },
    ],
    relatedIds: ["cmp.rent-vs-buy", "cmp.item.buying"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.buying",
    title: "Buying a home (comparison profile)",
    aliases: ["home ownership"],
    question: "What are the strengths of buying a home?",
    categoryIds: ["cat-37", "cat-11"],
    summary: "Comparison profile for home ownership: equity, stability and freedom — at high upfront cost and low mobility.",
    sections: {
      definition: "Comparison profile for buying used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "upfront", label: "Upfront cost", value: 20, note: "Down payment, fees, taxes, moving." },
      { key: "monthly_flex", label: "Monthly cost flexibility", value: 50, note: "Fixed mortgage payments, but maintenance and taxes." },
      { key: "wealth", label: "Building wealth", value: 85, note: "Equity grows as the mortgage is repaid." },
      { key: "modify", label: "Freedom to modify the home", value: 90, note: "Own the space; renovate freely." },
      { key: "mobility", label: "Mobility", value: 25, note: "Selling takes time and costs money." },
      { key: "stability", label: "Long-term stability", value: 85, note: "No landlord; stable housing costs over time." },
    ],
    relatedIds: ["cmp.rent-vs-buy", "cmp.item.renting", "con.mortgage"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.aws",
    title: "AWS (comparison profile)",
    aliases: ["amazon web services"],
    question: "What are AWS's strengths?",
    categoryIds: ["cat-76", "cat-04"],
    summary: "Comparison profile for Amazon Web Services: the largest service catalog and global footprint; strengths and market data change over time.",
    sections: {
      definition: "Comparison profile for AWS used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data; verify current capabilities at query time.",
    },
    criteria: [
      { key: "catalog", label: "Service catalog breadth", value: 90, note: "Largest catalog and longest track record." },
      { key: "ms_integration", label: "Microsoft/enterprise integration", value: 30, note: "Not its focus; Azure leads here." },
      { key: "data_ai", label: "Data and AI services", value: 75, note: "Strong and broad; GCP leads in some areas." },
      { key: "oss", label: "Open-source/Kubernetes friendliness", value: 75, note: "Mature but historically more proprietary-leaning." },
      { key: "regions", label: "Global regions", value: 95, note: "Most regions and availability zones." },
    ],
    relatedIds: ["cmp.cloud-platforms", "cmp.item.azure", "cmp.item.gcp", "con.cloud-computing"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.azure",
    title: "Azure (comparison profile)",
    aliases: ["microsoft azure"],
    question: "What are Azure's strengths?",
    categoryIds: ["cat-76", "cat-04"],
    summary: "Comparison profile for Microsoft Azure: deep integration with Microsoft enterprise tooling; strengths and market data change over time.",
    sections: {
      definition: "Comparison profile for Azure used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data; verify current capabilities at query time.",
    },
    criteria: [
      { key: "catalog", label: "Service catalog breadth", value: 85, note: "Very broad; slightly behind AWS." },
      { key: "ms_integration", label: "Microsoft/enterprise integration", value: 95, note: "Native fit with Windows, Office, .NET, Active Directory." },
      { key: "data_ai", label: "Data and AI services", value: 70, note: "Strong, especially with OpenAI partnership." },
      { key: "oss", label: "Open-source/Kubernetes friendliness", value: 65, note: "Supports OSS well but Microsoft-centric by default." },
      { key: "regions", label: "Global regions", value: 90, note: "Broad global footprint." },
    ],
    relatedIds: ["cmp.cloud-platforms", "cmp.item.aws", "cmp.item.gcp"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.gcp",
    title: "Google Cloud (comparison profile)",
    aliases: ["gcp", "google cloud platform"],
    question: "What are Google Cloud's strengths?",
    categoryIds: ["cat-76", "cat-04"],
    summary: "Comparison profile for Google Cloud: leadership in data, AI and Kubernetes; strengths and market data change over time.",
    sections: {
      definition: "Comparison profile for Google Cloud used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data; verify current capabilities at query time.",
    },
    criteria: [
      { key: "catalog", label: "Service catalog breadth", value: 70, note: "Smaller catalog than AWS/Azure but focused." },
      { key: "ms_integration", label: "Microsoft/enterprise integration", value: 35, note: "Not its strength." },
      { key: "data_ai", label: "Data and AI services", value: 90, note: "BigQuery, TensorFlow heritage and AI leadership." },
      { key: "oss", label: "Open-source/Kubernetes friendliness", value: 85, note: "Kubernetes was born at Google." },
      { key: "regions", label: "Global regions", value: 80, note: "Solid but fewer regions than AWS/Azure." },
    ],
    relatedIds: ["cmp.cloud-platforms", "cmp.item.aws", "cmp.item.azure"],
    sources: [SRC_BRITANNICA],
  }),
];

export const KNOWLEDGE_SEED_DOMAINS: KnowledgeRecord[] = [
  ...SUPPORT_CONCEPTS,
  ...DISCIPLINE_RECORDS,
  ...SCIENCE_FIELD_RECORDS,
  ...TECHNOLOGY_RECORDS,
  ...BUSINESS_RECORDS,
  ...CAREER_RECORDS,
  ...LAW_RECORDS,
  ...HEALTH_RECORDS,
  ...CULTURE_RECORDS,
  ...TRAVEL_RECORDS,
  ...RELATIONSHIP_RECORDS,
  ...ENTERTAINMENT_RECORDS,
  ...LANGUAGE_RECORDS,
  ...EVERYDAY_RECORDS,
  ...CREATIVE_RECORDS,
  ...COMPARISON_RECORDS,
  ...COMPARISON_ITEM_RECORDS,
];
