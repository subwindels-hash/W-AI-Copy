/**
 * Built-in Tools (Module 2 — Gap 1)
 *
 * Standard tools available to all AI agents without external dependencies.
 * These provide basic capabilities that agents can use immediately.
 */
import { ToolRegistry, type Tool, type ToolContext, type ToolResult } from "../toolRegistry.js";
import "../../../cloudAndroid/tools.js";
import "../../../payments/blockonomicsAi.tools.js";

// ─── Calculator Tool ───────────────────────────────────────────

const calculatorTool: Tool = {
  definition: {
    name: "calculator",
    description: "Evaluate mathematical expressions. Supports basic arithmetic, parentheses, and common math functions.",
    category: "math",
    parameters: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate (e.g., '2 + 2 * 3', 'sqrt(16)', 'sin(3.14)')",
      },
    },
    required: ["expression"],
  },
  async execute(params: Record<string, any>): Promise<ToolResult> {
    try {
      // Safe math evaluation (no eval, no code execution)
      const expr = params.expression.trim();

      // Whitelist of allowed characters and functions
      const allowed = /^[\d\s+\-*/().,%^]+(sqrt|sin|cos|tan|log|exp|abs|ceil|floor|round|min|max|pow|PI|E)?[\d\s+\-*/().,%^]*$/;
      if (!allowed.test(expr.replace(/\b(sqrt|sin|cos|tan|log|exp|abs|ceil|floor|round|min|max|pow|PI|E)\b/g, ""))) {
        return { success: false, error: "Expression contains disallowed characters" };
      }

      // Replace math functions with Math.* equivalents
      let safeExpr = expr
        .replace(/\bsqrt\(/g, "Math.sqrt(")
        .replace(/\bsin\(/g, "Math.sin(")
        .replace(/\bcos\(/g, "Math.cos(")
        .replace(/\btan\(/g, "Math.tan(")
        .replace(/\blog\(/g, "Math.log(")
        .replace(/\bexp\(/g, "Math.exp(")
        .replace(/\babs\(/g, "Math.abs(")
        .replace(/\bceil\(/g, "Math.ceil(")
        .replace(/\bfloor\(/g, "Math.floor(")
        .replace(/\bround\(/g, "Math.round(")
        .replace(/\bmin\(/g, "Math.min(")
        .replace(/\bmax\(/g, "Math.max(")
        .replace(/\bpow\(/g, "Math.pow(")
        .replace(/\bPI\b/g, "Math.PI")
        .replace(/\bE\b/g, "Math.E")
        .replace(/\^/g, "**");

      // Use Function constructor for safe evaluation (no access to outer scope)
      const result = new Function(`"use strict"; return (${safeExpr});`)();

      if (typeof result !== "number" || !isFinite(result)) {
        return { success: false, error: "Expression did not evaluate to a finite number" };
      }

      return {
        success: true,
        data: { expression: params.expression, result, formatted: result.toLocaleString() },
      };
    } catch (e: any) {
      return { success: false, error: `Calculation error: ${e.message}` };
    }
  },
};

// ─── DateTime Tool ──────────────────────────────────────────────

const datetimeTool: Tool = {
  definition: {
    name: "datetime",
    description: "Get current date/time or perform date calculations",
    category: "system",
    parameters: {
      action: {
        type: "string",
        description: "Action to perform",
        enum: ["now", "add_days", "add_hours", "add_minutes", "format", "diff_days"],
      },
      date: {
        type: "string",
        description: "ISO date string (for add/diff operations)",
      },
      value: {
        type: "number",
        description: "Numeric value (days/hours/minutes to add)",
      },
      format: {
        type: "string",
        description: "Output format (ISO, locale, timestamp)",
        enum: ["iso", "locale", "timestamp"],
      },
    },
    required: ["action"],
  },
  async execute(params: Record<string, any>): Promise<ToolResult> {
    try {
      let result: Date;
      const base = params.date ? new Date(params.date) : new Date();

      switch (params.action) {
        case "now":
          result = new Date();
          break;
        case "add_days":
          result = new Date(base.getTime() + (params.value ?? 0) * 86400000);
          break;
        case "add_hours":
          result = new Date(base.getTime() + (params.value ?? 0) * 3600000);
          break;
        case "add_minutes":
          result = new Date(base.getTime() + (params.value ?? 0) * 60000);
          break;
        case "diff_days":
          if (!params.date) return { success: false, error: "date parameter required for diff_days" };
          const diff = Math.floor((new Date().getTime() - base.getTime()) / 86400000);
          return { success: true, data: { days: diff, from: params.date, to: new Date().toISOString() } };
        case "format":
          result = base;
          break;
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }

      let formatted: string;
      switch (params.format) {
        case "locale":
          formatted = result.toLocaleString();
          break;
        case "timestamp":
          formatted = String(result.getTime());
          break;
        case "iso":
        default:
          formatted = result.toISOString();
      }

      return {
        success: true,
        data: { iso: result.toISOString(), formatted, timestamp: result.getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      };
    } catch (e: any) {
      return { success: false, error: `DateTime error: ${e.message}` };
    }
  },
};

// ─── Random Tool ────────────────────────────────────────────────

const randomTool: Tool = {
  definition: {
    name: "random",
    description: "Generate random numbers or pick random items",
    category: "math",
    parameters: {
      action: {
        type: "string",
        description: "Type of random generation",
        enum: ["number", "integer", "pick", "shuffle", "uuid"],
      },
      min: { type: "number", description: "Minimum value (inclusive)" },
      max: { type: "number", description: "Maximum value (inclusive for integer, exclusive for number)" },
      items: { type: "string", description: "Comma-separated list (for pick/shuffle)" },
      count: { type: "number", description: "Number of items to pick" },
    },
    required: ["action"],
  },
  async execute(params: Record<string, any>): Promise<ToolResult> {
    try {
      switch (params.action) {
        case "number":
          const min = params.min ?? 0;
          const max = params.max ?? 1;
          return { success: true, data: { value: Math.random() * (max - min) + min } };

        case "integer":
          const iMin = Math.ceil(params.min ?? 0);
          const iMax = Math.floor(params.max ?? 100);
          return { success: true, data: { value: Math.floor(Math.random() * (iMax - iMin + 1)) + iMin } };

        case "pick":
          if (!params.items) return { success: false, error: "items parameter required" };
          const list = params.items.split(",").map((s: string) => s.trim());
          const count = Math.min(params.count ?? 1, list.length);
          const picked: string[] = [];
          const available = [...list];
          for (let i = 0; i < count; i++) {
            const idx = Math.floor(Math.random() * available.length);
            picked.push(available.splice(idx, 1)[0]);
          }
          return { success: true, data: { picked, from: list.length } };

        case "shuffle":
          if (!params.items) return { success: false, error: "items parameter required" };
          const arr = params.items.split(",").map((s: string) => s.trim());
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return { success: true, data: { shuffled: arr } };

        case "uuid":
          const { randomUUID } = await import("node:crypto");
          return { success: true, data: { uuid: randomUUID() } };

        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (e: any) {
      return { success: false, error: `Random error: ${e.message}` };
    }
  },
};

// ─── String Utils Tool ──────────────────────────────────────────

const stringUtilsTool: Tool = {
  definition: {
    name: "string_utils",
    description: "String manipulation utilities",
    category: "text",
    parameters: {
      action: {
        type: "string",
        description: "String operation",
        enum: ["length", "uppercase", "lowercase", "trim", "reverse", "count_words", "truncate", "replace"],
      },
      text: { type: "string", description: "Input text" },
      maxLength: { type: "number", description: "Max length for truncate" },
      search: { type: "string", description: "Search string for replace" },
      replace: { type: "string", description: "Replacement string" },
    },
    required: ["action", "text"],
  },
  async execute(params: Record<string, any>): Promise<ToolResult> {
    try {
      let result: any;
      switch (params.action) {
        case "length":
          result = { length: params.text.length, chars: params.text.length, words: params.text.split(/\s+/).filter(Boolean).length };
          break;
        case "uppercase":
          result = { text: params.text.toUpperCase() };
          break;
        case "lowercase":
          result = { text: params.text.toLowerCase() };
          break;
        case "trim":
          result = { text: params.text.trim() };
          break;
        case "reverse":
          result = { text: params.text.split("").reverse().join("") };
          break;
        case "count_words":
          result = { words: params.text.split(/\s+/).filter(Boolean).length };
          break;
        case "truncate":
          const max = params.maxLength ?? 100;
          result = { text: params.text.length > max ? params.text.slice(0, max) + "…" : params.text, truncated: params.text.length > max };
          break;
        case "replace":
          if (!params.search) return { success: false, error: "search parameter required" };
          result = { text: params.text.split(params.search).join(params.replace ?? "") };
          break;
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: `String utils error: ${e.message}` };
    }
  },
};

// ─── Web Search Tool ────────────────────────────────────────────

const webSearchTool: Tool = {
  definition: {
    name: "web_search",
    description: "Search the web for information via a configured provider (Brave, SerpAPI, or Tavily). Returns an honest 'not configured' result when no provider key is set.",
    category: "web",
    parameters: {
      query: { type: "string", description: "Search query" },
      maxResults: { type: "number", description: "Maximum results to return (default 5)" },
    },
    required: ["query"],
    timeoutMs: 20000,
  },
  async execute(params: Record<string, any>): Promise<ToolResult> {
    const query = String(params.query ?? "");
    if (!query.trim()) {
      return { success: false, error: "query is required" };
    }
    const { webSearch } = await import("../../webSearch.service.js");
    const outcome = await webSearch(query, Number(params.maxResults) || 5);
    return {
      success: true,
      data: {
        query: outcome.query,
        configured: outcome.configured,
        provider: outcome.provider,
        results: outcome.results,
        note: outcome.note,
      },
      metadata: { configured: outcome.configured, provider: outcome.provider ?? "none" },
    };
  },
};

// ─── Register All Built-in Tools ────────────────────────────────

export function registerBuiltinTools() {
  ToolRegistry.register(calculatorTool);
  ToolRegistry.register(datetimeTool);
  ToolRegistry.register(randomTool);
  ToolRegistry.register(stringUtilsTool);
  ToolRegistry.register(webSearchTool);
}

// Auto-register on import
registerBuiltinTools();
