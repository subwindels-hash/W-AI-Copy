/**
 * Module 30: IoT Device Management Service
 *
 * Manages IoT device provisioning, registration, authentication, device shadows,
 * OTA firmware updates, command & control, fleet management, and device lifecycle.
 *
 * Phase 1 — Critical Gap: Enterprise IoT device infrastructure
 */

import { randomUUID, createHash, createHmac } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceStatus =
  | "provisioned" | "active" | "inactive" | "suspended"
  | "decommissioned" | "error" | "updating";

export type DeviceAuthMethod = "x509" | "api-key" | "jwt" | "symmetric-key" | "oauth2";

export type DeviceProtocol = "mqtt" | "coap" | "amqp" | "http" | "https" | "websocket" | "lorawan" | "zigbee" | "ble" | "custom";

export type DeviceCategory =
  | "sensor" | "actuator" | "gateway" | "controller"
  | "tracker" | "camera" | "meter" | "wearable" | "industrial" | "custom";

export type CommandStatus = "pending" | "sent" | "acknowledged" | "completed" | "failed" | "timeout" | "cancelled";

export type FirmwareUpdateStatus = "pending" | "downloading" | "verifying" | "installing" | "completed" | "failed" | "rolled-back";

export interface IoTDevice {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: DeviceCategory;
  protocol: DeviceProtocol;
  status: DeviceStatus;
  authMethod: DeviceAuthMethod;
  credentials: {
    apiKey?: string;
    apiSecret?: string;
    certificateFingerprint?: string;
    symmetricKey?: string;
  };
  deviceId: string; // Unique hardware identifier (MAC, serial, etc.)
  modelId: string;
  manufacturer: string;
  firmwareVersion: string;
  hardwareVersion: string;
  capabilities: string[];
  tags: string[];
  groupId?: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    address?: string;
  };
  connectivity: {
    lastConnectedAt?: string;
    lastDisconnectedAt?: string;
    connectionCount: number;
    ipAddress?: string;
    signalStrength?: number; // dBm
    protocol: DeviceProtocol;
    endpoint?: string;
  };
  metadata: Record<string, unknown>;
  provisionedAt: string;
  activatedAt?: string;
  lastTelemetryAt?: string;
  updatedAt: string;
}

export interface DeviceShadow {
  deviceId: string;
  desired: Record<string, unknown>;
  reported: Record<string, unknown>;
  delta: Record<string, unknown>; // Differences between desired and reported
  metadata: {
    desired: Record<string, { timestamp: string; source: string }>;
    reported: Record<string, { timestamp: string; source: string }>;
  };
  version: number;
  updatedAt: string;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  requestedBy: string;
  requestedAt: string;
  sentAt?: string;
  acknowledgedAt?: string;
  completedAt?: string;
  failedAt?: string;
  result?: Record<string, unknown>;
  errorMessage?: string;
  timeoutMs: number;
  retryCount: number;
  maxRetries: number;
}

export interface FirmwareUpdate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  version: string;
  modelId: string;
  firmwareUrl: string;
  firmwareHash: string;
  firmwareSizeBytes: number;
  releaseNotes: string;
  minVersionRequired?: string;
  mandatory: boolean;
  rolloutStrategy: "immediate" | "gradual" | "scheduled";
  rolloutPercentage: number;
  status: "draft" | "published" | "rolling-out" | "completed" | "cancelled";
  targetDeviceIds: string[];
  deviceStatuses: Record<string, FirmwareUpdateStatus>;
  scheduledAt?: string;
  publishedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  deviceIds: string[];
  tags: string[];
  policyOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  eventType: "connected" | "disconnected" | "error" | "command" | "shadow-update" | "firmware" | "alert" | "provisioned" | "decommissioned";
  severity: "info" | "warning" | "error" | "critical";
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const devices = new Map<string, IoTDevice>();
const shadows = new Map<string, DeviceShadow>();
const commands: DeviceCommand[] = [];
const firmwareUpdates = new Map<string, FirmwareUpdate>();
const deviceGroups = new Map<string, DeviceGroup>();
const deviceEvents: DeviceEvent[] = [];

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Provision a new IoT device
 */
export async function provisionDevice(params: {
  organizationId: string;
  name: string;
  description?: string;
  category: DeviceCategory;
  protocol: DeviceProtocol;
  authMethod: DeviceAuthMethod;
  deviceId: string;
  modelId: string;
  manufacturer: string;
  firmwareVersion: string;
  hardwareVersion: string;
  capabilities?: string[];
  tags?: string[];
  groupId?: string;
  location?: IoTDevice["location"];
  metadata?: Record<string, unknown>;
}): Promise<IoTDevice> {
  const now = new Date().toISOString();
  
  // Generate credentials based on auth method
  const credentials = generateCredentials(params.authMethod);

  const device: IoTDevice = {
    id: `iot_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    category: params.category,
    protocol: params.protocol,
    status: "provisioned",
    authMethod: params.authMethod,
    credentials,
    deviceId: params.deviceId,
    modelId: params.modelId,
    manufacturer: params.manufacturer,
    firmwareVersion: params.firmwareVersion,
    hardwareVersion: params.hardwareVersion,
    capabilities: params.capabilities ?? [],
    tags: params.tags ?? [],
    groupId: params.groupId,
    location: params.location,
    connectivity: {
      connectionCount: 0,
      protocol: params.protocol,
    },
    metadata: params.metadata ?? {},
    provisionedAt: now,
    updatedAt: now,
  };

  devices.set(device.id, device);

  // Initialize device shadow
  const shadow: DeviceShadow = {
    deviceId: device.id,
    desired: {},
    reported: {},
    delta: {},
    metadata: { desired: {}, reported: {} },
    version: 1,
    updatedAt: now,
  };
  shadows.set(device.id, shadow);

  // Record event
  recordEvent(device.id, "provisioned", "info", {
    name: device.name,
    category: device.category,
    protocol: device.protocol,
    authMethod: device.authMethod,
  });

  return device;
}

/**
 * Get a device by ID
 */
export async function getDevice(deviceId: string): Promise<IoTDevice | null> {
  return devices.get(deviceId) ?? null;
}

/**
 * List all devices for an organization
 */
export async function listDevices(organizationId: string, filters?: {
  category?: DeviceCategory;
  status?: DeviceStatus;
  protocol?: DeviceProtocol;
  groupId?: string;
  tag?: string;
  modelId?: string;
}): Promise<IoTDevice[]> {
  let result = Array.from(devices.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.category) result = result.filter(d => d.category === filters.category);
  if (filters?.status) result = result.filter(d => d.status === filters.status);
  if (filters?.protocol) result = result.filter(d => d.protocol === filters.protocol);
  if (filters?.groupId) result = result.filter(d => d.groupId === filters.groupId);
  if (filters?.tag) result = result.filter(d => d.tags.includes(filters.tag!));
  if (filters?.modelId) result = result.filter(d => d.modelId === filters.modelId);

  return result.sort((a, b) => b.provisionedAt.localeCompare(a.provisionedAt));
}

/**
 * Authenticate a device connection
 */
export async function authenticateDevice(
  deviceId: string,
  credentials: { apiKey?: string; apiSecret?: string; certificateFingerprint?: string; token?: string }
): Promise<{ authenticated: boolean; device?: IoTDevice; reason?: string }> {
  const device = devices.get(deviceId);
  if (!device) return { authenticated: false, reason: "Device not found" };

  if (device.status === "suspended") return { authenticated: false, device, reason: "Device is suspended" };
  if (device.status === "decommissioned") return { authenticated: false, device, reason: "Device is decommissioned" };

  switch (device.authMethod) {
    case "api-key": {
      if (credentials.apiKey !== device.credentials.apiKey) {
        return { authenticated: false, device, reason: "Invalid API key" };
      }
      if (credentials.apiSecret && credentials.apiSecret !== device.credentials.apiSecret) {
        return { authenticated: false, device, reason: "Invalid API secret" };
      }
      break;
    }
    case "x509": {
      if (credentials.certificateFingerprint !== device.credentials.certificateFingerprint) {
        return { authenticated: false, device, reason: "Certificate fingerprint mismatch" };
      }
      break;
    }
    case "symmetric-key": {
      if (!credentials.token || !device.credentials.symmetricKey) {
        return { authenticated: false, device, reason: "Missing token or key" };
      }
      // Validate HMAC token
      const expectedToken = createHmac("sha256", device.credentials.symmetricKey)
        .update(deviceId)
        .digest("hex");
      if (credentials.token !== expectedToken) {
        return { authenticated: false, device, reason: "Invalid HMAC token" };
      }
      break;
    }
    case "jwt":
    case "oauth2": {
      // Simplified JWT/OAuth validation
      if (!credentials.token) {
        return { authenticated: false, device, reason: "Missing token" };
      }
      break;
    }
  }

  // Update connection state
  const now = new Date().toISOString();
  device.status = "active";
  device.connectivity.lastConnectedAt = now;
  device.connectivity.connectionCount++;
  device.activatedAt = device.activatedAt ?? now;
  device.updatedAt = now;
  devices.set(deviceId, device);

  recordEvent(deviceId, "connected", "info", {
    protocol: device.protocol,
    connectionCount: device.connectivity.connectionCount,
  });

  return { authenticated: true, device };
}

/**
 * Record device disconnection
 */
export async function disconnectDevice(deviceId: string, reason?: string): Promise<void> {
  const device = devices.get(deviceId);
  if (!device) return;

  const now = new Date().toISOString();
  device.connectivity.lastDisconnectedAt = now;
  device.updatedAt = now;
  
  if (device.status === "active") {
    device.status = "inactive";
  }
  devices.set(deviceId, device);

  recordEvent(deviceId, "disconnected", "info", { reason: reason ?? "normal" });
}

/**
 * Get device shadow (desired/reported state)
 */
export async function getDeviceShadow(deviceId: string): Promise<DeviceShadow | null> {
  return shadows.get(deviceId) ?? null;
}

/**
 * Update device shadow desired state
 */
export async function updateDesiredState(
  deviceId: string,
  desired: Record<string, unknown>,
  source: string = "cloud"
): Promise<DeviceShadow | null> {
  const shadow = shadows.get(deviceId);
  if (!shadow) return null;

  const now = new Date().toISOString();
  
  // Merge desired state
  shadow.desired = { ...shadow.desired, ...desired };
  
  // Update metadata
  for (const key of Object.keys(desired)) {
    shadow.metadata.desired[key] = { timestamp: now, source };
  }

  // Compute delta
  shadow.delta = computeDelta(shadow.desired, shadow.reported);
  
  shadow.version++;
  shadow.updatedAt = now;
  shadows.set(deviceId, shadow);

  recordEvent(deviceId, "shadow-update", "info", {
    type: "desired",
    keys: Object.keys(desired),
    version: shadow.version,
  });

  return shadow;
}

/**
 * Update device shadow reported state (from device)
 */
export async function updateReportedState(
  deviceId: string,
  reported: Record<string, unknown>
): Promise<DeviceShadow | null> {
  const shadow = shadows.get(deviceId);
  if (!shadow) return null;

  const now = new Date().toISOString();
  
  // Merge reported state
  shadow.reported = { ...shadow.reported, ...reported };
  
  // Update metadata
  for (const key of Object.keys(reported)) {
    shadow.metadata.reported[key] = { timestamp: now, source: "device" };
  }

  // Recompute delta
  shadow.delta = computeDelta(shadow.desired, shadow.reported);
  
  shadow.version++;
  shadow.updatedAt = now;
  shadows.set(deviceId, shadow);

  recordEvent(deviceId, "shadow-update", "info", {
    type: "reported",
    keys: Object.keys(reported),
    version: shadow.version,
  });

  return shadow;
}

/**
 * Send a command to a device
 */
export async function sendDeviceCommand(params: {
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<DeviceCommand> {
  const device = devices.get(params.deviceId);
  if (!device) throw new Error(`Device ${params.deviceId} not found`);

  const now = new Date().toISOString();
  const command: DeviceCommand = {
    id: `cmd_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    deviceId: params.deviceId,
    name: params.name,
    payload: params.payload,
    status: device.status === "active" ? "sent" : "pending",
    requestedBy: params.requestedBy,
    requestedAt: now,
    sentAt: device.status === "active" ? now : undefined,
    timeoutMs: params.timeoutMs ?? 30000,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 3,
  };

  commands.push(command);

  recordEvent(params.deviceId, "command", "info", {
    commandId: command.id,
    commandName: params.name,
    status: command.status,
  });

  return command;
}

/**
 * Update command status (called when device acknowledges or completes)
 */
export async function updateCommandStatus(
  commandId: string,
  status: CommandStatus,
  result?: Record<string, unknown>,
  errorMessage?: string
): Promise<DeviceCommand | null> {
  const index = commands.findIndex(c => c.id === commandId);
  if (index === -1) return null;

  const now = new Date().toISOString();
  const command = { ...commands[index] };
  command.status = status;

  switch (status) {
    case "acknowledged":
      command.acknowledgedAt = now;
      break;
    case "completed":
      command.completedAt = now;
      command.result = result;
      break;
    case "failed":
      command.failedAt = now;
      command.errorMessage = errorMessage;
      break;
    case "timeout":
      command.failedAt = now;
      command.errorMessage = errorMessage ?? "Command timed out";
      // Auto-retry if retries remaining
      if (command.retryCount < command.maxRetries) {
        command.retryCount++;
        command.status = "pending";
        command.failedAt = undefined;
        command.errorMessage = undefined;
      }
      break;
  }

  commands[index] = command;
  return command;
}

/**
 * Get commands for a device
 */
export async function getDeviceCommands(
  deviceId: string,
  status?: CommandStatus
): Promise<DeviceCommand[]> {
  let result = commands.filter(c => c.deviceId === deviceId);
  if (status) result = result.filter(c => c.status === status);
  return result.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/**
 * Create a firmware update
 */
export async function createFirmwareUpdate(params: {
  organizationId: string;
  name: string;
  description: string;
  version: string;
  modelId: string;
  firmwareUrl: string;
  firmwareSizeBytes: number;
  releaseNotes?: string;
  minVersionRequired?: string;
  mandatory?: boolean;
  rolloutStrategy?: FirmwareUpdate["rolloutStrategy"];
  targetDeviceIds?: string[];
  scheduledAt?: string;
  createdBy: string;
}): Promise<FirmwareUpdate> {
  const now = new Date().toISOString();
  
  // Find target devices if not specified (all devices of this model)
  let targetIds = params.targetDeviceIds;
  if (!targetIds) {
    targetIds = Array.from(devices.values())
      .filter(d => d.organizationId === params.organizationId && d.modelId === params.modelId)
      .map(d => d.id);
  }

  const firmwareHash = createHash("sha256")
    .update(`${params.firmwareUrl}-${params.version}-${now}`)
    .digest("hex");

  const update: FirmwareUpdate = {
    id: `fw_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    version: params.version,
    modelId: params.modelId,
    firmwareUrl: params.firmwareUrl,
    firmwareHash,
    firmwareSizeBytes: params.firmwareSizeBytes,
    releaseNotes: params.releaseNotes ?? "",
    minVersionRequired: params.minVersionRequired,
    mandatory: params.mandatory ?? false,
    rolloutStrategy: params.rolloutStrategy ?? "gradual",
    rolloutPercentage: 0,
    status: "draft",
    targetDeviceIds: targetIds,
    deviceStatuses: {},
    scheduledAt: params.scheduledAt,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Initialize device statuses
  for (const deviceId of targetIds) {
    update.deviceStatuses[deviceId] = "pending";
  }

  firmwareUpdates.set(update.id, update);
  return update;
}

/**
 * Publish firmware update (start rollout)
 */
export async function publishFirmwareUpdate(firmwareId: string): Promise<FirmwareUpdate | null> {
  const update = firmwareUpdates.get(firmwareId);
  if (!update) return null;

  const now = new Date().toISOString();
  update.status = "rolling-out";
  update.publishedAt = now;
  update.updatedAt = now;
  firmwareUpdates.set(firmwareId, update);

  // Send firmware update commands to target devices
  for (const deviceId of update.targetDeviceIds) {
    const device = devices.get(deviceId);
    if (!device || device.status !== "active") continue;

    // Check minimum version requirement
    if (update.minVersionRequired && compareVersions(device.firmwareVersion, update.minVersionRequired) < 0) {
      update.deviceStatuses[deviceId] = "failed";
      continue;
    }

    await sendDeviceCommand({
      deviceId,
      name: "ota_update",
      payload: {
        firmwareId: update.id,
        version: update.version,
        url: update.firmwareUrl,
        hash: update.firmwareHash,
        size: update.firmwareSizeBytes,
      },
      requestedBy: update.createdBy,
      timeoutMs: 600000, // 10 minutes
    });

    update.deviceStatuses[deviceId] = "downloading";
    recordEvent(deviceId, "firmware", "info", {
      firmwareId: update.id,
      version: update.version,
      action: "update_started",
    });
  }

  firmwareUpdates.set(firmwareId, update);
  return update;
}

/**
 * Report firmware update status for a device
 */
export async function reportFirmwareUpdateStatus(
  firmwareId: string,
  deviceId: string,
  status: FirmwareUpdateStatus,
  errorMessage?: string
): Promise<FirmwareUpdate | null> {
  const update = firmwareUpdates.get(firmwareId);
  if (!update) return null;

  update.deviceStatuses[deviceId] = status;
  update.updatedAt = new Date().toISOString();

  // If completed, update device firmware version
  if (status === "completed") {
    const device = devices.get(deviceId);
    if (device) {
      device.firmwareVersion = update.version;
      device.updatedAt = update.updatedAt;
      devices.set(deviceId, device);
    }
  }

  // Check if all devices are done
  const allDone = Object.values(update.deviceStatuses).every(
    s => s === "completed" || s === "failed" || s === "rolled-back"
  );
  if (allDone) {
    update.status = "completed";
    update.completedAt = update.updatedAt;
  }

  // Update rollout percentage
  const completedCount = Object.values(update.deviceStatuses).filter(s => s === "completed").length;
  update.rolloutPercentage = Math.round((completedCount / update.targetDeviceIds.length) * 100);

  firmwareUpdates.set(firmwareId, update);

  recordEvent(deviceId, "firmware", status === "completed" ? "info" : status === "failed" ? "error" : "info", {
    firmwareId,
    version: update.version,
    status,
    errorMessage,
  });

  return update;
}

/**
 * Get firmware update by ID
 */
export async function getFirmwareUpdate(firmwareId: string): Promise<FirmwareUpdate | null> {
  return firmwareUpdates.get(firmwareId) ?? null;
}

/**
 * List firmware updates for an organization
 */
export async function listFirmwareUpdates(organizationId: string): Promise<FirmwareUpdate[]> {
  return Array.from(firmwareUpdates.values())
    .filter(f => f.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Create a device group
 */
export async function createDeviceGroup(params: {
  organizationId: string;
  name: string;
  description?: string;
  deviceIds?: string[];
  tags?: string[];
}): Promise<DeviceGroup> {
  const now = new Date().toISOString();
  const group: DeviceGroup = {
    id: `grp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    deviceIds: params.deviceIds ?? [],
    tags: params.tags ?? [],
    policyOverrides: {},
    createdAt: now,
    updatedAt: now,
  };

  deviceGroups.set(group.id, group);

  // Update device group assignments
  for (const deviceId of group.deviceIds) {
    const device = devices.get(deviceId);
    if (device) {
      device.groupId = group.id;
      devices.set(deviceId, device);
    }
  }

  return group;
}

/**
 * Add devices to a group
 */
export async function addDevicesToGroup(groupId: string, deviceIds: string[]): Promise<DeviceGroup | null> {
  const group = deviceGroups.get(groupId);
  if (!group) return null;

  const newIds = deviceIds.filter(id => !group.deviceIds.includes(id));
  group.deviceIds.push(...newIds);
  group.updatedAt = new Date().toISOString();
  deviceGroups.set(groupId, group);

  for (const deviceId of newIds) {
    const device = devices.get(deviceId);
    if (device) {
      device.groupId = groupId;
      devices.set(deviceId, device);
    }
  }

  return group;
}

/**
 * List device groups
 */
export async function listDeviceGroups(organizationId: string): Promise<DeviceGroup[]> {
  return Array.from(deviceGroups.values())
    .filter(g => g.organizationId === organizationId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Decommission a device
 */
export async function decommissionDevice(deviceId: string, reason?: string): Promise<IoTDevice | null> {
  const device = devices.get(deviceId);
  if (!device) return null;

  const now = new Date().toISOString();
  device.status = "decommissioned";
  device.updatedAt = now;
  devices.set(deviceId, device);

  recordEvent(deviceId, "decommissioned", "info", { reason: reason ?? "manual" });
  return device;
}

/**
 * Suspend a device
 */
export async function suspendDevice(deviceId: string, reason?: string): Promise<IoTDevice | null> {
  const device = devices.get(deviceId);
  if (!device) return null;

  device.status = "suspended";
  device.updatedAt = new Date().toISOString();
  devices.set(deviceId, device);

  recordEvent(deviceId, "error", "warning", { type: "suspended", reason: reason ?? "manual" });
  return device;
}

/**
 * Get device events
 */
export async function getDeviceEvents(
  deviceId: string,
  filters?: { eventType?: DeviceEvent["eventType"]; severity?: DeviceEvent["severity"]; limit?: number }
): Promise<DeviceEvent[]> {
  let result = deviceEvents.filter(e => e.deviceId === deviceId);
  if (filters?.eventType) result = result.filter(e => e.eventType === filters.eventType);
  if (filters?.severity) result = result.filter(e => e.severity === filters.severity);
  return result
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get IoT device statistics for an organization
 */
export async function getIoTDeviceStats(organizationId: string): Promise<{
  totalDevices: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byProtocol: Record<string, number>;
  byModel: Record<string, number>;
  activeDevices: number;
  inactiveDevices: number;
  devicesWithPendingCommands: number;
  devicesWithFirmwareUpdates: number;
  totalGroups: number;
  totalCommands: number;
  commandSuccessRate: number;
  averageConnectionCount: number;
}> {
  const allDevices = Array.from(devices.values()).filter(
    d => d.organizationId === organizationId
  );
  const allGroups = Array.from(deviceGroups.values()).filter(
    g => g.organizationId === organizationId
  );

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byProtocol: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let activeCount = 0;
  let inactiveCount = 0;
  let totalConnections = 0;

  for (const d of allDevices) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
    byProtocol[d.protocol] = (byProtocol[d.protocol] || 0) + 1;
    byModel[d.modelId] = (byModel[d.modelId] || 0) + 1;
    if (d.status === "active") activeCount++;
    if (d.status === "inactive") inactiveCount++;
    totalConnections += d.connectivity.connectionCount;
  }

  const deviceCommands = commands.filter(c => allDevices.some(d => d.id === c.deviceId));
  const completedCommands = deviceCommands.filter(c => c.status === "completed").length;
  const totalFinishedCommands = deviceCommands.filter(
    c => c.status === "completed" || c.status === "failed" || c.status === "timeout"
  ).length;

  const devicesWithPendingCommands = new Set(
    deviceCommands
      .filter(c => c.status === "pending" || c.status === "sent")
      .map(c => c.deviceId)
  ).size;

  const devicesWithFirmwareUpdates = new Set(
    Array.from(firmwareUpdates.values())
      .filter(f => f.organizationId === organizationId && f.status === "rolling-out")
      .flatMap(f => f.targetDeviceIds)
  ).size;

  return {
    totalDevices: allDevices.length,
    byStatus,
    byCategory,
    byProtocol,
    byModel,
    activeDevices: activeCount,
    inactiveDevices: inactiveCount,
    devicesWithPendingCommands,
    devicesWithFirmwareUpdates,
    totalGroups: allGroups.length,
    totalCommands: deviceCommands.length,
    commandSuccessRate: totalFinishedCommands > 0
      ? Math.round((completedCommands / totalFinishedCommands) * 100)
      : 100,
    averageConnectionCount: allDevices.length > 0
      ? Math.round(totalConnections / allDevices.length)
      : 0,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateCredentials(authMethod: DeviceAuthMethod): IoTDevice["credentials"] {
  switch (authMethod) {
    case "api-key":
      return {
        apiKey: `ak_${randomUUID().replace(/-/g, "")}`,
        apiSecret: createHash("sha256").update(randomUUID()).digest("hex"),
      };
    case "x509":
      return {
        certificateFingerprint: createHash("sha256").update(randomUUID()).digest("hex"),
      };
    case "symmetric-key":
      return {
        symmetricKey: createHash("sha256").update(randomUUID()).digest("base64"),
      };
    case "jwt":
    case "oauth2":
    default:
      return {
        apiKey: `ak_${randomUUID().replace(/-/g, "")}`,
      };
  }
}

function computeDelta(
  desired: Record<string, unknown>,
  reported: Record<string, unknown>
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(reported[key]) !== JSON.stringify(value)) {
      delta[key] = value;
    }
  }
  return delta;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function recordEvent(
  deviceId: string,
  eventType: DeviceEvent["eventType"],
  severity: DeviceEvent["severity"],
  data: Record<string, unknown>
): void {
  deviceEvents.push({
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    deviceId,
    eventType,
    severity,
    data,
    timestamp: new Date().toISOString(),
  });
}
