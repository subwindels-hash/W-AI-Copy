/**
 * Web Application Firewall Service (Module 22 — Gap 1)
 *
 * Protect against common web attacks:
 * - SQL injection detection and blocking
 * - XSS (Cross-Site Scripting) detection and blocking
 * - Command injection detection
 * - Path traversal detection
 * - LDAP injection detection
 * - XML injection detection
 * - Request filtering and sanitization
 * - Attack logging and alerting
 *
 * Implements OWASP Top 10 protection.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export type AttackType =
  | "sql_injection"
  | "xss"
  | "command_injection"
  | "path_traversal"
  | "ldap_injection"
  | "xml_injection"
  | "header_injection"
  | "ssrf";

export interface WAFRule {
  id: string;
  name: string;
  attackType: AttackType;
  enabled: boolean;
  pattern: RegExp;
  severity: "low" | "medium" | "high" | "critical";
  action: "block" | "log" | "sanitize";
  description: string;
}

export interface WAFEvent {
  id: string;
  timestamp: string;
  attackType: AttackType;
  severity: "low" | "medium" | "high" | "critical";
  action: "blocked" | "logged" | "sanitized";
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  matchedPattern: string;
  payload: string;
  ruleId: string;
  ruleName: string;
}

export interface WAFStats {
  totalBlocked: number;
  totalLogged: number;
  totalSanitized: number;
  byAttackType: Record<AttackType, number>;
  bySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const WAF_RULE_KEY = (id: string) => `waf:rule:${id}`;
const WAF_RULES_KEY = "waf:rules:all";
const WAF_EVENT_KEY = (id: string) => `waf:event:${id}`;
const WAF_EVENTS_KEY = "waf:events:all";
const WAF_IP_BLOCKLIST_KEY = "waf:ip:blocklist";
const WAF_STATS_KEY = "waf:stats";

// ─── WAF Rules ──────────────────────────────────────────────────

/**
 * Built-in WAF rules for common attacks
 */
const BUILT_IN_RULES: Omit<WAFRule, "id">[] = [
  // SQL Injection patterns
  {
    name: "SQL Injection - Union Select",
    attackType: "sql_injection",
    enabled: true,
    pattern: /(\b(union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table)\b)|(\b(or|and)\b\s+\d+\s*=\s*\d+)|(\b(or|and)\b\s+['"].*['"]\s*=\s*['"])/i,
    severity: "critical",
    action: "block",
    description: "Detects common SQL injection patterns",
  },
  {
    name: "SQL Injection - Comment",
    attackType: "sql_injection",
    enabled: true,
    pattern: /(\b(or|and)\b\s+\d+\s*=\s*\d+)|(--|#|\/\*|\*\/)/i,
    severity: "high",
    action: "block",
    description: "Detects SQL comment injection",
  },
  {
    name: "SQL Injection - String Termination",
    attackType: "sql_injection",
    enabled: true,
    pattern: /('|"|;|\b(or|and)\b\s+['"])/i,
    severity: "high",
    action: "block",
    description: "Detects SQL string termination attacks",
  },

  // XSS patterns
  {
    name: "XSS - Script Tag",
    attackType: "xss",
    enabled: true,
    pattern: /<script\b[^>]*>[\s\S]*?<\/script>|<script\b[^>]*>/i,
    severity: "critical",
    action: "block",
    description: "Detects script tag injection",
  },
  {
    name: "XSS - Event Handler",
    attackType: "xss",
    enabled: true,
    pattern: /\bon\w+\s*=\s*['"][^'"]*['"]/i,
    severity: "high",
    action: "block",
    description: "Detects event handler injection",
  },
  {
    name: "XSS - JavaScript Protocol",
    attackType: "xss",
    enabled: true,
    pattern: /javascript\s*:/i,
    severity: "high",
    action: "block",
    description: "Detects javascript: protocol injection",
  },
  {
    name: "XSS - Data Protocol",
    attackType: "xss",
    enabled: true,
    pattern: /data\s*:\s*text\/html/i,
    severity: "high",
    action: "block",
    description: "Detects data: protocol injection",
  },

  // Command Injection patterns
  {
    name: "Command Injection - Pipe",
    attackType: "command_injection",
    enabled: true,
    pattern: /(\||;|`|\$\(|&&|\|\|)/,
    severity: "critical",
    action: "block",
    description: "Detects command injection via pipe or command separator",
  },
  {
    name: "Command Injection - Backtick",
    attackType: "command_injection",
    enabled: true,
    pattern: /`[^`]*`/,
    severity: "critical",
    action: "block",
    description: "Detects command injection via backticks",
  },

  // Path Traversal patterns
  {
    name: "Path Traversal - Directory",
    attackType: "path_traversal",
    enabled: true,
    pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e%5c)/i,
    severity: "high",
    action: "block",
    description: "Detects directory traversal attempts",
  },
  {
    name: "Path Traversal - Null Byte",
    attackType: "path_traversal",
    enabled: true,
    pattern: /(%00|\\0)/,
    severity: "high",
    action: "block",
    description: "Detects null byte injection",
  },

  // LDAP Injection patterns
  {
    name: "LDAP Injection",
    attackType: "ldap_injection",
    enabled: true,
    pattern: /([)(|*\\])/i,
    severity: "high",
    action: "block",
    description: "Detects LDAP injection attempts",
  },

  // XML Injection patterns
  {
    name: "XML Injection - External Entity",
    attackType: "xml_injection",
    enabled: true,
    pattern: /<!DOCTYPE[^>]*<!ENTITY/i,
    severity: "critical",
    action: "block",
    description: "Detects XML external entity (XXE) injection",
  },

  // Header Injection patterns
  {
    name: "Header Injection - CRLF",
    attackType: "header_injection",
    enabled: true,
    pattern: /(%0d%0a|\\r\\n|\\n\\r)/i,
    severity: "high",
    action: "block",
    description: "Detects CRLF header injection",
  },

  // SSRF patterns
  {
    name: "SSRF - Internal IP",
    attackType: "ssrf",
    enabled: true,
    pattern: /(https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)/i,
    severity: "high",
    action: "block",
    description: "Detects SSRF attempts to internal IPs",
  },
];

// ─── WAF Rule Management ────────────────────────────────────────

/**
 * Initialize built-in WAF rules
 */
export async function initializeWAFRules(): Promise<void> {
  for (const rule of BUILT_IN_RULES) {
    const id = `rule_${rule.name.toLowerCase().replace(/\s+/g, "_")}`;
    const wafRule: WAFRule = { id, ...rule };

    await redisCmd.set(WAF_RULE_KEY(id), JSON.stringify(wafRule));
    await redisCmd.sadd(WAF_RULES_KEY, id);
  }

  logger.info("WAF rules initialized", { count: BUILT_IN_RULES.length });
}

/**
 * Get all WAF rules
 */
export async function getWAFRules(): Promise<WAFRule[]> {
  const ruleIds = await redisCmd.smembers(WAF_RULES_KEY);
  const rules: WAFRule[] = [];

  for (const id of ruleIds) {
    const data = await redisCmd.get(WAF_RULE_KEY(id));
    if (data) {
      rules.push(JSON.parse(data));
    }
  }

  return rules;
}

/**
 * Update WAF rule
 */
export async function updateWAFRule(
  ruleId: string,
  updates: Partial<WAFRule>,
): Promise<WAFRule | null> {
  const data = await redisCmd.get(WAF_RULE_KEY(ruleId));
  if (!data) return null;

  const rule: WAFRule = { ...JSON.parse(data), ...updates };
  await redisCmd.set(WAF_RULE_KEY(ruleId), JSON.stringify(rule));

  logger.info("WAF rule updated", { ruleId, updates: Object.keys(updates) });

  return rule;
}

// ─── WAF Inspection ─────────────────────────────────────────────

/**
 * Inspect request for attacks
 */
export async function inspectRequest(request: {
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, string>;
}): Promise<{
  blocked: boolean;
  attacks: WAFEvent[];
  sanitized?: Record<string, any>;
}> {
  const rules = await getWAFRules();
  const enabledRules = rules.filter((rule) => rule.enabled);
  const attacks: WAFEvent[] = [];
  let blocked = false;

  // Combine all input sources
  const inputs = [
    { source: "path", value: request.path },
    { source: "query", value: JSON.stringify(request.query || {}) },
    { source: "body", value: JSON.stringify(request.body || {}) },
    { source: "headers", value: JSON.stringify(request.headers || {}) },
  ];

  for (const rule of enabledRules) {
    for (const input of inputs) {
      if (rule.pattern.test(input.value)) {
        const event: WAFEvent = {
          id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          timestamp: new Date().toISOString(),
          attackType: rule.attackType,
          severity: rule.severity,
          action: rule.action === "block" ? "blocked" : rule.action === "sanitize" ? "sanitized" : "logged",
          ip: request.ip,
          userAgent: request.userAgent,
          path: request.path,
          method: request.method,
          matchedPattern: rule.pattern.toString(),
          payload: input.value.slice(0, 500), // Truncate payload
          ruleId: rule.id,
          ruleName: rule.name,
        };

        attacks.push(event);

        if (rule.action === "block") {
          blocked = true;
        }

        // Log event
        await logWAFEvent(event);

        // Update metrics
        Metrics.increment("waf.attacks.detected", 1, {
          type: rule.attackType,
          severity: rule.severity,
          action: rule.action,
        });

        logger.warn("WAF attack detected", {
          attackType: rule.attackType,
          severity: rule.severity,
          ip: request.ip,
          path: request.path,
          ruleName: rule.name,
        });
      }
    }
  }

  // Check IP blocklist
  const isBlocked = await isIPBlocked(request.ip);
  if (isBlocked) {
    blocked = true;
    attacks.push({
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      attackType: "sql_injection", // Generic attack type for IP block
      severity: "high",
      action: "blocked",
      ip: request.ip,
      userAgent: request.userAgent,
      path: request.path,
      method: request.method,
      matchedPattern: "IP blocklist",
      payload: "",
      ruleId: "ip_blocklist",
      ruleName: "IP Blocklist",
    });
  }

  return { blocked, attacks };
}

/**
 * Sanitize input to remove potential attack payloads
 */
export function sanitizeInput(input: string): string {
  // Remove common attack patterns
  let sanitized = input;

  // Remove SQL injection patterns
  sanitized = sanitized.replace(/(\b(union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table)\b)/gi, "");

  // Remove XSS patterns
  sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/\bon\w+\s*=\s*['"][^'"]*['"]/gi, "");
  sanitized = sanitized.replace(/javascript\s*:/gi, "");

  // Remove command injection patterns
  sanitized = sanitized.replace(/(\||;|`|\$\(|&&|\|\|)/g, "");

  // Remove path traversal patterns
  sanitized = sanitized.replace(/(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e%5c)/gi, "");

  return sanitized;
}

// ─── WAF Event Logging ──────────────────────────────────────────

/**
 * Log WAF event
 */
async function logWAFEvent(event: WAFEvent): Promise<void> {
  await redisCmd.set(WAF_EVENT_KEY(event.id), JSON.stringify(event));
  await redisCmd.sadd(WAF_EVENTS_KEY, event.id);

  // Keep only last 10000 events
  const allEventIds = await redisCmd.smembers(WAF_EVENTS_KEY);
  if (allEventIds.length > 10000) {
    const toDelete = allEventIds.slice(0, allEventIds.length - 10000);
    for (const id of toDelete) {
      await redisCmd.del(WAF_EVENT_KEY(id));
      await redisCmd.srem(WAF_EVENTS_KEY, id);
    }
  }
}

/**
 * Get WAF events
 */
export async function getWAFEvents(filters?: {
  attackType?: AttackType;
  severity?: string;
  ip?: string;
  limit?: number;
}): Promise<WAFEvent[]> {
  const eventIds = await redisCmd.smembers(WAF_EVENTS_KEY);
  const events: WAFEvent[] = [];

  for (const id of eventIds) {
    const data = await redisCmd.get(WAF_EVENT_KEY(id));
    if (data) {
      const event: WAFEvent = JSON.parse(data);

      if (filters?.attackType && event.attackType !== filters.attackType) continue;
      if (filters?.severity && event.severity !== filters.severity) continue;
      if (filters?.ip && event.ip !== filters.ip) continue;

      events.push(event);
    }
  }

  // Sort by timestamp (descending)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events.slice(0, filters?.limit || 100);
}

// ─── IP Blocklist Management ────────────────────────────────────

/**
 * Block IP address
 */
export async function blockIP(ip: string, reason?: string): Promise<void> {
  await redisCmd.sadd(WAF_IP_BLOCKLIST_KEY, ip);

  logger.info("IP blocked", { ip, reason });

  Metrics.increment("waf.ip.blocked", 1);
}

/**
 * Unblock IP address
 */
export async function unblockIP(ip: string): Promise<void> {
  await redisCmd.srem(WAF_IP_BLOCKLIST_KEY, ip);

  logger.info("IP unblocked", { ip });
}

/**
 * Check if IP is blocked
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  const result = await redisCmd.sismember(WAF_IP_BLOCKLIST_KEY, ip);
  return result === 1;
}

/**
 * Get blocked IPs
 */
export async function getBlockedIPs(): Promise<string[]> {
  return await redisCmd.smembers(WAF_IP_BLOCKLIST_KEY);
}

// ─── WAF Statistics ─────────────────────────────────────────────

/**
 * Get WAF statistics
 */
export async function getWAFStats(): Promise<WAFStats> {
  const events = await getWAFEvents({ limit: 10000 });

  const byAttackType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const ipCounts: Record<string, number> = {};
  const pathCounts: Record<string, number> = {};

  for (const event of events) {
    byAttackType[event.attackType] = (byAttackType[event.attackType] || 0) + 1;
    bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    pathCounts[event.path] = (pathCounts[event.path] || 0) + 1;
  }

  const topIPs = Object.entries(ipCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topPaths = Object.entries(pathCounts)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalBlocked: events.filter((e) => e.action === "blocked").length,
    totalLogged: events.filter((e) => e.action === "logged").length,
    totalSanitized: events.filter((e) => e.action === "sanitized").length,
    byAttackType: byAttackType as Record<AttackType, number>,
    bySeverity,
    topIPs,
    topPaths,
  };
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for WAF
 */
export function wafMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      const result = await inspectRequest({
        ip: req.ip,
        userAgent: req.get("user-agent"),
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        headers: req.headers,
      });

      if (result.blocked) {
        logger.warn("Request blocked by WAF", {
          ip: req.ip,
          path: req.path,
          attacks: result.attacks.length,
        });

        Metrics.increment("waf.requests.blocked", 1);

        return res.status(403).json({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Request blocked by security policy",
            details: {
              attacks: result.attacks.map((a) => ({
                type: a.attackType,
                severity: a.severity,
                rule: a.ruleName,
              })),
            },
          },
        });
      }

      Metrics.increment("waf.requests.allowed", 1);

      next();
    } catch (error) {
      logger.error("WAF middleware error", { error: (error as Error).message });
      // Fail open - allow request if WAF fails
      next();
    }
  };
}
