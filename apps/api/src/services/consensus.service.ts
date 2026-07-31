/**
 * Consensus Service (Module 5 — Gap 2)
 *
 * Provides voting and agreement protocols for multi-agent decisions:
 * - Multiple consensus algorithms (majority, supermajority, weighted, unanimous)
 * - Proposal lifecycle (propose → vote → decide)
 * - Vote tracking with reasons and confidence
 * - Quorum enforcement
 * - Timeout and auto-decision
 * - Veto power for critical decisions
 *
 * Uses Redis for fast vote counting and proposal state management.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import { pushEvent } from "../http/routes/events.js";
import { z } from "zod";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:consensus');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type ConsensusAlgorithm = "majority" | "supermajority" | "weighted" | "unanimous";
export type ProposalStatus = "open" | "passed" | "failed" | "vetoed" | "expired" | "cancelled";
export type VoteChoice = "approve" | "reject" | "abstain";

export interface Proposal {
  id: string;
  title: string;
  description: string;
  organizationId: string;
  proposerId: string; // agent ID or user ID
  algorithm: ConsensusAlgorithm;
  quorum: number; // Minimum votes required
  threshold: number; // Approval threshold (0.5 for majority, 0.67 for supermajority, 1.0 for unanimous)
  weights?: Record<string, number>; // agentId -> weight (for weighted voting)
  vetoAgents?: string[]; // Agents with veto power
  votes: Record<string, Vote>; // agentId -> vote
  status: ProposalStatus;
  decision?: string;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  metadata: Record<string, any>;
}

export interface Vote {
  agentId: string;
  choice: VoteChoice;
  reason?: string;
  confidence?: number; // 0-1
  weight: number;
  votedAt: number;
}

export interface ConsensusResult {
  proposalId: string;
  status: ProposalStatus;
  decision?: string;
  summary: {
    totalVotes: number;
    approvals: number;
    rejections: number;
    abstentions: number;
    approvalWeight: number;
    rejectionWeight: number;
    totalWeight: number;
    approvalPercentage: number;
    quorumMet: boolean;
    thresholdMet: boolean;
    vetoed: boolean;
    vetoedBy?: string;
  };
}

// ─── Redis Keys ─────────────────────────────────────────────────

const PROPOSAL_KEY = (id: string) => `consensus:proposal:${id}`;
const PROPOSAL_INDEX_KEY = "consensus:proposals";
const PROPOSAL_ORG_KEY = (orgId: string) => `consensus:org:${orgId}`;
const PROPOSAL_AGENT_KEY = (agentId: string) => `consensus:agent:${agentId}`;

// ─── Schemas ────────────────────────────────────────────────────

export const CreateProposalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  algorithm: z.enum(["majority", "supermajority", "weighted", "unanimous"]).default("majority"),
  quorum: z.number().int().min(1).default(3),
  threshold: z.number().min(0).max(1).optional(), // Auto-calculated if not provided
  weights: z.record(z.number().min(0)).optional(),
  vetoAgents: z.array(z.string()).optional(),
  expiresInSeconds: z.number().int().min(60).max(604800).default(86400), // 1min to 7 days, default 24h
  metadata: z.record(z.any()).optional(),
});

export const CastVoteSchema = z.object({
  choice: z.enum(["approve", "reject", "abstain"]),
  reason: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

// ─── Proposal Management ────────────────────────────────────────

/**
 * Create a new proposal for consensus.
 */
export async function createProposal(
  organizationId: string,
  proposerId: string,
  input: z.infer<typeof CreateProposalSchema>,
): Promise<Proposal> {
  const id = `prop_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = Date.now();

  // Calculate threshold based on algorithm
  let threshold = input.threshold;
  if (threshold === undefined) {
    switch (input.algorithm) {
      case "majority":
        threshold = 0.5;
        break;
      case "supermajority":
        threshold = 0.67;
        break;
      case "unanimous":
        threshold = 1.0;
        break;
      case "weighted":
        threshold = 0.5; // Default for weighted, can be overridden
        break;
    }
  }

  const proposal: Proposal = {
    id,
    title: input.title,
    description: input.description,
    organizationId,
    proposerId,
    algorithm: input.algorithm,
    quorum: input.quorum,
    threshold,
    weights: input.weights,
    vetoAgents: input.vetoAgents,
    votes: {},
    status: "open",
    createdAt: now,
    expiresAt: now + input.expiresInSeconds * 1000,
    metadata: input.metadata ?? {},
  };

  // Store proposal
  await redis.hset(PROPOSAL_KEY(id), {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    organizationId: proposal.organizationId,
    proposerId: proposal.proposerId,
    algorithm: proposal.algorithm,
    quorum: String(proposal.quorum),
    threshold: String(proposal.threshold),
    weights: JSON.stringify(proposal.weights ?? {}),
    vetoAgents: JSON.stringify(proposal.vetoAgents ?? []),
    votes: JSON.stringify(proposal.votes),
    status: proposal.status,
    decision: proposal.decision ?? "",
    createdAt: String(proposal.createdAt),
    expiresAt: String(proposal.expiresAt),
    decidedAt: proposal.decidedAt ? String(proposal.decidedAt) : "",
    metadata: JSON.stringify(proposal.metadata),
  });

  // Add to indexes
  const pipeline = redis.multi();
  pipeline.sadd(PROPOSAL_INDEX_KEY, id);
  pipeline.sadd(PROPOSAL_ORG_KEY(organizationId), id);
  pipeline.sadd(PROPOSAL_AGENT_KEY(proposerId), id);
  pipeline.expire(PROPOSAL_KEY(id), input.expiresInSeconds + 86400); // Keep for 1 day after expiry
  await pipeline.exec();

  logger.info("Proposal created", {
    proposalId: id,
    title: input.title,
    algorithm: input.algorithm,
    quorum: input.quorum,
    threshold,
    proposerId,
  });

  // Emit event
  pushEvent("proposal.created", {
    proposalId: id,
    title: input.title,
    algorithm: input.algorithm,
    organizationId,
  });

  return proposal;
}

/**
 * Get a proposal by ID.
 */
export async function getProposal(proposalId: string): Promise<Proposal | null> {
  const data = await redis.hgetall(PROPOSAL_KEY(proposalId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    organizationId: data.organizationId,
    proposerId: data.proposerId,
    algorithm: data.algorithm as ConsensusAlgorithm,
    quorum: parseInt(data.quorum, 10),
    threshold: parseFloat(data.threshold),
    weights: JSON.parse(data.weights || "{}"),
    vetoAgents: JSON.parse(data.vetoAgents || "[]"),
    votes: JSON.parse(data.votes || "{}"),
    status: data.status as ProposalStatus,
    decision: data.decision || undefined,
    createdAt: parseInt(data.createdAt, 10),
    expiresAt: parseInt(data.expiresAt, 10),
    decidedAt: data.decidedAt ? parseInt(data.decidedAt, 10) : undefined,
    metadata: JSON.parse(data.metadata || "{}"),
  };
}

/**
 * List proposals for an organization.
 */
export async function listProposals(
  organizationId: string,
  filter?: { status?: ProposalStatus; limit?: number },
): Promise<Proposal[]> {
  const proposalIds = await redis.smembers(PROPOSAL_ORG_KEY(organizationId));
  const proposals: Proposal[] = [];

  for (const id of proposalIds) {
    const proposal = await getProposal(id);
    if (!proposal) continue;
    if (filter?.status && proposal.status !== filter.status) continue;
    proposals.push(proposal);
    if (filter?.limit && proposals.length >= filter.limit) break;
  }

  return proposals.sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Voting ─────────────────────────────────────────────────────

/**
 * Cast a vote on a proposal.
 */
export async function castVote(
  proposalId: string,
  agentId: string,
  input: z.infer<typeof CastVoteSchema>,
): Promise<{ vote: Vote; result: ConsensusResult }> {
  const proposal = await getProposal(proposalId);
  if (!proposal) throw AppError.notFound("Proposal not found");

  if (proposal.status !== "open") {
    throw AppError.badRequest(`Proposal is ${proposal.status}, cannot vote`);
  }

  if (Date.now() > proposal.expiresAt) {
    // Auto-expire the proposal
    await expireProposal(proposalId);
    throw AppError.badRequest("Proposal has expired");
  }

  // Check if agent already voted
  if (proposal.votes[agentId]) {
    throw AppError.conflict(`Agent ${agentId} has already voted on this proposal`);
  }

  // Calculate vote weight
  const weight = proposal.weights?.[agentId] ?? 1;

  const vote: Vote = {
    agentId,
    choice: input.choice,
    reason: input.reason,
    confidence: input.confidence,
    weight,
    votedAt: Date.now(),
  };

  // Add vote to proposal
  proposal.votes[agentId] = vote;
  await redis.hset(PROPOSAL_KEY(proposalId), {
    votes: JSON.stringify(proposal.votes),
  });

  // Add to agent index
  await redis.sadd(PROPOSAL_AGENT_KEY(agentId), proposalId);

  logger.info("Vote cast", {
    proposalId,
    agentId,
    choice: input.choice,
    weight,
  });

  // Emit event
  pushEvent("vote.cast", {
    proposalId,
    agentId,
    choice: input.choice,
    organizationId: proposal.organizationId,
  });

  // Check if consensus is reached
  const result = await evaluateConsensus(proposal);

  // If consensus reached, finalize the proposal
  if (result.status !== "open") {
    await finalizeProposal(proposalId, result);
  }

  return { vote, result };
}

/**
 * Evaluate consensus based on the proposal's algorithm.
 */
export async function evaluateConsensus(proposal: Proposal): Promise<ConsensusResult> {
  const votes = Object.values(proposal.votes);
  const totalVotes = votes.length;

  // Count votes
  const approvals = votes.filter(v => v.choice === "approve").length;
  const rejections = votes.filter(v => v.choice === "reject").length;
  const abstentions = votes.filter(v => v.choice === "abstain").length;

  // Calculate weighted votes
  const approvalWeight = votes.filter(v => v.choice === "approve").reduce((sum, v) => sum + v.weight, 0);
  const rejectionWeight = votes.filter(v => v.choice === "reject").reduce((sum, v) => sum + v.weight, 0);
  const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);

  const approvalPercentage = totalWeight > 0 ? approvalWeight / totalWeight : 0;
  const quorumMet = totalVotes >= proposal.quorum;
  const thresholdMet = approvalPercentage >= proposal.threshold;

  // Check for veto
  let vetoed = false;
  let vetoedBy: string | undefined;
  if (proposal.vetoAgents?.length) {
    for (const vetoAgent of proposal.vetoAgents) {
      const vote = proposal.votes[vetoAgent];
      if (vote && vote.choice === "reject") {
        vetoed = true;
        vetoedBy = vetoAgent;
        break;
      }
    }
  }

  // Determine status
  let status: ProposalStatus = "open";
  let decision: string | undefined;

  if (vetoed) {
    status = "vetoed";
    decision = `Vetoed by ${vetoedBy}`;
  } else if (quorumMet && thresholdMet) {
    status = "passed";
    decision = `Approved with ${Math.round(approvalPercentage * 100)}% approval (${approvals}/${totalVotes} votes)`;
  } else if (quorumMet && !thresholdMet) {
    // Check if it's impossible to reach threshold
    const remainingVotes = proposal.quorum - totalVotes; // Could be negative if over quorum
    const maxPossibleApproval = (approvalWeight + remainingVotes) / (totalWeight + remainingVotes);
    if (maxPossibleApproval < proposal.threshold) {
      status = "failed";
      decision = `Rejected with ${Math.round(approvalPercentage * 100)}% approval (below ${Math.round(proposal.threshold * 100)}% threshold)`;
    }
  }

  return {
    proposalId: proposal.id,
    status,
    decision,
    summary: {
      totalVotes,
      approvals,
      rejections,
      abstentions,
      approvalWeight,
      rejectionWeight,
      totalWeight,
      approvalPercentage,
      quorumMet,
      thresholdMet,
      vetoed,
      vetoedBy,
    },
  };
}

/**
 * Finalize a proposal with the consensus result.
 */
async function finalizeProposal(proposalId: string, result: ConsensusResult) {
  const now = Date.now();

  await redis.hset(PROPOSAL_KEY(proposalId), {
    status: result.status,
    decision: result.decision ?? "",
    decidedAt: String(now),
  });

  logger.info("Proposal finalized", {
    proposalId,
    status: result.status,
    decision: result.decision,
    summary: result.summary,
  });

  // Emit event
  const proposal = await getProposal(proposalId);
  if (proposal) {
    pushEvent("proposal.decided", {
      proposalId,
      status: result.status,
      decision: result.decision,
      summary: result.summary,
      organizationId: proposal.organizationId,
    });
  }
}

/**
 * Expire a proposal that has passed its deadline.
 */
async function expireProposal(proposalId: string) {
  await redis.hset(PROPOSAL_KEY(proposalId), {
    status: "expired",
    decidedAt: String(Date.now()),
  });

  logger.info("Proposal expired", { proposalId });
}

/**
 * Cancel a proposal (by proposer or admin).
 */
export async function cancelProposal(
  proposalId: string,
  cancellerId: string,
): Promise<boolean> {
  const proposal = await getProposal(proposalId);
  if (!proposal) throw AppError.notFound("Proposal not found");

  if (proposal.status !== "open") {
    throw AppError.badRequest(`Proposal is ${proposal.status}, cannot cancel`);
  }

  // Only proposer or org admin can cancel
  if (proposal.proposerId !== cancellerId) {
    // TODO: Check if canceller is org admin
    throw AppError.forbidden("Only the proposer can cancel a proposal");
  }

  await redis.hset(PROPOSAL_KEY(proposalId), {
    status: "cancelled",
    decidedAt: String(Date.now()),
  });

  logger.info("Proposal cancelled", { proposalId, cancelledBy: cancellerId });

  return true;
}

// ─── Cleanup ────────────────────────────────────────────────────

/**
 * Check and expire overdue proposals (run periodically).
 */
export async function expireOverdueProposals(): Promise<number> {
  const allProposalIds = await redis.smembers(PROPOSAL_INDEX_KEY);
  let expired = 0;
  const now = Date.now();

  for (const id of allProposalIds) {
    const proposal = await getProposal(id);
    if (!proposal) continue;

    if (proposal.status === "open" && proposal.expiresAt < now) {
      await expireProposal(id);
      expired++;
    }
  }

  if (expired > 0) {
    logger.info("Overdue proposals expired", { count: expired });
  }

  return expired;
}
