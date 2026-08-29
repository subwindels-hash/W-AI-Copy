/**
 * Long-running job lifecycle (Phase 2 §7) and human handoff (§12).
 *
 * §7's contract is that the webhook is never held open: a slow command is
 * acknowledged immediately, executed by the worker, and reported back as a
 * second WhatsApp message. The failure modes matter as much as the happy path —
 * a job that dies mid-run must be reclaimed, and a permanently broken job must
 * stop retrying instead of messaging the user three times.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWaPrisma } from "./testUtils/waPrisma.js";
import { cuid } from "../../testUtils/fakePrisma.js";

const wa = createWaPrisma();
const db = wa.db;

const sendText = vi.fn();
const executeJob = vi.fn();
const createTicket = vi.fn();
const createAndSend = vi.fn();
const auditLog = vi.fn();

vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));
vi.mock("./whatsappMessage.service.js", () => ({
  WhatsAppMessageService: { sendText, sendMedia: vi.fn(), markRead: vi.fn(), applyStatusUpdate: vi.fn() },
}));
vi.mock("./whatsappCommandExec.js", () => ({ executeJob, executeQuery: vi.fn() }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: auditLog } }));
vi.mock("../../helpdesk/helpdesk.service.js", () => ({
  HelpdeskService: { createTicket, createComment: vi.fn() },
}));
vi.mock("../../notifications/notifications.service.js", () => ({
  notificationsService: { createAndSend },
}));

const { WhatsAppJobService, MAX_JOB_ATTEMPTS } = await import("./whatsappJob.service.js");
const { requestHumanHandoff, looksUnresolved } = await import("./whatsappHandoff.service.js");

const ORG = "org-alpha";
const CHANNEL_ID = "chan-1";
const CONV_ID = "wa-conv-1";
const WIN_CONV_ID = "win-conv-1";

function seedWorld() {
  db.seed("WhatsAppChannel", [{
    id: CHANNEL_ID, organizationId: ORG, name: "Support",
    phoneNumberId: "109876543210987", businessAccountId: "WABA-1",
    displayPhoneNumber: "15550001111", status: "CONNECTED", webhookStatus: "VERIFIED",
    enabled: true, apiVersion: "v21.0",
    accessTokenEnc: "token", appSecretEnc: "secret", verifyTokenEnc: "verify",
    settings: {}, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  }]);
  db.seed("WhatsAppContact", [{
    id: "contact-1", organizationId: ORG, whatsappChannelId: CHANNEL_ID,
    whatsappUserId: "2348012345678", phoneNumber: "2348012345678",
    displayName: "Ada", linkedWindelsUserId: "user-1",
    createdAt: new Date(), updatedAt: new Date(),
  }]);
  db.seed("WhatsAppConversation", [{
    id: CONV_ID, organizationId: ORG, whatsappChannelId: CHANNEL_ID, contactId: "contact-1",
    windelsConversationId: WIN_CONV_ID, status: "OPEN", metadata: {},
    lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  }]);
}

const command = {
  kind: "create_report" as const,
  argument: "Q3 revenue",
  raw: "create report Q3 revenue",
  requiredPermissions: [],
  risk: "low" as const,
  async: true,
  describe: 'generate a report: "Q3 revenue"',
};

const actor = {
  organizationId: ORG,
  userId: "user-1",
  agentId: "agent-1",
  conversationId: WIN_CONV_ID,
};

beforeEach(() => {
  wa.reset();
  sendText.mockReset();
  executeJob.mockReset();
  createTicket.mockReset();
  createAndSend.mockReset();
  auditLog.mockReset();
  sendText.mockResolvedValue({ ok: true, messageId: "wamid.ack", recordId: "rec-1" });
  auditLog.mockResolvedValue(undefined);
  createAndSend.mockResolvedValue(undefined);
  seedWorld();
});

describe("job creation and acknowledgement (§7)", () => {
  it("queues the job and acknowledges immediately without doing the work", async () => {
    const { jobId, acked } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1", command, actor,
    });

    expect(acked).toBe(true);
    // Critically: nothing executed during the request path.
    expect(executeJob).not.toHaveBeenCalled();

    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.status).toBe("QUEUED");
    expect(job.kind).toBe("create_report");

    // The ACK is honest about being a promise, not a result.
    const ack = sendText.mock.calls[0][2];
    expect(ack).toMatch(/working on it/i);
    expect(ack).toMatch(/I'll message you/i);
  });

  it("records the ACK message id so a retry cannot double-acknowledge", async () => {
    const { jobId } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1", command, actor,
    });
    expect(db.rows("WhatsAppJob").find((j: any) => j.id === jobId).ackMessageId).toBe("rec-1");
  });

  it("still queues the work when the ACK itself fails to send", async () => {
    sendText.mockRejectedValueOnce(new Error("network down"));
    const { jobId, acked } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1", command, actor,
    });
    expect(acked).toBe(false);
    // The user's request is not lost just because the courtesy reply failed.
    expect(db.rows("WhatsAppJob").find((j: any) => j.id === jobId).status).toBe("QUEUED");
  });

  it("carries extracted document text to the worker so it need not re-download", async () => {
    const { jobId } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1",
      command: { ...command, kind: "analyze_file" as const },
      actor, documentText: "Invoice total 250,000 NGN",
    });
    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.params.documentText).toContain("250,000 NGN");
  });

  it("audits every job creation", async () => {
    await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1", command, actor,
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.job_created" }));
  });
});

describe("job execution", () => {
  async function queueJob(over: Record<string, unknown> = {}) {
    const { jobId } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "msg-1", command, actor,
    });
    Object.assign(db.rows("WhatsAppJob").find((j: any) => j.id === jobId), over);
    sendText.mockClear();
    return jobId;
  }

  it("runs the job and delivers the result as a second WhatsApp message", async () => {
    const jobId = await queueJob();
    executeJob.mockResolvedValue({ ok: true, text: "Q3 revenue was 4.8m NGN, up 12%." });

    expect(await WhatsAppJobService.runJob(jobId)).toBe("completed");

    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.status).toBe("COMPLETED");
    expect(job.resultText).toContain("4.8m NGN");
    expect(job.completedAt).toBeTruthy();
    expect(sendText.mock.calls[0][2]).toContain("4.8m NGN");
  });

  it("stores the workflow ids the execution reports (§3 traceability)", async () => {
    const jobId = await queueJob();
    executeJob.mockResolvedValue({
      ok: true, text: "Workflow finished.", workflowId: "wf-1", workflowRunId: "run-9",
    });
    await WhatsAppJobService.runJob(jobId);

    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.workflowId).toBe("wf-1");
    expect(job.workflowRunId).toBe("run-9");
  });

  it("tells the user when the job failed rather than going silent", async () => {
    const jobId = await queueJob();
    executeJob.mockResolvedValue({ ok: false, text: "No workflow named 'Nightly' exists." });

    expect(await WhatsAppJobService.runJob(jobId)).toBe("failed");
    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.status).toBe("FAILED");
    expect(sendText.mock.calls[0][2]).toContain("No workflow named");
  });

  it("does not retry a permanent failure", async () => {
    const jobId = await queueJob();
    executeJob.mockResolvedValue({ ok: false, text: "No workflow named 'Nightly' exists." });
    await WhatsAppJobService.runJob(jobId);
    // Terminal, so the tick will not pick it up again.
    expect(db.rows("WhatsAppJob").find((j: any) => j.id === jobId).status).toBe("FAILED");
  });

  it("re-queues a transient failure and gives up at the attempt budget", async () => {
    const jobId = await queueJob();
    executeJob.mockResolvedValue({ ok: false, text: "Request timeout while contacting the service" });

    await WhatsAppJobService.runJob(jobId);
    expect(db.rows("WhatsAppJob").find((j: any) => j.id === jobId).status).toBe("QUEUED");

    for (let i = 1; i < MAX_JOB_ATTEMPTS; i++) await WhatsAppJobService.runJob(jobId);

    const job = db.rows("WhatsAppJob").find((j: any) => j.id === jobId);
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(MAX_JOB_ATTEMPTS);
  });

  it("survives an execution that throws", async () => {
    const jobId = await queueJob();
    executeJob.mockRejectedValue(new Error("boom"));
    const result = await WhatsAppJobService.runJob(jobId);
    expect(["failed", "completed"]).toContain(result);
    expect(db.rows("WhatsAppJob").find((j: any) => j.id === jobId).status).not.toBe("RUNNING");
  });

  it("ignores a job that is already terminal", async () => {
    const jobId = await queueJob({ status: "COMPLETED" });
    expect(await WhatsAppJobService.runJob(jobId)).toBe("skipped");
    expect(executeJob).not.toHaveBeenCalled();
  });

  it("skips a job that no longer exists", async () => {
    expect(await WhatsAppJobService.runJob("missing")).toBe("skipped");
  });
});

describe("worker tick", () => {
  it("drains queued jobs and reclaims one whose worker died mid-run", async () => {
    executeJob.mockResolvedValue({ ok: true, text: "done" });

    await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "m1", command, actor,
    });
    const { jobId: stuckId } = await WhatsAppJobService.createAndAck({
      organizationId: ORG, conversationId: CONV_ID, requestMessageId: "m2", command, actor,
    });

    // Simulate a crashed worker: RUNNING with an old start time.
    Object.assign(db.rows("WhatsAppJob").find((j: any) => j.id === stuckId), {
      status: "RUNNING", startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const { handled } = await WhatsAppJobService.runTick();
    expect(handled).toBe(2);
    for (const j of db.rows("WhatsAppJob")) expect(j.status).toBe("COMPLETED");
  });

  it("is a no-op when the queue is empty", async () => {
    expect(await WhatsAppJobService.runTick()).toEqual({ handled: 0, failed: 0 });
  });
});

describe("human handoff (§12)", () => {
  const input = {
    organizationId: ORG,
    whatsappConversationId: CONV_ID,
    windelsConversationId: WIN_CONV_ID,
    contactName: "Ada",
    phoneNumber: "2348012345678",
    linkedUserId: "user-1",
    reason: "user_requested" as const,
    triggerText: "I need to speak to a person",
  };

  beforeEach(() => {
    db.seed("Membership", [{
      id: cuid(), organizationId: ORG, userId: "owner-1", role: "OWNER", createdAt: new Date(),
    }]);
    createTicket.mockResolvedValue({ id: "tkt-1", number: "HD-1001" });
  });

  it("opens a real helpdesk ticket and escalates the conversation", async () => {
    const result = await requestHumanHandoff(input);

    expect(createTicket).toHaveBeenCalledTimes(1);
    expect(result.ticketNumber).toBe("HD-1001");
    expect(result.replyText).toContain("HD-1001");

    const conv = db.rows("WhatsAppConversation").find((c: any) => c.id === CONV_ID);
    expect(conv.status).toBe("ESCALATED");
    expect(conv.metadata.helpdeskTicketId).toBe("tkt-1");
  });

  it("gives the human agent the conversation context, not just the last line", async () => {
    db.seed("Message", [
      { id: "m1", conversationId: WIN_CONV_ID, role: "USER", content: "my order never arrived", createdAt: new Date(Date.now() - 3000) },
      { id: "m2", conversationId: WIN_CONV_ID, role: "ASSISTANT", content: "let me check that", createdAt: new Date(Date.now() - 2000) },
    ]);

    await requestHumanHandoff(input);

    const [, ticket] = createTicket.mock.calls[0];
    const body = JSON.stringify(ticket);
    expect(body).toContain("my order never arrived");
    expect(ticket.tags).toContain("whatsapp");
  });

  it("notifies the org owners so the ticket is not left unseen", async () => {
    await requestHumanHandoff(input);
    expect(createAndSend).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-1" }));
  });

  it("is idempotent — a second request returns the existing ticket", async () => {
    const first = await requestHumanHandoff(input);
    createTicket.mockClear();

    const second = await requestHumanHandoff(input);
    expect(createTicket).not.toHaveBeenCalled();
    expect(second.ticketNumber).toBe(first.ticketNumber);
  });

  it("still escalates and replies when the ticket cannot be created", async () => {
    createTicket.mockRejectedValue(new Error("helpdesk unavailable"));

    const result = await requestHumanHandoff(input);
    // The user must never be dropped because an internal system failed.
    expect(result.replyText).toBeTruthy();
    expect(db.rows("WhatsAppConversation").find((c: any) => c.id === CONV_ID).status).toBe("ESCALATED");
  });

  it("audits the escalation", async () => {
    await requestHumanHandoff(input);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.handoff_requested" }));
  });
});

describe("looksUnresolved — automatic escalation trigger", () => {
  it("detects an AI answer that admits defeat", () => {
    for (const answer of [
      "I'm sorry, I don't have access to that information.",
      "I cannot help with that request.",
      "I'm not able to assist with this — please contact support.",
    ]) {
      expect(looksUnresolved(answer), answer).toBe(true);
    }
  });

  it("does not escalate a normal, useful answer", () => {
    for (const answer of [
      "Your Q3 revenue was 4.8m NGN, up 12% on Q2.",
      "I've created the task and assigned it to you.",
      "There are 3 campaigns running right now.",
      // Contains "sorry" but resolves the question.
      "Sorry for the delay — here is the report you asked for.",
    ]) {
      expect(looksUnresolved(answer), answer).toBe(false);
    }
  });

  it("handles empty input without throwing", () => {
    expect(looksUnresolved("")).toBe(false);
    expect(looksUnresolved(null as any)).toBe(false);
  });
});
