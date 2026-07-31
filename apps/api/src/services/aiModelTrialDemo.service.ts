/**
 * Module 97: AI Model Trial & Demo Service
 * WINDELS AI OS - Phase 1
 * 
 * Manages free trials, sandbox environments, demo access, and trial-to-paid
 * conversion for AI models in the marketplace. Provides usage limits, time-based
 * expiration, and conversion analytics.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TrialOffering {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  trialType: TrialType;
  duration: TrialDuration;
  usageLimits: UsageLimits;
  features: TrialFeatures;
  status: OfferingStatus;
  conversionConfig: ConversionConfig;
  createdAt: string;
  updatedAt: string;
}

export type TrialType = 'time_based' | 'usage_based' | 'feature_limited' | 'sandbox' | 'demo';

export interface TrialDuration {
  days?: number;
  hours?: number;
  startDate?: string;
  endDate?: string;
}

export interface UsageLimits {
  maxRequests: number;
  maxTokens?: number;
  maxComputeMinutes?: number;
  maxStorageMB?: number;
  concurrentUsers?: number;
  rateLimitPerMinute?: number;
}

export interface TrialFeatures {
  enabledFeatures: string[];
  disabledFeatures: string[];
  watermarked: boolean;
  exportEnabled: boolean;
  apiAccess: boolean;
  customBranding: boolean;
}

export type OfferingStatus = 'active' | 'paused' | 'expired' | 'archived';

export interface ConversionConfig {
  autoConvert: boolean;
  conversionIncentive?: ConversionIncentive;
  notificationSchedule: NotificationSchedule[];
  gracePeriodDays: number;
}

export interface ConversionIncentive {
  type: 'discount' | 'extended_trial' | 'bonus_credits' | 'free_tier';
  value: number;
  description: string;
  validUntil?: string;
}

export interface NotificationSchedule {
  timing: 'start' | 'midpoint' | 'warning' | 'expiration' | 'post_expiration';
  daysBefore?: number;
  channel: 'email' | 'in_app' | 'sms';
  template: string;
}

export interface ActiveTrial {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  trialOfferingId: string;
  modelId: string;
  modelName: string;
  status: TrialStatus;
  startDate: string;
  endDate: string;
  usage: TrialUsage;
  conversionAttempts: ConversionAttempt[];
  notificationsSent: NotificationRecord[];
  sandboxEnvironment?: SandboxEnvironment;
  createdAt: string;
  updatedAt: string;
}

export type TrialStatus = 'active' | 'expired' | 'converted' | 'cancelled' | 'suspended';

export interface TrialUsage {
  requestsUsed: number;
  requestsLimit: number;
  tokensUsed?: number;
  tokensLimit?: number;
  computeMinutesUsed?: number;
  computeMinutesLimit?: number;
  storageUsedMB?: number;
  storageLimitMB?: number;
  lastUsedAt: string;
  usagePercentage: number;
}

export interface ConversionAttempt {
  id: string;
  attemptedAt: string;
  planId?: string;
  planName?: string;
  status: 'successful' | 'failed' | 'abandoned';
  reason?: string;
  incentiveUsed?: string;
}

export interface NotificationRecord {
  id: string;
  timing: string;
  sentAt: string;
  channel: string;
  status: 'sent' | 'failed' | 'pending';
  message: string;
}

export interface SandboxEnvironment {
  id: string;
  environmentId: string;
  status: 'provisioning' | 'active' | 'suspended' | 'terminated';
  resources: SandboxResources;
  accessCredentials: AccessCredentials;
  expirationDate: string;
  dataPersistence: boolean;
}

export interface SandboxResources {
  cpuCores: number;
  memoryMB: number;
  storageMB: number;
  gpuEnabled: boolean;
  gpuType?: string;
}

export interface AccessCredentials {
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  dashboardUrl: string;
}

export interface TrialAnalytics {
  totalTrials: number;
  activeTrials: number;
  expiredTrials: number;
  convertedTrials: number;
  conversionRate: number;
  averageTrialDuration: number;
  averageUsagePercentage: number;
  topConvertingModels: ModelConversionStats[];
  conversionFunnel: ConversionFunnelStage[];
  revenueFromConversion: number;
}

export interface ModelConversionStats {
  modelId: string;
  modelName: string;
  totalTrials: number;
  conversions: number;
  conversionRate: number;
  averageTimeToConvert: number;
}

export interface ConversionFunnelStage {
  stage: string;
  count: number;
  percentage: number;
  dropoff: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const trialOfferings = new Map<string, TrialOffering>();
const activeTrials = new Map<string, ActiveTrial>();
const sandboxEnvironments = new Map<string, SandboxEnvironment>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createTrialOffering(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  trialType: TrialType;
  duration: TrialDuration;
  usageLimits: UsageLimits;
  features?: Partial<TrialFeatures>;
  conversionConfig?: Partial<ConversionConfig>;
}): TrialOffering {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const defaultFeatures: TrialFeatures = {
    enabledFeatures: ['basic_inference', 'api_access'],
    disabledFeatures: ['batch_processing', 'custom_models', 'priority_support'],
    watermarked: false,
    exportEnabled: true,
    apiAccess: true,
    customBranding: false,
  };
  
  const defaultConversionConfig: ConversionConfig = {
    autoConvert: false,
    notificationSchedule: [
      { timing: 'start', channel: 'email', template: 'trial_welcome' },
      { timing: 'warning', daysBefore: 3, channel: 'email', template: 'trial_expiring' },
      { timing: 'expiration', channel: 'email', template: 'trial_expired' },
    ],
    gracePeriodDays: 7,
  };
  
  const offering: TrialOffering = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    trialType: params.trialType,
    duration: params.duration,
    usageLimits: params.usageLimits,
    features: { ...defaultFeatures, ...params.features },
    status: 'active',
    conversionConfig: { ...defaultConversionConfig, ...params.conversionConfig },
    createdAt: now,
    updatedAt: now,
  };
  
  trialOfferings.set(id, offering);
  return offering;
}

export function getTrialOffering(id: string): TrialOffering | undefined {
  return trialOfferings.get(id);
}

export function listTrialOfferings(organizationId: string): TrialOffering[] {
  return Array.from(trialOfferings.values()).filter(
    o => o.organizationId === organizationId
  );
}

export function startTrial(params: {
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  trialOfferingId: string;
}): ActiveTrial {
  const offering = trialOfferings.get(params.trialOfferingId);
  if (!offering) {
    throw new Error(`Trial offering ${params.trialOfferingId} not found`);
  }
  
  if (offering.status !== 'active') {
    throw new Error(`Trial offering ${params.trialOfferingId} is not active`);
  }
  
  const now = new Date();
  const endDate = new Date(now);
  if (offering.duration.days) {
    endDate.setDate(endDate.getDate() + offering.duration.days);
  } else if (offering.duration.hours) {
    endDate.setHours(endDate.getHours() + offering.duration.hours);
  }
  
  const id = randomUUID();
  
  const trial: ActiveTrial = {
    id,
    organizationId: params.organizationId,
    customerId: params.customerId,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    trialOfferingId: params.trialOfferingId,
    modelId: offering.modelId,
    modelName: offering.modelName,
    status: 'active',
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    usage: {
      requestsUsed: 0,
      requestsLimit: offering.usageLimits.maxRequests,
      tokensUsed: 0,
      tokensLimit: offering.usageLimits.maxTokens,
      computeMinutesUsed: 0,
      computeMinutesLimit: offering.usageLimits.maxComputeMinutes,
      storageUsedMB: 0,
      storageLimitMB: offering.usageLimits.maxStorageMB,
      lastUsedAt: now.toISOString(),
      usagePercentage: 0,
    },
    conversionAttempts: [],
    notificationsSent: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  
  // Provision sandbox if needed
  if (offering.trialType === 'sandbox' || offering.trialType === 'demo') {
    const sandbox = provisionSandbox(id, offering);
    trial.sandboxEnvironment = sandbox;
  }
  
  activeTrials.set(id, trial);
  return trial;
}

function provisionSandbox(trialId: string, offering: TrialOffering): SandboxEnvironment {
  const id = randomUUID();
  
  const sandbox: SandboxEnvironment = {
    id,
    environmentId: `sandbox_${trialId}`,
    status: 'active',
    resources: {
      cpuCores: 2,
      memoryMB: 4096,
      storageMB: offering.usageLimits.maxStorageMB || 1024,
      gpuEnabled: false,
    },
    accessCredentials: {
      apiKey: `trial_${randomUUID()}`,
      apiSecret: randomUUID(),
      endpoint: `https://sandbox.windels.ai/${id}`,
      dashboardUrl: `https://dashboard.windels.ai/sandbox/${id}`,
    },
    expirationDate: new Date(Date.now() + (offering.duration.days || 14) * 24 * 60 * 60 * 1000).toISOString(),
    dataPersistence: false,
  };
  
  sandboxEnvironments.set(id, sandbox);
  return sandbox;
}

export function getActiveTrial(id: string): ActiveTrial | undefined {
  return activeTrials.get(id);
}

export function listActiveTrials(
  organizationId: string,
  filters?: {
    customerId?: string;
    modelId?: string;
    status?: TrialStatus;
  }
): ActiveTrial[] {
  let trials = Array.from(activeTrials.values()).filter(
    t => t.organizationId === organizationId
  );
  
  if (filters?.customerId) {
    trials = trials.filter(t => t.customerId === filters.customerId);
  }
  if (filters?.modelId) {
    trials = trials.filter(t => t.modelId === filters.modelId);
  }
  if (filters?.status) {
    trials = trials.filter(t => t.status === filters.status);
  }
  
  return trials;
}

export function recordTrialUsage(
  trialId: string,
  usage: {
    requests?: number;
    tokens?: number;
    computeMinutes?: number;
    storageMB?: number;
  }
): ActiveTrial {
  const trial = activeTrials.get(trialId);
  if (!trial) {
    throw new Error(`Active trial ${trialId} not found`);
  }
  
  if (trial.status !== 'active') {
    throw new Error(`Trial ${trialId} is not active`);
  }
  
  // Check expiration
  if (new Date() > new Date(trial.endDate)) {
    trial.status = 'expired';
    trial.updatedAt = new Date().toISOString();
    throw new Error(`Trial ${trialId} has expired`);
  }
  
  // Update usage
  if (usage.requests) {
    trial.usage.requestsUsed += usage.requests;
  }
  if (usage.tokens) {
    trial.usage.tokensUsed = (trial.usage.tokensUsed || 0) + usage.tokens;
  }
  if (usage.computeMinutes) {
    trial.usage.computeMinutesUsed = (trial.usage.computeMinutesUsed || 0) + usage.computeMinutes;
  }
  if (usage.storageMB) {
    trial.usage.storageUsedMB = (trial.usage.storageUsedMB || 0) + usage.storageMB;
  }
  
  trial.usage.lastUsedAt = new Date().toISOString();
  
  // Calculate usage percentage
  const usagePercentages = [
    trial.usage.requestsUsed / trial.usage.requestsLimit,
  ];
  
  if (trial.usage.tokensLimit) {
    usagePercentages.push((trial.usage.tokensUsed || 0) / trial.usage.tokensLimit);
  }
  if (trial.usage.computeMinutesLimit) {
    usagePercentages.push((trial.usage.computeMinutesUsed || 0) / trial.usage.computeMinutesLimit);
  }
  if (trial.usage.storageLimitMB) {
    usagePercentages.push((trial.usage.storageUsedMB || 0) / trial.usage.storageLimitMB);
  }
  
  trial.usage.usagePercentage = Math.max(...usagePercentages) * 100;
  
  // Check if limits exceeded
  if (trial.usage.usagePercentage >= 100) {
    trial.status = 'expired';
  }
  
  trial.updatedAt = new Date().toISOString();
  return trial;
}

export function convertTrial(
  trialId: string,
  planId: string,
  planName: string
): ActiveTrial {
  const trial = activeTrials.get(trialId);
  if (!trial) {
    throw new Error(`Active trial ${trialId} not found`);
  }
  
  if (trial.status !== 'active' && trial.status !== 'expired') {
    throw new Error(`Trial ${trialId} cannot be converted`);
  }
  
  const attempt: ConversionAttempt = {
    id: randomUUID(),
    attemptedAt: new Date().toISOString(),
    planId,
    planName,
    status: 'successful',
  };
  
  trial.conversionAttempts.push(attempt);
  trial.status = 'converted';
  trial.updatedAt = new Date().toISOString();
  
  // Terminate sandbox if exists
  if (trial.sandboxEnvironment) {
    trial.sandboxEnvironment.status = 'terminated';
  }
  
  return trial;
}

export function cancelTrial(trialId: string, reason?: string): ActiveTrial {
  const trial = activeTrials.get(trialId);
  if (!trial) {
    throw new Error(`Active trial ${trialId} not found`);
  }
  
  trial.status = 'cancelled';
  trial.updatedAt = new Date().toISOString();
  
  if (trial.sandboxEnvironment) {
    trial.sandboxEnvironment.status = 'terminated';
  }
  
  return trial;
}

export function sendTrialNotification(
  trialId: string,
  timing: string,
  message: string
): NotificationRecord {
  const trial = activeTrials.get(trialId);
  if (!trial) {
    throw new Error(`Active trial ${trialId} not found`);
  }
  
  const notification: NotificationRecord = {
    id: randomUUID(),
    timing,
    sentAt: new Date().toISOString(),
    channel: 'email',
    status: 'sent',
    message,
  };
  
  trial.notificationsSent.push(notification);
  trial.updatedAt = new Date().toISOString();
  
  return notification;
}

export function getTrialAnalytics(organizationId: string): TrialAnalytics {
  const trials = Array.from(activeTrials.values()).filter(
    t => t.organizationId === organizationId
  );
  
  const totalTrials = trials.length;
  const activeTrials = trials.filter(t => t.status === 'active').length;
  const expiredTrials = trials.filter(t => t.status === 'expired').length;
  const convertedTrials = trials.filter(t => t.status === 'converted').length;
  
  const conversionRate = totalTrials > 0 ? (convertedTrials / totalTrials) * 100 : 0;
  
  const averageTrialDuration = trials.reduce((sum, t) => {
    const start = new Date(t.startDate).getTime();
    const end = new Date(t.endDate).getTime();
    return sum + (end - start) / (1000 * 60 * 60 * 24);
  }, 0) / totalTrials;
  
  const averageUsagePercentage = trials.reduce((sum, t) => sum + t.usage.usagePercentage, 0) / totalTrials;
  
  // Calculate top converting models
  const modelStats = new Map<string, { modelName: string; total: number; conversions: number; totalTime: number }>();
  trials.forEach(t => {
    const existing = modelStats.get(t.modelId) || { modelName: t.modelName, total: 0, conversions: 0, totalTime: 0 };
    existing.total += 1;
    if (t.status === 'converted') {
      existing.conversions += 1;
      const start = new Date(t.startDate).getTime();
      const converted = t.conversionAttempts.find(a => a.status === 'successful');
      if (converted) {
        existing.totalTime += (new Date(converted.attemptedAt).getTime() - start) / (1000 * 60 * 60 * 24);
      }
    }
    modelStats.set(t.modelId, existing);
  });
  
  const topConvertingModels = Array.from(modelStats.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: data.modelName,
      totalTrials: data.total,
      conversions: data.conversions,
      conversionRate: (data.conversions / data.total) * 100,
      averageTimeToConvert: data.conversions > 0 ? data.totalTime / data.conversions : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 5);
  
  // Conversion funnel
  const conversionFunnel: ConversionFunnelStage[] = [
    { stage: 'Trial Started', count: totalTrials, percentage: 100, dropoff: 0 },
    { stage: 'Used Model', count: trials.filter(t => t.usage.requestsUsed > 0).length, percentage: 0, dropoff: 0 },
    { stage: 'Reached 50% Usage', count: trials.filter(t => t.usage.usagePercentage >= 50).length, percentage: 0, dropoff: 0 },
    { stage: 'Converted', count: convertedTrials, percentage: 0, dropoff: 0 },
  ];
  
  conversionFunnel.forEach((stage, i) => {
    stage.percentage = (stage.count / totalTrials) * 100;
    if (i > 0) {
      stage.dropoff = conversionFunnel[i - 1].count - stage.count;
    }
  });
  
  // Calculate revenue from conversions (simplified)
  const revenueFromConversion = convertedTrials * 100; // Assume $100 per conversion
  
  return {
    totalTrials,
    activeTrials,
    expiredTrials,
    convertedTrials,
    conversionRate,
    averageTrialDuration,
    averageUsagePercentage,
    topConvertingModels,
    conversionFunnel,
    revenueFromConversion,
  };
}

export function terminateSandbox(sandboxId: string): SandboxEnvironment {
  const sandbox = sandboxEnvironments.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox environment ${sandboxId} not found`);
  }
  
  sandbox.status = 'terminated';
  return sandbox;
}
