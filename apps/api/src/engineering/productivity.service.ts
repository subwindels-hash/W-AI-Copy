/**
 * ProductivityService - Slice 215: Developer Productivity (SPACE-style metrics).
 */
import { redisCmd as redis } from "../db/redis.js";
import type { DeveloperStats, ProductivitySummary } from "@windels/shared";
import { DeploymentService } from "./deployments.service.js";

const LIST_KEY = "eng:devs";
const DETAIL = (id: string) => `eng:dev:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);

function rand(min: number, max: number) { return Math.round((min + max) / 2); } // deterministic

const DEV_SEED = [
  { id: "d-alice", name: "Alice Chen" },
  { id: "d-bob", name: "Bob Rivera" },
  { id: "d-carol", name: "Carol Singh" },
  { id: "d-dave", name: "Dave Park" },
  { id: "d-eve", name: "Eve Nakamura" },
  { id: "d-frank", name: "Frank Okafor" },
  { id: "d-grace", name: "Grace Ivanova" },
  { id: "d-heidi", name: "Heidi Müller" },
];

export const ProductivityService = {
  async list(): Promise<DeveloperStats[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: DeveloperStats[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as DeveloperStats);
    }
    return out.sort((a, b) => b.prsMerged - a.prsMerged);
  },
  async upsert(d: DeveloperStats): Promise<DeveloperStats> {
    await redis.sadd(LIST_KEY, d.id);
    await redis.set(DETAIL(d.id), SER(d));
    return d;
  },
  async summary(): Promise<ProductivitySummary> {
    const devs = await this.list();
    const totalMerged = devs.reduce((a, d) => a + d.prsMerged, 0);
    const totalOpened = devs.reduce((a, d) => a + d.prsOpened, 0);
    const totalReviews = devs.reduce((a, d) => a + d.prsReviewed, 0);
    const avgTtm = devs.length ? devs.reduce((a, d) => a + d.avgTimeToMergeHours, 0) / devs.length : 0;
    const avgRev = devs.length ? devs.reduce((a, d) => a + d.avgReviewTimeHours, 0) / devs.length : 0;
    const avgFocus = devs.length ? devs.reduce((a, d) => a + d.focusScorePct, 0) / devs.length : 0;
    const reviewers = devs.map(d => ({ name: d.displayName, reviews: d.codeReviewsGiven })).sort((a,b)=>b.reviews-a.reviews).slice(0,5);
    const deploy = await DeploymentService.analytics();
    return {
      activeDevelopers: devs.length,
      prsOpened7d: totalOpened,
      prsMerged7d: totalMerged,
      avgTimeToMergeHours: Math.round(avgTtm * 10) / 10,
      avgReviewTurnaroundHours: Math.round(avgRev * 10) / 10,
      focusScorePct: Math.round(avgFocus),
      deploymentFrequencyPerWeek: deploy.deployFrequencyPerWeek,
      changeFailRatePct: deploy.changeFailRatePct,
      topReviewers: reviewers,
      dora: {
        deploymentFrequency: deploy.deployFrequencyPerWeek,
        leadTimeHours: deploy.leadTimeMedianHours,
        changeFailRate: deploy.changeFailRatePct,
        mttrHours: deploy.mttrHours,
      },
    };
  },
  async seedIfEmpty() {
    const existing = await redis.smembers(LIST_KEY);
    if (existing.length > 0) return;
    for (const d of DEV_SEED) {
      const stats: DeveloperStats = {
        id: d.id,
        displayName: d.name,
        prsOpened: rand(3, 12),
        prsMerged: rand(2, 10),
        prsReviewed: rand(4, 18),
        avgReviewTimeHours: 10,
        avgTimeToMergeHours: 18,
        codeReviewsGiven: rand(3, 20),
        linesChanged: rand(200, 5000),
        focusScorePct: rand(55, 92),
        incidentOnCallCount: rand(0, 3),
      };
      await this.upsert(stats);
    }
  },
};
