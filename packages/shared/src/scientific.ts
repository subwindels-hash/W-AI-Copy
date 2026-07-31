/** Session 68 — Enterprise Scientific Research Platform */
export const RESEARCH_DOMAINS = [
  "biology","chemistry","physics","materials_science","computer_science",
  "medicine","climate","astronomy","mathematics","engineering","social_sciences","neuroscience",
] as const;
export type ResearchDomain = typeof RESEARCH_DOMAINS[number];

export interface LiteratureRef {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  doi?: string;
  citations: number;
  relevanceScore: number;
  abstract: string;
}

export interface CitationNode { id: string; title: string; year: number; weight: number; }

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  domain: ResearchDomain;
  variables: { independent: string[]; dependent: string[]; controls: string[] };
  status: "planned"|"running"|"completed"|"failed";
  progressPct: number;
  expectedOutcome: string;
  results?: string;
  simulations: number;
  createdAt: string;
}

export interface Hypothesis {
  id: string;
  statement: string;
  domain: ResearchDomain;
  confidence: number; // 0..1
  supportingEvidence: number;
  counterEvidence: number;
  status: "proposed"|"testing"|"supported"|"refuted"|"published";
}

export interface PublicationDraft {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  sections: Array<{ heading: string; body: string }>;
  status: "draft"|"review"|"submitted"|"published";
  targetVenue: string;
}

export interface ScientificDashboard {
  papersIndexed: number;
  experimentsActive: number;
  experimentsCompleted30d: number;
  hypothesesActive: number;
  hypothesesSupported30d: number;
  publicationsInProgress: number;
  publicationsPublished30d: number;
  collaborators: number;
  citationsTracked: number;
  simulationsRun30d: number;
  topDomains: Array<{ domain: ResearchDomain; papers: number; experiments: number }>;
  recentExperiments: Experiment[];
  recentPapers: LiteratureRef[];
  recentHypotheses: Hypothesis[];
  knowledgeGraphNodes: number;
  knowledgeGraphEdges: number;
}
