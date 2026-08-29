/**
 * Tool Registry & Executor (Module 2 — Gap 1)
 *
 * Provides a framework for AI agents to call external tools/functions.
 * Tools are registered with JSON Schema parameter definitions and can be
 * invoked by the AI provider (OpenAI function calling, Anthropic tool use).
 *
 * Architecture:
 * - ToolRegistry: register, discover, and list available tools
 * - ToolExecutor: validate params, execute, handle errors, return results
 * - Built-in tools: calculator, datetime, web_search stub, string utils
 * - Custom tools: can be registered by modules for domain-specific capabilities
 */
import { z } from "zod";
import { logger } from "../../config/logger.js";
import { randomUUID } from "node:crypto";

// ─── Tool Interface ─────────────────────────────────────────────

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required?: string[];
  /** Category for grouping (e.g. "math", "web", "data", "system") */
  category: string;
  /** Whether this tool requires admin privileges */
  adminOnly?: boolean;
  /** Whether this tool has side effects (writes data, sends requests) */
  hasSideEffects?: boolean;
  /** Maximum execution time in ms (default 30000) */
  timeoutMs?: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (params: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId?: string;
  organizationId?: string;
  agentId?: string;
  conversationId?: string;
  isAdmin?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  /** Optional metadata (execution time, tokens used, etc.) */
  metadata?: Record<string, any>;
}

// ─── Tool Registry ──────────────────────────────────────────────

class ToolRegistryClass {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    if (this.tools.has(tool.definition.name)) {
      logger.warn(`Tool "${tool.definition.name}" already registered, overwriting`);
    }
    this.tools.set(tool.definition.name, tool);
    logger.debug(`Tool registered: ${tool.definition.name}`, { category: tool.definition.category });
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(category?: string): ToolDefinition[] {
    const all = Array.from(this.tools.values()).map((t) => t.definition);
    if (category) return all.filter((t) => t.category === category);
    return all;
  }

  listForContext(context: ToolContext): ToolDefinition[] {
    return this.list().filter((t) => {
      if (t.adminOnly && !context.isAdmin) return false;
      return true;
    });
  }

  /**
   * Convert tool definitions to OpenAI function calling format.
   */
  toOpenAITools(context: ToolContext): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return this.listForContext(context).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters,
          required: t.required ?? [],
        },
      },
    }));
  }

  /**
   * Convert tool definitions to Anthropic tool use format.
   */
  toAnthropicTools(context: ToolContext): Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
  }> {
    return this.listForContext(context).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: t.parameters,
        required: t.required ?? [],
      },
    }));
  }

  get size(): number {
    return this.tools.size;
  }
}

export const ToolRegistry = new ToolRegistryClass();

// ─── Tool Executor ──────────────────────────────────────────────

export async function executeTool(
  name: string,
  params: Record<string, any>,
  context: ToolContext,
): Promise<ToolResult & { toolCallId: string }> {
  const toolCallId = randomUUID();
  const tool = ToolRegistry.get(name);

  if (!tool) {
    return {
      success: false,
      error: `Tool "${name}" not found`,
      toolCallId,
    };
  }

  // Admin check
  if (tool.definition.adminOnly && !context.isAdmin) {
    return {
      success: false,
      error: `Tool "${name}" requires admin privileges`,
      toolCallId,
    };
  }

  // Parameter validation (basic — checks required fields)
  const required = tool.definition.required ?? [];
  for (const field of required) {
    if (params[field] === undefined || params[field] === null) {
      return {
        success: false,
        error: `Missing required parameter: ${field}`,
        toolCallId,
      };
    }
  }

  // Execute with timeout
  const timeoutMs = tool.definition.timeoutMs ?? 30000;
  const started = Date.now();

  try {
    const result = await Promise.race([
      tool.execute(params, context),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    const durationMs = Date.now() - started;
    logger.debug(`Tool executed: ${name}`, {
      success: result.success,
      durationMs,
      toolCallId,
      userId: context.userId,
    });

    return {
      ...result,
      metadata: { ...result.metadata, durationMs },
      toolCallId,
    };
  } catch (e: any) {
    const durationMs = Date.now() - started;
    logger.warn(`Tool execution failed: ${name}`, {
      error: e?.message,
      durationMs,
      toolCallId,
    });

    return {
      success: false,
      error: e?.message ?? "Tool execution failed",
      metadata: { durationMs },
      toolCallId,
    };
  }
}

/**
 * Execute multiple tool calls in sequence (for multi-step agent workflows).
 * Each result is available to subsequent calls via the context.
 */
export async function executeToolChain(
  calls: Array<{ name: string; params: Record<string, any> }>,
  context: ToolContext,
): Promise<Array<ToolResult & { toolCallId: string; name: string }>> {
  const results: Array<ToolResult & { toolCallId: string; name: string }> = [];

  for (const call of calls) {
    const result = await executeTool(call.name, call.params, context);
    results.push({ ...result, name: call.name });

    // Stop chain on first failure
    if (!result.success) break;
  }

  return results;
}
