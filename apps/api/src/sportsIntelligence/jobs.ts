/**
 * Idempotent Sports Intelligence scheduled jobs.
 *
 * Running the same job twice does not create duplicate fixtures, odds,
 * predictions or tickets. Each execution is recorded with an execution id.
 */

import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { SportsIntelligenceService } from "./sportsIntelligence.service.js";
import type { SiJobKind } from "@windels/shared/sportsIntelligence";

const DEFAULT_KINDS: SiJobKind[] = [
  "PROVIDER_HEALTH",
  "FIXTURE_SYNC",
  "ODDS_SYNC",
  "MATCH_STATUS_SYNC",
  "PREDICTION_GENERATION",
  "RESULT_SYNC",
  "RESULT_VERIFICATION",
  "TICKET_SETTLEMENT",
  "MODEL_MONITORING",
];

export async function runSportsJobsForAllOrgs(kinds: SiJobKind[] = DEFAULT_KINDS): Promise<void> {
  let orgIds: string[] = [];
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true }, take: 200 });
    orgIds = orgs.map((o) => o.id);
  } catch (e) {
    logger.warn("[sports] org listing failed; jobs skipped", { err: e instanceof Error ? e.message : e });
    return;
  }
  for (const org of orgIds) {
    const cfg = await SportsIntelligenceService.getConfig(org);
    if (!cfg.enabled) continue;
    for (const kind of kinds) {
      try {
        await SportsIntelligenceService.runJob(org, kind, null);
      } catch (e) {
        logger.warn("[sports] scheduled job failed", { org, kind, err: e instanceof Error ? e.message : e });
      }
    }
  }
}

export function startSportsJobTicker(intervalMs = 15 * 60_000): NodeJS.Timeout {
  const tick = () => {
    void runSportsJobsForAllOrgs().catch((err) => logger.warn("[sports] ticker failed", { err }));
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  setTimeout(tick, 25_000).unref?.();
  return handle;
}
