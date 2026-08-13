/**
 * WhatsApp command layer — Phase 2 §6 and §9.
 *
 * This module ONLY recognises intent and states the requirements for acting on
 * it. It executes nothing: dispatch happens in whatsappCommandExec.ts, through
 * the existing Workflow Engine, Agent Orchestration and domain services.
 *
 * Anything that does not match a command falls through to the normal
 * conversational pipeline, so the AI OS — not this parser — remains the thing
 * that decides how to answer. The parser exists to give the deterministic,
 * high-risk verbs ("execute the trade", "create the campaign") a deterministic
 * permission and confirmation path, which a free-text LLM turn cannot promise.
 */
import type { Permission } from "@windels/shared/permissions";

export type CommandKind =
  // creation ("do work") — these become WhatsAppJobs
  | "create_task"
  | "create_workflow"
  | "run_workflow"
  | "create_report"
  | "create_advertisement"
  | "create_social_post"
  | "create_music_track"
  | "create_music_video"
  | "analyze_file"
  // queries ("tell me") — these answer inline
  | "check_sales"
  | "check_campaigns"
  | "check_agents"
  | "check_pending_tasks"
  // control
  | "help"
  | "handoff"
  | "confirm"
  | "cancel";

/** Risk tier drives the step-up requirement in §9. */
export type RiskLevel = "low" | "medium" | "high";

export interface ParsedCommand {
  kind: CommandKind;
  /** The free-text remainder — the subject of the command. */
  argument: string;
  /** Verbatim text the user sent, for the audit log. */
  raw: string;
  /** RBAC permissions ALL of which the caller must hold. */
  requiredPermissions: Permission[];
  risk: RiskLevel;
  /** True when the work must run as a background job (§7). */
  async: boolean;
  /** Human phrasing of the action, used in the confirmation prompt. */
  describe: string;
}

interface CommandSpec {
  kind: CommandKind;
  /** Ordered — the first match wins, so put specific patterns first. */
  patterns: RegExp[];
  requiredPermissions: Permission[];
  risk: RiskLevel;
  async: boolean;
  describe: (arg: string) => string;
}

/**
 * Patterns are intentionally anchored at the start of the message. A command
 * must be an instruction, not a mention: "create a report on Q3" is a command,
 * "what do you think of the report I created" is a conversation.
 */
const SPECS: CommandSpec[] = [
  {
    kind: "confirm",
    patterns: [/^\/?(confirm|yes,? confirm|approve)\b/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "confirm the pending action",
  },
  {
    kind: "cancel",
    patterns: [/^\/?(cancel|abort|stop|no,? cancel)\b/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "cancel the pending action",
  },
  {
    kind: "help",
    patterns: [/^\/?(help|commands|menu|what can you do)\b/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "list available commands",
  },
  {
    kind: "handoff",
    patterns: [/^\/?(human|agent|support|talk to (a )?(human|person|agent)|escalate)\b/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "hand this conversation to a human",
  },

  // ── Queries ──
  {
    kind: "check_pending_tasks",
    patterns: [/^\/?(check |show |list |what are )?(my )?(pending|open|outstanding) tasks\b/i, /^\/?tasks?$/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "list your pending tasks",
  },
  {
    kind: "check_agents",
    patterns: [/^\/?(check |show |list )?(my |the )?(ai )?agents?\b(?!\s+to\b)/i, /^\/?agent status\b/i],
    requiredPermissions: ["AGENT_READ"], risk: "low", async: false,
    describe: () => "list your agents",
  },
  {
    kind: "check_sales",
    patterns: [/^\/?(check |show |what (are|were) )?(my |the )?(sales|revenue|earnings)\b/i],
    requiredPermissions: ["BILLING_READ"], risk: "medium", async: false,
    describe: () => "report your sales figures",
  },
  {
    kind: "check_campaigns",
    patterns: [/^\/?(check |show |list )?(my |the )?(campaigns?|ad performance|marketing)\b(?!\s+(post|copy))/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: () => "report your campaign performance",
  },

  // ── Creation ──
  {
    kind: "run_workflow",
    patterns: [/^\/?(run|execute|trigger|start) (the )?workflow\b:?\s*/i],
    requiredPermissions: ["WORKFLOW_RUN"], risk: "high", async: true,
    describe: (a) => `run the workflow "${a}"`,
  },
  {
    kind: "create_workflow",
    patterns: [/^\/?(create|build|make|set ?up) (a |an |the )?workflow\b:?\s*/i],
    requiredPermissions: ["WORKFLOW_WRITE"], risk: "medium", async: true,
    describe: (a) => `create a workflow for "${a}"`,
  },
  {
    kind: "create_music_video",
    patterns: [/^\/?(create|make|generate|produce) (a |an |the )?music ?video\b:?\s*/i],
    requiredPermissions: [], risk: "medium", async: true,
    describe: (a) => `produce a music video: "${a}"`,
  },
  {
    kind: "create_music_track",
    patterns: [/^\/?(create|make|generate|produce|compose) (a |an |the )?(music ?track|song|track|beat|music)\b:?\s*/i],
    requiredPermissions: [], risk: "medium", async: true,
    describe: (a) => `produce a music track: "${a}"`,
  },
  {
    kind: "create_advertisement",
    patterns: [/^\/?(create|make|generate|write|design) (a |an |the )?(advertisement|advert|ad campaign|ad)\b:?\s*/i],
    requiredPermissions: [], risk: "medium", async: true,
    describe: (a) => `create an advertisement: "${a}"`,
  },
  {
    kind: "create_social_post",
    patterns: [/^\/?(create|make|generate|write|draft|schedule) (a |an |the )?(social (media )?post|tweet|post for (twitter|x|linkedin|instagram|facebook))\b:?\s*/i],
    requiredPermissions: [], risk: "medium", async: true,
    describe: (a) => `create a social post: "${a}"`,
  },
  {
    kind: "create_report",
    patterns: [/^\/?(create|generate|make|build|prepare|run) (a |an |the )?report\b:?\s*/i],
    requiredPermissions: [], risk: "low", async: true,
    describe: (a) => `generate a report: "${a}"`,
  },
  {
    kind: "analyze_file",
    patterns: [/^\/?(analy[sz]e|review|summari[sz]e|explain) (this |the |my )?(file|document|attachment|pdf|spreadsheet)\b:?\s*/i],
    requiredPermissions: [], risk: "low", async: true,
    describe: (a) => (a ? `analyse the file: "${a}"` : "analyse the attached file"),
  },
  {
    kind: "create_task",
    patterns: [/^\/?(create|add|make|new) (a |an |the )?task\b:?\s*/i, /^\/?(remind me to|todo)\b:?\s*/i],
    requiredPermissions: [], risk: "low", async: false,
    describe: (a) => `create the task "${a}"`,
  },
];

/**
 * Additional high-risk phrasing that must NEVER be executed straight from a
 * WhatsApp message without explicit confirmation, regardless of which command
 * it resembles. §9: financial movement, trading execution, account/security
 * changes, sensitive PII and org administration.
 */
const HIGH_RISK_SIGNALS: RegExp[] = [
  /\b(transfer|withdraw|send|pay|payout|refund|wire|remit)\b.{0,40}\b(\$|usd|ngn|eur|gbp|₦|£|€|\d)/i,
  // Money movement phrased without a figure — "wire the entire balance",
  // "send all the funds". No digit appears, but the intent is identical.
  /\b(transfer|withdraw|send|pay|payout|wire|remit|move)\b.{0,40}\b(balance|funds|treasury|wallet|payroll|everything)\b/i,
  /\b(buy|sell|short|long|liquidate|close position|execute (the )?trade|place (an? )?order)\b/i,
  // Destructive deletes. Deliberately broad on the object: losing "customer
  // records" is no less catastrophic than losing "the database".
  /\b(delete|drop|wipe|purge|reset|erase|remove)\b.{0,30}\b(account|organi[sz]ation|database|workspace|all data|everything|records?|customers?|users?|invoices?|files?|backups?)\b/i,
  /\b(change|reset|rotate|disable)\b.{0,30}\b(password|2fa|mfa|api key|secret|token|security)\b/i,
  /\b(add|remove|invite|promote|demote)\b.{0,30}\b(admin|owner|member|user)\b/i,
  /\b(ssn|social security|passport number|bank account number|card number|cvv)\b/i,
];

/** True when the text carries a high-risk signal irrespective of command kind. */
export function hasHighRiskSignal(text: string): boolean {
  return HIGH_RISK_SIGNALS.some((re) => re.test(text));
}

/**
 * Parses a WhatsApp message into a command, or null when it is ordinary
 * conversation that should go to the AI OS unchanged.
 */
export function parseCommand(text: string): ParsedCommand | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  // A command is a short instruction. A 900-character essay that happens to
  // start with "create a report" is a briefing, not a slash command.
  if (raw.length > 1200) return null;

  for (const spec of SPECS) {
    for (const pattern of spec.patterns) {
      const match = pattern.exec(raw);
      if (!match) continue;
      const argument = raw.slice(match[0].length).trim().replace(/^[:\-–—]\s*/, "");
      const risk: RiskLevel = hasHighRiskSignal(raw) ? "high" : spec.risk;
      return {
        kind: spec.kind,
        argument,
        raw,
        requiredPermissions: spec.requiredPermissions,
        risk,
        async: spec.async,
        describe: spec.describe(argument),
      };
    }
  }

  // Not a known command, but still dangerous phrasing (e.g. "sell all my BTC
  // now"). Surface it as a high-risk unmatched intent so the pipeline can force
  // a confirmation rather than let the model improvise an execution.
  if (hasHighRiskSignal(raw)) {
    return {
      kind: "help",
      argument: raw,
      raw,
      requiredPermissions: [],
      risk: "high",
      async: false,
      describe: "perform a high-risk action",
    };
  }

  return null;
}

/** The /help response. Kept in one place so the UI and the bot cannot drift. */
export const HELP_TEXT = [
  "*WINDELS commands*",
  "",
  "*Create*",
  "• create task <title>",
  "• create workflow <description>",
  "• run workflow <name>",
  "• create report <topic>",
  "• create advertisement <brief>",
  "• create social post <brief>",
  "• create music track <brief>",
  "• create music video <brief>",
  "• analyse this file (attach it)",
  "",
  "*Check*",
  "• check sales",
  "• check campaigns",
  "• check agents",
  "• pending tasks",
  "",
  "*Other*",
  "• human — talk to a person",
  "• confirm / cancel — respond to a pending action",
  "",
  "You can also just ask a question normally.",
].join("\n");
