/** Session 57 / 155 — Robotics & Physical Automation client */
import { api } from "./api";
import type {
  Robot, RoboticsDashboard, PredictiveMaintAlert, FleetTelemetry,
  MaintenanceWindow, RoboticsConnector, CreateRobotInput, UpdateRobotInput,
  TelemetryIngestInput, ScheduleMaintenanceInput, RobotCommand,
} from "@windels/shared";

export type {
  Robot, RoboticsDashboard, PredictiveMaintAlert, FleetTelemetry,
  MaintenanceWindow, RoboticsConnector, CreateRobotInput, UpdateRobotInput,
  TelemetryIngestInput, ScheduleMaintenanceInput, RobotCommand,
};
export { ROBOT_KINDS, ROBOT_COMMANDS, MAINTENANCE_KINDS } from "@windels/shared";

export const roboticsApi = {
  dashboard: () => api<RoboticsDashboard>("/robotics/dashboard/rollup"),
  connectors: () => api<RoboticsConnector[]>("/robotics/connectors"),
  health: () => api<{ robots: number; measuredRobots: number; openAlerts: number; connectors: RoboticsConnector[]; mqtt: string }>("/robotics/health"),
  list: () => api<Robot[]>("/robotics/robots"),
  get: (id: string) => api<Robot>(`/robotics/robots/${id}`),
  create: (input: CreateRobotInput) => api<Robot>("/robotics/robots", { method: "POST", json: input }),
  update: (id: string, input: UpdateRobotInput) => api<Robot>(`/robotics/robots/${id}`, { method: "PATCH", json: input }),
  remove: (id: string) => api<{ deleted: boolean; id: string }>(`/robotics/robots/${id}`, { method: "DELETE" }),
  command: (id: string, action: RobotCommand) =>
    api<Robot>(`/robotics/robots/${id}/command`, { method: "POST", json: { action } }),
  ingest: (id: string, reading: TelemetryIngestInput) =>
    api<{ robot: Robot; reading: FleetTelemetry }>(`/robotics/robots/${id}/telemetry`, { method: "POST", json: reading }),
  telemetry: (id: string, limit = 50) =>
    api<FleetTelemetry[]>(`/robotics/robots/${id}/telemetry`, { params: { limit } }),
  predictiveScan: () => api<PredictiveMaintAlert[]>("/robotics/predictive/scan", { method: "POST" }),
  alerts: () => api<PredictiveMaintAlert[]>("/robotics/alerts"),
  ackAlert: (id: string) => api<PredictiveMaintAlert>(`/robotics/alerts/${id}/ack`, { method: "POST" }),
  maintenance: () => api<MaintenanceWindow[]>("/robotics/maintenance"),
  scheduleMaintenance: (input: ScheduleMaintenanceInput) =>
    api<MaintenanceWindow>("/robotics/maintenance", { method: "POST", json: input }),
};
