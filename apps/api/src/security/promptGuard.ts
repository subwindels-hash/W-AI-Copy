/**
 * Security — Prompt Injection Protection (Slice 114).
 *
 * Lightweight heuristic guard for user-supplied prompts:
 *   - Detects "role confusion" phrases ("ignore previous", "system prompt", "disregard", etc.)
 *   - Detects attempts to exfiltrate secrets ("reveal your api key", "show me the system prompt")
 *   - Detects delimiter/encoding tricks (base64 obfuscation markers, <|im_start|> style tags)
 *   - Detects data-exfil URLs ("send this to http://...", "paste at https://")
 *   - Detects indirect prompt-injection patterns in user-submitted text via delimiter injection
 *
 * The guard returns a risk score (0-100) and reasons; consumers can choose to
 * block (>=80) or warn+log (>=40). This is a heuristic layer, not a silver
 * bullet — defense-in-depth only. Real safety comes from the AI model layer.
 */

export interface GuardResult {
  safe: boolean;
  score: number; // 0-100
  reasons: string[];
}

const RULES: Array<{ pattern: RegExp; weight: number; reason: string }> = [
  // Role confusion / jailbreak
  { pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|context|system\s+message|system\s+prompt)\b/i, weight: 95, reason: "role-confusion / jailbreak phrase" },
  { pattern: /\byou\s+are\s+now\s+(dan|a|an|developer\s+mode|jailbroken|unrestricted|free\s+from\s+restrictions)/i, weight: 90, reason: "identity override (DAN-style)" },
  { pattern: /\b(system\s*:?\s*prompt|system\s*message|developer\s*:|assistant\s*prefill|prefix\s+before)\b/i, weight: 60, reason: "attempt to read/modify system prompt" },
  { pattern: /\b(show|reveal|output|print|echo|leak|repeat)\b.{0,40}\b(system\s*prompt|api[_\s-]?key|secret|password|credentials?|your\s+initial\s+instructions?|hidden\s+instructions?)\b/i, weight: 90, reason: "secret exfiltration request" },
  { pattern: /<\|\s*(im_start|im_end|begin_of_text|end_of_text|start_of_turn|end_of_turn|system|assistant|user)\s*\|>/i, weight: 70, reason: "chat-template delimiter injection" },
  { pattern: /```\s*(system|developer)\b/i, weight: 50, reason: "markdown system/developer fence" },
  { pattern: /\b(send|post|upload|transmit|forward|exfiltrate|paste)\b.{0,40}\b(https?:\/\/[^\s)]+|www\.[^\s)]+)/i, weight: 80, reason: "data-exfil URL" },
  { pattern: /\beval\s*\(|function\s*\(\s*\)\s*\{\s*return\b|atob\(|btoa\(|string\.fromCharCode/i, weight: 50, reason: "code execution / obfuscation" },
  { pattern: /(?:[a-z0-9+/]{40,}={0,2})/, weight: 15, reason: "long base64-looking blob (possible obfuscation)" },
  { pattern: /\b(disable\s+(content\s+)?safety|remove\s+(all\s+)?(content\s+filters?|safety\s+guidelines?|guardrails?|restrictions?|ethics))\b/i, weight: 90, reason: "safety-bypass attempt" },
  { pattern: /\b(act\s+as\s+(a|an)\s+(unrestricted|uncensored|nsfw|hacker|malicious|illegal|unfiltered))/i, weight: 80, reason: "unrestricted role request" },
];

// Blocklists of specific high-signal phrases.
const ALLOWLIST_SAFE = ["i forgot my password", "forgot my password", "reset my password"];

export function scanPrompt(input: string): GuardResult {
  const text = (input ?? "").trim();
  if (!text) return { safe: true, score: 0, reasons: [] };
  if (ALLOWLIST_SAFE.some((p) => text.toLowerCase().includes(p))) return { safe: true, score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      score = Math.min(100, score + rule.weight);
      reasons.push(rule.reason);
    }
  }
  // Length/complexity heuristics: extremely long one-liner with lots of code markers
  if (text.length > 8000) { score = Math.min(100, score + 20); reasons.push("excessive prompt length"); }
  // De-dupe
  const uniqueReasons = Array.from(new Set(reasons));
  return { safe: score < 50, score, reasons: uniqueReasons };
}

/** Sanitize user input for logging/display — strip HTML tags and control chars. */
export function sanitizeInput(s: string): string {
  return s
    .replace(/[^\P{C}\n\t]/gu, "") // strip control chars except newline/tab
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .slice(0, 100_000);
}
