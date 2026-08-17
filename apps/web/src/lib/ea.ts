/**
 * Session 196 — `ea` (MetaTrader 5 Expert Advisor) web client.
 *
 * Dedicated lib for the EA console. The pre-S196 codebase exposed
 * `eas()` and `revokeEa(eaId)` from `lib/brokerIntegration.ts`; the
 * S196 page is the canonical operator surface, so the full client
 * (register, list, revoke, recent fills) lives here. The old
 * `brokerIntegration.ts` re-exports `eaApi` for back-compat with
 * `BrokerCommandCenterPage`.
 */
import { api } from "./api";
import type {
  EaRegistration, EaSession, EaFillAck,
} from "@windels/shared/ea";
export type { EaRegistration, EaSession } from "@windels/shared/ea";

/** Listing entry returned by `GET /ea` (per-org, includes the
 *  `connected` boolean derived from the most-recent heartbeat). */
export interface EaSummary {
  eaId: string;
  brokerAccountId: string;
  magic: number;
  terminalName: string;
  mt5Login: string;
  mt5Server: string;
  eaVersion: string;
  terminalVersion: string;
  chartSymbol?: string;
  chartTimeframe?: string;
  createdAt: string;
  lastPollAt?: string;
  connected: boolean;
}

export interface EaFillRecord extends EaFillAck {
  receivedAt: string;
}

export const eaApi = {
  /** List the calling org's registered EAs. */
  list: () => api<EaSummary[]>("/ea"),
  /** Register a new EA. Returns the issued session with the bearer
   *  token the operator pastes into the MQL5 Inputs. */
  register: (body: EaRegistration) =>
    api<EaSession>("/ea/register", { method: "POST", json: body }),
  /** Revoke an EA immediately. Pending signals are dropped; the
   *  bearer token is invalidated. */
  revoke: (eaId: string) =>
    api<void>(`/ea/${encodeURIComponent(eaId)}`, { method: "DELETE" }),
  /** Recent fill acks for an EA. The backend reads
   *  `ea:fills:<eaId>` (capped at 500). */
  recentFills: (eaId: string, limit = 50) =>
    api<EaFillRecord[]>(`/ea/${encodeURIComponent(eaId)}/fills`, { params: { limit } }),
};
