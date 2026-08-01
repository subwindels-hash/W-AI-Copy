/**
 * Agent Skills Service (Module 3 — Gap 1)
 *
 * Manages agent capabilities/skills. Skills are wrappers around tools
 * from the ToolRegistry (Module 2) that can be enabled/disabled per agent.
 * Each skill has a name, description, configuration, and links to a tool.
 *
 * Skills allow fine-grained control over what an agent can do:
 * - Enable/disable specific capabilities per agent
 * - Configure tool parameters per agent
 * - Track which skills are most used
 * - Prevent agents from using tools they shouldn't have access to
 */
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { ToolRegistry, executeTool, type ToolContext } from "./tools/toolRegistry.js";
import { logger } from "../config/logger.js";
import { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";

// ─── Schemas ────────────────────────────────────────────────────

export const CreateSkillSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  toolName: z.string().min(1).max(64), // Links to ToolRegistry
  config: z.record(z.any()).optional(),
  enabled: z.boolean().default(true),
});

export const UpdateSkillSchema = CreateSkillSchema.partial();

// ─── Serialization ──────────────────────────────────────────────

function serializeSkill(s: any) {
  return {
    id: s.id,
    agentId: s.agentId,
    name: s.name,
    description: s.description,
    toolName: s.config?.toolName ?? s.name,
    config: s.config ?? {},
    enabled: s.enabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ─── Access Control ─────────────────────────────────────────────

async function assertAgentAccess(userId: string, agentId: string) {
  const ctx = await resolveUserContext(userId);
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId: ctx.organizationId },
  });
  if (!agent) throw AppError.notFound("Agent not found");
  return { ctx, agent };
}

// ─── CRUD Operations ────────────────────────────────────────────

/**
 * List all skills for an agent.
 */
export async function listAgentSkills(
  userId: string,
  agentId: string,
  pagination: PaginationQuery & { enabled?: boolean },
) {
  await assertAgentAccess(userId, agentId);
  const where: any = { agentId };
  if (pagination.enabled !== undefined) where.enabled = pagination.enabled;

  const [items, total] = await Promise.all([
    prisma.agentSkill.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pagination.page - 1) * pagination.perPage,
      take: pagination.perPage,
    }),
    prisma.agentSkill.count({ where }),
  ]);

  return {
    items: items.map(serializeSkill),
    pagination: {
      page: pagination.page,
      perPage: pagination.perPage,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    },
  };
}

/**
 * Get a specific skill by ID.
 */
export async function getSkill(userId: string, agentId: string, skillId: string) {
  await assertAgentAccess(userId, agentId);
  const skill = await prisma.agentSkill.findFirst({
    where: { id: skillId, agentId },
  });
  if (!skill) throw AppError.notFound("Skill not found");
  return serializeSkill(skill);
}

/**
 * Create a new skill for an agent.
 */
export async function createSkill(
  userId: string,
  agentId: string,
  input: z.infer<typeof CreateSkillSchema>,
) {
  const { ctx } = await assertAgentAccess(userId, agentId);

  // Validate tool exists in registry
  const tool = ToolRegistry.get(input.toolName);
  if (!tool) {
    throw AppError.badRequest(
      `Tool "${input.toolName}" not found in registry. Available tools: ${ToolRegistry.list()
        .map((t) => t.name)
        .join(", ")}`,
    );
  }

  // Check for duplicate skill name
  const existing = await prisma.agentSkill.findFirst({
    where: { agentId, name: input.name },
  });
  if (existing) {
    throw AppError.conflict(`Skill "${input.name}" already exists for this agent`);
  }

  const skill = await prisma.agentSkill.create({
    data: {
      agentId,
      name: input.name,
      description: input.description,
      config: { ...input.config, toolName: input.toolName },
      enabled: input.enabled,
    },
  });

  logger.info("Agent skill created", {
    agentId,
    skillId: skill.id,
    skillName: skill.name,
    toolName: input.toolName,
  });

  return serializeSkill(skill);
}

/**
 * Update an existing skill.
 */
export async function updateSkill(
  userId: string,
  agentId: string,
  skillId: string,
  input: z.infer<typeof UpdateSkillSchema>,
) {
  await assertAgentAccess(userId, agentId);

  const existing = await prisma.agentSkill.findFirst({
    where: { id: skillId, agentId },
  });
  if (!existing) throw AppError.notFound("Skill not found");

  // If toolName is being changed, validate it
  if (input.toolName) {
    const tool = ToolRegistry.get(input.toolName);
    if (!tool) {
      throw AppError.badRequest(`Tool "${input.toolName}" not found in registry`);
    }
  }

  const skill = await prisma.agentSkill.update({
    where: { id: skillId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.config !== undefined || input.toolName !== undefined) && {
        config: {
          ...((existing.config as any) ?? {}),
          ...(input.config ?? {}),
          ...(input.toolName !== undefined && { toolName: input.toolName }),
        },
      },
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  });

  logger.info("Agent skill updated", {
    agentId,
    skillId: skill.id,
    skillName: skill.name,
  });

  return serializeSkill(skill);
}

/**
 * Delete a skill.
 */
export async function deleteSkill(userId: string, agentId: string, skillId: string) {
  await assertAgentAccess(userId, agentId);

  const existing = await prisma.agentSkill.findFirst({
    where: { id: skillId, agentId },
  });
  if (!existing) throw AppError.notFound("Skill not found");

  await prisma.agentSkill.delete({ where: { id: skillId } });

  logger.info("Agent skill deleted", {
    agentId,
    skillId,
    skillName: existing.name,
  });
}

/**
 * Enable or disable a skill.
 */
export async function toggleSkill(
  userId: string,
  agentId: string,
  skillId: string,
  enabled: boolean,
) {
  await assertAgentAccess(userId, agentId);

  const skill = await prisma.agentSkill.update({
    where: { id: skillId },
    data: { enabled },
  });

  logger.info("Agent skill toggled", {
    agentId,
    skillId,
    skillName: skill.name,
    enabled,
  });

  return serializeSkill(skill);
}

// ─── Skill Execution ────────────────────────────────────────────

/**
 * Get all enabled skills for an agent (used by agent runtime).
 */
export async function getAgentEnabledSkills(agentId: string) {
  const skills = await prisma.agentSkill.findMany({
    where: { agentId, enabled: true },
    orderBy: { name: "asc" },
  });
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    toolName: (s.config as any)?.toolName ?? s.name,
    config: (s.config as any) ?? {},
  }));
}

/**
 * Execute a skill for an agent.
 * Validates that the skill is enabled and the agent has access to it.
 */
export async function executeAgentSkill(
  agentId: string,
  skillName: string,
  params: Record<string, any>,
  context: Omit<ToolContext, "agentId">,
) {
  // Find the skill
  const skill = await prisma.agentSkill.findFirst({
    where: { agentId, name: skillName },
  });

  if (!skill) {
    throw AppError.notFound(`Agent does not have skill "${skillName}"`);
  }

  if (!skill.enabled) {
    throw AppError.forbidden(`Skill "${skillName}" is disabled`);
  }

  const toolName = (skill.config as any)?.toolName ?? skill.name;
  const toolConfig = (skill.config as any) ?? {};

  // Merge skill config with provided params (params take precedence)
  const mergedParams = { ...toolConfig, ...params };

  // Execute the tool
  const result = await executeTool(toolName, mergedParams, {
    ...context,
    agentId,
  });

  // Log the execution
  logger.debug("Agent skill executed", {
    agentId,
    skillName,
    toolName,
    success: result.success,
    durationMs: result.metadata?.durationMs,
  });

  return result;
}

/**
 * Check if an agent has a specific skill enabled.
 */
export async function agentHasSkill(agentId: string, skillName: string): Promise<boolean> {
  const skill = await prisma.agentSkill.findFirst({
    where: { agentId, name: skillName, enabled: true },
  });
  return !!skill;
}

// ─── Skill Templates ────────────────────────────────────────────

/**
 * Pre-defined skill templates that can be quickly added to agents.
 */
export const SKILL_TEMPLATES = {
  web_search: {
    name: "web_search",
    description: "Search the web for information",
    toolName: "web_search",
    config: { maxResults: 5 },
  },
  calculator: {
    name: "calculator",
    description: "Perform mathematical calculations",
    toolName: "calculator",
    config: {},
  },
  datetime: {
    name: "datetime",
    description: "Get current date/time and perform date calculations",
    toolName: "datetime",
    config: {},
  },
  random: {
    name: "random",
    description: "Generate random numbers and pick random items",
    toolName: "random",
    config: {},
  },
  string_utils: {
    name: "string_utils",
    description: "String manipulation utilities",
    toolName: "string_utils",
    config: {},
  },
} as const;

/**
 * Add a skill from a template.
 */
export async function addSkillFromTemplate(
  userId: string,
  agentId: string,
  templateName: keyof typeof SKILL_TEMPLATES,
) {
  const template = SKILL_TEMPLATES[templateName];
  if (!template) {
    throw AppError.badRequest(
      `Unknown template "${templateName}". Available: ${Object.keys(SKILL_TEMPLATES).join(", ")}`,
    );
  }

  // Templates are declared `as const` (readonly, and without the `enabled`
  // default). Parse them through the schema so the value handed to
  // createSkill is a plain, mutable object with defaults applied.
  return createSkill(userId, agentId, CreateSkillSchema.parse(template));
}

/**
 * List available skill templates.
 */
export function listSkillTemplates() {
  return Object.entries(SKILL_TEMPLATES).map(([key, template]) => ({
    key,
    ...template,
    available: !!ToolRegistry.get(template.toolName),
  }));
}
