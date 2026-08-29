import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { LotteryIntelligenceService } from "./lotteryIntelligence.service.js";
import type { LiJobKind } from "@windels/shared/lotteryIntelligence";

const DEFAULT_KINDS: LiJobKind[] = [
  "PROVIDER_HEALTH",
  "DRAW_SYNC",
  "RESULT_VERIFICATION",
  "TICKET_CHECK",
];

export async function runLotteryJobsForAllOrgs(kinds: LiJobKind[] = DEFAULT_KINDS): Promise<void> {
  let orgIds: string[] = [];
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true }, take: 200 });
    orgIds = orgs.map((o) => o.id);
  } catch (e) {
    logger.warn("[lottery] org listing failed; jobs skipped", { err: e instanceof Error ? e.message : e });
    return;
  }
  for (const org of orgIds) {
    const cfg = await LotteryIntelligenceService.getConfig(org);
    if (!cfg.enabled) continue;
    for (const kind of kinds) {
      try {
        await LotteryIntelligenceService.runJob(org, kind, null);
      } catch (e) {
        logger.warn("[lottery] scheduled job failed", { org, kind, err: e instanceof Error ? e.message : e });
      }
    }
  }
}

export function startLotteryJobTicker(intervalMs = 30 * 60_000): NodeJS.Timeout {
  const tick = () => {
    void runLotteryJobsForAllOrgs().catch((err) => logger.warn("[lottery] ticker failed", { err }));
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  setTimeout(tick, 35_000).unref?.();
  return handle;
}
