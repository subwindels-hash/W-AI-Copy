/**
 * Agent Packaging Service (Module 15 — Gap 1)
 *
 * Package agents for distribution and marketplace:
 * - Standard agent package format with metadata
 * - Package agent components (skills, knowledge, goals, plans, configuration)
 * - Dependency management and validation
 * - Export and import packages
 * - Package signing and verification
 *
 * Enables agent distribution and marketplace ecosystem.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import { createHash } from "crypto";

// ─── Types ──────────────────────────────────────────────────────

export interface AgentPackage {
  id: string;
  formatVersion: string; // Package format version (e.g., "1.0.0")
  metadata: AgentPackageMetadata;
  agent: AgentDefinition;
  components: AgentPackageComponents;
  dependencies: AgentDependency[];
  signature?: string;
  createdAt: string;
}

export interface AgentPackageMetadata {
  name: string;
  displayName: string;
  description: string;
  version: string; // Semantic version (e.g., "1.2.3")
  author: string;
  authorId: string;
  organizationId: string;
  department: string;
  tags: string[];
  category: string;
  license: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  icon?: string; // URL or base64
  screenshots?: string[]; // URLs
  compliance: string[]; // GDPR, SOC2, HIPAA, etc.
  requirements: {
    minPlatformVersion?: string;
    requiredModules?: string[];
    requiredPermissions?: string[];
  };
}

export interface AgentDefinition {
  name: string;
  role: string;
  description: string;
  systemPrompt?: string;
  personality?: string;
  capabilities: string[];
  configuration: Record<string, any>;
}

export interface AgentPackageComponents {
  skills: SkillDefinition[];
  knowledge: KnowledgeDefinition[];
  goals: GoalDefinition[];
  plans: PlanDefinition[];
  rules: RuleDefinition[];
  tools: ToolDefinition[];
  workflows: WorkflowDefinition[];
  templates: TemplateDefinition[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  type: "built-in" | "custom";
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface KnowledgeDefinition {
  name: string;
  type: "document" | "rag" | "database" | "api";
  source: string;
  description: string;
  configuration: Record<string, any>;
}

export interface GoalDefinition {
  name: string;
  type: "strategic" | "tactical" | "operational";
  description: string;
  objectives: Array<{
    description: string;
    targetValue?: number;
    unit?: string;
  }>;
  successCriteria: Array<{
    metric: string;
    target: number;
    operator: string;
  }>;
}

export interface PlanDefinition {
  name: string;
  description: string;
  actions: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
    preconditions: string[];
  }>;
}

export interface RuleDefinition {
  name: string;
  description: string;
  condition: string;
  action: string;
  priority: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  type: "api" | "function" | "mcp";
  endpoint?: string;
  parameters: Record<string, any>;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: Array<{
    name: string;
    action: string;
    parameters: Record<string, any>;
  }>;
}

export interface TemplateDefinition {
  name: string;
  type: "prompt" | "response" | "document";
  content: string;
  variables: string[];
}

export interface AgentDependency {
  name: string;
  version: string; // Semantic version range (e.g., "^1.2.0")
  type: "agent" | "skill" | "knowledge" | "tool" | "module";
  optional?: boolean;
}

export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Redis Keys ─────────────────────────────────────────────────

const PACKAGES_KEY = "packages:all";
const PACKAGE_KEY = (id: string) => `packages:package:${id}`;
const PACKAGE_BY_NAME_KEY = (name: string, version: string) => `packages:name:${name}:${version}`;

// ─── Package Creation ───────────────────────────────────────────

/**
 * Create an agent package from an existing agent.
 */
export async function createAgentPackage(input: {
  agentId: string;
  metadata: Omit<AgentPackageMetadata, "authorId" | "organizationId">;
  includeComponents?: {
    skills?: boolean;
    knowledge?: boolean;
    goals?: boolean;
    plans?: boolean;
    rules?: boolean;
    tools?: boolean;
    workflows?: boolean;
    templates?: boolean;
  };
}): Promise<AgentPackage> {
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    include: {
      skills: true,
      knowledge: true,
      goals: true,
      plans: true,
    },
  });

  if (!agent) {
    throw new Error(`Agent ${input.agentId} not found`);
  }

  const packageId = randomUUID();
  const now = new Date().toISOString();

  // Build agent definition
  const agentDefinition: AgentDefinition = {
    name: agent.name,
    role: agent.role,
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? undefined,
    personality: agent.personality ?? undefined,
    capabilities: agent.capabilities,
    configuration: agent.configuration as Record<string, any>,
  };

  // Build components
  const components: AgentPackageComponents = {
    skills: [],
    knowledge: [],
    goals: [],
    plans: [],
    rules: [],
    tools: [],
    workflows: [],
    templates: [],
  };

  if (input.includeComponents?.skills !== false) {
    components.skills = agent.skills.map(skill => ({
      name: skill.name,
      description: skill.description ?? "",
      type: "custom",
      configuration: skill.configuration as Record<string, any>,
      enabled: skill.enabled,
    }));
  }

  if (input.includeComponents?.knowledge !== false) {
    components.knowledge = agent.knowledge.map(k => ({
      name: k.name,
      type: "document",
      source: k.source ?? "",
      description: k.description ?? "",
      configuration: {},
    }));
  }

  if (input.includeComponents?.goals !== false) {
    components.goals = agent.goals.map(goal => ({
      name: goal.name,
      type: goal.type as any,
      description: goal.description ?? "",
      objectives: goal.objectives as any,
      successCriteria: goal.successCriteria as any,
    }));
  }

  if (input.includeComponents?.plans !== false) {
    components.plans = agent.plans.map(plan => ({
      name: plan.name,
      description: plan.description ?? "",
      actions: [], // Would need to fetch plan actions
    }));
  }

  // Build package
  const pkg: AgentPackage = {
    id: packageId,
    formatVersion: "1.0.0",
    metadata: {
      ...input.metadata,
      authorId: agent.createdBy ?? "",
      organizationId: agent.organizationId,
    },
    agent: agentDefinition,
    components,
    dependencies: [],
    createdAt: now,
  };

  // Store package
  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));
  await redisCmd.sadd(PACKAGES_KEY, packageId);
  await redisCmd.set(PACKAGE_BY_NAME_KEY(input.metadata.name, input.metadata.version), packageId);

  logger.info("Agent package created", {
    packageId,
    name: input.metadata.name,
    version: input.metadata.version,
    agentId: input.agentId,
  });

  return pkg;
}

/**
 * Get an agent package by ID.
 */
export async function getAgentPackage(id: string): Promise<AgentPackage | null> {
  const data = await redisCmd.get(PACKAGE_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * Get an agent package by name and version.
 */
export async function getAgentPackageByName(
  name: string,
  version?: string,
): Promise<AgentPackage | null> {
  if (version) {
    const id = await redisCmd.get(PACKAGE_BY_NAME_KEY(name, version));
    return id ? getAgentPackage(id) : null;
  }

  // Get latest version
  const allIds = await redisCmd.smembers(PACKAGES_KEY);
  const packages: AgentPackage[] = [];

  for (const id of allIds) {
    const pkg = await getAgentPackage(id);
    if (pkg && pkg.metadata.name === name) {
      packages.push(pkg);
    }
  }

  if (packages.length === 0) return null;

  // Sort by version and return latest
  packages.sort((a, b) => compareVersions(b.metadata.version, a.metadata.version));
  return packages[0];
}

/**
 * List all agent packages.
 */
export async function listAgentPackages(filter?: {
  authorId?: string;
  organizationId?: string;
  department?: string;
  category?: string;
  tags?: string[];
}): Promise<AgentPackage[]> {
  const ids = await redisCmd.smembers(PACKAGES_KEY);
  const packages: AgentPackage[] = [];

  for (const id of ids) {
    const pkg = await getAgentPackage(id);
    if (!pkg) continue;

    if (filter?.authorId && pkg.metadata.authorId !== filter.authorId) continue;
    if (filter?.organizationId && pkg.metadata.organizationId !== filter.organizationId) continue;
    if (filter?.department && pkg.metadata.department !== filter.department) continue;
    if (filter?.category && pkg.metadata.category !== filter.category) continue;
    if (filter?.tags?.length) {
      const hasAllTags = filter.tags.every(tag => pkg.metadata.tags.includes(tag));
      if (!hasAllTags) continue;
    }

    packages.push(pkg);
  }

  return packages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Package Validation ─────────────────────────────────────────

/**
 * Validate an agent package.
 */
export async function validateAgentPackage(pkg: AgentPackage): Promise<PackageValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate format version
  if (!pkg.formatVersion) {
    errors.push("Missing format version");
  }

  // Validate metadata
  if (!pkg.metadata.name) errors.push("Missing package name");
  if (!pkg.metadata.version) errors.push("Missing package version");
  if (!pkg.metadata.description) errors.push("Missing package description");
  if (!pkg.metadata.author) errors.push("Missing author");

  // Validate version format
  if (pkg.metadata.version && !isValidSemver(pkg.metadata.version)) {
    errors.push(`Invalid version format: ${pkg.metadata.version}`);
  }

  // Validate agent definition
  if (!pkg.agent.name) errors.push("Missing agent name");
  if (!pkg.agent.role) errors.push("Missing agent role");

  // Validate components
  for (const skill of pkg.components.skills) {
    if (!skill.name) warnings.push("Skill missing name");
  }

  for (const knowledge of pkg.components.knowledge) {
    if (!knowledge.name) warnings.push("Knowledge item missing name");
    if (!knowledge.source) warnings.push(`Knowledge item "${knowledge.name}" missing source`);
  }

  // Validate dependencies
  for (const dep of pkg.dependencies) {
    if (!dep.name) errors.push("Dependency missing name");
    if (!dep.version) errors.push(`Dependency "${dep.name}" missing version`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Package Export/Import ──────────────────────────────────────

/**
 * Export an agent package as JSON.
 */
export async function exportAgentPackage(packageId: string): Promise<string> {
  const pkg = await getAgentPackage(packageId);
  if (!pkg) {
    throw new Error(`Package ${packageId} not found`);
  }

  return JSON.stringify(pkg, null, 2);
}

/**
 * Import an agent package from JSON.
 */
export async function importAgentPackage(
  json: string,
  options?: {
    overwrite?: boolean;
    validate?: boolean;
  },
): Promise<AgentPackage> {
  const pkg: AgentPackage = JSON.parse(json);

  // Validate if requested
  if (options?.validate !== false) {
    const validation = await validateAgentPackage(pkg);
    if (!validation.valid) {
      throw new Error(`Invalid package: ${validation.errors.join(", ")}`);
    }
  }

  // Check if package already exists
  const existing = await getAgentPackageByName(pkg.metadata.name, pkg.metadata.version);
  if (existing && !options?.overwrite) {
    throw new Error(`Package ${pkg.metadata.name}@${pkg.metadata.version} already exists`);
  }

  // Store package
  const packageId = existing?.id ?? randomUUID();
  pkg.id = packageId;

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));
  await redisCmd.sadd(PACKAGES_KEY, packageId);
  await redisCmd.set(PACKAGE_BY_NAME_KEY(pkg.metadata.name, pkg.metadata.version), packageId);

  logger.info("Agent package imported", {
    packageId,
    name: pkg.metadata.name,
    version: pkg.metadata.version,
  });

  return pkg;
}

// ─── Package Signing ────────────────────────────────────────────

/**
 * Sign an agent package.
 */
export async function signAgentPackage(
  packageId: string,
  privateKey: string,
): Promise<AgentPackage> {
  const pkg = await getAgentPackage(packageId);
  if (!pkg) {
    throw new Error(`Package ${packageId} not found`);
  }

  // Create signature (simplified - in production use proper crypto)
  const content = JSON.stringify({
    metadata: pkg.metadata,
    agent: pkg.agent,
    components: pkg.components,
    dependencies: pkg.dependencies,
  });

  const hash = createHash("sha256").update(content).digest("hex");
  pkg.signature = hash;

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));

  logger.info("Agent package signed", { packageId, signature: hash.slice(0, 16) });

  return pkg;
}

/**
 * Verify an agent package signature.
 */
export async function verifyAgentPackage(packageId: string): Promise<boolean> {
  const pkg = await getAgentPackage(packageId);
  if (!pkg || !pkg.signature) {
    return false;
  }

  // Verify signature (simplified)
  const content = JSON.stringify({
    metadata: pkg.metadata,
    agent: pkg.agent,
    components: pkg.components,
    dependencies: pkg.dependencies,
  });

  const hash = createHash("sha256").update(content).digest("hex");
  return hash === pkg.signature;
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Compare semantic versions.
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Check if version is valid semantic version.
 */
function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
}

/**
 * Get package statistics.
 */
export async function getPackageStats(): Promise<{
  totalPackages: number;
  byDepartment: Record<string, number>;
  byCategory: Record<string, number>;
  topAuthors: Array<{ authorId: string; author: string; count: number }>;
}> {
  const packages = await listAgentPackages();

  const byDepartment: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const authorCounts: Record<string, { author: string; count: number }> = {};

  for (const pkg of packages) {
    byDepartment[pkg.metadata.department] = (byDepartment[pkg.metadata.department] ?? 0) + 1;
    byCategory[pkg.metadata.category] = (byCategory[pkg.metadata.category] ?? 0) + 1;

    if (!authorCounts[pkg.metadata.authorId]) {
      authorCounts[pkg.metadata.authorId] = {
        author: pkg.metadata.author,
        count: 0,
      };
    }
    authorCounts[pkg.metadata.authorId].count++;
  }

  const topAuthors = Object.entries(authorCounts)
    .map(([authorId, data]) => ({ authorId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalPackages: packages.length,
    byDepartment,
    byCategory,
    topAuthors,
  };
}
