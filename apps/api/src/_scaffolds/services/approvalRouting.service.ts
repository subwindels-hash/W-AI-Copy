/**
 * Approval Routing Service (Module 14 — Gap 6)
 *
 * Automatic routing of decisions and actions to appropriate humans:
 * - Policy-based routing rules
 * - Amount-based routing (expenditure thresholds)
 * - Risk-based routing (high-risk actions)
 * - Domain-based routing (legal, finance, HR, etc.)
 * - Role-based routing (manager, director, executive)
 * - Integration with constitution policies
 * - Integration with approval workflows
 *
 * Enables automatic enforcement of human oversight policies.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../db/client.js";
import { createApprovalRequest, type ApprovalRequestType } from "./humanApproval.service";

// ─── Types ──────────────────────────────────────────────────────

export interface RoutingRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // Higher priority rules are evaluated first
  conditions: RoutingCondition;
  action: RoutingAction;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingCondition {
  requestTypes?: ApprovalRequestType[];
  minAmount?: number; // Minimum amount (for expenditures)
  maxAmount?: number; // Maximum amount
  riskLevels?: Array<"low" | "medium" | "high" | "critical">;
  domains?: string[]; // finance, legal, hr, engineering, etc.
  agentRoles?: string[]; // Agent roles this applies to
  departments?: string[]; // Departments this applies to
  customConditions?: Array<{
    field: string; // JSON path in context
    operator: "equals" | "not_equals" | "greater_than" | "less_than" | "contains" | "not_contains";
    value: any;
  }>;
}

export interface RoutingAction {
  approverType: "role" | "user" | "manager" | "department_head" | "executive";
  approverIds?: string[]; // Specific user IDs
  approverRoles?: string[]; // Role names
  approvalChain?: Array<{
    approverType: "role" | "user" | "manager" | "department_head" | "executive";
    approverIds?: string[];
    approverRoles?: string[];
  }>;
  requireAllApprovers?: boolean; // All must approve (vs any)
  escalationAfterHours?: number; // Escalate if not approved within X hours
  autoApproveAfterHours?: number; // Auto-approve if not reviewed within X hours
}

export interface RoutingResult {
  matched: boolean;
  ruleId?: string;
  ruleName?: string;
  approvers: Array<{
    userId: string;
    userName: string;
    userRole?: string;
  }>;
  requiresApproval: boolean;
  reason?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const RULES_KEY = "routing:rules";
const RULE_KEY = (id: string) => `routing:rule:${id}`;

// ─── Routing Rule Management ────────────────────────────────────

/**
 * Create a routing rule.
 */
export async function createRoutingRule(input: {
  name: string;
  description: string;
  priority?: number;
  conditions: RoutingCondition;
  action: RoutingAction;
}): Promise<RoutingRule> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const rule: RoutingRule = {
    id,
    name: input.name,
    description: input.description,
    enabled: true,
    priority: input.priority ?? 100,
    conditions: input.conditions,
    action: input.action,
    createdAt: now,
    updatedAt: now,
  };

  await redisCmd.set(RULE_KEY(id), JSON.stringify(rule));
  await redisCmd.sadd(RULES_KEY, id);

  logger.info("Routing rule created", {
    ruleId: id,
    name: input.name,
    priority: rule.priority,
  });

  return rule;
}

/**
 * Get a routing rule by ID.
 */
export async function getRoutingRule(id: string): Promise<RoutingRule | null> {
  const data = await redisCmd.get(RULE_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * List all routing rules.
 */
export async function listRoutingRules(): Promise<RoutingRule[]> {
  const ids = await redisCmd.smembers(RULES_KEY);
  const rules: RoutingRule[] = [];

  for (const id of ids) {
    const rule = await getRoutingRule(id);
    if (rule) rules.push(rule);
  }

  return rules.sort((a, b) => b.priority - a.priority);
}

/**
 * Update a routing rule.
 */
export async function updateRoutingRule(
  id: string,
  updates: Partial<Omit<RoutingRule, "id" | "createdAt">>,
): Promise<RoutingRule | null> {
  const rule = await getRoutingRule(id);
  if (!rule) return null;

  Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
  await redisCmd.set(RULE_KEY(id), JSON.stringify(rule));

  logger.info("Routing rule updated", { ruleId: id, name: rule.name });

  return rule;
}

/**
 * Delete a routing rule.
 */
export async function deleteRoutingRule(id: string): Promise<boolean> {
  const exists = await redisCmd.exists(RULE_KEY(id));
  if (!exists) return false;

  await redisCmd.del(RULE_KEY(id));
  await redisCmd.srem(RULES_KEY, id);

  logger.info("Routing rule deleted", { ruleId: id });

  return true;
}

/**
 * Enable or disable a routing rule.
 */
export async function toggleRoutingRule(id: string, enabled: boolean): Promise<RoutingRule | null> {
  return updateRoutingRule(id, { enabled });
}

// ─── Routing Evaluation ─────────────────────────────────────────

/**
 * Evaluate routing rules for a request.
 */
export async function evaluateRouting(input: {
  requestType: ApprovalRequestType;
  requesterId: string;
  requesterType: "agent" | "user";
  context: Record<string, any>;
  amount?: number;
  riskLevel?: "low" | "medium" | "high" | "critical";
  domain?: string;
}): Promise<RoutingResult> {
  const rules = await listRoutingRules();
  const enabledRules = rules.filter(r => r.enabled);

  // Get requester info
  let requesterRole: string | undefined;
  let requesterDepartment: string | undefined;

  if (input.requesterType === "agent") {
    const agent = await prisma.agent.findUnique({
      where: { id: input.requesterId },
      select: { role: true, department: true },
    });
    requesterRole = agent?.role;
    requesterDepartment = agent?.department ?? undefined;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: input.requesterId },
      select: { role: true, department: true },
    });
    requesterRole = user?.role;
    requesterDepartment = user?.department ?? undefined;
  }

  // Evaluate rules in priority order
  for (const rule of enabledRules) {
    const matches = await evaluateRuleConditions(rule.conditions, {
      ...input,
      requesterRole,
      requesterDepartment,
    });

    if (matches) {
      const approvers = await resolveApprovers(rule.action, {
        requesterId: input.requesterId,
        requesterType: input.requesterType,
        requesterDepartment,
      });

      logger.info("Routing rule matched", {
        ruleId: rule.id,
        ruleName: rule.name,
        requestType: input.requestType,
        approverCount: approvers.length,
      });

      return {
        matched: true,
        ruleId: rule.id,
        ruleName: rule.name,
        approvers,
        requiresApproval: approvers.length > 0,
        reason: `Matched rule: ${rule.name}`,
      };
    }
  }

  return {
    matched: false,
    approvers: [],
    requiresApproval: false,
    reason: "No routing rules matched",
  };
}

/**
 * Evaluate rule conditions.
 */
async function evaluateRuleConditions(
  conditions: RoutingCondition,
  input: {
    requestType: ApprovalRequestType;
    amount?: number;
    riskLevel?: string;
    domain?: string;
    requesterRole?: string;
    requesterDepartment?: string;
    context: Record<string, any>;
  },
): Promise<boolean> {
  // Check request types
  if (conditions.requestTypes?.length) {
    if (!conditions.requestTypes.includes(input.requestType)) {
      return false;
    }
  }

  // Check amount range
  if (conditions.minAmount !== undefined && input.amount !== undefined) {
    if (input.amount < conditions.minAmount) return false;
  }
  if (conditions.maxAmount !== undefined && input.amount !== undefined) {
    if (input.amount > conditions.maxAmount) return false;
  }

  // Check risk levels
  if (conditions.riskLevels?.length && input.riskLevel) {
    if (!conditions.riskLevels.includes(input.riskLevel as any)) {
      return false;
    }
  }

  // Check domains
  if (conditions.domains?.length && input.domain) {
    if (!conditions.domains.includes(input.domain)) {
      return false;
    }
  }

  // Check agent roles
  if (conditions.agentRoles?.length && input.requesterRole) {
    if (!conditions.agentRoles.includes(input.requesterRole)) {
      return false;
    }
  }

  // Check departments
  if (conditions.departments?.length && input.requesterDepartment) {
    if (!conditions.departments.includes(input.requesterDepartment)) {
      return false;
    }
  }

  // Check custom conditions
  if (conditions.customConditions?.length) {
    for (const condition of conditions.customConditions) {
      const value = getNestedValue(input.context, condition.field);
      if (!evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get nested value from object using dot notation.
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Evaluate a single condition.
 */
function evaluateCondition(value: any, operator: string, target: any): boolean {
  switch (operator) {
    case "equals":
      return value === target;
    case "not_equals":
      return value !== target;
    case "greater_than":
      return value > target;
    case "less_than":
      return value < target;
    case "contains":
      return Array.isArray(value) ? value.includes(target) : String(value).includes(String(target));
    case "not_contains":
      return Array.isArray(value) ? !value.includes(target) : !String(value).includes(String(target));
    default:
      return false;
  }
}

/**
 * Resolve approvers from routing action.
 */
async function resolveApprovers(
  action: RoutingAction,
  context: {
    requesterId: string;
    requesterType: "agent" | "user";
    requesterDepartment?: string;
  },
): Promise<Array<{ userId: string; userName: string; userRole?: string }>> {
  const approvers: Array<{ userId: string; userName: string; userRole?: string }> = [];

  // Handle approval chain
  const chain = action.approvalChain ?? [{
    approverType: action.approverType,
    approverIds: action.approverIds,
    approverRoles: action.approverRoles,
  }];

  for (const step of chain) {
    const stepApprovers = await resolveApproversForStep(step, context);
    approvers.push(...stepApprovers);
  }

  return approvers;
}

/**
 * Resolve approvers for a single step.
 */
async function resolveApproversForStep(
  step: {
    approverType: string;
    approverIds?: string[];
    approverRoles?: string[];
  },
  context: {
    requesterId: string;
    requesterType: "agent" | "user";
    requesterDepartment?: string;
  },
): Promise<Array<{ userId: string; userName: string; userRole?: string }>> {
  const approvers: Array<{ userId: string; userName: string; userRole?: string }> = [];

  switch (step.approverType) {
    case "user":
      if (step.approverIds?.length) {
        const users = await prisma.user.findMany({
          where: { id: { in: step.approverIds } },
          select: { id: true, name: true, email: true, role: true },
        });
        for (const user of users) {
          approvers.push({
            userId: user.id,
            userName: user.name ?? user.email,
            userRole: user.role,
          });
        }
      }
      break;

    case "role":
      if (step.approverRoles?.length) {
        const users = await prisma.user.findMany({
          where: { role: { in: step.approverRoles } },
          select: { id: true, name: true, email: true, role: true },
        });
        for (const user of users) {
          approvers.push({
            userId: user.id,
            userName: user.name ?? user.email,
            userRole: user.role,
          });
        }
      }
      break;

    case "manager":
      // Get manager of requester
      if (context.requesterType === "user") {
        const user = await prisma.user.findUnique({
          where: { id: context.requesterId },
          select: { managerId: true },
        });
        if (user?.managerId) {
          const manager = await prisma.user.findUnique({
            where: { id: user.managerId },
            select: { id: true, name: true, email: true, role: true },
          });
          if (manager) {
            approvers.push({
              userId: manager.id,
              userName: manager.name ?? manager.email,
              userRole: manager.role,
            });
          }
        }
      }
      break;

    case "department_head":
      if (context.requesterDepartment) {
        const deptHead = await prisma.user.findFirst({
          where: {
            department: context.requesterDepartment,
            role: "department_head",
          },
          select: { id: true, name: true, email: true, role: true },
        });
        if (deptHead) {
          approvers.push({
            userId: deptHead.id,
            userName: deptHead.name ?? deptHead.email,
            userRole: deptHead.role,
          });
        }
      }
      break;

    case "executive":
      const executives = await prisma.user.findMany({
        where: { role: { in: ["ceo", "cto", "cfo", "executive"] } },
        select: { id: true, name: true, email: true, role: true },
      });
      for (const exec of executives) {
        approvers.push({
          userId: exec.id,
          userName: exec.name ?? exec.email,
          userRole: exec.role,
        });
      }
      break;
  }

  return approvers;
}

// ─── Automatic Approval Request Creation ─────────────────────────

/**
 * Automatically create approval request based on routing rules.
 */
export async function routeAndCreateApprovalRequest(input: {
  requesterId: string;
  requesterType: "agent" | "user";
  requestType: ApprovalRequestType;
  title: string;
  description: string;
  context?: Record<string, any>;
  amount?: number;
  riskLevel?: "low" | "medium" | "high" | "critical";
  domain?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, any>;
}): Promise<{ approvalRequest?: any; routingResult: RoutingResult }> {
  // Evaluate routing
  const routingResult = await evaluateRouting({
    requestType: input.requestType,
    requesterId: input.requesterId,
    requesterType: input.requesterType,
    context: input.context ?? {},
    amount: input.amount,
    riskLevel: input.riskLevel,
    domain: input.domain,
  });

  if (!routingResult.requiresApproval || routingResult.approvers.length === 0) {
    return { routingResult };
  }

  // Create approval request
  const approvalRequest = await createApprovalRequest({
    requesterId: input.requesterId,
    requesterType: input.requesterType,
    requestType: input.requestType,
    title: input.title,
    description: input.description,
    context: {
      ...input.context,
      routingRuleId: routingResult.ruleId,
      routingRuleName: routingResult.ruleName,
      amount: input.amount,
      riskLevel: input.riskLevel,
      domain: input.domain,
    },
    priority: input.priority ?? "normal",
    approvalChain: routingResult.approvers.map(approver => ({
      approverId: approver.userId,
      approverName: approver.userName,
      approverRole: approver.userRole,
    })),
    metadata: {
      ...input.metadata,
      routedAutomatically: true,
      routingReason: routingResult.reason,
    },
  });

  return { approvalRequest, routingResult };
}

// ─── Default Routing Rules ──────────────────────────────────────

/**
 * Seed default routing rules based on constitution policies.
 */
export async function seedDefaultRoutingRules(): Promise<void> {
  const existingRules = await listRoutingRules();
  if (existingRules.length > 0) return;

  logger.info("Seeding default routing rules");

  // Rule 1: Expenditures over $10,000 require executive approval
  await createRoutingRule({
    name: "High-value expenditure approval",
    description: "Expenditures over $10,000 require executive approval",
    priority: 1000,
    conditions: {
      requestTypes: ["expenditure"],
      minAmount: 10000,
    },
    action: {
      approverType: "executive",
    },
  });

  // Rule 2: External communications require manager approval
  await createRoutingRule({
    name: "External communication approval",
    description: "External communications require manager approval",
    priority: 900,
    conditions: {
      requestTypes: ["external_communication"],
    },
    action: {
      approverType: "manager",
    },
  });

  // Rule 3: High-risk decisions require department head approval
  await createRoutingRule({
    name: "High-risk decision approval",
    description: "High-risk decisions require department head approval",
    priority: 950,
    conditions: {
      riskLevels: ["high", "critical"],
    },
    action: {
      approverType: "department_head",
    },
  });

  // Rule 4: Legal domain requires legal team approval
  await createRoutingRule({
    name: "Legal domain approval",
    description: "Legal domain decisions require legal team approval",
    priority: 850,
    conditions: {
      domains: ["legal"],
    },
    action: {
      approverRoles: ["legal_counsel", "legal_manager"],
    },
  });

  // Rule 5: Finance domain requires finance team approval
  await createRoutingRule({
    name: "Finance domain approval",
    description: "Finance domain decisions require finance team approval",
    priority: 850,
    conditions: {
      domains: ["finance"],
    },
    action: {
      approverRoles: ["finance_manager", "cfo"],
    },
  });

  logger.info("Default routing rules seeded");
}
