/**
 * WINDELS AI OS — Financial Policy console service.
 *
 * The `financialPolicy.service.ts` beside this file provides the low-level,
 * immutable provenance/decision-safety primitives. This service is the
 * operator-facing layer: it records every decision and provenance factory call
 * into a tenant-scoped ledger and rolls the ledger up into a dashboard.
 *
 * HONESTY CONTRACT (the same one every module in this repo now obeys)
 * -------------------------------------------------------------------
 *  - A fresh organization starts with an EMPTY ledger. Nothing is fabricated.
 *  - Every ledger entry is a real audited event (a decision verdict or a
 *    provenance factory call the operator actually made).
 *  - Simulated provenance can only be created through the demo gate.
 *  - A decision verdict is computed by the shared safety gate, never invented.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { env } from "../config/env.js";
import { demoDataEnabled } from "../config/demoData.js";
import {
  FinancialProvenance,
  FinancialClassification,
  FinancialLedgerEntry,
  FinancialDashboard,
  FinancialProvenanceInput,
  isFinancialDataDecisionSafe,
} from "@windels/shared";
import { FinancialPolicyService } from "./financialPolicy.service.js";

const LEDGER_CAP = 500;

const K = {
  ledger: (oid: string) => `fin:ledger:${oid}`,
  meta: (oid: string) => `fin:meta:${oid}`,
};
const s2 = (o: unknown) => JSON.stringify(o);

export interface DecisionRecordInput {
  source: string;
  provider?: string | null;
  status: FinancialClassification;
  safe: boolean;
  reason?: string | null;
}

function entryFrom(input: DecisionRecordInput, oid: string): FinancialLedgerEntry {
  return {
    id: "fin-" + randomUUID().slice(0, 12),
    organizationId: oid,
    createdAt: new Date().toISOString(),
    source: input.source,
    provider: input.provider ?? null,
    status: input.status,
    safe: input.safe,
    reason: input.reason ?? null,
  };
}

export const FinancialService = {
  /**
   * Marks the organization as initialised. Writes NO synthetic records: a fresh
   * org reports an empty ledger and zero counters.
   */
  async ensureBootstrapped(logger?: any, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    if (await redis.exists(K.meta(oid))) return;
    await redis.hset(K.meta(oid), "initialized", "1");
    logger?.info?.("[financial] initialized (decision ledger; no synthetic records)");
  },

  async listLedger(oid: string, limit = 100): Promise<FinancialLedgerEntry[]> {
    const raw = await redis.lrange(K.ledger(oid), 0, limit - 1);
    const out: FinancialLedgerEntry[] = [];
    for (const r of raw) {
      try {
        const parsed = JSON.parse(r) as FinancialLedgerEntry;
        if (parsed && typeof parsed === "object") out.push(parsed);
      } catch {
        // skip malformed
      }
    }
    return out;
  },

  async dashboard(oid: string): Promise<FinancialDashboard> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
      throw new Error("organizationId is required");
    }
    const ledger = await this.listLedger(oid, LEDGER_CAP);
    const countsByStatus: Record<FinancialClassification, number> = {
      REAL: 0, SIMULATED: 0, UNAVAILABLE: 0, UNVERIFIED: 0, STALE: 0,
    };
    const providersSeen = new Set<string>();
    let safe = 0;
    let blocked = 0;
    for (const e of ledger) {
      countsByStatus[e.status] = (countsByStatus[e.status] ?? 0) + 1;
      if (e.provider) providersSeen.add(e.provider);
      if (e.safe) safe += 1; else blocked += 1;
    }
    return {
      runtimeMode: env.WINDELS_RUNTIME_MODE ?? env.NODE_ENV ?? "development",
      demoData: demoDataEnabled(),
      ledgerCount: ledger.length,
      countsByStatus,
      safeDecisions: safe,
      blockedDecisions: blocked,
      recentLedger: ledger.slice(0, 20),
      providersSeen: [...providersSeen],
    };
  },

  /** Non-throwing decision-safety verdict (does not record). */
  async check(
    provenance: FinancialProvenance,
    opts: { allowSandbox?: boolean; maxAgeMs?: number } = {},
  ): Promise<{ safe: boolean; reason: string | null }> {
    const verdict = isFinancialDataDecisionSafe(provenance, opts);
    return { safe: verdict.safe, reason: verdict.reason ?? null };
  },

  /** Throwing decision-safety gate (records the attempt to the ledger). */
  async decide(
    oid: string,
    provenance: FinancialProvenance,
    opts: { allowSandbox?: boolean; maxAgeMs?: number } = {},
  ): Promise<{ safe: boolean; reason: string | null }> {
    let safe = true;
    let reason: string | null = null;
    try {
      FinancialPolicyService.assertDecisionSafe(provenance, opts);
    } catch (e: any) {
      safe = false;
      reason = e?.message ?? "Decision rejected by financial policy.";
    }
    await this.record(oid, {
      source: provenance.source,
      provider: provenance.provider ?? null,
      status: provenance.status,
      safe,
      reason: safe ? "decision allowed" : reason,
    });
    return { safe, reason: safe ? null : reason };
  },

  /** Append an audited decision/provenance record to the tenant ledger. */
  async record(oid: string, input: DecisionRecordInput): Promise<FinancialLedgerEntry> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
      throw new Error("organizationId is required");
    }
    const entry = entryFrom(input, oid);
    await redis.lpush(K.ledger(oid), s2(entry));
    const len = (await redis.lrange(K.ledger(oid), 0, -1)).length;
    if (len > LEDGER_CAP) {
      await redis.ltrim(K.ledger(oid), 0, LEDGER_CAP - 1);
    }
    return entry;
  },

  async deleteLedger(oid: string, id: string): Promise<boolean> {
    const raw = await redis.lrange(K.ledger(oid), 0, -1);
    for (const r of raw) {
      try {
        const parsed = JSON.parse(r) as FinancialLedgerEntry;
        if (parsed.id === id) {
          await redis.lrem(K.ledger(oid), 0, r);
          return true;
        }
      } catch {
        // skip malformed
      }
    }
    return false;
  },

  /** Create a REAL provenance record (records it to the ledger). */
  async createReal(oid: string, input: FinancialProvenanceInput): Promise<FinancialProvenance> {
    const p = FinancialPolicyService.createRealProvenance(
      input.source,
      input.provider ?? "internal",
      input.providerTransactionId ?? null,
      oid,
      input.currency ?? "USD",
    );
    await this.record(oid, { source: input.source, provider: p.provider, status: "REAL", safe: true, reason: "provenance created (REAL)" });
    return p;
  },

  /** Create a SIMULATED provenance record (demo-gated; records it). */
  async createSimulated(oid: string, input: FinancialProvenanceInput): Promise<FinancialProvenance> {
    const p = FinancialPolicyService.createSimulatedProvenance(
      input.source,
      oid,
      input.reason ?? "DEMO_FIXTURE",
      input.currency ?? "USD",
    );
    await this.record(oid, { source: input.source, provider: p.provider, status: "SIMULATED", safe: false, reason: "provenance created (SIMULATED) — not decision-safe" });
    return p;
  },

  /** Create an UNAVAILABLE provenance record (records it). */
  async createUnavailable(oid: string, input: FinancialProvenanceInput): Promise<FinancialProvenance> {
    const p = FinancialPolicyService.createUnavailableProvenance(
      input.source,
      input.provider ?? "provider",
      oid,
      input.reason ?? "REAL_PROVIDER_NOT_CONFIGURED",
      input.currency ?? "USD",
    );
    await this.record(oid, { source: input.source, provider: p.provider, status: "UNAVAILABLE", safe: false, reason: "provenance created (UNAVAILABLE)" });
    return p;
  },

  /** Runtime posture for the console header. */
  status(): { runtimeMode: string; demoData: boolean } {
    return {
      runtimeMode: env.WINDELS_RUNTIME_MODE ?? env.NODE_ENV ?? "development",
      demoData: demoDataEnabled(),
    };
  },
};
