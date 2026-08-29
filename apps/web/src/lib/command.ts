/** Session 70 / 111 — Global Command Center client. */
import { api } from "./api";
import type {
  CmdBriefing,
  CmdBriefingCreateInput,
  CmdBriefingQuery,
  CmdDirective,
  CmdDirectiveCreateInput,
  CmdDirectiveQuery,
  CmdDirectiveStatusInput,
  CmdIncident,
  CmdIncidentAcknowledgeInput,
  CmdIncidentCreateInput,
  CmdIncidentNoteInput,
  CmdIncidentQuery,
  CmdIncidentResolveInput,
  CmdIncidentUpdateInput,
  CmdInitiative,
  CmdInitiativeCreateInput,
  CmdInitiativeQuery,
  CmdInitiativeUpdateInput,
  CmdOperationsRollup,
  CmdRegion,
  CmdRegionCreateInput,
  CmdRegionQuery,
  CmdRegionStatusReportInput,
  CmdRegionUpdateInput,
  GlobalCommandRollup,
} from "@windels/shared/command";

export type {
  CmdBriefing,
  CmdBriefingCategory,
  CmdBriefingCreateInput,
  CmdBriefingOrigin,
  CmdBriefingPriority,
  CmdDirective,
  CmdDirectiveScope,
  CmdDirectiveSeverity,
  CmdDirectiveStatus,
  CmdIncident,
  CmdIncidentSeverity,
  CmdIncidentStatus,
  CmdIncidentUpdate,
  CmdInitiative,
  CmdInitiativeStatus,
  CmdOperationsRollup,
  CmdRegion,
  CmdRegionHealth,
  GlobalCommandDashboard,
  GlobalCommandRollup,
} from "@windels/shared/command";

export const commandApi = {
  /** Session 70 shape + `directives` + the Session 111 `operations` rollup. */
  dashboard: () => api<GlobalCommandRollup>("/command/dashboard/rollup"),
  operations: () => api<CmdOperationsRollup>("/command/operations"),

  incidents: (query?: Partial<CmdIncidentQuery>) => api<CmdIncident[]>("/command/incidents", { params: query }),
  getIncident: (id: string) => api<CmdIncident>(`/command/incidents/${id}`),
  declareIncident: (input: CmdIncidentCreateInput) => api<CmdIncident>("/command/incidents", { method: "POST", json: input }),
  updateIncident: (id: string, input: CmdIncidentUpdateInput) => api<CmdIncident>(`/command/incidents/${id}`, { method: "PATCH", json: input }),
  deleteIncident: (id: string) => api<{ deleted: boolean; id: string }>(`/command/incidents/${id}`, { method: "DELETE" }),
  addIncidentUpdate: (id: string, input: CmdIncidentNoteInput) => api<CmdIncident>(`/command/incidents/${id}/updates`, { method: "POST", json: input }),
  acknowledgeIncident: (id: string, input: CmdIncidentAcknowledgeInput = {}) => api<CmdIncident>(`/command/incidents/${id}/acknowledge`, { method: "POST", json: input }),
  resolveIncident: (id: string, input: CmdIncidentResolveInput) => api<CmdIncident>(`/command/incidents/${id}/resolve`, { method: "POST", json: input }),

  regions: (query?: Partial<CmdRegionQuery>) => api<CmdRegion[]>("/command/regions", { params: query }),
  getRegion: (id: string) => api<CmdRegion>(`/command/regions/${id}`),
  createRegion: (input: CmdRegionCreateInput) => api<CmdRegion>("/command/regions", { method: "POST", json: input }),
  updateRegion: (id: string, input: CmdRegionUpdateInput) => api<CmdRegion>(`/command/regions/${id}`, { method: "PATCH", json: input }),
  deleteRegion: (id: string) => api<{ deleted: boolean; id: string }>(`/command/regions/${id}`, { method: "DELETE" }),
  reportRegionStatus: (id: string, input: CmdRegionStatusReportInput) => api<CmdRegion>(`/command/regions/${id}/status`, { method: "POST", json: input }),

  briefings: (query?: Partial<CmdBriefingQuery>) => api<CmdBriefing[]>("/command/briefings", { params: query }),
  getBriefing: (id: string) => api<CmdBriefing>(`/command/briefings/${id}`),
  createBriefing: (input: CmdBriefingCreateInput) => api<CmdBriefing>("/command/briefings", { method: "POST", json: input }),
  deleteBriefing: (id: string) => api<{ deleted: boolean; id: string }>(`/command/briefings/${id}`, { method: "DELETE" }),

  initiatives: (query?: Partial<CmdInitiativeQuery>) => api<CmdInitiative[]>("/command/initiatives", { params: query }),
  getInitiative: (id: string) => api<CmdInitiative>(`/command/initiatives/${id}`),
  createInitiative: (input: CmdInitiativeCreateInput) => api<CmdInitiative>("/command/initiatives", { method: "POST", json: input }),
  updateInitiative: (id: string, input: CmdInitiativeUpdateInput) => api<CmdInitiative>(`/command/initiatives/${id}`, { method: "PATCH", json: input }),
  deleteInitiative: (id: string) => api<{ deleted: boolean; id: string }>(`/command/initiatives/${id}`, { method: "DELETE" }),

  directives: (query?: Partial<CmdDirectiveQuery>) => api<CmdDirective[]>("/command/directives", { params: query }),
  getDirective: (id: string) => api<CmdDirective>(`/command/directives/${id}`),
  issueDirective: (input: CmdDirectiveCreateInput) => api<CmdDirective>("/command/directives", { method: "POST", json: input }),
  setDirectiveStatus: (id: string, input: CmdDirectiveStatusInput) => api<CmdDirective>(`/command/directives/${id}/status`, { method: "PATCH", json: input }),
};

/**
 * Session 70 alias kept so the PlatformPage "Command Center" tab, which was
 * written against `gccApi.dashboard()`, keeps working unchanged.
 */
export const gccApi = commandApi;
