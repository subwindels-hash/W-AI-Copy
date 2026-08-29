/**
 * Session 36 — Wake Intelligence API client.
 */
import { api } from "./api";
import type { WakeDashboard, WakeConfig, ActivationEvent, ClapPattern, ClapDetection, MfaPolicy, DeviceActivationState, EmergencyContact, EmergencyConfig, EmergencyEvent, WorkforceActivationBinding } from "@windels/shared";
export type { WakeDashboard, WakeConfig, ActivationEvent, ClapPattern, ClapDetection, MfaPolicy, DeviceActivationState, EmergencyContact, EmergencyConfig, EmergencyEvent, WorkforceActivationBinding } from "@windels/shared";

export const wiApi = {
  dashboard: () => api<WakeDashboard>("/wake-intel/dashboard/rollup"),
  config: () => api<WakeConfig>("/wake-intel/config"),
  activate: (input: any) => api<ActivationEvent>("/wake-intel/activate", { method: "POST", json: input }),
  activations: () => api<ActivationEvent[]>("/wake-intel/activations"),
  clapPatterns: () => api<ClapPattern[]>("/wake-intel/clap/patterns"),
  addClapPattern: (input: any) => api<ClapPattern>("/wake-intel/clap/patterns", { method: "POST", json: input }),
  clapDetections: () => api<ClapDetection[]>("/wake-intel/clap/detections"),
  detectClap: (input: any) => api<ClapDetection | null>("/wake-intel/clap/detect", { method: "POST", json: input }),
  mfaPolicies: () => api<MfaPolicy[]>("/wake-intel/mfa/policies"),
  addMfaPolicy: (input: any) => api<MfaPolicy>("/wake-intel/mfa/policies", { method: "POST", json: input }),
  devices: () => api<DeviceActivationState[]>("/wake-intel/devices"),
  registerDevice: (input: any) => api<DeviceActivationState>("/wake-intel/devices", { method: "POST", json: input }),
  emergencyConfig: () => api<EmergencyConfig>("/wake-intel/emergency/config"),
  setEmergencyConfig: (input: any) => api<EmergencyConfig>("/wake-intel/emergency/config", { method: "POST", json: input }),
  emergencyContacts: () => api<EmergencyContact[]>("/wake-intel/emergency/contacts"),
  addEmergencyContact: (input: any) => api<EmergencyContact>("/wake-intel/emergency/contacts", { method: "POST", json: input }),
  emergencyEvents: () => api<EmergencyEvent[]>("/wake-intel/emergency/events"),
  triggerEmergency: (input: any) => api<EmergencyEvent>("/wake-intel/emergency/trigger", { method: "POST", json: input }),
  bindings: () => api<WorkforceActivationBinding[]>("/wake-intel/workforce-bindings"),
  addBinding: (input: any) => api<WorkforceActivationBinding>("/wake-intel/workforce-bindings", { method: "POST", json: input }),
};
