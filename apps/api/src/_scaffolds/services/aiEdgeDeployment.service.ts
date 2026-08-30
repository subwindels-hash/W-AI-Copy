/**
 * Module 118: AI Edge Deployment Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides edge device deployment capabilities including model optimization for edge,
 * device management, OTA updates, resource monitoring, and offline inference support.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiEdgeDeployment');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EdgeDevice {
  id: string;
  organizationId: string;
  name: string;
  deviceType: DeviceType;
  status: DeviceStatus;
  hardware: DeviceHardware;
  connectivity: DeviceConnectivity;
  deployedModels: DeployedModel[];
  metrics: DeviceMetrics;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

export type DeviceType =
  | 'mobile'
  | 'embedded'
  | 'iot_sensor'
  | 'edge_server'
  | 'gpu_appliance'
  | 'custom';

export type DeviceStatus =
  | 'online'
  | 'offline'
  | 'updating'
  | 'error'
  | 'maintenance';

export interface DeviceHardware {
  cpu: string;
  cpuCores: number;
  memoryMB: number;
  storageMB: number;
  gpu?: string;
  gpuMemoryMB?: number;
  accelerator?: string;
  powerSource: 'battery' | 'plugged' | 'poe';
}

export interface DeviceConnectivity {
  type: 'wifi' | 'cellular' | 'ethernet' | 'satellite';
  bandwidth: number; // Mbps
  latency: number; // ms
  reliability: number; // 0-1
  lastSyncAt?: string;
}

export interface DeployedModel {
  id: string;
  modelId: string;
  modelVersion: string;
  deploymentId: string;
  status: 'deploying' | 'active' | 'updating' | 'failed' | 'stopped';
  optimization: EdgeOptimization;
  performance: EdgePerformance;
  deployedAt: string;
  lastInferenceAt?: string;
}

export interface EdgeOptimization {
  quantization?: string;
  pruning?: boolean;
  format: 'tflite' | 'onnx' | 'tensorrt' | 'coreml' | 'openvino';
  modelSizeMB: number;
  compressionRatio: number;
}

export interface EdgePerformance {
  inferenceTimeMs: number;
  throughputPerSecond: number;
  memoryUsageMB: number;
  cpuUsage: number;
  gpuUsage?: number;
  powerConsumptionW: number;
  accuracy: number;
}

export interface DeviceMetrics {
  uptime: number; // seconds
  totalInferences: number;
  averageLatencyMs: number;
  errorRate: number;
  batteryLevel?: number;
  temperature?: number;
  storageUsedMB: number;
  networkUsageMB: number;
}

export interface EdgeDeployment {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  targetDevices: string[];
  status: DeploymentStatus;
  strategy: DeploymentStrategy;
  optimization: EdgeOptimizationConfig;
  rollout: RolloutConfig;
  monitoring: MonitoringConfig;
  progress: DeploymentProgress;
  createdAt: string;
  completedAt?: string;
}

export type DeploymentStatus =
  | 'pending'
  | 'optimizing'
  | 'deploying'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface DeploymentStrategy {
  type: 'immediate' | 'gradual' | 'canary' | 'blue_green';
  batchSize?: number;
  pauseBetweenBatches?: number; // seconds
  validationRequired: boolean;
  automaticRollback: boolean;
}

export interface EdgeOptimizationConfig {
  targetFormat: string;
  quantization?: {
    enabled: boolean;
    precision: 'int8' | 'fp16';
    calibrationDataset?: string;
  };
  pruning?: {
    enabled: boolean;
    sparsity: number;
  };
  optimization: 'latency' | 'size' | 'balanced';
}

export interface RolloutConfig {
  maxConcurrentDeployments: number;
  timeout: number; // seconds
  retryAttempts: number;
  retryDelay: number; // seconds
}

export interface MonitoringConfig {
  healthCheckInterval: number; // seconds
  metricsCollectionInterval: number; // seconds
  alertThresholds: {
    latencyMs?: number;
    errorRate?: number;
    memoryUsagePercent?: number;
    cpuUsagePercent?: number;
  };
}

export interface DeploymentProgress {
  totalDevices: number;
  deployedDevices: number;
  failedDevices: number;
  pendingDevices: number;
  currentBatch: number;
  totalBatches: number;
  estimatedCompletionTime?: string;
}

export interface OTAUpdate {
  id: string;
  deploymentId: string;
  deviceIds: string[];
  fromVersion: string;
  toVersion: string;
  status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
}

export interface InferenceLog {
  id: string;
  deviceId: string;
  modelId: string;
  timestamp: string;
  inputHash: string;
  outputHash: string;
  latencyMs: number;
  confidence: number;
  offline: boolean;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const edgeDevices = new Map<string, EdgeDevice>();
const edgeDeployments = new Map<string, EdgeDeployment>();
const otaUpdates = new Map<string, OTAUpdate[]>();
const inferenceLogs = new Map<string, InferenceLog[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function registerEdgeDevice(params: {
  organizationId: string;
  name: string;
  deviceType: DeviceType;
  hardware: DeviceHardware;
  connectivity: DeviceConnectivity;
}): EdgeDevice {
  const now = new Date().toISOString();
  const id = randomUUID();

  const device: EdgeDevice = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    deviceType: params.deviceType,
    status: 'online',
    hardware: params.hardware,
    connectivity: params.connectivity,
    deployedModels: [],
    metrics: {
      uptime: 0,
      totalInferences: 0,
      averageLatencyMs: 0,
      errorRate: 0,
      storageUsedMB: 0,
      networkUsageMB: 0,
    },
    lastHeartbeat: now,
    createdAt: now,
    updatedAt: now,
  };

  edgeDevices.set(id, device);
  inferenceLogs.set(id, []);
  otaUpdates.set(id, []);

  return device;
}

export function getEdgeDevice(id: string): EdgeDevice | undefined {
  return edgeDevices.get(id);
}

export function listEdgeDevices(
  organizationId: string,
  filters?: { deviceType?: DeviceType; status?: DeviceStatus; modelId?: string }
): EdgeDevice[] {
  let result = Array.from(edgeDevices.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.deviceType) result = result.filter(d => d.deviceType === filters.deviceType);
  if (filters?.status) result = result.filter(d => d.status === filters.status);
  if (filters?.modelId) result = result.filter(d => d.deployedModels.some(m => m.modelId === filters.modelId));

  return result.sort((a, b) => b.lastHeartbeat.localeCompare(a.lastHeartbeat));
}

export function updateDeviceHeartbeat(deviceId: string, metrics?: Partial<DeviceMetrics>): EdgeDevice {
  const device = edgeDevices.get(deviceId);
  if (!device) throw new Error(`Edge device ${deviceId} not found`);

  device.lastHeartbeat = new Date().toISOString();
  device.status = 'online';

  if (metrics) {
    Object.assign(device.metrics, metrics);
  }

  device.updatedAt = new Date().toISOString();
  return device;
}

export function createEdgeDeployment(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  targetDevices: string[];
  strategy?: Partial<DeploymentStrategy>;
  optimization?: Partial<EdgeOptimizationConfig>;
  rollout?: Partial<RolloutConfig>;
  monitoring?: Partial<MonitoringConfig>;
}): EdgeDeployment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultStrategy: DeploymentStrategy = {
    type: 'gradual',
    batchSize: 10,
    pauseBetweenBatches: 60,
    validationRequired: true,
    automaticRollback: true,
  };

  const defaultOptimization: EdgeOptimizationConfig = {
    targetFormat: 'tflite',
    quantization: { enabled: true, precision: 'int8' },
    pruning: { enabled: false, sparsity: 0.5 },
    optimization: 'balanced',
  };

  const defaultRollout: RolloutConfig = {
    maxConcurrentDeployments: 5,
    timeout: 3600,
    retryAttempts: 3,
    retryDelay: 60,
  };

  const defaultMonitoring: MonitoringConfig = {
    healthCheckInterval: 30,
    metricsCollectionInterval: 60,
    alertThresholds: {
      latencyMs: 100,
      errorRate: 0.05,
      memoryUsagePercent: 80,
      cpuUsagePercent: 90,
    },
  };

  const deployment: EdgeDeployment = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    targetDevices: params.targetDevices,
    status: 'pending',
    strategy: { ...defaultStrategy, ...params.strategy },
    optimization: { ...defaultOptimization, ...params.optimization },
    rollout: { ...defaultRollout, ...params.rollout },
    monitoring: { ...defaultMonitoring, ...params.monitoring },
    progress: {
      totalDevices: params.targetDevices.length,
      deployedDevices: 0,
      failedDevices: 0,
      pendingDevices: params.targetDevices.length,
      currentBatch: 0,
      totalBatches: Math.ceil(params.targetDevices.length / (params.strategy?.batchSize || 10)),
    },
    createdAt: now,
  };

  edgeDeployments.set(id, deployment);

  // Start deployment
  setTimeout(() => {
    performDeployment(deployment);
  }, 100);

  return deployment;
}

function performDeployment(deployment: EdgeDeployment): void {
  deployment.status = 'optimizing';

  // Simulate model optimization
  setTimeout(() => {
    deployment.status = 'deploying';

    const batchSize = deployment.strategy.batchSize || 10;
    let deployed = 0;

    for (const deviceId of deployment.targetDevices) {
      const device = edgeDevices.get(deviceId);
      if (!device) continue;

      // Simulate deployment
      const success = _rng.next() > 0.1; // 90% success rate

      if (success) {
        const deployedModel: DeployedModel = {
          id: randomUUID(),
          modelId: deployment.modelId,
          modelVersion: deployment.modelVersion,
          deploymentId: deployment.id,
          status: 'active',
          optimization: {
            format: deployment.optimization.targetFormat as any,
            modelSizeMB: 50,
            compressionRatio: 0.75,
          },
          performance: {
            inferenceTimeMs: 30,
            throughputPerSecond: 33,
            memoryUsageMB: 100,
            cpuUsage: 40,
            powerConsumptionW: 5,
            accuracy: 0.92,
          },
          deployedAt: new Date().toISOString(),
        };

        device.deployedModels.push(deployedModel);
        deployed++;
      }

      deployment.progress.deployedDevices = deployed;
      deployment.progress.failedDevices = deployment.targetDevices.length - deployed;
      deployment.progress.pendingDevices = deployment.targetDevices.length - deployed;

      if (deployed % batchSize === 0) {
        deployment.progress.currentBatch++;
      }
    }

    deployment.status = deployed === deployment.targetDevices.length ? 'completed' : 'failed';
    deployment.completedAt = new Date().toISOString();
  }, 500);
}

export function getEdgeDeployment(id: string): EdgeDeployment | undefined {
  return edgeDeployments.get(id);
}

export function listEdgeDeployments(
  organizationId: string,
  filters?: { modelId?: string; status?: DeploymentStatus }
): EdgeDeployment[] {
  let result = Array.from(edgeDeployments.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(d => d.modelId === filters.modelId);
  if (filters?.status) result = result.filter(d => d.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function rollbackDeployment(deploymentId: string): EdgeDeployment {
  const deployment = edgeDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Edge deployment ${deploymentId} not found`);

  // Remove deployed models from devices
  for (const deviceId of deployment.targetDevices) {
    const device = edgeDevices.get(deviceId);
    if (device) {
      device.deployedModels = device.deployedModels.filter(m => m.deploymentId !== deploymentId);
    }
  }

  deployment.status = 'rolled_back';
  deployment.completedAt = new Date().toISOString();

  return deployment;
}

export function logInference(params: {
  deviceId: string;
  modelId: string;
  latencyMs: number;
  confidence: number;
  offline?: boolean;
}): InferenceLog {
  const device = edgeDevices.get(params.deviceId);
  if (!device) throw new Error(`Edge device ${params.deviceId} not found`);

  const log: InferenceLog = {
    id: randomUUID(),
    deviceId: params.deviceId,
    modelId: params.modelId,
    timestamp: new Date().toISOString(),
    inputHash: randomUUID(),
    outputHash: randomUUID(),
    latencyMs: params.latencyMs,
    confidence: params.confidence,
    offline: params.offline || false,
  };

  const logs = inferenceLogs.get(params.deviceId) || [];
  logs.push(log);
  inferenceLogs.set(params.deviceId, logs);

  // Update device metrics
  device.metrics.totalInferences++;
  device.metrics.averageLatencyMs = 
    (device.metrics.averageLatencyMs * (device.metrics.totalInferences - 1) + params.latencyMs) / 
    device.metrics.totalInferences;
  device.lastInferenceAt = log.timestamp;

  // Update deployed model metrics
  const deployedModel = device.deployedModels.find(m => m.modelId === params.modelId);
  if (deployedModel) {
    deployedModel.lastInferenceAt = log.timestamp;
    deployedModel.performance.inferenceTimeMs = params.latencyMs;
  }

  return log;
}

export function getInferenceLogs(
  deviceId: string,
  filters?: { modelId?: string; limit?: number }
): InferenceLog[] {
  let logs = inferenceLogs.get(deviceId) || [];

  if (filters?.modelId) logs = logs.filter(l => l.modelId === filters.modelId);

  logs = logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) logs = logs.slice(0, filters.limit);

  return logs;
}

export function getDeviceAnalytics(deviceId: string): {
  totalInferences: number;
  averageLatency: number;
  p95Latency: number;
  errorRate: number;
  uptime: number;
  modelUsage: Record<string, number>;
} {
  const device = edgeDevices.get(deviceId);
  if (!device) throw new Error(`Edge device ${deviceId} not found`);

  const logs = inferenceLogs.get(deviceId) || [];
  const latencies = logs.map(l => l.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);

  const modelUsage: Record<string, number> = {};
  logs.forEach(log => {
    modelUsage[log.modelId] = (modelUsage[log.modelId] || 0) + 1;
  });

  return {
    totalInferences: device.metrics.totalInferences,
    averageLatency: device.metrics.averageLatencyMs,
    p95Latency: latencies[p95Index] || 0,
    errorRate: device.metrics.errorRate,
    uptime: device.metrics.uptime,
    modelUsage,
  };
}

export function createOTAUpdate(params: {
  deploymentId: string;
  deviceIds: string[];
  fromVersion: string;
  toVersion: string;
}): OTAUpdate {
  const now = new Date().toISOString();
  const id = randomUUID();

  const update: OTAUpdate = {
    id,
    deploymentId: params.deploymentId,
    deviceIds: params.deviceIds,
    fromVersion: params.fromVersion,
    toVersion: params.toVersion,
    status: 'pending',
    progress: 0,
    createdAt: now,
  };

  for (const deviceId of params.deviceIds) {
    const updates = otaUpdates.get(deviceId) || [];
    updates.push(update);
    otaUpdates.set(deviceId, updates);
  }

  return update;
}

export function getOTAUpdates(deviceId: string): OTAUpdate[] {
  return otaUpdates.get(deviceId) || [];
}
