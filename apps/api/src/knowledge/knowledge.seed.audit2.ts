/**
 * Session 149 — Curated knowledge seed (audit closure): the final explicit
 * list items of the re-sent Session 140 specification that a fresh audit
 * still found unresolved. 13 records:
 *
 *   §6  Timeline — the remaining spec example questions:
 *       "When did this president take office?" (Nigeria becomes a republic,
 *       1963 — Azikiwe becomes first President), "When did this religion
 *       begin?" (the Christian movement, c. 33 CE), "When did this
 *       technology become popular?" (smartphones go mainstream, 2007).
 *   §7  Places — towns/villages where appropriate (Ogidi — an Igbo town and
 *       the birthplace of Chinua Achebe) and a landmark business district
 *       (Wall Street, New York City).
 *   §8  Comparisons — Countries (Nigeria vs Kenya) and Political systems
 *       (presidential vs parliamentary), each with labeled-criteria profiles
 *       and no universal winner. (Religions-as-comparison remains served by
 *       the `religions` module's compareReligions engine — see the session
 *       notes.)
 *   §9  Education — vocational education & training (certificates,
 *       diplomas, colleges) and postgraduate degrees (master's and doctoral
 *       — "What is a PhD?").
 */
import type { KnowledgeRecord } from "@windels/shared";
import { KNOWLEDGE_SEED_DATE } from "./knowledge.seed.js";
import type { KnowledgeReference } from "@windels/shared";

const SRC_BRITANNICA: KnowledgeReference = { label: "Encyclopaedia Britannica", url: "https://www.britannica.com" };
const SRC_UN: KnowledgeReference = { label: "United Nations", url: "https://www.un.org" };
const SRC_LIBRARY: KnowledgeReference = { label: "Library of Congress", url: "https://www.loc.gov" };

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
  criteria?: KnowledgeRecord["criteria"];
  intents?: KnowledgeRecord["intents"];
  relatedIds?: string[];
  sources?: KnowledgeReference[];
  confidence?: KnowledgeRecord["confidence"];
  verificationNote?: string;
}

function build(kind: KnowledgeRecord["kind"], tier: KnowledgeRecord["tier"], intents: KnowledgeRecord["intents"], input: SeedInput): KnowledgeRecord {
  return {
    id: input.id,
    kind,
    categoryIds: input.categoryIds,
    title: input.title,
    aliases: input.aliases ?? [],
    question: input.question,
    intents: input.intents ?? intents,
    tier,
    confidence: input.confidence ?? "well_supported",
    provenance: "catalog",
    summary: input.summary,
    sections: input.sections,
    examples: input.examples,
    misconceptions: input.misconceptions,
    criteria: input.criteria,
    relatedIds: input.relatedIds,
    sources: input.sources,
    lastUpdated: KNOWLEDGE_SEED_DATE,
    verificationNote: input.verificationNote,
  };
}

const timelineEvent = (input: SeedInput & { dateLabel: string; year: number | null; eraId: string }): KnowledgeRecord => {
  const record = build("timeline_event", "stable", ["history", "definition"], input);
  return { ...record, dateLabel: input.dateLabel, year: input.year, eraId: input.eraId };
};
const place = (input: SeedInput): KnowledgeRecord =>
  build("place", "stable", ["definition", "explanation", "history"], input);
const concept = (input: SeedInput): KnowledgeRecord =>
  build("concept", "stable", ["definition", "explanation", "history", "education"], input);
const discipline = (input: SeedInput): KnowledgeRecord =>
  build("discipline", "stable", ["education", "definition"], input);
const comparison = (input: SeedInput): KnowledgeRecord =>
  build("comparison", "stable", ["comparison", "recommendation"], input);

/* ════════════════════════════════════════════════════════════════════════════
 * §6 — TIMELINE — the remaining spec example questions
 * ════════════════════════════════════════════════════════════════════════════ */

const TIMELINE_RECORDS: KnowledgeRecord[] = [
  timelineEvent({
    id: "when.christianity",
    title: "Christianity begins in Roman Judea",
    aliases: ["origins of christianity", "when did christianity begin", "early christian movement"],
    question: "When did Christianity begin?",
    categoryIds: ["cat-20", "cat-22"],
    summary: "Christianity began in the 1st century CE in Roman Judea among the followers of Jesus of Nazareth; within a few centuries it spread across the Roman Empire and became a world religion.",
    sections: {
      definition: "The Christian movement emerged in the decades after the ministry and crucifixion of Jesus of Nazareth (c. 30–33 CE) in the Roman province of Judea, and developed into an organized religion through the 1st–4th centuries CE.",
      simple: "Christianity began about two thousand years ago in the land of Israel, when the followers of Jesus started telling people about his life and teachings.",
      detailed: "Jesus of Nazareth preached in Galilee and Judea in the late 20s–early 30s CE and was crucified under the Roman prefect Pontius Pilate (c. 30–33 CE). His followers — initially a Jewish sect — proclaimed him the risen Messiah, spread the movement through the Jewish diaspora and the Greco-Roman world (Paul of Tarsus's missions), and gradually separated from Judaism. By 313 CE the Edict of Milan legalized Christianity in the Roman Empire, and by the late 4th century it had become the empire's dominant religion.",
      history: "c. 30–33 CE: crucifixion of Jesus and the emergence of his followers. 1st century: the apostolic missions and the earliest New Testament writings. 2nd–3rd centuries: organized churches, bishops and creeds across the empire, despite periodic persecution. 313 CE: legalization under Constantine. 380 CE: the Edict of Thessalonica makes Christianity the imperial religion.",
      guidance: "Historians date the movement's origin to the 1st century CE; the exact year of Jesus's death is debated (most commonly 30 or 33 CE) — labels of faith and scholarship differ, and the religion's origins are described here as history.",
    },
    misconceptions: [
      { misconception: "Christianity began with the Edict of Milan in 313 CE.", correction: "The Edict legalized an existing religion; the movement began in the 1st century CE, nearly three centuries earlier." },
      { misconception: "Christianity began as a separate religion from Judaism.", correction: "It began as a Jewish movement; the separation from Judaism took shape gradually over the 1st–2nd centuries." },
    ],
    relatedIds: ["era-classical", "con.christianity", "when.hijra", "when.edict-milan"],
    sources: [SRC_BRITANNICA],
    dateLabel: "c. 33 CE",
    year: 33,
    eraId: "era-classical",
  }),
  timelineEvent({
    id: "when.nigeria-republic",
    title: "Nigeria becomes a republic — first President takes office",
    aliases: ["nigeria republic 1963", "azikiwe first president", "when did nigeria become a republic"],
    question: "When did Nigeria become a republic?",
    categoryIds: ["cat-20", "cat-19", "cat-18"],
    summary: "On 1 October 1963 Nigeria became a republic within the Commonwealth: Nnamdi Azikiwe, the last Governor-General, was sworn in as the country's first President — the answer to 'when did this president take office?'.",
    sections: {
      definition: "Nigeria became a republic on 1 October 1963, replacing the British monarch as head of state with a Nigerian President — Dr Nnamdi Azikiwe, previously Governor-General, became the first President.",
      simple: "In 1963, Nigeria changed from having the British Queen as head of state to having its own president — Dr Nnamdi Azikiwe became the first.",
      detailed: "At independence in 1960 Nigeria remained a constitutional monarchy with Queen Elizabeth II as head of state, represented by a Governor-General. A new republican constitution (adopted in 1963) made Nigeria a republic within the Commonwealth: the Governor-General, Dr Nnamdi Azikiwe, was sworn in as President on 1 October 1963. The presidency was largely ceremonial under the parliamentary constitution; executive power lay with the Prime Minister, Sir Abubakar Tafawa Balewa.",
      history: "1960: independence, Queen as head of state. 1963: republican constitution; Azikiwe becomes first President (1 October 1963). 1966: the first military coup ends the First Republic. 1979: a presidential system is introduced under the Second Republic.",
      guidance: "Office-holder details are stable history up to 1966; current office-holders are dynamic information served by the politics layer.",
    },
    misconceptions: [
      { misconception: "Nigeria became a republic at independence in 1960.", correction: "Independence in 1960 kept the Queen as head of state; the republic came with the 1963 constitution." },
      { misconception: "The first President was also the head of government.", correction: "Under the 1963 constitution the President was largely ceremonial; the Prime Minister ran the government." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "when.nigeria", "con.constitution"],
    sources: [SRC_BRITANNICA],
    dateLabel: "1963",
    year: 1963,
    eraId: "era-contemporary",
  }),
  timelineEvent({
    id: "when.smartphones",
    title: "Smartphones go mainstream",
    aliases: ["smartphone era", "iphone launch", "when were smartphones invented"],
    question: "When did smartphones become popular?",
    categoryIds: ["cat-20", "cat-04", "cat-74"],
    summary: "Touchscreen smartphones reached mass markets with the iPhone (2007) and Android (2008); by the early 2010s they had become the world's dominant personal computing device.",
    sections: {
      definition: "Smartphones — mobile phones with advanced computing, touchscreens and app ecosystems — went mainstream between 2007 and the early 2010s, when the iPhone and Android brought them to mass markets worldwide.",
      simple: "Phones that work like small computers became popular around 2007, when the first iPhone came out — and within a few years almost everyone had one.",
      detailed: "Earlier 'smart' phones existed — the IBM Simon (1992), BlackBerry, Nokia's Symbian devices — but they were niche or business tools. The iPhone (2007) popularized the modern touchscreen form with an app store (2008); Android (2008) brought the same model to every price level. By 2012–2015 smartphones outsold basic phones in most markets, and by the 2020s they are the primary computing device for most of humanity, reshaping communication, payments, media and work.",
      history: "1992: IBM Simon prototype; 2002–06: BlackBerry and Symbian business phones; 2007: iPhone; 2008: Android and the App Store; 2010s: global mass adoption, mobile money and app economies.",
      guidance: "Current market shares, models and prices are dynamic information; the adoption history is stable.",
    },
    misconceptions: [
      { misconception: "The iPhone was the first smartphone.", correction: "Earlier devices (IBM Simon 1992, BlackBerry, Nokia) existed; the iPhone popularized the modern touchscreen/app-store form." },
    ],
    relatedIds: ["era-contemporary", "tech.smartphones", "tech.operating-systems", "when.web"],
    sources: [SRC_BRITANNICA],
    dateLabel: "2007",
    year: 2007,
    eraId: "era-contemporary",
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §7 — PLACES — towns/villages (where appropriate) and a landmark business
 * district
 * ════════════════════════════════════════════════════════════════════════════ */

const PLACE_RECORDS: KnowledgeRecord[] = [
  place({
    id: "place.ogidi",
    title: "Ogidi",
    aliases: ["ogidi anambra", "achebe's hometown", "ogidi town"],
    question: "Where is Ogidi?",
    categoryIds: ["cat-21", "cat-55", "cat-53"],
    summary: "Ogidi is an Igbo town in Anambra State, southeastern Nigeria — the birthplace of the novelist Chinua Achebe, whose home community shaped 'Things Fall Apart'.",
    sections: {
      geography: "Ogidi is a town in Idemili North Local Government Area, Anambra State, in southeastern Nigeria — part of the Igbo heartland between Onitsha and Awka, in the lowland region east of the Niger River.",
      history: "Ogidi is an ancestral Igbo settlement whose history includes the precolonial village republics, colonial transformation and the Nigerian Civil War era. Chinua Achebe was born there on 16 November 1930; his experiences in Ogidi informed the world of Umuofia in Things Fall Apart (1958).",
      culture: "Ogidi remains a living Igbo community — with its own festivals, lineages (umunna) and traditions — illustrating how a specific town carries a culture that is itself internally diverse.",
      guidance: "Local government boundaries and population figures change; the town's geography and cultural significance are stable.",
    },
    misconceptions: [
      { misconception: "Umuofia in Things Fall Apart is a real place called Ogidi.", correction: "Umuofia is a fictional village; Achebe drew on the culture and community of places like Ogidi rather than describing one town literally." },
    ],
    relatedIds: ["who.achebe", "place.nigeria", "cult.regional-cultures", "ent.books"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.wall-street",
    title: "Wall Street",
    aliases: ["wall street nyc", "financial district new york"],
    question: "Where is Wall Street?",
    categoryIds: ["cat-21", "cat-11", "cat-09"],
    summary: "Wall Street is the financial district of Lower Manhattan, New York City — home of the New York Stock Exchange and a global byword for American finance and markets.",
    sections: {
      geography: "Wall Street runs eight blocks in Lower Manhattan, New York City, from Broadway to the East River, at the heart of the city's financial district. The New York Stock Exchange stands at 11 Wall Street; the Federal Reserve Bank of New York on Liberty Street nearby.",
      history: "The street's name dates to a 17th-century defensive wall built by Dutch settlers (Nieuw Amsterdam). Financial activity grew there from the late 18th century — the Buttonwood Agreement (1792), signed by stockbrokers under a buttonwood tree, is the NYSE's founding moment. The street became the center of American finance through the 19th–20th centuries.",
      economy: "'Wall Street' now works as a metonym for the US financial industry: investment banks, stock and bond markets, asset managers and financial regulation. Its markets set prices that ripple through the global economy.",
      guidance: "Current market data — prices, indices, firms — is dynamic information and must be verified from current sources.",
    },
    misconceptions: [
      { misconception: "Wall Street is only a stock exchange.", correction: "It is a district and a metonym for the whole financial industry; the NYSE is one building on it." },
    ],
    relatedIds: ["place.new-york-city", "con.banking", "bus.investment", "con.money"],
    sources: [SRC_BRITANNICA, SRC_LIBRARY],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §9 — EDUCATION — vocational education & training; postgraduate degrees
 * ════════════════════════════════════════════════════════════════════════════ */

const EDUCATION_RECORDS: KnowledgeRecord[] = [
  discipline({
    id: "disc.vocational-education",
    title: "Vocational education and training",
    aliases: ["vocational training", "technical education", "trade school", "certificates and diplomas", "vet"],
    question: "What is vocational education?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Vocational education teaches practical skills for specific occupations — trades, technicians, nursing, IT — through schools, colleges and apprenticeships, leading to certificates, diplomas and licences valued by industry.",
    sections: {
      definition: "Education that prepares people for specific occupations through practical, work-oriented training — in technical and trade schools, colleges, polytechnics and apprenticeships — leading to certificates, diplomas and occupational licences.",
      simple: "Vocational education is learning a specific job skill — like welding, catering, hairdressing, plumbing or computer repair — often with your hands, often with real work experience.",
      detailed: "Vocational education and training (VET) covers a vast range: construction trades, manufacturing, automotive, electrical, hospitality, health support, agriculture, IT and business administration. It is delivered in technical colleges and polytechnics, by employers, and through apprenticeships that combine paid work with study. It leads to certificates, diplomas and national qualifications that are often legally required to practice a trade — and it adapts quickly to labour-market needs.",
      learning_path: "FOUNDATIONS: basic workplace skills and trade awareness. INTERMEDIATE: certificates and diplomas with supervised practice. ADVANCED: advanced diplomas, technician and supervisory qualifications. RESEARCH: instructor/trainer pathways and technical pedagogy.",
      guidance: "Recognition of vocational qualifications differs by country and profession — check with the official regulator or industry body.",
    },
    misconceptions: [
      { misconception: "Vocational education is for people who cannot do academic work.", correction: "It is a different, valued pathway with strong employment outcomes; many VET graduates also hold academic qualifications." },
      { misconception: "Vocational qualifications have no progression.", correction: "Many systems allow diploma holders to progress to degrees and professional qualifications." },
    ],
    relatedIds: ["con.education-path", "cmp.degree-vs-apprenticeship", "cmp.university-vs-polytechnic", "car.certifications"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
  concept({
    id: "con.postgraduate",
    title: "Doctorate (PhD) and master's degrees",
    aliases: ["phd", "doctorate", "doctoral degree", "masters degree", "master's degree", "postgraduate study", "postgraduate degree", "graduate school"],
    question: "What is a PhD?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Master's and doctoral degrees are postgraduate qualifications earned after a bachelor's degree: master's deepen expertise in one to two years, while doctorates (PhD) require original research over several more years.",
    sections: {
      definition: "Postgraduate (graduate) degrees: master's degrees (typically 1–2 years of advanced coursework and a thesis or project after a bachelor's) and doctoral degrees (typically 3–6+ years of supervised original research culminating in a dissertation — the PhD is the most common).",
      simple: "After your first degree, you can study more: a master's adds deep knowledge in about one or two years; a PhD means doing new research for several years.",
      detailed: "Master's degrees (MA, MSc, MBA, MEng and others) deepen expertise, often combining coursework with a dissertation, and serve both professional advancement and preparation for research. Doctoral degrees — led by the PhD — require a significant original contribution to knowledge, examined through a thesis and viva, and typically prepare people for research and university careers, though doctorates now lead into many sectors. Entry requirements, funding and duration vary by country and field; some systems admit students directly to doctoral study without a master's.",
      history: "The medieval universities (Bologna, Paris, Oxford) awarded master's and doctoral degrees in the 12th–13th centuries; the modern research PhD developed in 19th-century Germany (Berlin) and spread worldwide.",
      how_it_works: "A master's runs through taught modules, assessments and a final dissertation or project. A doctorate runs through a research proposal, supervised original research, writing a thesis, and an examination (defence/viva) by experts — the degree is awarded for a genuine contribution to knowledge.",
      examples: "An MBA for management careers; an MSc in computer science for deeper technical roles; a PhD in history for a university research career; professional doctorates (EdD, DBA) for senior practitioners.",
      guidance: "Postgraduate paths differ by country and field; entry requirements, costs and funding vary — consult the institution's official information.",
    },
    misconceptions: [
      { misconception: "A PhD is just more coursework.", correction: "It is primarily years of supervised original research ending in a thesis examined by experts." },
      { misconception: "You must complete a master's before a PhD.", correction: "Many systems allow direct entry to doctoral study with a strong bachelor's degree." },
    ],
    relatedIds: ["con.university", "con.education-path", "disc.vocational-education", "car.skills-qualifications"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §8 — COMPARISONS — Countries and Political systems, with labeled-criteria
 * profiles and no universal winner. (Religions-as-comparison is served by
 * the `religions` module's 18-category compareReligions engine.)
 * ════════════════════════════════════════════════════════════════════════════ */

const COMPARISON_RECORDS: KnowledgeRecord[] = [
  comparison({
    id: "cmp.nigeria-vs-kenya",
    title: "Nigeria vs Kenya",
    aliases: ["nigeria or kenya", "comparing nigeria and kenya", "which country is better nigeria or kenya"],
    question: "How do Nigeria and Kenya compare?",
    categoryIds: ["cat-21", "cat-13", "cat-55"],
    summary: "Nigeria and Kenya are two of Africa's largest economies with different profiles — Nigeria leads in population, oil and scale; Kenya leads in services, tourism and East African integration — the better fit depends on what is being compared.",
    sections: {
      definition: "A criteria-based comparison of Nigeria (West Africa's largest economy and population, oil-dependent, home of Nollywood) and Kenya (East Africa's hub, services-led, 'Silicon Savannah' tech scene) — presented as education, not a verdict.",
      simple: "Nigeria is bigger in population and oil; Kenya is strong in services, tourism and technology. Which is 'better' depends on what you care about.",
      detailed: "Nigeria: roughly 200+ million people, the largest economy in Africa by GDP, major oil and gas production, Nollywood and Afrobeats cultural exports, and a large domestic market. Kenya: about 50+ million people, East Africa's financial and transport hub, strong tourism (safaris, coast), the 'Silicon Savannah' tech and mobile-money ecosystem, and a diversified services economy. Both are democracies with federal-ish/devolved structures, young populations and significant inequality and governance challenges — the comparison is about profiles, not superiority.",
      criteria: "Population and market size (Nigeria 95, Kenya 45); Economy size (Nigeria 90, Kenya 40); Natural resources (Nigeria 90, Kenya 40); Services, tech and innovation (Nigeria 55, Kenya 80); Tourism and infrastructure (Nigeria 40, Kenya 70); Regional integration (Nigeria 55, Kenya 65).",
      guidance: "Countries are not 'better' in the abstract — the right comparison depends on trade, travel, study, business or culture; figures here are educational profiles, and current statistics are dynamic.",
      examples: "Business seeking a huge domestic market → Nigeria; business seeking East African integration or tech services → Kenya; tourism and safaris → Kenya; Nollywood and Afrobeats markets → Nigeria.",
    },
    misconceptions: [
      { misconception: "Bigger population makes a country 'better'.", correction: "Population is one factor among many; welfare, opportunity and environment matter more than size." },
    ],
    relatedIds: ["place.nigeria", "place.kenya", "cmp.item.nigeria", "cmp.item.kenya", "disc.economics"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Economic statistics are dynamic and must be verified at query time; the comparison criteria are educational profiles, not current measurements.",
  }),
  comparison({
    id: "cmp.presidential-vs-parliamentary",
    title: "Presidential vs parliamentary systems",
    aliases: ["presidential or parliamentary", "which system of government is better", "comparing systems of government"],
    question: "Which is better: presidential or parliamentary government?",
    categoryIds: ["cat-19", "cat-18", "cat-17"],
    summary: "Presidential systems elect the executive separately from the legislature; parliamentary systems draw the executive from the legislature — each has documented trade-offs, and political science compares them without declaring a universal winner.",
    sections: {
      definition: "A criteria-based comparison of the two main democratic systems: presidential (a separately elected chief executive, as in the United States and Nigeria) vs parliamentary (an executive formed from and accountable to the legislature, as in the United Kingdom, India and South Africa).",
      simple: "In a presidential system, people elect the president directly; in a parliamentary system, people elect parliament and parliament chooses the government. Both work well in different countries.",
      detailed: "Presidential systems give the executive a direct mandate and a fixed term, with a clear separation of powers — but can produce gridlock between president and legislature, and removing a failed president is difficult. Parliamentary systems fuse executive and legislature, making governments quick to form and easy to remove by no-confidence votes — but can produce unstable coalitions, and the executive lacks a direct personal mandate. Political science (the 'perils of presidentialism' debate) finds both can be stable or unstable depending on the country's institutions, parties and society.",
      criteria: "Separation of powers (presidential 90, parliamentary 55); Direct mandate of the executive (presidential 85, parliamentary 60); Government stability over a fixed term (presidential 70, parliamentary 55); Legislative gridlock risk (presidential 40, parliamentary 75); Ease of removing a failed leader (presidential 30, parliamentary 75); Speed of legislation (presidential 50, parliamentary 75).",
      guidance: "Neither system is universally better; outcomes depend on the constitution, party system and society — this is academic comparison, not an endorsement of any system or country.",
      examples: "Presidential: the United States, Nigeria, Brazil. Parliamentary: the United Kingdom, India, South Africa, Germany (with nuances). Semi-presidential: France.",
    },
    misconceptions: [
      { misconception: "Presidential systems always have gridlock and parliamentary systems always have instability.", correction: "Outcomes depend on many institutional factors; both families include stable and unstable cases." },
    ],
    relatedIds: ["con.democracy", "con.government", "law.executive", "law.legislatures", "cmp.item.presidential-system", "cmp.item.parliamentary-system"],
    sources: [SRC_BRITANNICA],
  }),
];

/* Comparison item profiles. */

const COMPARISON_ITEM_RECORDS: KnowledgeRecord[] = [
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.nigeria",
    title: "Nigeria (comparison profile)",
    aliases: ["nigeria profile", "the federal republic of nigeria"],
    question: "What are Nigeria's comparison strengths?",
    categoryIds: ["cat-21", "cat-13"],
    summary: "Comparison profile for Nigeria: Africa's largest population and economy, rich in oil and gas, with a vast domestic market — and significant inequality and infrastructure challenges.",
    sections: {
      definition: "Comparison profile for Nigeria used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "population", label: "Population and market size", value: 95, note: "The largest population in Africa — a vast domestic market." },
      { key: "economy_size", label: "Economy size", value: 90, note: "The largest African economy by nominal GDP, with a large informal sector." },
      { key: "resources", label: "Natural resources", value: 90, note: "Major oil and gas producer; also minerals and agriculture." },
      { key: "services_tech", label: "Services, tech and innovation", value: 55, note: "Nollywood, Afrobeats, fintech growth — but infrastructure gaps." },
      { key: "tourism_infra", label: "Tourism and infrastructure", value: 40, note: "Rich attractions but infrastructure and security constraints." },
      { key: "regional_integration", label: "Regional integration", value: 55, note: "Dominant in ECOWAS and West African trade." },
    ],
    relatedIds: ["cmp.nigeria-vs-kenya", "cmp.item.kenya", "place.nigeria"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.kenya",
    title: "Kenya (comparison profile)",
    aliases: ["kenya profile", "republic of kenya"],
    question: "What are Kenya's comparison strengths?",
    categoryIds: ["cat-21", "cat-13"],
    summary: "Comparison profile for Kenya: East Africa's services, tourism and technology hub — the 'Silicon Savannah' — with a diversified economy and strong regional ties.",
    sections: {
      definition: "Comparison profile for Kenya used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "population", label: "Population and market size", value: 45, note: "About a quarter of Nigeria's population; a solid regional market." },
      { key: "economy_size", label: "Economy size", value: 40, note: "Smaller economy, but diversified and services-led." },
      { key: "resources", label: "Natural resources", value: 40, note: "Agriculture (tea, coffee, horticulture), tourism, emerging oil/gas and renewables." },
      { key: "services_tech", label: "Services, tech and innovation", value: 80, note: "The 'Silicon Savannah': mobile money (M-Pesa) and a strong tech scene." },
      { key: "tourism_infra", label: "Tourism and infrastructure", value: 70, note: "World-class safaris and coast; better-developed tourism infrastructure." },
      { key: "regional_integration", label: "Regional integration", value: 65, note: "Central to the East African Community and the port of Mombasa." },
    ],
    relatedIds: ["cmp.nigeria-vs-kenya", "cmp.item.nigeria", "place.kenya"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.presidential-system",
    title: "Presidential system (comparison profile)",
    aliases: ["presidential government", "presidential democracy"],
    question: "What are presidential systems' strengths?",
    categoryIds: ["cat-19", "cat-18"],
    summary: "Comparison profile for presidential systems: a directly elected executive with separation of powers — at the cost of possible gridlock and difficult removal of failed leaders.",
    sections: {
      definition: "Comparison profile for presidential systems used by the Which-is-better engine; scores are curated catalog labels describing institutional trade-offs, not endorsements.",
      criteria: "Scores reflect the curated catalog's educational assessment of institutional trade-offs.",
    },
    criteria: [
      { key: "separation", label: "Separation of powers", value: 90, note: "Executive and legislature elected separately and independent." },
      { key: "executive_mandate", label: "Direct mandate of the executive", value: 85, note: "The president is personally elected by the people." },
      { key: "government_stability", label: "Government stability", value: 70, note: "Fixed terms resist no-confidence votes." },
      { key: "gridlock_risk", label: "Legislative gridlock risk", value: 40, note: "Divided government can stall legislation." },
      { key: "leader_removal", label: "Ease of removing a failed leader", value: 30, note: "Impeachment is difficult and rare." },
      { key: "legislative_speed", label: "Speed of legislation", value: 50, note: "Executive and legislature can clash over the agenda." },
    ],
    relatedIds: ["cmp.presidential-vs-parliamentary", "cmp.item.parliamentary-system", "con.democracy"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.parliamentary-system",
    title: "Parliamentary system (comparison profile)",
    aliases: ["parliamentary government", "parliamentary democracy", "westminster system"],
    question: "What are parliamentary systems' strengths?",
    categoryIds: ["cat-19", "cat-18"],
    summary: "Comparison profile for parliamentary systems: an executive drawn from and accountable to the legislature — fast to form and remove, at the cost of fusion of powers and possible coalition instability.",
    sections: {
      definition: "Comparison profile for parliamentary systems used by the Which-is-better engine; scores are curated catalog labels describing institutional trade-offs, not endorsements.",
      criteria: "Scores reflect the curated catalog's educational assessment of institutional trade-offs.",
    },
    criteria: [
      { key: "separation", label: "Separation of powers", value: 55, note: "Executive and legislature are fused; the government sits in parliament." },
      { key: "executive_mandate", label: "Direct mandate of the executive", value: 60, note: "The executive is chosen by parliament, not directly by voters." },
      { key: "government_stability", label: "Government stability", value: 55, note: "Votes of no confidence can bring governments down." },
      { key: "gridlock_risk", label: "Legislative gridlock risk", value: 75, note: "The government usually commands a legislative majority." },
      { key: "leader_removal", label: "Ease of removing a failed leader", value: 75, note: "A no-confidence vote can replace the government quickly." },
      { key: "legislative_speed", label: "Speed of legislation", value: 75, note: "The government controls the legislative agenda." },
    ],
    relatedIds: ["cmp.presidential-vs-parliamentary", "cmp.item.presidential-system", "con.democracy"],
    sources: [SRC_BRITANNICA],
  }),
];

export const KNOWLEDGE_SEED_AUDIT2: KnowledgeRecord[] = [
  ...TIMELINE_RECORDS,
  ...PLACE_RECORDS,
  ...EDUCATION_RECORDS,
  ...COMPARISON_RECORDS,
  ...COMPARISON_ITEM_RECORDS,
];
