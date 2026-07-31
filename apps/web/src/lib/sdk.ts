/** Session 59 — Enterprise SDK client */
import { api } from "./api";
import type { SdkDashboard, SdkPackage, CliCommand, EmulatorInstance, ProfileRun, CodeTemplate, SdkKind } from "@windels/shared";
export type { SdkDashboard, SdkPackage, CliCommand, EmulatorInstance, ProfileRun, CodeTemplate, SdkKind } from "@windels/shared";

export const sdkApi = {
  dashboard: () => api<SdkDashboard>("/sdk/dashboard/rollup"),
  cli: () => api<CliCommand[]>("/sdk/cli"),
  templates: () => api<CodeTemplate[]>("/sdk/templates"),
  startEmulator: (input: { name: string; sdkKind: SdkKind; port?: number }) =>
    api<EmulatorInstance>("/sdk/emulators", { method: "POST", json: input }),
  profile: (target: string) => api<ProfileRun>("/sdk/profiler", { method: "POST", json: { target } }),
};
