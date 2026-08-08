/**
 * Session 142 — Unit tests: Religion Knowledge Integration & Teaching
 * Systems.
 *
 * Covers the five §20 channels: Memory Fabric sync (idempotent, honest
 * counts), AI agent attachment (dedupe by title, version-labelled), the AI
 * Training Center dataset (zero-synthetic, JSONL corpus with provenance),
 * the education layer (course catalog + Lecturer AI handoff), and the
 * conversational teaching endpoint (neutrality for truth claims, follow-up
 * suggestions, honest no-match).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReligionsIntegrationsService } from "./religions.integrations.service.js";
import { RELIGION_CATALOG } from "./religions.service.js";
import { RELIGION_CATALOG_VERSION } from "./religions.catalog.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();
  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
      async expire() { return 1; },
      async zadd(k: string, score: string, member: string) {
        const s = Number(score);
        let list = zsets.get(k);
        if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex((i) => i.member === member);
        if (idx !== -1) list.splice(idx, 1);
        list.push({ score: s, member });
        list.sort((a, b) => a.score - b.score);
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? [];
        const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map((i) => i.member);
      },
      async zrem() { return 1; },
      async hset() { return 1; },
      async hgetall() { return {}; },
      async sadd() { return 1; },
    },
  };
});

vi.mock("../memoryEvolution/memoryEvolution.service.js", () => ({
  MemoryEvolutionService: {
    add: vi.fn(async (input: { content: string }) => ({ id: "mem-x", content: input.content })),
  },
}));

vi.mock("../services/agentKnowledge.service.js", () => ({
  addKnowledge: vi.fn(async () => ({ id: "ak-x", title: "Religion: Test" })),
  listKnowledge: vi.fn(async () => ({ items: [], pagination: { page: 1, perPage: 500, total: 0, totalPages: 0 } })),
}));

vi.mock("../training/training.service.js", () => ({
  TrainingService: {
    createDataset: vi.fn(async (input: { name: string }) => ({ id: "ds-x", name: input.name, rows: 0, organizationId: "org-x" })),
  },
}));

vi.mock("../education/lecturer.service.js", () => ({
  LecturerService: {
    start: vi.fn(async (userId: string, topic: string) => ({
      sessionId: "ls-x",
      stage: "question",
      text: `Lecturer AI teaching ${topic}.`,
      question: { id: "q-1", stem: "Test?", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "E" },
      masteryPct: 0,
      level: "beginner",
      modelSource: "structured-fallback",
      warnings: [],
    })),
  },
}));

describe("Session 142 — Memory Fabric integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs every catalog record into the memory fabric with version labels", async () => {
    const { MemoryEvolutionService } = await import("../memoryEvolution/memoryEvolution.service.js");
    const res = await ReligionsIntegrationsService.syncMemory("org-mem-1");
    expect(res.channel).toBe("memory");
    expect(res.attempted).toBe(RELIGION_CATALOG.length);
    expect(res.succeeded).toBe(RELIGION_CATALOG.length);
    expect(res.failed).toBe(0);
    expect(res.catalogVersion).toBe(RELIGION_CATALOG_VERSION);
    expect(res.skippedDuplicateNote).toContain("deduplicates by content+scope");
    expect(MemoryEvolutionService.add).toHaveBeenCalledTimes(RELIGION_CATALOG.length);
    const firstCall = (MemoryEvolutionService.add as any).mock.calls[0][0];
    expect(firstCall.type).toBe("knowledge");
    expect(firstCall.scope).toBe("org:org-mem-1");
    expect(firstCall.tags).toContain("religion");
    expect(typeof firstCall.confidence).toBe("number");
  });

  it("filters by family and records the last sync", async () => {
    await ReligionsIntegrationsService.syncMemory("org-mem-2", { family: "ancient" });
    const status = await ReligionsIntegrationsService.memoryStatus("org-mem-2");
    expect(status.lastSync).not.toBeNull();
    expect(status.lastSync!.count).toBeGreaterThan(0);
    expect(status.lastSync!.version).toBe(RELIGION_CATALOG_VERSION);
  });

  it("is honest about failures without throwing", async () => {
    const { MemoryEvolutionService } = await import("../memoryEvolution/memoryEvolution.service.js");
    (MemoryEvolutionService.add as any).mockRejectedValueOnce(new Error("redis down"));
    const res = await ReligionsIntegrationsService.syncMemory("org-mem-3");
    expect(res.failed).toBe(1);
    expect(res.succeeded).toBe(RELIGION_CATALOG.length - 1);
  });
});

describe("Session 142 — AI agent integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches religion knowledge as version-labelled SNIPPETs", async () => {
    const { addKnowledge } = await import("../services/agentKnowledge.service.js");
    const res = await ReligionsIntegrationsService.attachToAgent("user-1", "agent-1", { limit: 5 });
    expect(res.channel).toBe("agents");
    expect(res.attached).toBe(5);
    expect(res.alreadyPresent).toBe(0);
    expect(res.note).toContain("catalog version");
    expect(addKnowledge).toHaveBeenCalledTimes(5);
    const firstCall = (addKnowledge as any).mock.calls[0][2];
    expect(firstCall.type).toBe("SNIPPET");
    expect(firstCall.title).toMatch(/^Religion: /);
    expect(firstCall.source).toContain(RELIGION_CATALOG_VERSION);
  });

  it("skips titles already attached (idempotent re-attach)", async () => {
    const { listKnowledge } = await import("../services/agentKnowledge.service.js");
    (listKnowledge as any).mockResolvedValueOnce({
      items: [{ title: "Religion: Judaism" }, { title: "Religion: Christianity" }],
      pagination: { total: 2 },
    });
    const res = await ReligionsIntegrationsService.attachToAgent("user-1", "agent-1", { limit: 10 });
    expect(res.alreadyPresent).toBe(2);
    expect(res.attached).toBe(8);
  });

  it("filters by family", async () => {
    const res = await ReligionsIntegrationsService.attachToAgent("user-1", "agent-1", { family: "humanistic", limit: 100 });
    expect(res.attached).toBe(2); // Secular Humanism + Unitarian Universalism
  });
});

describe("Session 142 — AI Training Center integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a zero-synthetic JSONL corpus with provenance per row", () => {
    const corpus = ReligionsIntegrationsService.trainingCorpus();
    expect(corpus.length).toBe(RELIGION_CATALOG.length);
    for (const { line } of corpus.slice(0, 20)) {
      const row = JSON.parse(line);
      expect(row.id).toBeTruthy();
      expect(row.question).toMatch(/^What is /);
      expect(row.answer.length).toBeGreaterThan(40);
      expect(row.source).toContain(RELIGION_CATALOG_VERSION);
      expect(row.tags).toContain("religion");
    }
  });

  it("creates the dataset in the training module with syntheticPct 0", async () => {
    const { TrainingService } = await import("../training/training.service.js");
    const res = await ReligionsIntegrationsService.createTrainingDataset("org-tr-1");
    expect(res.channel).toBe("training");
    expect(res.syntheticPct).toBe(0);
    expect(res.cleaned).toBe(true);
    expect(res.ragbuilderIncluded).toBe(true);
    expect(res.rows).toBe(RELIGION_CATALOG.length);
    expect(res.exportNote).toContain("syntheticPct is 0");
    expect(TrainingService.createDataset).toHaveBeenCalledWith(
      expect.objectContaining({ format: "jsonl", syntheticPct: 0, organizationId: "org-tr-1" }),
    );
  });
});

describe("Session 142 — Education (Lecturer AI) integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps every record to a teachable course", () => {
    const catalog = ReligionsIntegrationsService.educationCatalog();
    expect(catalog.length).toBe(RELIGION_CATALOG.length);
    expect(catalog[0]!.courseId).toBe(RELIGION_CATALOG[0]!.id);
    expect(catalog[0]!.topics.length).toBeGreaterThan(0);
  });

  it("hands a record to the real Lecturer AI with the curated course", async () => {
    const { LecturerService } = await import("../education/lecturer.service.js");
    const res = await ReligionsIntegrationsService.startLesson("user-1", "rel.buddhism", "beginner");
    expect(res.channel).toBe("education");
    expect(res.course!.id).toBe("rel.buddhism");
    expect(res.lecturer.sessionId).toBe("ls-x");
    expect(res.lecturer.text).toContain("Buddhism");
    expect(LecturerService.start).toHaveBeenCalledWith("user-1", "Buddhism", "beginner");
    expect(res.note).toContain("Lecturer AI");
  });

  it("maps research level to the Lecturer's advanced level", async () => {
    const { LecturerService } = await import("../education/lecturer.service.js");
    await ReligionsIntegrationsService.startLesson("user-1", "rel.islam", "research");
    expect(LecturerService.start).toHaveBeenCalledWith("user-1", "Islam", "advanced");
  });

  it("404s for unknown records", async () => {
    await expect(ReligionsIntegrationsService.startLesson("user-1", "nope", "beginner")).rejects.toThrow(/not found/);
  });
});

describe("Session 142 — Conversational teaching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers definitions as a chat turn with follow-ups", async () => {
    const res = await ReligionsIntegrationsService.chatAnswer(null, { question: "What is Christianity?", level: "intermediate" });
    expect(res.channel).toBe("chat");
    expect(res.role).toBe("assistant");
    expect(res.mode).toBe("teach");
    expect(res.answer).toContain("Christianity");
    expect(res.sections.length).toBeGreaterThan(0);
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.confidence).toBeTruthy();
    expect(res.followUp.length).toBeGreaterThan(0);
  });

  it("returns the neutrality answer for truth-claim questions", async () => {
    const res = await ReligionsIntegrationsService.chatAnswer(null, { question: "Which religion is true?" });
    expect(res.mode).toBe("neutrality");
    expect(res.answer).toContain("faith, theology, philosophy and personal belief");
    expect(res.answer).toContain("does not claim to have chosen a religion");
  });

  it("answers honestly when nothing is known", async () => {
    const res = await ReligionsIntegrationsService.chatAnswer(null, { question: "What is the Zxqvbn faith of Qwerty?" });
    expect(res.answer).toContain("do not have sufficient verified knowledge");
    expect(res.confidence).toBeNull();
    expect(res.note).toBeTruthy();
  });

  it("keeps controversial notes in the chat turn", async () => {
    const res = await ReligionsIntegrationsService.chatAnswer(null, { question: "What is Vodun?" });
    expect(res.answer.length).toBeGreaterThan(0);
    expect(res.controversialNote || res.answer).toBeTruthy();
  });
});

describe("Session 142 — Overview", () => {
  it("reports every channel's status honestly", async () => {
    const overview = await ReligionsIntegrationsService.overview("org-ov-1");
    expect(overview.channel).toBe("overview");
    expect(overview.catalogVersion).toBe(RELIGION_CATALOG_VERSION);
    expect(overview.recordCount).toBe(RELIGION_CATALOG.length);
    expect(overview.memory.synced).toBe(false);
    expect(overview.trainingDataset.created).toBe(false);
    expect(overview.educationCourseCount).toBe(RELIGION_CATALOG.length);
    expect(overview.chatSurface).toBe("available");

    await ReligionsIntegrationsService.syncMemory("org-ov-1");
    await ReligionsIntegrationsService.createTrainingDataset("org-ov-1");
    const after = await ReligionsIntegrationsService.overview("org-ov-1");
    expect(after.memory.synced).toBe(true);
    expect(after.trainingDataset.created).toBe(true);
  });
});

describe("Session 143 — §19 safety on the chat surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses hate speech with an educational redirect and follow-ups", async () => {
    const res = await ReligionsIntegrationsService.chatAnswer(null, { question: "kill all Muslims" });
    expect(res.mode).toBe("safety_refused");
    expect(res.answer).toContain("cannot generate content");
    expect(res.answer).toContain("Educational discussion");
    expect(res.sections).toEqual([]);
    expect(res.followUp.length).toBeGreaterThan(0);
  });

  it("keeps educational and critical questions available on chat", async () => {
    const ok = await ReligionsIntegrationsService.chatAnswer(null, { question: "What is Christianity?" });
    expect(ok.mode).toBe("teach");
    expect(ok.answer).toContain("Christianity");
    const critical = await ReligionsIntegrationsService.chatAnswer(null, { question: "I think the doctrine of X is wrong because it contradicts reason." });
    expect(critical.mode).toBe("teach");
    expect(critical.answer.length).toBeGreaterThan(0);
  });
});
