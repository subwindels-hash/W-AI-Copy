/**
 * Session 57 — Enterprise Robotics & Physical Automation Platform (V8).
 * Session 155 — completion: real HTTP telemetry ingest, honest null averages,
 * connector health (MQTT never claimed connected), dedicated console.
 */
import { z } from "zod";

export const ROBOT_KINDS = [
  "industrial_arm", "warehouse_amr", "manufacturing_cell", "delivery_bot",
  "security_patrol", "agricultural", "healthcare", "autonomous_vehicle",
  "drone", "smart_building", "iot_gateway", "plc", "scada", "edge_controller",
] as const;
export type RobotKind = typeof ROBOT_KINDS[number];

export const ROBOT_STATUS = ["idle", "active", "paused", "error", "maintenance", "offline", "simulating"] as const;
export type RobotStatus = typeof ROBOT_STATUS[number];

export const ROBOT_COMMANDS = ["start", "pause", "stop", "reset", "maintenance"] as const;
export type RobotCommand = typeof ROBOT_COMMANDS[number];

export const TELEMETRY_SOURCES = ["device_reported", "operator_entered", "demo_seed"] as const;
export type TelemetrySource = typeof TELEMETRY_SOURCES[number];

export const COMMAND_DISPATCH = ["local_state_only", "dispatched"] as const;
export type CommandDispatch = typeof COMMAND_DISPATCH[number];

export const MAINTENANCE_KINDS = ["preventive", "corrective", "calibration", "firmware"] as const;
export type MaintenanceKind = typeof MAINTENANCE_KINDS[number];

export const MAINTENANCE_STATUS = ["scheduled", "in_progress", "completed", "missed"] as const;
export type MaintenanceStatus = typeof MAINTENANCE_STATUS[number];

/** A reading is live only if a device reported it within this window. */
export const ROBOT_TELEMETRY_STALE_MS = 5 * 60 * 1000;
export const ROBOT_TELEMETRY_CAP = 200;

export interface Robot {
  id: string;
  organizationId: string;
  name: string;
  kind: RobotKind;
  serial?: string;
  site: string;
  zone?: string;
  firmwareVersion: string;
  voicePackId?: string;
  status: RobotStatus;
  batteryPct?: number;
  cpuPct: number;
  memPct: number;
  tempC?: number;
  uptimeSec: number;
  tasksCompleted: number;
  errorsToday: number;
  lastMaintenanceAt?: string;
  nextMaintenanceAt?: string;
  twinId?: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last device-reported reading, if any. */
  lastTelemetryAt?: string;
  telemetrySource?: TelemetrySource;
  lastCommandDispatch?: CommandDispatch;
  /** Computed at read time: true when no live device reading is in the stale window. */
  telemetryStale?: boolean;
}

export interface FleetTelemetry {
  robotId: string;
  organizationId?: string;
  ts: string;
  source: TelemetrySource;
  speed?: number;
  x?: number; y?: number; z?: number;
  payloadKg?: number;
  batteryPct?: number;
  cpuPct?: number;
  memPct?: number;
  tempC?: number;
  uptimeSec?: number;
}

export interface MaintenanceWindow {
  id: string;
  organizationId?: string;
  robotId: string;
  scheduledAt: string;
  durationMin: number;
  kind: MaintenanceKind;
  technician?: string;
  status: MaintenanceStatus;
}

export interface PredictiveMaintAlert {
  id: string;
  organizationId?: string;
  robotId: string;
  component: string;
  riskPct: number;
  recommendation: string;
  at: string;
  status?: "open" | "acknowledged";
  acknowledgedAt?: string;
}

export interface RoboticsConnector {
  id: string;
  name: string;
  /** Honest status — never "connected" unless a live session exists. */
  status: "ready" | "not_configured" | "configured_not_connected";
  requiresConfig: boolean;
  note: string;
}

export interface RoboticsDashboard {
  totalRobots: number;
  active: number;
  idle: number;
  error: number;
  maintenance: number;
  offline: number;
  /** Average of device-reported battery readings. Null when none exist. */
  avgBatteryPct: number | null;
  tasksCompletedToday: number;
  errorsToday: number;
  sites: number;
  /** Average of device-reported CPU readings. Null when none exist. */
  avgCpuPct: number | null;
  predictiveAlerts: number;
  byKind: Array<{ kind: RobotKind; count: number }>;
  recent: Robot[];
  alerts: PredictiveMaintAlert[];
  measuredRobots: number;
  connectors: RoboticsConnector[];
  provenance: {
    avgBatteryPct: string;
    avgCpuPct: string;
    tasksCompletedToday: string;
    mqtt: string;
  };
}

export const CreateRobotSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(ROBOT_KINDS),
  site: z.string().min(2),
  zone: z.string().optional(),
  serial: z.string().optional(),
});
export type CreateRobotInput = z.infer<typeof CreateRobotSchema>;

export const UpdateRobotSchema = z.object({
  name: z.string().min(2).optional(),
  site: z.string().min(2).optional(),
  zone: z.string().optional(),
  serial: z.string().optional(),
  firmwareVersion: z.string().min(1).optional(),
});
export type UpdateRobotInput = z.infer<typeof UpdateRobotSchema>;

export const CommandSchema = z.object({
  action: z.enum(ROBOT_COMMANDS),
});

export const TelemetryIngestSchema = z.object({
  batteryPct: z.number().min(0).max(100).optional(),
  cpuPct: z.number().min(0).max(100).optional(),
  memPct: z.number().min(0).max(100).optional(),
  tempC: z.number().optional(),
  uptimeSec: z.number().int().min(0).optional(),
  speed: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  payloadKg: z.number().optional(),
  ts: z.string().datetime().optional(),
});
export type TelemetryIngestInput = z.infer<typeof TelemetryIngestSchema>;

export const ScheduleMaintenanceSchema = z.object({
  robotId: z.string().min(1),
  scheduledAt: z.string().min(1),
  durationMin: z.number().int().min(1).max(24 * 60),
  kind: z.enum(MAINTENANCE_KINDS),
  technician: z.string().optional(),
});
export type ScheduleMaintenanceInput = z.infer<typeof ScheduleMaintenanceSchema>;
