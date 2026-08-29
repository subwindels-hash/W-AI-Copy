/**
 * Session 147 — Curated knowledge seed (expansion): closes the remaining
 * gaps found by auditing the re-sent Session 140 specification against the
 * shipped catalog.
 *
 *   §5  People: political leaders, entrepreneurs, philosophers, artists,
 *       athletes.
 *   §7  Places: rivers, mountains, oceans, cities.
 *   §9  Disciplines: sociology, philosophy, history, geography, accounting,
 *       political science.
 *   §10 Science fields: oceanography, meteorology, microbiology, materials
 *       science.
 *   §11 Technology: smartphones, operating systems, networking, APIs,
 *       machine learning, robotics, semiconductors, telecommunications,
 *       DevOps.
 *   §12 Business: marketing, sales, accounting, investment, supply chains,
 *       management, leadership, customer service.
 *   §13 Careers: remote work, freelancing.
 *   §14 Law: criminal, civil, property, family, employment, business law,
 *       legislatures, executive government, international law.
 *   §15 Health: disease education, medications education, public health.
 *   §19 Relationships: negotiation, emotional intelligence.
 *   §20 Entertainment: music, games, sports.
 *   §21 Language: grammar, linguistics.
 *   §22 Everyday: shopping, basic technology, parenting education.
 *   §23 Creative: graphic design, photography, content creation.
 *   §18 Travel: accommodation, travel planning.
 *
 * All records are curated educational content with confidence labels and
 * sources; health and law records carry professional-assistance notes.
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
  relatedIds?: string[];
  sources?: KnowledgeReference[];
  confidence?: KnowledgeRecord["confidence"];
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
    relatedIds: input.relatedIds,
    sources: input.sources,
    lastUpdated: KNOWLEDGE_SEED_DATE,
    professionalAssistanceNote: input.professionalAssistanceNote,
  };
}

const person = (input: SeedInput): KnowledgeRecord =>
  build("person", "stable", ["definition", "research", "history"], input);
const place = (input: SeedInput): KnowledgeRecord =>
  build("place", "stable", ["definition", "explanation", "history"], input);
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
const travel = (input: SeedInput): KnowledgeRecord =>
  build("travel", "stable", ["instruction", "recommendation"], input);

/* ════════════════════════════════════════════════════════════════════════════
 * §5 — People
 * ════════════════════════════════════════════════════════════════════════════ */

const PERSON_RECORDS: KnowledgeRecord[] = [
  person({
    id: "who.nkrumah",
    title: "Kwame Nkrumah",
    aliases: ["Osagyefo"],
    question: "Who was Kwame Nkrumah?",
    categoryIds: ["cat-20", "cat-19", "cat-65"],
    summary: "Kwame Nkrumah (1909–1972) led Ghana to independence in 1957 — the first sub-Saharan African colony to become free — and became a founding voice of pan-Africanism.",
    sections: {
      biography: "Born in Nkroful, Gold Coast (now Ghana), Nkrumah studied in the United States and Britain, where anti-colonial thought shaped his politics. He returned to the Gold Coast in 1947, led the Convention People's Party, won the 1951 elections from prison, and became Prime Minister. Under his leadership the Gold Coast became independent Ghana on 6 March 1957. He was President from 1960 until his overthrow in 1966, and spent his later years promoting African unity until his death in 1972.",
      simple: "Kwame Nkrumah was the leader who made Ghana the first free country in sub-Saharan Africa, and he worked for the unity of all Africa.",
      achievements: "Led Ghana to independence (1957); a founder of the Organization of African Unity (1963); champion of pan-Africanism and African socialism; built Ghana's Volta River project and expanded education.",
      historical_context: "Nkrumah's rise coincided with the global wave of decolonization after World War II. His vision of continental government inspired independence movements across Africa, even as his domestic rule became increasingly one-party and his government was overthrown in 1966.",
      guidance: "Nkrumah is honoured across Africa; historians also study his authoritarian turn and economic difficulties as part of a full portrait.",
    },
    misconceptions: [
      { misconception: "Nkrumah freed Ghana alone.", correction: "Independence was won by a mass movement — the CPP, trade unions, ex-servicemen and many organizers — with Nkrumah as its most prominent leader." },
    ],
    relatedIds: ["who.mandela", "when.ghana", "con.democracy"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.churchill",
    title: "Winston Churchill",
    aliases: ["Sir Winston Churchill"],
    question: "Who was Winston Churchill?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "Winston Churchill (1874–1965) was Britain's Prime Minister during World War II (1940–45 and 1951–55), a wartime leader, writer and Nobel laureate.",
    sections: {
      biography: "Born into an aristocratic family, Churchill served as a soldier, journalist and MP across six decades. He held many offices before 1940 — including First Lord of the Admiralty in World War I — and became Prime Minister in May 1940 as Nazi Germany swept Europe. His speeches sustained British resistance through the Battle of Britain. He led the wartime coalition, helped shape the post-war order, lost the 1945 election, returned as Prime Minister 1951–55, and died in 1965.",
      simple: "Winston Churchill was the British leader during World War II, famous for refusing to surrender to Nazi Germany and for his great speeches.",
      achievements: "Wartime leadership (1940–45); the 'iron curtain' speech (1946) that framed the Cold War; Nobel Prize in Literature (1953); helped found the United Nations' framework.",
      historical_context: "Churchill's career spanned the British Empire's peak and decline. His wartime leadership is celebrated, while historians also debate his views on empire, race and India.",
      guidance: "Churchill's legacy is contested: he is a British national hero and also the subject of critical scholarship on empire and the 1943 Bengal famine.",
    },
    misconceptions: [
      { misconception: "Churchill won the 1945 election after the war.", correction: "He lost the July 1945 election to Clement Attlee's Labour Party." },
      { misconception: "Churchill was always anti-Nazi.", correction: "He had praised Mussolini in the 1920s and opposed appeasement only from the mid-1930s." },
    ],
    relatedIds: ["who.nkrumah", "place.united-kingdom", "why.elections"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.dangote",
    title: "Aliko Dangote",
    aliases: ["Dangote"],
    question: "Who is Aliko Dangote?",
    categoryIds: ["cat-09", "cat-10", "cat-33"],
    summary: "Aliko Dangote (born 1957) is a Nigerian businessman and philanthropist — Africa's richest person for over a decade — who built a manufacturing empire from cement to sugar and is building Africa's largest oil refinery.",
    sections: {
      biography: "Born in Kano, Nigeria, Dangote began trading commodities in 1977 with a loan from his uncle, importing rice, sugar and cement. He built the Dangote Group into West Africa's largest conglomerate, listing on the Nigerian Exchange, and launched the Dangote Refinery (2023–24) — a 650 000-barrel-per-day plant near Lagos, the largest single-train refinery in the world. He has pledged most of his wealth to philanthropy through the Dangote Foundation.",
      simple: "Aliko Dangote is a Nigerian business leader who built one of Africa's biggest companies, making cement, sugar and fuel, and is known as Africa's richest person.",
      achievements: "Founded and built the Dangote Group; Africa's largest cement producer; the Dangote Refinery; the Dangote Foundation's work in health, education and disaster relief.",
      historical_context: "Dangote's rise tracks Nigeria's post-1999 economic liberalization. His refinery marks an attempt to end Nigeria's dependence on imported fuel — a project of national significance and intense political attention.",
      guidance: "Business figures are best understood with their companies' financial disclosures and the documented policy debates around them.",
    },
    misconceptions: [
      { misconception: "Dangote inherited his wealth.", correction: "He built the group from commodity trading with a family loan; the Dangote Group is largely self-built." },
    ],
    relatedIds: ["ins.start-business", "bus.business-models", "place.nigeria", "bus.supply-chains"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.socrates",
    title: "Socrates",
    aliases: ["Socrates of Athens"],
    question: "Who was Socrates?",
    categoryIds: ["cat-23", "cat-20"],
    summary: "Socrates (c. 470–399 BCE) was an Athenian philosopher who questioned everything through dialogue and was sentenced to death — the foundational figure of Western philosophy.",
    sections: {
      biography: "Socrates lived in Athens, fought in its wars, and spent his life in public conversation, questioning Athenians about virtue, justice and knowledge. He wrote nothing; we know him through Plato, Xenophon and the comic playwright Aristophanes. His method — relentless questioning that exposes contradictions (the Socratic method) — made him both loved and resented. In 399 BCE he was tried for impiety and corrupting the youth, convicted, and executed by drinking hemlock.",
      simple: "Socrates was a philosopher in ancient Athens who taught by asking questions. He was sentenced to death for his ideas, and his student Plato wrote down his teachings.",
      achievements: "The Socratic method; the moral philosophy of 'the unexamined life'; teacher of Plato, who taught Aristotle — the chain that shaped Western thought.",
      historical_context: "Socrates lived through Athens' defeat in the Peloponnesian War and its recovery. His trial reflected Athenian democracy's fear of criticism during a fragile period.",
      guidance: "Because Socrates wrote nothing, everything known about him comes through others' accounts — historians treat the 'Socratic problem' of which portrait is accurate.",
    },
    misconceptions: [
      { misconception: "Socrates was executed for his philosophical views alone.", correction: "The trial was political: his circle included men who had collaborated with the Spartans and the oligarchic Thirty, and impiety charges were the legal vehicle." },
      { misconception: "Socrates taught a fixed doctrine.", correction: "He claimed to know nothing and taught through questioning rather than delivering answers." },
    ],
    relatedIds: ["disc.philosophy", "con.democracy", "who.confucius"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.confucius",
    title: "Confucius",
    aliases: ["Kongzi", "Kong Qiu"],
    question: "Who was Confucius?",
    categoryIds: ["cat-23", "cat-20", "cat-55"],
    summary: "Confucius (551–479 BCE) was a Chinese teacher and philosopher whose ideas on ethics, family and good government shaped East Asian civilization for over two millennia.",
    sections: {
      biography: "Born in the state of Lu (modern Shandong), Confucius (Kong Qiu) was a minor official who became a teacher of ethics and statecraft. He travelled among the warring Chinese states seeking a ruler who would follow his teachings, and returned to Lu to teach and edit the classics. His sayings were collected by students in the Analects. After his death his thought became the official ideology of imperial China from the Han dynasty onward.",
      simple: "Confucius was a Chinese teacher who taught how people should treat each other and how rulers should govern. His ideas shaped China, Korea, Japan and Vietnam.",
      achievements: "The Analects; the Five Classics' transmission; the ethical framework of ren (humaneness), li (ritual propriety) and xiao (filial piety); the world's most influential educational tradition.",
      historical_context: "Confucius lived in the chaotic Spring and Autumn period, when China's old order was collapsing — his teachings were a response to that disorder, emphasizing harmony through virtue.",
      guidance: "Whether Confucianism is a religion, a philosophy or a civic ethic is itself a scholarly debate; both the tradition and the debate are presented here.",
    },
    misconceptions: [
      { misconception: "Confucius founded a religion with temples and gods.", correction: "He was a moral and political teacher; the imperial cult built around him came centuries later." },
      { misconception: "Confucius supported unquestioning obedience.", correction: "He taught that subjects should remonstrate with unjust rulers — obedience was conditional on virtue." },
    ],
    relatedIds: ["disc.philosophy", "who.socrates", "why.religions-differ"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.fela-kuti",
    title: "Fela Kuti",
    aliases: ["Fela Anikulapo Kuti"],
    question: "Who was Fela Kuti?",
    categoryIds: ["cat-51", "cat-20", "cat-55"],
    summary: "Fela Kuti (1938–1997) was a Nigerian musician who created Afrobeat — a fusion of jazz, funk and West African rhythms — and used it as a weapon of political protest.",
    sections: {
      biography: "Born in Abeokuta into a prominent family (his mother Funmilayo Ransome-Kuti was a pioneering women's rights activist), Fela studied music in London and developed Afrobeat in Lagos in the late 1960s–70s. His music and the Kalakuta Republic commune openly attacked Nigeria's military governments. He was repeatedly arrested, his commune was raided in 1977 (his mother was thrown from a window and later died), and he declared himself a candidate in the 1979 election. He died of AIDS-related illness in 1997.",
      simple: "Fela Kuti was a Nigerian musician who invented Afrobeat and used his songs to protest against the government, suffering beatings and prison for it.",
      achievements: "Created Afrobeat; over 50 albums; the Shrine concert venue; posthumous global recognition including a Broadway musical (Fela!, 2009).",
      historical_context: "Fela's protest music responded to the corruption and brutality of Nigeria's military era (1966–1999). His mother's activism and his own defiance made the family a symbol of resistance.",
      guidance: "Fela's music and politics are inseparable; his legacy is celebrated in Nigeria and worldwide, with the annual Felabration festival.",
    },
    misconceptions: [
      { misconception: "Afrobeat and Afrobeats are the same.", correction: "Fela's Afrobeat is 1970s protest funk-jazz; the contemporary 'Afrobeats' pop sound is a different, later genre." },
    ],
    relatedIds: ["ent.music", "place.nigeria", "cult.diversity", "why.elections"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.serena-williams",
    title: "Serena Williams",
    aliases: ["Serena Jameka Williams"],
    question: "Who is Serena Williams?",
    categoryIds: ["cat-56", "cat-20"],
    summary: "Serena Williams (born 1981) is an American tennis player widely regarded as the greatest female athlete of the Open era, with 23 Grand Slam singles titles.",
    sections: {
      biography: "Born in Saginaw, Michigan, and coached by her father from childhood on public courts in Compton, California, Williams turned professional in 1995. With her sister Venus she dominated tennis for two decades: 23 Grand Slam singles titles (the Open-era record), 14 Grand Slam doubles titles with Venus, four Olympic gold medals, and 319 weeks as world No. 1. She retired after the 2022 US Open and has since built a venture-capital firm and family.",
      simple: "Serena Williams is an American tennis player who won more major singles titles than any other player in the modern era.",
      achievements: "23 Grand Slam singles titles; 14 doubles majors with Venus Williams; four Olympic golds; the Career Grand Slam twice; business ventures and philanthropy.",
      historical_context: "Williams broke into a predominantly white sport from a working-class Black background and faced documented racism and sexism — her career is inseparable from that history.",
      guidance: "Statistical comparisons across eras are debated; her Open-era singles record is the standard measure.",
    },
    misconceptions: [
      { misconception: "Serena and Venus are identical players.", correction: "Both are champions, but their styles, records and career arcs differ; Serena holds the singles record, Venus the more decorated Wimbledon doubles record." },
    ],
    relatedIds: ["ent.sports", "who.dangote"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §7 — Places (rivers, mountains, oceans, cities)
 * ════════════════════════════════════════════════════════════════════════════ */

const PLACE_RECORDS: KnowledgeRecord[] = [
  place({
    id: "place.nile",
    title: "Nile River",
    aliases: ["the Nile"],
    question: "Where is the Nile River?",
    categoryIds: ["cat-21", "cat-20", "cat-39"],
    summary: "The Nile is the longest river in the world (about 6 650 km), flowing north through eleven countries from East Africa to the Mediterranean — the lifeline of ancient and modern Egypt and Sudan.",
    sections: {
      geography: "The Nile has two main tributaries: the White Nile, rising in the Great Lakes region (Burundi, Rwanda, Uganda), and the Blue Nile, rising in Ethiopia's Lake Tana. They meet at Khartoum, Sudan. The river crosses South Sudan, Sudan and Egypt, forming a delta at the Mediterranean. The Aswan High Dam (1970) created Lake Nasser and controls its floods.",
      history: "The Nile made ancient Egyptian civilization possible: its annual flood deposited fertile silt, and the river was Egypt's highway. The struggle over its waters continues today — the Grand Ethiopian Renaissance Dam on the Blue Nile is central to Egypt–Ethiopia–Sudan relations.",
      economy: "The river supports irrigation for cotton, wheat and sugarcane, fishing, hydroelectric power (Aswan, GERD) and Nile cruise tourism.",
      culture: "The Nile appears throughout Egyptian religion, literature and art — from the Hymn to the Nile to modern Egyptian identity.",
      guidance: "The Nile's exact length and the debate over the world's longest river (vs the Amazon) are documented scholarly disputes.",
    },
    relatedIds: ["place.egypt", "place.kenya", "place.nigeria"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.kilimanjaro",
    title: "Mount Kilimanjaro",
    aliases: ["Kilimanjaro", "Kibo"],
    question: "Where is Mount Kilimanjaro?",
    categoryIds: ["cat-21", "cat-35"],
    summary: "Mount Kilimanjaro (5 895 m) is Africa's highest mountain and the world's tallest free-standing mountain, a snow-capped volcanic giant in northern Tanzania.",
    sections: {
      geography: "Kilimanjaro lies in northeastern Tanzania, near the Kenyan border, in Kilimanjaro National Park (a UNESCO World Heritage Site). It is a dormant stratovolcano with three cones — Kibo (the highest), Mawenzi and Shira — rising from the savannah to a permanent (but rapidly shrinking) ice cap.",
      history: "First recorded by Europeans in the 19th century, the mountain was climbed by Hans Meyer and Ludwig Purtscheller in 1889. It has deep cultural significance for the Chagga people, who call it Kibo or Kilima Njaro.",
      economy: "Kilimanjaro's slopes support coffee and banana farming; the mountain's trekking industry brings tens of thousands of climbers yearly — about two-thirds reach the summit.",
      culture: "The mountain is a symbol of Tanzania, appearing on the national flag and in the name of the national airline.",
      guidance: "Current glacier measurements and climbing conditions are dynamic information to verify at query time.",
    },
    relatedIds: ["place.kenya", "trv.safety"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.atlantic-ocean",
    title: "Atlantic Ocean",
    aliases: ["the Atlantic"],
    question: "Where is the Atlantic Ocean?",
    categoryIds: ["cat-21", "cat-20", "cat-48"],
    summary: "The Atlantic Ocean is the world's second-largest ocean, separating the Americas from Europe and Africa, and the historical highway of transatlantic trade, migration and slavery.",
    sections: {
      geography: "The Atlantic spans about 106 million km², from the Arctic to the Southern Ocean. The Mid-Atlantic Ridge runs down its centre — where new seafloor is created — and its deepest point is the Puerto Rico Trench (about 8 376 m). It connects to the Mediterranean, the Caribbean and the Gulf of Mexico.",
      history: "The Atlantic was crossed by Norse voyagers (c. 1000 CE), then by Columbus in 1492. It became the corridor of the transatlantic slave trade, European colonization and mass migration — and, in the 20th century, the stage of the Battle of the Atlantic.",
      economy: "The Atlantic carries a large share of world shipping, fishing, oil and gas (the North Sea, the Gulf of Guinea), and submarine communications cables.",
      culture: "The 'Black Atlantic' concept describes the culture formed by the African diaspora across the ocean's shores.",
      guidance: "Ocean statistics (area, depth, currents) are stable knowledge; live shipping and weather data are dynamic.",
    },
    relatedIds: ["place.nigeria", "place.brazil", "place.united-states"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.lagos",
    title: "Lagos",
    aliases: ["Lagos State", "Eko"],
    question: "Where is Lagos?",
    categoryIds: ["cat-21", "cat-09", "cat-55"],
    summary: "Lagos is Nigeria's largest city and economic capital — one of Africa's biggest megacities (about 15–20 million people in the metropolitan area) — built on islands, lagoons and a dynamic Atlantic coast.",
    sections: {
      geography: "Lagos sits on Nigeria's southwest coast: a conurbation of islands (Lagos Island, Victoria Island, Ikoyi) and mainland districts, linked by bridges, with the Lekki peninsula extending east. It was Nigeria's capital until 1991, when Abuja took over; it remains the commercial capital and home of the country's ports and financial district.",
      history: "Originally a Yoruba fishing and trading settlement (Eko), Lagos was annexed by Britain in 1861, became the capital of colonial Nigeria, and grew explosively after independence into Africa's largest city. Its history includes the 1977 FESTAC festival and its role as the hub of Nollywood and Afrobeats.",
      economy: "Lagos generates a large share of Nigeria's GDP: banking, tech (Yaba 'Silicon Lagoon'), ports, entertainment, and manufacturing. The state pioneered internally generated revenue reforms under Governor Bola Tinubu (1999–2007).",
      culture: "Lagos is the heart of Nigerian popular culture — Nollywood, Afrobeats (Fela's shrine, modern stars), fashion and a famously creative street life.",
      guidance: "Population figures and economic statistics for Lagos vary by source and are dynamic; the city's cultural and political significance is stable knowledge.",
    },
    relatedIds: ["place.nigeria", "who.fela-kuti", "bus.business-models"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §9 — Disciplines
 * ════════════════════════════════════════════════════════════════════════════ */

const DISCIPLINE_RECORDS: KnowledgeRecord[] = [
  discipline({
    id: "disc.sociology",
    title: "Sociology",
    aliases: ["social science", "sociological studies"],
    question: "What does studying sociology involve?",
    categoryIds: ["cat-25", "cat-01"],
    summary: "Sociology is the scientific study of human society — groups, institutions, inequality, social change and the patterns that shape everyday life.",
    sections: {
      definition: "The systematic study of society: how people interact in groups, how institutions (family, education, religion, government, economy) work, and how social structures shape individual lives.",
      simple: "Sociology studies how people live together — why societies are organized the way they are, and how being part of a group changes us.",
      detailed: "Sociologists study everything from face-to-face interaction to global systems. Core areas: social inequality (class, race, gender), institutions, deviance and crime, family, education, religion, urbanization, globalization and social movements. The discipline is empirical — it tests theories with surveys, interviews, observation and statistics — and reflexive: sociologists study the society they live in.",
      history: "Sociology emerged in 19th-century Europe as industrialization transformed society; Auguste Comte coined the term, and Marx, Durkheim and Weber founded its classical traditions.",
      learning_path: "FOUNDATIONS: society, culture, socialization, research methods. INTERMEDIATE: inequality, institutions, deviance. ADVANCED: social theory, quantitative and qualitative methods. RESEARCH: specialized fields and social policy.",
      guidance: "Sociology explains patterns, not individuals: knowing the statistics of a group tells you nothing certain about any one person in it.",
    },
    misconceptions: [
      { misconception: "Sociology is just common sense about people.", correction: "Sociological research regularly overturns intuition — e.g. who helps in emergencies or how networks spread influence." },
      { misconception: "Sociology is the same as social work.", correction: "Social work applies knowledge to help people; sociology is the research discipline that produces much of it." },
    ],
    relatedIds: ["disc.psychology", "disc.economics", "disc.history", "disc.political-science"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.philosophy",
    title: "Philosophy",
    aliases: ["philosophical studies", "the love of wisdom"],
    question: "What does studying philosophy involve?",
    categoryIds: ["cat-23", "cat-01"],
    summary: "Philosophy is the systematic examination of fundamental questions — knowledge, reality, ethics, logic and meaning — through reasoning rather than authority.",
    sections: {
      definition: "The study of fundamental questions about existence, knowledge, values, reason, mind and language, pursued through critical argument and conceptual analysis.",
      simple: "Philosophy is thinking hard about the biggest questions: What is real? What can we know? How should we live?",
      detailed: "Core branches: metaphysics (what exists), epistemology (what we can know), ethics (how we should act), logic (valid reasoning), aesthetics (beauty and art), and political philosophy (how societies should be organized). Philosophy teaches you to construct, test and criticize arguments — skills that transfer to law, policy, technology ethics and any field.",
      history: "Philosophy began independently in ancient Greece (Socrates, Plato, Aristotle), India (the Upanishads, Buddhist logic) and China (Confucius, Laozi). It shaped science — which was once 'natural philosophy' — and continues to address questions science cannot answer alone.",
      learning_path: "FOUNDATIONS: arguments, logic, classic questions. INTERMEDIATE: ethics, epistemology, metaphysics. ADVANCED: major thinkers and schools. RESEARCH: original argument, publication, academic philosophy.",
      guidance: "Philosophy rarely settles questions definitively; its value is in clarity, rigor and the quality of the reasoning itself.",
    },
    misconceptions: [
      { misconception: "Philosophy is just opinions.", correction: "It is disciplined argument: claims must survive counterexamples, objections and logical scrutiny." },
      { misconception: "Philosophy is useless for careers.", correction: "Philosophy graduates score highly on law, policy and tech-ethics career paths — the skills are reasoning and analysis." },
    ],
    relatedIds: ["who.socrates", "who.confucius", "disc.economics", "con.philosophy-religion"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.history",
    title: "History",
    aliases: ["historical studies", "historiography"],
    question: "What does studying history involve?",
    categoryIds: ["cat-20", "cat-01"],
    summary: "History is the disciplined study of the past — what happened, why it happened, and how we know — through sources, evidence and interpretation.",
    sections: {
      definition: "The systematic study of the human past based on evidence: primary sources (documents, artefacts, testimony), secondary scholarship, and the interpretation of causes, change and meaning over time.",
      simple: "History is the study of the past using evidence — not just dates and kings, but why things happened and how they changed people's lives.",
      detailed: "Historians work from sources: written records, archaeology, oral tradition, images, statistics. They ask questions about causation (why did this happen?), continuity and change, and significance. The field is divided by period, region and theme — political, social, economic, cultural, environmental, global. Historiography — the history of how history has been written — is central: interpretations change as evidence and questions change.",
      history: "History writing began with Herodotus and Thucydides, developed through the chronicles of medieval courts and the archives of states, and became a professional academic discipline in the 19th century.",
      learning_path: "FOUNDATIONS: chronology, sources, causation. INTERMEDIATE: regional and thematic surveys, source criticism. ADVANCED: historiography, research methods. RESEARCH: archives, monographs, original argument.",
      guidance: "History is interpretation from evidence: different historians can reach different conclusions from the same sources, and honest history presents the debate.",
    },
    misconceptions: [
      { misconception: "History is a fixed list of facts.", correction: "Facts are the raw material; the historian's work — selection, interpretation, causation — is always an argument." },
      { misconception: "The victors write all the history.", correction: "That is a warning, not a law: the discipline exists precisely to test received accounts against evidence, including the accounts of the defeated." },
    ],
    relatedIds: ["disc.political-science", "disc.sociology", "disc.geography", "why.war"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.geography",
    title: "Geography",
    aliases: ["geographical studies", "human geography", "physical geography"],
    question: "What does studying geography involve?",
    categoryIds: ["cat-21", "cat-01", "cat-40"],
    summary: "Geography is the study of places and the relationships between people and their environments — from landforms and climate to cities, trade and culture.",
    sections: {
      definition: "The discipline of the Earth's surface and human-environment relations: physical geography (landforms, climate, ecosystems) and human geography (population, cities, economy, culture, geopolitics).",
      simple: "Geography is the study of places: what the land is like, who lives there, how people use the environment, and how places connect.",
      detailed: "Physical geography covers geomorphology, climatology, hydrology, biogeography and oceanography. Human geography covers population, urban, economic, political, cultural and development geography. Geographers use maps, GIS (geographic information systems), remote sensing and fieldwork. The discipline bridges natural and social science — essential for climate, planning, trade and humanitarian work.",
      history: "Geography's roots are ancient (Eratosthenes coined the term); exploration filled the map by the 19th century; the 20th century added systematic science and GIS; the 21st century centres on climate and global connections.",
      learning_path: "FOUNDATIONS: maps, landforms, climate, population. INTERMEDIATE: physical and human systems. ADVANCED: GIS, regional analysis, development. RESEARCH: field and spatial-data research.",
      guidance: "Geographic facts (heights, areas) are stable; current data on climate, population and borders is dynamic.",
    },
    misconceptions: [
      { misconception: "Geography is just memorizing capitals.", correction: "That is a small corner; the discipline explains why places are the way they are and how they interact." },
      { misconception: "Geography and geology are the same.", correction: "Geology studies the solid Earth; geography studies the surface, people and their relations with it." },
    ],
    relatedIds: ["disc.history", "sci.geology", "sci.environmental-science", "disc.economics"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.accounting",
    title: "Accounting",
    aliases: ["accountancy", "financial accounting"],
    question: "What does studying accounting involve?",
    categoryIds: ["cat-14", "cat-01", "cat-11"],
    summary: "Accounting is the discipline of recording, reporting and interpreting financial activity — the 'language of business' — leading to careers as accountants, auditors and financial analysts.",
    sections: {
      definition: "The systematic recording, measurement and reporting of financial transactions: financial accounting (for outsiders), management accounting (for internal decisions), auditing and taxation.",
      simple: "Accounting is how businesses keep score with money: what came in, what went out, what is owned and what is owed.",
      detailed: "Core skills: double-entry bookkeeping, financial statements (balance sheet, income statement, cash-flow statement), cost and management accounting, budgeting, auditing, tax and financial analysis. Accountants apply standards (IFRS or GAAP depending on jurisdiction) and increasingly use data analytics and automation. Professional routes include ACCA, CPA, ACA and CIMA qualifications, each with exams and experience requirements.",
      history: "Double-entry bookkeeping was documented by the Italian monk Luca Pacioli in 1494; modern accounting grew with corporations, taxation and capital markets in the 19th–20th centuries.",
      learning_path: "FOUNDATIONS: bookkeeping, statements, business basics. INTERMEDIATE: management accounting, tax, audit. ADVANCED: professional qualifications (ACCA/CPA), IFRS. RESEARCH: accounting theory, ESG reporting, analytics.",
      guidance: "Accounting rules differ by country and change frequently; professional qualifications require accredited study and exams.",
    },
    misconceptions: [
      { misconception: "Accounting is just bookkeeping.", correction: "Bookkeeping records; accounting interprets, audits, advises and reports — and drives major decisions." },
      { misconception: "Accountants only work with tax.", correction: "Fields include audit, management accounting, forensic accounting, financial analysis and ESG reporting." },
    ],
    relatedIds: ["disc.business", "bus.taxes", "ins.create-budget", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.political-science",
    title: "Political science",
    aliases: ["politics", "government studies"],
    question: "What does studying political science involve?",
    categoryIds: ["cat-19", "cat-18", "cat-01"],
    summary: "Political science is the systematic study of power, government and public life — institutions, elections, political behaviour, international relations and political theory.",
    sections: {
      definition: "The social science of politics: how power is acquired and exercised, how governments and institutions work, how people participate, and how states interact — studied through theory, comparison and evidence.",
      simple: "Political science studies how countries are governed: elections, parliaments, presidents, parties, laws — and why people and states behave as they do.",
      detailed: "Subfields: comparative politics (comparing systems), American/domestic politics (institutions and behaviour), international relations (states, war, trade, organizations), political theory (justice, legitimacy, democracy), public policy and public administration, and political methodology (statistics, case studies). Political scientists use everything from game theory to field experiments; the field spans the boundary between social science and the humanities.",
      history: "Political thought runs from Plato and Aristotle through Machiavelli, Hobbes, Locke and Rousseau; the empirical science of politics developed in the 20th century with behaviouralism and comparative methods.",
      learning_path: "FOUNDATIONS: institutions, ideologies, methods. INTERMEDIATE: comparative politics, IR, theory. ADVANCED: quantitative methods, policy analysis. RESEARCH: original empirical research.",
      guidance: "Political science describes and explains; it does not tell you which party to support — that is where your own values decide.",
    },
    misconceptions: [
      { misconception: "Political science is just current events.", correction: "Current events are data; the discipline builds general explanations tested across many cases and periods." },
      { misconception: "It is the same as political journalism.", correction: "Journalism reports; political science theorizes and tests — the two inform each other." },
    ],
    relatedIds: ["disc.history", "disc.economics", "disc.sociology", "con.democracy", "law.elections"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §10 — Science fields
 * ════════════════════════════════════════════════════════════════════════════ */

const SCIENCE_RECORDS: KnowledgeRecord[] = [
  scienceField({
    id: "sci.oceanography",
    title: "Oceanography",
    aliases: ["marine science", "ocean science"],
    question: "What is oceanography?",
    categoryIds: ["cat-02", "cat-48", "cat-40"],
    summary: "Oceanography is the science of the oceans — their water, currents, life, seafloor and interactions with climate.",
    sections: {
      definition: "The interdisciplinary study of the ocean: physical oceanography (currents, waves, temperature), chemical (salinity, nutrients, carbon), biological (marine life and ecosystems), and geological (seafloor, coasts).",
      simple: "Oceanography is the study of the sea: how it moves, what lives in it, what is on its floor, and how it shapes the climate.",
      detailed: "The ocean covers 71% of Earth and drives the climate: it absorbs heat and carbon dioxide, and currents like the Gulf Stream redistribute heat around the planet. Oceanographers map seafloor spreading at mid-ocean ridges, study deep-sea ecosystems around hydrothermal vents, monitor sea-level rise and ocean acidification, and model the ocean's role in climate change. Technology — satellites, floats (Argo), submersibles — opened the deep ocean to study.",
      levels: "FOUNDATIONS: water properties, waves, tides, marine life. INTERMEDIATE: currents, ocean chemistry, ecosystems. ADVANCED: circulation modelling, marine geology, climate coupling. RESEARCH: deep-sea exploration, climate-ocean feedbacks.",
      guidance: "Ocean data (temperatures, sea level) is dynamic and must be sourced; the science of how the ocean works is stable knowledge.",
    },
    misconceptions: [
      { misconception: "The deep ocean is lifeless.", correction: "Deep-sea ecosystems thrive around hydrothermal vents without sunlight, using chemosynthesis." },
      { misconception: "The ocean is a limitless carbon sink.", correction: "Absorbing CO₂ acidifies the ocean and stresses marine life — the sink has limits." },
    ],
    relatedIds: ["sci.geology", "sci.environmental-science", "why.climate-change", "place.atlantic-ocean"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.meteorology",
    title: "Meteorology",
    aliases: ["weather science", "atmospheric science"],
    question: "What is meteorology?",
    categoryIds: ["cat-02", "cat-41"],
    summary: "Meteorology is the science of the atmosphere and weather — how air, water and energy produce the conditions we experience daily.",
    sections: {
      definition: "The scientific study of the atmosphere and its phenomena — weather (short-term conditions) and, in its climate dimension, long-term patterns — using observation, theory and computer models.",
      simple: "Meteorology is the science of weather: why it rains, why winds blow, how storms form, and how to forecast what comes next.",
      detailed: "Meteorologists study air pressure, temperature, humidity and wind, and the systems they create: fronts, storms, hurricanes, monsoons. Weather forecasting blends observations (satellites, radars, weather stations) with numerical models that simulate the atmosphere. Severe-weather warnings save lives; climate science builds on the same physics over longer timescales.",
      levels: "FOUNDATIONS: atmosphere structure, pressure, temperature, humidity. INTERMEDIATE: fronts, clouds, storms, forecasting. ADVANCED: numerical weather prediction, severe weather, atmospheric dynamics. RESEARCH: climate modelling, extreme-event attribution.",
      guidance: "Current weather and forecasts are dynamic information with short validity windows; the physics is stable.",
    },
    misconceptions: [
      { misconception: "Weather and climate are the same.", correction: "Weather is today's conditions; climate is the long-term average and its changes — a cold week does not disprove warming." },
      { misconception: "Forecasts are always right.", correction: "Forecasts carry quantified uncertainty; skill declines with lead time, and honest forecasters state confidence." },
    ],
    relatedIds: ["sci.oceanography", "why.climate-change", "sci.environmental-science"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.microbiology",
    title: "Microbiology",
    aliases: ["microbes", "microorganisms"],
    question: "What is microbiology?",
    categoryIds: ["cat-02", "cat-27"],
    summary: "Microbiology is the study of microorganisms — bacteria, viruses, fungi, protozoa — the invisible life that shapes health, food and the planet.",
    sections: {
      definition: "The branch of biology studying microorganisms: bacteria, archaea, viruses, fungi, algae and protozoa — their structure, function, ecology and roles in health, disease, industry and ecosystems.",
      simple: "Microbiology studies the tiny living things we cannot see: germs, good and bad, that live in, on and around us.",
      detailed: "Microbes outnumber human cells in and on our bodies and drive global nutrient cycles. Medical microbiology studies pathogens and immunity; environmental microbiology studies microbial ecosystems; industrial microbiology produces antibiotics, food (yogurt, beer), and biofuels. Virology is the study of viruses — including the COVID-19 coronavirus — while bacteriology, mycology and parasitology cover the other groups.",
      levels: "FOUNDATIONS: cell biology, microbial types, microscopy. INTERMEDIATE: microbial growth, genetics, immunity. ADVANCED: pathogenesis, industrial microbiology, virology. RESEARCH: microbiome science, antimicrobial resistance, synthetic biology.",
      guidance: "Microbiology is central to public health; claims about 'boosting immunity' or miracle microbes should be checked against research.",
    },
    misconceptions: [
      { misconception: "All microbes are harmful.", correction: "The vast majority are harmless or essential — digestion, nutrient cycles and even immunity depend on them." },
      { misconception: "Antibiotics kill viruses.", correction: "Antibiotics act on bacteria; viruses need antivirals or the immune system — misuse drives resistance." },
    ],
    relatedIds: ["disc.biology", "hlth.diseases", "hlth.public-health", "hlth.medications"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.materials-science",
    title: "Materials science",
    aliases: ["materials engineering"],
    question: "What is materials science?",
    categoryIds: ["cat-02", "cat-43", "cat-79"],
    summary: "Materials science studies how the structure of matter determines its properties — metals, ceramics, polymers, semiconductors and composites — and how to design new materials.",
    sections: {
      definition: "The interdisciplinary field connecting physics, chemistry and engineering to understand and design materials: how atomic and microscopic structure produce mechanical, electrical, optical and thermal properties.",
      simple: "Materials science asks: what is this stuff made of, why does it behave that way, and how can we make a better one?",
      detailed: "Materials are classified by bonding and structure: metals (conductive, ductile), ceramics (hard, brittle, insulating), polymers (light, flexible), semiconductors (tunable conductivity — the basis of electronics), and composites (combining materials). Scientists use tools like electron microscopy and crystallography to connect structure to properties, and design materials for applications — lighter aircraft alloys, stronger concrete, flexible screens, battery cathodes, biomaterials for implants.",
      levels: "FOUNDATIONS: atoms, bonding, crystal structure, properties. INTERMEDIATE: phase diagrams, mechanical behaviour, electrical properties. ADVANCED: semiconductors, polymers, composites, characterization. RESEARCH: nanomaterials, biomaterials, sustainable materials.",
      guidance: "Materials claims in advertising (e.g. 'space-age' fabrics) should be checked against the actual engineering properties.",
    },
    misconceptions: [
      { misconception: "Materials science is just chemistry of solids.", correction: "It spans physics and engineering too — properties, processing, performance and failure under real use." },
      { misconception: "Stronger is always better.", correction: "Design requires balancing strength, weight, cost, durability and manufacturability." },
    ],
    relatedIds: ["disc.engineering", "tech.semiconductors", "sci.chemistry", "tech.computers"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §11 — Technology
 * ════════════════════════════════════════════════════════════════════════════ */

const TECH_RECORDS: KnowledgeRecord[] = [
  technology({
    id: "tech.smartphones",
    title: "Smartphones",
    aliases: ["mobile phones", "cell phones"],
    question: "How do smartphones work?",
    categoryIds: ["cat-04", "cat-74"],
    summary: "A smartphone is a pocket computer with a phone inside: a powerful processor, touchscreen, radios for calls and data, sensors and an operating system running apps.",
    sections: {
      definition: "A mobile device combining a cellular phone with a general-purpose computer: a touchscreen interface, an application operating system, wireless radios (cellular, Wi-Fi, Bluetooth), sensors and a battery.",
      simple: "A smartphone is a tiny computer that can also make calls. Apps are its programs, and it connects to the world through mobile networks and Wi-Fi.",
      detailed: "Inside every smartphone: an application processor (CPU/GPU), memory, flash storage, a cellular modem, Wi-Fi and Bluetooth radios, GPS, cameras, microphones and sensors (accelerometer, gyroscope, fingerprint reader). The operating system (Android or iOS) manages apps, security and the interface. Smartphones replaced separate cameras, maps, music players and computers for billions of people, and mobile money (e.g. M-Pesa) made them financial infrastructure in many countries.",
      history: "The first mobile phones (1980s) only made calls; smartphones emerged in the 1990s (IBM Simon, Nokia communicators) and went mainstream with the iPhone (2007) and Android (2008).",
      how_it_works: "The processor runs the OS and apps; the modem connects to cellular towers; the touchscreen senses touch; radios handle Wi-Fi/Bluetooth; sensors feed the OS data; the battery powers it all — with software updates patching security.",
      examples: "Calling, messaging, payments, navigation, photography, health tracking and thousands of apps.",
      guidance: "Current models, prices and specifications are dynamic information to verify at query time.",
    },
    misconceptions: [
      { misconception: "A more expensive phone is always better.", correction: "Mid-range phones now cover most needs; the right phone depends on use, battery and ecosystem." },
      { misconception: "Smartphones are just phones.", correction: "They are general-purpose computers — the phone is one app among many." },
    ],
    relatedIds: ["tech.computers", "tech.operating-systems", "ins.send-money", "tech.mobile-development"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.operating-systems",
    title: "Operating systems",
    aliases: ["OS", "windows", "linux", "macos", "android", "ios"],
    question: "What is an operating system?",
    categoryIds: ["cat-06", "cat-04"],
    summary: "An operating system (OS) is the software that runs a computer's hardware and provides the platform on which applications run.",
    sections: {
      definition: "The core software that manages a computer's hardware — processor, memory, storage, devices — and provides the services (files, processes, security, interfaces) that applications use.",
      simple: "An operating system is the boss program of a device: it starts the computer, runs apps, manages files and connects everything.",
      detailed: "The OS handles: process management (running programs on the CPU), memory management, file systems, device drivers, security (users, permissions), and the user interface. Desktop/server OSes: Windows, macOS, Linux (and its many distributions). Mobile: Android and iOS. Embedded OSes run cars, routers and appliances. The kernel is the OS's core; 'Linux' commonly refers to the whole open-source operating system built around the Linux kernel.",
      history: "Early computers ran one program at a time; operating systems emerged in the 1950s–60s (batch, then time-sharing), UNIX (1969) shaped modern design, and personal computers brought Windows and macOS in the 1980s.",
      how_it_works: "When a device boots, the OS loads first; it schedules processes on the CPU, allocates memory, translates app requests into hardware operations, and isolates programs so one crash does not take down the system.",
      examples: "Windows 11 on a laptop, macOS on a Mac, Android on a phone, Ubuntu Linux on a server, iOS on an iPhone.",
      guidance: "OS versions and support lifetimes change — verify current support dates before relying on an old system.",
    },
    misconceptions: [
      { misconception: "The OS and the browser are the same.", correction: "The browser is an application running on the OS — one of many." },
      { misconception: "Free OSes are insecure.", correction: "Linux powers most servers and is widely regarded as highly secure; security depends on maintenance and updates." },
    ],
    relatedIds: ["tech.computers", "tech.smartphones", "tech.cybersecurity", "tech.programming"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.networking",
    title: "Computer networking",
    aliases: ["networks", "LAN", "routers", "TCP/IP"],
    question: "How does computer networking work?",
    categoryIds: ["cat-75", "cat-06"],
    summary: "Computer networking connects devices so they can share data — through cables, Wi-Fi and the internet, using protocols like TCP/IP.",
    sections: {
      definition: "The practice and technology of connecting computers and devices to exchange data: local networks (LAN), wide networks (WAN), the internet, and the protocols (rules) that govern communication.",
      simple: "Networking is how computers talk to each other: a home Wi-Fi network connects your devices, and the internet connects networks worldwide.",
      detailed: "Devices connect via cables (Ethernet, fibre) or radio (Wi-Fi, cellular). Each device has an IP address; data is split into packets and routed across networks; protocols define the rules — IP for addressing, TCP for reliable delivery, DNS to translate names to addresses. Local networks use switches and routers; the internet is a 'network of networks' connected by ISPs and undersea cables.",
      history: "Networking grew from ARPANET (1969); Ethernet (1973) standardized local networks; TCP/IP became the universal standard in 1983; Wi-Fi arrived in the late 1990s.",
      how_it_works: "Your device sends packets to a router; the router forwards them toward the destination across networks; the receiving device reassembles them; protocols check for errors and control the flow.",
      examples: "Sharing a printer on Wi-Fi, video calls, streaming, cloud storage — all depend on networking.",
      guidance: "Current speeds, standards (Wi-Fi 6/7, 5G/6G) and coverage are dynamic information.",
    },
    misconceptions: [
      { misconception: "The internet and Wi-Fi are the same.", correction: "Wi-Fi is one way of connecting to a network; the internet is the global network itself." },
      { misconception: "More bars always means faster internet.", correction: "Signal strength and data speed are related but different — congestion and plan limits also matter." },
    ],
    relatedIds: ["tech.internet", "tech.computers", "tech.cybersecurity", "con.cloud-computing"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.apis",
    title: "APIs (Application Programming Interfaces)",
    aliases: ["application programming interface", "REST API", "web API"],
    question: "What is an API?",
    categoryIds: ["cat-07", "cat-06"],
    summary: "An API is a defined way for one piece of software to ask another for data or actions — the interface that lets apps, websites and services work together.",
    sections: {
      definition: "A set of defined rules and endpoints through which software components communicate: one program sends a request in a standard format and receives a standard response, without needing to know the other's internals.",
      simple: "An API is like a restaurant menu: you order in a standard way, the kitchen (the other program) does the work, and you get your dish — without entering the kitchen.",
      detailed: "Web APIs typically use HTTP: a client sends a request (GET, POST, etc.) to a URL, often with JSON data, and the server responds with JSON. REST is the most common style; GraphQL and gRPC are alternatives. APIs power everything: payment gateways, maps, weather data, social logins, cloud services. Good APIs document their endpoints, authentication (API keys, OAuth) and rate limits.",
      history: "APIs have existed as long as software libraries; the web API era began in the 2000s when companies like eBay, Amazon and Google exposed their services programmatically.",
      how_it_works: "An app calls an endpoint with parameters and authentication; the server validates, processes and returns structured data; the app renders it — enabling mashups of services no single team built.",
      examples: "A weather app fetching forecasts, a store charging a card via a payment API, a map embedded in a delivery app.",
      guidance: "API versions, pricing and rate limits change — verify current documentation before building on any service.",
    },
    misconceptions: [
      { misconception: "APIs are only for developers.", correction: "APIs run much of everyday life invisibly — every app that shows maps, weather or payments uses them." },
      { misconception: "An API is the same as a database.", correction: "An API is an interface; the database is storage behind it. APIs can hide any implementation." },
    ],
    relatedIds: ["tech.programming", "tech.web-development", "tech.databases", "con.cloud-computing"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.machine-learning",
    title: "Machine learning",
    aliases: ["ML", "deep learning", "neural networks"],
    question: "What is machine learning?",
    categoryIds: ["cat-05", "cat-06", "cat-77"],
    summary: "Machine learning is the branch of AI where systems learn patterns from data instead of following explicit rules — powering recognition, prediction and language models.",
    sections: {
      definition: "A branch of artificial intelligence in which algorithms improve at a task by learning from data: finding patterns (supervised, unsupervised or reinforcement learning) rather than being programmed with explicit rules.",
      simple: "Machine learning is teaching computers by showing them many examples, so they learn the pattern themselves — like recognizing a cat after seeing thousands of cat photos.",
      detailed: "Three main types: supervised learning (learning from labelled examples — spam detection, image classification), unsupervised learning (finding structure in unlabelled data — clustering, recommendations), and reinforcement learning (learning by trial and error — game-playing, robotics). Deep learning uses neural networks with many layers, trained on huge data with powerful GPUs; large language models (GPT, Claude, Gemini) are deep networks trained on vast text. ML systems are only as good as their data — bias, overfitting and hallucination are real risks.",
      history: "The term dates to 1959 (Arthur Samuel); neural networks were studied from the 1940s–80s; deep learning's breakthrough came in 2012 (AlexNet) and accelerated through the 2010s–2020s with large language models.",
      how_it_works: "A model is defined with millions of parameters; training adjusts those parameters to reduce error on the data; evaluation tests the model on unseen data; the trained model then makes predictions on new inputs — with uncertainty that must be reported.",
      examples: "Face unlock, spam filters, translation, recommendation engines, medical image screening, voice assistants, chatbots.",
      guidance: "ML outputs carry uncertainty and can be confidently wrong — verify important outputs, especially in health, finance and law.",
    },
    misconceptions: [
      { misconception: "Machine learning is magic.", correction: "It is statistical pattern-finding at scale — impressive but bounded by data quality and design." },
      { misconception: "ML and AI are the same thing.", correction: "ML is one branch of AI; symbolic AI, robotics and other approaches exist too." },
    ],
    relatedIds: ["con.artificial-intelligence", "tech.data-science", "con.algorithm", "ins.use-ai"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.robotics",
    title: "Robotics",
    aliases: ["robots", "automation"],
    question: "What is robotics?",
    categoryIds: ["cat-78", "cat-04", "cat-43"],
    summary: "Robotics is the engineering and science of machines that sense, decide and act — from factory arms to drones, surgical systems and humanoids.",
    sections: {
      definition: "The interdisciplinary field of designing, building and operating robots — machines with sensors (perception), computation (decision-making) and actuators (movement) that perform tasks in the physical world.",
      simple: "Robotics is the science of building machines that can move and do things by themselves — like factory arms that weld cars or drones that deliver packages.",
      detailed: "A robot's three parts: sensors (cameras, lidar, touch), a control system (computers running perception and planning algorithms), and actuators (motors, hydraulics). Industrial robots revolutionized manufacturing; service robots clean floors and deliver in hospitals; drones fly autonomously; surgical robots assist precision surgery; humanoids walk and manipulate objects. Robotics combines mechanical engineering, electronics, computer science and AI — and raises questions about jobs, safety and responsibility.",
      history: "The word 'robot' comes from the 1920 Czech play R.U.R.; the first industrial robot (Unimate) worked in 1961; computing power made autonomous robots practical from the 1980s onward.",
      how_it_works: "Sensors feed the world into the control system; algorithms build a model, plan actions and send commands to motors; feedback loops correct errors — with safety systems stopping the machine when something goes wrong.",
      examples: "Car-assembly arms, warehouse robots (Amazon), vacuum robots, agricultural drones, surgical assistants, Mars rovers.",
      guidance: "Robot capabilities advance quickly; current specifications and safety standards are dynamic information.",
    },
    misconceptions: [
      { misconception: "Robots are always human-shaped.", correction: "Most robots are specialized machines — arms, drones, vehicles — shaped by their task, not by human form." },
      { misconception: "Robots will take all jobs.", correction: "Robots replace specific tasks, create new roles, and their economic effects are complex and debated." },
    ],
    relatedIds: ["con.artificial-intelligence", "tech.machine-learning", "disc.engineering", "tech.semiconductors"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.semiconductors",
    title: "Semiconductors",
    aliases: ["chips", "microchips", "integrated circuits"],
    question: "What are semiconductors?",
    categoryIds: ["cat-79", "cat-06", "cat-04"],
    summary: "Semiconductors are materials whose conductivity sits between conductors and insulators — the basis of every computer chip, phone and digital device.",
    sections: {
      definition: "Materials (usually silicon) with electrical conductivity between conductors and insulators, whose properties can be precisely controlled — the foundation of transistors and integrated circuits.",
      simple: "Semiconductors are special materials that can act like switches for electricity. Billions of tiny switches on a chip are how computers think.",
      detailed: "Silicon's conductivity is tuned by 'doping' — adding tiny amounts of other elements — to create positive and negative regions. The transistor, the semiconductor's key device, works as an electronic switch and amplifier; billions of transistors are packed onto an integrated circuit (chip) through photolithography. Chips power everything from phones to cars to satellites. The industry is global and strategically vital: design (US, UK, Taiwan), manufacturing (TSMC, Samsung, Intel) and equipment are concentrated in a few countries, making chips a focus of geopolitics.",
      history: "The transistor was invented in 1947 (Bell Labs); the integrated circuit followed in 1958–59; Moore's law — doubling transistor density roughly every two years — drove computing for decades.",
      how_it_works: "A transistor switches current on and off with a control voltage; chips arrange billions of transistors into logic gates and memory; software — ultimately bits — controls them; lithography patterns the circuits at nanometre scale.",
      examples: "CPUs and GPUs in computers, memory chips, phone processors, car control units, sensors in medical devices.",
      guidance: "Chip specifications and supply conditions change quickly — current availability is dynamic information.",
    },
    misconceptions: [
      { misconception: "Chips are made of rare metals only.", correction: "The base material is silicon — sand — refined to extreme purity; it is the manufacturing precision that is extraordinary." },
      { misconception: "Moore's law is a law of nature.", correction: "It was an industry observation and forecast; physical limits have slowed it, and new techniques extend it." },
    ],
    relatedIds: ["tech.computers", "tech.smartphones", "sci.materials-science", "tech.telecommunications"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.telecommunications",
    title: "Telecommunications",
    aliases: ["telecom", "5G", "broadband"],
    question: "How does telecommunications work?",
    categoryIds: ["cat-74", "cat-75", "cat-04"],
    summary: "Telecommunications is the technology of communicating over distance — phones, mobile networks, fibre, satellites — the nervous system of the modern world.",
    sections: {
      definition: "The transmission of information (voice, data, video) over distance by electromagnetic means: telephone networks, mobile cellular systems, fibre optics, satellites and the internet's backbone.",
      simple: "Telecommunications is how we talk and send data across the world: phone calls, mobile networks, and the cables and towers that carry them.",
      detailed: "Modern telecom runs on fibre-optic cables (the backbone, including undersea cables), mobile cellular networks (4G/5G — towers, base stations, spectrum), satellites (for remote areas and broadcasting), and switching/routing equipment. Signals are digitized, compressed, and transmitted as light or radio waves. Mobile money (M-Pesa), video calls and the internet all depend on this infrastructure.",
      history: "The telegraph (1830s–40s) began electric telecom; the telephone (1876) and radio followed; undersea cables crossed the Atlantic in the 19th century; mobile phones (1980s) and smartphones (2007) made telecom personal; 5G began rolling out in 2019.",
      how_it_works: "Your phone encodes sound or data, connects to the nearest cell tower via radio, the network routes it through fibre backbones to the destination, and the receiving device decodes it — all in milliseconds.",
      examples: "Phone calls, SMS, mobile data, video calls, streaming, IoT devices, emergency services.",
      guidance: "Coverage, prices and standards (5G/6G) are dynamic — verify current maps and plans.",
    },
    misconceptions: [
      { misconception: "5G causes health harm.", correction: "Major health authorities have found no established health risk from 5G within exposure limits; the claims are not supported by evidence." },
      { misconception: "Satellites carry most data.", correction: "Over 95% of international data travels through undersea fibre cables; satellites serve specific niches." },
    ],
    relatedIds: ["tech.smartphones", "tech.networking", "tech.internet", "tech.semiconductors"],
    sources: [SRC_BRITANNICA],
  }),
  technology({
    id: "tech.devops",
    title: "DevOps",
    aliases: ["development operations", "CI/CD", "site reliability"],
    question: "What is DevOps?",
    categoryIds: ["cat-07", "cat-06"],
    summary: "DevOps is the practice of unifying software development and operations — automating build, test, deployment and monitoring so teams ship reliably and often.",
    sections: {
      definition: "A set of practices and culture that integrates software development (Dev) with IT operations (Ops): continuous integration, continuous delivery/deployment (CI/CD), infrastructure as code, monitoring and shared responsibility.",
      simple: "DevOps is the way modern teams deliver software: write code, test it automatically, and put it into production quickly and safely — over and over.",
      detailed: "Core practices: version control (Git), automated testing, CI/CD pipelines (every change is built, tested and deployed automatically), infrastructure as code (servers configured from code, e.g. Terraform), containerization (Docker, Kubernetes), monitoring and alerting, and blameless post-incident reviews. DevOps shortens release cycles from months to hours and is inseparable from cloud computing; site reliability engineering (SRE) applies its principles with an engineering focus.",
      history: "The term emerged around 2009 from the 'agile infrastructure' movement, responding to the wall between developers who ship code and operators who keep systems running.",
      how_it_works: "A developer commits code; CI builds and tests it automatically; CD deploys it to staging then production; monitoring feeds metrics back; incidents are reviewed and the pipeline improved — a continuous loop.",
      examples: "A mobile app released weekly; a bank's payment service updated without downtime; an e-commerce site scaling automatically for traffic.",
      guidance: "DevOps tooling changes rapidly — current tool names and best practices are dynamic information.",
    },
    misconceptions: [
      { misconception: "DevOps is a job title only.", correction: "It is a culture and set of practices; 'DevOps engineer' is one role that applies them." },
      { misconception: "DevOps means no testing.", correction: "Automated testing is central — CI/CD exists to test and ship safely, faster." },
    ],
    relatedIds: ["tech.programming", "con.cloud-computing", "tech.web-development", "car.software-engineer"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §12 — Business & money
 * ════════════════════════════════════════════════════════════════════════════ */

const BUSINESS_RECORDS: KnowledgeRecord[] = [
  business({
    id: "bus.marketing",
    title: "Marketing",
    aliases: ["marketing basics", "brand promotion"],
    question: "What is marketing?",
    categoryIds: ["cat-71", "cat-09"],
    summary: "Marketing is understanding customers and communicating value — research, positioning, pricing, promotion and distribution working together.",
    sections: {
      definition: "The activities by which organizations understand customers, create and communicate value, and build relationships: market research, segmentation, positioning, the marketing mix (product, price, place, promotion), branding and customer retention.",
      simple: "Marketing is how a business lets the right people know about the right product, at the right price, in the right place — and keeps them coming back.",
      detailed: "Marketing starts with research: who are the customers, what problems do they have, who competes? Then segmentation and targeting choose which groups to serve; positioning defines the promise; the marketing mix executes it — product design, pricing strategy, distribution channels, promotion (advertising, content, social media, sales). Digital marketing adds SEO, social, email and analytics. Modern marketing measures everything and treats customer trust as the core asset.",
      history: "Marketing as a discipline grew with mass production and consumer markets in the late 19th–20th centuries; the internet and data transformed it into a measurable, personalized practice.",
      how_it_works: "Research → strategy (segment, target, position) → the marketing mix → execution across channels → measurement → iteration. Value is created when the offer genuinely solves a customer problem.",
      examples: "A food brand researching taste preferences; a startup using content marketing to build an audience; a retailer running loyalty programs.",
      guidance: "Marketing claims should be evidence-based; 'marketing' itself should not be confused with manipulation — ethical marketing informs and persuades honestly.",
    },
    misconceptions: [
      { misconception: "Marketing is just advertising.", correction: "Advertising is one channel; research, product, pricing, distribution and retention are all marketing." },
      { misconception: "Good products sell themselves.", correction: "Even excellent products need discovery, positioning and trust — that is marketing's job." },
    ],
    relatedIds: ["bus.business-models", "bus.ecommerce", "ins.start-business", "cre.content-creation"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.sales",
    title: "Sales",
    aliases: ["selling", "sales skills"],
    question: "What is sales?",
    categoryIds: ["cat-09", "cat-32"],
    summary: "Sales is the process of helping a customer decide to buy — listening to their needs, presenting value, handling objections and closing — ethically and repeatedly.",
    sections: {
      definition: "The activity of persuading and enabling customers to purchase a product or service: prospecting, qualifying, presenting value, handling objections, closing and following up — built on trust and needs.",
      simple: "Sales is helping people decide to buy something that genuinely helps them — by listening, explaining the value, and answering their concerns.",
      detailed: "Good selling is consultative: understand the customer's problem, qualify whether the product fits, present benefits tied to their needs, handle objections honestly, close at the right moment, and follow up. Channels include direct sales, retail, inside sales, account management and e-commerce. Modern sales is data-driven (CRMs, pipelines) and relationship-based — repeat customers and referrals are its best leads.",
      history: "Trade and selling are ancient; professional salesmanship developed with mass production in the 19th–20th centuries, and the internet added e-commerce and SaaS sales models.",
      how_it_works: "Prospect → qualify → present → handle objections → close → deliver → follow up. Each stage moves the customer toward a decision; honest salespeople disqualify mismatched customers.",
      examples: "A car salesperson matching a buyer's needs; a software sales rep running a product demo; a market trader building regular customers.",
      guidance: "Ethical selling serves the customer; pressure tactics and misrepresentation destroy the trust that sales depends on.",
    },
    misconceptions: [
      { misconception: "Sales is about manipulation.", correction: "Durable sales is needs-based and honest; manipulation wins once and loses the customer." },
      { misconception: "Salespeople are born, not made.", correction: "Sales is a learnable skill — listening, structuring conversations and follow-up are all trainable." },
    ],
    relatedIds: ["bus.marketing", "bus.customer-service", "rel.communication", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.accounting",
    title: "Accounting basics",
    aliases: ["bookkeeping", "financial records"],
    question: "What is accounting and why does it matter?",
    categoryIds: ["cat-14", "cat-09", "cat-11"],
    summary: "Accounting is how a business records, tracks and reports its money — the discipline that turns transactions into the information owners, banks and tax authorities rely on.",
    sections: {
      definition: "The systematic recording and reporting of financial transactions: income, expenses, assets, liabilities — producing the financial statements that show how a business is really doing.",
      simple: "Accounting is keeping honest score of a business's money: what it earns, spends, owns and owes — so you can see the truth and make decisions.",
      detailed: "The core is double-entry bookkeeping: every transaction touches two accounts, keeping the books balanced. Key statements: the balance sheet (assets, liabilities, equity at a moment), the income statement (revenue minus expenses over a period), and the cash-flow statement (actual money in and out). Small businesses need accurate books for taxes, loans and decisions; accounting standards (IFRS/GAAP) govern larger firms; accountants also handle payroll, tax and audit.",
      history: "Double-entry bookkeeping was documented by Luca Pacioli in 1494; accounting professionalized with corporations and taxation in the 19th–20th centuries.",
      how_it_works: "Every sale and purchase is recorded; transactions are classified into accounts; at period end, statements are prepared; managers, investors and tax authorities use them; auditors verify large companies' books.",
      examples: "A shop recording daily sales; a freelancer tracking income and expenses for tax; a company preparing annual reports for investors.",
      guidance: "Tax and accounting rules differ by country and change — use a qualified accountant for compliance.",
    },
    misconceptions: [
      { misconception: "Profit and cash are the same.", correction: "A business can be profitable on paper yet run out of cash — the cash-flow statement tells the real liquidity story." },
      { misconception: "Accounting is only for big companies.", correction: "Small businesses and even individuals benefit — accurate books are the foundation of tax compliance and credit." },
    ],
    relatedIds: ["disc.accounting", "bus.taxes", "ins.create-budget", "ins.start-business"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.investment",
    title: "Investment basics",
    aliases: ["investing", "stocks and bonds"],
    question: "What is investing?",
    categoryIds: ["cat-15", "cat-11"],
    summary: "Investing means putting money to work to earn returns over time — balancing risk and reward across assets like shares, bonds, property and funds.",
    sections: {
      definition: "Deploying capital into assets expected to produce returns — income, growth or both — over time, in exchange for accepting risk: shares, bonds, property, funds, and other instruments.",
      simple: "Investing is using money to make more money over time — buying a piece of a company, lending to a government, or owning property — while accepting some risk.",
      detailed: "Asset classes: shares (ownership, growth and dividends, higher risk), bonds (loans, fixed income, lower risk), property, cash savings, and funds that bundle them. The core trade-off is risk vs return: higher potential returns come with higher uncertainty. Diversification — spreading money across assets — reduces the impact of any single failure. Time horizon matters: long horizons allow riding out volatility; short horizons need safer assets. Costs and taxes erode returns, and 'get rich quick' promises are almost always scams.",
      history: "Investing is ancient (shipping ventures, government debt); modern markets grew with the joint-stock company, exchanges (Amsterdam 1602, NYSE 1792), and the 20th-century mutual fund industry.",
      how_it_works: "You buy an asset; its value changes with markets and fundamentals; you earn income (dividends, interest, rent) or capital gains when you sell; risk materializes when prices fall — so diversification, costs and horizon discipline matter.",
      examples: "A retirement fund investing in a global index; buying government bonds; a rental property; a young person investing monthly in a diversified fund.",
      guidance: "Investing involves risk and is personal — for major decisions consult a qualified financial adviser; current prices and returns are dynamic information.",
    },
    misconceptions: [
      { misconception: "Investing is gambling.", correction: "Gambling bets on chance; investing accepts calculated, diversifiable risk for expected long-term returns — though speculation can resemble gambling." },
      { misconception: "You need a lot of money to invest.", correction: "Fractional shares and index funds let people start with small monthly amounts." },
    ],
    relatedIds: ["bus.saving", "con.inflation", "bus.insurance", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.supply-chains",
    title: "Supply chains",
    aliases: ["logistics", "value chain"],
    question: "What is a supply chain?",
    categoryIds: ["cat-82", "cat-81", "cat-09"],
    summary: "A supply chain is the network that moves a product from raw materials to the customer — suppliers, factories, warehouses, transport and stores.",
    sections: {
      definition: "The sequence of organizations, people, activities and resources involved in producing and delivering a product: raw materials → components → manufacturing → distribution → retail → customer.",
      simple: "A supply chain is the journey of a product: from the farm or factory that makes the parts, to the warehouse, to the shop, to your door.",
      detailed: "Every product has a supply chain: sourcing raw materials, manufacturing, warehousing, transportation, and last-mile delivery to customers. Supply chain management coordinates these stages to balance cost, speed and reliability. Risks are everywhere — supplier failures, shipping delays, disasters, pandemics — which is why companies diversify suppliers, hold inventory buffers, and track goods with data. The COVID-19 pandemic and the 2021 Suez Canal blockage showed how a single link can disrupt the world.",
      history: "Supply chains became global with container shipping (1950s–60s), just-in-time manufacturing, and digital tracking; e-commerce added customer-facing logistics (Amazon, delivery apps).",
      how_it_works: "Demand forecasts drive orders; suppliers deliver components; factories assemble; warehouses store; transport moves goods; retailers and delivery networks reach customers — with information systems coordinating the flow.",
      examples: "A phone's chips made in Taiwan, assembled in China, shipped by sea, sold in Lagos; a farm's produce moving through a cold chain to supermarkets.",
      guidance: "Current supply conditions (prices, delays) are dynamic information; the structure of how supply chains work is stable knowledge.",
    },
    misconceptions: [
      { misconception: "Supply chain and logistics are the same.", correction: "Logistics is the movement and storage; the supply chain is the whole network including sourcing, manufacturing and information." },
      { misconception: "Faster is always better.", correction: "Speed costs money and can reduce resilience; the right balance depends on the product and market." },
    ],
    relatedIds: ["bus.ecommerce", "bus.business-models", "ins.start-business", "bus.marketing"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.management",
    title: "Management",
    aliases: ["managing", "management basics"],
    question: "What is management?",
    categoryIds: ["cat-86", "cat-09"],
    summary: "Management is getting work done through people and resources — planning, organizing, leading and controlling toward a goal.",
    sections: {
      definition: "The process of coordinating people and resources to achieve organizational goals: planning, organizing, staffing, leading and controlling.",
      simple: "Management is organizing people and resources so the work gets done: deciding what to do, who does it, and making sure it happens.",
      detailed: "The classic functions: planning (setting goals and strategy), organizing (structures, roles, resources), leading (motivating and guiding people), and controlling (measuring results and correcting course). Managers work across levels — team leads, middle managers, executives — and styles range from directive to coaching to empowering. Modern management emphasizes feedback, psychological safety, data and adaptability.",
      history: "Management theory began with industrialization (Taylor's scientific management, Fayol's functions) and evolved through human-relations research (Hawthorne), quality management (Deming) and agile methods.",
      how_it_works: "Goals are set and communicated; work is structured into roles and teams; resources are allocated; people are supported and held accountable; performance is measured; adjustments are made — a continuous cycle.",
      examples: "A restaurant manager scheduling staff and controlling costs; a project manager coordinating a product launch; a department head setting targets and budgets.",
      guidance: "Management is situational: what works in one team or culture may not in another — balance guidance with adaptation.",
    },
    misconceptions: [
      { misconception: "Management and leadership are the same.", correction: "Management coordinates resources and processes; leadership inspires direction and change — managers often do both." },
      { misconception: "Managers just delegate.", correction: "Effective managers also plan, remove obstacles, develop people and own outcomes." },
    ],
    relatedIds: ["bus.leadership", "bus.customer-service", "ins.interview", "bus.business-models"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.leadership",
    title: "Leadership",
    aliases: ["leading", "leadership skills"],
    question: "What is leadership?",
    categoryIds: ["cat-85", "cat-89", "cat-32"],
    summary: "Leadership is influencing and enabling people to achieve a shared goal — through vision, trust, communication and example rather than authority alone.",
    sections: {
      definition: "The ability to influence, motivate and enable others toward a shared purpose: setting direction, building trust, developing people and modelling the values of the group.",
      simple: "Leadership is helping a group go somewhere worthwhile: showing the direction, building trust, and bringing out the best in people.",
      detailed: "Leadership differs from formal authority: it is earned through competence, integrity and care. Key practices: articulate a clear vision; communicate honestly and often; listen; build psychological safety; develop people; make decisions and own them; model the behaviour expected. Styles vary — autocratic, democratic, transformational, servant — and the best leaders adapt. Leadership exists in every domain: business, community, politics, education, family.",
      history: "Leadership has been studied since antiquity (Plato, Machiavelli, the classics); modern research distinguishes trait, behaviour and situational approaches, and emphasizes that leadership can be learned.",
      how_it_works: "Vision creates direction; trust creates willingness; communication aligns effort; development builds capability; example sets standards — people follow because they choose to, not only because they must.",
      examples: "A team lead rallying a project; a community organizer building a movement; a CEO setting a company's values; a teacher inspiring a class.",
      guidance: "There is no single 'right' leadership style — effectiveness depends on context, followers and the leader's authentic strengths.",
    },
    misconceptions: [
      { misconception: "Leaders are born, not made.", correction: "Research and practice show leadership skills — communication, empathy, decision-making — can be deliberately developed." },
      { misconception: "Leadership means being the loudest.", correction: "Quiet, consistent, listening leadership is often the most effective." },
    ],
    relatedIds: ["bus.management", "rel.communication", "cre.public-speaking", "disc.psychology"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.customer-service",
    title: "Customer service",
    aliases: ["customer support", "client care"],
    question: "What is good customer service?",
    categoryIds: ["cat-87", "cat-09", "cat-32"],
    summary: "Customer service is helping customers before, during and after a purchase — responsiveness, empathy and problem-solving that build trust and loyalty.",
    sections: {
      definition: "The support a business provides its customers across the journey: answering questions, solving problems, handling complaints and ensuring satisfaction — the human face of the brand.",
      simple: "Customer service is helping people when they need it: answering their questions, fixing their problems, and treating them with respect.",
      detailed: "Good service is responsive (fast, accessible), empathetic (listening to the person), and effective (actually solving the problem). Channels include phone, chat, email, social media and self-service. Service recovery — handling complaints well — is decisive: a resolved complaint often creates more loyalty than a smooth transaction. Measuring satisfaction (CSAT, NPS) and training staff are core practices; AI assistants now handle routine queries while humans handle the complex.",
      history: "Service was historically personal (shopkeepers knew customers); mass markets industrialized it with call centres; the internet added omnichannel service and empowered customers to share experiences publicly.",
      how_it_works: "Listen to the customer → acknowledge the issue → diagnose → resolve → confirm satisfaction → follow up. Speed matters, but a fast wrong answer is worse than a careful right one.",
      examples: "A bank resolving a card issue by chat; an e-commerce site handling a return; a hotel responding to a complaint with a genuine fix.",
      guidance: "Service standards vary by industry and culture; the principles of listening and follow-through are universal.",
    },
    misconceptions: [
      { misconception: "Service is only about being nice.", correction: "Politeness without resolution fails; the core is actually solving the customer's problem." },
      { misconception: "The customer is always right.", correction: "The useful version: the customer's experience is always real — but policies and fairness still apply." },
    ],
    relatedIds: ["bus.sales", "bus.marketing", "rel.communication", "rel.conflict"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §13 — Careers
 * ════════════════════════════════════════════════════════════════════════════ */

const CAREER_RECORDS: KnowledgeRecord[] = [
  career({
    id: "car.remote-work",
    title: "Remote work",
    aliases: ["working from home", "WFH", "telework"],
    question: "How do I work remotely?",
    categoryIds: ["cat-33", "cat-34", "cat-04"],
    summary: "Remote work means doing your job away from a central office — with its own skills, tools, routines and boundaries for productivity and wellbeing.",
    sections: {
      definition: "A working arrangement in which employees perform their roles outside the employer's premises — usually from home — using digital tools for communication, collaboration and delivery.",
      simple: "Remote work is doing your job from home (or anywhere) using a computer — with clear routines, good communication and self-discipline.",
      detailed: "Making remote work work: a dedicated workspace, a reliable computer and internet connection, structured routines (start/end times, breaks), clear communication (overcommunicate, use the team's tools), visible deliverables, and deliberate boundaries between work and life. Companies need trust-based management, documented processes, and equal treatment of on-site and remote staff. Remote roles are more common in tech, writing, design, support and analytics; hybrid models mix office and home.",
      history: "Telework existed from the 1970s; the COVID-19 pandemic (2020) made it mainstream; by the mid-2020s hybrid and remote arrangements were a standard expectation in many industries.",
      how_it_works: "Employers define expectations (hours, availability, deliverables); workers use tools — video meetings, chat, project trackers, cloud documents; managers measure outcomes rather than presence; HR policies cover equipment, data security and work-life balance.",
      examples: "A software engineer on a distributed team; a support agent working from home; a hybrid marketer in the office three days a week.",
      guidance: "Remote policies, tools and labour-law implications vary by employer and country — verify current terms and legal rules.",
    },
    misconceptions: [
      { misconception: "Remote workers are less productive.", correction: "Studies show comparable or higher productivity for many roles; the real challenge is collaboration and wellbeing, which well-run teams address." },
      { misconception: "Remote work means working less.", correction: "The risk is often the opposite — working more; boundaries are essential." },
    ],
    relatedIds: ["car.career-paths", "day.time-management", "tech.computers", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.freelancing",
    title: "Freelancing",
    aliases: ["self-employed", "gig work", "independent contractor"],
    question: "How do I become a freelancer?",
    categoryIds: ["cat-33", "cat-10", "cat-34"],
    summary: "Freelancing means selling your skills project-by-project to clients — with freedom, and with the responsibility of finding work, pricing, managing money and handling taxes yourself.",
    sections: {
      definition: "A working arrangement in which an independent professional sells services to multiple clients without a permanent employment contract: writing, design, programming, consulting and many other skills.",
      simple: "A freelancer is their own boss: clients hire them for specific jobs, and they manage the work, the money and the taxes themselves.",
      detailed: "To start: define a service and a target client; build a portfolio showing real work; set rates (research the market, then price by value); find clients (referrals, platforms, social media, networking); use written contracts; invoice promptly; save for taxes and slow months; and keep learning. Freelancers need discipline across sales, delivery, finance and administration — the 'business of you'.",
      history: "Independent professionals have always existed; the internet and platforms (Upwork, Fiverr) expanded freelancing massively in the 2000s–2020s.",
      how_it_works: "Find a project → agree scope, price and terms in a contract → deliver → invoice → collect → repeat. Income is irregular, so cash-flow management and an emergency fund are essential.",
      examples: "A freelance writer with three clients; a developer building websites per project; a consultant billing by the day.",
      guidance: "Tax, contracts and liability differ by country — register properly and consult professionals; current platform terms are dynamic.",
    },
    misconceptions: [
      { misconception: "Freelancing means no boss and easy money.", correction: "Clients are the bosses; income is irregular, and administration, marketing and taxes are all on you." },
      { misconception: "Freelancers never get benefits.", correction: "They must arrange their own — insurance, retirement, sick leave — which is part of the real cost of freedom." },
    ],
    relatedIds: ["car.remote-work", "ins.start-business", "bus.budgeting", "ins.send-money"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §14 — Law
 * ════════════════════════════════════════════════════════════════════════════ */

const LAW_RECORDS: KnowledgeRecord[] = [
  law({
    id: "law.criminal",
    title: "Criminal law",
    aliases: ["crime and punishment", "criminal justice"],
    question: "What is criminal law?",
    categoryIds: ["cat-17", "cat-62"],
    summary: "Criminal law defines conduct the state prohibits and punishes — crimes, defences, procedures and penalties — balanced against the accused's rights.",
    sections: {
      definition: "The body of law defining crimes (conduct punishable by the state) and the procedures for prosecution: investigation, arrest, trial, conviction and sentencing — bounded by rights like the presumption of innocence.",
      simple: "Criminal law is the law about crimes: what is forbidden, what happens if you are accused, and the fair process for deciding guilt.",
      detailed: "Crimes are typically divided into felonies (serious — imprisonment) and misdemeanours (less serious). Most require a guilty act (actus reus) plus a guilty mind (mens rea). Defences include self-defence, duress, insanity and lack of capacity. The state prosecutes (not the victim), and the accused is presumed innocent until proven beyond reasonable doubt, with rights to a lawyer, a fair trial and appeal. Penalties include fines, probation and imprisonment.",
      history: "Criminal law descends from ancient codes (Hammurabi, Roman law) through the common law and continental codes; modern systems emphasize due process, proportionality and rehabilitation alongside punishment.",
      how_it_works: "Police investigate; prosecutors decide whether to charge; courts hold trials; juries or judges decide guilt; sentences are imposed and reviewed; appeals correct errors.",
      examples: "Theft, assault, fraud, drug offences, traffic crimes — each defined by statute with its own elements and penalties.",
      guidance: "Criminal law is jurisdiction-specific and serious — anyone facing charges must obtain a qualified criminal defence lawyer immediately.",
    },
    misconceptions: [
      { misconception: "The victim decides whether to prosecute.", correction: "Prosecutors decide; the victim's role is evidence and testimony." },
      { misconception: "Being accused means you are guilty.", correction: "The presumption of innocence is the foundation: the state must prove guilt beyond reasonable doubt." },
    ],
    relatedIds: ["law.courts", "disc.law", "law.civil", "con.human-rights"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — if you face criminal proceedings, consult a qualified criminal defence lawyer immediately.",
  }),
  law({
    id: "law.civil",
    title: "Civil law",
    aliases: ["private law", "civil disputes"],
    question: "What is civil law?",
    categoryIds: ["cat-17", "cat-09"],
    summary: "Civil law resolves disputes between private parties — contracts, property, family, injury — through compensation and orders rather than punishment.",
    sections: {
      definition: "The body of law governing disputes between individuals and organizations — contracts, torts, property, family, inheritance — where the remedy is typically compensation or a court order, not imprisonment.",
      simple: "Civil law settles disagreements between people or companies: if someone breaks a contract or harms you, you can sue them for money or a court order.",
      detailed: "Unlike criminal law (state vs accused), civil law is party vs party: the claimant sues the defendant. Main areas: contract law (broken agreements), tort law (harm — negligence, defamation), property law, family law (divorce, custody), and inheritance. The standard of proof is usually 'balance of probabilities' (more likely than not), and remedies are damages, injunctions and specific performance.",
      history: "Civil law descends from Roman law (the civil law tradition) and the common law of England; modern systems merge both traditions across jurisdictions.",
      how_it_works: "A claimant files a claim; parties exchange pleadings and evidence; courts may encourage settlement or mediation; a judge (sometimes a jury) decides; the loser pays damages or complies with orders; appeals follow.",
      examples: "Suing over a broken contract, claiming compensation for an injury, resolving a boundary dispute, divorce proceedings.",
      guidance: "Civil procedures vary widely by jurisdiction and are time-limited (statutes of limitation) — consult a qualified lawyer for any real dispute.",
    },
    misconceptions: [
      { misconception: "Anyone can sue for anything at any time.", correction: "Claims must have legal basis, jurisdiction and timeliness — and losing parties often pay costs." },
      { misconception: "Civil and criminal cases are the same process.", correction: "They are separate systems with different parties, standards of proof and remedies — though one act can trigger both." },
    ],
    relatedIds: ["law.contracts", "law.property", "law.courts", "disc.law"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — for a real dispute, consult a qualified lawyer in your jurisdiction.",
  }),
  law({
    id: "law.property",
    title: "Property law",
    aliases: ["real property", "ownership", "land law"],
    question: "What is property law?",
    categoryIds: ["cat-17", "cat-37"],
    summary: "Property law defines what people own — land, buildings, goods and ideas — and the rights and duties that come with ownership.",
    sections: {
      definition: "The body of law governing ownership: real property (land and buildings), personal property (movable goods), and intellectual property (ideas, inventions, creative works) — including how ownership is acquired, transferred and protected.",
      simple: "Property law is the law of what belongs to whom: buying land, renting a house, owning a car, and protecting your ideas.",
      detailed: "Real property law covers land ownership, leases and tenancy, mortgages, easements, boundaries and registration systems (land registries, deeds, titles). Personal property covers movable goods and their transfer. Intellectual property protects inventions (patents), creative works (copyright), brands (trademarks) and trade secrets. Ownership rights are never absolute — they are limited by law: taxes, zoning, planning, environmental rules and compulsory purchase.",
      history: "Property law descends from Roman law and feudal land law; modern systems reformed it with land registration (19th century) and globalized intellectual property treaties (19th–21st centuries).",
      how_it_works: "Ownership is proven by registration or documents; transfers happen through contracts and registration; disputes go to courts; intellectual property is registered or arises automatically (copyright); enforcement is through courts and remedies.",
      examples: "Buying a house with a mortgage; renting an apartment; registering a trademark for a brand; licensing software.",
      guidance: "Property law differs sharply by country — always use qualified conveyancers or lawyers for property transactions.",
    },
    misconceptions: [
      { misconception: "Owning land means you can do anything with it.", correction: "Planning, environmental, heritage and neighbour laws constrain land use everywhere." },
      { misconception: "Posting your work online gives up your copyright.", correction: "Copyright usually remains with the creator; posting grants implied permissions, not ownership." },
    ],
    relatedIds: ["con.mortgage", "law.contracts", "cmp.rent-vs-buy", "law.civil"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — property transactions need qualified professionals in your jurisdiction.",
  }),
  law({
    id: "law.family",
    title: "Family law",
    aliases: ["marriage law", "divorce", "child custody"],
    question: "What is family law?",
    categoryIds: ["cat-17", "cat-30"],
    summary: "Family law governs the legal side of family life — marriage, divorce, children, maintenance and inheritance — balancing rights with the best interests of children.",
    sections: {
      definition: "The body of law covering marriage and its dissolution, children's welfare (custody, guardianship, adoption), financial support (maintenance), domestic violence protection and inheritance within families.",
      simple: "Family law is the law of family life: getting married, getting divorced, deciding where children live, and who supports whom.",
      detailed: "Key areas: marriage (capacity, formalities, validity), divorce and separation (grounds, division of property, spousal maintenance), children (custody and access — decided on the child's best interests), child support, adoption, domestic-violence protection orders, and succession/inheritance. Many jurisdictions encourage mediation before court. Family law is deeply personal: procedures aim to reduce conflict, especially where children are involved.",
      history: "Family law grew from religious and customary law into state law over the 19th–20th centuries; no-fault divorce and the recognition of varied family forms are recent developments in many countries.",
      how_it_works: "Marriages are registered; divorces proceed by application (fault or no-fault depending on jurisdiction); courts or agreements decide property, maintenance and children's arrangements; protection orders respond to abuse; wills and intestacy rules govern inheritance.",
      examples: "A divorce with joint custody; a child-support calculation; an adoption application; a domestic-violence protection order.",
      guidance: "Family law varies greatly by country, religion and custom, and emotions run high — qualified family lawyers and mediators are essential.",
    },
    misconceptions: [
      { misconception: "Mothers automatically get custody.", correction: "Modern law decides on the child's best interests, and joint or father custody is common." },
      { misconception: "Divorce requires proving fault.", correction: "Most jurisdictions now allow no-fault divorce — a period of separation or mutual consent suffices." },
    ],
    relatedIds: ["law.civil", "law.courts", "rel.conflict", "day.parenting"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — family matters need qualified legal help in your jurisdiction.",
  }),
  law({
    id: "law.employment",
    title: "Employment law",
    aliases: ["labour law", "workers' rights"],
    question: "What is employment law?",
    categoryIds: ["cat-17", "cat-33"],
    summary: "Employment law sets the rules of the workplace — contracts, wages, hours, safety, non-discrimination and dismissal — protecting both workers and employers.",
    sections: {
      definition: "The body of law governing the employer-employee relationship: hiring, contracts, wages, working hours, leave, health and safety, non-discrimination, collective bargaining, and termination.",
      simple: "Employment law is the rulebook of work: what employers must do for workers and what workers can expect — fair pay, safe conditions and no unfair dismissal.",
      detailed: "Core protections: minimum wage and overtime rules, maximum hours, paid leave, workplace safety, protection from discrimination (race, gender, religion, disability, age), protection from harassment, and rules on dismissal — notice, reasons, and remedies for unfair or wrongful dismissal. Collective labour law covers unions and strikes. The rise of gig and platform work has created new debates about who counts as an 'employee'.",
      history: "Labour law grew from 19th-century factory reform — child-labour bans, the eight-hour day — through 20th-century welfare-state protections to today's gig-economy debates.",
      how_it_works: "Parliaments enact statutes; labour ministries and inspectorates enforce; employment tribunals and courts resolve disputes; unions negotiate collective agreements; employers implement policies and contracts.",
      examples: "A written employment contract; a minimum-wage violation claim; a discrimination complaint; an unfair-dismissal case.",
      guidance: "Employment law differs substantially by country and changes often — workers and employers should verify current rules with official sources.",
    },
    misconceptions: [
      { misconception: "An oral promise is never a contract.", correction: "Contracts can be oral; statutes and case law fill in terms — though written contracts protect both sides." },
      { misconception: "Employees can be fired for any reason.", correction: "Most jurisdictions prohibit dismissal for discriminatory or retaliatory reasons and require notice or cause." },
    ],
    relatedIds: ["law.contracts", "car.career-paths", "car.remote-work", "law.civil"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — workplace disputes need qualified advice in your jurisdiction.",
  }),
  law({
    id: "law.business",
    title: "Business law",
    aliases: ["commercial law", "company law"],
    question: "What is business law?",
    categoryIds: ["cat-17", "cat-09"],
    summary: "Business law governs how companies are formed, run and transact — structures, contracts, liability, regulation and dispute resolution.",
    sections: {
      definition: "The body of law covering commercial activity: business structures (sole trader, partnership, company), formation and governance, contracts, sales, consumer protection, competition, employment and liability.",
      simple: "Business law is the law of doing business: how to register a company, make deals, protect consumers and resolve disputes.",
      detailed: "Key areas: choosing and forming a structure (limited liability protects owners' personal assets); corporate governance (directors' duties, shareholders' rights); commercial contracts; sales of goods and consumer protection; competition law (no anti-competitive behaviour); intellectual property; insolvency; and regulation by sector (finance, food, health, telecoms). Companies must file returns, keep records and comply with reporting duties.",
      history: "Commercial law descends from the medieval lex mercatoria and company law's 19th-century birth (limited liability, joint-stock companies); regulation expanded in the 20th century.",
      how_it_works: "Businesses are formed by registration; they transact through contracts; regulators license and supervise; courts and arbitration resolve disputes; insolvency procedures wind up failing firms fairly.",
      examples: "Registering an LLC; a supplier contract; a consumer-refund dispute; a merger reviewed by the competition authority.",
      guidance: "Business law is jurisdiction-specific and changes often — consult qualified lawyers and accountants when forming or running a business.",
    },
    misconceptions: [
      { misconception: "Registering a company makes you personally safe from all liability.", correction: "Limited liability protects owners from many debts, but not from fraud, personal guarantees or certain regulatory penalties." },
      { misconception: "A verbal deal is fine for business.", correction: "Oral contracts can bind, but written contracts prevent disputes — especially across borders." },
    ],
    relatedIds: ["ins.register-company", "ins.start-business", "law.contracts", "law.employment"],
    sources: [SRC_BRITANNICA],
    professionalAssistanceNote: "General legal education only — business formation and transactions need qualified professionals.",
  }),
  law({
    id: "law.legislatures",
    title: "Legislatures",
    aliases: ["parliament", "congress", "national assembly"],
    question: "How do legislatures work?",
    categoryIds: ["cat-18", "cat-17"],
    summary: "A legislature is the branch of government that makes laws — elected representatives debating, amending and voting on legislation, budgets and oversight.",
    sections: {
      definition: "The branch of government responsible for making laws: an elected body (parliament, congress, national assembly) that debates and votes on legislation, approves budgets and oversees the executive.",
      simple: "A legislature is the part of government that makes laws: elected representatives meet, discuss proposed laws, change them, and vote.",
      detailed: "Legislatures may be unicameral (one chamber) or bicameral (two — e.g. a senate and a house of representatives). Their functions: legislation (introduce, debate, amend, pass bills), budgeting (approve taxes and spending), oversight (question ministers, scrutinize government), representation (constituents' interests) and, in parliamentary systems, forming and removing governments. Bills typically pass through readings and committee stages before becoming law, subject to a head of state's assent or a constitutional review.",
      history: "Modern legislatures descend from medieval assemblies (the English Parliament, the Icelandic Althing, estates general); representative democracy and universal suffrage made them central from the 19th–20th centuries.",
      how_it_works: "A bill is introduced (by government or members); committees examine and amend it; chambers debate and vote; both houses (where bicameral) must agree; the executive assents; courts may review constitutionality.",
      examples: "The US Congress, the UK Parliament, Nigeria's National Assembly, Kenya's Parliament, Germany's Bundestag.",
      guidance: "Legislative procedures differ by country — the specific rules of each chamber are defined by its constitution and standing orders.",
    },
    misconceptions: [
      { misconception: "The legislature only does what the executive says.", correction: "Oversight, amendment and rejection are real powers — strength varies by system, but no executive fully controls a healthy legislature." },
      { misconception: "Laws pass as introduced.", correction: "Most bills are amended substantially in committee and floor debate." },
    ],
    relatedIds: ["con.government", "con.constitution", "law.elections", "why.elections"],
    sources: [SRC_BRITANNICA],
  }),
  law({
    id: "law.executive",
    title: "Executive government",
    aliases: ["the executive", "the government", "cabinet"],
    question: "How does executive government work?",
    categoryIds: ["cat-18", "cat-17"],
    summary: "The executive is the branch that runs the country day to day — the president or prime minister and cabinet — implementing laws and directing administration.",
    sections: {
      definition: "The branch of government that executes laws and administers the state: the head of state and/or head of government, the cabinet and ministries, and the public administration beneath them.",
      simple: "The executive is the part of government that actually runs things: the president or prime minister, their ministers, and the offices that deliver services.",
      detailed: "The executive's functions: implement and enforce legislation, propose policy and budgets, conduct foreign relations, command the armed forces (in many systems), appoint officials, and administer public services through ministries and agencies. Structures vary: presidential systems (the president is both head of state and government), parliamentary systems (a prime minister answers to parliament), and semi-presidential systems (both). The executive is checked by the legislature (budgets, oversight), the courts (legality) and the constitution (limits).",
      history: "Executives evolved from monarchs and their councils into constitutional offices: presidential power grew with the American and French revolutions; the modern administrative state grew in the 19th–20th centuries.",
      how_it_works: "Elections or parliamentary confidence form the government; the head of government chooses ministers; ministries implement laws and policies; officials administer; legislatures fund and scrutinize; courts review legality.",
      examples: "A president signing a budget; a prime minister reshuffling the cabinet; a ministry issuing regulations; a civil service delivering passports.",
      guidance: "Executive structures differ by country — the constitution and standing law define each one.",
    },
    misconceptions: [
      { misconception: "The executive is above the law.", correction: "Constitutions, courts and legislatures limit executives everywhere — the rule of law is the point of the separation of powers." },
      { misconception: "The civil service is part of the political executive.", correction: "Professional civil servants serve the state across governments; political executives come and go." },
    ],
    relatedIds: ["con.government", "law.legislatures", "con.constitution", "con.democracy"],
    sources: [SRC_BRITANNICA],
  }),
  law({
    id: "law.international",
    title: "International law",
    aliases: ["public international law", "law of nations"],
    question: "What is international law?",
    categoryIds: ["cat-65", "cat-17", "cat-69"],
    summary: "International law is the set of rules states agree to govern their relations — treaties, custom, human rights and the laws of war — enforced mainly by consent and reciprocity.",
    sections: {
      definition: "The body of rules binding states and international organizations in their mutual relations: treaties and conventions, customary international law, general principles, and the decisions of international courts and tribunals.",
      simple: "International law is the rules countries agree to follow with each other — treaties, human rights, the laws of war — enforced mostly by agreement and reputation.",
      detailed: "Sources: treaties (binding agreements — the UN Charter, the Geneva Conventions, the Paris Agreement), customary international law (long-standing practice accepted as law), general principles, and judicial decisions. Subjects: states, international organizations, and increasingly individuals (international criminal law, human rights). There is no world government: enforcement works through reciprocity, sanctions, courts (the ICJ, the ICC), and political pressure — which is why compliance is uneven.",
      history: "Modern international law grew from the Peace of Westphalia (1648) and Grotius's writings, through the Hague Conventions and the League of Nations, to the UN Charter (1945) and today's dense treaty network.",
      how_it_works: "States negotiate and ratify treaties; customary rules bind through practice; international courts and tribunals interpret and decide; states implement through domestic law; breaches meet diplomatic, economic or legal consequences.",
      examples: "The UN Charter, human-rights treaties, the law of the sea, the Geneva Conventions, climate agreements, trade rules (WTO).",
      guidance: "International law is complex and evolving — specific questions need current official sources and expert legal analysis.",
    },
    misconceptions: [
      { misconception: "International law is not real law.", correction: "It is law in the sense of binding rules with institutions, courts and consequences — though its enforcement is weaker than domestic law." },
      { misconception: "Treaties override everything.", correction: "Treaties bind the states that ratify them, subject to reservations and domestic constitutional limits." },
    ],
    relatedIds: ["con.international-relations", "law.human-rights", "con.human-rights", "why.war"],
    sources: [SRC_UN, SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §15 — Health education
 * ════════════════════════════════════════════════════════════════════════════ */

const HEALTH_RECORDS: KnowledgeRecord[] = [
  health({
    id: "hlth.diseases",
    title: "Infectious diseases and prevention",
    aliases: ["germs and disease", "infection prevention"],
    question: "How do infectious diseases spread and how are they prevented?",
    categoryIds: ["cat-27", "cat-62"],
    summary: "Infectious diseases are caused by germs — viruses, bacteria, fungi, parasites — that spread through air, contact, food, water or vectors; prevention rests on hygiene, vaccines and treatment.",
    sections: {
      definition: "Diseases caused by pathogens — viruses, bacteria, fungi, parasites — transmitted between people or from animals/vectors, and prevented through hygiene, vaccination, safe food and water, and appropriate treatment.",
      simple: "Infectious diseases are caused by tiny germs. They spread by coughing, touching, food or insect bites — and we prevent them with washing, vaccines and safe food.",
      detailed: "Transmission routes: respiratory (droplets and aerosols — flu, COVID-19, TB), contact (direct or surfaces — many skin and gut infections), food and water (cholera, typhoid, hepatitis A), blood (HIV, hepatitis B/C), sexual contact, and vectors (mosquitoes — malaria, dengue, yellow fever). Prevention: hand hygiene, safe water and sanitation, vaccination (which protects both the individual and the community through herd immunity), safe food handling, insect control, and early treatment. Antibiotics treat bacterial infections; antivirals treat some viral ones; misuse of antibiotics drives resistance.",
      history: "Germ theory (Pasteur, Koch, 19th century) transformed medicine; sanitation and vaccines then eliminated or controlled once-devastating diseases — smallpox was eradicated in 1980.",
      how_it_works: "A pathogen enters the body, multiplies and causes illness; the immune system responds; vaccines train immunity safely; treatments (antibiotics, antivirals, antiparasitics) support recovery; breaking transmission chains stops outbreaks.",
      examples: "Handwashing before meals; routine childhood vaccines; mosquito nets against malaria; safe drinking water; isolating during flu.",
      guidance: "This is general disease education, not diagnosis — symptoms should be assessed by qualified health professionals.",
    },
    misconceptions: [
      { misconception: "Antibiotics cure viral infections.", correction: "Antibiotics work only on bacteria; using them for viruses is ineffective and fuels resistance." },
      { misconception: "Vaccines cause the diseases they prevent.", correction: "Vaccines use killed, weakened or component parts of pathogens and do not cause the disease; serious side effects are rare." },
    ],
    relatedIds: ["sci.microbiology", "hlth.public-health", "hlth.first-aid", "hlth.body"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "General education only — for symptoms or health concerns, consult qualified health professionals.",
  }),
  health({
    id: "hlth.medications",
    title: "Medications education",
    aliases: ["drugs and medicines", "taking medication safely"],
    question: "How do medications work and how are they used safely?",
    categoryIds: ["cat-27", "cat-28"],
    summary: "Medications are substances that prevent or treat illness — used safely only with correct dosing, timing, professional guidance and awareness of side effects.",
    sections: {
      definition: "Substances used to diagnose, treat or prevent disease: how they act in the body, how they are prescribed and dispensed, and the principles of safe use — dose, schedule, interactions and side effects.",
      simple: "Medicines help the body fight illness, but they must be taken the right way: the right amount, at the right time, as prescribed.",
      detailed: "Medicines act on specific targets — killing pathogens, reducing inflammation, replacing missing substances (insulin), changing body chemistry (blood pressure, cholesterol). Safe use: take the prescribed dose and schedule; do not share medicines; finish antibiotic courses; check interactions (with other drugs, alcohol, food); report side effects; store properly; keep out of children's reach. Over-the-counter drugs still carry risks; herbal and traditional remedies can interact with medicines — disclose everything to your clinician.",
      history: "Pharmacy is ancient (herbal medicine); modern pharmacology emerged in the 19th–20th centuries with the isolation of active ingredients (morphine, aspirin), antibiotics (penicillin, 1928) and systematic clinical trials.",
      how_it_works: "A medicine is absorbed, travels to its target, acts on it, and is metabolized and eliminated; the dose balances effectiveness against side effects; prescribing considers the individual's age, weight, organs and other drugs.",
      examples: "Paracetamol for fever, antibiotics for bacterial infection, insulin for diabetes, inhalers for asthma, vaccines as preventive medicines.",
      guidance: "Never self-diagnose or self-prescribe serious conditions — this is education, not medical advice.",
    },
    misconceptions: [
      { misconception: "Natural means safe.", correction: "Many natural products are powerful — some are toxic and many interact with medicines; treat them with the same caution." },
      { misconception: "More medicine works better.", correction: "Overdosing is dangerous; the prescribed dose is the effective and safe one." },
    ],
    relatedIds: ["hlth.diseases", "hlth.body", "hlth.nutrition", "sci.chemistry"],
    sources: [SRC_WHO],
    professionalAssistanceNote: "General education only — medication decisions must be made with qualified health professionals.",
  }),
  health({
    id: "hlth.public-health",
    title: "Public health",
    aliases: ["community health", "epidemiology"],
    question: "What is public health?",
    categoryIds: ["cat-27", "cat-62", "cat-25"],
    summary: "Public health protects and improves the health of whole populations — through sanitation, vaccines, epidemiology, policy and prevention.",
    sections: {
      definition: "The science and practice of protecting and improving the health of populations: disease surveillance and control, sanitation, vaccination, health education, and policies that make healthy choices easier.",
      simple: "Public health is keeping whole communities healthy: clean water, vaccines, disease tracking and health campaigns.",
      detailed: "Public health works upstream — preventing disease rather than treating individuals: safe water and sanitation, immunization programs, tobacco and food regulation, road safety, maternal and child health, epidemic surveillance and response, and health promotion. Epidemiology — the study of disease patterns in populations — is its core science. Public health measures (sanitation, vaccines, antibiotics, safer roads) have added decades to average lifespans. Global bodies like the WHO coordinate international response.",
      history: "Modern public health grew from 19th-century sanitation reform (cholera in London — John Snow), the germ theory, vaccination programs, and 20th-century health systems; COVID-19 was the century's defining test.",
      how_it_works: "Surveillance detects outbreaks; investigation identifies causes; interventions (vaccines, sanitation, policy, education) reduce risk; evaluation measures impact; the cycle repeats — protecting everyone, especially the most vulnerable.",
      examples: "Immunization campaigns, clean-water programs, tobacco taxes, seat-belt laws, contact tracing, health-promotion campaigns.",
      guidance: "Current outbreak data and health policies are dynamic — verify with official public-health sources.",
    },
    misconceptions: [
      { misconception: "Public health is only about poor countries.", correction: "Every country needs surveillance, vaccination and prevention — the COVID-19 pandemic showed why." },
      { misconception: "Individual choices are all that matter for health.", correction: "Environment, policy and social conditions shape choices and outcomes — that is exactly what public health addresses." },
    ],
    relatedIds: ["hlth.diseases", "hlth.nutrition", "hlth.fitness", "sci.microbiology"],
    sources: [SRC_WHO],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §19 — Relationships & communication
 * ════════════════════════════════════════════════════════════════════════════ */

const RELATIONSHIP_RECORDS: KnowledgeRecord[] = [
  relationship({
    id: "rel.negotiation",
    title: "Negotiation",
    aliases: ["negotiating", "getting to yes"],
    question: "How do I negotiate well?",
    categoryIds: ["cat-32", "cat-09", "cat-31"],
    summary: "Negotiation is the art of reaching agreement when interests differ — prepare, listen, separate the person from the problem, and seek options that meet both sides' interests.",
    sections: {
      definition: "A dialogue between parties with different interests seeking a mutually acceptable agreement: preparation, interests, options, criteria and commitment.",
      simple: "Negotiation is discussing a deal until both sides can agree: know what you need, listen to what they need, and find a solution that works for both.",
      detailed: "The principled approach (Fisher & Ury's 'Getting to Yes'): separate people from the problem; focus on interests, not positions; generate options before deciding; use objective criteria. Preparation is decisive — know your BATNA (best alternative to a negotiated agreement), your limits and your target. Listen more than you talk; ask questions; test understanding; never accept a bad deal just to close. Power matters, but so do relationships — today's counterpart may be tomorrow's partner.",
      history: "Negotiation is as old as trade and diplomacy; modern theory grew from game theory, labour bargaining and the Harvard Negotiation Project (1980s).",
      how_it_works: "Prepare (interests, BATNA, criteria) → open (build rapport, share positions) → explore (ask, listen, uncover interests) → propose (options that meet both sides) → agree (commit, document) → follow up.",
      examples: "Salary negotiation, buying a car, a business contract, resolving a family dispute, international diplomacy.",
      guidance: "Good negotiation is not about winning at the other's expense — sustainable agreements meet real interests on both sides.",
    },
    misconceptions: [
      { misconception: "Negotiation means haggling over price.", correction: "Price is one variable; interests, terms, timing and relationships often matter more." },
      { misconception: "The first offer is final.", correction: "Offers are starting points; silence and questions often unlock movement." },
    ],
    relatedIds: ["rel.communication", "rel.conflict", "bus.sales", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.emotional-intelligence",
    title: "Emotional intelligence",
    aliases: ["EQ", "emotional awareness"],
    question: "What is emotional intelligence?",
    categoryIds: ["cat-24", "cat-32", "cat-89"],
    summary: "Emotional intelligence is the ability to recognize, understand and manage emotions — your own and others' — a learnable skill central to relationships and work.",
    sections: {
      definition: "The capacity to perceive, understand, use and manage emotions: self-awareness, self-regulation, motivation, empathy and social skill (the model popularized by Daniel Goleman).",
      simple: "Emotional intelligence is understanding your feelings and other people's — and handling both well instead of being ruled by them.",
      detailed: "Five components: self-awareness (knowing your emotions and their triggers), self-regulation (managing impulses and reactions), motivation (channelling emotion toward goals), empathy (reading others' feelings and perspectives), and social skill (navigating relationships). EQ is distinct from IQ and is trainable: naming emotions, pausing before reacting, active listening and perspective-taking all build it. It predicts outcomes in leadership, teamwork, teaching, parenting and conflict resolution.",
      history: "The concept grew from Thorndike's 'social intelligence' (1920), through Gardner's multiple intelligences, to Goleman's 1995 bestseller that made EQ a workplace staple.",
      how_it_works: "Emotion arises in the brain's limbic system; the prefrontal cortex regulates it; practice strengthens that regulation — naming the feeling, pausing, considering the other's view, then choosing the response rather than reacting.",
      examples: "Staying calm in a tense meeting; noticing a colleague's distress; pausing before an angry reply; comforting a friend effectively.",
      guidance: "EQ claims in business should be assessed critically — the research supports training, but 'EQ tests' vary in quality.",
    },
    misconceptions: [
      { misconception: "Emotional intelligence means being nice.", correction: "It means being aware and skilled with emotions — which sometimes requires firmness or confrontation done well." },
      { misconception: "EQ is fixed at birth.", correction: "It develops with practice across life — the brain's regulation circuits are trainable." },
    ],
    relatedIds: ["disc.psychology", "rel.communication", "rel.conflict", "bus.leadership"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §20 — Entertainment
 * ════════════════════════════════════════════════════════════════════════════ */

const ENTERTAINMENT_RECORDS: KnowledgeRecord[] = [
  entertainment({
    id: "ent.music",
    title: "Music",
    aliases: ["music theory", "musical genres"],
    question: "How does music work?",
    categoryIds: ["cat-51", "cat-50"],
    summary: "Music is organized sound — pitch, rhythm, harmony and timbre — an ancient human universal expressed in countless genres and cultures.",
    sections: {
      definition: "The art of organizing sound in time: melody (pitches), rhythm (timing), harmony (combinations of pitches), timbre (tone colour) and form (structure) — expressed across every known culture.",
      simple: "Music is sound arranged to be beautiful or meaningful: tunes, beats and voices combined in ways people make and enjoy everywhere.",
      detailed: "Core elements: pitch (how high or low), rhythm (patterns of duration), harmony (notes sounding together), dynamics (loudness) and timbre (the character of a sound — voice, guitar, drum). Music theory describes scales, chords and forms; genres — classical, jazz, rock, pop, Afrobeats, highlife, traditional musics — are cultural traditions with their own rules. Music affects emotion, memory and movement, and is studied by neuroscience and psychology as well as musicology.",
      history: "Music predates writing — bone flutes are 40 000+ years old. Notation (9th century Europe), printing (15th–16th c.), recording (1877) and streaming (2000s) each transformed how music is made and shared.",
      how_it_works: "Sound waves at different frequencies become pitches; the brain processes patterns of pitch and timing as music; culture shapes which patterns are expected and meaningful; performance and recording turn ideas into sound.",
      examples: "A lullaby, a highlife band, a symphony, Afrobeats production, a church choir, a film score.",
      guidance: "Current charts, releases and rankings are dynamic information; the elements of music are stable knowledge.",
    },
    misconceptions: [
      { misconception: "Music is universal in meaning.", correction: "The elements are universal, but genres and meanings are cultural — the same tune can mean different things in different traditions." },
      { misconception: "You need talent to make music.", correction: "Skill develops with practice; technology has made music creation accessible to nearly everyone." },
    ],
    relatedIds: ["who.fela-kuti", "ent.film", "cre.writing", "cult.diversity"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.games",
    title: "Video games",
    aliases: ["gaming", "electronic games"],
    question: "How do video games work?",
    categoryIds: ["cat-52", "cat-06", "cat-50"],
    summary: "Video games are interactive software experiences — rules, worlds and stories running on computers and consoles — now the world's largest entertainment medium.",
    sections: {
      definition: "Interactive digital experiences in which players act within simulated worlds governed by rules: genres from action and strategy to role-playing, simulation and social games.",
      simple: "Video games are computer programs you play: you control characters or worlds, face challenges, and the game responds to what you do.",
      detailed: "Games are built from: the game engine (rendering, physics, logic), game design (rules, levels, difficulty, reward), art and audio, and the narrative. Genres: action, adventure, RPG (role-playing), strategy, simulation, puzzle, sports and multiplayer online games. The industry now earns more than film and music combined; games are also used in education, training and therapy. Concerns — screen time, addiction debates, monetization ('loot boxes') — are studied alongside demonstrated benefits in problem-solving and coordination.",
      history: "Early experiments in the 1950s–60s; arcade and console era (1970s–80s); the internet added online multiplayer; mobile gaming (2008+) brought games to billions.",
      how_it_works: "The engine runs a loop: read input → update the world state → render the frame → repeat (typically 30–120 times per second); rules and physics simulate the world; AI controls opponents; servers host multiplayer; data tracks progress.",
      examples: "FIFA and football sims, Minecraft, role-playing epics, mobile puzzle games, esports titles.",
      guidance: "Current releases, ratings and platforms are dynamic information; age ratings (ESRB, PEGI) guide appropriate play.",
    },
    misconceptions: [
      { misconception: "Games cause violence.", correction: "Research finds no established causal link between game play and real-world violence; effects on attention and mood are more nuanced." },
      { misconception: "Gaming is a waste of time.", correction: "Moderation matters, but games develop problem-solving, coordination and social connection, and many careers now exist in the industry." },
    ],
    relatedIds: ["ent.film", "tech.computers", "tech.smartphones", "ent.music"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.sports",
    title: "Sports",
    aliases: ["sport", "athletics", "football"],
    question: "How does sport work as a global institution?",
    categoryIds: ["cat-56", "cat-29"],
    summary: "Sport is organized physical competition with rules — from local play to global institutions like FIFA and the Olympics, uniting billions of fans.",
    sections: {
      definition: "Organized physical activity governed by rules and competition: team and individual sports, amateur and professional, from local leagues to global championships and the Olympic Games.",
      simple: "Sport is people competing in physical games with rules — football, athletics, basketball — watched and played by billions.",
      detailed: "Sports are organized at every level: schools and clubs, national leagues, continental and world championships. Global bodies set rules and run competitions (FIFA for football, the IOC for the Olympics, World Athletics, the NBA/NFL as professional leagues). Sport generates enormous economies — media rights, sponsorship, transfers — and carries cultural and political weight (the Olympics' symbolism, World Cup nationalism). Issues include doping, corruption in governing bodies, and the balance between commercialism and the spirit of sport.",
      history: "Sport is ancient — the Greek Olympics (776 BCE onward), Mesoamerican ball games, Chinese martial traditions. Modern sport standardized in 19th-century Britain (football, cricket, tennis) and globalized through the 20th century.",
      how_it_works: "Rules define play; federations govern; leagues organize seasons; clubs field teams; athletes train and compete; referees enforce; media broadcast; fans follow — with records, rankings and titles as the shared language.",
      examples: "Football's World Cup, the Olympic Games, the NBA, the English Premier League, athletics championships.",
      guidance: "Current results, rankings and records are dynamic information to verify at query time.",
    },
    misconceptions: [
      { misconception: "Sport is apolitical.", correction: "Sport has always carried politics — boycotts, diplomatic rows, national pride — though its rules aim to keep play fair." },
      { misconception: "Winning is all that matters.", correction: "Participation, health, fair play and community are core values of sport at every level." },
    ],
    relatedIds: ["who.serena-williams", "hlth.fitness", "ent.games", "day.time-management"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §21 — Language
 * ════════════════════════════════════════════════════════════════════════════ */

const LANGUAGE_RECORDS: KnowledgeRecord[] = [
  language({
    id: "lng.grammar",
    title: "Grammar",
    aliases: ["syntax", "morphology", "grammar rules"],
    question: "What is grammar?",
    categoryIds: ["cat-54", "cat-01"],
    summary: "Grammar is the system of rules by which a language combines words into sentences — the structure every speaker uses, whether or not they can name the rules.",
    sections: {
      definition: "The system and structure of a language: morphology (how words are formed), syntax (how words combine into sentences), and the patterns of tense, number, case and agreement.",
      simple: "Grammar is the invisible machinery of language: the rules that decide how words fit together so others understand you.",
      detailed: "Grammar operates at several levels: sounds combine into words (phonology), words build into forms (morphology — 'walk', 'walked', 'walking'), and forms combine into sentences (syntax — subject, verb, object). Every language has its own grammar; 'correct' grammar is partly the underlying system and partly the standardized form that prestige usage and education enforce. Learning grammar as rules helps learners, but native speakers acquire most of it unconsciously.",
      history: "Grammar study began in ancient India (Panini's Sanskrit grammar, c. 500 BCE), Greece and Rome; the modern scientific study treats all grammars as equally systematic.",
      how_it_works: "Speakers internalize patterns from exposure; the brain generates sentences by combining words according to those patterns; meaning depends on word order, inflections and context.",
      examples: "English word order (subject-verb-object), noun genders in French and German, the case system of Arabic and Russian, tone in Yoruba and Mandarin.",
      guidance: "Descriptive grammar (how people speak) and prescriptive grammar (how some say people should speak) are different lenses — both are useful in their place.",
    },
    misconceptions: [
      { misconception: "Some languages have no grammar.", correction: "Every language has a full grammar; 'no grammar' usually means no standardized written form." },
      { misconception: "Grammar is a set of boring rules to memorize.", correction: "It is the living structure of thought and communication — rules describe it, they do not create it." },
    ],
    relatedIds: ["lng.learning", "lng.translation", "lng.linguistics", "cre.writing"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.linguistics",
    title: "Linguistics",
    aliases: ["language science", "linguistic studies"],
    question: "What is linguistics?",
    categoryIds: ["cat-54", "cat-26", "cat-01"],
    summary: "Linguistics is the scientific study of language — sounds, structures, meanings, change and the human capacity for language itself.",
    sections: {
      definition: "The scientific study of language: phonetics and phonology (sounds), morphology and syntax (structure), semantics and pragmatics (meaning), sociolinguistics (language in society), historical linguistics (change), and psycholinguistics (language in the mind).",
      simple: "Linguistics is the science of language: how sounds become words, how words become sentences, how languages change, and how children learn to speak.",
      detailed: "Core fields: phonetics (physical sounds), phonology (sound systems), morphology (word structure), syntax (sentence structure), semantics (meaning), pragmatics (meaning in context), sociolinguistics (dialects, variation, language and identity), historical linguistics (how languages change and are related — language families), psycholinguistics and neurolinguistics (how the brain processes language). Linguistics also feeds technology — speech recognition, translation and language models.",
      history: "Linguistics began with ancient grammarians; the 19th century established historical linguistics; Saussure and structuralism (early 20th c.) founded modern theory; Chomsky (1957+) reframed it as the study of the mind's language faculty.",
      how_it_works: "Linguists observe and analyse data — recordings, corpora, speaker judgements — to discover the patterns (rules) speakers unconsciously follow, then test theories about how language is acquired, processed and changed.",
      examples: "Documenting an endangered language; analysing dialects in a city; building a speech-recognition system; reconstructing a proto-language.",
      guidance: "Linguistics is descriptive: it studies how language is, not how some believe it 'should' be.",
    },
    misconceptions: [
      { misconception: "Linguists speak many languages.", correction: "Linguists study how language works; many are monolingual — polyglots are a different skill set." },
      { misconception: "Linguistics is about correct grammar.", correction: "It describes all varieties systematically; 'correctness' is a social judgement, not a scientific one." },
    ],
    relatedIds: ["lng.grammar", "lng.learning", "lng.translation", "disc.history"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §22 — Everyday life
 * ════════════════════════════════════════════════════════════════════════════ */

const EVERYDAY_RECORDS: KnowledgeRecord[] = [
  everyday({
    id: "day.shopping",
    title: "Smart shopping",
    aliases: ["buying wisely", "consumer skills"],
    question: "How do I shop smartly?",
    categoryIds: ["cat-90", "cat-11"],
    summary: "Smart shopping means deciding before you buy — needs vs wants, price comparison, unit prices, reviews and return policies — to get real value without waste.",
    sections: {
      definition: "The skills of spending well: planning purchases, comparing prices and quality, resisting impulse and manipulative marketing, understanding warranties and returns, and buying only what serves your real needs.",
      simple: "Smart shopping is thinking before buying: do you need it, is the price fair, is the quality good — and can you return it if it's wrong?",
      detailed: "Before buying: set a budget and a need; research options and reviews; compare total cost (price, shipping, maintenance); check unit prices for groceries (price per kg/litre); beware marketing tricks (urgency, 'limited time', anchoring, subscription traps); understand refund and warranty policies; keep receipts. For big purchases, sleep on it. Online, verify the seller, read reviews critically (fake reviews exist) and pay through protected methods.",
      history: "Consumer protection grew through the 20th century — advertising regulation, consumer rights (the 'right to return' in many countries), product safety laws — and digital shopping added new tools and new traps.",
      how_it_works: "Need → research → compare → decide → buy → verify (receipt, warranty) → review. Each step is cheap; skipping them is how money leaks.",
      examples: "Comparing unit prices in a supermarket; checking a phone's reviews before buying; avoiding an impulse purchase by waiting 24 hours.",
      guidance: "Consumer rights differ by country and change — verify current rules on returns, warranties and online purchases.",
    },
    misconceptions: [
      { misconception: "More expensive means better.", correction: "Price reflects brand, marketing and costs as much as quality — reviews and specifications tell the real story." },
      { misconception: "Sales always save money.", correction: "'Discounts' are often from inflated reference prices — the unit price and your need decide the true value." },
    ],
    relatedIds: ["ins.create-budget", "bus.budgeting", "day.time-management", "bus.ecommerce"],
    sources: [SRC_BRITANNICA],
  }),
  everyday({
    id: "day.basic-tech",
    title: "Basic technology skills",
    aliases: ["digital literacy", "using technology"],
    question: "What basic technology skills does everyone need?",
    categoryIds: ["cat-04", "cat-90", "cat-75"],
    summary: "Basic digital skills — using devices, the internet, email, search, safety and files — are now essential life skills for work, money and communication.",
    sections: {
      definition: "The everyday skills of using digital technology: operating a device, connecting to the internet, using email and search, handling files and passwords, recognizing scams, and using essential apps.",
      simple: "Basic tech skills are the digital everyday essentials: using a phone or computer, going online, emailing, searching, and staying safe from scams.",
      detailed: "Core skills: powering and navigating a device (phone/computer); connecting to Wi-Fi and managing data; using a browser and search engines; email (write, attach, organize); files (save, find, back up); passwords and two-factor authentication; recognizing phishing and scams; video calls; and essential apps (banking, maps, messaging, government services). Digital literacy also means evaluating online information and understanding privacy settings.",
      history: "Digital skills went from specialist to universal in one generation: computers in homes (1980s), the internet (1990s), smartphones (2000s) and app-based life (2010s) made them essential.",
      how_it_works: "Devices run operating systems and apps; the internet connects them; accounts and passwords identify you; data lives in files and the cloud; skills compound — each one learned makes the next easier.",
      examples: "Sending an email with an attachment; paying a bill in a banking app; joining a video call; spotting a phishing message.",
      guidance: "Technology changes fast — official help pages, libraries and community classes are reliable places to learn.",
    },
    misconceptions: [
      { misconception: "You must be young to learn technology.", correction: "Adults and seniors learn digital skills successfully every day with patient, structured teaching." },
      { misconception: "If it looks official, it is safe.", correction: "Scammers imitate banks and agencies exactly — verify through official channels, never links in messages." },
    ],
    relatedIds: ["tech.computers", "tech.smartphones", "tech.cybersecurity", "ins.use-ai"],
    sources: [SRC_BRITANNICA],
  }),
  everyday({
    id: "day.parenting",
    title: "Parenting education",
    aliases: ["raising children", "child development basics"],
    question: "What are the basics of good parenting?",
    categoryIds: ["cat-30", "cat-61", "cat-24"],
    summary: "Good parenting rests on warmth, structure and responsiveness: children thrive with secure attachment, consistent boundaries, positive attention and age-appropriate autonomy.",
    sections: {
      definition: "The evidence-informed practice of raising children: providing safety, nutrition and health care; building secure attachment through warmth and responsiveness; setting consistent, age-appropriate boundaries; and supporting development, learning and autonomy.",
      simple: "Good parenting is love plus structure: be warm and available, set clear and consistent rules, and let children grow step by step.",
      detailed: "Research (attachment theory, developmental science) points to four pillars: warmth (responsive love builds secure attachment), structure (consistent, explained boundaries build self-regulation), stimulation (talk, play, reading build learning), and autonomy (age-appropriate choices build confidence). Discipline should teach rather than shame — natural consequences, calm limits, repair after conflict. Parenting styles range from permissive to authoritarian; the evidence favours 'authoritative' — high warmth with clear limits. Parents also need self-care and support: it is a skill learned by doing.",
      history: "Child-rearing advice has shifted from strict obedience toward child-centred approaches; developmental science (Piaget, Bowlby, Vygotsky) and longitudinal studies now inform practice.",
      how_it_works: "Children learn through relationships: responsive care builds secure attachment; consistent limits build self-control; language-rich interaction builds cognition; guided autonomy builds confidence — each stage building on the last.",
      examples: "Reading to a toddler daily; explaining a limit calmly ('we hold hands near the road'); praising effort rather than only results; letting a teenager make and learn from low-risk decisions.",
      guidance: "Parenting advice should be evidence-informed and respectful of culture and context — there is no single correct recipe for every family.",
    },
    misconceptions: [
      { misconception: "Spanking is an effective discipline tool.", correction: "Research links physical punishment to worse long-term outcomes; consistent, calm limit-setting works better." },
      { misconception: "Parents must be perfect.", correction: "Repair after mistakes — apologizing and reconnecting — teaches children more than flawlessness would." },
    ],
    relatedIds: ["disc.psychology", "rel.conflict", "hlth.nutrition", "day.time-management"],
    sources: [SRC_WHO, SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §23 — Creative
 * ════════════════════════════════════════════════════════════════════════════ */

const CREATIVE_RECORDS: KnowledgeRecord[] = [
  creative({
    id: "cre.graphic-design",
    title: "Graphic design",
    aliases: ["visual design", "design basics"],
    question: "How do I learn graphic design?",
    categoryIds: ["cat-50", "cat-71", "cat-04"],
    summary: "Graphic design is visual communication — combining typography, colour, layout and imagery to inform, persuade and delight.",
    sections: {
      definition: "The practice of visual communication: arranging type, images, colour and space to convey messages — across print (posters, packaging), screens (websites, apps, social media) and brands.",
      simple: "Graphic design is making things look good and communicate clearly: choosing fonts, colours and layouts so a message is seen and understood.",
      detailed: "Core principles: hierarchy (what the eye sees first), alignment and grid (order), contrast (emphasis), repetition (consistency), balance and whitespace. Elements: typography (choosing and pairing typefaces), colour theory (harmony, meaning, accessibility), layout and composition, and imagery. Tools: Adobe (Photoshop, Illustrator, InDesign), Figma, Canva and open-source alternatives (GIMP, Inkscape). Designers work in branding, editorial, web/UI, packaging, motion and social content — and accessibility is a core skill, not an afterthought.",
      history: "Modern graphic design grew from printing, advertising and the Bauhaus school (early 20th century); the computer (1980s–90s) and the web democratized the tools.",
      how_it_works: "Brief → research → concepts → sketches → refinement → delivery. Good design solves the brief: it communicates the message to the intended audience, not just decorates.",
      examples: "A logo and brand system; a poster; an app interface; a social-media template; a book cover.",
      guidance: "Design judgement improves with practice and critique — study great work, iterate, and test designs with real users.",
    },
    misconceptions: [
      { misconception: "Design is just making things pretty.", correction: "Aesthetics serve communication: the measure is whether the message lands with the audience." },
      { misconception: "You need expensive software to start.", correction: "Free tools (Figma, Canva, GIMP, Inkscape) are enough to learn the principles and build a portfolio." },
    ],
    relatedIds: ["cre.writing", "cre.content-creation", "bus.marketing", "tech.web-development"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.photography",
    title: "Photography",
    aliases: ["taking photos", "photography basics"],
    question: "How do I take better photographs?",
    categoryIds: ["cat-50", "cat-04"],
    summary: "Photography is the art and craft of capturing light — learning exposure, composition and light turns any camera into a tool for seeing.",
    sections: {
      definition: "The art and practice of creating images by recording light: technical skills (exposure, focus, equipment) and visual skills (composition, light, storytelling).",
      simple: "Photography is drawing with light: point a camera, choose what to include, and capture the moment well.",
      detailed: "The exposure triangle: aperture (how much light — also controls depth of field), shutter speed (freezing or blurring motion) and ISO (sensitivity — higher adds noise). Composition: rule of thirds, leading lines, framing, balance, and deciding what to exclude. Light is everything — golden hour, direction, soft vs hard. Post-processing (editing) refines, not rescues, images. Genres: portrait, landscape, street, documentary, product, event. Phone cameras are now excellent; the eye behind the camera matters most.",
      history: "Photography began in the 1830s (daguerreotype); film and mass cameras made it universal in the 20th century; digital and phone photography transformed it after 2000.",
      how_it_works: "Light passes through the lens and strikes a sensor (or film); exposure balances aperture, shutter and ISO; focus selects the subject; composition arranges the frame; the image is stored and edited.",
      examples: "A well-lit portrait, a landscape at sunrise, an event photo that captures the moment, a product shot for a shop.",
      guidance: "Practice deliberately: shoot often, review critically, learn from failures, and study photographers whose work you admire.",
    },
    misconceptions: [
      { misconception: "Expensive cameras take great photos.", correction: "Great photos come from seeing and technique; a skilled photographer with a phone often outshoots a beginner with a pro camera." },
      { misconception: "Editing is cheating.", correction: "Editing is part of the craft — every published photo is processed in some form." },
    ],
    relatedIds: ["cre.graphic-design", "cre.content-creation", "day.basic-tech", "trv.planning"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.content-creation",
    title: "Content creation",
    aliases: ["creating content", "social media content"],
    question: "How do I create content people value?",
    categoryIds: ["cat-72", "cat-71", "cat-50"],
    summary: "Content creation is producing media that informs, entertains or helps an audience — built on a clear niche, consistent value and genuine connection.",
    sections: {
      definition: "The practice of producing and publishing media — articles, videos, podcasts, posts, images — for an audience, balancing creativity, consistency and understanding of the platform.",
      simple: "Content creation is making things people want to watch, read or hear — regularly — and sharing them where the audience is.",
      detailed: "The essentials: choose a niche you know and care about; define the audience and the value you give them (educate, entertain, inspire, solve); plan a content mix and a sustainable schedule; craft strong hooks and clear structure; optimize for the platform (format, length, trends) without losing your voice; engage with comments; and measure what works, then iterate. Growth is slow and compounding — consistency and genuine value beat viral one-offs. Monetization (ads, sponsorships, products) follows audience trust, and disclosure rules apply.",
      history: "Content moved from broadcasting to creation with blogs (2000s), YouTube (2005), social platforms (2010s) and the creator economy — full-time careers built on audiences.",
      how_it_works: "Research the audience → plan the content → create (write/film/design) → publish → promote → engage → measure → repeat. Platforms' algorithms reward consistency and engagement, but the audience's trust is the real asset.",
      examples: "A cooking channel posting weekly recipes; a newsletter analysing politics; a TikTok account teaching history in 60 seconds.",
      guidance: "Platform rules, trends and monetization change constantly — verify current policies; disclose sponsored content honestly.",
    },
    misconceptions: [
      { misconception: "Going viral is the goal.", correction: "Viral moments fade; a loyal audience that returns is the durable asset." },
      { misconception: "You need expensive equipment to start.", correction: "A phone and a clear idea are enough to begin; quality improves with practice." },
    ],
    relatedIds: ["cre.writing", "cre.photography", "bus.marketing", "ins.use-ai"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §18 — Travel
 * ════════════════════════════════════════════════════════════════════════════ */

const TRAVEL_RECORDS: KnowledgeRecord[] = [
  travel({
    id: "trv.accommodation",
    title: "Travel accommodation",
    aliases: ["hotels", "where to stay"],
    question: "How do I choose travel accommodation?",
    categoryIds: ["cat-35", "cat-90"],
    summary: "Choosing where to stay means balancing location, budget, safety and needs — hotels, guesthouses, hostels, apartments and homestays each fit different trips.",
    sections: {
      definition: "The options for lodging while travelling — hotels, guesthouses, hostels, serviced apartments, holiday rentals, homestays, campsites — and the criteria for choosing: location, price, safety, amenities and reviews.",
      simple: "Where you sleep on a trip should fit your budget, your plans and your comfort: location matters most, then price and reviews.",
      detailed: "Match the type to the trip: hotels (service, reliability), guesthouses and B&Bs (local character), hostels (budget, social), apartments/rentals (space, kitchens, longer stays), homestays (culture). Criteria: location (proximity to what you need, transport, safety of the area), price (plus hidden fees — taxes, deposits), reviews (read recent ones critically; fake reviews exist), amenities (Wi-Fi, breakfast, parking), and cancellation policy. Book through reputable platforms or directly, keep confirmations, and check the address and check-in details in advance.",
      history: "Inns are ancient; the modern hotel industry grew with railways and mass tourism in the 19th century; booking platforms (2000s) and home-sharing (2010s) transformed choice and price transparency.",
      how_it_works: "Search with your dates and filters → compare location, price and reviews → check the cancellation policy and hidden fees → book (direct or platform) → confirm → check in with documents ready.",
      examples: "A hostel near a station for a budget city break; a serviced apartment for a family week; a beach hotel for a resort holiday.",
      guidance: "Prices, availability and policies change constantly — they are dynamic information; verify directly before booking.",
    },
    misconceptions: [
      { misconception: "Cheapest is best for budget travel.", correction: "The cheapest option in a poor location can cost more in transport, time and safety." },
      { misconception: "Rated 5 stars means perfect.", correction: "Ratings reflect category, not just quality — a 3-star inn can be excellent within its class." },
    ],
    relatedIds: ["trv.planning", "trv.safety", "ins.travel-international", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  travel({
    id: "trv.planning",
    title: "Trip planning",
    aliases: ["planning a trip", "itinerary"],
    question: "How do I plan a trip?",
    categoryIds: ["cat-35", "cat-88"],
    summary: "Good trip planning works backward from your budget and time: decide the destination, book the big items, then build a flexible day-by-day plan with buffers.",
    sections: {
      definition: "The process of organizing a journey: destination choice, budget, dates, transport and accommodation booking, an itinerary with flexibility, documents, and contingencies.",
      simple: "Plan a trip by deciding where, when and how much — then book the important things (flights, beds) and sketch a loose plan with room to wander.",
      detailed: "Work backward: total budget → destination and dates → transport (compare flights/trains/buses; book early for price, late for flexibility) → accommodation → activities (book must-dos in advance, keep the rest flexible) → documents (passport, visa, insurance, bookings) → practicals (currency, SIM/data, health). Build in buffers — travel days are not sightseeing days. A good itinerary is 60–70% planned and the rest open; overplanning is a common mistake. Share your plan with someone at home and keep digital copies of documents.",
      history: "Travel planning changed from guidebooks and travel agents to online booking, reviews and apps — while the fundamentals (budget, documents, buffers) stayed constant.",
      how_it_works: "Decide → budget → book the big items → plan day by day with buffers → prepare documents and health → go, adapt, and track spending as you travel.",
      examples: "A weekend city break with pre-booked hotel and one tour; a month-long backpacking trip with only the first week booked.",
      guidance: "Prices, visa rules and safety conditions change — verify current details with official sources close to departure.",
    },
    misconceptions: [
      { misconception: "Every day must be planned.", correction: "Overplanned trips exhaust travellers; the best experiences often come from unplanned hours." },
      { misconception: "Booking everything early saves money.", correction: "Early booking suits peak demand; last-minute deals suit flexible travellers — compare per trip." },
    ],
    relatedIds: ["trv.accommodation", "trv.safety", "ins.travel-international", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
];

export const KNOWLEDGE_SEED_EXPANSION: KnowledgeRecord[] = [
  ...PERSON_RECORDS,
  ...PLACE_RECORDS,
  ...DISCIPLINE_RECORDS,
  ...SCIENCE_RECORDS,
  ...TECH_RECORDS,
  ...BUSINESS_RECORDS,
  ...CAREER_RECORDS,
  ...LAW_RECORDS,
  ...HEALTH_RECORDS,
  ...RELATIONSHIP_RECORDS,
  ...ENTERTAINMENT_RECORDS,
  ...LANGUAGE_RECORDS,
  ...EVERYDAY_RECORDS,
  ...CREATIVE_RECORDS,
  ...TRAVEL_RECORDS,
];
