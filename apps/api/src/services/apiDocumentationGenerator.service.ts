/**
 * Module 52: API Documentation Generator Service
 * Phase 1 — API documentation generation infrastructure
 */
import { randomUUID } from "node:crypto";

export type APIDocumentationJobStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";
export type APIDocumentationType = "openapi" | "swagger" | "reference" | "examples" | "testing" | "comprehensive";
export type APIExportFormat = "openapi" | "swagger" | "markdown" | "html" | "postman";

export interface APIDocumentationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: APIDocumentationJobStatus;
  documentationType: APIDocumentationType;
  config: any;
  result?: any;
  error?: { code: string; message: string };
  performance: { totalEndpoints: number; totalWords: number; generationTimeMs: number; exportsGenerated: number };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const apiDocumentationJobs = new Map<string, APIDocumentationJob>();

export async function createAPIDocumentationJob(params: {
  organizationId: string;
  name: string;
  documentationType: APIDocumentationType;
  config: any;
  createdBy: string;
}): Promise<APIDocumentationJob> {
  const now = new Date().toISOString();
  const job: APIDocumentationJob = {
    id: `api_doc_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    status: "pending",
    documentationType: params.documentationType,
    config: params.config,
    performance: { totalEndpoints: 0, totalWords: 0, generationTimeMs: 0, exportsGenerated: 0 },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  apiDocumentationJobs.set(job.id, job);
  return job;
}

export async function startAPIDocumentationJob(jobId: string): Promise<APIDocumentationJob | null> {
  const job = apiDocumentationJobs.get(jobId);
  if (!job || job.status !== "pending") return null;
  job.status = "generating";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;
  apiDocumentationJobs.set(jobId, job);
  await generateAPIDocumentation(jobId);
  return job;
}

export async function getAPIDocumentationJob(jobId: string): Promise<APIDocumentationJob | null> {
  return apiDocumentationJobs.get(jobId) ?? null;
}

export async function listAPIDocumentationJobs(organizationId: string, filters?: any): Promise<APIDocumentationJob[]> {
  let result = Array.from(apiDocumentationJobs.values()).filter(j => j.organizationId === organizationId);
  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.documentationType) result = result.filter(j => j.documentationType === filters.documentationType);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

async function generateAPIDocumentation(jobId: string): Promise<void> {
  const job = apiDocumentationJobs.get(jobId);
  if (!job) return;
  const startTime = Date.now();
  
  try {
    const endpoints = generateEndpoints(job);
    const exports = generateAPIExports(endpoints, job.config.exportFormats || ["openapi"]);
    
    job.result = {
      documentationId: `api_doc_${randomUUID().slice(0, 8)}`,
      documentationType: job.documentationType,
      generatedAt: new Date().toISOString(),
      exports,
      endpoints,
      metadata: { totalEndpoints: endpoints.length, generationTimeMs: Date.now() - startTime },
    };
    
    job.performance = { totalEndpoints: endpoints.length, totalWords: 0, generationTimeMs: Date.now() - startTime, exportsGenerated: exports.length };
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    apiDocumentationJobs.set(jobId, job);
  } catch (error) {
    job.status = "failed";
    job.error = { code: "GENERATION_ERROR", message: error instanceof Error ? error.message : String(error) };
    job.updatedAt = new Date().toISOString();
    apiDocumentationJobs.set(jobId, job);
  }
}

function generateEndpoints(job: APIDocumentationJob): any[] {
  const endpoints = [];
  endpoints.push({
    id: `endpoint_${randomUUID().slice(0, 8)}`,
    path: "/api/v1/models",
    method: "GET",
    description: "List all models",
    parameters: [],
    responses: { "200": { description: "Success" } },
  });
  endpoints.push({
    id: `endpoint_${randomUUID().slice(0, 8)}`,
    path: "/api/v1/models/{id}",
    method: "GET",
    description: "Get model by ID",
    parameters: [{ name: "id", in: "path", required: true, type: "string" }],
    responses: { "200": { description: "Success" }, "404": { description: "Not found" } },
  });
  return endpoints;
}

function generateAPIExports(endpoints: any[], formats: string[]): any[] {
  return formats.map(format => {
    if (format === "openapi") {
      return {
        format,
        content: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "API Documentation", version: "1.0.0" },
          paths: endpoints.reduce((paths, e) => {
            paths[e.path] = paths[e.path] || {};
            paths[e.path][e.method.toLowerCase()] = {
              summary: e.description,
              parameters: e.parameters,
              responses: e.responses,
            };
            return paths;
          }, {} as any),
        }, null, 2),
        sizeBytes: 5000,
        generatedAt: new Date().toISOString(),
      };
    }
    return {
      format,
      content: JSON.stringify(endpoints),
      sizeBytes: 3000,
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getAPIDocumentationStats(organizationId: string): Promise<any> {
  const allJobs = Array.from(apiDocumentationJobs.values()).filter(j => j.organizationId === organizationId);
  const completedJobs = allJobs.filter(j => j.status === "completed");
  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    totalDocumentsGenerated: completedJobs.length,
    averageGenerationTime: completedJobs.length > 0 ? completedJobs.reduce((sum, j) => sum + j.performance.generationTimeMs, 0) / completedJobs.length : 0,
  };
}
