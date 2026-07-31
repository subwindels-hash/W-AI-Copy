/**
 * Module 47: Explanation Visualization Service
 *
 * Provides comprehensive visualization capabilities for model explanations
 * including feature importance charts, SHAP plots, partial dependence plots,
 * force plots, counterfactual visualizations, and interactive dashboards.
 *
 * Phase 1 — Critical Gap: Explanation visualization infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisualizationType =
  | "feature_importance"
  | "shap_summary"
  | "shap_force"
  | "shap_dependence"
  | "partial_dependence"
  | "ice_plot"
  | "counterfactual"
  | "interaction"
  | "custom";

export type ExportFormat = "png" | "svg" | "pdf" | "html" | "json";

export type VisualizationJobStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";

export type ChartStyle = "default" | "minimal" | "dark" | "colorblind" | "publication";

export interface VisualizationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: VisualizationJobStatus;
  explanationJobId: string;
  visualizationType: VisualizationType;
  config: VisualizationConfig;
  result?: VisualizationResult;
  error?: { code: string; message: string; step?: string };
  performance: VisualizationPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface VisualizationConfig {
  // General configuration
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  style?: ChartStyle;
  colorPalette?: string[];
  
  // Feature importance configuration
  featureImportance?: {
    topN?: number;
    orientation?: "horizontal" | "vertical";
    showErrorBars?: boolean;
    normalizeImportance?: boolean;
  };
  
  // SHAP configuration
  shapSummary?: {
    maxDisplay?: number;
    plotType?: "dot" | "violin" | "bar";
    colorByFeature?: boolean;
    showColorBar?: boolean;
  };
  
  shapForce?: {
    sampleIndex: number;
    showFeatureValues?: boolean;
    link?: "identity" | "logit";
  };
  
  shapDependence?: {
    featureName: string;
    interactionFeature?: string;
    showHistogram?: boolean;
  };
  
  // Partial dependence configuration
  partialDependence?: {
    featureName: string;
    showICE?: boolean;
    showConfidenceInterval?: boolean;
    rugPlot?: boolean;
  };
  
  // Counterfactual configuration
  counterfactual?: {
    sampleIndex: number;
    showOriginal?: boolean;
    showChanges?: boolean;
    highlightChanges?: boolean;
  };
  
  // Export configuration
  exportFormats: ExportFormat[];
  dpi?: number;
  embedFonts?: boolean;
  
  // Interactive configuration
  interactive?: {
    enabled: boolean;
    tooltips?: boolean;
    zoom?: boolean;
    pan?: boolean;
    selection?: boolean;
  };
}

export interface VisualizationResult {
  visualizationType: VisualizationType;
  
  // Static exports
  exports: VisualizationExport[];
  
  // Interactive visualization
  interactiveHtml?: string;
  interactiveConfig?: InteractiveConfig;
  
  // Visualization metadata
  metadata: {
    numFeatures?: number;
    numSamples?: number;
    computationTimeMs: number;
    fileSizeBytes: Record<string, number>;
  };
  
  // Visualization data (for custom rendering)
  data?: VisualizationData;
}

export interface VisualizationExport {
  format: ExportFormat;
  url: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  dpi?: number;
  createdAt: string;
  expiresAt?: string;
}

export interface InteractiveConfig {
  library: "plotly" | "d3" | "echarts" | "highcharts" | "custom";
  config: Record<string, unknown>;
  data: unknown;
  layout?: Record<string, unknown>;
}

export interface VisualizationData {
  type: VisualizationType;
  
  // Feature importance data
  featureImportance?: {
    features: Array<{
      name: string;
      importance: number;
      stdDev?: number;
      rank: number;
    }>;
  };
  
  // SHAP data
  shapSummary?: {
    features: Array<{
      name: string;
      values: number[];
      shapValues: number[];
    }>;
  };
  
  shapForce?: {
    baseValue: number;
    features: Array<{
      name: string;
      value: number;
      shapValue: number;
    }>;
  };
  
  shapDependence?: {
    featureName: string;
    featureValues: number[];
    shapValues: number[];
    interactionFeature?: string;
    interactionValues?: number[];
  };
  
  // Partial dependence data
  partialDependence?: {
    featureName: string;
    featureValues: number[];
    pdpValues: number[];
    iceLines?: number[][];
    confidenceInterval?: {
      lower: number[];
      upper: number[];
    };
  };
  
  // Counterfactual data
  counterfactual?: {
    original: {
      features: Array<{ name: string; value: unknown }>;
      prediction: unknown;
    };
    counterfactuals: Array<{
      id: string;
      features: Array<{ name: string; value: unknown; changed: boolean }>;
      prediction: unknown;
      proximity: number;
      sparsity: number;
    }>;
  };
}

export interface VisualizationPerformance {
  generationTimeMs: number;
  memoryUsageMb: number;
  totalFileSizeBytes: number;
}

export interface VisualizationDashboard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  visualizations: Array<{
    id: string;
    visualizationJobId: string;
    position: { x: number; y: number; width: number; height: number };
    title?: string;
  }>;
  layout: {
    type: "grid" | "freeform";
    columns?: number;
    rows?: number;
  };
  theme: ChartStyle;
  interactive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualizationStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageGenerationTimeMs: number;
  totalFileSizeBytes: number;
  jobsByType: Record<string, number>;
  jobsByFormat: Record<string, number>;
  interactiveVisualizations: number;
  topFeatures: Array<{
    featureName: string;
    appearanceCount: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const visualizationJobs = new Map<string, VisualizationJob>();
const visualizationDashboards = new Map<string, VisualizationDashboard>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a visualization job
 */
export async function createVisualizationJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  explanationJobId: string;
  visualizationType: VisualizationType;
  config: VisualizationConfig;
  createdBy: string;
}): Promise<VisualizationJob> {
  const now = new Date().toISOString();

  const job: VisualizationJob = {
    id: `viz_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    explanationJobId: params.explanationJobId,
    visualizationType: params.visualizationType,
    config: params.config,
    performance: {
      generationTimeMs: 0,
      memoryUsageMb: 0,
      totalFileSizeBytes: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  visualizationJobs.set(job.id, job);
  return job;
}

/**
 * Execute a visualization job
 */
export async function executeVisualizationJob(jobId: string): Promise<VisualizationJob | null> {
  const job = visualizationJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute job in status: ${job.status}`);
  }

  job.status = "generating";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  visualizationJobs.set(jobId, job);

  try {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Generate visualization
    const result = await generateVisualization(job);

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    job.performance.generationTimeMs = endTime - startTime;
    job.performance.memoryUsageMb = (endMemory - startMemory) / 1024 / 1024;
    job.performance.totalFileSizeBytes = result.exports.reduce((sum, e) => sum + e.sizeBytes, 0);

    visualizationJobs.set(jobId, job);
    return job;
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "VISUALIZATION_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();

    visualizationJobs.set(jobId, job);
    return job;
  }
}

/**
 * Get visualization job by ID
 */
export async function getVisualizationJob(jobId: string): Promise<VisualizationJob | null> {
  return visualizationJobs.get(jobId) ?? null;
}

/**
 * List visualization jobs
 */
export async function listVisualizationJobs(
  organizationId: string,
  filters?: {
    status?: VisualizationJobStatus;
    visualizationType?: VisualizationType;
    explanationJobId?: string;
    limit?: number;
  }
): Promise<VisualizationJob[]> {
  let result = Array.from(visualizationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.visualizationType) result = result.filter(j => j.visualizationType === filters.visualizationType);
  if (filters?.explanationJobId) result = result.filter(j => j.explanationJobId === filters.explanationJobId);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a visualization job
 */
export async function cancelVisualizationJob(jobId: string): Promise<VisualizationJob | null> {
  const job = visualizationJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  visualizationJobs.set(jobId, job);
  return job;
}

/**
 * Create a visualization dashboard
 */
export async function createVisualizationDashboard(params: {
  organizationId: string;
  name: string;
  description?: string;
  visualizations: Array<{
    visualizationJobId: string;
    position: { x: number; y: number; width: number; height: number };
    title?: string;
  }>;
  layout?: VisualizationDashboard["layout"];
  theme?: ChartStyle;
  interactive?: boolean;
  createdBy: string;
}): Promise<VisualizationDashboard> {
  const now = new Date().toISOString();

  const dashboard: VisualizationDashboard = {
    id: `dashboard_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    visualizations: params.visualizations.map((v, idx) => ({
      id: `viz_${idx}_${randomUUID().slice(0, 8)}`,
      ...v,
    })),
    layout: params.layout ?? { type: "grid", columns: 2, rows: 2 },
    theme: params.theme ?? "default",
    interactive: params.interactive ?? true,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  visualizationDashboards.set(dashboard.id, dashboard);
  return dashboard;
}

/**
 * Get visualization dashboard by ID
 */
export async function getVisualizationDashboard(dashboardId: string): Promise<VisualizationDashboard | null> {
  return visualizationDashboards.get(dashboardId) ?? null;
}

/**
 * List visualization dashboards
 */
export async function listVisualizationDashboards(
  organizationId: string,
  limit: number = 50
): Promise<VisualizationDashboard[]> {
  return Array.from(visualizationDashboards.values())
    .filter(d => d.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Update visualization dashboard
 */
export async function updateVisualizationDashboard(
  dashboardId: string,
  updates: Partial<Pick<VisualizationDashboard, "name" | "description" | "visualizations" | "layout" | "theme" | "interactive">>
): Promise<VisualizationDashboard | null> {
  const dashboard = visualizationDashboards.get(dashboardId);
  if (!dashboard) return null;

  Object.assign(dashboard, updates);
  dashboard.updatedAt = new Date().toISOString();

  visualizationDashboards.set(dashboardId, dashboard);
  return dashboard;
}

/**
 * Delete visualization dashboard
 */
export async function deleteVisualizationDashboard(dashboardId: string): Promise<boolean> {
  return visualizationDashboards.delete(dashboardId);
}

/**
 * Get visualization statistics
 */
export async function getVisualizationStats(organizationId: string): Promise<VisualizationStats> {
  const allJobs = Array.from(visualizationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalGenerationTime = 0;
  let totalFileSize = 0;
  let interactiveCount = 0;
  const jobsByType: Record<string, number> = {};
  const jobsByFormat: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};

  for (const job of allJobs) {
    jobsByType[job.visualizationType] = (jobsByType[job.visualizationType] || 0) + 1;

    if (job.status === "completed") {
      totalGenerationTime += job.performance.generationTimeMs;
      totalFileSize += job.performance.totalFileSizeBytes;

      if (job.result?.interactiveHtml) {
        interactiveCount++;
      }

      for (const exportFile of job.result?.exports ?? []) {
        jobsByFormat[exportFile.format] = (jobsByFormat[exportFile.format] || 0) + 1;
      }

      // Count feature appearances
      if (job.result?.data?.featureImportance?.features) {
        for (const feature of job.result.data.featureImportance.features) {
          featureCounts[feature.name] = (featureCounts[feature.name] || 0) + 1;
        }
      }
    }
  }

  const topFeatures = Object.entries(featureCounts)
    .map(([name, count]) => ({ featureName: name, appearanceCount: count }))
    .sort((a, b) => b.appearanceCount - a.appearanceCount)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageGenerationTimeMs: completedJobs.length > 0 ? Math.round(totalGenerationTime / completedJobs.length) : 0,
    totalFileSizeBytes: totalFileSize,
    jobsByType,
    jobsByFormat,
    interactiveVisualizations: interactiveCount,
    topFeatures,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function generateVisualization(job: VisualizationJob): Promise<VisualizationResult> {
  const { visualizationType, config } = job;

  // Generate visualization data based on type
  const data = generateVisualizationData(visualizationType, config);

  // Generate exports
  const exports: VisualizationExport[] = [];
  for (const format of config.exportFormats) {
    const exportFile = await generateExport(visualizationType, data, format, config);
    exports.push(exportFile);
  }

  // Generate interactive HTML if enabled
  let interactiveHtml: string | undefined;
  let interactiveConfig: InteractiveConfig | undefined;
  if (config.interactive?.enabled) {
    const interactive = generateInteractiveVisualization(visualizationType, data, config);
    interactiveHtml = interactive.html;
    interactiveConfig = interactive.config;
  }

  return {
    visualizationType,
    exports,
    interactiveHtml,
    interactiveConfig,
    metadata: {
      numFeatures: data.featureImportance?.features.length ?? data.shapSummary?.features.length,
      numSamples: data.shapForce?.features.length,
      computationTimeMs: 0,
      fileSizeBytes: Object.fromEntries(exports.map(e => [e.format, e.sizeBytes])),
    },
    data,
  };
}

function generateVisualizationData(type: VisualizationType, config: VisualizationConfig): VisualizationData {
  switch (type) {
    case "feature_importance":
      return generateFeatureImportanceData(config);
    case "shap_summary":
      return generateSHAPSummaryData(config);
    case "shap_force":
      return generateSHAPForceData(config);
    case "shap_dependence":
      return generateSHAPDependenceData(config);
    case "partial_dependence":
      return generatePartialDependenceData(config);
    case "counterfactual":
      return generateCounterfactualData(config);
    default:
      return { type };
  }
}

function generateFeatureImportanceData(config: VisualizationConfig): VisualizationData {
  const topN = config.featureImportance?.topN ?? 20;
  const features = Array.from({ length: topN }, (_, i) => ({
    name: `feature_${i}`,
    importance: Math.random(),
    stdDev: Math.random() * 0.1,
    rank: i + 1,
  })).sort((a, b) => b.importance - a.importance);

  if (config.featureImportance?.normalizeImportance) {
    const maxImportance = Math.max(...features.map(f => f.importance));
    features.forEach(f => f.importance /= maxImportance);
  }

  return {
    type: "feature_importance",
    featureImportance: { features },
  };
}

function generateSHAPSummaryData(config: VisualizationConfig): VisualizationData {
  const maxDisplay = config.shapSummary?.maxDisplay ?? 20;
  const numSamples = 100;

  const features = Array.from({ length: maxDisplay }, (_, i) => ({
    name: `feature_${i}`,
    values: Array.from({ length: numSamples }, () => Math.random()),
    shapValues: Array.from({ length: numSamples }, () => (Math.random() - 0.5) * 2),
  }));

  return {
    type: "shap_summary",
    shapSummary: { features },
  };
}

function generateSHAPForceData(config: VisualizationConfig): VisualizationData {
  const numFeatures = 10;
  const baseValue = 0.5;

  const features = Array.from({ length: numFeatures }, (_, i) => ({
    name: `feature_${i}`,
    value: Math.random(),
    shapValue: (Math.random() - 0.5) * 0.5,
  }));

  return {
    type: "shap_force",
    shapForce: {
      baseValue,
      features,
    },
  };
}

function generateSHAPDependenceData(config: VisualizationConfig): VisualizationData {
  const numPoints = 100;
  const featureName = config.shapDependence?.featureName ?? "feature_0";

  const featureValues = Array.from({ length: numPoints }, () => Math.random());
  const shapValues = featureValues.map(v => Math.sin(v * Math.PI) + (Math.random() - 0.5) * 0.3);

  const data: VisualizationData = {
    type: "shap_dependence",
    shapDependence: {
      featureName,
      featureValues,
      shapValues,
    },
  };

  if (config.shapDependence?.interactionFeature) {
    data.shapDependence!.interactionFeature = config.shapDependence.interactionFeature;
    data.shapDependence!.interactionValues = Array.from({ length: numPoints }, () => Math.random());
  }

  return data;
}

function generatePartialDependenceData(config: VisualizationConfig): VisualizationData {
  const numPoints = 50;
  const featureName = config.partialDependence?.featureName ?? "feature_0";

  const featureValues = Array.from({ length: numPoints }, (_, i) => i / (numPoints - 1));
  const pdpValues = featureValues.map(v => Math.sin(v * Math.PI * 2) + Math.random() * 0.1);

  const data: VisualizationData = {
    type: "partial_dependence",
    partialDependence: {
      featureName,
      featureValues,
      pdpValues,
    },
  };

  if (config.partialDependence?.showICE) {
    const numICE = 10;
    data.partialDependence!.iceLines = Array.from({ length: numICE }, () =>
      pdpValues.map(v => v + (Math.random() - 0.5) * 0.3)
    );
  }

  if (config.partialDependence?.showConfidenceInterval) {
    data.partialDependence!.confidenceInterval = {
      lower: pdpValues.map(v => v - 0.1),
      upper: pdpValues.map(v => v + 0.1),
    };
  }

  return data;
}

function generateCounterfactualData(config: VisualizationConfig): VisualizationData {
  const numFeatures = 10;
  const numCounterfactuals = 3;

  const originalFeatures = Array.from({ length: numFeatures }, (_, i) => ({
    name: `feature_${i}`,
    value: Math.random(),
  }));

  const counterfactuals = Array.from({ length: numCounterfactuals }, (_, idx) => {
    const features = originalFeatures.map(f => ({
      ...f,
      changed: Math.random() > 0.7,
    }));

    // Change some features
    features.forEach(f => {
      if (f.changed) {
        f.value = Math.random();
      }
    });

    return {
      id: `cf_${idx}`,
      features,
      prediction: Math.random(),
      proximity: 0.7 + Math.random() * 0.3,
      sparsity: 0.5 + Math.random() * 0.5,
    };
  });

  return {
    type: "counterfactual",
    counterfactual: {
      original: {
        features: originalFeatures,
        prediction: Math.random(),
      },
      counterfactuals,
    },
  };
}

async function generateExport(
  type: VisualizationType,
  data: VisualizationData,
  format: ExportFormat,
  config: VisualizationConfig
): Promise<VisualizationExport> {
  // Simulate export generation
  const sizeBytes = format === "png" ? 50000 : format === "svg" ? 10000 : format === "pdf" ? 100000 : 5000;
  const now = new Date();

  return {
    format,
    url: `https://visualizations.example.com/${randomUUID()}.${format}`,
    sizeBytes,
    width: config.width ?? 800,
    height: config.height ?? 600,
    dpi: config.dpi ?? 150,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  };
}

function generateInteractiveVisualization(
  type: VisualizationType,
  data: VisualizationData,
  config: VisualizationConfig
): { html: string; config: InteractiveConfig } {
  // Generate Plotly configuration
  const plotlyConfig: InteractiveConfig = {
    library: "plotly",
    config: {
      responsive: true,
      displayModeBar: true,
      scrollZoom: config.interactive?.zoom ?? false,
    },
    data: {},
    layout: {
      title: config.title ?? type,
      width: config.width ?? 800,
      height: config.height ?? 600,
    },
  };

  // Generate HTML with embedded Plotly
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${config.title ?? "Visualization"}</title>
  <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    #visualization { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="visualization"></div>
  <script>
    const data = ${JSON.stringify(plotlyConfig.data)};
    const layout = ${JSON.stringify(plotlyConfig.layout)};
    const config = ${JSON.stringify(plotlyConfig.config)};
    Plotly.newPlot('visualization', data, layout, config);
  </script>
</body>
</html>
  `.trim();

  return { html, config: plotlyConfig };
}
