/**
 * Session 120 — Public API Gateway client.
 *
 * The public surface (`/api/rest/v1`) is an external-consumer surface
 * authenticated with organization API keys, so the web app never calls it
 * directly. This client serves the *internal* management view of the module:
 * the per-key call ledger (`GET /api/v1/apikeys/usage`), plus the shared
 * contract types both sides compile against.
 */
import { api } from "./api";
import type {
  PubAgentSummary,
  PubGatewayIdentity,
  PubKeyUsageRow,
  PubRecentCall,
  PubTalkChannelSummary,
  PubUsageReport,
  PubWorkflowDetail,
  PubWorkflowSummary,
} from "@windels/shared/publicApi";

export type {
  PubAgentSummary,
  PubGatewayIdentity,
  PubKeyUsageRow,
  PubRecentCall,
  PubTalkChannelSummary,
  PubUsageReport,
  PubWorkflowDetail,
  PubWorkflowSummary,
} from "@windels/shared/publicApi";

/** The stable public gateway mount (documentation; the app never calls it). */
export const PUBLIC_API_BASE_PATH = "/api/rest/v1";

export const publicApiUsageApi = {
  /** Internal per-key usage report for the caller's organization. */
  usage: (days: number = 7) =>
    api<PubUsageReport>("/apikeys/usage", { params: { days } }),
};
