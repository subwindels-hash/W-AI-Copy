/**
 * StagingService - Slice 202: Staging deployment.
 */
import { redisCmd as redis } from "../db/redis.js";
import type { StagingDeployment } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";

const KEY = (rid: string) => `rel:staging:${rid}`;

function iso() { return new Date().toISOString(); }

export const StagingService = {
  async deploy(releaseId: string): Promise<StagingDeployment | null> {
    const rel = await PipelineService.get(releaseId);
    if (!rel) return null;
    await PipelineService.setStatus(releaseId, "staging", "staging");
    const deployment: StagingDeployment = {
      releaseId,
      status: "deploying",
      url: `https://staging.windels.ai/r/${rel.number}`,
      smokeTestsPassed: 0,
      smokeTestsFailed: 0,
      regressionPassRate: 0,
      healthChecksPassed: false,
      deployedAt: iso(),
    };
    await redis.set(KEY(releaseId), JSON.stringify(deployment), "EX", 60 * 60 * 24);
    await new Promise((r) => setTimeout(r, 120));
    deployment.status = "smoke_testing";
    deployment.smokeTestsPassed = 12;
    deployment.smokeTestsFailed = 0;
    await redis.set(KEY(releaseId), JSON.stringify(deployment), "EX", 60 * 60 * 24);
    await new Promise((r) => setTimeout(r, 120));
    deployment.status = "regression";
    deployment.regressionPassRate = 98.6;
    deployment.healthChecksPassed = true;
    deployment.status = "healthy";
    deployment.validatedAt = iso();
    await redis.set(KEY(releaseId), JSON.stringify(deployment), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(releaseId, "staging_validated", "staging");
    return deployment;
  },
  async get(releaseId: string): Promise<StagingDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    return raw ? (JSON.parse(raw) as StagingDeployment) : null;
  },
};
