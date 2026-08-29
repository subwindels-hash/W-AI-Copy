/**
 * Advanced Lead Discovery — shared contract for the existing Lead Discovery
 * store.  These structures intentionally describe provenance and evidence;
 * none of the status values imply consent to contact or purchase intent.
 */
import { z } from "zod";

export const LEAD_DISCOVERY_MODES = ["apollo", "business", "person"] as const;
export type LeadDiscoveryMode = (typeof LEAD_DISCOVERY_MODES)[number];

export const LEAD_VERIFICATION_STATUSES = ["verified", "likely_valid", "unverified", "invalid"] as const;
export type LeadVerificationStatus = (typeof LEAD_VERIFICATION_STATUSES)[number];

export const LEAD_EMAIL_STATUSES = ["verified", "likely_valid", "unverified", "invalid", "not_available"] as const;
export type LeadEmailStatus = (typeof LEAD_EMAIL_STATUSES)[number];

export const LEAD_DISCOVERY_PROVIDERS = ["google_places", "apollo"] as const;
export type LeadDiscoveryProvider = (typeof LEAD_DISCOVERY_PROVIDERS)[number];

export const LEAD_VERIFICATION_PROVIDERS = ["neverbounce"] as const;
export type LeadVerificationProvider = (typeof LEAD_VERIFICATION_PROVIDERS)[number];

export const LEAD_PERSONAL_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com"] as const;
export type LeadPersonalEmailDomain = (typeof LEAD_PERSONAL_EMAIL_DOMAINS)[number];

export const LEAD_JOB_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type LeadJobStatus = (typeof LEAD_JOB_STATUSES)[number];

const shortText = (max = 160) => z.string().trim().min(1).max(max);
const optionalText = (max = 160) => shortText(max).optional();

/**
 * One user-initiated query. Filters are only sent to a provider when that
 * provider documents support for them; post-filters only operate on actual
 * returned fields. `limit` controls the one requested page, not a claim about
 * how many results a provider has in total.
 */
export const LeadAdvancedSearchSchema = z.object({
  mode: z.enum(LEAD_DISCOVERY_MODES),
  industry: optionalText(),
  companySizeRanges: z.array(z.string().trim().regex(/^\d{1,7},\d{1,7}$/, "Use a min,max employee range.")).max(10).default([]),
  jobTitles: z.array(shortText()).max(20).default([]),
  country: optionalText(100),
  stateRegion: optionalText(120),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(32),
  businessType: optionalText(),
  company: optionalText(),
  keywords: z.array(shortText()).max(20).default([]),
  names: z.array(shortText()).max(50).default([]),
  contactAvailability: z.enum(["any", "email", "phone", "email_or_phone"]).default("any"),
  emailDomains: z.array(z.enum(LEAD_PERSONAL_EMAIL_DOMAINS)).max(4).default([]),
  limit: z.number().int().min(1).max(100).default(25),
}).superRefine((value, ctx) => {
  if (value.mode === "business" && value.keywords.length === 0 && !value.businessType && !value.industry && !value.company) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keywords"], message: "Business Mode requires a keyword, business type, industry, or company." });
  }
  if (value.mode === "person" && value.names.length === 0 && value.jobTitles.length === 0 && !value.company && value.keywords.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["names"], message: "Person Mode requires a name, title, company, or keyword." });
  }
  if (value.mode === "apollo" && !value.industry && value.jobTitles.length === 0 && value.keywords.length === 0 && !value.company) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["industry"], message: "Apollo Mode requires an industry, title, company, or keyword." });
  }
});
export type LeadAdvancedSearchInput = z.infer<typeof LeadAdvancedSearchSchema>;

export interface LeadSourceTrace {
  provider: LeadDiscoveryProvider;
  providerRecordId: string;
  /** A source link is included only when the provider returned one. */
  sourceUrl: string | null;
  discoveryMethod: "apollo_people_api_search" | "apollo_organization_search" | "google_places_textsearch";
  searchMode: LeadDiscoveryMode | "legacy";
  searchQuery: string;
  discoveredAt: string;
}

export interface LeadVerification {
  status: LeadVerificationStatus;
  emailStatus: LeadEmailStatus;
  method: string | null;
  provider: LeadVerificationProvider | null;
  verifiedAt: string | null;
  detail: string | null;
}

/**
 * The normalized, provider-backed shape returned by advanced endpoints. Empty
 * properties are null because unknown is not the same thing as an empty value.
 */
export interface AdvancedLead {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string | null;
  industry: string | null;
  country: string | null;
  stateRegion: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  emailStatus: LeadEmailStatus;
  companyWebsite: string | null;
  professionalProfileUrl: string | null;
  source: LeadDiscoveryProvider;
  sourceId: string;
  sourceTrace: LeadSourceTrace[];
  verification: LeadVerification;
  verificationStatus: LeadVerificationStatus;
  discoveryDate: string;
  lastVerifiedDate: string | null;
  qualityScore: number;
  qualityFactors: Array<{ field: string; present: boolean; weight: number }>;
  tags: string[];
  /** Existing pipeline value, when the legacy pipeline has stored one. */
  pipelineStatus: string;
}

export interface LeadDiscoveryJob {
  id: string;
  organizationId: string;
  requestedById: string | null;
  input: LeadAdvancedSearchInput;
  status: LeadJobStatus;
  progress: number;
  stage: "queued" | "provider_search" | "normalization" | "deduplication" | "completed" | "failed";
  message: string;
  discovered: number;
  created: number;
  duplicates: number;
  filteredOut: number;
  resultLeadIds: string[];
  limitations: string[];
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface LeadAdvancedSearchAccepted {
  job: LeadDiscoveryJob;
  /** The results endpoint can be polled without keeping the original request open. */
  pollAfterMs: number;
}

/** Newest-first, organization-scoped record of user-initiated advanced searches. */
export interface LeadDiscoveryJobHistory {
  jobs: LeadDiscoveryJob[];
  returned: number;
}

export interface AdvancedLeadList {
  leads: AdvancedLead[];
  total: number;
  returned: number;
  nextOffset: number | null;
}

export const AdvancedLeadListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().min(1).max(160).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  verificationStatus: z.enum(LEAD_VERIFICATION_STATUSES).optional(),
  tag: z.string().trim().min(1).max(48).optional(),
  sort: z.enum(["discovery_desc", "quality_desc", "name_asc"]).default("discovery_desc"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type AdvancedLeadListQuery = z.infer<typeof AdvancedLeadListQuerySchema>;

export const LeadTagUpdateSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(48)).max(30),
});
export type LeadTagUpdateInput = z.infer<typeof LeadTagUpdateSchema>;

export const LeadVerificationRequestSchema = z.object({
  field: z.literal("email").default("email"),
});

export const LeadOutreachHandoffSchema = z.object({
  leadIds: z.array(z.string().trim().min(5).max(80)).min(1).max(100),
});

export interface LeadOutreachHandoff {
  selected: number;
  emailEligibleLeadIds: string[];
  excluded: Array<{ leadId: string; reason: string }>;
  destination: "/app/email-intel";
  requiresExplicitSend: true;
  note: string;
}

export interface LeadAgentInterpretation {
  source: "ai" | "heuristic";
  criteria: Partial<LeadAdvancedSearchInput>;
  recommendations: string[];
  limitations: string[];
}

export const LeadAgentInterpretSchema = z.object({
  request: z.string().trim().min(3).max(2_000),
});

/** A user-requested, local evidence review. Nothing is tagged, contacted, or
 * changed by this request; recommendations are derived from the stored source
 * and verification records only. */
export const LeadAgentRecommendationRequestSchema = z.object({
  leadIds: z.array(z.string().trim().min(5).max(80)).min(1).max(100),
});
export interface LeadAgentLeadRecommendation {
  leadId: string;
  source: "heuristic";
  classification: {
    provider: LeadDiscoveryProvider;
    industry: string | null;
    normalizedFields: string[];
    suggestedTags: string[];
  };
  duplicateRecommendation: { confidentMatchLeadIds: string[]; note: string };
  qualityRecommendation: { score: number; missingFields: string[]; note: string };
  verificationRecommendation: string;
  listRecommendation: string;
}
export interface LeadAgentRecommendationResult {
  recommendations: LeadAgentLeadRecommendation[];
  note: string;
}

export interface LeadProviderStatus {
  provider: "apollo" | "google_places" | "neverbounce";
  kind: "discovery" | "verification";
  configured: boolean;
  credentialSource: "dashboard" | "environment" | "none";
  operational: boolean;
  requiredConfiguration: string;
}

export interface LeadDiscoveryAdminStatus {
  providers: LeadProviderStatus[];
  policy: LeadDiscoveryPolicy;
  note: string;
}

export interface LeadDiscoveryPolicy {
  enabled: boolean;
  verificationEnabled: boolean;
  exportEnabled: boolean;
  allowPersonalEmailDomainFiltering: boolean;
  maxResultsPerSearch: number;
  retentionDays: number;
}

export const LeadDiscoveryPolicySchema = z.object({
  enabled: z.boolean().optional(),
  verificationEnabled: z.boolean().optional(),
  exportEnabled: z.boolean().optional(),
  allowPersonalEmailDomainFiltering: z.boolean().optional(),
  maxResultsPerSearch: z.number().int().min(1).max(100).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
});
export type LeadDiscoveryPolicyInput = z.infer<typeof LeadDiscoveryPolicySchema>;

export const LeadJobIdParamSchema = z.object({ id: z.string().trim().regex(/^leadjob-[A-Za-z0-9-]+$/, "Not a lead discovery job id.") });
export const AdvancedLeadIdParamSchema = z.object({ id: z.string().trim().regex(/^lead-[A-Za-z0-9-]+$/, "Not a lead id.") });

export const LEAD_QUALITY_NOTE = "Lead Quality measures completeness of provider-returned data and recorded source traceability. It is not a likelihood of conversion, consent to contact, or a verification guarantee.";
export const LEAD_VERIFICATION_NOTE = "Verified means an authorized verification provider returned a positive result for the named field. Likely Valid means the provider returned a qualified-but-not-confirmed result. Unverified means no authorized verification result is stored. Invalid means the provider returned an invalid or disposable result.";
export const LEAD_PRIVACY_NOTE = "Use only permitted sources and lawful criteria. This module does not scrape restricted data, bypass access controls, infer missing contact details, or send outreach automatically.";
