/**
 * Session 148 — Curated knowledge seed (audit completion): closes the
 * remaining explicit-list gaps found by re-auditing the re-sent Session 140
 * specification against the shipped catalog. Every section's named item now
 * resolves to a shipped record:
 *
 *   §5  People: inventors (Edison), authors (Achebe, Angelou), an artist
 *       (Enwonwu), an actor (Poitier), a religious figure (Tutu), an
 *       engineer (Hopper), a regional leader/governor-type (Ahmadu Bello),
 *       a senator (Okadigbo) and a minister (Wachuku).
 *   §6  Timeline: the first computer (ENIAC), the internet's origin
 *       (ARPANET) and a constitution adoption (US Constitution).
 *   §7  Places: states, provinces, cities, airports, universities,
 *       hospitals, government institutions, historical sites, religious
 *       sites, business regions and tourist attractions.
 *   §9  Disciplines: chemistry, international relations, agriculture,
 *       architecture, education, communications, arts, music.
 *   §10 Science fields: earth science, space science (FOUNDATIONS→RESEARCH).
 *   §11 Technology: software engineering.
 *   §12 Business: entrepreneurship, bookkeeping, payments, procurement,
 *       human resources.
 *   §13 Careers: job search/descriptions, skills & qualifications,
 *       certifications, professional development, salary-information
 *       guidance (salaries are dynamic — never memorized).
 *   §17 Culture: customs & traditions, food culture, clothing & fashion,
 *       arts, family structures, social institutions, regional cultures,
 *       diaspora communities (no-stereotype discipline).
 *   §18 Travel: transportation, currency, weather, local customs/etiquette
 *       (time-sensitive content flagged for verification).
 *   §19 Relationships: friendship, family, marriage, workplace
 *       communication, personal development (balanced, no single answer).
 *   §20 Entertainment: television, books, celebrities, artists & creators,
 *       historical trends (current information verified).
 *   §21 Language: vocabulary, pronunciation, dialects & slang, historical
 *       languages, indigenous languages (cultural meaning preserved).
 *   §22 Everyday: clothing, personal organization, transportation,
 *       problem solving.
 *   §23 Creative: poetry, music, visual art, video, presentations,
 *       branding, advertising.
 *   §8  Comparisons: universities, business strategies, investment
 *       concepts, travel destinations, historical events, software tools —
 *       each with labeled criteria profiles and no universal winner.
 */
import type { KnowledgeRecord } from "@windels/shared";
import { KNOWLEDGE_SEED_DATE } from "./knowledge.seed.js";
import type { KnowledgeReference } from "@windels/shared";

const SRC_BRITANNICA: KnowledgeReference = { label: "Encyclopaedia Britannica", url: "https://www.britannica.com" };
const SRC_UN: KnowledgeReference = { label: "United Nations", url: "https://www.un.org" };
const SRC_WHO: KnowledgeReference = { label: "World Health Organization", url: "https://www.who.int" };
const SRC_NOBEL: KnowledgeReference = { label: "The Nobel Prize organization", url: "https://www.nobelprize.org" };
const SRC_SMITH: KnowledgeReference = { label: "Smithsonian National Museum of African Art", url: "https://africa.si.edu" };
const SRC_LIBRARY: KnowledgeReference = { label: "Library of Congress", url: "https://www.loc.gov" };
const SRC_NASA: KnowledgeReference = { label: "NASA", url: "https://www.nasa.gov" };
const SRC_USNAVY: KnowledgeReference = { label: "Naval History and Heritage Command", url: "https://www.history.navy.mil" };

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
    professionalAssistanceNote: input.professionalAssistanceNote,
  };
}

const person = (input: SeedInput): KnowledgeRecord =>
  build("person", "stable", ["definition", "research", "history"], input);
const timelineEvent = (input: SeedInput & { dateLabel: string; year: number | null; eraId: string }): KnowledgeRecord => {
  const record = build("timeline_event", "stable", ["history", "definition"], input);
  return { ...record, dateLabel: input.dateLabel, year: input.year, eraId: input.eraId };
};
const place = (input: SeedInput): KnowledgeRecord =>
  build("place", "stable", ["definition", "explanation", "history"], input);
const discipline = (input: SeedInput): KnowledgeRecord =>
  build("discipline", "stable", ["education", "definition"], input);
const scienceField = (input: SeedInput): KnowledgeRecord =>
  build("science_field", "stable", ["education", "explanation"], input);
const technology = (input: SeedInput): KnowledgeRecord =>
  build("technology", "stable", ["definition", "explanation", "education"], input);
const business = (input: SeedInput): KnowledgeRecord =>
  build("business", "stable", ["definition", "explanation", "instruction"], input);
const career = (input: SeedInput): KnowledgeRecord =>
  build("career", "stable", ["education", "instruction", "definition"], input);
const culture = (input: SeedInput): KnowledgeRecord =>
  build("culture", "stable", ["definition", "explanation", "education"], input);
const travel = (input: SeedInput): KnowledgeRecord =>
  build("travel", "stable", ["instruction", "explanation"], input);
const relationship = (input: SeedInput): KnowledgeRecord =>
  build("relationship", "stable", ["personal_guidance", "explanation"], input);
const entertainment = (input: SeedInput): KnowledgeRecord =>
  build("entertainment", "stable", ["definition", "explanation"], input);
const language = (input: SeedInput): KnowledgeRecord =>
  build("language", "stable", ["definition", "explanation", "education"], input);
const everyday = (input: SeedInput): KnowledgeRecord =>
  build("everyday", "stable", ["instruction", "explanation"], input);
const creative = (input: SeedInput): KnowledgeRecord =>
  build("creative", "stable", ["creative", "instruction"], input);
const comparison = (input: SeedInput): KnowledgeRecord =>
  build("comparison", "stable", ["comparison", "recommendation"], input);

/* ════════════════════════════════════════════════════════════════════════════
 * §5 — "WHO…?" PEOPLE — the remaining role categories of the spec list
 * (inventors, authors, artists, actors, religious figures, engineers,
 * governors/regional leaders, senators, ministers)
 * ════════════════════════════════════════════════════════════════════════════ */

const PERSON_RECORDS: KnowledgeRecord[] = [
  person({
    id: "who.edison",
    title: "Thomas Edison",
    aliases: ["edison", "thomas alva edison"],
    question: "Who was Thomas Edison?",
    categoryIds: ["cat-20", "cat-04", "cat-79"],
    summary: "Thomas Edison (1847–1931) was an American inventor and businessman — the phonograph, the practical incandescent light bulb and the first industrial research laboratory changed daily life worldwide.",
    sections: {
      biography: "Thomas Alva Edison was born on 11 February 1847 in Milan, Ohio. Largely self-taught (he had little formal schooling), he became a telegraph operator and then a full-time inventor. His laboratory at Menlo Park, New Jersey — the first industrial research facility — produced the phonograph (1877) and a practical incandescent lamp (1879). He built direct-current power systems, co-founded General Electric, and held over a thousand US patents. He died on 18 October 1931.",
      simple: "Thomas Edison was an inventor who brought us the light bulb and the record player, and he built one of the first laboratories where teams invent things together.",
      achievements: "Phonograph (1877); practical incandescent lighting and the first central power station (Pearl Street, 1882); motion-picture camera (kinetoscope); more than 1,000 US patents; co-founder of General Electric; pioneer of industrial research and development.",
      historical_context: "Edison worked during the Second Industrial Revolution, when electricity, telephony and recorded sound transformed cities. His 'invention factory' model — organized teams of researchers — became the template for modern R&D. His rivalry with Nikola Tesla over direct vs alternating current shaped the early power industry; historians also note his role in the commercialization of film technology.",
      guidance: "Edison is celebrated for invention, but the light bulb and other devices built on many predecessors' work — invention is usually collective and cumulative, not a single genius moment.",
    },
    misconceptions: [
      { misconception: "Edison invented the light bulb from nothing.", correction: "He perfected a practical, long-lasting incandescent lamp by improving earlier designs by Swan and others — his breakthrough was a viable system (bulb, socket, generator, wiring)." },
    ],
    relatedIds: ["era-industrial", "tech.computers", "who.curie"],
    sources: [SRC_BRITANNICA, SRC_LIBRARY],
  }),
  person({
    id: "who.achebe",
    title: "Chinua Achebe",
    aliases: ["achebe", "chinua achebe"],
    question: "Who was Chinua Achebe?",
    categoryIds: ["cat-53", "cat-20", "cat-55"],
    summary: "Chinua Achebe (1930–2013) was a Nigerian novelist and critic whose 'Things Fall Apart' (1958) is the most widely read African novel and a landmark of world literature.",
    sections: {
      biography: "Chinua Achebe was born on 16 November 1930 in Ogidi, eastern Nigeria. Educated at University College, Ibadan, he worked for the Nigerian Broadcasting Corporation and later taught at universities in Nigeria and the United States (Brown University). His first novel, Things Fall Apart (1958), tells of an Igbo community confronting colonial rule and is translated into dozens of languages. He wrote four more novels (including No Longer at Ease and A Man of the People), poetry, essays and children's books. He died on 21 March 2013.",
      simple: "Chinua Achebe wrote stories about Nigeria and Africa from an African point of view — his book Things Fall Apart is read all over the world.",
      achievements: "Things Fall Apart (1958), translated into 50+ languages; the Man Booker International Prize (2007); the Commonwealth Poetry Prize; honorary doctorates worldwide; widely credited with founding modern African literature in English.",
      historical_context: "Achebe wrote at the end of the colonial era and the beginning of independence, deliberately answering portrayals of Africa in European fiction with African characters telling their own story. He chronicled Nigerian politics (A Man of the People predicted the 1966 coup era) and supported Biafra during the Nigerian Civil War before reconciliation.",
      guidance: "Achebe's legacy includes his essay 'An Image of Africa' critiquing Conrad's Heart of Darkness — a reminder that who tells a story shapes how a people are seen.",
    },
    misconceptions: [
      { misconception: "Things Fall Apart is a history book.", correction: "It is a novel — historically informed fiction, not a documentary account of Igbo life." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "cult.diversity", "who.enwonwu"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.angelou",
    title: "Maya Angelou",
    aliases: ["maya angelou", "marguerite johnson"],
    question: "Who was Maya Angelou?",
    categoryIds: ["cat-53", "cat-50", "cat-69"],
    summary: "Maya Angelou (1928–2014) was an American poet, memoirist, actress and civil-rights activist whose autobiography 'I Know Why the Caged Bird Sings' is a classic of modern literature.",
    sections: {
      biography: "Marguerite Annie Johnson was born on 4 April 1928 in St. Louis, Missouri. After a traumatic childhood, she became a dancer, singer and actor, worked as a journalist in Egypt and Ghana, and returned to the United States where she joined the civil-rights movement. I Know Why the Caged Bird Sings (1969) made her a literary star. She published seven autobiographies, several poetry collections, and recited her poem 'On the Pulse of Morning' at President Clinton's 1993 inauguration. She died on 28 May 2014.",
      simple: "Maya Angelou wrote poems and true-life books about her own life, and she spoke up for the rights of Black people and women.",
      achievements: "I Know Why the Caged Bird Sings (1969); Presidential Medal of Freedom (2010); three Grammy Awards for spoken-word recordings; dozens of honorary degrees; the first Black woman to write a best-selling nonfiction book.",
      historical_context: "Angelou's life spanned segregation, the civil-rights era and Black cultural renaissance. Her work — memoir, poetry, performance — insisted that personal testimony is political history, and she is a reference point for literature, feminism and civil rights.",
      guidance: "Her memoirs are literary autobiography — written from memory and artfully shaped, not court records — which is how the genre works.",
    },
    misconceptions: [
      { misconception: "Her books are novels.", correction: "They are autobiographical memoirs, though written with literary craft." },
    ],
    relatedIds: ["era-contemporary", "con.human-rights", "who.tutu", "cre.poetry"],
    sources: [SRC_BRITANNICA, SRC_LIBRARY],
  }),
  person({
    id: "who.enwonwu",
    title: "Ben Enwonwu",
    aliases: ["enwonwu", "odinigwe benedict chukwukadibia enwonwu"],
    question: "Who was Ben Enwonwu?",
    categoryIds: ["cat-50", "cat-20", "cat-55"],
    summary: "Ben Enwonwu (1917–1994) was Nigeria's most celebrated modernist artist — a painter and sculptor who fused Igbo artistic heritage with Western modernism and created the iconic bronze 'Anyanwu'.",
    sections: {
      biography: "Odinigwe Benedict Chukwukadibia Enwonwu was born on 14 July 1917 in Onitsha, eastern Nigeria. He studied at the Government College, Ibadan, then in London (Goldsmiths and the Slade School). He returned to Nigeria as an art teacher and later served as Nigeria's first Federal Art Adviser. His sculpture 'Anyanwu' (1954–55) — a rising goddess — became a national symbol. He painted portraits of African leaders including Queen Elizabeth II and Nnamdi Azikiwe. He died on 5 February 1994; his rediscovered 1974 painting 'Tutu' sold for a record price in 2018.",
      simple: "Ben Enwonwu was a famous Nigerian artist who made paintings and sculptures that mix African traditions with modern art.",
      achievements: "The bronze 'Anyanwu' (1954–55), adopted as a symbol of Nigeria; official portrait of Queen Elizabeth II (1957); exhibits in London, Lagos and beyond, with works held by the Smithsonian's National Museum of African Art; 'Tutu' (1974) sold at auction for £1.2 million in 2018.",
      historical_context: "Enwonwu belonged to the first generation of African artists trained in both indigenous and Western traditions, and he used both deliberately: modernist techniques carrying Igbo cosmology and Nigerian identity. His career spanned colonialism, independence and the civil war, and his art is central to the story of African modernism.",
      guidance: "Enwonwu is celebrated as a national icon; assessments of individual works vary among art historians, and auction prices reflect markets, not objective value.",
    },
    misconceptions: [
      { misconception: "African modern art began in the West.", correction: "Artists like Enwonwu developed distinctly African modernisms from indigenous aesthetics and training, decades before Western collectors recognized them." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "cult.arts", "who.achebe"],
    sources: [SRC_SMITH, SRC_BRITANNICA],
  }),
  person({
    id: "who.poitier",
    title: "Sidney Poitier",
    aliases: ["poitier", "sir sidney poitier"],
    question: "Who was Sidney Poitier?",
    categoryIds: ["cat-52", "cat-20", "cat-69"],
    summary: "Sidney Poitier (1927–2022) was a Bahamian-American actor and director — the first Black man to win the Academy Award for Best Actor (1963) — whose dignity on screen helped reshape American cinema.",
    sections: {
      biography: "Sidney Poitier was born on 20 February 1927 in Miami while his Bahamian parents were visiting from the Bahamas. Raised in Nassau, he moved to New York as a teenager, taught himself to read, and broke into acting in the late 1940s. His breakthrough roles — No Way Out (1950), The Defiant Ones (1958), Lilies of the Field (1963, Oscar), Guess Who's Coming to Dinner (1967), In the Heat of the Night (1967) — made him Hollywood's first Black movie star. He later directed films and served as Bahamas ambassador to Japan (1997–2007). He died on 6 January 2022.",
      simple: "Sidney Poitier was a great actor who became the first Black man to win the top acting Oscar, opening doors for many others.",
      achievements: "Academy Award for Best Actor — Lilies of the Field (1963); Academy Honorary Award (2001); knighthood (KBE, 1974); Presidential Medal of Freedom (2009); first Black actor to win a competitive Oscar.",
      historical_context: "Poitier starred at the height of the civil-rights era, when his roles carried enormous symbolic weight — he was often the lone Black professional on screen, a fact he himself critiqued. His career tracks the slow opening of Hollywood to Black talent, and his choices were studied as much as his performances.",
      guidance: "Poitier's screen roles were groundbreaking but also constraining — historians note both his achievement and the narrow range Hollywood allowed him.",
    },
    misconceptions: [
      { misconception: "Poitier was the first Black actor in Hollywood.", correction: "Black actors performed in film from its earliest decades; Poitier was the first to achieve sustained leading-man stardom and the first to win the competitive Best Actor Oscar." },
    ],
    relatedIds: ["era-contemporary", "ent.film", "con.human-rights"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.tutu",
    title: "Desmond Tutu",
    aliases: ["tutu", "archbishop desmond tutu"],
    question: "Who was Desmond Tutu?",
    categoryIds: ["cat-22", "cat-20", "cat-69"],
    summary: "Desmond Tutu (1931–2021) was a South African Anglican archbishop and anti-apartheid leader — awarded the Nobel Peace Prize in 1984 for his non-violent opposition to apartheid.",
    sections: {
      biography: "Desmond Mpilo Tutu was born on 7 October 1931 in Klerksdorp, South Africa. He trained as a teacher, then as a priest, and rose through the Anglican church to become the first Black Archbishop of Cape Town (1986). He used his pulpit and global platform against apartheid, coined the phrase 'rainbow nation', and chaired South Africa's Truth and Reconciliation Commission (1996–1998), which heard victims and perpetrators of apartheid-era crimes. He died on 26 December 2021.",
      simple: "Archbishop Desmond Tutu was a South African church leader who peacefully fought against apartheid and helped the country heal after it ended.",
      achievements: "Nobel Peace Prize (1984); first Black Archbishop of Cape Town; chair of the Truth and Reconciliation Commission; Presidential Medal of Freedom (2009); lifelong advocacy for human rights, including LGBT equality.",
      historical_context: "Tutu's religious leadership gave the anti-apartheid movement a moral voice that crossed racial lines; after 1994 he championed restorative rather than retributive justice. His legacy includes both the defeat of apartheid and the difficult, unfinished work of reconciliation and equality.",
      guidance: "Tutu is widely honoured, but South African scholars also debate the TRC's limits — healing and accountability remain contested — a full picture includes both.",
    },
    misconceptions: [
      { misconception: "Tutu was a politician.", correction: "He was a church leader and activist who never held political office; his authority was moral and religious." },
    ],
    relatedIds: ["era-contemporary", "who.mandela", "con.religion-diversity", "con.human-rights"],
    sources: [SRC_BRITANNICA, SRC_NOBEL],
  }),
  person({
    id: "who.hopper",
    title: "Grace Hopper",
    aliases: ["hopper", "admiral grace hopper", "grace brewster murray hopper"],
    question: "Who was Grace Hopper?",
    categoryIds: ["cat-06", "cat-43", "cat-20"],
    summary: "Grace Hopper (1906–1992) was an American computer scientist and US Navy rear admiral — a pioneer of programming languages who created the first compiler and championed machine-independent code.",
    sections: {
      biography: "Grace Brewster Murray Hopper was born on 9 December 1906 in New York City. She earned a PhD in mathematics from Yale (1934), taught, and joined the US Navy Reserve in 1943, working on the Harvard Mark I computer. At Eckert–Mauchly and later Remington Rand/Sperry, she led development of the first compiler (A-0, 1952) and of COBOL, the business programming language still in use. She served in the Navy for 43 years, retiring as Rear Admiral in 1986, then advised on computing standards until her death on 1 January 1992.",
      simple: "Grace Hopper helped invent the way we tell computers what to do — she built the first compiler, so people could write programs in words instead of machine code.",
      achievements: "First compiler (A-0, 1952); co-creator of COBOL (1959–60); US Navy Rear Admiral (1985); Presidential Medal of Freedom (posthumous, 2016); 'the first lady of software'.",
      historical_context: "Hopper worked at the dawn of electronic computing, when programs were written in raw machine code. Her insistence that computers should understand human-like languages shaped the entire software industry and made programming accessible beyond mathematicians.",
      guidance: "Hopper's story is often retold with mythic details (the 'nanosecond' wires, the moth 'debugging' story); her documented achievements need no embellishment.",
    },
    misconceptions: [
      { misconception: "Hopper invented COBOL alone.", correction: "She led and shaped the committee that created COBOL; its design was a collective effort, and her compiler work made such languages practical." },
    ],
    relatedIds: ["era-contemporary", "tech.programming", "tech.software-engineering", "disc.computer-science"],
    sources: [SRC_BRITANNICA, SRC_USNAVY],
  }),
  person({
    id: "who.bello",
    title: "Ahmadu Bello",
    aliases: ["bello", "sardauna of sokoto", "alhaji sir ahmadu bello"],
    question: "Who was Ahmadu Bello?",
    categoryIds: ["cat-19", "cat-20", "cat-22"],
    summary: "Sir Ahmadu Bello (1910–1966) was the Sardauna of Sokoto and Premier of Northern Nigeria (1954–1966) — the dominant regional leader of Nigeria's First Republic, assassinated in the January 1966 coup.",
    sections: {
      biography: "Alhaji Sir Ahmadu Bello was born on 12 June 1910 in Sokoto into the ruling house of the Sokoto Caliphate. Educated at Katsina College, he entered the administration of the Northern Region and became its first Premier in 1954, leading the Northern People's Congress (NPC). He championed Northern unity, educational expansion and the modernization of the region while preserving its Islamic character, and he was instrumental in Nigeria's federal negotiations. He was assassinated in the 15 January 1966 military coup.",
      simple: "Ahmadu Bello was the leader of Northern Nigeria before the 1966 coup — he built schools and worked for the North's progress, and he was killed in the coup that changed Nigeria.",
      achievements: "First Premier of Northern Nigeria (1954–1966); leader of the NPC, senior partner in Nigeria's first independent government; founded Ahmadu Bello University, Zaria (1962); knighted (KBE, 1959); a towering figure in Nigerian federalism debates.",
      historical_context: "As head of a vast, ethnically diverse region, Bello personified the North's political weight in Nigeria's federation. His assassination in the January 1966 coup, with the killing of other leaders, triggered the chain of events that led to the civil war. Historians assess his premiership as both progressive (education, infrastructure) and as a period when regional and religious identity dominated national politics.",
      guidance: "Bello is remembered very differently across Nigeria's regions and religious communities; historical accounts differ, and the January 1966 events remain contested history.",
    },
    misconceptions: [
      { misconception: "Bello was Nigeria's prime minister.", correction: "He was Premier of the Northern Region; Sir Abubakar Tafawa Balewa was the federal Prime Minister." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "who.wachuku", "why.elections"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.wachuku",
    title: "Jaja Wachuku",
    aliases: ["wachuku", "jaja anucha ndukwe wachuku"],
    question: "Who was Jaja Wachuku?",
    categoryIds: ["cat-19", "cat-20", "cat-65"],
    summary: "Jaja Wachuku (1918–1996) was a Nigerian lawyer and statesman — Nigeria's first Minister of Foreign Affairs (1961–1965), first Nigerian ambassador to the United Nations, and a founder of the Nigerian Bar Association.",
    sections: {
      biography: "Jaja Anucha Ndukwe Wachuku was born on 1 January 1918 in Nkarachu, eastern Nigeria. He studied law in Dublin (Trinity College) and was called to the bar, returning to Nigeria to a distinguished legal career — he was a founding member of the Nigerian Bar Association and one of Nigeria's first indigenous Queen's Counsels. He entered politics with the National Council of Nigeria and the Cameroons (NCNC), served as Nigeria's first ambassador to the United Nations (1960–61), and as the country's first Minister of Foreign Affairs (1961–1965). He died on 7 November 1996.",
      simple: "Jaja Wachuku was Nigeria's first foreign minister — the person who first represented Nigeria's interests around the world after independence.",
      achievements: "Nigeria's first ambassador to the UN (1960); first Minister of Foreign Affairs (1961–1965); founding member and later president of the Nigerian Bar Association; one of the first indigenous Queen's Counsels in Nigeria.",
      historical_context: "Wachuku shaped Nigerian diplomacy in the early independence years — the era of African decolonization, the Congo crisis and the founding of the Organization of African Unity — and his career illustrates how the legal profession supplied the first generation of Nigerian political leaders.",
      guidance: "Wachuku is one of several 'firsts' whose contributions are documented in Nigerian political history; as with all figures of the First Republic, assessments differ on his policies.",
    },
    misconceptions: [
      { misconception: "Wachuku was foreign minister after the 1966 coup.", correction: "He held the post from 1961 to 1965, before the First Republic was ended by the January 1966 coup." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "disc.law", "con.international-relations", "who.bello"],
    sources: [SRC_BRITANNICA],
  }),
  person({
    id: "who.okadigbo",
    title: "Chuba Okadigbo",
    aliases: ["okadigbo", "dr chuba okadigbo"],
    question: "Who was Chuba Okadigbo?",
    categoryIds: ["cat-19", "cat-20"],
    summary: "Chuba Okadigbo (1941–2003) was a Nigerian philosopher-politician who served as President of the Senate (1999–2000) in Nigeria's Fourth Republic and was a renowned orator and academic.",
    sections: {
      biography: "Chuba Wilberforce Okadigbo was born on 17 December 1941 in Ogbunike, eastern Nigeria. He earned a PhD in philosophy from the Catholic University of America and lectured at several Nigerian universities before entering politics. He was a senator in the Second Republic and a key figure in the National Party of Nigeria; after the return to democracy in 1999 he became Senate President, a post he held until his removal in 2000 amid corruption allegations that he denied and later fought in court. He was an adviser to President Obasanjo's administration and a celebrated public speaker. He died on 25 September 2003 in a car crash.",
      simple: "Chuba Okadigbo was a senator and the President of Nigeria's Senate — a famous speaker and philosopher who was removed from office and went to court to clear his name.",
      achievements: "President of the Senate (1999–2000); professor of philosophy; acclaimed orator ('the philosopher of the Senate'); influential constitutional and political commentaries.",
      historical_context: "Okadigbo belonged to the generation that moved from academia into the politics of Nigeria's young democracy. His removal from the Senate presidency, and the legal battle that followed, became a reference point in debates about legislative independence and executive influence in the Fourth Republic.",
      guidance: "Okadigbo's tenure ended in allegations he denied; the affair is reported differently in different accounts — a documented example of contested political history.",
    },
    misconceptions: [
      { misconception: "Okadigbo served as Senate President throughout the Fourth Republic's early years.", correction: "He served 1999–2000, when he was removed and replaced; he continued as a senator and presidential adviser." },
    ],
    relatedIds: ["era-contemporary", "place.nigeria", "disc.philosophy", "who.nkrumah"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §6 — "WHEN…?" TIMELINE — spec example questions not yet answered by the
 * engine: the first computer, the internet's origin, a constitution adoption
 * ════════════════════════════════════════════════════════════════════════════ */

const TIMELINE_RECORDS: KnowledgeRecord[] = [
  timelineEvent({
    id: "when.first-computer",
    title: "ENIAC, the first general-purpose electronic computer, completed",
    aliases: ["first computer", "eniac"],
    question: "When was the first computer built?",
    categoryIds: ["cat-20", "cat-06", "cat-04"],
    summary: "ENIAC — the first large-scale general-purpose electronic digital computer — was completed in 1945 at the University of Pennsylvania, ushering in the electronic computing age.",
    sections: {
      definition: "ENIAC (Electronic Numerical Integrator and Computer) was a general-purpose, programmable electronic digital computer using vacuum tubes, completed in late 1945 and unveiled to the public in February 1946.",
      simple: "The first big electronic computer was finished in 1945 — it filled a whole room and could calculate in seconds what took people days.",
      detailed: "ENIAC was built at the University of Pennsylvania's Moore School for the US Army to compute artillery firing tables. It used about 17,000 vacuum tubes, weighed over 27 tonnes and could perform thousands of calculations per second — far faster than any electromechanical machine. Programming it meant physically rewiring it; its six programmers, including Jean Bartik and Betty Holberton, pioneered software. Earlier machines (Colossus, the Atanasoff–Berry Computer, Z3) were more specialized or less fully electronic; ENIAC is generally called the first general-purpose electronic computer.",
      history: "Design began in 1943 under John Mauchly and J. Presper Eckert; it was completed in 1945, ran its first real problem in December 1945, and was dedicated in February 1946. It remained in service until 1955, and its successors (EDVAC, UNIVAC I) launched the commercial computer industry.",
      guidance: "'First computer' claims depend on definition — mechanical, electromechanical, electronic-specialized and electronic-general-purpose machines all have candidates; ENIAC is the usual answer for the general-purpose electronic milestone.",
    },
    misconceptions: [
      { misconception: "The first computer was a personal computer.", correction: "Early computers filled rooms and served institutions; personal computers came decades later." },
    ],
    relatedIds: ["era-modern", "tech.computers", "who.hopper", "when.arpabet"],
    sources: [SRC_BRITANNICA],
    dateLabel: "1945",
    year: 1945,
    eraId: "era-modern",
  }),
  timelineEvent({
    id: "when.arpabet",
    title: "ARPANET sends its first message — the internet's origin",
    aliases: ["arpabet", "arpanet", "first internet message"],
    question: "When was the internet created?",
    categoryIds: ["cat-20", "cat-75", "cat-04"],
    summary: "ARPANET, the network that became the internet, sent its first message on 29 October 1969 between computers at UCLA and Stanford — the first link of the modern internet.",
    sections: {
      definition: "ARPANET was a US Department of Defense research network (1969) that pioneered packet switching and the TCP/IP principles underlying today's internet; its first host-to-host message was sent on 29 October 1969.",
      simple: "The internet began in 1969 when two university computers in the United States talked to each other over a new kind of network — the first 'internet' message.",
      detailed: "ARPANET connected research institutions so they could share computing resources. On 29 October 1969, a UCLA student sent the first message to a Stanford computer — the system crashed after the first two letters ('LO' of 'LOGIN'), a famous early bug. Packet switching — chopping data into packets routed independently — made the network resilient and scalable. ARPANET grew through the 1970s; TCP/IP (1983) unified networking; the World Wide Web (1989–91) made it usable by everyone.",
      history: "1969: first ARPANET link; 1971: email; 1983: TCP/IP; 1989: the World Wide Web is invented by Tim Berners-Lee; 1991: the web goes public. The internet is therefore a layered history, not a single creation date.",
      guidance: "'When was the internet created?' has several honest answers: ARPANET (1969), TCP/IP (1983) or the World Wide Web (1989–91) — the dates describe different layers of the same story.",
    },
    misconceptions: [
      { misconception: "The internet and the World Wide Web are the same thing.", correction: "The internet is the network of networks; the Web is an application (pages and links) that runs on it." },
    ],
    relatedIds: ["era-contemporary", "when.web", "tech.internet", "tech.networking", "when.first-computer"],
    sources: [SRC_BRITANNICA],
    dateLabel: "1969",
    year: 1969,
    eraId: "era-contemporary",
  }),
  timelineEvent({
    id: "when.us-constitution",
    title: "United States Constitution adopted",
    aliases: ["us constitution", "american constitution"],
    question: "When was the constitution adopted?",
    categoryIds: ["cat-20", "cat-18", "cat-17"],
    summary: "The United States Constitution was signed on 17 September 1787 and took effect on 4 March 1789 after ratification — a founding document of modern constitutional government.",
    sections: {
      definition: "The US Constitution is the supreme law of the United States, drafted at the Philadelphia Convention (1787), ratified by 1788 and effective from 4 March 1789; it created a federal republic with separated powers.",
      simple: "In 1787, the leaders of the young United States wrote a set of rules for how the country would be governed — that document still works today.",
      detailed: "The Constitution replaced the weak Articles of Confederation with a stronger federal government divided into legislative (Congress), executive (President) and judicial (courts) branches with checks and balances. It established federalism — power shared between the national government and the states — and, with the Bill of Rights (1791), protected fundamental liberties. Its adoption was contested: Federalists and Anti-Federalists debated ratification, and amendments (27 to date) have extended rights and changed institutions over two centuries.",
      history: "The Constitutional Convention met in Philadelphia from May to September 1787; the document was signed on 17 September 1787; nine states were needed to ratify, and the Constitution took effect on 4 March 1789. It was the first national constitution based on popular sovereignty and remains a model studied worldwide.",
      guidance: "Constitutions differ by country; this event is the canonical example of 'when was the constitution adopted' — other countries' constitutions have their own adoption dates.",
    },
    misconceptions: [
      { misconception: "The Declaration of Independence is the constitution.", correction: "The Declaration (1776) announced independence; the Constitution (1787) established the government — they are different documents." },
    ],
    relatedIds: ["era-early-modern", "con.constitution", "con.democracy", "place.united-states"],
    sources: [SRC_BRITANNICA, SRC_LIBRARY],
    dateLabel: "1787",
    year: 1787,
    eraId: "era-early-modern",
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §7 — "WHERE…?" PLACES — the remaining item types of the spec list
 * (states, provinces, cities, airports, universities, hospitals, government
 * institutions, historical sites, religious sites, businesses, attractions)
 * ════════════════════════════════════════════════════════════════════════════ */

const PLACE_RECORDS: KnowledgeRecord[] = [
  place({
    id: "place.california",
    title: "California",
    aliases: ["california state", "golden state"],
    question: "Where is California?",
    categoryIds: ["cat-21", "cat-04", "cat-09"],
    summary: "California is the most populous US state — a Pacific-coast region of 39 million people whose economy (tech, agriculture, film, entertainment) is among the world's largest.",
    sections: {
      geography: "California occupies the western edge of the United States on the Pacific Ocean: 1,637 km of coastline, the Sierra Nevada mountains, the Central Valley farmland, the Mojave Desert and the San Andreas fault. Major cities: Los Angeles, San Francisco, San Diego, Sacramento (capital).",
      economy: "California's economy would rank among the top economies of the world: Silicon Valley technology, Hollywood film, Central Valley agriculture, aerospace and clean energy.",
      culture: "California is the birthplace of Hollywood and Silicon Valley, home of diverse immigrant cultures and the center of US tech and entertainment industries.",
      guidance: "Population and economic figures are dynamic; the state's geography is stable knowledge.",
    },
    relatedIds: ["place.united-states", "place.silicon-valley", "place.new-york-city"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.ontario",
    title: "Ontario",
    aliases: ["province of ontario"],
    question: "Where is Ontario?",
    categoryIds: ["cat-21", "cat-09"],
    summary: "Ontario is Canada's most populous province — home to Toronto, Ottawa (the national capital) and the industrial heartland of the country.",
    sections: {
      geography: "Ontario stretches from the Great Lakes in the south to Hudson Bay in the north — over a million square kilometres, most of it sparsely populated. The south holds the cities (Toronto, Ottawa, Hamilton, London); the north is boreal forest and muskeg.",
      economy: "Ontario is Canada's manufacturing and financial heartland: Toronto's financial district, the auto industry, technology, and mining in the north.",
      culture: "Ontario's population is one of the most multicultural in the world, with large immigrant communities and both English and French official languages.",
      guidance: "Population figures are dynamic; geography is stable.",
    },
    relatedIds: ["place.united-kingdom", "place.new-york-city"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.nairobi",
    title: "Nairobi",
    aliases: ["nairobi city", "nairobi kenya"],
    question: "Where is Nairobi?",
    categoryIds: ["cat-21", "cat-09", "cat-55"],
    summary: "Nairobi is the capital and largest city of Kenya — East Africa's major economic and diplomatic hub, founded in 1899 as a railway depot and growing into a city of over four million.",
    sections: {
      geography: "Nairobi sits in south-central Kenya at about 1,795 m above sea level, on the edge of the Great Rift Valley, with Nairobi National Park — a wildlife park — at its boundary. The Nairobi River crosses the city.",
      history: "Founded in 1899 as a depot on the Uganda Railway, Nairobi became the capital of British East Africa in 1907 and of independent Kenya in 1963, growing rapidly through the 20th and 21st centuries.",
      economy: "Nairobi hosts the UN Environment Programme and UN-Habitat, major banks, tech startups ('Silicon Savannah'), manufacturing and the region's largest stock exchange.",
      culture: "A cosmopolitan city of many ethnic communities — Kikuyu, Luo, Kamba, Maasai and others — with a vibrant music, art and technology scene.",
      guidance: "Population figures are dynamic estimates; the city's role and geography are stable.",
    },
    relatedIds: ["place.kenya", "place.lagos", "con.government"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.new-york-city",
    title: "New York City",
    aliases: ["new york", "nyc", "manhattan"],
    question: "Where is New York City?",
    categoryIds: ["cat-21", "cat-09", "cat-55"],
    summary: "New York City is the largest city in the United States — a global financial, cultural and media capital of over eight million people, built around the harbour where the Hudson meets the Atlantic.",
    sections: {
      geography: "New York City sits at the mouth of the Hudson River on the Atlantic coast of the northeastern United States. Its five boroughs — Manhattan, Brooklyn, Queens, the Bronx and Staten Island — spread across islands and mainland, linked by bridges, tunnels and one of the world's largest subway systems.",
      history: "Founded as the Dutch colony New Amsterdam in 1624 and renamed New York in 1664, the city became the United States' first capital (1789–90) and its gateway for millions of immigrants through Ellis Island.",
      economy: "New York is a global financial center (Wall Street, the New York Stock Exchange), with major industries in media, technology, real estate, fashion and trade.",
      culture: "One of the world's most culturally influential cities: Broadway, museums (the Met, MoMA), music scenes from jazz to hip-hop, and hundreds of languages spoken in its neighborhoods.",
      guidance: "Population and economic figures are dynamic; the city's geography and history are stable.",
    },
    relatedIds: ["place.united-states", "place.california", "ent.film", "ent.music"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.murtala-muhammed-airport",
    title: "Murtala Muhammed International Airport",
    aliases: ["murtala muhammed airport", "lagos airport", "mma2"],
    question: "Where is Murtala Muhammed International Airport?",
    categoryIds: ["cat-21", "cat-36", "cat-35"],
    summary: "Murtala Muhammed International Airport (MMIA) in Ikeja, Lagos, is Nigeria's busiest international airport — the main gateway for air travel into the country.",
    sections: {
      geography: "The airport is located in Ikeja, on the mainland of Lagos State in southwestern Nigeria, about 20 km northwest of Lagos Island. It has domestic and international terminals, with a separate terminal (MMA2) serving domestic flights.",
      history: "Opened in 1978 as Lagos International Airport, it was renamed after General Murtala Muhammed, Nigeria's head of state from 1975 until his assassination in 1976. It became the hub of Nigeria's flag carrier era and remains the country's primary international gateway.",
      guidance: "Flight schedules, terminal layouts and facilities change frequently — verify current airport information before travel.",
    },
    relatedIds: ["place.lagos", "place.nigeria", "trv.transportation", "trv.planning"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.university-of-ibadan",
    title: "University of Ibadan",
    aliases: ["ui", "university college ibadan", "university of ibadan nigeria"],
    question: "Where is the University of Ibadan?",
    categoryIds: ["cat-21", "cat-01", "cat-20"],
    summary: "The University of Ibadan, founded in 1948 as University College Ibadan, is Nigeria's oldest university — a leading African institution in medicine, the humanities and the sciences.",
    sections: {
      geography: "The university occupies a large campus in Ibadan, Oyo State, southwestern Nigeria — the country's third-largest city by population and historically the largest city in West Africa.",
      history: "Founded in 1948 as University College Ibadan, a college of the University of London, it became an independent university in 1962. Its first graduates included novelist Chinua Achebe, and its teaching hospital and research institutes have trained generations of African professionals.",
      culture: "Ibadan itself is a Yoruba cultural center; the university's motto is 'Recte Sapere Fons' (the true source of knowledge is to know things rightly).",
      guidance: "Admission requirements, fees and rankings change — verify current information with the university.",
    },
    relatedIds: ["con.university", "con.education-path", "who.achebe", "place.uch-ibadan"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.uch-ibadan",
    title: "University College Hospital, Ibadan",
    aliases: ["uch", "uch ibadan", "university college hospital"],
    question: "Where is University College Hospital, Ibadan?",
    categoryIds: ["cat-21", "cat-27", "cat-01"],
    summary: "University College Hospital (UCH), Ibadan, opened in 1957 as Nigeria's first teaching hospital — a national referral center and one of West Africa's largest hospitals.",
    sections: {
      geography: "UCH is located in the city of Ibadan, Oyo State, southwestern Nigeria, adjacent to the University of Ibadan campus, with which it has been partnered since its founding.",
      history: "UCH opened in 1957 as the teaching hospital of University College Ibadan, training Nigeria's first generations of doctors, nurses and medical specialists. It has remained a major referral center for West Africa and a center of medical research.",
      guidance: "Services, facilities and contacts change — verify current information with the hospital directly. Medical information from the knowledge layer never replaces professional care.",
    },
    relatedIds: ["place.university-of-ibadan", "hlth.public-health", "disc.medicine"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.aso-rock",
    title: "Aso Rock",
    aliases: ["aso villa", "presidential villa", "seat of the nigerian presidency"],
    question: "Where is Aso Rock?",
    categoryIds: ["cat-21", "cat-18", "cat-19"],
    summary: "Aso Rock is a 400-metre granite outcrop in Abuja, Nigeria, beside which the Presidential Villa ('Aso Villa') houses the Nigerian presidency — a byword for the federal government itself.",
    sections: {
      geography: "Aso Rock rises near the centre of Abuja, Nigeria's capital since 1991, in the Federal Capital Territory. The Presidential Villa complex, commonly called Aso Villa, sits at its base.",
      history: "Abuja replaced Lagos as the federal capital in 1991; the Presidential Villa became the seat of the presidency under the Third Republic and the Fourth Republic. 'Aso Rock' has since become shorthand in Nigerian political discourse for the executive branch.",
      economy: "The surrounding Three Arms Zone contains the National Assembly, the Supreme Court and other federal institutions, making Abuja the political heart of Nigeria.",
      guidance: "Office-holders and current political events are dynamic information; the site's geography and role are stable.",
    },
    relatedIds: ["place.nigeria", "con.government", "law.executive", "law.legislatures"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.timbuktu",
    title: "Timbuktu",
    aliases: ["timbuctu", "tombouctou"],
    question: "Where is Timbuktu?",
    categoryIds: ["cat-21", "cat-20", "cat-01"],
    summary: "Timbuktu, in Mali, was a fabled center of trade and Islamic scholarship on the edge of the Sahara — its ancient manuscripts and mosques are a UNESCO World Heritage site.",
    sections: {
      geography: "Timbuktu lies on the southern edge of the Sahara Desert in Mali, near the Niger River bend — a crossroads of trans-Saharan caravan routes connecting West Africa with North Africa and the wider Islamic world.",
      history: "Founded around the 12th century by Tuareg herders, Timbuktu flourished from the 14th century as a gold-salt trade hub and a center of learning under the Mali and Songhai empires, with the Sankore University and thousands of manuscripts. It declined after the Moroccan invasion of 1591, and its legend as a remote, almost mythical city grew in Europe. Its earthen mosques and manuscript libraries are UNESCO-listed; the manuscripts were famously hidden and rescued during the 2012 conflict in Mali.",
      culture: "Timbuktu's legacy is a symbol of Africa's written scholarly tradition — Islamic law, astronomy, mathematics and literature preserved in Arabic and Ajami manuscripts.",
      guidance: "Current security and travel conditions in the region change — verify with official travel advice.",
    },
    relatedIds: ["era-medieval", "place.nigeria", "con.university", "when.al-qarawiyyin"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  place({
    id: "place.mecca",
    title: "Mecca",
    aliases: ["makkah", "makkah al-mukarramah", "holy city of mecca"],
    question: "Where is Mecca?",
    categoryIds: ["cat-21", "cat-22", "cat-35"],
    summary: "Mecca, in western Saudi Arabia, is the holiest city of Islam — the birthplace of the Prophet Muhammad and the destination of the Hajj pilgrimage required of Muslims who are able.",
    sections: {
      geography: "Mecca lies in the Hejaz region of western Saudi Arabia, about 70 km inland from the Red Sea coast at Jeddah, in a narrow desert valley surrounded by mountains.",
      history: "Mecca was a trading and religious center before Islam, home to the Kaaba; the Prophet Muhammad was born there around 570 CE, and the city became the spiritual center of Islam after the conquest of Mecca in 630 CE. The Grand Mosque (Masjid al-Haram) surrounds the Kaaba, toward which Muslims worldwide pray.",
      culture: "The Hajj pilgrimage draws millions of Muslims each year; non-Muslims are not permitted to enter the city. Mecca's significance is primarily religious and its governance is Saudi.",
      guidance: "Pilgrimage logistics, seasons and regulations change annually — verify current information with official Saudi authorities. WINDELS presents this geography educationally; religious significance is described, not ranked.",
    },
    misconceptions: [
      { misconception: "Mecca is in the United Arab Emirates.", correction: "Mecca is in Saudi Arabia, in the Hejaz region." },
    ],
    relatedIds: ["con.religion-diversity", "when.hijra", "trv.customs-etiquette", "cult.diversity"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.silicon-valley",
    title: "Silicon Valley",
    aliases: ["silicon valley california", "bay area tech", "the valley"],
    question: "Where is Silicon Valley?",
    categoryIds: ["cat-21", "cat-04", "cat-09"],
    summary: "Silicon Valley is the technology-business region south of San Francisco, California — home of Apple, Google, Meta and thousands of startups, and the global center of the modern tech industry.",
    sections: {
      geography: "Silicon Valley spans the Santa Clara Valley and nearby areas of the San Francisco Bay Area, centered on San Jose, Palo Alto, Mountain View, Cupertino and Menlo Park, near Stanford University.",
      history: "The region's electronics industry began with defense and radio in the early 20th century; the name 'Silicon Valley' came from the semiconductor companies of the 1970s. It became the epicenter of the personal-computer, internet and artificial-intelligence industries.",
      economy: "The Valley is the headquarters of many of the world's largest technology companies and a dense ecosystem of venture capital, startups, universities and talent.",
      culture: "Its culture of innovation, risk-taking and rapid change is globally influential — and studied critically for its effects on housing, inequality and society.",
      guidance: "Companies and valuations change constantly — treat current business facts as dynamic information.",
    },
    relatedIds: ["place.california", "tech.semiconductors", "tech.software-engineering", "bus.entrepreneurship"],
    sources: [SRC_BRITANNICA],
  }),
  place({
    id: "place.victoria-falls",
    title: "Victoria Falls",
    aliases: ["mosi-oa-tunya", "the smoke that thunders", "victoria falls zambia zimbabwe"],
    question: "Where are Victoria Falls?",
    categoryIds: ["cat-21", "cat-35", "cat-40"],
    summary: "Victoria Falls — 'Mosi-oa-Tunya', the Smoke that Thunders — is one of the world's largest waterfalls, on the Zambezi River between Zambia and Zimbabwe, and a major tourist attraction.",
    sections: {
      geography: "Victoria Falls lies on the Zambezi River at the border of Zambia and Zimbabwe in southern Africa. The falls are about 1,708 m wide and up to 108 m high, among the largest curtains of falling water on Earth; the river plunges into a narrow gorge below.",
      history: "The falls were known to local peoples for centuries; David Livingstone, the Scottish explorer, named them Victoria Falls in 1855. The towns of Livingstone (Zambia) and Victoria Falls (Zimbabwe) grew around tourism and the railway bridge built in 1905.",
      culture: "The falls hold deep cultural significance for the Tonga people; 'Mosi-oa-Tunya' remains the preferred local name, and the area is a UNESCO World Heritage site.",
      guidance: "Water flow varies seasonally — peak flow is typically late summer — and current conditions, visas and entry rules must be verified before travel.",
    },
    relatedIds: ["trv.planning", "trv.safety", "place.nile", "cult.regional-cultures"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §9 — EDUCATION & UNIVERSITY — remaining disciplines of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const DISCIPLINE_RECORDS: KnowledgeRecord[] = [
  discipline({
    id: "disc.chemistry",
    title: "Chemistry",
    aliases: ["chemistry discipline", "chemical science"],
    question: "What is chemistry?",
    categoryIds: ["cat-01", "cat-02"],
    summary: "Chemistry is the science of matter — what substances are made of, how they change and how they interact — the central science linking physics with biology.",
    sections: {
      definition: "The branch of science that studies the composition, structure, properties and transformations of matter: atoms, molecules, elements, compounds and reactions.",
      simple: "Chemistry is the study of stuff — what everything is made of and how it changes when you mix, heat or combine it.",
      detailed: "Chemistry explains the world at the atomic and molecular level: why water boils at 100°C, how medicines work, how plastics are made, how batteries store energy. Its branches include organic (carbon compounds), inorganic (metals and minerals), physical (energy and rates), analytical (measuring substances) and biochemistry (the chemistry of life).",
      learning_path: "FOUNDATIONS: atoms, elements, the periodic table, bonds, reactions. INTERMEDIATE: stoichiometry, thermodynamics, kinetics, organic basics. ADVANCED: quantum chemistry, spectroscopy, synthesis. RESEARCH: materials, catalysis, computational chemistry.",
      guidance: "Chemistry is an experimental science — claims about substances and reactions should be checked against established chemistry, and lab work done with proper safety.",
    },
    misconceptions: [
      { misconception: "Chemicals are artificial and dangerous.", correction: "Everything — water, air, food, your body — is made of chemicals; chemistry studies them all." },
    ],
    relatedIds: ["sci.chemistry", "disc.physics", "disc.biology", "sci.materials-science"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.international-relations",
    title: "International relations",
    aliases: ["ir", "global affairs", "international affairs"],
    question: "What is international relations?",
    categoryIds: ["cat-01", "cat-65", "cat-19"],
    summary: "International relations (IR) is the academic field that studies how states, international organizations, corporations and peoples interact across borders — war and peace, trade, diplomacy and global governance.",
    sections: {
      definition: "The study of interactions among sovereign states and other international actors — the UN, regional organizations, multinational companies, NGOs — including the causes of war and cooperation, and the institutions that shape them.",
      simple: "International relations is the study of how countries deal with each other — treaties, trade, wars, diplomacy and the United Nations.",
      detailed: "IR draws on political science, history, economics and law. Core theories interpret the world differently: realism emphasizes power and security; liberalism emphasizes institutions and cooperation; constructivism emphasizes ideas and identity. Key subjects: international security, international political economy, international law, human rights, migration, climate diplomacy and regional integration.",
      learning_path: "FOUNDATIONS: states, sovereignty, the UN system, basic theories. INTERMEDIATE: security, trade, international law, regional organizations. ADVANCED: foreign-policy analysis, international political economy, conflict studies. RESEARCH: quantitative and qualitative research design, IR theory.",
      guidance: "IR is an academic discipline with competing theories — it explains and interprets world politics rather than endorsing one policy line.",
    },
    misconceptions: [
      { misconception: "International relations is the same as current affairs news.", correction: "News reports current events; IR is the systematic academic study of the structures and forces behind them." },
    ],
    relatedIds: ["con.international-relations", "disc.political-science", "disc.economics", "law.international"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  discipline({
    id: "disc.agriculture",
    title: "Agriculture",
    aliases: ["farming", "agricultural science", "agronomy"],
    question: "What is agriculture?",
    categoryIds: ["cat-01", "cat-39"],
    summary: "Agriculture is the practice and science of cultivating plants and raising animals for food, fiber and fuel — the foundation of human civilization and a major field of study.",
    sections: {
      definition: "The cultivation of crops and the rearing of livestock for food, fiber, fuel and other products, spanning farming practice, agricultural science, agronomy, soil science and agricultural economics.",
      simple: "Agriculture is farming — growing food and raising animals — and the science of doing it better and more sustainably.",
      detailed: "Agriculture transformed human societies roughly 10,000 years ago and now feeds eight billion people. It covers crop production, animal husbandry, soil and water management, plant breeding, pest control, mechanization, food systems and agribusiness — increasingly shaped by biotechnology, data and climate change.",
      learning_path: "FOUNDATIONS: plants, soils, animals, seasons. INTERMEDIATE: crop science, animal science, farm management. ADVANCED: agronomy, agricultural economics, sustainable systems. RESEARCH: plant genetics, precision agriculture, food security.",
      guidance: "Farming practices, markets and policies vary by region and change with climate and technology.",
    },
    misconceptions: [
      { misconception: "Agriculture is only traditional farming.", correction: "Modern agriculture spans genetics, robotics, data science, economics and ecology." },
    ],
    relatedIds: ["disc.biology", "sci.environmental-science", "disc.economics"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.architecture",
    title: "Architecture",
    aliases: ["architecture discipline", "building design"],
    question: "What is architecture?",
    categoryIds: ["cat-01", "cat-44", "cat-43"],
    summary: "Architecture is the art and science of designing buildings and spaces — combining aesthetics, engineering, culture and function to shape the places people live and work.",
    sections: {
      definition: "The discipline of designing and planning buildings, structures and the spaces between them, integrating aesthetics, structural engineering, environmental performance, function and cultural meaning.",
      simple: "Architecture is designing buildings — making them safe, useful and beautiful, from houses to skyscrapers.",
      detailed: "Architecture spans urban design, landscape, interior and digital design. Architects work with engineers, planners and clients to balance form, function, cost, safety, climate and heritage. History of architecture is a history of civilizations — pyramids, cathedrals, mosques, skyscrapers — and modern practice emphasizes sustainability and human wellbeing.",
      learning_path: "FOUNDATIONS: drawing, design principles, building types, history. INTERMEDIATE: structures, materials, environmental design, urbanism. ADVANCED: professional practice, parametric design, conservation. RESEARCH: sustainable architecture, digital fabrication, housing studies.",
      guidance: "Architecture is a regulated profession in most countries; building design must meet legal and safety standards — professional architects and engineers are required.",
    },
    misconceptions: [
      { misconception: "Architecture is just making buildings look nice.", correction: "It integrates structure, safety, function, environment, cost and culture — aesthetics is one part." },
    ],
    relatedIds: ["disc.engineering", "disc.arts", "disc.education"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.education",
    title: "Education studies",
    aliases: ["education science", "teaching studies", "pedagogy"],
    question: "What is education studies?",
    categoryIds: ["cat-01", "cat-25"],
    summary: "Education studies is the academic field of how people learn and how teaching works — pedagogy, curriculum, assessment, learning theory and education policy.",
    sections: {
      definition: "The discipline that studies learning and teaching: how people acquire knowledge and skills, how schools and other institutions are organized, and how education policy shapes opportunity.",
      simple: "Education studies is the science of teaching and learning — how to help people learn well.",
      detailed: "The field draws on psychology (how learning happens), sociology (how schools reproduce or reduce inequality), history and philosophy (what education is for) and policy studies (how systems are run). It covers pedagogy, curriculum design, assessment, special education, educational technology and lifelong learning.",
      learning_path: "FOUNDATIONS: learning theories, classroom basics, child development. INTERMEDIATE: pedagogy, curriculum, assessment, inclusion. ADVANCED: education policy, educational psychology, leadership. RESEARCH: learning sciences, comparative education, education technology.",
      guidance: "Teaching is a certified profession in most countries; the study of education informs but does not replace professional training.",
    },
    misconceptions: [
      { misconception: "Anyone can teach without training.", correction: "Effective teaching draws on substantial knowledge of learning, curriculum and assessment; most systems require professional certification." },
    ],
    relatedIds: ["con.education-path", "disc.psychology", "disc.communications"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  discipline({
    id: "disc.communications",
    title: "Communications",
    aliases: ["communication studies", "media studies", "mass communication"],
    question: "What is communications?",
    categoryIds: ["cat-01", "cat-32", "cat-70"],
    summary: "Communications is the academic field of how information and meaning are created and shared — interpersonal, organizational, media and digital communication.",
    sections: {
      definition: "The discipline studying human communication: how messages are produced, transmitted, received and interpreted — across interpersonal, group, organizational, mass-media and digital contexts.",
      simple: "Communications is the study of how people share information — talking, writing, media, and how messages work or fail.",
      detailed: "The field combines social science and humanities: communication theory (how meaning is made), media studies (journalism, broadcasting, social media), organizational communication, public relations, and the psychology of persuasion. It prepares students for journalism, media, PR, marketing and corporate communication careers.",
      learning_path: "FOUNDATIONS: communication models, writing, public speaking. INTERMEDIATE: media systems, organizational communication, research methods. ADVANCED: strategic communication, media theory, audience research. RESEARCH: communication science, digital media studies.",
      guidance: "Media environments change rapidly; the fundamentals of clear, honest communication do not.",
    },
    misconceptions: [
      { misconception: "Communications is only about talking well.", correction: "It is a research field covering media systems, organizations, audiences and society." },
    ],
    relatedIds: ["rel.communication", "ent.history-trends", "disc.international-relations"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.arts",
    title: "Arts",
    aliases: ["fine arts", "visual arts studies"],
    question: "What are the arts?",
    categoryIds: ["cat-01", "cat-50", "cat-55"],
    summary: "The arts are the disciplines of creative expression — visual art, music, theatre, dance and film — studied both as practice and as a record of human culture.",
    sections: {
      definition: "The creative disciplines of visual art (painting, sculpture, drawing, photography), performing arts (music, theatre, dance) and media arts (film, digital art), studied as practice, history and theory.",
      simple: "The arts are the ways people create and share beauty and meaning — painting, music, theatre, dance and film.",
      detailed: "Art education develops both craft and critical understanding: studio practice, art history (from cave painting to contemporary art), aesthetics (what art is and why it matters) and the cultural contexts that shape art. The arts intersect with every society and period, and careers span galleries, studios, media, education and design.",
      learning_path: "FOUNDATIONS: materials, drawing, music and theatre basics, art history survey. INTERMEDIATE: studio specialization, theory, performance. ADVANCED: professional practice, curation, criticism. RESEARCH: art history, aesthetics, practice-based research.",
      guidance: "Artistic judgment is subjective and culturally situated — the field teaches informed appreciation, not a single standard of 'good' art.",
    },
    misconceptions: [
      { misconception: "Art has one universal standard of quality.", correction: "Artistic values differ across cultures, periods and movements; study reveals the reasons behind the differences." },
    ],
    relatedIds: ["disc.music", "cult.arts", "cre.art", "disc.architecture"],
    sources: [SRC_BRITANNICA],
  }),
  discipline({
    id: "disc.music",
    title: "Music",
    aliases: ["music studies", "musicology"],
    question: "What is music?",
    categoryIds: ["cat-01", "cat-51", "cat-55"],
    summary: "Music is the art of organized sound — studied as performance, composition, theory and history, and found in some form in every human culture.",
    sections: {
      definition: "The art and discipline of organizing sound in time — melody, harmony, rhythm, timbre and form — spanning performance, composition, theory, musicology, ethnomusicology and music technology.",
      simple: "Music is the art of sound — voices and instruments making melodies and rhythms that people enjoy, dance to and feel.",
      detailed: "Music studies covers performance (instruments, voice), composition and arranging, theory (notation, harmony, form), history (from medieval chant to Afrobeats and beyond), ethnomusicology (music of all cultures in its social context) and technology (production, recording, AI). Every culture makes music, but musical systems differ profoundly — scales, instruments, meanings — which is exactly what the discipline studies.",
      learning_path: "FOUNDATIONS: rhythm, pitch, notation, listening. INTERMEDIATE: theory, harmony, history, ensemble. ADVANCED: composition, analysis, ethnomusicology, production. RESEARCH: musicology, cognition, computational music.",
      guidance: "Musical taste is personal and cultural; the discipline describes and explains, it does not rank traditions as better or worse.",
    },
    misconceptions: [
      { misconception: "Western classical music is the only 'serious' music.", correction: "Musicology studies all traditions with equal seriousness — Indian raga, West African drumming, jazz, classical and pop." },
    ],
    relatedIds: ["ent.music", "cult.arts", "cre.music", "who.fela-kuti"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §10 — SCIENCE FIELDS — remaining fields of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const SCIENCE_RECORDS: KnowledgeRecord[] = [
  scienceField({
    id: "sci.earth-science",
    title: "Earth science",
    intents: ["education", "explanation", "definition"],
    aliases: ["geoscience", "earth sciences", "earth system science"],
    question: "What is earth science?",
    categoryIds: ["cat-02", "cat-40", "cat-41"],
    summary: "Earth science is the study of the planet as a system — its rocks, water, air, ice and life — spanning geology, oceanography, meteorology and climate science.",
    sections: {
      definition: "The sciences that study the solid Earth, its waters, atmosphere and the interactions among them: geology, geophysics, oceanography, meteorology, glaciology and Earth-system science.",
      simple: "Earth science is the study of our planet — the ground under your feet, the oceans, the air and how they all work together.",
      detailed: "Earth science treats the planet as interconnected systems: the geosphere (rocks, plate tectonics, volcanoes, earthquakes), hydrosphere (oceans, rivers, groundwater), atmosphere (weather, climate), cryosphere (ice) and biosphere (life). It explains earthquakes, tsunamis, resources like water and minerals, and the climate system — including how human activity is changing it.",
      levels: "FOUNDATIONS: rocks, minerals, water cycle, atmosphere basics. INTERMEDIATE: plate tectonics, weather systems, ocean circulation. ADVANCED: Earth-system modelling, geophysics, paleoclimate. RESEARCH: climate feedbacks, deep-Earth processes, planetary comparison.",
      guidance: "Current Earth data (temperatures, sea levels, seismic activity) is dynamic and must be sourced; the underlying science is stable knowledge.",
    },
    misconceptions: [
      { misconception: "Earth science is just geology.", correction: "Geology is one part; earth science integrates oceans, atmosphere, ice and life into one system." },
    ],
    relatedIds: ["sci.geology", "sci.oceanography", "sci.meteorology", "why.climate-change"],
    sources: [SRC_BRITANNICA],
  }),
  scienceField({
    id: "sci.space-science",
    title: "Space science",
    intents: ["education", "explanation", "definition"],
    aliases: ["space exploration science", "space studies"],
    question: "What is space science?",
    categoryIds: ["cat-02", "cat-49", "cat-40"],
    summary: "Space science is the study of the universe beyond Earth's atmosphere — planets, stars, galaxies, and the spacecraft and instruments that explore them.",
    sections: {
      definition: "The scientific study of space: planetary science, astrophysics, cosmology, solar physics and space physics, conducted with telescopes, spacecraft, probes and laboratories on Earth and in orbit.",
      simple: "Space science is learning about what is beyond Earth — planets, stars, galaxies — using telescopes and spacecraft.",
      detailed: "Space science answers questions about our solar system (planets, moons, asteroids, comets), stars and galaxies, the origins of the universe, and conditions in space itself. It is pursued with ground and space telescopes (Hubble, JWST), robotic probes (Mars rovers, Voyager), human spaceflight (ISS) and theoretical physics. It also produces practical benefits — satellite communication, weather prediction, navigation — and raises fundamental questions about life beyond Earth.",
      levels: "FOUNDATIONS: the solar system, stars, telescopes, orbits. INTERMEDIATE: planetary science, stellar evolution, space missions. ADVANCED: astrophysics, cosmology, space physics. RESEARCH: exoplanets, dark matter and dark energy, astrobiology.",
      guidance: "Space discoveries are ongoing — current mission results are dynamic and must be sourced; established astronomy is stable.",
    },
    misconceptions: [
      { misconception: "Space science is just sending rockets up.", correction: "It is the full scientific study of the cosmos; rockets and spacecraft are the tools." },
    ],
    relatedIds: ["sci.astronomy", "sci.physics", "when.moon-landing", "disc.engineering"],
    sources: [SRC_BRITANNICA, SRC_NASA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §11 — TECHNOLOGY — the remaining item of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const TECH_RECORDS: KnowledgeRecord[] = [
  technology({
    id: "tech.software-engineering",
    title: "Software engineering",
    aliases: ["software development", "programming career", "software engineering discipline"],
    question: "What is software engineering?",
    categoryIds: ["cat-07", "cat-06", "cat-04"],
    summary: "Software engineering is the disciplined practice of designing, building, testing and maintaining software systems — applying engineering methods to code that must be reliable, secure and maintainable.",
    sections: {
      definition: "The application of engineering principles to software: requirements analysis, architecture and design, implementation, testing, deployment, operations and maintenance of systems at scale.",
      simple: "Software engineering is building computer programs the way engineers build bridges — carefully, so they are safe, reliable and easy to fix.",
      detailed: "Software engineering turns code into systems: gathering requirements, designing architecture, choosing technologies, writing and reviewing code, automated testing, continuous delivery, monitoring and evolution. It differs from solo programming in its emphasis on teams, process, quality, security and long-term maintainability. Practices include version control, code review, CI/CD, testing pyramids, agile methods and incident response.",
      history: "The term was coined in the 1960s, prompted by the 'software crisis' of failing large projects; it grew into a formal discipline with its own body of knowledge (SWEBOK) and professional culture.",
      how_it_works: "Teams break a product into features, implement them in short cycles, verify with automated tests, ship through pipelines, monitor in production and fix issues — the engineering discipline is what keeps large systems from collapsing.",
      examples: "Building a banking app with secure authentication; running a social platform's backend; keeping a hospital's records system reliable 24/7.",
      guidance: "Software engineering is a career path with many entry routes — degrees, bootcamps, self-study — and continuous learning is part of the job.",
    },
    misconceptions: [
      { misconception: "Software engineering is just typing code.", correction: "Most engineering work is design, testing, review, communication and maintenance — code is a small part." },
      { misconception: "AI will replace software engineers.", correction: "AI tools change how engineers work (assistance, automation) but design, judgment and accountability remain human responsibilities." },
    ],
    relatedIds: ["car.software-engineer", "disc.computer-science", "ins.learn-programming", "who.hopper"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §12 — BUSINESS & MONEY — remaining items of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const BUSINESS_RECORDS: KnowledgeRecord[] = [
  business({
    id: "bus.entrepreneurship",
    title: "Entrepreneurship",
    aliases: ["entrepreneurship basics", "starting ventures"],
    question: "What is entrepreneurship?",
    categoryIds: ["cat-10", "cat-09", "cat-89"],
    summary: "Entrepreneurship is identifying an opportunity and building a venture around it — creating value while taking financial risk, from street businesses to technology startups.",
    sections: {
      definition: "The process of recognizing opportunities, assembling resources and creating ventures — products, services or organizations — while bearing the associated risks and rewards.",
      simple: "Entrepreneurship means spotting a need and starting something to meet it — a shop, a service, an app — and making it work.",
      detailed: "Entrepreneurship covers opportunity identification, market research, business models, funding, operations and growth. It exists on every scale — informal traders, small businesses, social enterprises, high-growth technology startups — and in every economy. Success depends on demand, execution, resources and sometimes luck; most ventures face serious risk, which is why honest entrepreneurship education emphasizes testing ideas before over-investing.",
      how_it_works: "A venture starts with a problem worth solving: the entrepreneur validates demand, designs a product or service and a revenue model, obtains resources (skills, money, partners), launches, learns from customers and adapts.",
      examples: "A food vendor who sees demand near a bus stop; a founder building a mobile payment app; a cooperative starting a cassava-processing plant.",
      guidance: "Starting a business is regulated — registration, taxes and licenses vary by country; professional advice is often needed.",
    },
    misconceptions: [
      { misconception: "Entrepreneurship is about having a brilliant idea.", correction: "Ideas are cheap; execution, market fit and persistence decide most ventures." },
      { misconception: "Most startups succeed quickly.", correction: "Most ventures fail or struggle for years — risk is real, and failure is common and instructive." },
    ],
    relatedIds: ["ins.start-business", "bus.business-models", "car.entrepreneur", "who.dangote"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.bookkeeping",
    title: "Bookkeeping",
    aliases: ["bookkeeping basics", "keeping accounts"],
    question: "What is bookkeeping?",
    categoryIds: ["cat-14", "cat-09"],
    summary: "Bookkeeping is the systematic recording of a business's financial transactions — the daily discipline that makes accounting, taxes and decisions possible.",
    sections: {
      definition: "The recording, organizing and storing of a business's financial transactions — sales, purchases, receipts, payments — typically in a double-entry system of debits and credits.",
      simple: "Bookkeeping is writing down every naira, dollar or shilling a business earns and spends, so it always knows where it stands.",
      detailed: "Bookkeeping tracks income and expenses, invoices and receipts, bank accounts, payroll and assets. Double-entry bookkeeping — every transaction entered twice, as debit and credit — has been the standard for over 500 years because it makes errors detectable. Good books produce the records needed for accounting, taxes, loans and informed decisions; poor books are a leading cause of small-business failure.",
      how_it_works: "Transactions are recorded daily in journals or software, posted to accounts (a chart of accounts), and summarized in statements — cash flow, profit and loss, balance sheet.",
      guidance: "Tax and reporting rules differ by country; bookkeepers maintain records, accountants interpret them — and qualified professionals should handle both.",
    },
    misconceptions: [
      { misconception: "Bookkeeping and accounting are the same.", correction: "Bookkeeping records transactions; accounting analyzes, interprets and reports on them — accounting builds on bookkeeping." },
    ],
    relatedIds: ["bus.accounting", "bus.taxes", "ins.start-business", "bus.budgeting"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.payments",
    title: "Payments",
    aliases: ["payment systems", "how payments work"],
    question: "How do payments work?",
    categoryIds: ["cat-12", "cat-11", "cat-04"],
    summary: "Payments are the systems that move money between people and businesses — cash, cards, bank transfers, mobile money and digital wallets — each with different costs, speeds and risks.",
    sections: {
      definition: "The methods and networks by which value moves from payer to payee: cash, cheques, cards, wire and instant transfers, mobile money, digital wallets and new central-bank digital currencies.",
      simple: "Payments are the different ways money moves — cash in hand, card at a shop, an app transfer on your phone.",
      detailed: "Modern payment systems include card networks (Visa, Mastercard) with their fees and settlement, instant payment schemes (like Nigeria's NIBSS Instant Payment and India's UPI), mobile money (M-Pesa's model), bank transfers, and crypto assets (a separate, volatile category). Each balances speed, cost, convenience, fraud risk and inclusion — mobile money brought financial services to millions who lack bank accounts.",
      how_it_works: "In a card or digital payment, the payer's bank authorizes the payment, the networks move the message, and settlement — actual movement of money between banks — happens in seconds, minutes or days depending on the scheme.",
      guidance: "Payment methods, fees and limits change; for current specifics verify with the provider. Financial decisions should consider fees, security and regulation.",
    },
    misconceptions: [
      { misconception: "All instant-looking payments settle instantly.", correction: "Authorization can be instant while settlement takes time; reversals and chargebacks also have rules." },
    ],
    relatedIds: ["con.banking", "con.money", "ins.send-money", "con.cryptocurrency"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.procurement",
    title: "Procurement",
    aliases: ["purchasing", "sourcing", "procurement basics"],
    question: "What is procurement?",
    categoryIds: ["cat-83", "cat-09", "cat-81"],
    summary: "Procurement is the business function of sourcing and buying the goods and services an organization needs — strategically, at the right quality, price and terms.",
    sections: {
      definition: "The process of identifying needs, sourcing suppliers, negotiating terms, purchasing, and managing supplier relationships — from office supplies to multi-million-dollar contracts.",
      simple: "Procurement is how organizations buy what they need — finding good suppliers, getting fair prices and managing the deals.",
      detailed: "Procurement spans sourcing strategy, supplier selection and evaluation, tendering (competitive bidding), negotiation, contracting, purchase orders, delivery and payment, and supplier performance management. Public procurement is governed by transparency and value-for-money rules; good procurement saves money, manages risk and can advance ethics (anti-corruption, sustainability, local content).",
      how_it_works: "A need is defined, specifications written, suppliers invited to bid (or negotiated with), contracts signed, deliveries verified and suppliers evaluated — with different rules for small purchases vs major contracts.",
      guidance: "Procurement rules differ sharply between private firms and public bodies — public tenders are legally regulated; consult official guidelines.",
    },
    misconceptions: [
      { misconception: "Procurement is just buying things cheaply.", correction: "It balances price with quality, risk, reliability and compliance — the cheapest bid is not always the best value." },
    ],
    relatedIds: ["bus.supply-chains", "bus.management", "law.contracts"],
    sources: [SRC_BRITANNICA],
  }),
  business({
    id: "bus.human-resources",
    title: "Human resources",
    aliases: ["hr", "human resource management", "hrm"],
    question: "What is human resources?",
    categoryIds: ["cat-86", "cat-33", "cat-09"],
    summary: "Human resources (HR) is the function that manages an organization's people — hiring, developing, paying, supporting and, when needed, parting with employees — within the law.",
    sections: {
      definition: "The management of an organization's workforce: recruitment and selection, onboarding, training and development, performance management, compensation and benefits, employee relations, health and safety, and compliance with employment law.",
      simple: "Human resources is the team that looks after the people in an organization — hiring them, paying them, training them and solving workplace problems.",
      detailed: "HR balances the interests of the organization and its people: finding and keeping talent, building skills, designing fair pay, handling grievances and discipline, and keeping the organization legally compliant. Modern HR also owns culture, diversity and inclusion, wellbeing and workforce planning. Employment law — contracts, notice, discrimination, safety — is the legal frame for everything HR does.",
      how_it_works: "HR operates through policies and processes (recruitment pipelines, performance reviews, payroll) and through people (HR business partners, recruiters, specialists), increasingly supported by HR software.",
      guidance: "Employment law differs by country; HR practices must comply with local law — legal advice is appropriate for disputes.",
    },
    misconceptions: [
      { misconception: "HR exists to protect the company from employees.", correction: "HR's role is to manage the employment relationship fairly and legally for both sides — a well-run function protects the organization by protecting its people." },
    ],
    relatedIds: ["law.employment", "bus.management", "car.job-search", "rel.workplace-communication"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §13 — CAREER INTELLIGENCE — remaining items of the spec list
 * (job descriptions, skills, qualifications, certifications, professional
 * development, salary-information handling)
 * ════════════════════════════════════════════════════════════════════════════ */

const CAREER_RECORDS: KnowledgeRecord[] = [
  career({
    id: "car.job-search",
    title: "Job search and applications",
    aliases: ["job hunting", "job applications", "reading job descriptions"],
    question: "How do I find and apply for jobs?",
    categoryIds: ["cat-33", "cat-34"],
    summary: "Finding a job means reading job descriptions critically, matching your skills and evidence to them, applying with tailored CV and cover letter, and following up professionally.",
    sections: {
      definition: "The process of identifying suitable vacancies, interpreting job descriptions and person specifications, submitting applications (CV, cover letter, forms), and managing interviews and offers.",
      simple: "Looking for a job: find roles that fit you, send a good CV and letter, prepare for the interview, and follow up politely.",
      detailed: "A job description states duties, requirements and the employer's expectations — read it as a checklist, and show evidence for every key requirement. Tailor each application rather than sending one CV everywhere; use the same keywords as the advert; prepare stories from your experience that demonstrate the skills asked for. Track applications, follow up after a week or two, and treat rejections as data.",
      steps: "1. Clarify the roles you want and the skills they need. 2. Search official and reputable job platforms. 3. Read each job description and note its key requirements. 4. Tailor your CV and cover letter with matching evidence. 5. Submit complete applications before deadlines. 6. Prepare for interviews and follow up afterwards.",
      guidance: "Beware of recruitment fraud — legitimate employers do not charge applicants fees; verify offers independently.",
    },
    misconceptions: [
      { misconception: "The more applications, the better.", correction: "Tailored, relevant applications outperform mass applications." },
    ],
    relatedIds: ["ins.write-cv", "ins.interview", "car.career-paths", "bus.human-resources"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.skills-qualifications",
    title: "Skills and qualifications",
    aliases: ["skills vs qualifications", "what employers want"],
    question: "What skills and qualifications do I need?",
    categoryIds: ["cat-33", "cat-34", "cat-89"],
    summary: "Employers weigh both qualifications (degrees, certificates, licenses) and skills — technical abilities plus transferable skills like communication, teamwork and problem-solving.",
    sections: {
      definition: "Qualifications are formal credentials (degrees, diplomas, certificates, licenses) awarded after study or assessment; skills are demonstrated abilities — technical (specific to a field) and transferable (usable across roles).",
      simple: "Qualifications are your certificates; skills are what you can actually do. Good careers need both.",
      detailed: "Some professions legally require qualifications (medicine, law, engineering, teaching, many trades). For most roles, employers look for a blend: relevant qualifications, technical skills, and transferable skills (communication, problem-solving, teamwork, time management, adaptability). Skills can be built without formal study — projects, volunteering, internships, self-learning — and demonstrated with evidence: portfolios, results, references.",
      guidance: "Requirements vary by country, employer and level; verify what a specific profession legally requires with its official regulator.",
    },
    misconceptions: [
      { misconception: "A degree alone guarantees a job.", correction: "Employers increasingly weight skills, experience and evidence alongside credentials." },
    ],
    relatedIds: ["car.career-paths", "con.education-path", "car.certifications", "ins.interview"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.certifications",
    title: "Certifications",
    aliases: ["professional certifications", "certification exams"],
    question: "What are professional certifications?",
    categoryIds: ["cat-33", "cat-34"],
    summary: "Certifications are credentials awarded after passing exams or assessments — proof of competence in a specific skill or technology, valuable in IT, finance, project management and many fields.",
    sections: {
      definition: "Credentials awarded by professional bodies or vendors after assessment, certifying competence in a defined domain — from technology (networking, cloud, security) to finance, project management and languages.",
      simple: "A certification is a certificate you earn by passing an exam that proves you know a certain subject or tool.",
      detailed: "Certifications differ from degrees in being focused, current and exam-based. Well-regarded examples include IT (networking, cloud, cybersecurity certifications), project management (PMP, PRINCE2), accounting (ACCA, CPA) and language proficiency tests. Value depends on the field, the certifying body's reputation and how employers treat it; some certifications require renewal. Certifications complement — they rarely replace — experience and degrees.",
      guidance: "Certification value changes with the market and vendor updates; check current recognition in your target industry and country.",
    },
    misconceptions: [
      { misconception: "Certifications alone get you hired.", correction: "They signal knowledge, but employers also want demonstrated experience and skills." },
      { misconception: "More certifications are always better.", correction: "Relevant, current certifications beat a scattered collection." },
    ],
    relatedIds: ["car.skills-qualifications", "car.career-paths", "con.education-path"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.professional-development",
    title: "Professional development",
    aliases: ["career growth", "upskilling", "lifelong learning at work"],
    question: "What is professional development?",
    categoryIds: ["cat-34", "cat-89", "cat-33"],
    summary: "Professional development is the continuous process of building skills, knowledge and networks throughout a career — training, mentoring, feedback, study and new responsibilities.",
    sections: {
      definition: "Deliberate, ongoing learning and growth in working life: formal training, courses and certifications, mentoring and coaching, feedback, conferences, reading, and stretching assignments.",
      simple: "Professional development is getting better at your job over time — learning new skills, taking courses, getting advice from experienced people.",
      detailed: "Careers change; technologies, tools and expectations shift. Professionals who invest in development stay relevant and open doors: set learning goals each year, seek feedback, find mentors, take on challenging projects, and document achievements. Many professions require continuing education to keep licenses valid.",
      how_it_works: "A cycle: assess where you are and where the market is going, choose development activities, apply what you learn at work, reflect, and repeat — employers and professional bodies often fund or require this.",
      guidance: "Development priorities differ by field and career stage; honest self-assessment and outside feedback beat guesswork.",
    },
    misconceptions: [
      { misconception: "Learning stops after graduation.", correction: "In most careers, continuous learning is now the norm, not the exception." },
    ],
    relatedIds: ["car.career-paths", "car.certifications", "day.time-management", "bus.leadership"],
    sources: [SRC_BRITANNICA],
  }),
  career({
    id: "car.salaries",
    title: "Salary information",
    aliases: ["salaries", "pay scales", "how much do jobs pay"],
    question: "How should I understand salary information?",
    categoryIds: ["cat-33", "cat-11"],
    summary: "Salaries change with market, location, experience and employer — WINDELS does not memorize pay figures; salary questions must be answered from current, reliable sources with dates.",
    sections: {
      definition: "Salary information is dynamic data about pay — levels, ranges, benchmarks — that varies by role, seniority, industry, location and time, and must be verified from current sources rather than memorized.",
      simple: "How much jobs pay changes over time and place — so always check current, reliable salary information rather than trusting old figures.",
      detailed: "Pay for the same role differs widely: by country and city (cost of living, demand), industry, company size, experience, education and negotiation. Published salary data comes from official statistics, professional surveys, job advertisements and employee reports — with very different reliability. In an interview or negotiation, research current ranges for your specific role and location, and consider the whole package (benefits, training, stability), not only the base figure.",
      guidance: "Specific salary figures are DYNAMIC information: they must carry a source and date. Current data should be verified from official statistics and reputable current surveys at the time of the question.",
      warning: "Never treat one anecdotal figure as a salary fact — pay data needs current, sourced verification.",
    },
    misconceptions: [
      { misconception: "A salary figure quoted last year still holds.", correction: "Pay moves with markets and inflation — verify current data when it matters." },
    ],
    relatedIds: ["pol.current-information", "car.career-paths", "ins.interview", "why.inflation"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §17 — CULTURE & HUMAN SOCIETY — remaining items of the spec list.
 * The no-stereotype rule is carried in every record: cultures are described
 * as internally diverse, never as uniform behaviour.
 * ════════════════════════════════════════════════════════════════════════════ */

const CULTURE_RECORDS: KnowledgeRecord[] = [
  culture({
    id: "cult.customs-traditions",
    title: "Customs and traditions",
    aliases: ["traditions", "social customs"],
    question: "What are customs and traditions?",
    categoryIds: ["cat-55", "cat-25"],
    summary: "Customs and traditions are the habitual practices and inherited ways of doing things in a community — greetings, ceremonies, food, dress — that vary widely within every culture.",
    sections: {
      definition: "Customs are established practices of a community (how people greet, marry, celebrate, eat); traditions are customs transmitted across generations. Both carry meaning and adapt over time.",
      simple: "Customs and traditions are the things people in a community regularly do — greetings, festivals, special foods — passed down from parents to children.",
      detailed: "Every society has customs around life's key moments — birth, naming, marriage, death — and around everyday interaction: greetings, hospitality, meals, gift-giving. Customs differ between and within cultures: what is polite in one place may differ elsewhere, and individuals within a culture follow customs to very different degrees. Customs are not static; they change with migration, religion, economics and technology.",
      guidance: "No custom applies identically to every member of a community; describe practices as tendencies, not rules for individuals, and avoid judging one culture's customs by another's standards.",
    },
    misconceptions: [
      { misconception: "All members of a culture practice all its customs.", correction: "Participation varies by family, region, age, religion and personal choice." },
    ],
    relatedIds: ["cult.diversity", "cult.festivals", "trv.customs-etiquette", "cult.regional-cultures"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.food-cuisine",
    title: "Food and cuisine",
    aliases: ["food culture", "cuisine", "cooking traditions"],
    question: "What shapes a culture's food?",
    categoryIds: ["cat-55", "cat-57", "cat-21"],
    summary: "A culture's food is shaped by its environment, history, religion and trade — and cuisines are internally diverse, with regional and family variations everywhere.",
    sections: {
      definition: "Food culture is how a community produces, prepares, shares and thinks about food: staple ingredients, cooking methods, meals, etiquette, festivals and the meanings attached to eating.",
      simple: "What people eat comes from their land, history and beliefs — and families and regions within one culture often eat very differently.",
      detailed: "Cuisine reflects geography (what grows locally), history (trade, migration, colonization), religion (dietary rules in Judaism, Islam, Hinduism and others), and technology. West African jollof, Japanese washoku, Mexican maize-based food, Italian regional cooking — each is a world of variation. Food also carries identity and memory, and globalization is creating new fusion cuisines everywhere.",
      guidance: "Describing a cuisine means describing patterns and variety — no single dish or meal defines all members of a culture.",
    },
    misconceptions: [
      { misconception: "A national dish represents everyone's daily food.", correction: "Daily food varies by region, class, religion and family; 'national' dishes are symbols, not averages." },
    ],
    relatedIds: ["day.cooking", "cult.regional-cultures", "cult.customs-traditions", "trv.customs-etiquette"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.clothing-fashion",
    title: "Clothing and fashion",
    aliases: ["traditional dress", "fashion culture"],
    question: "What shapes clothing and fashion?",
    categoryIds: ["cat-55", "cat-58", "cat-25"],
    summary: "Clothing expresses climate, culture, religion, status and identity — from everyday dress to ceremonial attire — while fashion is the ever-changing industry and taste system around it.",
    sections: {
      definition: "Clothing culture covers what people wear and why — practical, social, religious and expressive meanings — while fashion is the industry and cycle of style change, including design, production and consumption.",
      simple: "What people wear depends on weather, culture, beliefs and taste — and fashion is how styles keep changing.",
      detailed: "Dress communicates: uniforms mark roles, religious dress expresses belief (hijab, kippah, cassock, turban), ceremonial attire marks occasions (aso-oke, agbada, kente, kimono), and everyday clothing reflects climate and work. Fashion — as an industry — influences but never fully determines what people wear; global brands, local tailors and street styles interact. Clothing also carries economic weight: textiles and garment industries employ millions.",
      guidance: "Dress varies within every culture by age, region, occasion and personal choice — describing a 'traditional' garment never describes what everyone wears.",
    },
    misconceptions: [
      { misconception: "Traditional dress is what people wear every day.", correction: "Ceremonial and everyday dress differ; most people wear practical contemporary clothing daily." },
    ],
    relatedIds: ["cult.customs-traditions", "cult.regional-cultures", "day.clothing"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.arts",
    title: "Art and visual culture",
    aliases: ["visual culture", "art traditions"],
    question: "What is visual culture?",
    categoryIds: ["cat-55", "cat-50", "cat-51"],
    summary: "Every society makes art — images, objects, music, performance — and visual culture studies how these express identity, belief and power across time and place.",
    sections: {
      definition: "The study of how societies produce and use visual expression — painting, sculpture, textiles, architecture, photography, film and design — and what these works mean in their cultural context.",
      simple: "Art and visual culture is how people everywhere make and use images and beautiful objects — from cave paintings to films.",
      detailed: "Art is universal but its forms and meanings are not: an African mask, an Islamic geometric pattern, a Renaissance altar-piece and a digital artwork each belong to a specific visual language with its own rules, purposes and audiences. Visual culture studies the full range — fine art, popular imagery, religious art, advertising, design — and asks who makes images, who controls them and what they do in society.",
      guidance: "Artworks should be understood in their own cultural and historical terms; judging one tradition by another's standards distorts both.",
    },
    misconceptions: [
      { misconception: "Art is a Western invention with a single history.", correction: "Every civilization has rich visual traditions; 'art history' as a discipline is now global." },
    ],
    relatedIds: ["disc.arts", "who.enwonwu", "cult.festivals", "cre.art"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.family-structures",
    title: "Family structures",
    aliases: ["family forms", "kinship systems"],
    question: "What are family structures?",
    categoryIds: ["cat-55", "cat-30", "cat-25"],
    summary: "Families take many forms — nuclear, extended, polygynous, single-parent, chosen — shaped by culture, economics and law, and every society contains several at once.",
    sections: {
      definition: "The ways societies organize kinship and care: household forms (nuclear, extended, joint), marriage systems (monogamy, polygamy in some societies), descent rules (patrilineal, matrilineal, bilateral) and the rights and duties between relatives.",
      simple: "Families come in many shapes — parents and children, grandparents and cousins nearby, single parents, adopted families — and all are normal somewhere.",
      detailed: "Anthropology shows enormous variety in family life: extended families common in many African, Asian and Middle Eastern societies; nuclear households typical in parts of Europe and the Americas; matrilineal systems in some groups (such as parts of the Akan); and legal recognition of same-sex and single-parent families growing in many countries. Family forms shift with urbanization, migration, law and economics — and ideals of family life often differ from lived reality.",
      guidance: "No family structure is 'the natural one'; describe patterns with their regional and historical context, and avoid assuming one model is universal.",
    },
    misconceptions: [
      { misconception: "The nuclear family is the traditional human family.", correction: "Extended and other kinship arrangements have been common throughout most of human history and remain so in much of the world." },
    ],
    relatedIds: ["cult.social-institutions", "rel.family", "cult.diversity", "disc.sociology"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.social-institutions",
    title: "Social institutions",
    aliases: ["institutions of society"],
    question: "What are social institutions?",
    categoryIds: ["cat-55", "cat-25"],
    summary: "Social institutions are the durable structures that organize human life — family, education, religion, economy, law and government — each with norms, roles and history.",
    sections: {
      definition: "Enduring patterns of organized social life: kinship and family, education, religion, the economy, law, politics and media — each with established roles, norms and institutions that shape behaviour across generations.",
      simple: "Social institutions are the big structures of society — family, schools, religion, markets, courts and government — that organize how people live together.",
      detailed: "Sociology studies how institutions form, what functions they serve, who they include and exclude, and how they change. The family socializes children; education transmits knowledge and sorts opportunity; religion organizes belief and community; law and government set and enforce rules; the economy organizes production and exchange. Institutions interact — schools depend on law, families on the economy — and their forms differ widely across societies and eras.",
      guidance: "Institutions are human creations with history and variation — describing them as fixed or universal hides how they differ and evolve.",
    },
    misconceptions: [
      { misconception: "Institutions are natural and unchangeable.", correction: "They are historical creations that vary across societies and change over time." },
    ],
    relatedIds: ["cult.family-structures", "disc.sociology", "con.government", "disc.education"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.regional-cultures",
    title: "Regional cultures",
    aliases: ["regional identity", "local cultures"],
    question: "What are regional cultures?",
    categoryIds: ["cat-55", "cat-21"],
    summary: "Regional cultures are the distinctive ways of life of particular areas — dialects, food, music, dress and identity — which differ even within one country or ethnic group.",
    sections: {
      definition: "The local variations in language, food, music, dress, values and identity that distinguish one region from another — within countries, across borders and within larger cultural groups.",
      simple: "Regional cultures are the local flavours of a country or people — different accents, foods and customs from place to place.",
      detailed: "Culture is never uniform across a territory: northern and southern Nigeria, urban and rural Japan, Scotland and Cornwall each carry distinct traditions, dialects and identities. Regional cultures form from geography, history, migration and economics, and they persist even under globalization — often strengthened by pride in local food, festivals and language.",
      guidance: "Regional differences are real but always within-family: individuals vary, and regional labels never capture everyone in a place.",
    },
    misconceptions: [
      { misconception: "One regional culture represents the whole country.", correction: "Countries contain multiple regional cultures; national labels are umbrella terms." },
    ],
    relatedIds: ["cult.diversity", "lng.dialects-slang", "cult.food-cuisine", "trv.customs-etiquette"],
    sources: [SRC_BRITANNICA],
  }),
  culture({
    id: "cult.diaspora",
    title: "Diaspora communities",
    aliases: ["diaspora", "diasporas"],
    question: "What are diaspora communities?",
    categoryIds: ["cat-55", "cat-20", "cat-21"],
    summary: "Diasporas are communities living outside their ancestral homelands who maintain ties, identity and culture across borders — like the Nigerian, Indian, Chinese and Jewish diasporas.",
    sections: {
      definition: "Populations dispersed from an original homeland who retain connections to it — through identity, language, religion, family, remittances, organizations and travel — while becoming part of their new societies.",
      simple: "A diaspora is a community of people from one place living in many other places, keeping their culture and ties to home.",
      detailed: "Diasporas form through migration driven by labour, education, conflict and family — and they transform both ends: they sustain homelands through remittances and investment, carry culture (food, music, religion, language) into new countries, and create hybrid identities. Examples include the African diaspora of the transatlantic era, Indian and Chinese diaspora networks, and the modern Nigerian diaspora across Europe, North America and Asia.",
      guidance: "Diaspora identity is diverse — members differ in language, religion, generation and connection to the homeland; describe patterns, not uniform communities.",
    },
    misconceptions: [
      { misconception: "Diaspora members are all alike and all plan to return.", correction: "Diasporas are diverse in identity and ties; many are settled for generations while maintaining cultural connection." },
    ],
    relatedIds: ["cult.regional-cultures", "why.migration", "cult.diversity", "lng.indigenous-languages"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §18 — TRAVEL & WORLD — remaining items of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const TRAVEL_RECORDS: KnowledgeRecord[] = [
  travel({
    id: "trv.transportation",
    title: "Transportation while travelling",
    aliases: ["getting around", "public transport for travellers"],
    question: "How do I get around while travelling?",
    categoryIds: ["cat-35", "cat-36"],
    summary: "Getting around abroad means choosing between planes, trains, buses, taxis, ride-hailing and car hire — comparing cost, safety, convenience and local practice.",
    sections: {
      definition: "The options for moving within and between destinations — aviation, rail, long-distance and local buses, taxis and ride-hailing, ferries, car rental and two-wheelers — each with local rules and risks.",
      simple: "When you travel, you choose how to move around — planes for long distances, buses and trains for shorter ones, taxis for last kilometres.",
      detailed: "Transport choice balances cost, time, safety and experience: high-speed rail suits some regions, domestic flights others; local minibuses (like danfos and keke in Nigeria) are cheap but vary in safety; ride-hailing apps are convenient where available; car hire needs licenses, insurance and local driving rules. Some places have excellent public transport (London, Tokyo); others rely on private options. Always agree taxi fares in advance where meters are absent.",
      guidance: "Routes, prices, safety and availability change — verify current transport information for your destination before and during travel.",
    },
    misconceptions: [
      { misconception: "Rental cars are always the best way to see a country.", correction: "In many cities, public transport or ride-hailing is cheaper and less stressful than driving." },
    ],
    relatedIds: ["trv.planning", "trv.safety", "place.murtala-muhammed-airport", "day.transportation"],
    sources: [SRC_BRITANNICA],
  }),
  travel({
    id: "trv.currency-money",
    title: "Currency and money abroad",
    aliases: ["foreign currency", "money when travelling", "exchange rates"],
    question: "How do I handle money while travelling?",
    categoryIds: ["cat-35", "cat-11"],
    summary: "Handling money abroad means understanding the local currency, exchange options, card acceptance and fees — and treating exchange rates as dynamic information.",
    sections: {
      definition: "The practicalities of paying abroad: local currency, exchanging money (banks, official bureaux, black markets), card and mobile payments, ATM use, fees and cash needs.",
      simple: "When travelling, learn the local money, check whether cards work, and get local cash safely — rates change, so check current ones.",
      detailed: "Each country has its own currency (naira, dollar, euro, yen, cedi, rand, shilling...) and its own payment culture: some places are card-heavy, others cash-first, many now use mobile money. Exchange options — banks, official bureaux, ATMs — differ in rates and fees; unofficial street exchange is risky and often illegal. Notify banks before travel, carry a backup card and some cash, and keep receipts.",
      guidance: "Exchange rates and fees are DYNAMIC information — always verify current rates from official or reputable sources at the time of travel.",
      warning: "Never rely on a memorized exchange rate; rates move daily and official rates can differ from market rates.",
    },
    misconceptions: [
      { misconception: "Airport exchange desks always give the best rates.", correction: "They are often the most expensive; compare banks, ATMs and official bureaux — and check fees." },
    ],
    relatedIds: ["con.money", "car.salaries", "trv.planning", "pol.current-information"],
    sources: [SRC_BRITANNICA],
  }),
  travel({
    id: "trv.weather-climate",
    title: "Weather and climate for travel",
    aliases: ["best time to visit", "travel weather", "seasons for travel"],
    question: "How does weather affect travel planning?",
    categoryIds: ["cat-35", "cat-41"],
    summary: "Weather shapes when and where to travel — seasons, monsoons, dry seasons, cyclone and heat risks — and current forecasts are dynamic information to verify close to departure.",
    sections: {
      definition: "The role of climate (long-term patterns — rainy and dry seasons, monsoons, winters) and weather (short-term conditions) in choosing destinations, timing and packing.",
      simple: "Check the seasons before you travel — some places are rainy or very hot at certain times of year — and check the forecast again just before you go.",
      detailed: "Climate tells you the general pattern: West Africa's dry and rainy seasons, the Indian monsoon, Caribbean hurricane season (roughly June–November), Mediterranean summers, tropical heat year-round. This affects what to pack, what activities are possible and even safety (floods, heat, cyclones). Weather forecasts refine this for your actual travel dates — and forecasts lose reliability with lead time, so re-check nearer departure.",
      guidance: "Climate averages are stable knowledge; current weather and forecasts are dynamic — verify with official meteorological services before and during travel.",
    },
    misconceptions: [
      { misconception: "A country's climate is the same everywhere.", correction: "Large countries span several climates — Nigeria's north and south, for example, differ greatly." },
    ],
    relatedIds: ["sci.meteorology", "why.climate-change", "trv.planning", "trv.safety"],
    sources: [SRC_BRITANNICA, SRC_WHO],
  }),
  travel({
    id: "trv.customs-etiquette",
    title: "Local customs and etiquette",
    aliases: ["cultural etiquette", "travel etiquette", "being respectful abroad"],
    question: "How do I respect local customs when travelling?",
    categoryIds: ["cat-35", "cat-55"],
    summary: "Respecting local customs — greetings, dress, hospitality, religious practice, gestures — makes travel smoother and more respectful; customs vary and individuals vary within every culture.",
    sections: {
      definition: "The etiquette of another society: greetings and titles, dress codes, hospitality norms, eating manners, religious observances, tipping, photography rules and culturally sensitive gestures.",
      simple: "When you travel, learn how people greet, dress and behave where you are going — being polite in their way shows respect.",
      detailed: "Practical etiquette differs widely: right-hand-only for eating and handshakes in parts of West Africa and the Middle East; removing shoes indoors in many Asian and Middle Eastern homes; modest dress near religious sites (mosques, churches, temples); greeting elders first in many African and Asian societies; tipping norms from expected (US) to included (Japan). Religious periods (Ramadan, Lent) change daily life. When unsure, observe locals and ask politely.",
      guidance: "Customs are tendencies, not rules for every individual — being curious and respectful matters more than memorizing lists; local advice beats guidebooks.",
    },
    misconceptions: [
      { misconception: "All people in a country follow the same etiquette.", correction: "Practice varies by region, age, religion and situation — and foreigners are usually forgiven honest mistakes." },
    ],
    relatedIds: ["cult.customs-traditions", "cult.regional-cultures", "trv.safety", "con.religion-diversity"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §19 — RELATIONSHIPS & HUMAN COMMUNICATION — remaining items of the spec
 * list. Balanced guidance: never one solution for every person.
 * ════════════════════════════════════════════════════════════════════════════ */

const RELATIONSHIP_RECORDS: KnowledgeRecord[] = [
  relationship({
    id: "rel.friendship",
    title: "Friendship",
    aliases: ["friendships", "making friends"],
    question: "How do friendships work?",
    categoryIds: ["cat-31", "cat-89"],
    summary: "Friendships are voluntary relationships of mutual care, trust and enjoyment — they form through shared experience, are maintained by attention and communication, and differ across cultures and life stages.",
    sections: {
      definition: "A close, voluntary relationship between people who enjoy each other's company, trust each other and provide mutual support — distinct from family and work relationships in its chosen nature.",
      simple: "Friends are people you choose to spend time with, who care about you and whom you care about.",
      detailed: "Friendship research finds it needs three things to grow: proximity or repeated contact, shared activities or values, and self-disclosure — gradually opening up. Friendships are maintained through regular contact, responsiveness in hard times, and forgiveness of small frictions. They change across life: school friendships, work friendships, long-distance friendships — and they can end, which is painful but normal. Different cultures have different norms for how friendship is expressed.",
      guidance: "There is no single formula for friendship — different people need different amounts of closeness, contact and independence; what matters is mutual care and respect.",
    },
    misconceptions: [
      { misconception: "Good friends never argue.", correction: "Disagreement is normal in healthy friendships; how conflicts are handled matters more than avoiding them." },
    ],
    relatedIds: ["rel.communication", "rel.conflict", "rel.emotional-intelligence"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.family",
    title: "Family relationships",
    aliases: ["family dynamics", "family life"],
    question: "How do family relationships work?",
    categoryIds: ["cat-31", "cat-30"],
    summary: "Family relationships are our first and longest relationships — built on care, obligation and shared history, with roles and expectations that vary by culture and change over time.",
    sections: {
      definition: "The relationships among relatives — parents and children, siblings, extended kin — shaped by culture, law and economics, involving both affection and obligation.",
      simple: "Family is the people you grow up with and stay connected to — parents, siblings, grandparents, cousins — with lots of love and sometimes friction.",
      detailed: "Families provide care, identity and support, but also carry expectations, conflict and change: parent–child roles evolve as children grow; sibling relationships shift across life; care for ageing parents raises hard questions; migration creates distance and new patterns of support. Different cultures define family boundaries differently — who counts as close family, what children owe parents, how elders are honoured.",
      guidance: "There is no one right way to do family — balance your own wellbeing with family obligations, and seek professional help (counselling) when conflicts harm people.",
    },
    misconceptions: [
      { misconception: "Healthy families never have conflict.", correction: "Conflict is normal; what matters is how it is handled — repair and communication beat avoidance." },
    ],
    relatedIds: ["cult.family-structures", "rel.communication", "rel.conflict", "day.parenting"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.marriage",
    title: "Marriage",
    aliases: ["marriage relationships", "married life"],
    question: "How do marriages work?",
    categoryIds: ["cat-31", "cat-30"],
    summary: "Marriage is a formal partnership with legal, religious and personal dimensions — its forms vary by culture and law, and its success rests on communication, respect and realistic expectations.",
    sections: {
      definition: "A legally or religiously recognized union between partners, with rights and duties set by law and custom — varying in form (monogamous, polygamous in some legal systems), age, ceremony and meaning across societies.",
      simple: "Marriage is a life partnership between people who choose to build a home and a life together, with rights and duties that the law and religion define.",
      detailed: "Marriage serves many purposes — companionship, family formation, economic partnership, social recognition — and its rules differ by country and religion: legal minimum ages, registration, bridewealth or dowry customs, divorce law, polygamy in some legal systems. Research on lasting marriages consistently finds communication, respect, conflict skills and shared values matter more than romance alone. Marriages also end, in separation or divorce, which is legal and survivable.",
      guidance: "There is no single recipe for a successful marriage — couples differ — but respect, honest communication and willingness to work on problems are consistently central; counselling can help.",
    },
    misconceptions: [
      { misconception: "Love alone sustains a marriage.", correction: "Love matters, but lasting marriages are built on communication, respect, shared values and conflict skills." },
    ],
    relatedIds: ["rel.family", "rel.communication", "rel.conflict", "cult.family-structures"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.workplace-communication",
    title: "Workplace communication",
    aliases: ["professional communication", "office communication"],
    question: "How do I communicate well at work?",
    categoryIds: ["cat-32", "cat-33"],
    summary: "Workplace communication means being clear, respectful and timely — in writing, in meetings, with managers, peers and clients — and adapting to each audience and channel.",
    sections: {
      definition: "The skills of exchanging information effectively at work: clear writing (email, reports, chat), speaking (meetings, presentations), listening, giving and receiving feedback, and managing disagreement professionally.",
      simple: "At work, communicate clearly and politely — say what you mean, write it well, listen carefully and stay professional.",
      detailed: "Most workplace friction is communication failure: unclear requests, vague emails, unspoken expectations. Good practice: match the channel to the message (chat for quick questions, email for records, meetings for decisions); write with a clear subject and ask; confirm understanding of tasks and deadlines; give feedback that is specific, timely and about behaviour, not the person; and disagree with the idea, not the colleague. Culture shapes norms — directness valued in some workplaces, indirectness in others.",
      guidance: "Workplace norms vary by organization and country — observe how your workplace communicates, and when in doubt, ask rather than assume.",
    },
    misconceptions: [
      { misconception: "More communication is always better.", correction: "Clear, relevant, well-timed communication beats volume; over-communication can be noise." },
    ],
    relatedIds: ["rel.communication", "rel.conflict", "bus.management", "cre.presentations"],
    sources: [SRC_BRITANNICA],
  }),
  relationship({
    id: "rel.personal-development",
    title: "Personal development",
    aliases: ["self improvement", "personal growth"],
    question: "What is personal development?",
    categoryIds: ["cat-89", "cat-31", "cat-34"],
    summary: "Personal development is deliberately growing your skills, habits, emotional maturity and sense of purpose — through reflection, learning, feedback and practice.",
    sections: {
      definition: "Intentional work on oneself — skills, knowledge, habits, emotional intelligence, confidence and purpose — through reading, courses, reflection, feedback, therapy or coaching, and practice.",
      simple: "Personal development is working on yourself — learning new things, building good habits, understanding yourself better.",
      detailed: "Development happens through a cycle: self-awareness (what are my strengths, patterns, triggers?), goals (what do I want to change or become?), practice (habits, skills, exposure), feedback (from others and results), and reflection. Emotional intelligence — recognizing and managing emotions in yourself and others — is a core area. Beware of quick-fix self-help that promises transformation without effort; sustainable growth is slow and personal.",
      guidance: "There is no universal path — what works depends on the person, the goal and the context; professional help (counselling, coaching) is appropriate for deeper challenges.",
    },
    misconceptions: [
      { misconception: "Self-improvement means fixing flaws.", correction: "It is as much about building on strengths and clarifying values as fixing weaknesses." },
      { misconception: "It requires dramatic change.", correction: "Most growth is incremental — small consistent habits outperform occasional heroic efforts." },
    ],
    relatedIds: ["rel.emotional-intelligence", "car.professional-development", "day.time-management", "day.problem-solving"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §20 — ENTERTAINMENT & POPULAR CULTURE — remaining items of the spec list.
 * Current information (releases, rankings, casts, careers) is flagged for
 * verification in every record.
 * ════════════════════════════════════════════════════════════════════════════ */

const ENTERTAINMENT_RECORDS: KnowledgeRecord[] = [
  entertainment({
    id: "ent.television",
    title: "Television",
    aliases: ["tv", "television shows", "tv series"],
    question: "What is television?",
    categoryIds: ["cat-52", "cat-70"],
    summary: "Television is the medium of broadcast and streamed moving images and sound — from live news to scripted series — and one of the most influential forms of mass culture since the mid-20th century.",
    sections: {
      definition: "The technology and medium of transmitting and receiving moving images with sound — historically over broadcast airwaves, now cable, satellite and internet streaming — and the industry and culture built around it.",
      simple: "Television is how shows and news reach your screen — from old-style TV channels to streaming series you watch on demand.",
      detailed: "Television evolved from experimental broadcasts in the 1920s–30s to a mass medium in the 1950s–60s, shaping politics, advertising and family life. The 21st century brought cable, satellite and streaming platforms, 'binge' viewing and global hits crossing borders (Nollywood series, Korean dramas, European crime shows). TV news remains a primary information source — with all the verification caveats that implies.",
      history: "Mechanical TV in the 1920s; electronic TV and regular broadcasts in the 1930s; the post-war boom; colour from the 1960s; cable and satellite from the 1980s; streaming since the 2010s.",
      guidance: "Current shows, ratings, platforms and availability change constantly — verify current entertainment information.",
    },
    misconceptions: [
      { misconception: "Streaming has killed television.", correction: "It has transformed distribution — much 'streaming' content is still made by and for television industries." },
    ],
    relatedIds: ["ent.film", "ent.history-trends", "ent.celebrities"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.books",
    title: "Books and literature",
    aliases: ["literature", "reading books", "classical literature"],
    question: "What is literature?",
    categoryIds: ["cat-53", "cat-50"],
    summary: "Books and literature — from classical epics to contemporary novels — are the written record of human imagination and thought, spanning every culture and era.",
    sections: {
      definition: "Written works of lasting artistic or intellectual value — fiction (novels, short stories, poetry, drama) and nonfiction (history, philosophy, biography, essays) — including the oral traditions later written down.",
      simple: "Books are written stories and ideas — from fairy tales to science books — that people have passed on for thousands of years.",
      detailed: "Literature preserves and shapes culture: the Epic of Gilgamesh, the Homeric epics, classical Chinese and Indian texts, the Bible and Qur'an as literature, African oral epics written down, the European novel, and the global literatures of today. Reading develops language, empathy and critical thinking; libraries and publishing make it accessible; classical literature remains a reference point across civilizations.",
      history: "Writing emerged around 3200 BCE; scrolls became codices; printing (15th century) spread books; mass literacy and the novel followed; digital books and audiobooks continue the story.",
      guidance: "'Classics' differ by culture — every tradition has its own canon, and canons are contested, not fixed.",
    },
    misconceptions: [
      { misconception: "Literature means only Western classics.", correction: "Every culture has its own classical and contemporary literatures; world literature studies them together." },
    ],
    relatedIds: ["who.achebe", "who.angelou", "cre.writing", "lng.reading"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.celebrities",
    title: "Celebrities and public figures",
    aliases: ["celebrities", "famous people", "stars"],
    question: "How should I understand celebrity culture?",
    categoryIds: ["cat-50", "cat-52", "cat-56"],
    summary: "Celebrity is fame in the media age — built by talent, publicity, controversy or all three — and celebrity information changes fast and must be verified like any current claim.",
    sections: {
      definition: "Celebrities are people whose lives and work are widely covered by media and followed by the public — actors, musicians, athletes, influencers, and public figures from every field.",
      simple: "Celebrities are very famous people — actors, musicians, athletes — whose lives many people follow.",
      detailed: "Celebrity culture is produced by media industries: stars are made by talent, marketing, roles and coverage, and their private lives become public content. Celebrity affects fashion, politics and social causes — endorsements move markets, and celebrities can shape public conversation. Fame also brings intense scrutiny, misinformation and mental-health pressures, and 'celebrity news' is often unverified.",
      guidance: "Current celebrity facts — relationships, projects, records, claims — are dynamic and often unverified; treat gossip as gossip and check reputable sources.",
    },
    misconceptions: [
      { misconception: "Celebrity equals achievement.", correction: "Fame reflects visibility as much as merit; the two should not be conflated." },
    ],
    relatedIds: ["ent.history-trends", "ent.film", "ent.music", "pol.current-information"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.artists-creators",
    title: "Artists and creators",
    aliases: ["creators", "content creators", "independent artists"],
    question: "Who are artists and creators?",
    categoryIds: ["cat-50", "cat-52", "cat-72"],
    summary: "Artists and creators — musicians, filmmakers, writers, visual artists, and today's online content creators — make the culture we consume, through industries and platforms that keep changing.",
    sections: {
      definition: "The people who produce cultural work — music, film, books, art, games, and digital content (videos, podcasts, social-media posts) — whether backed by studios or operating independently online.",
      simple: "Artists and creators are the people who make the music, films, books, art and videos you enjoy.",
      detailed: "Creators range from studio-signed artists to independent online creators who build audiences directly through platforms, subscriptions and sponsorships. The internet lowered distribution costs — anyone can publish — while discovery, payment and copyright remain hard problems. Creator incomes vary enormously, and 'creator economy' figures are dynamic.",
      guidance: "Current platforms, earnings and trends change fast — verify current information; creator content is not journalism unless it says so.",
    },
    misconceptions: [
      { misconception: "Online creators are not artists.", correction: "Digital creation is a major cultural form; its craft, audiences and economics are real." },
    ],
    relatedIds: ["ent.celebrities", "cre.content-creation", "ent.history-trends"],
    sources: [SRC_BRITANNICA],
  }),
  entertainment({
    id: "ent.history-trends",
    title: "Entertainment history and trends",
    aliases: ["history of entertainment", "cultural trends", "pop culture history"],
    question: "How has entertainment changed over time?",
    categoryIds: ["cat-50", "cat-20", "cat-70"],
    summary: "Entertainment has evolved from live performance and storytelling to cinema, broadcast and streaming — each era's technology reshaping what people watch, hear and play.",
    sections: {
      definition: "The history of popular entertainment — theatre, music, cinema, radio, television, games, sports spectacles and digital media — and the trends (technological, economic, cultural) that reshape it.",
      simple: "Entertainment history is how fun has changed: from live shows and stories to movies, TV and now streaming and games.",
      detailed: "Every era has its own entertainment technology and culture: oral performance and theatre; print fiction; music halls; cinema's golden ages (Hollywood, Nollywood, Bollywood); radio and television broadcasting; recorded music formats; video games; and now streaming, social video and AI-assisted creation. Trends move in cycles too — remakes, revivals and nostalgia — and global flows now move both ways: African, Asian and Latin American content reaches world audiences.",
      guidance: "Current trends are dynamic and fast-moving; the historical record is stable — distinguish the two when discussing entertainment.",
    },
    misconceptions: [
      { misconception: "Entertainment history is a Western story.", correction: "Every region has its own rich entertainment history — Nollywood, Indian cinema, Egyptian and Latin American music and film are world-scale industries." },
    ],
    relatedIds: ["ent.film", "ent.music", "ent.television", "ent.games"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §21 — LANGUAGE INTELLIGENCE — remaining items of the spec list. Cultural
 * meaning is preserved, not just word-for-word translation.
 * ════════════════════════════════════════════════════════════════════════════ */

const LANGUAGE_RECORDS: KnowledgeRecord[] = [
  language({
    id: "lng.vocabulary",
    title: "Vocabulary",
    aliases: ["building vocabulary", "word knowledge"],
    question: "How do I build my vocabulary?",
    categoryIds: ["cat-54", "cat-01"],
    summary: "Vocabulary is the set of words a person knows and uses — and it grows through reading, listening, deliberate practice and using words in real communication.",
    sections: {
      definition: "The words a person knows (receptive vocabulary) and uses (productive vocabulary), in one language or several; vocabulary knowledge includes meaning, form, grammar and usage context.",
      simple: "Vocabulary is your store of words — knowing more words helps you read, write, speak and understand better.",
      detailed: "Research suggests learners need thousands of word families for fluent reading and speech. Vocabulary grows most effectively through extensive reading and listening (meeting words in context), spaced repetition for new words, and active use (speaking and writing). Knowing a word means more than recognizing it: pronunciation, spelling, grammar patterns, collocations and register all matter. Words carry culture too — concepts without direct equivalents across languages.",
      how_it_works: "Each new word needs many encounters in different contexts before it sticks; deliberate review (flashcards, notebooks, quizzes) accelerates the process, and use consolidates it.",
      guidance: "There is no magic number or shortcut; consistent exposure and practice build vocabulary in any language.",
    },
    misconceptions: [
      { misconception: "Memorizing word lists is the best way.", correction: "Context-rich reading and use build durable vocabulary better than isolated lists." },
    ],
    relatedIds: ["lng.learning", "lng.grammar", "lng.pronunciation", "ent.books"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.pronunciation",
    title: "Pronunciation",
    aliases: ["pronunciation", "accents", "speaking clearly"],
    question: "How do I improve my pronunciation?",
    categoryIds: ["cat-54", "cat-32"],
    summary: "Pronunciation is how words are spoken — sounds, stress and intonation — and it improves with listening, imitation, feedback and practice, without erasing accent.",
    sections: {
      definition: "The production of speech sounds and prosody — individual sounds (phonemes), word stress, sentence rhythm and intonation — as used in a language or variety.",
      simple: "Pronunciation is how you say words — and you get better by listening carefully and practicing out loud.",
      detailed: "Every language has its own sound system; learners map new sounds onto their first language, which creates 'foreign accent'. Improvement comes from: listening to the target variety, noticing sounds that do not exist in your language, practicing mouth positions, shadowing (repeating after speakers), and getting feedback. Pronunciation affects intelligibility more than 'perfect accent' — the goal is being understood, not erasing identity.",
      guidance: "Accents are natural and tied to identity; the practical goal is clear, comfortable communication, not sounding 'native'.",
    },
    misconceptions: [
      { misconception: "Adults cannot improve pronunciation.", correction: "Adults can improve substantially with focused listening, practice and feedback — though habits take time to change." },
    ],
    relatedIds: ["lng.learning", "lng.vocabulary", "rel.communication"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.dialects-slang",
    title: "Dialects and slang",
    aliases: ["dialects", "slang", "accents and dialects"],
    question: "What are dialects and slang?",
    categoryIds: ["cat-54", "cat-55"],
    summary: "Dialects are regional and social varieties of a language — with their own grammar, words and accents — and slang is informal vocabulary that marks group identity and changes quickly.",
    sections: {
      definition: "Dialects are systematic varieties of a language spoken by a region or community (vocabulary, grammar, pronunciation); slang is informal, often generation-bound vocabulary used within groups.",
      simple: "A dialect is a way a language is spoken in a place — like different accents and words; slang is the casual, cool vocabulary of a group.",
      detailed: "Linguistics treats all dialects as equally structured — 'standard' dialects are simply the ones standardized by education and media, not linguistically superior. Nigerian Pidgin, African-American English, Cockney, Appalachian English are all rule-governed varieties. Slang (like 'chop', 'vibe', 'flex') marks belonging, evolves fast and dates quickly. Understanding dialects and slang is essential for real communication and for appreciating culture.",
      guidance: "No dialect is 'bad language' — linguistic science is descriptive; social judgments about dialects reflect status, not grammar.",
    },
    misconceptions: [
      { misconception: "Dialects are incorrect versions of a language.", correction: "All varieties follow systematic rules; 'standard' is a social choice, not a linguistic truth." },
      { misconception: "Slang is destroying language.", correction: "Slang has always existed and enriches language; most slang either becomes standard or fades." },
    ],
    relatedIds: ["lng.linguistics", "lng.learning", "cult.regional-cultures", "lng.indigenous-languages"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.historical-languages",
    title: "Historical languages",
    aliases: ["ancient languages", "dead languages", "classical languages"],
    question: "What are historical languages?",
    categoryIds: ["cat-54", "cat-20"],
    summary: "Historical languages — Latin, Ancient Greek, Sanskrit, Ge'ez, Classical Arabic, Old Norse and many more — are the languages of the past, preserved in writing and studied for history, religion and literature.",
    sections: {
      definition: "Languages attested only in earlier periods — classical languages still studied (Latin, Sanskrit, Classical Chinese, Ge'ez, Classical Arabic) and extinct languages known only from texts (Sumerian, Hittite, Old Norse) — some revived, like Hebrew.",
      simple: "Historical languages are old languages nobody speaks every day anymore, but people still study them to read old books and understand history.",
      detailed: "Historical languages open the past: Sumerian cuneiform, Egyptian hieroglyphs, Biblical Hebrew, Classical Greek and Latin, Sanskrit's vast literature, Ge'ez in Ethiopian tradition, Classical Arabic in the Qur'an. Linguists reconstruct their sounds, grammar and relationships (the Indo-European family was discovered this way). Some languages were revived — modern Hebrew — and others, like Cornish and Māori, are being revitalized.",
      guidance: "Descriptions of pronunciation for ancient languages are scholarly reconstructions, not eyewitness records — confidence varies and is labelled.",
    },
    misconceptions: [
      { misconception: "A 'dead' language is useless.", correction: "Classical languages remain central to religious traditions, law, science and literature, and are still taught worldwide." },
    ],
    relatedIds: ["lng.linguistics", "lng.indigenous-languages", "lng.translation", "era-ancient"],
    sources: [SRC_BRITANNICA],
  }),
  language({
    id: "lng.indigenous-languages",
    title: "Indigenous languages",
    aliases: ["native languages", "endangered languages", "language preservation"],
    question: "What are indigenous languages?",
    categoryIds: ["cat-54", "cat-55", "cat-20"],
    summary: "Indigenous languages are the languages of the world's original and marginalized peoples — thousands survive, many are endangered, and communities are actively revitalizing them.",
    sections: {
      definition: "The languages of Indigenous peoples — from Yoruba, Igbo and Hausa to Navajo, Māori, Quechua and hundreds more — each carrying distinct knowledge, identity and ways of seeing the world; many are endangered.",
      simple: "Indigenous languages are the languages of native peoples — like Yoruba or Navajo — and many are in danger of disappearing, so people are working to keep them alive.",
      detailed: "Of the world's ~7,000 languages, most are Indigenous, and many are spoken by small communities; UNESCO estimates that a large share are endangered. A language can vanish within a generation when children stop learning it — often a legacy of colonization, forced assimilation and urbanization. Revitalization works: Māori (New Zealand), Hawaiian, Hebrew (a revival) and many community programmes teach through immersion schools, media and digital tools. Each lost language takes with it unique knowledge — medicine, ecology, history, poetry.",
      guidance: "Language loss is a serious, sensitive issue; support community-led efforts, and never treat Indigenous languages as 'primitive' — linguistically, every language is complete and complex.",
    },
    misconceptions: [
      { misconception: "Endangered languages are 'simple' languages.", correction: "All human languages are fully complex; size of speaker population says nothing about linguistic sophistication." },
    ],
    relatedIds: ["cult.indigenous", "lng.linguistics", "lng.historical-languages", "cult.diversity"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  language({
    id: "lng.reading",
    title: "Reading",
    aliases: ["learning to read", "reading skills", "reading comprehension"],
    question: "How do I become a better reader?",
    categoryIds: ["cat-54", "cat-01"],
    summary: "Reading is the skill of extracting meaning from written text — it improves with practice, and it is the single most powerful habit for language, knowledge and thinking.",
    sections: {
      definition: "The ability to decode written words fluently and understand and interpret texts — from everyday documents to complex literature — and the practice of doing so.",
      simple: "Reading is understanding written words — and like any skill, the more you read, the better you get.",
      detailed: "Reading combines decoding (recognizing words) and comprehension (building meaning). It improves through volume — reading widely and regularly — plus strategies for difficult texts: previewing, questioning, summarizing, rereading. Reading builds vocabulary, grammar intuition, background knowledge and empathy. Digital reading adds skills (evaluating sources, navigating hypertext) and new challenges (attention, depth).",
      guidance: "There is no age limit: reading skill keeps growing with practice at any stage of life.",
    },
    misconceptions: [
      { misconception: "Reading fast is the same as reading well.", correction: "Speed must serve comprehension; skilled readers adjust pace to purpose and difficulty." },
    ],
    relatedIds: ["lng.learning", "lng.vocabulary", "ent.books", "ins.study-effectively"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §22 — EVERYDAY LIFE — remaining items of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const EVERYDAY_RECORDS: KnowledgeRecord[] = [
  everyday({
    id: "day.clothing",
    title: "Clothing care and choices",
    aliases: ["clothing", "laundry basics", "what to wear"],
    question: "How do I care for clothing and choose what to wear?",
    categoryIds: ["cat-60", "cat-58", "cat-90"],
    summary: "Everyday clothing knowledge: choosing clothes for occasions and weather, caring for them so they last, and understanding labels — from laundry basics to budget smartness.",
    sections: {
      definition: "The practical skills of clothing: choosing appropriate, comfortable and affordable clothing; reading care labels; washing, drying, ironing and storing garments; mending and extending their life.",
      simple: "Look after your clothes: wash them the way the label says, fix small tears, and choose outfits that fit the weather and the occasion.",
      detailed: "Care labels tell you washing temperature, bleach, drying and ironing rules — following them makes clothes last far longer. Basics: sort laundry by colour and fabric; treat stains quickly; air-dry delicates; store out of direct sun. Choosing clothes means balancing weather, occasion, comfort, budget and your own style — and quality over quantity often saves money.",
      guidance: "Fashion trends are not rules; practical comfort, fit and care matter more than any trend.",
    },
    misconceptions: [
      { misconception: "Dry cleaning is needed for everything delicate.", correction: "Many 'dry clean only' items can be hand-washed carefully; when unsure, follow the label or ask a professional." },
    ],
    relatedIds: ["cult.clothing-fashion", "day.shopping", "day.cleaning"],
    sources: [SRC_BRITANNICA],
  }),
  everyday({
    id: "day.personal-organization",
    title: "Personal organization",
    aliases: ["staying organized", "personal organization skills", "decluttering"],
    question: "How do I stay organized?",
    categoryIds: ["cat-88", "cat-60", "cat-90"],
    summary: "Personal organization is the set of habits that keep your space, time, papers and tasks under control — and it is a skill that improves with simple, consistent systems.",
    sections: {
      definition: "The habits and systems for managing your physical space, documents, tasks and commitments: decluttering, filing, to-do lists, routines and the 'put things where they belong' discipline.",
      simple: "Staying organized means having a place for everything, writing down what you must do, and doing small tidy-ups regularly.",
      detailed: "Organization is not personality — it is systems: a place for everything (keys, papers, tools), a trusted task list (one list, reviewed daily), routines (morning/evening/end-of-week), and regular decluttering. Digital organization matters too: file naming, folders, email habits, backups. Over-organization is a trap — the goal is finding things and remembering commitments, not perfect order.",
      guidance: "Different systems suit different people; the common core is a simple, consistent routine — not elaborate tools.",
    },
    misconceptions: [
      { misconception: "Organized people are born that way.", correction: "Organization is learned habit; anyone can improve with small consistent systems." },
    ],
    relatedIds: ["day.time-management", "day.problem-solving", "day.basic-tech"],
    sources: [SRC_BRITANNICA],
  }),
  everyday({
    id: "day.transportation",
    title: "Everyday transportation",
    aliases: ["getting around town", "commuting", "public transport basics"],
    question: "How do I get around my city?",
    categoryIds: ["cat-36", "cat-90"],
    summary: "Everyday transport — walking, cycling, buses, minibuses, trains, taxis and ride-hailing — means knowing your options, costs, safety and schedules.",
    sections: {
      definition: "The practical knowledge of moving around your city or town: public transport routes and fares, ride-hailing and taxis, walking and cycling, traffic safety, and choosing the best option for each trip.",
      simple: "Getting around town means knowing your options — bus, taxi, bike or walking — and picking what is safe, affordable and fast enough.",
      detailed: "Good everyday transport habits: know the main routes and alternatives; compare cost and time (a bus may beat a taxi in traffic); keep transport cards and apps set up; follow safety basics (use registered taxis, avoid unsafe routes at night); and plan for last-mile connections. In many cities, minibuses and shared vans (danfo, trotro, matatu) are the affordable backbone — learn their routes and etiquette.",
      guidance: "Fares, routes and schedules change — verify current information with operators or official transit sources.",
    },
    misconceptions: [
      { misconception: "Owning a car is the only reliable way to get around.", correction: "In many cities, well-used public transport, ride-hailing and two-wheelers are cheaper, faster and less stressful." },
    ],
    relatedIds: ["trv.transportation", "day.time-management", "day.problem-solving"],
    sources: [SRC_BRITANNICA],
  }),
  everyday({
    id: "day.problem-solving",
    title: "Everyday problem solving",
    aliases: ["solving problems", "practical thinking", "general problem solving"],
    question: "How do I solve everyday problems?",
    categoryIds: ["cat-90", "cat-88", "cat-89"],
    summary: "Everyday problem solving is a trainable cycle: define the problem, gather facts, generate options, choose, act and review — applied to everything from broken gadgets to difficult decisions.",
    sections: {
      definition: "A practical method for tackling everyday difficulties: clarifying the real problem, collecting facts, generating options, choosing with criteria, acting, and learning from the outcome.",
      simple: "When something goes wrong: understand the problem, gather facts, think of options, pick one, try it, and learn from what happened.",
      detailed: "Most everyday problems are solved better with a simple cycle than with panic or guessing. Steps: (1) define — what exactly is the problem, and what would 'solved' look like? (2) gather facts — what do you know, who can tell you more? (3) options — at least two or three, including 'do nothing'; (4) choose — weigh cost, time, risk; (5) act; (6) review — did it work, what would you change? Common traps: solving the wrong problem, jumping to conclusions, and refusing help.",
      guidance: "For serious problems — legal, medical, financial — the right step is consulting qualified professionals, not solo trial and error.",
    },
    misconceptions: [
      { misconception: "Good problem solvers think faster.", correction: "They mostly think more systematically — the cycle beats raw speed." },
    ],
    relatedIds: ["rel.personal-development", "day.basic-tech", "ins.study-effectively"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §23 — CREATIVE KNOWLEDGE — remaining items of the spec list
 * ════════════════════════════════════════════════════════════════════════════ */

const CREATIVE_RECORDS: KnowledgeRecord[] = [
  creative({
    id: "cre.poetry",
    title: "Poetry",
    aliases: ["writing poetry", "poems"],
    question: "How do I write poetry?",
    categoryIds: ["cat-53", "cat-50"],
    summary: "Poetry is language concentrated — sound, image and meaning working together — and writing it is a craft of observation, revision and form.",
    sections: {
      definition: "A literary form that uses the musical qualities of language — rhythm, rhyme, sound, imagery — to express experience and ideas with intensity and compression.",
      simple: "Poetry is writing that plays with the sound and rhythm of words to say things beautifully and strongly.",
      detailed: "Poems work through image (show, don't tell), sound (rhythm, rhyme, repetition), form (sonnet, haiku, free verse, spoken word) and compression (every word counts). Writing process: start from an observation or feeling; draft freely; read aloud to hear rhythm; revise ruthlessly; and read widely — poetry is learned from other poems. Every culture has poetic traditions — praise poetry, epic, song lyrics, slam — and poetry survives translation differently from prose.",
      guidance: "There is no single 'correct' poetry — traditions differ, taste differs, and revision is where poems are made.",
    },
    misconceptions: [
      { misconception: "Poems must rhyme.", correction: "Much of the world's great poetry — including most contemporary poetry — uses free verse." },
    ],
    relatedIds: ["cre.writing", "who.angelou", "lng.grammar"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.music",
    title: "Making music",
    aliases: ["creating music", "songwriting", "music production"],
    question: "How do I create music?",
    categoryIds: ["cat-51", "cat-50"],
    summary: "Creating music — songwriting, composing, producing — is a learnable craft of melody, harmony, rhythm, arrangement and recording, now accessible to anyone with a phone or laptop.",
    sections: {
      definition: "The craft of creating music: songwriting (lyrics, melody, harmony), composition (structure, arrangement), performance and production (recording, mixing, software), across all genres and traditions.",
      simple: "Making music means creating songs or sounds — writing words and melodies, playing instruments, or producing beats on a computer.",
      detailed: "Creating music has a core loop: an idea (a riff, a phrase, a beat), development (structure, arrangement, lyrics), and production (recording, mixing, sharing). Tools range from instruments and voices to digital audio workstations (DAWs) on laptops and phones. Songwriting draws on lyric craft, melody and genre conventions; production adds sound design and mixing. Genres differ enormously — but all reward listening, imitation, practice and feedback.",
      guidance: "There is no single path — self-taught, formal training and hybrid routes all produce musicians; consistent creation beats waiting for inspiration.",
    },
    misconceptions: [
      { misconception: "Talent alone makes musicians.", correction: "Skill is built through practice, listening and feedback; 'talent' is mostly early accumulated practice." },
    ],
    relatedIds: ["disc.music", "ent.music", "who.fela-kuti", "cre.content-creation"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.art",
    title: "Creating visual art",
    aliases: ["making art", "drawing and painting", "visual art practice"],
    question: "How do I create visual art?",
    categoryIds: ["cat-50", "cat-55"],
    summary: "Creating visual art — drawing, painting, sculpture, digital art — is a practice of observation, mark-making and experimentation, learned through doing and looking.",
    sections: {
      definition: "The practice of making visual works: drawing, painting, printmaking, sculpture, photography, digital and mixed media — developing observation, composition, technique and personal expression.",
      simple: "Making art is drawing, painting or building things that express how you see the world — and it gets better with practice.",
      detailed: "Core foundations: observation (draw what you see, not what you think you see), mark-making and materials (pencil, paint, clay, pixels), composition (balance, contrast, focus), and developing a personal voice. Learning happens through daily practice, copying masters as study, feedback, and looking at art with attention. Digital tools (tablets, software) have made experimentation cheap, while traditional craft remains central.",
      guidance: "Artistic development is personal — there is no single curriculum; regular practice, honest feedback and wide looking are the constants.",
    },
    misconceptions: [
      { misconception: "You are either born an artist or not.", correction: "Drawing and art are learnable skills; what varies is interest, practice and direction." },
    ],
    relatedIds: ["disc.arts", "cult.arts", "cre.graphic-design", "who.enwonwu"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.video",
    title: "Video creation",
    aliases: ["making videos", "video production", "filmmaking basics"],
    question: "How do I create videos?",
    categoryIds: ["cat-52", "cat-50", "cat-72"],
    summary: "Video creation — from phone clips to short films — is a craft of story, shot, sound and edit, now open to anyone with a camera and a story to tell.",
    sections: {
      definition: "The process of making moving-image content: concept and script, shooting (camera, light, sound), editing (cutting, sound, graphics) and publishing — from short-form social video to documentary and fiction.",
      simple: "Making videos means filming scenes and joining them together with sound to tell a story — and a phone is enough to start.",
      detailed: "Video works through the building blocks: story (what is the point?), shot (framing, movement, light), sound (the most underrated element), and edit (rhythm, continuity, meaning). Modern creation spans short-form (vertical, seconds-long), YouTube-style long-form, documentary, and film. Workflow: plan (script/storyboard), shoot (clean audio matters most), edit (cut, music, captions), publish, and learn from feedback.",
      guidance: "Current platforms and formats change fast; the fundamentals — story, light, sound, edit — do not.",
    },
    misconceptions: [
      { misconception: "You need expensive equipment to make good videos.", correction: "Phones and free editing software produce professional-looking results; story and sound matter more than gear." },
    ],
    relatedIds: ["ent.film", "cre.content-creation", "cre.writing", "ent.artists-creators"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.presentations",
    title: "Presentations",
    aliases: ["public presentations", "slides", "making presentations"],
    question: "How do I create a great presentation?",
    categoryIds: ["cat-32", "cat-88"],
    summary: "A presentation is a message delivered with support — clear structure, honest content, clean slides and practiced delivery — for meetings, classrooms and conferences.",
    sections: {
      definition: "The craft of presenting ideas to an audience: defining the message, structuring content, designing slides, and delivering with voice, pace and presence.",
      simple: "A good presentation says one clear thing, shows simple slides, and practices out loud before the real talk.",
      detailed: "Structure first: one main message, three points that support it, a memorable opening and closing. Slides are visual support, not the script — fewer words, more images, one idea per slide. Delivery: practice aloud, manage pace, make eye contact, and prepare for questions. Audience matters: a board meeting, classroom and conference talk need different depth, tone and length.",
      guidance: "Presentation styles differ by culture and context — observe your audience; the core is preparation and respect for their time.",
    },
    misconceptions: [
      { misconception: "Great presentations are improvised.", correction: "Great presentations look natural because they are rehearsed — practice is the invisible ingredient." },
    ],
    relatedIds: ["cre.public-speaking", "rel.workplace-communication", "cre.graphic-design"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.branding",
    title: "Branding",
    aliases: ["brand identity", "building a brand"],
    question: "What is branding?",
    categoryIds: ["cat-71", "cat-09"],
    summary: "Branding is how an organization or person shapes how others perceive them — name, visual identity, message and behaviour working together — built over time, not overnight.",
    sections: {
      definition: "The practice of creating a coherent identity for a product, company, organization or person: name, logo, colours, voice, values and the experience behind them, so audiences recognize and trust the brand.",
      simple: "Branding is how people recognize and remember you — your name, logo, colours, style and reputation, all working together.",
      detailed: "A brand is more than a logo: it is the sum of impressions — name, visual identity, tone of voice, product quality, customer service and reputation. Branding work starts with strategy (who is the audience, what is the promise?), then identity (name, logo, palette, typography), then expression (website, packaging, content) and consistency across every touchpoint. Strong brands are built by consistent delivery of a real promise; weak ones by logos without substance.",
      guidance: "Branding is not manipulation — honest brands align what they say with what they do; the field is educational, not a persuasion playbook.",
    },
    misconceptions: [
      { misconception: "A logo is a brand.", correction: "A logo is one element of identity; the brand is the accumulated perception and experience." },
    ],
    relatedIds: ["bus.marketing", "cre.advertising", "bus.entrepreneurship", "cre.graphic-design"],
    sources: [SRC_BRITANNICA],
  }),
  creative({
    id: "cre.advertising",
    title: "Advertising",
    aliases: ["ads", "advertising basics"],
    question: "How does advertising work?",
    categoryIds: ["cat-71", "cat-09", "cat-70"],
    summary: "Advertising is paid communication designed to inform, persuade or remind — from billboards to targeted digital ads — and understanding how it works makes you a smarter consumer and creator.",
    sections: {
      definition: "Paid, non-personal communication promoting products, services, ideas or organizations through media — print, broadcast, outdoor, online — combining message, audience and creative craft.",
      simple: "Advertising is how companies pay to tell you about their products — and knowing how it works helps you see it clearly.",
      detailed: "Advertising works through a chain: right audience, right message (benefit, emotion, proof), right medium, right frequency. Modern advertising is dominated by digital targeting — platforms use data to show ads to specific people — alongside classic brand advertising that builds awareness and trust over years. Regulation matters: ads must not deceive, and some categories (medicine, alcohol, politics) are specially controlled. Advertising is also a creative industry — copywriting, design, film, media planning.",
      guidance: "Advertisers' claims are persuasive by design — evaluate them critically; current platforms, formats and regulations change fast.",
    },
    misconceptions: [
      { misconception: "Advertising brainwashes people.", correction: "Advertising influences attention and preference, but consumers evaluate claims; most ads fail, which is why persuasion is hard work." },
    ],
    relatedIds: ["bus.marketing", "cre.branding", "ent.history-trends", "disc.communications"],
    sources: [SRC_BRITANNICA],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §8 — "WHICH IS BETTER?" COMPARISONS — the remaining categories of the
 * spec list (universities, business strategies, investment concepts, travel
 * destinations, historical events, software tools). Each comparison record
 * explains trade-offs in text; each item profile carries labeled criteria
 * (0–100, curated, with notes). The engine never declares a universal
 * winner and never invents unlabeled scores.
 * ════════════════════════════════════════════════════════════════════════════ */

const COMPARISON_RECORDS: KnowledgeRecord[] = [
  comparison({
    id: "cmp.university-vs-polytechnic",
    title: "University vs polytechnic",
    aliases: ["university or polytechnic", "bsc vs hnd", "degree vs polytechnic diploma"],
    question: "Which is better: university or polytechnic?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Universities award degrees with broad theory; polytechnics award Higher National Diplomas and other qualifications focused on practical, technical skills — the better route depends on the field, your goals and each country's recognition rules.",
    sections: {
      definition: "A criteria-based comparison of the two main tertiary routes: universities (degree programmes, theory and research) vs polytechnics (practical, occupation-focused programmes leading to diplomas such as the HND).",
      simple: "University gives a degree with broad theory; polytechnic gives practical skills for a specific job. Both are valuable — it depends on your goal.",
      detailed: "Universities: 3–5 year degree programmes, broad theory, research exposure, and access to professions requiring degrees. Polytechnics: 2–4 year practical programmes (HND etc.), strong industry links, work placements and employable technical skills. Recognition matters: in some countries (including Nigeria), the HND has faced career-ceiling issues in public service compared with degrees — a contested policy area that changes — while polytechnic graduates thrive in technical industries worldwide.",
      criteria: "Breadth of theory (university 90, polytechnic 50); Practical/technical focus (university 45, polytechnic 90); Time to first qualification (university 45, polytechnic 75); Regulated-profession access (university 90, polytechnic 45); Work placement/industry links (university 55, polytechnic 80); Research exposure (university 85, polytechnic 35).",
      guidance: "Check how each qualification is recognized in your country and target career — recognition rules are contested and change; the right route depends on the field and the person.",
      examples: "Engineering technician, IT support, accountancy technician → polytechnic strengths; medicine, law, research careers → university route; both serve many technical fields.",
    },
    misconceptions: [
      { misconception: "Polytechnics are inferior to universities.", correction: "They serve different purposes; in many countries polytechnic graduates are equally employable and sometimes preferred for technical roles." },
      { misconception: "You cannot progress from a polytechnic to a university.", correction: "Many systems allow HND graduates to convert to degrees or pursue postgraduate study, though rules vary." },
    ],
    relatedIds: ["con.education-path", "con.university", "cmp.degree-vs-apprenticeship", "cmp.item.university-route", "cmp.item.polytechnic-route"],
    sources: [SRC_BRITANNICA, SRC_UN],
  }),
  comparison({
    id: "cmp.bootstrapping-vs-funding",
    title: "Bootstrap vs investor funding",
    aliases: ["bootstrapping vs investors", "self-funded or raise money", "vc funding vs bootstrapping"],
    question: "Should I bootstrap my business or raise funding?",
    categoryIds: ["cat-10", "cat-11"],
    summary: "Bootstrapping means building with your own revenue and resources; investor funding trades equity and control for capital and support — the right choice depends on the venture, market and founder.",
    sections: {
      definition: "A criteria-based comparison of self-funding (bootstrapping: growth paid for by revenue and personal resources) vs external investment (equity or debt funding from investors such as angels, venture capital or banks).",
      simple: "Bootstrapping means growing with your own money; raising funding means taking investors' money — and giving up a share of your company.",
      detailed: "Bootstrapping keeps ownership, control and focus on revenue — most businesses never take investors — but grows slower and carries personal financial risk. Investor funding accelerates growth, brings expertise and networks, and suits high-scale opportunities — but requires equity, reporting, board influence and growth expectations. Most ventures should not raise venture capital; VC suits businesses with large-market, high-growth potential. Debt (loans) is a third path: keeps ownership but must be repaid.",
      criteria: "Ownership retained (bootstrap 100, investors 45); Speed of growth (bootstrap 50, investors 90); Personal financial risk (bootstrap 40, investors 70); External expertise and networks (bootstrap 35, investors 85); Pressure and reporting (bootstrap 75, investors 40); Fit for high-scale markets (bootstrap 45, investors 95).",
      guidance: "There is no universal winner: raise money when the opportunity genuinely needs speed and scale; otherwise bootstrap and keep control — and get professional advice before signing anything.",
      examples: "A consultancy or shop that grows from cash flow → bootstrap; a software platform needing rapid global scale → investor funding is often necessary.",
    },
    misconceptions: [
      { misconception: "Raising investment means success.", correction: "Most funded startups still fail; investment is fuel, not proof — and most successful businesses never raise venture capital." },
    ],
    relatedIds: ["bus.entrepreneurship", "ins.start-business", "bus.business-models", "cmp.item.bootstrapping", "cmp.item.investor-funding"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.saving-vs-investing",
    title: "Saving vs investing",
    aliases: ["save or invest", "savings vs investments"],
    question: "Which is better: saving or investing?",
    categoryIds: ["cat-11", "cat-15"],
    summary: "Saving keeps money safe and available; investing aims for growth with risk — most people need both, in proportions that fit their goals, time horizon and risk tolerance.",
    sections: {
      definition: "A criteria-based comparison of saving (putting money aside with low risk and easy access — bank deposits, money market) vs investing (buying assets like shares, bonds or property expected to grow, with higher risk and less liquidity).",
      simple: "Saving is keeping money safe for later; investing is putting money to work for growth — with some risk of loss.",
      detailed: "Savings accounts keep capital safe (with deposit-insurance limits) and liquid, but interest may trail inflation. Investing — equities, bonds, funds, real estate — has historically delivered higher long-run returns but with volatility: prices fall, sometimes sharply, and you can lose money. Rules of thumb: emergency funds and short-term goals belong in savings; long-term goals (retirement, decades away) can tolerate investment. Inflation is the quiet enemy of idle cash; risk is the loud enemy of investment.",
      criteria: "Capital safety (saving 95, investing 45); Liquidity/access (saving 90, investing 55); Long-term growth potential (saving 30, investing 85); Inflation protection (saving 35, investing 75); Income from the money (saving 25, investing 70); Volatility/stress (saving 90, investing 35).",
      guidance: "There is no universal winner — build an emergency fund first, then invest with a horizon and risk you can actually tolerate; professional advice is appropriate for significant sums.",
      examples: "Emergency fund and next year's school fees → savings; retirement and a child's university in 15 years → investing.",
    },
    misconceptions: [
      { misconception: "Investing is gambling.", correction: "Gambling bets on chance; investing buys productive assets with long-run expected returns — though all investing carries risk." },
    ],
    relatedIds: ["bus.saving", "bus.investment", "bus.budgeting", "cmp.item.saving", "cmp.item.investing"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.beach-vs-city-break",
    title: "Beach holiday vs city break",
    aliases: ["beach or city holiday", "relaxing or exploring"],
    question: "Which is better: a beach holiday or a city break?",
    categoryIds: ["cat-35"],
    summary: "Beach holidays offer rest, nature and simple pleasures; city breaks offer culture, food and energy — the better choice depends on your energy, budget and what you want from time off.",
    sections: {
      definition: "A criteria-based comparison of two travel styles: beach holidays (coastal relaxation, swimming, sun, slow pace) vs city breaks (sightseeing, museums, food scenes, nightlife, fast pace).",
      simple: "Beach holidays are for resting and swimming; city breaks are for exploring and eating out. Both are great — pick what you need right now.",
      detailed: "Beach holidays: minimal planning, rest and nature, good for families and recovery, but weather-dependent and can be quiet to the point of boredom for some. City breaks: culture, food, shopping, energy — but crowded, expensive and tiring; three days in a city can feel like a week. Practical factors: cost, season (beaches in rainy season, cities in heat), travel time, and your own need for rest vs stimulation.",
      criteria: "Relaxation and rest (beach 90, city 40); Cultural and food experiences (beach 45, city 90); Planning required (beach 80, city 50); Cost per day (beach 55, city 40); Weather dependence (beach 35, city 70); Good with children (beach 80, city 55).",
      guidance: "No universal winner — many travellers alternate or combine: a city with a beach nearby gives both.",
      examples: "A stressful year, short break → beach; a curious traveller wanting museums and food → city; both → a coastal city like Lagos, Cape Town or Barcelona.",
    },
    misconceptions: [
      { misconception: "City breaks are always more expensive than beaches.", correction: "Costs vary wildly by destination and season; some beach destinations cost far more than city trips." },
    ],
    relatedIds: ["trv.planning", "trv.weather-climate", "trv.accommodation", "cmp.item.beach-break", "cmp.item.city-break"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.ww1-vs-ww2",
    title: "World War I vs World War II",
    aliases: ["ww1 vs ww2", "first vs second world war"],
    question: "How do the World Wars compare?",
    categoryIds: ["cat-20", "cat-66"],
    summary: "The two World Wars are compared historically — scale, causes, conduct, technology and consequences — as analysis, not as a verdict on which was 'worse' or 'better'.",
    sections: {
      definition: "An academic comparison of the two global conflicts of the 20th century: World War I (1914–1918) and World War II (1939–1945) — causes, alliances, geography, technology, casualties, and consequences.",
      simple: "The two World Wars were different wars with different causes and shapes — historians compare them to understand, not to rank them.",
      detailed: "World War I began as a European great-power war after the assassination of Archduke Franz Ferdinand, fought largely in static trench warfare with ~17 million deaths, ending with the collapse of empires and the Treaty of Versailles. World War II began with expansionist aggression (Nazi Germany, imperial Japan), was fought globally across continents and oceans, introduced industrialized genocide (the Holocaust) and nuclear weapons, and ended with ~50–80+ million deaths and the founding of the United Nations. Comparisons cover causes, military technology (tanks, aircraft, radar), civilian impact, and legacies — the wars are connected: many historians see WWII's origins in WWI's unsettled outcome.",
      criteria: "Scale of casualties (ww1 40, ww2 95); Geographic scope (ww1 60, ww2 95); Role of ideology (ww1 40, ww2 85); Technological change (ww1 70, ww2 90); Civilian impact (ww1 45, ww2 90); Legacy institutions (ww1 60, ww2 90 — the UN and the post-war order).",
      guidance: "This comparison is historical analysis with no 'winner' — both wars are human catastrophes studied to understand how mass violence begins and how peace is built.",
      examples: "Causes: alliance systems and nationalism (WWI) vs expansionist ideology (WWII); endpoints: Versailles treaties vs the United Nations and the Cold War order.",
    },
    misconceptions: [
      { misconception: "The World Wars were the same war with a pause.", correction: "They were distinct conflicts with different causes, coalitions, technologies and outcomes — though causally connected." },
    ],
    relatedIds: ["when.ww1", "when.ww2", "era-modern", "era-contemporary", "cmp.item.ww1", "cmp.item.ww2"],
    sources: [SRC_BRITANNICA],
  }),
  comparison({
    id: "cmp.open-source-vs-proprietary",
    title: "Open source vs proprietary software",
    aliases: ["open source or proprietary", "free software vs commercial software"],
    question: "Which is better: open source or proprietary software?",
    categoryIds: ["cat-07", "cat-04"],
    summary: "Open-source software is free to use, inspect and modify; proprietary software is commercially licensed with vendor support — the right choice depends on budget, skills, security needs and support requirements.",
    sections: {
      definition: "A criteria-based comparison of open-source software (source code publicly available under licenses allowing use, modification and redistribution) vs proprietary software (closed source, sold under licenses with vendor-controlled support).",
      simple: "Open source is free and anyone can improve it; proprietary is paid, closed and comes with company support. Both run much of the world.",
      detailed: "Open source (Linux, Firefox, WordPress, Postgres, Python) costs nothing upfront, is transparent and auditable, avoids vendor lock-in, and has huge communities — but support is do-it-yourself unless you buy it, and quality varies by project. Proprietary software (Windows, Adobe, many business tools) offers polished products, accountable support and predictable licensing — but costs, hides internals, and can lock you in. Most organizations use both; security myths run in both directions.",
      criteria: "Upfront cost (open 95, proprietary 40); Transparency and auditability (open 90, proprietary 35); Vendor support and accountability (open 45, proprietary 85); Freedom from lock-in (open 90, proprietary 45); Polish and ease of use (open 55, proprietary 80); Community and ecosystem (open 85, proprietary 70).",
      guidance: "No universal winner — the decision depends on budget, skills, security requirements and support needs; 'free' open source still costs time, and paid software can still be the cheaper option.",
      examples: "Servers and infrastructure → Linux/Postgres; a design team → Adobe; a cash-strapped startup → open-source stacks with paid support.",
    },
    misconceptions: [
      { misconception: "Open source means no support.", correction: "A large commercial ecosystem sells support, training and guarantees for open-source software." },
      { misconception: "Proprietary software is always more secure.", correction: "Security depends on maintenance and review; open source is auditable, proprietary hides internals — both have strengths and vulnerabilities." },
    ],
    relatedIds: ["tech.software-engineering", "tech.programming", "cmp.item.open-source", "cmp.item.proprietary"],
    sources: [SRC_BRITANNICA],
  }),
];

/* Comparison item profiles — the objects of "which is better?" questions. */

const COMPARISON_ITEM_RECORDS: KnowledgeRecord[] = [
  build("concept", "stable", ["comparison", "recommendation", "education"], {
    id: "cmp.item.university-route",
    title: "University route (comparison profile)",
    aliases: ["university degree route"],
    question: "What are the university route's strengths?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Comparison profile for the university route: broad theory, research exposure and access to regulated professions — at higher cost and longer time to qualification.",
    sections: {
      definition: "Comparison profile for university education used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "theory_breadth", label: "Breadth of theory", value: 90, note: "Broad conceptual education across a field." },
      { key: "practical_focus", label: "Practical/technical focus", value: 45, note: "Depends on field and institution; less hands-on than polytechnics." },
      { key: "time_to_qualify", label: "Time to first qualification", value: 45, note: "Typically 3–5 years for a degree." },
      { key: "regulated_access", label: "Access to regulated professions", value: 90, note: "Medicine, law, engineering require degrees." },
      { key: "industry_links", label: "Work placement and industry links", value: 55, note: "Varies; internships not always guaranteed." },
      { key: "research", label: "Research exposure", value: 85, note: "Universities are the research institutions." },
    ],
    relatedIds: ["cmp.university-vs-polytechnic", "cmp.item.polytechnic-route", "con.university"],
    sources: [SRC_BRITANNICA],
  }),
  build("concept", "stable", ["comparison", "recommendation", "education"], {
    id: "cmp.item.polytechnic-route",
    title: "Polytechnic route (comparison profile)",
    aliases: ["polytechnic diploma route", "hnd route"],
    question: "What are the polytechnic route's strengths?",
    categoryIds: ["cat-01", "cat-33"],
    summary: "Comparison profile for the polytechnic route: practical skills, industry links and faster qualification — with recognition rules that vary by country.",
    sections: {
      definition: "Comparison profile for polytechnic education used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "theory_breadth", label: "Breadth of theory", value: 50, note: "Focused theory tied to practice." },
      { key: "practical_focus", label: "Practical/technical focus", value: 90, note: "Hands-on training for specific occupations." },
      { key: "time_to_qualify", label: "Time to first qualification", value: 75, note: "Often 2–4 years to a diploma." },
      { key: "regulated_access", label: "Access to regulated professions", value: 45, note: "Some professions still require degrees." },
      { key: "industry_links", label: "Work placement and industry links", value: 80, note: "Siwes and similar placements are built in." },
      { key: "research", label: "Research exposure", value: 35, note: "Applied research at most; not the primary mission." },
    ],
    relatedIds: ["cmp.university-vs-polytechnic", "cmp.item.university-route"],
    sources: [SRC_BRITANNICA],
  }),
  build("business", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.bootstrapping",
    title: "Bootstrapping (comparison profile)",
    aliases: ["self-funded growth"],
    question: "What are bootstrapping's strengths?",
    categoryIds: ["cat-10", "cat-11"],
    summary: "Comparison profile for bootstrapping: full ownership and control, revenue discipline — at the cost of slower growth and personal financial risk.",
    sections: {
      definition: "Comparison profile for bootstrapping used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "ownership", label: "Ownership retained", value: 100, note: "No equity given away." },
      { key: "growth_speed", label: "Speed of growth", value: 50, note: "Limited by revenue and personal resources." },
      { key: "personal_risk", label: "Personal financial risk", value: 40, note: "Your own capital is on the line." },
      { key: "expertise", label: "External expertise and networks", value: 35, note: "No board or investors to lean on." },
      { key: "pressure", label: "Pressure and reporting", value: 75, note: "No investors to answer to." },
      { key: "scale_fit", label: "Fit for high-scale markets", value: 45, note: "Harder to move fast in winner-take-all markets." },
    ],
    relatedIds: ["cmp.bootstrapping-vs-funding", "cmp.item.investor-funding", "bus.entrepreneurship"],
    sources: [SRC_BRITANNICA],
  }),
  build("business", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.investor-funding",
    title: "Investor funding (comparison profile)",
    aliases: ["vc funding", "angel investment"],
    question: "What are investor funding's strengths?",
    categoryIds: ["cat-10", "cat-11"],
    summary: "Comparison profile for investor funding: capital, expertise and speed — at the cost of equity, control and growth pressure.",
    sections: {
      definition: "Comparison profile for investor funding used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "ownership", label: "Ownership retained", value: 45, note: "Equity and sometimes board seats are given up." },
      { key: "growth_speed", label: "Speed of growth", value: 90, note: "Capital enables rapid scaling." },
      { key: "personal_risk", label: "Personal financial risk", value: 70, note: "Funded by external capital, but obligations and downside exist." },
      { key: "expertise", label: "External expertise and networks", value: 85, note: "Investors bring guidance, contacts and credibility." },
      { key: "pressure", label: "Pressure and reporting", value: 40, note: "Growth targets, reporting and investor expectations." },
      { key: "scale_fit", label: "Fit for high-scale markets", value: 95, note: "Venture capital suits large, fast markets." },
    ],
    relatedIds: ["cmp.bootstrapping-vs-funding", "cmp.item.bootstrapping", "bus.entrepreneurship"],
    sources: [SRC_BRITANNICA],
  }),
  build("business", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.saving",
    title: "Saving (comparison profile)",
    aliases: ["savings accounts"],
    question: "What are saving's strengths?",
    categoryIds: ["cat-11", "cat-15"],
    summary: "Comparison profile for saving: capital safety, liquidity and low stress — with modest returns that may trail inflation.",
    sections: {
      definition: "Comparison profile for saving used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "safety", label: "Capital safety", value: 95, note: "Deposit-insured accounts protect principal." },
      { key: "liquidity", label: "Liquidity and access", value: 90, note: "Money is available on short notice." },
      { key: "growth", label: "Long-term growth potential", value: 30, note: "Interest rates are typically modest." },
      { key: "inflation", label: "Inflation protection", value: 35, note: "Returns can trail inflation over time." },
      { key: "income", label: "Income from the money", value: 25, note: "Interest only." },
      { key: "volatility", label: "Volatility and stress", value: 90, note: "No market swings on the principal." },
    ],
    relatedIds: ["cmp.saving-vs-investing", "cmp.item.investing", "bus.saving"],
    sources: [SRC_BRITANNICA],
  }),
  build("business", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.investing",
    title: "Investing (comparison profile)",
    aliases: ["investing in assets"],
    question: "What are investing's strengths?",
    categoryIds: ["cat-15", "cat-11"],
    summary: "Comparison profile for investing: long-run growth and income potential — with real risk of loss and low liquidity.",
    sections: {
      definition: "Comparison profile for investing used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "safety", label: "Capital safety", value: 45, note: "Prices fall; capital is at risk." },
      { key: "liquidity", label: "Liquidity and access", value: 55, note: "Markets are open, but selling at a loss is possible." },
      { key: "growth", label: "Long-term growth potential", value: 85, note: "Historically higher long-run returns." },
      { key: "inflation", label: "Inflation protection", value: 75, note: "Productive assets tend to outpace inflation long-term." },
      { key: "income", label: "Income from the money", value: 70, note: "Dividends, interest and rents." },
      { key: "volatility", label: "Volatility and stress", value: 35, note: "Prices swing, sometimes sharply." },
    ],
    relatedIds: ["cmp.saving-vs-investing", "cmp.item.saving", "bus.investment"],
    sources: [SRC_BRITANNICA],
  }),
  build("travel", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.beach-break",
    title: "Beach holiday (comparison profile)",
    aliases: ["coastal holiday"],
    question: "What are beach holidays' strengths?",
    categoryIds: ["cat-35"],
    summary: "Comparison profile for beach holidays: rest, nature and low planning — with weather dependence and limited cultural stimulation.",
    sections: {
      definition: "Comparison profile for beach holidays used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "relaxation", label: "Relaxation and rest", value: 90, note: "Built for unwinding." },
      { key: "culture", label: "Cultural and food experiences", value: 45, note: "Depends on the destination's nearby towns." },
      { key: "planning", label: "Planning required", value: 80, note: "Simple: flights, hotel, beach." },
      { key: "cost", label: "Cost per day", value: 55, note: "Varies hugely by destination." },
      { key: "weather", label: "Weather dependence", value: 35, note: "Rainy seasons can ruin the trip." },
      { key: "children", label: "Good with children", value: 80, note: "Beaches suit family holidays." },
    ],
    relatedIds: ["cmp.beach-vs-city-break", "cmp.item.city-break", "trv.planning"],
    sources: [SRC_BRITANNICA],
  }),
  build("travel", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.city-break",
    title: "City break (comparison profile)",
    aliases: ["urban holiday"],
    question: "What are city breaks' strengths?",
    categoryIds: ["cat-35"],
    summary: "Comparison profile for city breaks: culture, food and energy — with crowds, cost and a fast pace.",
    sections: {
      definition: "Comparison profile for city breaks used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "relaxation", label: "Relaxation and rest", value: 40, note: "Pace is high; rest is possible but not the point." },
      { key: "culture", label: "Cultural and food experiences", value: 90, note: "Museums, food scenes, nightlife." },
      { key: "planning", label: "Planning required", value: 50, note: "Itineraries and bookings take work." },
      { key: "cost", label: "Cost per day", value: 40, note: "Accommodation, dining and tickets add up." },
      { key: "weather", label: "Weather dependence", value: 70, note: "Museums and cafés work in any weather." },
      { key: "children", label: "Good with children", value: 55, note: "Possible but tiring for younger kids." },
    ],
    relatedIds: ["cmp.beach-vs-city-break", "cmp.item.beach-break", "trv.planning"],
    sources: [SRC_BRITANNICA],
  }),
  build("history_era", "stable", ["comparison", "history"], {
    id: "cmp.item.ww1",
    title: "World War I (comparison profile)",
    aliases: ["the first world war"],
    question: "What were World War I's characteristics?",
    categoryIds: ["cat-20", "cat-66"],
    summary: "Comparison profile for World War I: a European-centered war of entrenched alliances fought 1914–1918 with roughly 17 million deaths.",
    sections: {
      definition: "Historical comparison profile for World War I used by the Which-is-better engine; scores are curated educational labels comparing scale and impact, not value judgments.",
      criteria: "Scores reflect curated historical assessments; comparing wars is analysis, never a verdict.",
    },
    criteria: [
      { key: "casualties", label: "Scale of casualties", value: 40, note: "Roughly 17 million military and civilian deaths." },
      { key: "scope", label: "Geographic scope", value: 60, note: "Europe-centered with colonial and global fronts." },
      { key: "ideology", label: "Role of ideology", value: 40, note: "Great-power rivalry and nationalism more than ideology." },
      { key: "technology", label: "Technological change", value: 70, note: "Machine guns, artillery, tanks, aircraft, poison gas." },
      { key: "civilian_impact", label: "Civilian impact", value: 45, note: "Blockades, occupation and displacement; fewer deliberate civilian campaigns." },
      { key: "legacy", label: "Legacy institutions", value: 60, note: "League of Nations and a reshaped map of empires." },
    ],
    relatedIds: ["cmp.ww1-vs-ww2", "cmp.item.ww2", "when.ww1"],
    sources: [SRC_BRITANNICA],
  }),
  build("history_era", "stable", ["comparison", "history"], {
    id: "cmp.item.ww2",
    title: "World War II (comparison profile)",
    aliases: ["the second world war"],
    question: "What were World War II's characteristics?",
    categoryIds: ["cat-20", "cat-66"],
    summary: "Comparison profile for World War II: a global ideological war fought 1939–1945 with 50–80+ million deaths, including the Holocaust and nuclear weapons.",
    sections: {
      definition: "Historical comparison profile for World War II used by the Which-is-better engine; scores are curated educational labels comparing scale and impact, not value judgments.",
      criteria: "Scores reflect curated historical assessments; comparing wars is analysis, never a verdict.",
    },
    criteria: [
      { key: "casualties", label: "Scale of casualties", value: 95, note: "Estimated 50–80+ million deaths." },
      { key: "scope", label: "Geographic scope", value: 95, note: "Global — Europe, Asia, Africa, the Pacific, the Atlantic." },
      { key: "ideology", label: "Role of ideology", value: 85, note: "Nazism, fascism and militarism versus the Allied powers." },
      { key: "technology", label: "Technological change", value: 90, note: "Radar, jets, rockets, code-breaking, nuclear weapons." },
      { key: "civilian_impact", label: "Civilian impact", value: 90, note: "The Holocaust, strategic bombing, mass displacement, famine." },
      { key: "legacy", label: "Legacy institutions", value: 90, note: "The United Nations, the post-war order, the Cold War." },
    ],
    relatedIds: ["cmp.ww1-vs-ww2", "cmp.item.ww1", "when.ww2"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.open-source",
    title: "Open-source software (comparison profile)",
    aliases: ["free software", "oss"],
    question: "What are open-source software's strengths?",
    categoryIds: ["cat-07", "cat-04"],
    summary: "Comparison profile for open-source software: no license fees, transparency and no lock-in — with self-service support and variable polish.",
    sections: {
      definition: "Comparison profile for open-source software used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "upfront_cost", label: "Upfront cost", value: 95, note: "Free to use and modify under open licenses." },
      { key: "transparency", label: "Transparency and auditability", value: 90, note: "Source code open for inspection." },
      { key: "support", label: "Vendor support and accountability", value: 45, note: "Community support; paid support available commercially." },
      { key: "lock_in", label: "Freedom from lock-in", value: 90, note: "Data and code remain portable." },
      { key: "polish", label: "Polish and ease of use", value: 55, note: "Varies from excellent to rough." },
      { key: "ecosystem", label: "Community and ecosystem", value: 85, note: "Huge communities and talent pools." },
    ],
    relatedIds: ["cmp.open-source-vs-proprietary", "cmp.item.proprietary", "tech.software-engineering"],
    sources: [SRC_BRITANNICA],
  }),
  build("technology", "stable", ["comparison", "recommendation"], {
    id: "cmp.item.proprietary",
    title: "Proprietary software (comparison profile)",
    aliases: ["commercial software", "closed-source software"],
    question: "What are proprietary software's strengths?",
    categoryIds: ["cat-07", "cat-04"],
    summary: "Comparison profile for proprietary software: polished products, accountable support and predictable licensing — with fees and vendor lock-in.",
    sections: {
      definition: "Comparison profile for proprietary software used by the Which-is-better engine; scores are curated catalog labels, not live measurements.",
      criteria: "Scores reflect the curated catalog's educational assessment, not live market data.",
    },
    criteria: [
      { key: "upfront_cost", label: "Upfront cost", value: 40, note: "License and subscription fees." },
      { key: "transparency", label: "Transparency and auditability", value: 35, note: "Source code is closed." },
      { key: "support", label: "Vendor support and accountability", value: 85, note: "Contracts, SLAs and vendor responsibility." },
      { key: "lock_in", label: "Freedom from lock-in", value: 45, note: "Formats and platforms can bind customers." },
      { key: "polish", label: "Polish and ease of use", value: 80, note: "Commercial design and QA investment." },
      { key: "ecosystem", label: "Community and ecosystem", value: 70, note: "Vendor-led ecosystems, partners and certifications." },
    ],
    relatedIds: ["cmp.open-source-vs-proprietary", "cmp.item.open-source", "tech.software-engineering"],
    sources: [SRC_BRITANNICA],
  }),
];

export const KNOWLEDGE_SEED_AUDIT: KnowledgeRecord[] = [
  ...PERSON_RECORDS,
  ...TIMELINE_RECORDS,
  ...PLACE_RECORDS,
  ...DISCIPLINE_RECORDS,
  ...SCIENCE_RECORDS,
  ...TECH_RECORDS,
  ...BUSINESS_RECORDS,
  ...CAREER_RECORDS,
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
