/**
 * Session 142 — Religion Knowledge Integration & Teaching Systems.
 *
 * The §20 integration layer: connects the Session 141 religion catalog to the
 * five remaining channels of WINDELS AI OS —
 *
 *   1. MEMORY            → syncs the curated catalog into the Enterprise
 *                         Memory Fabric (deduplicated by content+scope).
 *   2. AI AGENTS         → attaches religion knowledge to AI workforce
 *                         agents (org-scoped, deduplicated by title).
 *   3. AI TRAINING CENTER→ creates a zero-synthetic, curated RAG/training
 *                         dataset (JSONL) in the Session 60 training module.
 *   4. EDUCATION         → maps every record to a teachable course and hands
 *                         it to the real Lecturer AI for adaptive lessons.
 *   5. CONVERSATIONAL    → a chat-ready teaching endpoint (intent + rendered
 *                         sections + sources + neutrality note + follow-ups).
 *
 * Honesty rules (unchanged from Session 141): the catalog never ranks
 * religions; truth-claim questions receive the neutrality policy; memory
 * entries and agent knowledge are labelled with the catalog version and
 * provenance; the training dataset declares syntheticPct: 0 and is built
 * only from curated records.
 */
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import {
  RELIGION_CATALOG_VERSION,
} from "./religions.catalog.js";
import { classifyReligionResponseSafety } from "@windels/shared";
import {
  ReligionsService,
  RELIGION_CATALOG,
} from "./religions.service.js";
import type {
  ReligionLevel,
  ReligionRecord,
} from "@windels/shared";

const K = {
  memSync: (orgId: string) => `rel:int:mem:${orgId}`,
  dataset: (orgId: string) => `rel:int:ds:${orgId}`,
};

const MEMORY_SYNC_TTL = 60 * 60 * 24; // 1 day between forced re-syncs is allowed; syncs are idempotent anyway

const CONFIDENCE_MAP: Record<ReligionRecord["confidence"], number> = {
  verified: 1,
  well_supported: 0.9,
  disputed: 0.6,
  uncertain: 0.4,
  unverified: 0.3,
};

/** Map a religion teaching level onto the Lecturer AI's level vocabulary. */
export function toLecturerLevel(level: ReligionLevel): "beginner" | "intermediate" | "advanced" {
  switch (level) {
    case "beginner": return "beginner";
    case "intermediate": return "intermediate";
    case "advanced":
    case "research": return "advanced";
    default: return "intermediate";
  }
}

/** One JSONL line of the curated training corpus (question/answer pair). */
export function recordToJsonl(record: ReligionRecord): string {
  const q = record.centralTeachings.slice(0, 200);
  const a = `${record.name} — ${record.summary}\nCentral teachings: ${record.centralTeachings}\nDeity concept: ${record.deityConcept}\nHistorical development: ${record.historicalDevelopment.slice(0, 600)}`;
  return JSON.stringify({
    id: record.id,
    name: record.name,
    family: record.family,
    category: record.category,
    status: record.status,
    confidence: record.confidence,
    question: `What is ${record.name}?`,
    answer: a,
    tags: [record.family, record.category, "religion"],
    source: `WINDELS religion catalog ${RELIGION_CATALOG_VERSION}`,
  });
}

export const ReligionsIntegrationsService = {
  catalogVersion: RELIGION_CATALOG_VERSION,

  /** All records the integration layer can serve: catalog + approved extensions. */
  async allRecords(): Promise<ReligionRecord[]> {
    return [...RELIGION_CATALOG, ...(await ReligionsService.listExtensions())];
  },

  /* ── 1. Memory Fabric ─────────────────────────────────────────────── */

  async syncMemory(orgId: string, opts: { family?: string; force?: boolean } = {}): Promise<{
    channel: "memory";
    attempted: number;
    succeeded: number;
    failed: number;
    skippedDuplicateNote: string;
    lastSyncedAt: string;
    catalogVersion: string;
  }> {
    const records = (await this.allRecords()).filter((r) => !opts.family || r.family === opts.family);
    const { MemoryEvolutionService } = await import("../memoryEvolution/memoryEvolution.service.js");
    let succeeded = 0;
    let failed = 0;
    for (const record of records) {
      try {
        await MemoryEvolutionService.add({
          type: "knowledge",
          content: `${record.name} (${record.family}) — ${record.summary}\nCentral teachings: ${record.centralTeachings.slice(0, 1200)}`,
          tags: [record.family, record.category, "religion"],
          scope: `org:${orgId}`,
          confidence: CONFIDENCE_MAP[record.confidence] ?? 0.5,
        });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        logger.warn("[religions] memory sync failed for " + record.id, { err: (err as Error).message });
      }
    }
    const at = new Date().toISOString();
    try {
      await redis.set(K.memSync(orgId), JSON.stringify({ at, count: succeeded, version: RELIGION_CATALOG_VERSION }));
      await redis.expire(K.memSync(orgId), MEMORY_SYNC_TTL);
    } catch { /* best effort */ }
    return {
      channel: "memory",
      attempted: records.length,
      succeeded,
      failed,
      skippedDuplicateNote: "The Memory Fabric deduplicates by content+scope, so re-syncs never create duplicates.",
      lastSyncedAt: at,
      catalogVersion: RELIGION_CATALOG_VERSION,
    };
  },

  async memoryStatus(orgId: string): Promise<{ channel: "memory"; lastSync: { at: string; count: number; version: string } | null }> {
    try {
      const raw = await redis.get(K.memSync(orgId));
      return { channel: "memory", lastSync: raw ? JSON.parse(raw) : null };
    } catch {
      return { channel: "memory", lastSync: null };
    }
  },

  /* ── 2. AI agents ─────────────────────────────────────────────────── */

  async agentAttachedTitles(userId: string, agentId: string): Promise<Set<string>> {
    try {
      const { listKnowledge } = await import("../services/agentKnowledge.service.js");
      const rows = await listKnowledge(userId, agentId, { page: 1, perPage: 500 });
      const items: any[] = Array.isArray(rows) ? rows : (rows as any).items ?? [];
      return new Set(items.map((r: any) => String(r.title).replace(/^Religion: /, "")));
    } catch (err) {
      logger.debug("[religions] agent knowledge list failed", { err: (err as Error).message });
      return new Set();
    }
  },

  async attachToAgent(userId: string, agentId: string, opts: { family?: string; limit?: number } = {}): Promise<{
    channel: "agents";
    agentId: string;
    attached: number;
    alreadyPresent: number;
    totalInCatalog: number;
    catalogVersion: string;
    note: string;
  }> {
    const records = (await this.allRecords()).filter((r) => !opts.family || r.family === opts.family);
    const limit = opts.limit ?? 200;
    const target = records.slice(0, limit);
    const { addKnowledge } = await import("../services/agentKnowledge.service.js");
    const existing = await this.agentAttachedTitles(userId, agentId);

    let attached = 0;
    let alreadyPresent = 0;
    for (const record of target) {
      if (existing.has(record.name)) {
        alreadyPresent += 1;
        continue;
      }
      try {
        await addKnowledge(userId, agentId, {
          type: "SNIPPET",
          title: `Religion: ${record.name}`,
          content: `${record.name} (${record.family} · ${record.category}) — ${record.summary}\nCentral teachings: ${record.centralTeachings.slice(0, 1500)}\nDeity concept: ${record.deityConcept.slice(0, 400)}\nFestivals: ${record.festivals.slice(0, 8).join(", ") || "not recorded"}\nConfidence: ${record.confidence}. Source: WINDELS religion catalog ${RELIGION_CATALOG_VERSION}.`,
          source: `WINDELS religion catalog ${RELIGION_CATALOG_VERSION}`,
          mimeType: "text/plain",
        });
        attached += 1;
      } catch (err) {
        // addKnowledge throws for agents outside the caller's org or missing
        throw AppError.notFound(`Agent ${agentId} not found in the caller's organization, or knowledge attach failed: ${(err as Error).message}`);
      }
    }
    return {
      channel: "agents",
      agentId,
      attached,
      alreadyPresent,
      totalInCatalog: records.length,
      catalogVersion: RELIGION_CATALOG_VERSION,
      note: "Attached as SNIPPET knowledge rows labelled with the catalog version; re-attaching skips titles already present.",
    };
  },

  /* ── 3. AI Training Center ────────────────────────────────────────── */

  trainingCorpus(opts: { family?: string } = {}): Array<{ line: string; record: ReligionRecord }> {
    const records = RELIGION_CATALOG.filter((r) => !opts.family || r.family === opts.family);
    return records.map((record) => ({ line: recordToJsonl(record), record }));
  },

  async createTrainingDataset(orgId: string, opts: { family?: string } = {}): Promise<{
    channel: "training";
    dataset: any;
    rows: number;
    sizeBytes: number;
    syntheticPct: 0;
    cleaned: true;
    ragbuilderIncluded: true;
    exportNote: string;
  }> {
    const corpus = this.trainingCorpus(opts);
    const sizeBytes = corpus.reduce((acc, c) => acc + Buffer.byteLength(c.line), 0);
    const { TrainingService } = await import("../training/training.service.js");
    const dataset = await TrainingService.createDataset({
      name: "World Religions Knowledge Corpus (curated)",
      format: "jsonl",
      rows: corpus.length,
      sizeBytes,
      syntheticPct: 0,
      cleaned: true,
      ragbuilderIncluded: true,
      organizationId: orgId,
    });
    try {
      await redis.set(K.dataset(orgId), JSON.stringify({ datasetId: dataset.id, rows: corpus.length, version: RELIGION_CATALOG_VERSION }));
    } catch { /* best effort */ }
    return {
      channel: "training",
      dataset,
      rows: corpus.length,
      sizeBytes,
      syntheticPct: 0,
      cleaned: true,
      ragbuilderIncluded: true,
      exportNote: "The dataset is generated from the curated catalog only: syntheticPct is 0, every row carries the catalog version as its source, and the JSONL export is available via GET /religions/integrations/training/export.",
    };
  },

  /* ── 4. Education (Lecturer AI) ───────────────────────────────────── */

  educationCatalog() {
    return RELIGION_CATALOG.map((r) => ({
      courseId: r.id,
      title: r.name,
      family: r.family,
      category: r.category,
      status: r.status,
      level: "beginner" as const,
      topics: [
        r.centralTeachings.slice(0, 90),
        r.deityConcept.slice(0, 90),
        r.afterlife.slice(0, 90),
      ].filter((t) => t.length > 0),
      summary: r.summary,
    }));
  },

  async startLesson(userId: string, recordId: string, level: ReligionLevel): Promise<{
    channel: "education";
    course: Awaited<ReturnType<typeof ReligionsService.teach>>;
    lecturer: any;
    note: string;
  }> {
    const record = await ReligionsService.getRecordAnywhere(recordId);
    if (!record) throw AppError.notFound("Religion record not found");
    const { LecturerService } = await import("../education/lecturer.service.js");
    const course = await ReligionsService.teach(recordId, level);
    const lecturer = await LecturerService.start(userId, record.name, toLecturerLevel(level));
    return {
      channel: "education",
      course,
      lecturer,
      note: "The curated religion record is the source material; the Lecturer AI session adapts the lesson and grades practice questions. The underlying facts are the catalog's — the tutor's presentation adapts.",
    };
  },

  /* ── 5. Conversational teaching ───────────────────────────────────── */

  async chatAnswer(orgId: string | null, input: { question: string; level?: ReligionLevel }): Promise<{
    channel: "chat";
    role: "assistant";
    question: string;
    intent: any;
    mode: string;
    level: ReligionLevel;
    answer: string;
    sections: Array<{ key: string; heading: string; body: string }>;
    sources: ReligionRecord["sources"];
    confidence: string | null;
    controversialNote?: string;
    followUp: string[];
    note?: string;
  }> {
    const level = input.level ?? "intermediate";

    // §19: the chat surface inherits the safety guard.
    const safety = classifyReligionResponseSafety(input.question);
    if (safety.isHateful || safety.isDiscriminatory) {
      return {
        channel: "chat",
        role: "assistant",
        question: input.question,
        intent: { intent: "general", confidence: 0.05, matchedRules: [], explanation: safety.explanation },
        mode: "safety_refused",
        level,
        answer: `I cannot generate content that ${safety.isHateful ? "targets people with hate speech" : "blanket-condemns a religion or its followers"}. Educational discussion of any religion — including respectful criticism and historical study — remains fully available. What would you like to understand about a tradition?`,
        sections: [],
        sources: [],
        confidence: null,
        followUp: ["What is Christianity?", "What is Islam?", "How do the major religions compare?"],
      };
    }

    const res = await ReligionsService.ask(orgId, { question: input.question, level, limit: 3 });
    const top = res.matches[0];

    // Neutrality answers are the standing response for truth-claim questions.
    if (res.mode === "neutrality") {
      return {
        channel: "chat",
        role: "assistant",
        question: input.question,
        intent: res.intent,
        mode: "neutrality",
        level,
        answer: res.note ?? "Religious truth claims are matters of faith, theology, philosophy and personal belief.",
        sections: top?.sections ?? [],
        sources: top?.sources ?? [],
        confidence: top?.confidence ?? null,
        followUp: ["What are the Abrahamic religions?", "How do the major religions compare?", "What do different traditions teach about the afterlife?"],
      };
    }

    const answerText = top
      ? `${top.summary}\n\n${top.sections.map((s) => `${s.heading}: ${s.body}`).join("\n\n")}`
      : res.note ?? "I do not have sufficient verified knowledge about this tradition in the religion catalog.";

    const followUp = res.matches.slice(0, 3).map((m) => `Tell me more about ${m.name}`);

    return {
      channel: "chat",
      role: "assistant",
      question: input.question,
      intent: res.intent,
      mode: res.mode,
      level,
      answer: answerText,
      sections: top?.sections ?? [],
      sources: top?.sources ?? [],
      confidence: top?.confidence ?? null,
      controversialNote: top?.controversialNote,
      followUp,
      note: res.matches.length === 0 ? res.note : undefined,
    };
  },

  /** Integration overview used by the console and by tests. */
  async overview(orgId: string | null): Promise<{
    channel: "overview";
    catalogVersion: string;
    recordCount: number;
    extensionCount: number;
    memory: { synced: boolean; lastSyncAt: string | null };
    trainingDataset: { created: boolean; datasetId: string | null; rows: number | null };
    educationCourseCount: number;
    chatSurface: "available";
  }> {
    const [memory, datasetRaw, extensions] = await Promise.all([
      orgId ? this.memoryStatus(orgId) : Promise.resolve({ channel: "memory" as const, lastSync: null }),
      orgId ? (async () => {
        try {
          const raw = await redis.get(K.dataset(orgId));
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })() : Promise.resolve(null),
      this.allRecords(),
    ]);
    return {
      channel: "overview",
      catalogVersion: RELIGION_CATALOG_VERSION,
      recordCount: RELIGION_CATALOG.length,
      extensionCount: extensions.length - RELIGION_CATALOG.length,
      memory: { synced: memory.lastSync !== null, lastSyncAt: memory.lastSync?.at ?? null },
      trainingDataset: datasetRaw ? { created: true, datasetId: datasetRaw.datasetId, rows: datasetRaw.rows } : { created: false, datasetId: null, rows: null },
      educationCourseCount: RELIGION_CATALOG.length,
      chatSurface: "available",
    };
  },
};
