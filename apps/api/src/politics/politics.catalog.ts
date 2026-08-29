/**
 * Session 144 — Politics Knowledge catalog: version, builders, sources.
 *
 * The source ladder (§22) is enforced by convention: official government
 * sources first, then electoral commissions, parliamentary records,
 * constitutions/legal documents, international organizations, historical
 * archives, academic sources, reputable journalism, other credible
 * secondary sources. Current office-holders are always marked
 * `current_as_of` with a Last Verified timestamp (§21).
 */
import type {
  ConceptRecord,
  CountryProfile,
  ConstitutionRecord,
  DiplomacyRecord,
  ElectionRecord,
  GovernmentForm,
  GovernmentFormRecord,
  IdeologyRecord,
  InternationalOrgRecord,
  LeaderRecord,
  MinistryRecord,
  MovementRecord,
  OfficeHolderRecord,
  PartyRecord,
  PoliticalEventRecord,
  PoliticsEntityKind,
  PoliticsSource,
  PoliticsVerification,
} from "@windels/shared";

/** Bump when the curated catalog changes. */
export const POLITICS_CATALOG_VERSION = "2026.08.144.1";

/** Date every catalog record was last reviewed into the catalog. */
export const POLITICS_REVIEW_DATE = "2026-08-08";

export const SRC_GOVT: PoliticsSource = { label: "Official government sources", type: "official_government" };
export const SRC_INEC: PoliticsSource = { label: "Independent National Electoral Commission (INEC)", type: "electoral_commission" };
export const SRC_PARLIAMENT: PoliticsSource = { label: "Official parliamentary records", type: "parliamentary_record" };
export const SRC_CONSTITUTION: PoliticsSource = { label: "Official constitution / legal documents", type: "constitution_legal" };
export const SRC_UN: PoliticsSource = { label: "United Nations", type: "international_organization" };
export const SRC_ARCHIVE: PoliticsSource = { label: "Historical archives", type: "historical_archive" };
export const SRC_ACADEMIC: PoliticsSource = { label: "Academic political science literature", type: "academic" };
export const SRC_JOURNALISM: PoliticsSource = { label: "Reputable journalism (multiple outlets)", type: "journalism" };

const VERSION = (verification: PoliticsVerification, extra?: Partial<{ asOfDate: string; lastVerified: string; conflictingSources: boolean }>) => ({
  created: POLITICS_REVIEW_DATE,
  updated: POLITICS_REVIEW_DATE,
  lastReviewed: POLITICS_REVIEW_DATE,
  verification,
  asOfDate: extra?.asOfDate,
  lastVerified: extra?.lastVerified,
  conflictingSources: extra?.conflictingSources,
});

export interface SeedInput {
  id: string;
  name: string;
  altNames?: string[];
  summary?: string;
  simple?: string;
  relatedIds?: string[];
  sources?: PoliticsSource[];
  verification?: PoliticsVerification;
  asOfDate?: string;
  lastVerified?: string;
  conflictingSources?: boolean;
}

function base<K extends PoliticsEntityKind>(input: SeedInput, kind: K) {
  return {
    id: input.id,
    kind,
    name: input.name,
    altNames: input.altNames ?? [],
    summary: input.summary ?? input.name,
    simple: input.simple ?? input.name,
    relatedIds: input.relatedIds ?? [],
    sources: input.sources ?? [SRC_ACADEMIC],
    meta: VERSION(input.verification ?? "well_supported", {
      asOfDate: input.asOfDate,
      lastVerified: input.lastVerified,
      conflictingSources: input.conflictingSources,
    }),
  };
}

export interface CountryInput extends SeedInput {
  capital: string;
  governmentForm: GovernmentForm;
  federalStructure: CountryProfile["federalStructure"];
  constitutionRef?: string;
  independence: string;
  independenceYear?: number | null;
  colonialPower?: string;
  preColonial: string;
  colonialHistory?: string;
  independenceStory: string;
  modernHistory: string;
  legislature: string;
  executive: string;
  judiciary: string;
  electoralSystem: string;
  parties: string[];
  currentSituation: string;
  historyPeriods?: CountryProfile["historyPeriods"];
}

export function buildCountry(input: CountryInput): CountryProfile {
  return {
    ...base(input, "country"),
    capital: input.capital,
    governmentForm: input.governmentForm,
    federalStructure: input.federalStructure,
    constitutionRef: input.constitutionRef,
    independence: input.independence,
    independenceYear: input.independenceYear ?? null,
    colonialPower: input.colonialPower,
    preColonial: input.preColonial,
    colonialHistory: input.colonialHistory,
    independenceStory: input.independenceStory,
    modernHistory: input.modernHistory,
    legislature: input.legislature,
    executive: input.executive,
    judiciary: input.judiciary,
    electoralSystem: input.electoralSystem,
    parties: input.parties,
    currentSituation: input.currentSituation,
    historyPeriods: input.historyPeriods ?? [],
  };
}

export interface LeaderInput extends SeedInput {
  countryId: string;
  title: string;
  titleKind: LeaderRecord["titleKind"];
  role: LeaderRecord["role"];
  party?: string;
  born?: string;
  officeStart: string;
  officeEnd?: string;
  predecessor?: string;
  successor?: string;
  cameToOffice: string;
  majorPolicies: string;
  achievements: string;
  controversies: string;
  majorEvents: string;
  constitutionalRole: string;
  historicalSignificance: string;
  ordinal?: number;
}

export function buildLeader(input: LeaderInput): LeaderRecord {
  return {
    ...base(input, "leader"),
    countryId: input.countryId,
    title: input.title,
    titleKind: input.titleKind,
    role: input.role,
    party: input.party,
    born: input.born,
    officeStart: input.officeStart,
    officeEnd: input.officeEnd,
    predecessor: input.predecessor,
    successor: input.successor,
    cameToOffice: input.cameToOffice,
    majorPolicies: input.majorPolicies,
    achievements: input.achievements,
    controversies: input.controversies,
    majorEvents: input.majorEvents,
    constitutionalRole: input.constitutionalRole,
    historicalSignificance: input.historicalSignificance,
    ordinal: input.ordinal,
  };
}

export interface PartyInput extends SeedInput {
  countryId: string;
  abbreviation?: string;
  founded: string;
  founders?: string[];
  selfDescription: string;
  academicClassification: string;
  position: string;
  majorLeaders?: string[];
  historicalDevelopment: string;
  electoralHistory: string;
  currentStatus: string;
  formerNames?: string[];
  coalitions?: string;
  governmentParticipation: string;
  historicalSignificance: string;
}

export function buildParty(input: PartyInput): PartyRecord {
  return {
    ...base(input, "party"),
    countryId: input.countryId,
    abbreviation: input.abbreviation,
    founded: input.founded,
    founders: input.founders ?? [],
    selfDescription: input.selfDescription,
    academicClassification: input.academicClassification,
    position: input.position,
    majorLeaders: input.majorLeaders ?? [],
    historicalDevelopment: input.historicalDevelopment,
    electoralHistory: input.electoralHistory,
    currentStatus: input.currentStatus,
    formerNames: input.formerNames ?? [],
    coalitions: input.coalitions,
    governmentParticipation: input.governmentParticipation,
    historicalSignificance: input.historicalSignificance,
  };
}

export interface ElectionInput extends SeedInput {
  countryId: string;
  electionType: string;
  date: string;
  year: number;
  turnout?: string;
  winner: string;
  winnerParty?: string;
  runnerUp?: string;
  resultSummary: string;
  electoralSystem: string;
  importance: string;
  disputes?: string;
  candidates?: string[];
}

export function buildElection(input: ElectionInput): ElectionRecord {
  const derivedSummary = input.summary ?? `${input.name}: ${input.winner} won the ${input.electionType.toLowerCase()} election of ${input.year}.`;
  const derivedSimple = input.simple ?? `${input.winner} won the ${input.year} election.`;
  return {
    ...base({ ...input, summary: derivedSummary, simple: derivedSimple }, "election"),
    countryId: input.countryId,
    electionType: input.electionType,
    date: input.date,
    year: input.year,
    turnout: input.turnout,
    winner: input.winner,
    winnerParty: input.winnerParty,
    runnerUp: input.runnerUp,
    resultSummary: input.resultSummary,
    electoralSystem: input.electoralSystem,
    importance: input.importance,
    disputes: input.disputes,
    candidates: input.candidates ?? [],
  };
}

export interface MinistryInput extends SeedInput {
  countryId: string;
  minister: string;
  appointmentDate?: string;
  previousMinister?: string;
  responsibilities: string;
  majorPrograms?: string;
  historicalMinisters?: string[];
  note?: string;
}

export function buildMinistry(input: MinistryInput): MinistryRecord {
  return {
    ...base(input, "ministry"),
    countryId: input.countryId,
    minister: input.minister,
    appointmentDate: input.appointmentDate,
    previousMinister: input.previousMinister,
    responsibilities: input.responsibilities,
    majorPrograms: input.majorPrograms,
    historicalMinisters: input.historicalMinisters ?? [],
    note: input.note,
  };
}

export interface OfficeHolderInput extends SeedInput {
  countryId: string;
  office: string;
  officeKind: OfficeHolderRecord["officeKind"];
  jurisdiction: string;
  party?: string;
  term: string;
  cameToOffice?: string;
  majorWork?: string;
}

export function buildOfficeHolder(input: OfficeHolderInput): OfficeHolderRecord {
  const kind = input.officeKind === "senator" || input.officeKind === "mp" ? "legislator" : "governor";
  return {
    ...base(input, kind),
    countryId: input.countryId,
    office: input.office,
    officeKind: input.officeKind,
    jurisdiction: input.jurisdiction,
    party: input.party,
    term: input.term,
    cameToOffice: input.cameToOffice,
    majorWork: input.majorWork,
  };
}

export interface ConstitutionInput extends SeedInput {
  countryId: string;
  adopted: string;
  previousConstitutions?: string[];
  separationOfPowers: string;
  executivePowers: string;
  legislativePowers: string;
  judicialPowers: string;
  federalism: string;
  electoralProvisions: string;
  termLimits: string;
  emergencyPowers: string;
  successionRules: string;
  rightsFreedoms: string;
  constitutionalCourt: string;
  amendments?: string[];
  history: string;
}

export function buildConstitution(input: ConstitutionInput): ConstitutionRecord {
  return {
    ...base(input, "constitution"),
    countryId: input.countryId,
    adopted: input.adopted,
    previousConstitutions: input.previousConstitutions ?? [],
    separationOfPowers: input.separationOfPowers,
    executivePowers: input.executivePowers,
    legislativePowers: input.legislativePowers,
    judicialPowers: input.judicialPowers,
    federalism: input.federalism,
    electoralProvisions: input.electoralProvisions,
    termLimits: input.termLimits,
    emergencyPowers: input.emergencyPowers,
    successionRules: input.successionRules,
    rightsFreedoms: input.rightsFreedoms,
    constitutionalCourt: input.constitutionalCourt,
    amendments: input.amendments ?? [],
    history: input.history,
  };
}

export interface MovementInput extends SeedInput {
  countryIds?: string[];
  origin: string;
  leaders?: string[];
  goals: string;
  historicalContext: string;
  majorEvents: string;
  governmentResponse: string;
  outcome: string;
  impact: string;
}

export function buildMovement(input: MovementInput): MovementRecord {
  return {
    ...base(input, "movement"),
    countryIds: input.countryIds ?? [],
    origin: input.origin,
    leaders: input.leaders ?? [],
    goals: input.goals,
    historicalContext: input.historicalContext,
    majorEvents: input.majorEvents,
    governmentResponse: input.governmentResponse,
    outcome: input.outcome,
    impact: input.impact,
  };
}

export interface IdeologyInput extends SeedInput {
  family: string;
  definition: string;
  origins: string;
  coreIdeas: string;
  keyThinkers?: string[];
  historicalRole: string;
  variants?: string;
  criticism: string;
}

export function buildIdeology(input: IdeologyInput): IdeologyRecord {
  return {
    ...base(input, "ideology"),
    family: input.family,
    definition: input.definition,
    origins: input.origins,
    coreIdeas: input.coreIdeas,
    keyThinkers: input.keyThinkers ?? [],
    historicalRole: input.historicalRole,
    variants: input.variants,
    criticism: input.criticism,
    advocacyNote: "WINDELS teaches this ideology historically and academically; it does not advocate it (§13).",
  };
}

export interface OrgInput extends SeedInput {
  founded: string;
  headquarters: string;
  membership: string;
  purpose: string;
  structure: string;
  majorActivities: string;
  achievements: string;
  criticisms: string;
  memberExamples?: string[];
}

export function buildOrg(input: OrgInput): InternationalOrgRecord {
  return {
    ...base(input, "international_organization"),
    founded: input.founded,
    headquarters: input.headquarters,
    membership: input.membership,
    purpose: input.purpose,
    structure: input.structure,
    majorActivities: input.majorActivities,
    achievements: input.achievements,
    criticisms: input.criticisms,
    memberExamples: input.memberExamples ?? [],
  };
}

export interface DiplomacyInput extends SeedInput {
  countryIds?: string[];
  partners: string[];
  relationshipType: DiplomacyRecord["relationshipType"];
  signedAt: string;
  keyEvents: string;
  currentStatus: string;
  note?: string;
}

export function buildDiplomacy(input: DiplomacyInput): DiplomacyRecord {
  return {
    ...base(input, "diplomacy"),
    countryIds: input.countryIds ?? [],
    partners: input.partners,
    relationshipType: input.relationshipType,
    signedAt: input.signedAt,
    keyEvents: input.keyEvents,
    currentStatus: input.currentStatus,
    note: input.note,
  };
}

export interface ConceptInput extends SeedInput {
  definition: string;
  howItWorks: string;
  examples?: string[];
  strengths: string;
  weaknesses: string;
}

export function buildConcept(input: ConceptInput): ConceptRecord {
  return {
    ...base(input, "concept"),
    definition: input.definition,
    howItWorks: input.howItWorks,
    examples: input.examples ?? [],
    strengths: input.strengths,
    weaknesses: input.weaknesses,
  };
}

export interface FormInput extends SeedInput {
  definition: string;
  howItWorks: string;
  examples?: string[];
  strengths: string;
  weaknesses: string;
  variants?: string;
}

export function buildForm(input: FormInput): GovernmentFormRecord {
  return {
    ...base(input, "government_form"),
    definition: input.definition,
    howItWorks: input.howItWorks,
    examples: input.examples ?? [],
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    variants: input.variants,
  };
}

export interface EventInput extends SeedInput {
  countryIds?: string[];
  dateLabel: string;
  year: number | null;
  eventType: string;
  description: string;
  keyFigures?: string[];
  consequences: string;
  nonViolenceNote?: string;
}

export function buildEvent(input: EventInput): PoliticalEventRecord {
  return {
    ...base(input, "event"),
    countryIds: input.countryIds ?? [],
    dateLabel: input.dateLabel,
    year: input.year,
    eventType: input.eventType,
    description: input.description,
    keyFigures: input.keyFigures ?? [],
    consequences: input.consequences,
    nonViolenceNote: input.nonViolenceNote,
  };
}
