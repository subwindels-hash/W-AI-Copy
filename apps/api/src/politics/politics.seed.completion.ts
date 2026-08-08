/**
 * Session 145 — Politics seed (completion): the §17 Diplomacy Database,
 * §31 education concepts ("Explain democracy", "Explain elections"), the
 * §12 multi-party system form, and non-Nigeria §15 political events.
 *
 * Diplomacy records cover the spec's §17 items — foreign ministers (linked
 * via ministry records), treaties, bilateral relationships, strategic
 * partnerships and alliances. Ambassadorial appointments change frequently
 * and are noted as dynamic information rather than frozen into records.
 */
import type { ConceptRecord, DiplomacyRecord, GovernmentFormRecord, PoliticalEventRecord } from "@windels/shared";
import {
  buildConcept,
  buildDiplomacy,
  buildEvent,
  buildForm,
  SRC_ACADEMIC,
  SRC_ARCHIVE,
  SRC_GOVT,
  SRC_JOURNALISM,
  SRC_UN,
} from "./politics.catalog.js";

/* ════════════════════════════════════════════════════════════════════════════
 * §17 — Diplomacy Database
 * ════════════════════════════════════════════════════════════════════════════ */

export const GLOBAL_DIPLOMACY: DiplomacyRecord[] = [
  buildDiplomacy({
    id: "pol.dip.nigeria-us",
    name: "Nigeria–United States relations",
    countryIds: ["pol.country.nigeria", "pol.country.united-states"],
    partners: ["Nigeria", "United States"],
    relationshipType: "bilateral_relationship",
    signedAt: "Formal diplomatic relations from Nigeria's independence (1960)",
    keyEvents: "Diplomatic relations were established at Nigeria's independence (1960). The relationship deepened during Nigeria's civil war (US non-recognition of Biafra), the oil era, Nigeria's return to democracy (1999), and the post-9/11 security cooperation. The US is a major trading partner and investor; cooperation covers security (the Lake Chad basin, Boko Haram), health (PEPFAR, COVID-19 response), and trade. Vice-presidential and presidential visits have been regular on both sides.",
    currentStatus: "Broad but pragmatic: strong security, health and economic ties with recurring frictions over governance and human rights. (Current as of the Last Verified date — verify for updates.)",
    note: "The current US ambassador to Nigeria and the Nigerian ambassador to the US are appointments that change frequently; they are dynamic information to verify at query time.",
    sources: [SRC_GOVT, SRC_ACADEMIC, SRC_JOURNALISM],
  }),
  buildDiplomacy({
    id: "pol.dip.nigeria-china",
    name: "Nigeria–China strategic partnership",
    countryIds: ["pol.country.nigeria"],
    partners: ["Nigeria", "China"],
    relationshipType: "strategic_partnership",
    signedAt: "Diplomatic relations established 1971; strategic partnership deepened from the 2000s",
    keyEvents: "Nigeria and China established relations in 1971. Since the 2000s, China has become a major lender and investor — railways (the Abuja–Kaduna line), airports, the Lekki deep seaport, and oil-backed infrastructure loans — under the Belt and Road framework. Trade has grown substantially; Nigeria is one of China's largest African trading partners.",
    currentStatus: "A significant economic partnership with documented debt and local-content debates. (Current as of the Last Verified date — verify for updates.)",
    sources: [SRC_ACADEMIC, SRC_JOURNALISM],
  }),
  buildDiplomacy({
    id: "pol.dip.nigeria-uk",
    name: "Nigeria–United Kingdom relations",
    countryIds: ["pol.country.nigeria", "pol.country.united-kingdom"],
    partners: ["Nigeria", "United Kingdom"],
    relationshipType: "bilateral_relationship",
    signedAt: "From colonial rule (1861–1960) to independence (1960); both are Commonwealth members",
    keyEvents: "The relationship began with British colonization (Lagos annexed 1861; the protectorates amalgamated 1914) and the independence negotiated in 1960. Nigeria remained a Commonwealth member as a republic (1963). The UK is a major trading partner, investor and destination for the Nigerian diaspora; the relationship carries both deep people-to-people ties and the documented legacies of empire.",
    currentStatus: "Close but evolving: the UK's post-Brexit Commonwealth strategy and Nigeria's global diversification shape the relationship. (Current as of the Last Verified date — verify for updates.)",
    sources: [SRC_ACADEMIC, SRC_ARCHIVE, SRC_GOVT],
  }),
  buildDiplomacy({
    id: "pol.dip.treaty-lagos",
    name: "Treaty of Lagos (ECOWAS founding treaty, 1975)",
    countryIds: ["pol.country.nigeria", "pol.country.ghana", "pol.country.kenya"],
    partners: ["The 15 ECOWAS member states"],
    relationshipType: "treaty",
    signedAt: "28 May 1975, Lagos",
    keyEvents: "The Treaty of Lagos created the Economic Community of West African States (ECOWAS) — economic integration, free movement and, through later protocols, regional peace and security. Nigeria has been ECOWAS's dominant member since its founding; the community intervened in Liberia and Sierra Leone (ECOMOG), mediated in The Gambia, and sanctioned the 2021–2023 Sahel coups.",
    currentStatus: "In force; the treaty's revised version (1993) governs the community. (Current as of the Last Verified date — verify for updates.)",
    sources: [SRC_UN, SRC_ACADEMIC],
  }),
  buildDiplomacy({
    id: "pol.dip.treaty-abuja",
    name: "Abuja Treaty (1991)",
    countryIds: ["pol.country.nigeria"],
    partners: "The member states of the OAU/AU".split(",").map((x) => x.trim()),
    relationshipType: "treaty",
    signedAt: "3 June 1991, Abuja",
    summary: "The Abuja Treaty (1991) established the African Economic Community — the framework for continental economic integration that the AfCFTA carries forward.",
    simple: "In 1991 African leaders signed a treaty in Abuja to build one big African economy.",
    keyEvents: "The Abuja Treaty established the African Economic Community (AEC) with a six-stage programme for continental economic integration by the 2030s — the institutional ancestor of the African Continental Free Trade Area (AfCFTA, 2019). Nigeria hosted the signing and has remained central to continental integration.",
    currentStatus: "Superseded in practice by the AU's Agenda 2063 and the AfCFTA, which carry forward its integration goals. (Current as of the Last Verified date — verify for updates.)",
    sources: [SRC_UN, SRC_ACADEMIC],
  }),
  buildDiplomacy({
    id: "pol.dip.ecowas-alliance",
    name: "ECOWAS and the Alliance of Sahel States",
    countryIds: ["pol.country.nigeria"],
    partners: ["ECOWAS", "Mali", "Burkina Faso", "Niger"],
    relationshipType: "dispute",
    signedAt: "From the 2021–2023 Sahel coups",
    keyEvents: "After the coups in Mali (2021), Burkina Faso (2022) and Niger (2023), ECOWAS imposed sanctions (including on Niger) and demanded a return to constitutional order. The three states formed the Alliance of Sahel States (September 2023) and announced their withdrawal from ECOWAS (January 2024), citing sovereignty and anti-French sentiment. ECOWAS, led by Nigeria, pursued mediation and negotiated a six-month withdrawal transition period.",
    currentStatus: "An active diplomatic dispute and negotiation; the three states' withdrawal and its terms remain in flux as of the Last Verified date. (Current as of the Last Verified date — verify for updates.)",
    sources: [SRC_JOURNALISM, SRC_ACADEMIC],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §31 education concepts + §12 multi-party system
 * ════════════════════════════════════════════════════════════════════════════ */

export const GLOBAL_CONCEPTS: Array<ConceptRecord | GovernmentFormRecord> = [
  buildConcept({
    id: "pol.concept.democracy",
    name: "Democracy",
    altNames: ["democratic government", "rule by the people"],
    definition: "A system of government in which power ultimately rests with the people, exercised directly or through freely chosen representatives, with regular free and fair elections, the rule of law and protected rights.",
    howItWorks: "Citizens elect representatives in regular elections; the elected legislature makes laws, the executive implements them and courts interpret them; elections create accountability — leaders who fail can be voted out peacefully. Democratic systems vary (presidential, parliamentary, semi-presidential) but share the core idea that government authority derives from the consent of the governed.",
    examples: ["Presidential democracy (United States, Nigeria, Kenya)", "Parliamentary democracy (United Kingdom, India, Germany)", "Semi-presidential democracy (France)"],
    strengths: "Peaceful succession, accountability and the protection of rights.",
    weaknesses: "Can be slow, gridlocked, and vulnerable to populism or majoritarian abuse without strong institutions.",
    summary: "Democracy is government by the people — through elections, the rule of law and accountable institutions.",
    simple: "Democracy means the people decide who runs the country by voting, and leaders can be peacefully replaced if they fail.",
    sources: [SRC_ACADEMIC],
  }),
  buildConcept({
    id: "pol.concept.elections",
    name: "Elections",
    altNames: ["electoral systems", "voting"],
    definition: "The formal process by which citizens choose representatives and decide questions of public power — the mechanism of consent, accountability and peaceful succession in democracies.",
    howItWorks: "Electoral systems translate votes into power in different ways: first-past-the-post (winner in each constituency), proportional representation (seats match vote shares), mixed systems and ranked-choice variants. Independent commissions, voter rolls, secret ballots, transparent counting and dispute mechanisms make elections credible.",
    examples: ["Nigerian presidential elections (INEC-administered)", "US congressional elections", "German mixed-member elections", "Referendums (e.g. the 2016 Brexit referendum)"],
    strengths: "Peaceful leadership change and the legitimation of government.",
    weaknesses: "Elections are only as credible as their administration, integrity and the surrounding rights.",
    summary: "Elections are how democracies choose leaders and hold them accountable — through rules that translate votes into power.",
    simple: "Elections are how people vote to choose their leaders, and the rules decide how votes become seats or offices.",
    sources: [SRC_ACADEMIC],
  }),
  buildForm({
    id: "pol.form.multi-party",
    name: "Multi-party system",
    definition: "A political system in which multiple parties compete freely for power through elections, with government formed by a single majority party or a coalition.",
    howItWorks: "Voters choose among several parties; the largest party may govern alone (majority) or must form a coalition (as in most parliamentary systems). Opposition parties provide scrutiny and the possibility of alternation.",
    examples: ["Nigeria (APC/PDP/LP…)", "India (BJP-led NDA vs Congress-led alliances)", "Germany (coalition governments)", "Kenya (UDA/ODM)"],
    strengths: "Choice, accountability and alternation in power.",
    weaknesses: "Coalition instability in fragmented systems; the risk of gridlock.",
    summary: "A multi-party system is one in which several parties compete for power through elections.",
    simple: "In a multi-party system, many parties compete in elections and the winners form the government.",
    sources: [SRC_ACADEMIC],
  }),
];

/* ════════════════════════════════════════════════════════════════════════════
 * §15 — non-Nigeria political events (Kenya)
 * ════════════════════════════════════════════════════════════════════════════ */

export const KENYA_EVENTS: PoliticalEventRecord[] = [
  buildEvent({
    id: "pol.event.kenya.2008-crisis",
    name: "Kenya 2007–08 post-election crisis",
    countryIds: ["pol.country.kenya"],
    dateLabel: "December 2007 – February 2008",
    year: 2008,
    eventType: "political crisis",
    description: "The disputed December 2007 presidential election (Mwai Kibaki declared winner over Raila Odinga) triggered ethnicized violence across Kenya — over 1,100 people killed and hundreds of thousands displaced. The crisis ended with the February 2008 National Accord, brokered by Kofi Annan, creating a coalition government (Kibaki president, Odinga prime minister).",
    keyFigures: ["Mwai Kibaki", "Raila Odinga", "Kofi Annan"],
    consequences: "The coalition government, a constitutional review process, and the 2010 constitution with devolution and a reformed judiciary.",
    nonViolenceNote: "Presented educationally; the human costs are documented and not glorified (§15).",
    summary: "Kenya's 2007–08 post-election crisis killed over 1,100 people and produced the power-sharing accord that led to the 2010 constitution.",
    simple: "After a disputed election in 2007, violence broke out in Kenya. A peace deal created a coalition government and later a new constitution.",
  }),
  buildEvent({
    id: "pol.event.kenya.2017-annulment",
    name: "Kenya 2017 presidential election annulment",
    countryIds: ["pol.country.kenya"],
    dateLabel: "1 September 2017",
    year: 2017,
    eventType: "constitutional crisis",
    description: "The Supreme Court of Kenya annulled the August 2017 presidential election — the first time an African court overturned an incumbent's re-election — citing irregularities by the IEBC. A re-run followed, which Raila Odinga boycotted and Uhuru Kenyatta won; Odinga and Kenyatta then reached the 'Building Bridges Initiative' handshake (March 2018).",
    keyFigures: ["Uhuru Kenyatta", "Raila Odinga", "Chief Justice David Maraga"],
    consequences: "Electoral reforms, the 2018 handshake, and the (later invalidated) BBI constitutional amendment attempt.",
    summary: "Kenya's Supreme Court made history in 2017 by annulling a presidential election — the first such ruling in Africa.",
    simple: "In 2017 Kenya's Supreme Court cancelled the presidential election result and ordered a new vote — the first time that happened in Africa.",
  }),
];
