/**
 * Session 140 — Curated knowledge seed (part 2: people, timeline events,
 * places).
 *
 * PEOPLE records carry verified biographical information, achievements,
 * historical context and sources (spec §5). TIMELINE events feed the global
 * timeline engine with approximate dates where precision is impossible —
 * labelled honestly (spec §6). PLACE records connect geography to history,
 * politics, economics and culture (spec §7); current figures (population,
 * GDP) are deliberately NOT memorized — they are dynamic information.
 */
import type { KnowledgeRecord } from "@windels/shared";
import { KNOWLEDGE_SEED_DATE } from "./knowledge.seed.js";
import type { KnowledgeReference } from "@windels/shared";

const SRC_BRITANNICA: KnowledgeReference = { label: "Encyclopaedia Britannica", url: "https://www.britannica.com" };
const SRC_UN: KnowledgeReference = { label: "United Nations", url: "https://www.un.org" };
const SRC_NOBEL: KnowledgeReference = { label: "The Nobel Prize organization", url: "https://www.nobelprize.org" };
const SRC_NASA: KnowledgeReference = { label: "NASA", url: "https://www.nasa.gov" };
const SRC_HISTORY: KnowledgeReference = { label: "US National Archives", url: "https://www.archives.gov" };
const SRC_WHO: KnowledgeReference = { label: "World Health Organization", url: "https://www.who.int" };

interface SeedInput {
  id: string;
  title: string;
  aliases?: string[];
  question: string;
  categoryIds: string[];
  summary: string;
  sections: Partial<Record<string, string>>;
  misconceptions?: KnowledgeRecord["misconceptions"];
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
    misconceptions: input.misconceptions,
    relatedIds: input.relatedIds,
    sources: input.sources,
    lastUpdated: KNOWLEDGE_SEED_DATE,
    verificationNote: input.verificationNote,
    professionalAssistanceNote: input.professionalAssistanceNote,
  };
}

const person = (input: SeedInput): KnowledgeRecord =>
  build("person", "stable", ["definition", "research", "history"], input);

interface TimelineSeedInput extends SeedInput {
  dateLabel: string;
  year: number | null;
  eraId: string;
}

const timelineEvent = (input: TimelineSeedInput): KnowledgeRecord => {
  const record = build("timeline_event", "stable", ["history", "definition"], input);
  return { ...record, dateLabel: input.dateLabel, year: input.year, eraId: input.eraId };
};

const place = (input: SeedInput): KnowledgeRecord =>
  build("place", "stable", ["definition", "explanation", "history"], input);

/* ════════════════════════════════════════════════════════════════════════════
 * 5. "WHO…?" KNOWLEDGE — people
 * ════════════════════════════════════════════════════════════════════════════ */

const PERSON_RECORDS: KnowledgeRecord[] = [
  person({
    id: "who.mandela",
    title: "Nelson Mandela",
    aliases: ["madiba", "mandela"],
    question: "Who was Nelson Mandela?",
    categoryIds: ["cat-20", "cat-19", "cat-69"],
    summary: "Nelson Mandela (1918–2013) was a South African anti-apartheid leader, political prisoner for 27 years, and the country's first democratically elected president (1994–1999), awarded the Nobel Peace Prize in 1993.",
    sections: {
      biography: "Nelson Rolihlahla Mandela was born on 18 July 1918 in Mvezo, in what is now South Africa's Eastern Cape. He studied law and joined the African National Congress (ANC) in 1944, becoming a leader of the struggle against apartheid — the system of institutionalized racial segregation and white-minority rule. He was imprisoned from 1962 to 1990, much of it on Robben Island, and became a global symbol of resistance. Released in 1990, he led negotiations that ended apartheid, and in 1994 he was elected president in South Africa's first fully democratic election. He served one term, stepping down in 1999, and spent his later years on peace, children's rights and HIV/AIDS advocacy. He died on 5 December 2013.",
      simple: "Nelson Mandela fought for equal rights for all South Africans, spent 27 years in prison for it, and became the country's first Black president. He is remembered worldwide for forgiveness and peace.",
      achievements: "Nobel Peace Prize (1993, shared with F. W. de Klerk); first democratically elected president of South Africa (1994); leader of the negotiations that dismantled apartheid; Order of Merit and numerous international honours; founder of the Nelson Mandela Foundation.",
      historical_context: "Mandela's life spanned South Africa's journey from British colony to apartheid state (1948–1994) to democracy. His leadership combined mass mobilization, principled negotiation and reconciliation — including the Truth and Reconciliation Commission — in a transition widely studied as a model of peaceful change.",
      guidance: "Mandela's legacy is honoured globally, but South Africa's post-apartheid history also includes persistent inequality, poverty and political challenges — a full picture includes both.",
    },
    misconceptions: [
      { misconception: "Mandela was always a pacifist.", correction: "He initially supported the armed wing of the ANC (Umkhonto we Sizwe) in the early 1960s while advocating mass resistance; his later leadership emphasized reconciliation." },
      { misconception: "Mandela ended apartheid alone.", correction: "The transition was won by a mass movement, international pressure and negotiations involving many leaders and organizations." },
    ],
    relatedIds: ["era-contemporary", "why.elections", "con.human-rights"],
    sources: [SRC_BRITANNICA, SRC_NOBEL],
  }),
  person({
    id: "who.curie",
    title: "Marie Curie",
    aliases: ["marie sklodowska-curie", "madame curie"],
    question: "Who was Marie Curie?",
    categoryIds: ["cat-02", "cat-20"],
    summary: "Marie Curie (1867–1934) was a Polish-French physicist and chemist who pioneered radioactivity research and remains the only person to win Nobel Prizes in two different sciences.",
    sections: {
      biography: "Maria Salomea Skłodowska was born on 7 November 1867 in Warsaw, then under Russian rule. She moved to Paris to study at the Sorbonne, where she met Pierre Curie, whom she married in 1895. Together they discovered polonium (named for her homeland) and radium, and she coined the term 'radioactivity'. She was the first woman to win a Nobel Prize (Physics 1903, shared), the first person to win two (Chemistry 1911), and the first woman professor at the Sorbonne. During World War I she organized mobile X-ray units. She died in 1934 from an illness related to her lifelong exposure to radiation.",
      simple: "Marie Curie discovered how some materials give off energy — radioactivity — and found two new elements. She won two Nobel Prizes and helped invent mobile X-ray machines in wartime.",
      achievements: "Nobel Prize in Physics 1903; Nobel Prize in Chemistry 1911; discovery of polonium and radium; pioneer of radiation therapy for cancer; founder of the Curie Institutes in Paris and Warsaw.",
      historical_context: "Curie worked at a time when women were barred from most universities and laboratories. Her research opened the field of nuclear physics and changed medicine; her notebooks remain radioactive and are stored in lead-lined boxes.",
      guidance: "Her scientific achievements are stable, well-documented history; assessments of her legacy focus on science, education and the medical uses of radiation.",
    },
    misconceptions: [
      { misconception: "Curie discovered radiation.", correction: "Radioactivity was first observed by Henri Becquerel (1896); Curie named the phenomenon and discovered new radioactive elements." },
      { misconception: "She won the Nobel Prize alone.", correction: "Her 1903 Physics Prize was shared with Pierre Curie and Henri Becquerel." },
    ],
    relatedIds: ["sci.physics", "era-industrial", "sci.chemistry"],
    sources: [SRC_BRITANNICA, SRC_NOBEL],
  }),
  person({
    id: "who.einstein",
    title: "Albert Einstein",
    aliases: ["einstein"],
    question: "Who was Albert Einstein?",
    categoryIds: ["cat-02", "cat-20"],
    summary: "Albert Einstein (1879–1955) was a German-born theoretical physicist whose theories of relativity transformed physics and whose work underpins modern technology from GPS to nuclear energy.",
    sections: {
      biography: "Albert Einstein was born on 14 March 1879 in Ulm, Germany. Working as a patent clerk in Bern, he published four revolutionary papers in 1905 (the 'miracle year'): the photoelectric effect, Brownian motion, special relativity and mass–energy equivalence (E=mc²). In 1915 he completed general relativity, predicting that gravity bends light — confirmed in 1919, making him world-famous. He won the 1921 Nobel Prize in Physics (for the photoelectric effect). A pacifist and later an outspoken critic of Nazism, he emigrated to the United States in 1933 and worked at Princeton. He died on 18 April 1955.",
      simple: "Albert Einstein was a scientist who discovered that space and time are connected, that light bends near heavy things, and that energy and mass are the same thing (E=mc²).",
      achievements: "Nobel Prize in Physics 1921; special and general relativity; explanation of the photoelectric effect (foundation of quantum theory); contributions to statistical mechanics and cosmology; his letters warned the US about atomic weapons, and he became an advocate for nuclear disarmament.",
      historical_context: "Einstein worked through two world wars and the rise of Nazism; his theories were tested and confirmed by generations of experiments, from Eddington's 1919 eclipse expedition to gravitational-wave detectors a century later.",
      guidance: "Einstein's physics is stable, verified science; popular claims that he 'failed math' are myths — he excelled at mathematics from an early age.",
    },
    misconceptions: [
      { misconception: "Einstein failed mathematics at school.", correction: "He mastered calculus as a teenager; the myth stems from a misunderstanding of a grading scale." },
      { misconception: "Einstein helped build the atomic bomb.", correction: "His 1939 letter helped initiate the Manhattan Project, but he took no part in the work and later campaigned against nuclear weapons." },
    ],
    relatedIds: ["sci.physics", "era-modern", "who.curie"],
    sources: [SRC_BRITANNICA, SRC_NOBEL],
  }),
  person({
    id: "who.lovelace",
    title: "Ada Lovelace",
    aliases: ["ada byron", "countess of lovelace"],
    question: "Who was Ada Lovelace?",
    categoryIds: ["cat-06", "cat-20", "cat-03"],
    summary: "Ada Lovelace (1815–1852) was an English mathematician who wrote the first published algorithm intended for a machine — Charles Babbage's Analytical Engine — and is regarded as the first computer programmer.",
    sections: {
      biography: "Augusta Ada Byron, Countess of Lovelace, was born on 10 December 1815 in London, the only legitimate child of the poet Lord Byron. Her mother steered her toward mathematics to counter poetic influence. In 1843 she published a translation of an Italian article on Charles Babbage's Analytical Engine, adding extensive notes — including an algorithm for computing Bernoulli numbers, generally considered the first computer program. She understood the machine's potential to go beyond arithmetic, foreseeing that it could manipulate symbols and even compose music. She died of cancer on 27 November 1852, aged 36.",
      simple: "Ada Lovelace wrote instructions for a machine that was never built — the first computer program in history — and imagined computers doing more than math, like creating music.",
      achievements: "The first published algorithm for a general-purpose machine (1843); the 'Ada' programming language (1980) is named in her honour; her notes anticipated the distinction between data and instructions.",
      historical_context: "The Analytical Engine was designed but never completed in Babbage's lifetime. Lovelace's notes became foundational documents when computing emerged a century later — which is why her foresight is studied by historians of computing.",
      guidance: "Her status as 'first programmer' is widely accepted but debated by historians — a healthy example of DISPUTED nuance; the core facts of her work are well documented.",
    },
    misconceptions: [
      { misconception: "Ada Lovelace built the first computer.", correction: "She wrote programs for Charles Babbage's Analytical Engine, which was designed but never completed." },
      { misconception: "She only translated someone else's work.", correction: "Her original notes were longer than the article and contained the algorithmic insight that makes her contribution historic." },
    ],
    relatedIds: ["disc.computer-science", "con.algorithm", "era-industrial"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.gandhi",
    title: "Mahatma Gandhi",
    aliases: ["gandhi", "mohandas gandhi"],
    question: "Who was Mahatma Gandhi?",
    categoryIds: ["cat-20", "cat-19", "cat-23"],
    summary: "Mahatma Gandhi (1869–1948) was an Indian lawyer and political leader who developed nonviolent resistance (satyagraha) and led India's independence movement against British rule.",
    sections: {
      biography: "Mohandas Karamchand Gandhi was born on 2 October 1869 in Porbandar, India. He trained as a lawyer in London and first used nonviolent protest in South Africa (1893–1914) against discrimination. Returning to India, he led mass campaigns — non-cooperation, the Salt March (1930), Quit India (1942) — that combined mass participation with strict nonviolence. India gained independence in 1947, but the subcontinent was partitioned and Gandhi was assassinated on 30 January 1948 by a Hindu nationalist who opposed his efforts at Hindu-Muslim reconciliation.",
      simple: "Gandhi led India to freedom from British rule without an army — using peaceful protests, boycotts and marches. His methods inspired movements for justice worldwide.",
      achievements: "Leadership of India's independence movement; development of satyagraha (nonviolent resistance); the Salt March of 1930; inspiration for Martin Luther King Jr., Nelson Mandela and many others; his birthday (2 October) is the International Day of Non-Violence.",
      historical_context: "Gandhi operated within a complex independence struggle involving many leaders, parties and strategies. His moral authority was central, but independence was won by a broad movement — and the partition of India and Pakistan marked its tragic cost.",
      guidance: "Gandhi is honoured worldwide, but historians also examine his views and methods critically — including his positions on caste and race — as part of a full portrait.",
    },
    misconceptions: [
      { misconception: "Gandhi single-handedly freed India.", correction: "Independence resulted from a mass movement involving millions, many organizations, and changing British circumstances; Gandhi was its most famous leader." },
      { misconception: "Gandhi's nonviolence was passive weakness.", correction: "Satyagraha was an active, confrontational strategy of mass civil disobedience designed to force change." },
    ],
    relatedIds: ["era-modern", "who.mandela", "con.human-rights"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  person({
    id: "who.maathai",
    title: "Wangari Maathai",
    aliases: ["maathai", "green belt movement"],
    question: "Who was Wangari Maathai?",
    categoryIds: ["cat-20", "cat-40", "cat-69"],
    summary: "Wangari Maathai (1940–2011) was a Kenyan environmental and political activist who founded the Green Belt Movement and became the first African woman to win the Nobel Peace Prize (2004).",
    sections: {
      biography: "Wangari Muta Maathai was born on 1 April 1940 in Nyeri, Kenya. She studied in the United States and became the first woman in East Africa to earn a doctorate, and the first female professor in Kenya. In 1977 she founded the Green Belt Movement, which mobilized rural women to plant tens of millions of trees to restore land and livelihoods. She campaigned against deforestation and land grabbing, was beaten and arrested under the Moi government, and later served as a member of parliament and Assistant Minister for Environment. She won the Nobel Peace Prize in 2004 — the first African woman — and died on 25 September 2011.",
      simple: "Wangari Maathai started a movement in Kenya where communities — especially women — plant trees to protect the land. Her work connecting the environment, peace and rights won the Nobel Peace Prize.",
      achievements: "Nobel Peace Prize 2004; founder of the Green Belt Movement (50+ million trees planted); first woman in East Africa with a doctorate; UN Messenger of Peace; co-founder of the Nobel Women's Initiative.",
      historical_context: "Maathai connected environmental degradation with poverty, governance and conflict — arguing that peace is impossible where land and livelihoods are destroyed. Her work helped put environmental issues at the centre of the peace agenda.",
      guidance: "The Green Belt Movement's current projects and statistics are dynamic information; her historical role is well documented.",
    },
    misconceptions: [
      { misconception: "She won the Peace Prize for planting trees alone.", correction: "The prize recognized the link she built between environmental protection, democracy and peace." },
      { misconception: "The Green Belt Movement was only about trees.", correction: "It was also a women's empowerment, land-rights and governance movement." },
    ],
    relatedIds: ["era-contemporary", "place.kenya", "sci.environmental-science"],
    sources: [SRC_BRITANNICA, SRC_NOBEL],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 6. "WHEN…?" KNOWLEDGE — global timeline engine (§16)
 * ════════════════════════════════════════════════════════════════════════════ */

const TIMELINE_RECORDS: KnowledgeRecord[] = [
  timelineEvent({
    id: "when.homo-sapiens",
    title: "Homo sapiens emerges in Africa",
    dateLabel: "c. 300 000 years ago",
    year: -298000,
    eraId: "era-prehistory",
    question: "When did modern humans appear?",
    categoryIds: ["cat-20", "cat-26"],
    summary: "The earliest fossil evidence of Homo sapiens, found in Africa, dates to roughly 300 000 years ago.",
    sections: {
      summary: "Fossils from Jebel Irhoud (Morocco) and Omo Kibish (Ethiopia) place the emergence of anatomically modern humans in Africa around 300 000 years ago; dates are approximate and debated within narrow margins.",
      detailed: "Modern humans then spread across Africa and, from about 70 000–60 000 years ago, beyond the continent, interbreeding with other human species such as Neanderthals and Denisovans.",
    },
    relatedIds: ["era-prehistory", "sci.biology"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.writing",
    title: "Earliest writing appears (Sumer)",
    dateLabel: "c. 3400–3100 BCE",
    year: -3400,
    eraId: "era-ancient",
    question: "When was writing invented?",
    categoryIds: ["cat-20", "cat-54"],
    summary: "The earliest known writing — cuneiform — emerged in southern Mesopotamia (Sumer) around 3400–3100 BCE, followed by Egyptian hieroglyphs; independent writing systems later appeared in China and Mesoamerica.",
    sections: {
      summary: "Writing began as accounting marks on clay tokens, developing into full script. It marks the traditional boundary between prehistory and history.",
      detailed: "Other independent inventions of writing include Chinese oracle-bone script (c. 1200 BCE) and Mesoamerican scripts (c. 900–400 BCE).",
    },
    relatedIds: ["era-ancient", "when.hammurabi", "lng.learning"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.great-pyramid",
    title: "Great Pyramid of Giza built",
    dateLabel: "c. 2560 BCE",
    year: -2560,
    eraId: "era-ancient",
    question: "When was the Great Pyramid built?",
    categoryIds: ["cat-20", "cat-44", "cat-21"],
    summary: "The Great Pyramid, tomb of the pharaoh Khufu, was built at Giza around 2560 BCE — the only one of the Seven Wonders of the Ancient World still standing.",
    sections: {
      summary: "Built from roughly 2.3 million stone blocks, it stood as the world's tallest human-made structure for nearly four millennia.",
    },
    relatedIds: ["era-ancient", "place.egypt", "when.writing"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.hammurabi",
    title: "Code of Hammurabi inscribed",
    dateLabel: "c. 1754 BCE",
    year: -1754,
    eraId: "era-ancient",
    question: "When was the Code of Hammurabi written?",
    categoryIds: ["cat-17", "cat-20"],
    summary: "The Babylonian king Hammurabi codified laws around 1754 BCE, one of the earliest and best-preserved legal codes, inscribed on a stele for public display.",
    sections: {
      summary: "The code's 282 laws cover trade, family, property and injury, and its principle of proportionate punishment (lex talionis) influenced later legal traditions.",
    },
    relatedIds: ["era-ancient", "law.courts", "con.constitution"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.athenian-democracy",
    title: "Athenian democracy established",
    dateLabel: "508–507 BCE",
    year: -508,
    eraId: "era-classical",
    question: "When did democracy begin?",
    categoryIds: ["cat-19", "cat-20"],
    summary: "The reforms of Cleisthenes in Athens (508–507 BCE) created the first known democracy, in which free adult male citizens participated directly in assembly decisions.",
    sections: {
      summary: "Athenian democracy was direct, limited (excluding women, slaves and foreigners) and short-lived in its classical form, but its vocabulary and ideas shaped later democratic thought.",
    },
    relatedIds: ["era-classical", "con.democracy", "why.elections"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.roman-empire",
    title: "Roman Empire begins",
    dateLabel: "27 BCE",
    year: -27,
    eraId: "era-classical",
    question: "When did the Roman Empire begin?",
    categoryIds: ["cat-20", "cat-18"],
    summary: "Octavian became Augustus in 27 BCE, transforming the Roman Republic into the Roman Empire, which dominated the Mediterranean for centuries.",
    sections: {
      summary: "The empire's law, roads, cities and languages (Latin and Greek) shaped Europe, North Africa and the Middle East long after its fall.",
    },
    relatedIds: ["era-classical", "law.courts", "era-medieval"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.edict-milan",
    title: "Edict of Milan legalizes Christianity",
    dateLabel: "313 CE",
    year: 313,
    eraId: "era-classical",
    question: "When was Christianity legalized in the Roman Empire?",
    categoryIds: ["cat-22", "cat-20"],
    summary: "In 313 CE the emperors Constantine and Licinius agreed to tolerate Christianity across the Roman Empire, ending state persecution.",
    sections: {
      summary: "Within decades Christianity became the empire's dominant religion, reshaping European and world history.",
    },
    relatedIds: ["era-classical", "con.christianity", "when.roman-empire"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.hijra",
    title: "The Hijra — Islamic calendar begins",
    dateLabel: "622 CE",
    year: 622,
    eraId: "era-medieval",
    question: "When did the Islamic calendar begin?",
    categoryIds: ["cat-22", "cat-20"],
    summary: "The migration (Hijra) of the Prophet Muhammad and his followers from Mecca to Medina in 622 CE marks year 1 of the Islamic calendar.",
    sections: {
      summary: "From Medina the early Muslim community grew into a state and then an empire; the Islamic Golden Age produced major advances in science, mathematics and medicine.",
    },
    relatedIds: ["era-medieval", "con.religion-diversity", "sci.astronomy"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.al-qarawiyyin",
    title: "University of al-Qarawiyyin founded",
    dateLabel: "859 CE",
    year: 859,
    eraId: "era-medieval",
    question: "When was the first university founded?",
    categoryIds: ["cat-01", "cat-20"],
    summary: "The University of al-Qarawiyyin, founded in Fez (Morocco) in 859 CE by Fatima al-Fihri, is among the oldest continually operating universities in the world.",
    sections: {
      summary: "The University of Bologna (1088) is the oldest in continuous operation in Europe; both are cited in debates over which is 'first'.",
    },
    relatedIds: ["era-medieval", "con.university", "when.magna-carta"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.magna-carta",
    title: "Magna Carta sealed",
    dateLabel: "1215",
    year: 1215,
    eraId: "era-medieval",
    question: "When was the Magna Carta signed?",
    categoryIds: ["cat-17", "cat-20"],
    summary: "In 1215 English barons forced King John to seal the Magna Carta, limiting royal power and declaring that even the king is bound by law.",
    sections: {
      summary: "Its clauses on due process ('no free man shall be seized… except by the lawful judgement of his equals') influenced later constitutional documents including the US Constitution.",
    },
    relatedIds: ["era-medieval", "con.constitution", "law.courts"],
    sources: [SRC_BRITANNICA, SRC_HISTORY],
  }),
  timelineEvent({
    id: "when.printing-press",
    title: "Gutenberg's printing press",
    dateLabel: "c. 1440",
    year: 1440,
    eraId: "era-early-modern",
    question: "When was the printing press invented?",
    categoryIds: ["cat-20", "cat-70", "cat-04"],
    summary: "Johannes Gutenberg developed movable-type printing in Europe around 1440; his Bible (c. 1455) began a revolution in the spread of knowledge.",
    sections: {
      summary: "Printing made books cheap and abundant, fuelling the Renaissance, the Reformation, science and mass literacy. (Movable type had been used earlier in China and Korea.)",
    },
    relatedIds: ["era-early-modern", "when.writing", "lng.learning"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.columbus",
    title: "Columbus reaches the Americas",
    dateLabel: "1492",
    year: 1492,
    eraId: "era-early-modern",
    question: "When did Europeans first reach the Americas?",
    categoryIds: ["cat-20", "cat-21"],
    summary: "In 1492 Christopher Columbus's voyage, sponsored by Spain, reached the Caribbean — opening sustained contact between Europe and the Americas.",
    sections: {
      summary: "The 'Columbian Exchange' of crops, animals, diseases and people transformed both hemispheres, with catastrophic population losses for Indigenous peoples through disease and conquest. Norse voyagers had reached North America centuries earlier (c. 1000 CE).",
    },
    relatedIds: ["era-early-modern", "why.migration", "cult.diversity"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.us-independence",
    title: "US Declaration of Independence",
    dateLabel: "1776",
    year: 1776,
    eraId: "era-early-modern",
    question: "When was the United States founded?",
    categoryIds: ["cat-20", "cat-18"],
    summary: "On 4 July 1776 the thirteen American colonies declared independence from Britain, founding the United States.",
    sections: {
      summary: "The Constitution followed in 1787 and the Bill of Rights in 1791. The new republic's ideals and contradictions — slavery persisted until 1865 — shaped its later history.",
    },
    relatedIds: ["era-early-modern", "con.constitution", "place.united-states"],
    sources: [SRC_HISTORY, SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.french-revolution",
    title: "French Revolution begins",
    dateLabel: "1789",
    year: 1789,
    eraId: "era-industrial",
    question: "When did the French Revolution start?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "The French Revolution began in 1789 with the storming of the Bastille and the Declaration of the Rights of Man and of the Citizen, overturning the monarchy.",
    sections: {
      summary: "The revolution's ideas of liberty, equality and popular sovereignty spread across Europe and the world, despite years of terror, war and Napoleon's empire.",
    },
    relatedIds: ["era-industrial", "con.democracy", "place.france"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.haiti",
    title: "Haitian independence",
    dateLabel: "1804",
    year: 1804,
    eraId: "era-industrial",
    question: "When did Haiti become independent?",
    categoryIds: ["cat-20", "cat-69"],
    summary: "In 1804 Haiti became the first nation founded by a successful slave revolt and the first independent Black republic in the Americas.",
    sections: {
      summary: "The Haitian Revolution (1791–1804) abolished slavery in the colony and defeated French, British and Spanish forces — a turning point in world history.",
    },
    relatedIds: ["era-industrial", "con.human-rights", "why.migration"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.abolition-us",
    title: "Slavery abolished in the United States",
    dateLabel: "1865",
    year: 1865,
    eraId: "era-industrial",
    question: "When was slavery abolished in the US?",
    categoryIds: ["cat-20", "cat-69"],
    summary: "The 13th Amendment, ratified in December 1865 after the Civil War, abolished slavery in the United States.",
    sections: {
      summary: "Abolition came after a long global campaign: Britain abolished the slave trade in 1807 and slavery in its colonies in 1833; other nations followed over the century.",
    },
    relatedIds: ["era-industrial", "con.human-rights", "why.war"],
    sources: [SRC_HISTORY, SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.ww1",
    title: "World War I begins",
    dateLabel: "1914",
    year: 1914,
    eraId: "era-modern",
    question: "When did World War I start?",
    categoryIds: ["cat-66", "cat-20"],
    summary: "World War I began in July–August 1914 after the assassination of Archduke Franz Ferdinand triggered a chain of alliances; it became the deadliest conflict the world had seen.",
    sections: {
      summary: "The war (1914–1918) involved over 30 countries and ~15–22 million deaths, redrew empires, and its peace settlement sowed the conditions for World War II.",
    },
    relatedIds: ["era-modern", "why.war", "when.ww2"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.russian-revolution",
    title: "Russian Revolution",
    dateLabel: "1917",
    year: 1917,
    eraId: "era-modern",
    question: "When did the Russian Revolution happen?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "In 1917 the Russian Empire's monarchy fell (February) and the Bolsheviks seized power (October), creating the world's first state socialist system.",
    sections: {
      summary: "The revolution produced the Soviet Union (1922–1991), which shaped the 20th century's politics, economics and conflicts.",
    },
    relatedIds: ["era-modern", "con.socialism", "when.ww1"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.ww2",
    title: "World War II begins",
    dateLabel: "1939",
    year: 1939,
    eraId: "era-modern",
    question: "When did World War II start?",
    categoryIds: ["cat-66", "cat-20"],
    summary: "World War II began in September 1939 with Germany's invasion of Poland, following Japan's war in China since 1937.",
    sections: {
      summary: "The deadliest conflict in history (1939–1945, an estimated 60–85 million deaths) ended with Allied victory, the Holocaust, and the first use of nuclear weapons.",
    },
    relatedIds: ["era-modern", "why.war", "when.un-founded"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.un-founded",
    title: "United Nations founded",
    dateLabel: "1945",
    year: 1945,
    eraId: "era-contemporary",
    question: "When was the United Nations created?",
    categoryIds: ["cat-65", "cat-20"],
    summary: "The United Nations was founded in 1945, with its Charter signed in San Francisco on 26 June 1945 and entering into force on 24 October.",
    sections: {
      summary: "Created 'to save succeeding generations from the scourge of war', the UN has 193 member states and works on peace, development and human rights.",
    },
    relatedIds: ["era-contemporary", "con.human-rights", "when.udhr"],
    sources: [SRC_UN],
  }),
  timelineEvent({
    id: "when.udhr",
    title: "Universal Declaration of Human Rights",
    dateLabel: "1948",
    year: 1948,
    eraId: "era-contemporary",
    question: "When was the Universal Declaration of Human Rights adopted?",
    categoryIds: ["cat-69", "cat-20"],
    summary: "The UN General Assembly adopted the Universal Declaration of Human Rights on 10 December 1948 — the foundational statement of international human rights.",
    sections: {
      summary: "Drafted under the chairmanship of Eleanor Roosevelt with participation from across the world, it has inspired constitutions and treaties worldwide.",
    },
    relatedIds: ["era-contemporary", "con.human-rights", "law.human-rights"],
    sources: [SRC_UN],
  }),
  timelineEvent({
    id: "when.ghana",
    title: "Ghana becomes independent",
    dateLabel: "1957",
    year: 1957,
    eraId: "era-contemporary",
    question: "When did Ghana gain independence?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "Ghana, under Kwame Nkrumah, became independent from Britain on 6 March 1957 — the first sub-Saharan African colony to do so.",
    sections: {
      summary: "Ghana's independence inspired the decolonization wave that transformed Africa over the following two decades.",
    },
    relatedIds: ["era-contemporary", "place.nigeria", "place.kenya"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.nigeria",
    title: "Nigeria becomes independent",
    dateLabel: "1960",
    year: 1960,
    eraId: "era-contemporary",
    question: "When did Nigeria gain independence?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "Nigeria became independent from Britain on 1 October 1960; it became a republic in 1963.",
    sections: {
      summary: "Africa's most populous country has since experienced civil war (1967–1970), military rule and, since 1999, continuous civilian government.",
    },
    relatedIds: ["era-contemporary", "place.nigeria", "when.ghana"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.kenya",
    title: "Kenya becomes independent",
    dateLabel: "1963",
    year: 1963,
    eraId: "era-contemporary",
    question: "When did Kenya gain independence?",
    categoryIds: ["cat-20", "cat-19"],
    summary: "Kenya became independent from Britain on 12 December 1963, with Jomo Kenyatta as its first prime minister and later president.",
    sections: {
      summary: "Independence followed the Mau Mau uprising and negotiations; Kenya adopted a new constitution in 2010.",
    },
    relatedIds: ["era-contemporary", "place.kenya", "who.maathai"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.moon-landing",
    title: "Apollo 11 lands humans on the Moon",
    dateLabel: "1969",
    year: 1969,
    eraId: "era-contemporary",
    question: "When did humans first land on the Moon?",
    categoryIds: ["cat-49", "cat-20", "cat-04"],
    summary: "On 20 July 1969 Neil Armstrong and Buzz Aldrin became the first humans on the Moon, during NASA's Apollo 11 mission.",
    sections: {
      summary: "The Moon landing was the peak of the Space Race and remains one of the most-watched events in history.",
    },
    relatedIds: ["era-contemporary", "sci.astronomy", "when.un-founded"],
    sources: [SRC_NASA],
  }),
  timelineEvent({
    id: "when.web",
    title: "World Wide Web invented",
    dateLabel: "1989–1991",
    year: 1991,
    eraId: "era-contemporary",
    question: "When was the internet created?",
    categoryIds: ["cat-75", "cat-20", "cat-04"],
    summary: "Tim Berners-Lee proposed the World Wide Web at CERN in 1989 and made it public in 1991 — the hyperlinked system that opened the internet to everyone.",
    sections: {
      summary: "The internet itself is older: ARPANET linked US universities in 1969, and the TCP/IP protocols standardizing it date to the 1980s. The Web made it usable by the public.",
    },
    relatedIds: ["era-contemporary", "tech.internet", "when.moon-landing"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.bitcoin",
    title: "Bitcoin network launches",
    dateLabel: "2009",
    year: 2009,
    eraId: "era-contemporary",
    question: "When was Bitcoin created?",
    categoryIds: ["cat-11", "cat-20", "cat-04"],
    summary: "The Bitcoin network launched in January 2009, implementing the decentralized cryptocurrency described in a 2008 whitepaper by the pseudonymous Satoshi Nakamoto.",
    sections: {
      summary: "Bitcoin introduced blockchain technology to the world and started the cryptocurrency era.",
    },
    relatedIds: ["era-contemporary", "con.cryptocurrency", "con.blockchain"],
    sources: [SRC_BRITANNICA],
  }),
  timelineEvent({
    id: "when.covid",
    title: "COVID-19 pandemic declared",
    dateLabel: "2020",
    year: 2020,
    eraId: "era-contemporary",
    question: "When did the COVID-19 pandemic begin?",
    categoryIds: ["cat-27", "cat-20", "cat-63"],
    summary: "The World Health Organization declared COVID-19 a pandemic on 11 March 2020; the disease, caused by SARS-CoV-2, became one of the deadliest pandemics in history.",
    sections: {
      summary: "The pandemic accelerated remote work, digital services and vaccine science; its long-term social and economic effects are still being studied — that part is dynamic knowledge.",
    },
    relatedIds: ["era-contemporary", "hlth.body", "why.migration"],
    sources: [SRC_WHO],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * 7. "WHERE…?" KNOWLEDGE — places
 * ════════════════════════════════════════════════════════════════════════════ */

const PLACE_RECORDS: KnowledgeRecord[] = [
  place({
    id: "place.nigeria",
    title: "Nigeria",
    aliases: ["federal republic of nigeria"],
    question: "Where is Nigeria?",
    categoryIds: ["cat-21", "cat-20", "cat-19"],
    summary: "Nigeria is a country in West Africa on the Gulf of Guinea — the most populous country in Africa, a federal republic of 36 states plus the Federal Capital Territory (Abuja).",
    sections: {
      geography: "Nigeria borders Niger, Chad, Cameroon and Benin, with a coastline on the Atlantic. Its landscapes range from coastal mangroves and the Niger Delta through tropical forests and savannah to the semi-arid north. The Niger and Benue rivers meet in the centre of the country. The capital is Abuja; the largest city is Lagos, a megacity and economic hub.",
      history: "Ancient cultures include the Nok civilization (c. 1000 BCE–500 CE) and the great kingdoms of Ife, Benin and the Hausa city-states. British colonial rule formalized the modern territory in 1914; Nigeria became independent in 1960, endured a civil war (1967–1970) and long military rule, and has held continuous civilian elections since 1999.",
      economy: "Nigeria is one of Africa's largest economies, with oil and gas as major exports alongside agriculture (cassava, maize, cocoa), services, fintech and a large informal sector. Its youth population makes it a demographic giant.",
      culture: "Nigeria is home to several hundred ethnic groups and languages — the largest being Hausa, Yoruba and Igbo — and to globally influential culture: Nollywood, Afrobeats and a rich literary tradition (Achebe, Soyinka).",
      guidance: "Population figures, GDP and current political facts are dynamic information and must be verified at query time.",
    },
    relatedIds: ["when.nigeria", "place.kenya", "when.ghana", "cult.diversity"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.kenya",
    title: "Kenya",
    aliases: ["republic of kenya"],
    question: "Where is Kenya?",
    categoryIds: ["cat-21", "cat-20"],
    summary: "Kenya is a country in East Africa on the Indian Ocean, crossed by the equator and the Great Rift Valley, with Nairobi as its capital.",
    sections: {
      geography: "Kenya borders Ethiopia, Somalia, South Sudan, Uganda and Tanzania, with a long Indian Ocean coast. Landscapes include savannahs, the Rift Valley, Mount Kenya, Lake Victoria's shore and coastal beaches. Famous wildlife parks include Maasai Mara and Amboseli.",
      history: "The coast was part of Indian Ocean trade networks for centuries, with Swahili city-states. British colonial rule (East Africa Protectorate) was followed by the Mau Mau uprising and independence in 1963. Kenya adopted a new constitution in 2010.",
      economy: "Agriculture (tea, coffee, horticulture and cut flowers) and tourism are traditional pillars; Kenya is also a technology hub — Nairobi is known as 'Silicon Savannah', and the mobile-money service M-Pesa originated there in 2007.",
      culture: "Kenya is exceptionally diverse: dozens of communities including the Kikuyu, Luhya, Kalenjin, Luo, Kamba, Somali and Swahili peoples, with 60+ languages, and a global reputation in long-distance running.",
      guidance: "Current economic and political data are dynamic information to verify at query time.",
    },
    relatedIds: ["when.kenya", "who.maathai", "place.nigeria"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.egypt",
    title: "Egypt",
    aliases: ["arab republic of egypt"],
    question: "Where is Egypt?",
    categoryIds: ["cat-21", "cat-20", "cat-22"],
    summary: "Egypt is a country in North Africa and the Middle East, centred on the Nile — home to one of the world's oldest civilizations and the Arab world's largest population.",
    sections: {
      geography: "Egypt spans the northeast corner of Africa and the Sinai Peninsula (Asia), with the Mediterranean and Red Sea coasts. Over 90% of the population lives along the Nile valley and delta; the rest is desert. The capital is Cairo, one of Africa's largest cities.",
      history: "Pharaonic civilization emerged around 3100 BCE and lasted three millennia, building the pyramids and temples of Luxor and Abu Simbel. Egypt was ruled by Persians, Greeks (Ptolemaic), Romans, Arabs, Ottomans and the British, and became a republic in 1953 after the 1952 revolution.",
      economy: "The Suez Canal, tourism, agriculture (cotton, rice) and gas are economic pillars; remittances and Suez fees are major foreign-currency earners.",
      culture: "Egypt's heritage spans ancient temples, Coptic Christianity, Islamic Cairo — with Al-Azhar, one of the world's oldest universities — and a powerful modern film and music industry.",
      guidance: "Current statistics are dynamic information to verify at query time.",
    },
    relatedIds: ["when.great-pyramid", "when.al-qarawiyyin", "era-ancient"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.india",
    title: "India",
    aliases: ["republic of india", "bharat"],
    question: "Where is India?",
    categoryIds: ["cat-21", "cat-20", "cat-22"],
    summary: "India is a country in South Asia and the world's largest democracy by population — a federal republic of 28 states with a civilization stretching back thousands of years.",
    sections: {
      geography: "India spans the Indian subcontinent from the Himalayas to the Indian Ocean, bordered by Pakistan, China, Nepal, Bhutan, Bangladesh and Myanmar. Landscapes include the Gangetic plain, the Thar desert, tropical coasts and the Deccan plateau. The capital is New Delhi; Mumbai and Bengaluru are major hubs.",
      history: "The Indus Valley civilization (c. 2500 BCE) is among the world's oldest. India saw the Maurya and Gupta empires, the Delhi Sultanate, the Mughal Empire and British colonial rule, and became independent in 1947 — partitioned into India and Pakistan.",
      economy: "India is one of the world's largest economies, with strength in information technology, pharmaceuticals, agriculture, manufacturing and services; Bengaluru is a global software centre.",
      culture: "India is the birthplace of Hinduism, Buddhism, Jainism and Sikhism, and is religiously plural (Hindu majority with large Muslim, Christian, Sikh and other communities). It has 22 scheduled languages, several hundred spoken languages, and globally influential cinema (Bollywood), cuisine and literature.",
      guidance: "Current statistics are dynamic information to verify at query time.",
    },
    relatedIds: ["when.hijra", "who.gandhi", "cult.diversity"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.united-states",
    title: "United States",
    aliases: ["usa", "america", "united states of america"],
    question: "Where is the United States?",
    categoryIds: ["cat-21", "cat-20", "cat-18"],
    summary: "The United States is a federal republic of 50 states in North America, with Washington, D.C. as its capital — a founding democracy and one of the world's largest economies.",
    sections: {
      geography: "The US spans the North American continent from the Atlantic to the Pacific, with Alaska and Hawaii, and borders Canada and Mexico. Landscapes range from Arctic tundra to subtropical Florida, the Great Plains, the Rocky Mountains and California's coast.",
      history: "Founded by thirteen colonies declaring independence from Britain in 1776, the US adopted its Constitution in 1787. It expanded across the continent, fought a civil war over slavery (1861–1865), became a world power in the 20th century, and has the world's longest continuous constitutional republic.",
      economy: "The US has the world's largest economy, with leadership in technology, finance, energy, agriculture and services, and the dollar as a primary global reserve currency.",
      culture: "American culture — film, music (jazz, rock, hip-hop), literature, food and technology — has global reach; the US is a nation of immigrants whose society is shaped by continuous demographic change.",
      guidance: "Current statistics, elections and office-holders are dynamic information to verify at query time.",
    },
    relatedIds: ["when.us-independence", "con.constitution", "con.democracy"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.united-kingdom",
    title: "United Kingdom",
    aliases: ["uk", "britain", "great britain"],
    question: "Where is the United Kingdom?",
    categoryIds: ["cat-21", "cat-20", "cat-18"],
    summary: "The United Kingdom is a country in north-west Europe made up of England, Scotland, Wales and Northern Ireland, with London as its capital — the birthplace of the Industrial Revolution and the modern parliamentary system.",
    sections: {
      geography: "The UK is an island nation between the Atlantic and the North Sea, separated from continental Europe by the English Channel. Its landscape ranges from the Scottish Highlands to English lowlands; the climate is temperate and maritime.",
      history: "The UK's political traditions — parliament, common law, the Magna Carta (1215) — shaped modern government. It built the largest empire in history, was a founding industrial power, and led the Allies in both world wars. The UK left the European Union in 2020.",
      economy: "The UK has one of the world's largest economies, strong in finance (London), technology, education, creative industries and services.",
      culture: "The UK is the source of the English language's global spread, Shakespeare, the Beatles, and globally followed football and popular culture; it is a multicultural society of four nations and many communities.",
      guidance: "Current statistics and office-holders are dynamic information to verify at query time.",
    },
    relatedIds: ["when.magna-carta", "when.us-independence", "era-industrial"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.france",
    title: "France",
    aliases: ["french republic"],
    question: "Where is France?",
    categoryIds: ["cat-21", "cat-20", "cat-55"],
    summary: "France is a country in Western Europe with Paris as its capital — a republic whose 1789 revolution and Enlightenment ideas shaped modern democracy worldwide.",
    sections: {
      geography: "France spans Western Europe from the Atlantic to the Mediterranean and the Rhine, with the Alps and Pyrenees on its borders and overseas territories worldwide (Guadeloupe, Réunion, French Guiana and more).",
      history: "From the Frankish kingdoms and medieval monarchy, France became a central European power, underwent the 1789 Revolution, Napoleon's empire, repeated republics, and two world wars; it is a founding member of the European Union and a nuclear-armed permanent Security Council member.",
      economy: "France is a major economy strong in aerospace, luxury goods, agriculture (the EU's largest), tourism — the world's most visited country — and nuclear energy.",
      culture: "French language, cuisine, fashion, cinema, philosophy and art have global influence; France is officially secular (laïcité) with a diverse society shaped by immigration from Europe, Africa and Asia.",
      guidance: "Current statistics and office-holders are dynamic information to verify at query time.",
    },
    relatedIds: ["when.french-revolution", "when.us-independence", "con.democracy"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
  place({
    id: "place.brazil",
    title: "Brazil",
    aliases: ["federative republic of brazil"],
    question: "Where is Brazil?",
    categoryIds: ["cat-21", "cat-20", "cat-40"],
    summary: "Brazil is the largest country in South America — the only Portuguese-speaking country in the Americas — with Brasília as its capital and the Amazon rainforest within its borders.",
    sections: {
      geography: "Brazil covers nearly half of South America, bordering every country on the continent except Ecuador and Chile. It contains the Amazon basin and rainforest, the Pantanal wetlands, a 7 400 km Atlantic coast and the semi-arid northeast.",
      history: "Claimed by Portugal in 1500, Brazil was a Portuguese colony, an empire (1822–1889) and then a republic; it abolished slavery in 1888, the last American country to do so, and returned to democracy in 1985 after two decades of military rule.",
      economy: "Brazil is one of the world's largest economies, a major exporter of agricultural products (soy, coffee, beef), iron ore and oil, with a large internal market and industrial base.",
      culture: "Brazilian culture blends Indigenous, African and European roots: samba, bossa nova, Carnival, football (the only five-time World Cup winner), and a rich literature and cuisine.",
      guidance: "Current statistics and office-holders are dynamic information to verify at query time.",
    },
    relatedIds: ["era-contemporary", "sci.environmental-science", "when.columbus"],
    sources: [SRC_BRITANNICA, SRC_UN],
    verificationNote: "Current statistics (population, GDP, office-holders) are deliberately not memorized; they are dynamic information.",
  }),
];

export const KNOWLEDGE_SEED_PEOPLE_TIMELINE_PLACES: KnowledgeRecord[] = [
  ...PERSON_RECORDS,
  ...TIMELINE_RECORDS,
  ...PLACE_RECORDS,
];
