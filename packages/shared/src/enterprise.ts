/**
 * Shared types for Session 18 — Enterprise Engineering Framework.
 * Covers Architecture Governance, Service Registry, Event Bus, API Governance.
 */

// ─── Slice 161: Architecture Governance ──────────────────────────────────
export type ADRStatus = "proposed" | "accepted" | "superseded" | "deprecated" | "rejected";
export interface ArchitectureDecisionRecord {
  id: string;
  number: number;
  title: string;
  status: ADRStatus;
  context: string;
  decision: string;
  consequences: string;
  authors: string[];
  date: string; // ISO
  supersededBy?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface ArchitectureStandard {
  id: string;
  code: string; // e.g. "API-001"
  category: "api" | "security" | "data" | "ui" | "infra" | "naming" | "testing";
  title: string;
  description: string;
  severity: "must" | "should" | "may";
  enforcement: "manual" | "automated" | "advisory";
  link?: string;
}

export interface ReviewRequest {
  id: string;
  kind: "adr" | "service" | "event" | "api" | "deployment";
  targetId: string;
  requestedBy: string;
  status: "pending" | "approved" | "changes_requested" | "rejected";
  reviewers: string[];
  comments: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: string;
  }>;
  createdAt: string;
  decidedAt?: string;
}

// ─── Slice 162: Microservice Framework ───────────────────────────────────
export type ServiceStatus = "starting" | "healthy" | "degraded" | "unhealthy" | "offline";
export interface ServiceRegistration {
  id: string;               // unique service id (e.g. "windels-api")
  name: string;
  version: string;          // semver
  baseUrl: string;          // internal URL
  healthUrl?: string;
  status: ServiceStatus;
  capabilities: string[];   // e.g. ["chat", "auth", "events"]
  metadata: Record<string, unknown>;
  startedAt: string;
  lastHeartbeat?: string;
  region?: string;
  instanceId?: string;
}

export interface ServiceIdentity {
  serviceId: string;
  instanceId: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt?: string;
}

export interface ServiceHealthReport {
  serviceId: string;
  instanceId: string;
  status: ServiceStatus;
  version: string;
  uptimeSeconds: number;
  checks: Record<string, "ok" | "error" | string>;
  metrics?: Record<string, number>;
  reportedAt: string;
}

// ─── Slice 163: Service Discovery ────────────────────────────────────────
export interface ServiceDependency {
  from: string;
  to: string;
  kind: "http" | "event" | "grpc" | "internal";
  criticality: "required" | "optional";
}

export interface DiscoveryQuery {
  capability?: string;
  name?: string;
  status?: ServiceStatus;
  region?: string;
  minVersion?: string;
}

// ─── Slice 164: Enterprise Event Bus ─────────────────────────────────────
export type EventSchemaVersion = string; // semver
export interface EventSchema {
  type: string;       // e.g. "user.created"
  version: EventSchemaVersion;
  schema: Record<string, unknown>; // JSON Schema
  description: string;
  producer: string;   // service id
  consumers: string[];
  examples?: unknown[];
  deprecated?: boolean;
}

export interface EnterpriseEvent<TPayload = unknown> {
  id: string;           // ULID/UUID
  type: string;
  schemaVersion: EventSchemaVersion;
  timestamp: string;
  producer: string;     // service id
  correlationId: string;
  causationId?: string;
  traceId?: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
}

export interface DeadLetterEntry {
  id: string;
  event: EnterpriseEvent;
  failedConsumer: string;
  error: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  status: "pending" | "replayed" | "discarded";
}

// ─── Slice 165: API Governance ───────────────────────────────────────────
export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  serviceId: string;
  version: string;
  summary?: string;
  deprecated?: boolean;
  authRequired: boolean;
  minRole?: string;
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  rateLimitTier?: string;
}

export interface ApiVersion {
  version: string;        // "v1"
  introducedAt: string;
  sunsetAt?: string;
  status: "current" | "preview" | "deprecated" | "sunset";
}

export interface OpenAPISpec {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
}
