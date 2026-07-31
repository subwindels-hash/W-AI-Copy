/**
 * Session 20 bootstrap — seeds sensible defaults for agent comm.
 *
 *  - One default "Operations Pod" team (coordinator = first built-in agent)
 *  - Two default escalation policies (low confidence / PII data)
 *  - Ensures identities for all existing Prisma agents
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { AgentIdentityService } from "./agentIdentity.service.js";
import { CollaborationService } from "./collaboration.service.js";
import { EscalationService } from "./escalation.service.js";

export async function bootstrapAgentComm() {
  try {
    // Ensure identities for every persisted agent.
    const agents = await prisma.agent.findMany({ select: { id: true, name: true, department: true, capabilities: true } });
    for (const a of agents) { await AgentIdentityService.ensure(a.id); }
    const identities = await AgentIdentityService.list();

    // Seed a default team if none exist.
    const teams = await CollaborationService.listTeams();
    if (teams.length === 0) {
      const coordinator = identities[0]?.agentId ?? agents[0]?.id;
      if (coordinator) {
        await CollaborationService.createTeam({
          name: "Operations Pod",
          mission: "Default cross-functional pod handling research, summarisation, and routine task execution.",
          department: "General",
          coordinatorId: coordinator,
          members: identities.slice(0, 4).map((i) => ({ agentId: i.agentId, role: i.agentId === coordinator ? "coordinator" : "worker", skills: [], capacity: 1 })),
          metadata: { builtIn: true },
        });
      }
    }

    // Seed default escalation policies.
    const policies = await EscalationService.listPolicies();
    if (!policies.length) {
      await EscalationService.createPolicy({
        name: "Low-confidence requires human approval",
        description: "Any task where the agent reports confidence below 0.6 should pause and request human approval.",
        scope: "*",
        conditions: { minConfidence: 0.6 },
        actions: ["request_human_approval", "pause_task"],
        enabled: true,
      });
      await EscalationService.createPolicy({
        name: "PII/confidential data escalates to manager",
        description: "Tasks touching restricted/pii data must notify the agent's manager before execution.",
        scope: "*",
        conditions: { dataClassifications: ["restricted", "pii"] },
        actions: ["notify_manager", "request_human_approval"],
        enabled: true,
      });
      await EscalationService.createPolicy({
        name: "High-cost operations rerouted",
        description: "Tasks estimated to cost > $0.50 (500_000 micros) require governance review.",
        scope: "*",
        conditions: { maxCostMicros: 500_000 },
        actions: ["invoke_governance"],
        enabled: false,
      });
    }

    logger.info("agent comm bootstrap complete", {
      identities: identities.length,
      teams: (await CollaborationService.listTeams()).length,
      policies: (await EscalationService.listPolicies()).length,
    });
  } catch (e) {
    logger.warn("agent comm bootstrap failed", { error: (e as Error).message });
  }
}
