/**
 * Session 23 Engineering Governance bootstrap.
 *
 * Ensures every seed service is ready (coding standards, repo standards, ADRs,
 * code-review sample PRs, dependency scan, security standards) and logs
 * aggregate posture on boot. No scheduled jobs — governance is pull-based
 * (UI/API consumers refresh as needed).
 */
import { CodingStandardsService } from "./codingStandards.service.js";
import { RepoStandardsService } from "./repoStandards.service.js";
import { ADRService } from "./adr.service.js";
import { CodeReviewService } from "./codeReview.service.js";
import { DependenciesService } from "./dependencies.service.js";
import { SecurityStandardsService } from "./securityStandards.service.js";
import { logger } from "../observability/logger.js";

export async function bootstrapGovernance() {
  const [coding, repo, adr, reviews, deps, sec] = await Promise.all([
    CodingStandardsService.summary(),
    RepoStandardsService.summary(),
    ADRService.summary(),
    CodeReviewService.metrics(),
    DependenciesService.summary().catch(() => ({ total: 0, outdated: 0, vulnerable: 0 })),
    SecurityStandardsService.posture().catch(() => ({ score: 0, total: 0 })),
  ]);
  logger.info("engineering governance bootstrapped", {
    codingStandards: coding,
    repoStandards: repo,
    adrs: adr,
    openReviews: reviews.openReviews,
    depSummary: { total: deps.total, outdated: deps.outdated, vulnerable: deps.vulnerable },
    securityScore: sec.score,
  });
}
