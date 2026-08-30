/**
 * Module 101: AI Live Dashboard Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides real-time dashboard management with live metric streaming, WebSocket
 * updates, customizable widgets, threshold-based alerting, and collaborative
 * dashboard sharing for AI platform monitoring.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LiveDashboard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: DashboardStatus;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  dataSources: DashboardDataSource[];
  refreshConfig: RefreshConfig;
  sharing: DashboardSharing;
  viewers: ActiveViewer[];
  createdAt: string;
  updatedAt: string;
}

export type DashboardStatus = 'draft' | 'active' | 'archived';

export interface DashboardLayout {
  type: 'grid' | 'freeform' | 'responsive';
  columns: number;
  rowHeight: number;
  gap: number;
  theme: 'light' | 'dark' | 'auto';
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: WidgetPosition;
  config: WidgetConfig;
  dataSourceId: string;
  refreshIntervalMs: number;
  lastUpdated?: string;
  currentValue?: any;
  alerts: WidgetAlert[];
}

export type WidgetType =
  | 'metric_card'
  | 'line_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'heatmap'
  | 'gauge'
  | 'table'
  | 'status_indicator'
  | 'log_stream'
  | 'top_n_list';

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetConfig {
  metric?: string;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'last';
  timeRange?: string;
  groupBy?: string[];
  filters?: Record<string, any>;
  visualization?: Record<string, any>;
  thresholds?: Threshold[];
  format?: 'number' | 'percent' | 'currency' | 'duration' | 'bytes';
}

export interface Threshold {
  value: number;
  operator: 'greater_than' | 'less_than' | 'equals';
  severity: 'info' | 'warning' | 'critical';
  color: string;
  label?: string;
}

export interface WidgetAlert {
  id: string;
  threshold: Threshold;
  triggered: boolean;
  triggeredAt?: string;
  currentValue: number;
  message: string;
}

export interface DashboardDataSource {
  id: string;
  name: string;
  type: 'stream_pipeline' | 'metric_store' | 'api_endpoint' | 'database';
  config: Record<string, any>;
  query?: string;
  refreshIntervalMs: number;
  lastFetchedAt?: string;
  cache: DataCache;
}

export interface DataCache {
  enabled: boolean;
  ttlMs: number;
  lastUpdated?: string;
  data?: any;
}

export interface RefreshConfig {
  autoRefresh: boolean;
  intervalMs: number;
  pauseOnInactive: boolean;
  maxConcurrentUpdates: number;
}

export interface DashboardSharing {
  visibility: 'private' | 'team' | 'organization' | 'public';
  sharedWith: SharedAccess[];
  embeddable: boolean;
  embedToken?: string;
  requireAuthentication: boolean;
}

export interface SharedAccess {
  type: 'user' | 'team' | 'organization';
  id: string;
  name: string;
  permission: 'view' | 'edit' | 'admin';
  sharedAt: string;
}

export interface ActiveViewer {
  userId: string;
  userName: string;
  connectedAt: string;
  lastActiveAt: string;
  viewingWidgets: string[];
}

export interface MetricUpdate {
  widgetId: string;
  timestamp: string;
  value: number;
  metadata?: Record<string, any>;
  alerts?: WidgetAlert[];
}

export interface DashboardSnapshot {
  id: string;
  dashboardId: string;
  capturedAt: string;
  capturedBy: string;
  widgetValues: Array<{ widgetId: string; value: any; timestamp: string }>;
  notes?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const liveDashboards = new Map<string, LiveDashboard>();
const metricUpdates = new Map<string, MetricUpdate[]>();
const dashboardSnapshots = new Map<string, DashboardSnapshot[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createLiveDashboard(params: {
  organizationId: string;
  name: string;
  description?: string;
  layout?: Partial<DashboardLayout>;
  refreshConfig?: Partial<RefreshConfig>;
}): LiveDashboard {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultLayout: DashboardLayout = {
    type: 'grid',
    columns: 12,
    rowHeight: 80,
    gap: 16,
    theme: 'auto',
  };

  const defaultRefresh: RefreshConfig = {
    autoRefresh: true,
    intervalMs: 5000,
    pauseOnInactive: true,
    maxConcurrentUpdates: 10,
  };

  const dashboard: LiveDashboard = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    layout: { ...defaultLayout, ...params.layout },
    widgets: [],
    dataSources: [],
    refreshConfig: { ...defaultRefresh, ...params.refreshConfig },
    sharing: {
      visibility: 'private',
      sharedWith: [],
      embeddable: false,
      requireAuthentication: true,
    },
    viewers: [],
    createdAt: now,
    updatedAt: now,
  };

  liveDashboards.set(id, dashboard);
  metricUpdates.set(id, []);
  dashboardSnapshots.set(id, []);
  return dashboard;
}

export function getLiveDashboard(id: string): LiveDashboard | undefined {
  return liveDashboards.get(id);
}

export function listLiveDashboards(organizationId: string): LiveDashboard[] {
  return Array.from(liveDashboards.values()).filter(d => d.organizationId === organizationId);
}

export function activateDashboard(dashboardId: string): LiveDashboard {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  dashboard.status = 'active';
  dashboard.updatedAt = new Date().toISOString();
  return dashboard;
}

export function addWidget(
  dashboardId: string,
  params: {
    type: WidgetType;
    title: string;
    position: WidgetPosition;
    config: WidgetConfig;
    dataSourceId: string;
    refreshIntervalMs?: number;
  }
): DashboardWidget {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const widget: DashboardWidget = {
    id: randomUUID(),
    type: params.type,
    title: params.title,
    position: params.position,
    config: params.config,
    dataSourceId: params.dataSourceId,
    refreshIntervalMs: params.refreshIntervalMs || 5000,
    alerts: [],
  };

  dashboard.widgets.push(widget);
  dashboard.updatedAt = new Date().toISOString();
  return widget;
}

export function updateWidget(
  dashboardId: string,
  widgetId: string,
  updates: Partial<DashboardWidget>
): DashboardWidget {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const widget = dashboard.widgets.find(w => w.id === widgetId);
  if (!widget) throw new Error(`Widget ${widgetId} not found`);

  Object.assign(widget, updates);
  dashboard.updatedAt = new Date().toISOString();
  return widget;
}

export function removeWidget(dashboardId: string, widgetId: string): void {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const index = dashboard.widgets.findIndex(w => w.id === widgetId);
  if (index === -1) throw new Error(`Widget ${widgetId} not found`);

  dashboard.widgets.splice(index, 1);
  dashboard.updatedAt = new Date().toISOString();
}

export function addDataSource(
  dashboardId: string,
  params: {
    name: string;
    type: 'stream_pipeline' | 'metric_store' | 'api_endpoint' | 'database';
    config: Record<string, any>;
    query?: string;
    refreshIntervalMs?: number;
  }
): DashboardDataSource {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const dataSource: DashboardDataSource = {
    id: randomUUID(),
    name: params.name,
    type: params.type,
    config: params.config,
    query: params.query,
    refreshIntervalMs: params.refreshIntervalMs || 5000,
    cache: { enabled: true, ttlMs: 60000 },
  };

  dashboard.dataSources.push(dataSource);
  dashboard.updatedAt = new Date().toISOString();
  return dataSource;
}

export function pushMetricUpdate(
  dashboardId: string,
  widgetId: string,
  value: number,
  metadata?: Record<string, any>
): MetricUpdate {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const widget = dashboard.widgets.find(w => w.id === widgetId);
  if (!widget) throw new Error(`Widget ${widgetId} not found`);

  const now = new Date().toISOString();
  const update: MetricUpdate = {
    widgetId,
    timestamp: now,
    value,
    metadata,
    alerts: [],
  };

  // Check thresholds
  if (widget.config.thresholds) {
    for (const threshold of widget.config.thresholds) {
      let triggered = false;
      switch (threshold.operator) {
        case 'greater_than': triggered = value > threshold.value; break;
        case 'less_than': triggered = value < threshold.value; break;
        case 'equals': triggered = value === threshold.value; break;
      }

      if (triggered) {
        const alert: WidgetAlert = {
          id: randomUUID(),
          threshold,
          triggered: true,
          triggeredAt: now,
          currentValue: value,
          message: `${widget.title}: ${threshold.label || 'Threshold'} breached (${value} ${threshold.operator} ${threshold.value})`,
        };
        update.alerts!.push(alert);
        widget.alerts.push(alert);
      }
    }
  }

  widget.currentValue = value;
  widget.lastUpdated = now;

  const updates = metricUpdates.get(dashboardId) || [];
  updates.push(update);
  if (updates.length > 10000) updates.shift();

  return update;
}

export function getMetricHistory(
  dashboardId: string,
  widgetId: string,
  limit: number = 100
): MetricUpdate[] {
  const updates = metricUpdates.get(dashboardId) || [];
  return updates.filter(u => u.widgetId === widgetId).slice(-limit).reverse();
}

export function connectViewer(
  dashboardId: string,
  userId: string,
  userName: string
): ActiveViewer {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const now = new Date().toISOString();
  const viewer: ActiveViewer = {
    userId,
    userName,
    connectedAt: now,
    lastActiveAt: now,
    viewingWidgets: dashboard.widgets.map(w => w.id),
  };

  dashboard.viewers.push(viewer);
  return viewer;
}

export function disconnectViewer(dashboardId: string, userId: string): void {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const index = dashboard.viewers.findIndex(v => v.userId === userId);
  if (index !== -1) {
    dashboard.viewers.splice(index, 1);
  }
}

export function captureSnapshot(
  dashboardId: string,
  capturedBy: string,
  notes?: string
): DashboardSnapshot {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const now = new Date().toISOString();
  const snapshot: DashboardSnapshot = {
    id: randomUUID(),
    dashboardId,
    capturedAt: now,
    capturedBy,
    widgetValues: dashboard.widgets.map(w => ({
      widgetId: w.id,
      value: w.currentValue,
      timestamp: w.lastUpdated || now,
    })),
    notes,
  };

  const snapshots = dashboardSnapshots.get(dashboardId) || [];
  snapshots.push(snapshot);
  if (snapshots.length > 100) snapshots.shift();

  return snapshot;
}

export function getSnapshots(dashboardId: string, limit: number = 10): DashboardSnapshot[] {
  const snapshots = dashboardSnapshots.get(dashboardId) || [];
  return snapshots.slice(-limit).reverse();
}

export function shareDashboard(
  dashboardId: string,
  params: {
    visibility: 'private' | 'team' | 'organization' | 'public';
    sharedWith?: Array<{ type: 'user' | 'team' | 'organization'; id: string; name: string; permission: 'view' | 'edit' | 'admin' }>;
    embeddable?: boolean;
  }
): DashboardSharing {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const now = new Date().toISOString();
  dashboard.sharing.visibility = params.visibility;

  if (params.sharedWith) {
    dashboard.sharing.sharedWith = params.sharedWith.map(s => ({
      ...s,
      sharedAt: now,
    }));
  }

  if (params.embeddable !== undefined) {
    dashboard.sharing.embeddable = params.embeddable;
    if (params.embeddable && !dashboard.sharing.embedToken) {
      dashboard.sharing.embedToken = randomUUID();
    }
  }

  dashboard.updatedAt = now;
  return dashboard.sharing;
}

export function getActiveViewers(dashboardId: string): ActiveViewer[] {
  const dashboard = liveDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);
  return dashboard.viewers;
}
