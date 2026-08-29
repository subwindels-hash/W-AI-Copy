import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { LotteryIntelligenceService } from "./lotteryIntelligence.service.js";

export async function bootstrapLotteryIntelligence(logger?: { info?: Function; warn?: Function }) {
  if (!demoDataEnabled()) return skipDemoSeed("lottery-intelligence", logger as any);
  try {
    const org = "org-demo-lottery";
    const cfg = await LotteryIntelligenceService.getConfig(org);
    if (cfg.mode !== "SANDBOX") {
      await LotteryIntelligenceService.updateConfig(org, { mode: "SANDBOX", reason: "demo bootstrap" }, "system");
    }
    await LotteryIntelligenceService.runPipeline(org, "system");
    logger?.info?.("[lottery-intelligence] sandbox pipeline seeded for org-demo-lottery");
  } catch (e) {
    logger?.warn?.("[lottery-intelligence] bootstrap failed", { err: e });
  }
}
