/**
 * Prompt Template Renderer (Module 2 — Gap 3)
 *
 * Renders prompt templates with variable substitution and conditional logic.
 * Templates use a simple syntax:
 *   {{variable}}          — substitute variable value
 *   {{#if variable}}...{{/if}}  — conditional block
 *   {{#unless variable}}...{{/unless}}  — negative conditional
 *   {{#each items}}...{{/each}}  — iteration (item available as {{.}})
 *   {{#upper variable}}   — uppercase transform
 *   {{#lower variable}}   — lowercase transform
 *   {{#truncate variable 100}}  — truncate to N chars
 *
 * Templates are stored in the PromptTemplate model and can be versioned.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";

// ─── Template Rendering Engine ──────────────────────────────────

export interface RenderContext {
  [key: string]: any;
}

/**
 * Render a template string with the given context.
 */
export function renderTemplate(template: string, context: RenderContext): string {
  let result = template;

  // Process {{#each items}}...{{/each}} blocks
  result = processEachBlocks(result, context);

  // Process {{#if variable}}...{{/if}} blocks
  result = processIfBlocks(result, context);

  // Process {{#unless variable}}...{{/unless}} blocks
  result = processUnlessBlocks(result, context);

  // Process transform helpers
  result = processTransforms(result, context);

  // Process simple {{variable}} substitutions
  result = processVariables(result, context);

  return result;
}

function processEachBlocks(template: string, context: RenderContext): string {
  const regex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  return template.replace(regex, (_, listName, body) => {
    const list = context[listName];
    if (!Array.isArray(list)) return "";
    return list
      .map((item, index) => {
        const itemContext = typeof item === "object"
          ? { ...context, ...item, ".": JSON.stringify(item), index }
          : { ...context, ".": String(item), index };
        return renderTemplate(body, itemContext);
      })
      .join("");
  });
}

function processIfBlocks(template: string, context: RenderContext): string {
  const regex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{#else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  return template.replace(regex, (_, varName, ifBody, elseBody = "") => {
    const value = context[varName];
    const truthy = value !== undefined && value !== null && value !== false && value !== "" && value !== 0;
    return truthy ? renderTemplate(ifBody, context) : renderTemplate(elseBody, context);
  });
}

function processUnlessBlocks(template: string, context: RenderContext): string {
  const regex = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  return template.replace(regex, (_, varName, body) => {
    const value = context[varName];
    const falsy = value === undefined || value === null || value === false || value === "" || value === 0;
    return falsy ? renderTemplate(body, context) : "";
  });
}

function processTransforms(template: string, context: RenderContext): string {
  // {{#upper variable}}
  template = template.replace(/\{\{#upper\s+(\w+)\}\}/g, (_, varName) => {
    const value = context[varName];
    return value ? String(value).toUpperCase() : "";
  });

  // {{#lower variable}}
  template = template.replace(/\{\{#lower\s+(\w+)\}\}/g, (_, varName) => {
    const value = context[varName];
    return value ? String(value).toLowerCase() : "";
  });

  // {{#truncate variable N}}
  template = template.replace(/\{\{#truncate\s+(\w+)\s+(\d+)\}\}/g, (_, varName, maxLen) => {
    const value = context[varName];
    if (!value) return "";
    const str = String(value);
    const max = parseInt(maxLen, 10);
    return str.length > max ? str.slice(0, max) + "…" : str;
  });

  // {{#default variable "fallback"}}
  template = template.replace(/\{\{#default\s+(\w+)\s+"([^"]*)"\}\}/g, (_, varName, fallback) => {
    const value = context[varName];
    return value !== undefined && value !== null && value !== "" ? String(value) : fallback;
  });

  return template;
}

function processVariables(template: string, context: RenderContext): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    // Support nested paths like user.name
    const parts = path.split(".");
    let value: any = context;
    for (const part of parts) {
      if (value === undefined || value === null) return "";
      value = value[part];
    }
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

// ─── Template Management ────────────────────────────────────────

/** Resolve a template by its user-facing title inside an organization. */
export async function renderNamedTemplate(
  title: string,
  context: RenderContext,
  organizationId?: string,
): Promise<string | null> {
  if (!organizationId) return null;
  const template = await prisma.promptTemplate.findFirst({
    where: { organizationId, title: { equals: title, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
  });
  if (!template) {
    logger.debug("Prompt template not found", { title, organizationId });
    return null;
  }
  return renderTemplate(template.content, context);
}

/** Return the variables a caller needs to provide for a template. */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();
  const regex = /\{\{(?:#(?:if|unless|each|upper|lower|truncate|default)\s+)?(\w+(?:\.\w+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) variables.add(match[1]!.split(".")[0]!);
  return [...variables];
}

/** Preview a template without persisting or executing it. */
export function testTemplate(templateContent: string, context: RenderContext): { rendered: string; variables: string[]; errors: string[] } {
  try {
    return { rendered: renderTemplate(templateContent, context), variables: extractVariables(templateContent), errors: [] };
  } catch (error) {
    return { rendered: "", variables: extractVariables(templateContent), errors: [error instanceof Error ? error.message : "Template rendering failed"] };
  }
}
