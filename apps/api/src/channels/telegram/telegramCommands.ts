/**
 * Telegram commands (§5). Commands map to existing WINDELS capabilities
 * (identity, conversation reset, usage, agents/workflows) — they do not
 * contain AI reasoning. A command may be inline (fast) or async (queued).
 */
import type { ResolvedTelegramIdentity } from "./telegramIdentity.service.js";

export type CommandName =
  | "start" | "help" | "login" | "connect" | "disconnect" | "status"
  | "newchat" | "clear" | "memory" | "settings" | "usage" | "billing"
  | "agents" | "workflows" | "stop" | "cancel" | "support";

export interface ParsedTelegramCommand {
  name: CommandName;
  argument: string;
  raw: string;
}

const ALIASES: Record<string, CommandName> = {
  "/start": "start", "/help": "help", "/login": "login", "/connect": "connect",
  "/disconnect": "disconnect", "/status": "status", "/newchat": "newchat",
  "/clear": "clear", "/memory": "memory", "/settings": "settings",
  "/usage": "usage", "/billing": "billing", "/agents": "agents",
  "/workflows": "workflows", "/stop": "stop", "/cancel": "cancel",
  "/support": "support",
};

export function parseCommand(text: string): ParsedTelegramCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [head, ...rest] = trimmed.split(/\s+/);
  const name = ALIASES[head!.toLowerCase()];
  if (!name) return null;
  return { name, argument: rest.join(" ").trim(), raw: trimmed };
}

export const HELP_TEXT = `🤖 *WINDELS AI on Telegram*

Just send a message and I'll answer through your WINDELS AI OS.

Commands:
/start <token> — link your Telegram to WINDELS
/status — your connection and access
/newchat or /clear — start a fresh conversation
/usage — your AI/credits usage
/billing — manage your subscription
/agents — list available AI agents
/workflows — run a workflow
/stop — cancel a running task
/settings — channel preferences
/support — contact support

Tip: send an image with a caption to ask about it.`;

export function gatingMessage(identity: ResolvedTelegramIdentity): string | null {
  if (identity.isLinked) return null;
  return `🔒 You haven't linked a WINDELS account yet.\n\nOpen WINDELS → Integrations → Telegram and choose *Connect*, then send the /start command with your secure token. Until then I can only answer general questions — no private account, billing or organization data is available.`;
}
