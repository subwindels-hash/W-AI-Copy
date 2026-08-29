/**
 * Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System.
 *
 * A core capability of WINDELS AI OS: the platform understands its owner,
 * organizations, companies, brands and products ONLY from approved, verified,
 * governed knowledge intentionally stored here.
 *
 * Governance rules encoded in this contract:
 *   - ONLY the Super Admin may create/edit/approve/publish/archive/delete
 *     knowledge records (enforced by requireSuperAdmin in the routes and by
 *     `superAdminOnly` checks in the service);
 *   - every record carries a `classification` (private | organization |
 *     public), a `verified` flag (set only by a Super Admin publish) and a
 *     lifecycle (draft → pending_approval → approved → published | archived);
 *   - every mutation appends a version; every mutation is audit-logged;
 *   - the AI response engine answers only from records the caller may see,
 *     ranks Verified highest, labels AI-generated summaries as such, lists
 *     its sources, and says "I do not have sufficient approved knowledge"
 *     rather than fabricating.
 */

import { z } from "zod";

/* ── Kinds ──────────────────────────────────────────────────────────────── */

export const IDENTITY_KNOWLEDGE_KINDS = [
  "biography_personal", "biography_professional", "biography_executive",
  "biography_founder", "biography_public", "biography_official",
  "founder_profile", "leadership_profile", "speaking_profile", "media_bio",
  "brand_story", "mission", "vision", "values", "career_history",
  "experience", "education", "certification", "award", "achievement",
  "publication", "research", "interview", "press_release", "announcement",
  "contact", "website", "social", "faq", "statement", "vision_future",
  "organization_profile", "company_profile", "product", "service",
  "project", "industry", "document",
] as const;
export type IdentityKnowledgeKind = (typeof IDENTITY_KNOWLEDGE_KINDS)[number];

export const IDENTITY_KNOWLEDGE_CLASSIFICATIONS = ["private", "organization", "public"] as const;
export type IdentityKnowledgeClassification = (typeof IDENTITY_KNOWLEDGE_CLASSIFICATIONS)[number];

export const IDENTITY_KNOWLEDGE_STATUSES = [
  "draft", "pending_approval", "approved", "published", "archived",
] as const;
export type IdentityKnowledgeStatus = (typeof IDENTITY_KNOWLEDGE_STATUSES)[number];

/* ── Records ────────────────────────────────────────────────────────────── */

export interface IkDocumentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: "pdf" | "docx" | "txt" | "image" | "video" | "presentation" | "other";
}

export interface IkKnowledgeRecord {
  id: string;
  kind: IdentityKnowledgeKind;
  title: string;
  /** Markdown body — the approved content. */
  body: string;
  classification: IdentityKnowledgeClassification;
  /** Set ONLY by a Super Admin publish. Verified records rank highest in AI
   *  responses. */
  verified: boolean;
  status: IdentityKnowledgeStatus;
  category: string;
  tags: string[];
  documents: IkDocumentRef[];
  /** Related record ids (knowledge-graph edges). */
  relations: Array<{ targetId: string; relation: string }>;
  /** Explicit viewer grants for private records (user ids). */
  grants: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
}

export interface IkRecordVersion {
  version: number;
  recordId: string;
  title: string;
  body: string;
  classification: IdentityKnowledgeClassification;
  status: IdentityKnowledgeStatus;
  action: string;
  actor: string;
  at: string;
}

/* ── AI response engine ─────────────────────────────────────────────────── */

export const IK_ANSWER_SECTIONS = [
  "verified_facts", "super_admin_approved", "organization_information",
  "ai_generated_summary", "unknown",
] as const;
export type IkAnswerSection = (typeof IK_ANSWER_SECTIONS)[number];

export interface IkAnswerSource {
  recordId: string;
  title: string;
  kind: IdentityKnowledgeKind;
  classification: IdentityKnowledgeClassification;
  verified: boolean;
  /** Which part of the answer used this record. */
  usedIn: IkAnswerSection[];
}

export interface IkAnswer {
  question: string;
  /** The permission-aware answer text. */
  answer: string;
  sections: Array<{
    section: IkAnswerSection;
    /** Label of the section, e.g. "Verified Facts". */
    label: string;
    text: string;
  }>;
  /** Full source traceability — every response references its approved
   *  knowledge sources and remains auditable. */
  sources: IkAnswerSource[];
  /** "answered" | "insufficient_knowledge" | "restricted" */
  outcome: "answered" | "insufficient_knowledge" | "restricted";
  aiGenerated: boolean;
  answeredAt: string;
}

/* ── Knowledge agents (AI Workforce integration) ────────────────────────── */

export const IK_AGENTS = [
  { id: "biography_agent",          title: "Biography Agent",           role: "compile approved biography records into a labelled profile synthesis", permission: "member" },
  { id: "organization_knowledge_agent", title: "Organization Knowledge Agent", role: "compile approved organization/leadership profiles", permission: "member" },
  { id: "company_profile_agent",    title: "Company Profile Agent",     role: "compile approved company/brand/product profiles", permission: "member" },
  { id: "knowledge_verification_agent", title: "Knowledge Verification Agent", role: "list records awaiting verification and flag unverified content", permission: "member" },
  { id: "knowledge_curator_agent",  title: "Knowledge Curator Agent",   role: "list drafts/archived records and suggest review priorities", permission: "member" },
  { id: "knowledge_synchronization_agent", title: "Knowledge Synchronization Agent", role: "sync all published records into the Memory Fabric + Kernel", permission: "super_admin" },
  { id: "ai_memory_manager",        title: "AI Memory Manager",         role: "report memory-sync state of the knowledge base", permission: "member" },
  { id: "public_information_agent", title: "Public Information Agent",  role: "compile public-only knowledge for external representation", permission: "member" },
] as const;
export type IkAgentId = (typeof IK_AGENTS)[number]["id"];

export interface IkAgentRun {
  agentId: IkAgentId;
  title: string;
  /** Deterministic role output — never fabricated. */
  summary: string;
  items: Array<{ id: string; title: string; note: string }>;
  aiGenerated: boolean;
  ranAt: string;
}

/* ── Dashboard / graph / activity ───────────────────────────────────────── */

export interface IkDashboard {
  total: number;
  byKind: Record<string, number>;
  byClassification: Record<string, number>;
  byStatus: Record<string, number>;
  verifiedCount: number;
  publishedCount: number;
  pendingApproval: number;
  documents: number;
  memorySynced: number;
  generatedAt: string;
}

export interface IkGraphNode {
  id: string;
  kind: IdentityKnowledgeKind;
  title: string;
  classification: IdentityKnowledgeClassification;
  verified: boolean;
}

export interface IkGraph {
  nodes: IkGraphNode[];
  edges: Array<{ from: string; to: string; relation: string }>;
  note: string;
}

export interface IkActivityEntry {
  at: string;
  action: string;
  label: string;
}

/* ── Zod schemas ────────────────────────────────────────────────────────── */

export const IkRecordCreateSchema = z.object({
  kind: z.enum(IDENTITY_KNOWLEDGE_KINDS),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  classification: z.enum(IDENTITY_KNOWLEDGE_CLASSIFICATIONS).default("organization"),
  category: z.string().trim().max(60).default("general"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type IkRecordCreateInput = z.infer<typeof IkRecordCreateSchema>;

export const IkRecordUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(50_000).optional(),
  classification: z.enum(IDENTITY_KNOWLEDGE_CLASSIFICATIONS).optional(),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(IDENTITY_KNOWLEDGE_STATUSES).optional(),
}).refine((v) => Object.keys(v).length > 0, "At least one field is required");
export type IkRecordUpdateInput = z.infer<typeof IkRecordUpdateSchema>;

export const IkRecordQuerySchema = z.object({
  kind: z.enum(IDENTITY_KNOWLEDGE_KINDS).optional(),
  classification: z.enum(IDENTITY_KNOWLEDGE_CLASSIFICATIONS).optional(),
  status: z.enum(IDENTITY_KNOWLEDGE_STATUSES).optional(),
  tag: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const IkAskSchema = z.object({
  question: z.string().trim().min(2).max(500),
});
export type IkAskInput = z.infer<typeof IkAskSchema>;

export const IkRelationSchema = z.object({
  targetId: z.string().min(1).max(64),
  relation: z.string().trim().min(1).max(60),
});

export const IkGrantSchema = z.object({
  userId: z.string().cuid(),
});

export const IkImportSchema = z.array(IkRecordCreateSchema).min(1).max(500);

export const IkAgentRunSchema = z.object({});
