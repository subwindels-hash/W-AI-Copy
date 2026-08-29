/** Session 68 — Enterprise Scientific Research Platform.
 * Session 160 — honesty pass: unmeasured figures are null, never a fake
 * millions-scale knowledge graph or citation count.
 */
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
  /** Null when the operator did not record a count — 0 would be a measurement. */
  citations: number | null;
  /** Null when unranked. This is not a Crossref/PubMed relevance score. */
  relevanceScore: number | null;
  abstract: string;
  domain?: ResearchDomain;
}

export interface CitationNode { id: string; title: string; year: number; weight: number; }

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  domain: ResearchDomain;
  variables: { independent: string[]; dependent: string[]; controls: string[] };
  status: "planned"|"running"|"completed"|"failed";
  /** Operator-entered progress. 0 on create is "just planned", not a measurement. */
  progressPct: number;
  expectedOutcome: string;
  results?: string;
  /** Operator-entered lifetime simulation count. Not a 30-day event ledger. */
  simulations: number;
  createdAt: string;
  completedAt?: string;
}

export interface Hypothesis {
  id: string;
  statement: string;
  domain: ResearchDomain;
  /** Null when unassessed — 0 is a confidence score. */
  confidence: number | null;
  supportingEvidence: number;
  counterEvidence: number;
  status: "proposed"|"testing"|"supported"|"refuted"|"published";
  updatedAt?: string;
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
  /** 0 until a publication ledger exists. Not a count of testing hypotheses. */
  publicationsInProgress: number;
  publicationsPublished30d: number;
  /** Null — no collaborator register. */
  collaborators: number | null;
  /** Sum of recorded paper.citations, or null when none are recorded. */
  citationsTracked: number | null;
  /** Null — no timestamped simulation event ledger. */
  simulationsRun30d: number | null;
  topDomains: Array<{ domain: ResearchDomain; papers: number; experiments: number }>;
  recentExperiments: Experiment[];
  recentPapers: LiteratureRef[];
  recentHypotheses: Hypothesis[];
  /** Null — there is no knowledge graph. 0 nodes would be a measured empty graph. */
  knowledgeGraphNodes: number | null;
  knowledgeGraphEdges: number | null;
  provenance?: {
    papersIndexed: string;
    knowledgeGraph: string;
    publications: string;
    simulationsRun30d: string;
    collaborators: string;
    citationsTracked: string;
  };
}
