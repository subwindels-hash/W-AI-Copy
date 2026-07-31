/** Session 70 — Enterprise Global Command Center */
export interface CommandIncident {
  id: string;
  severity: "info"|"warning"|"critical";
  title: string;
  region: string;
  service: string;
  status: "open"|"mitigating"|"resolved";
  owner?: string;
  openedAt: string;
  resolvedAt?: string;
}

export interface KpiCard { label: string; value: number | string; delta?: number; unit?: string; tone: "azure"|"emerald"|"amber"|"crimson"|"violet"|"fuchsia"|"teal"; }

export interface RegionalStatus {
  region: string;
  health: "healthy"|"degraded"|"down";
  servicesUp: number;
  servicesTotal: number;
  latencyMs: number;
  activeUsers: number;
}

export interface ExecutiveBriefing {
  id: string;
  title: string;
  summary: string;
  priority: "low"|"med"|"high"|"critical";
  category: "market"|"ops"|"risk"|"security"|"financial"|"personnel";
  generatedAt: string;
}

export interface GlobalCommandDashboard {
  enterpriseHealth: number;   // 0..100
  globalRevenueMtd: number;
  activeUsersGlobal: number;
  incidentsOpen: number;
  incidentsCritical: number;
  incidentsResolved30d: number;
  mttrMinutes: number;
  workforceProductivity: number; // 0..100
  aiDecisions24h: number;
  humanOverrides24h: number;
  kpis: KpiCard[];
  regions: RegionalStatus[];
  incidents: CommandIncident[];
  briefings: ExecutiveBriefing[];
  strategicInitiatives: Array<{ id: string; name: string; progress: number; owner: string; due: string }>;
}
