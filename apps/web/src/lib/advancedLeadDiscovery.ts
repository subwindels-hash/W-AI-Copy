/**
 * Advanced Lead Discovery — web client for the additive advanced surface of
 * the Lead Discovery module (Apollo / Business / Person modes).
 *
 * The API client itself lives in `lib/leadDiscovery.ts` (`advancedLeadApi`,
 * shared with the Session 85 classic search and the Session 115 pipeline
 * console). This file re-exports it under the module key so the module has a
 * first-class, typed client of its own — the same pattern used by the other
 * console alias clients in this app.
 */
export {
  advancedLeadApi,
  type AdvancedLead,
  type AdvancedLeadList,
  type LeadAdvancedSearchInput,
  type LeadAgentInterpretation,
  type LeadAgentLeadRecommendation,
  type LeadAgentRecommendationResult,
  type LeadDiscoveryAdminStatus,
  type LeadDiscoveryJob,
  type LeadDiscoveryJobHistory,
  type LeadDiscoveryPolicy,
  type LeadOutreachHandoff,
} from "./leadDiscovery";

export {
  LEAD_DISCOVERY_MODES,
  LEAD_PERSONAL_EMAIL_DOMAINS,
  LEAD_PRIVACY_NOTE,
  LEAD_QUALITY_NOTE,
  LEAD_VERIFICATION_NOTE,
  type LeadDiscoveryMode,
} from "@windels/shared/leadDiscoveryAdvanced";
