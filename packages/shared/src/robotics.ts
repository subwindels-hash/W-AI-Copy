/**
 * Session 57 — Enterprise Robotics & Physical Automation Platform (V8).
 */

export const ROBOT_KINDS = [
  "industrial_arm", "warehouse_amr", "manufacturing_cell", "delivery_bot",
  "security_patrol", "agricultural", "healthcare", "autonomous_vehicle",
  "drone", "smart_building", "iot_gateway", "plc", "scada", "edge_controller",
] as const;
export type RobotKind = typeof ROBOT_KINDS[number];

export const ROBOT_STATUS = ["idle", "active", "paused", "error", "maintenance", "offline", "simulating"] as const;
export type RobotStatus = typeof ROBOT_STATUS[number];

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
}

export interface FleetTelemetry {
  robotId: string;
  ts: string;
  speed?: number;
  x?: number; y?: number; z?: number;
  payloadKg?: number;
  batteryPct?: number;
  cpuPct?: number;
}

export interface MaintenanceWindow {
  id: string;
  robotId: string;
  scheduledAt: string;
  durationMin: number;
  kind: "preventive" | "corrective" | "calibration" | "firmware";
  technician?: string;
  status: "scheduled" | "in_progress" | "completed" | "missed";
}

export interface PredictiveMaintAlert {
  id: string;
  robotId: string;
  component: string;
  riskPct: number;
  recommendation: string;
  at: string;
}

export interface RoboticsDashboard {
  totalRobots: number;
  active: number;
  idle: number;
  error: number;
  maintenance: number;
  offline: number;
  avgBatteryPct: number;
  tasksCompletedToday: number;
  errorsToday: number;
  sites: number;
  avgCpuPct: number;
  predictiveAlerts: number;
  byKind: Array<{ kind: RobotKind; count: number }>;
  recent: Robot[];
  alerts: PredictiveMaintAlert[];
}
