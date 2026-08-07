/**
 * Publishing Module (v4.0)
 *
 * Extracted from mediaFactory/publishing for separation of concerns.
 * Handles publishing to external platforms: YouTube, TikTok, Instagram, Facebook, X, Pinterest.
 *
 * This module is now independent from mediaFactory (which handles video rendering).
 */

import { PublishingService } from "../mediaFactory/publishing.service.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

export const publishingModule = {
  /**
   * Get list of supported publishing platforms
   */
  async getPlatforms(): Promise<Array<{
    platform: string;
    displayName: string;
    connected: boolean;
    status: string;
  }>> {
    return PublishingService.getPlatforms();
  },

  /**
   * Start OAuth connection to a platform
   */
  async connectStart(platform: string, orgId: string): Promise<{ url: string }> {
    return PublishingService.connectStart(platform, orgId);
  },

  /**
   * Handle OAuth callback
   */
  async handleCallback(platform: string, req: {
    query: { code?: string; state?: string; error?: string };
  }, orgId: string): Promise<{ success: boolean; platform?: string; error?: string }> {
    return PublishingService.handleCallback(platform, req, orgId);
  },

  /**
   * Disconnect from a platform
   */
  async disconnect(platform: string, orgId: string): Promise<{ success: boolean }> {
    return PublishingService.disconnect(platform, orgId);
  },

  /**
   * Get platform connection status
   */
  async getStatus(platform: string, orgId: string): Promise<{
    platform: string;
    connected: boolean;
    authorized: boolean;
    lastSync?: string;
    videoCount?: number;
    error?: string;
  }> {
    return PublishingService.getStatus(platform, orgId);
  },

  /**
   * Publish content to a platform
   */
  async publish(
    orgId: string,
    platform: string,
    jobId: string,
    options?: { title?: string; description?: string; tags?: string[]; visibility?: string; scheduledTime?: string }
  ): Promise<{ jobId: string; status: string }> {
    return PublishingService.publish(orgId, platform, jobId, options);
  },

  /**
   * Get publish jobs
   */
  async getJobs(orgId: string, limit = 50, offset = 0): Promise<Array<{
    id: string;
    platform: string;
    status: string;
    mediaFileUrl?: string;
    platformRef?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }>> {
    return PublishingService.getJobs(orgId, limit, offset);
  },

  /**
   * Get single publish job
   */
  async getJob(orgId: string, jobId: string): Promise<{
    id: string;
    platform: string;
    status: string;
    mediaFileUrl?: string;
    platformRef?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  } | null> {
    return PublishingService.getJob(orgId, jobId);
  },

  /**
   * Retry a failed publish job
   */
  async retryJob(orgId: string, jobId: string): Promise<{ success: boolean; jobId: string }> {
    return PublishingService.retryJob(orgId, jobId);
  },

  /**
   * Cancel a publish job
   */
  async cancelJob(orgId: string, jobId: string): Promise<{ success: boolean }> {
    return PublishingService.cancelJob(orgId, jobId);
  },

  /**
   * Get publish audit log
   */
  async getAudit(orgId: string, limit = 100): Promise<Array<{
    id: string;
    platform: string;
    action: string;
    jobId?: string;
    result: string;
    timestamp: string;
  }>> {
    return PublishingService.getAudit(orgId, limit);
  },

  /**
   * Register a webhook for a platform
   */
  async registerWebhook(platform: string, orgId: string, endpoint: string): Promise<{ success: boolean; webhookId: string }> {
    return PublishingService.registerWebhook(platform, orgId, endpoint);
  },

  /**
   * Delete a webhook
   */
  async deleteWebhook(platform: string, orgId: string): Promise<{ success: boolean }> {
    return PublishingService.deleteWebhook(platform, orgId);
  },

  /**
   * Upload a file for publishing
   */
  async uploadFile(orgId: string, platform: string, file: Buffer, filename: string): Promise<{ uploadId: string; url?: string; error?: string }> {
    return PublishingService.uploadFile(orgId, platform, file, filename);
  },

  /**
   * List uploaded files
   */
  async getUploads(orgId: string, platform?: string): Promise<Array<{
    id: string;
    platform: string;
    filename: string;
    url: string;
    size: number;
    mimeType: string;
    createdAt: string;
  }>> {
    return PublishingService.getUploads(orgId, platform);
  },

  /**
   * Delete an uploaded file
   */
  async deleteUpload(orgId: string, fileId: string): Promise<{ success: boolean }> {
    return PublishingService.deleteUpload(orgId, fileId);
  },
};

export default publishingModule;
