/**
 * Session 67 — Enterprise Education & Learning Platform.
 * AI tutor, personalized learning paths, course builder, assessments,
 * certification (reuses S56.10 cert logic), corporate learning, skill tracking.
 *
 * Session 159 — honesty pass:
 * - Reads never call ensureBootstrapped (a GET is not a seeder).
 * - Demo seed is gated and writes zeros / null ratings — no RNG enrollments.
 * - avgMasteryPct is null when no skills exist (0% is a score).
 * - activeLearners is the distinct userId set, never Math.max(1, …).
 * - hoursLearned30d is recorded assessment time, not catalog duration × completions.
 * - certificationsIssued counts passed assessments on certification_prep content.
 *
 * Keys: edu:c / edu:cs / edu:p / edu:ps / edu:t / edu:ts / edu:a / edu:as / edu:sk / edu:sks
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { EducationDashboard, LearningContent, LearningPath, TutorSession, Assessment, Skill } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  c: (oid: string, id: string) => `edu:c:${oid}:${id}`, cs: (oid: string) => `edu:cs:${oid}`,
  p: (oid: string, id: string) => `edu:p:${oid}:${id}`, ps: (oid: string) => `edu:ps:${oid}`,
  t: (oid: string, id: string) => `edu:t:${oid}:${id}`, ts: (oid: string) => `edu:ts:${oid}`,
  a: (oid: string, id: string) => `edu:a:${oid}:${id}`, as: (oid: string) => `edu:as:${oid}`,
  sk: (oid: string, id: string) => `edu:sk:${oid}:${id}`, sks: (oid: string) => `edu:sks:${oid}`,
};
const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const CONTENT_SEED: Array<{ title: string; kind: LearningContent["kind"]; diff: LearningContent["difficulty"]; dur: number; tags: string[]; mods?: number }> = [
  { title: "AI Literacy for Leaders", kind: "course", diff: "beginner", dur: 90, tags: ["ai", "leadership"], mods: 5 },
  { title: "Prompt Engineering 101", kind: "lesson", diff: "beginner", dur: 25, tags: ["prompts", "ai"] },
  { title: "Responsible AI Practices", kind: "course", diff: "intermediate", dur: 120, tags: ["responsible", "governance"], mods: 6 },
  { title: "Workflow Builder Certification", kind: "certification_prep", diff: "advanced", dur: 240, tags: ["workflow", "certification"], mods: 8 },
  { title: "Knowledge Graph Essentials", kind: "lesson", diff: "intermediate", dur: 45, tags: ["kg", "data"] },
  { title: "AI Sales Agent Mastery", kind: "course", diff: "intermediate", dur: 180, tags: ["sales", "agents"], mods: 7 },
  { title: "Intro to Data Privacy", kind: "lesson", diff: "beginner", dur: 30, tags: ["privacy"] },
  { title: "Capstone — Build Your First Agent", kind: "project", diff: "advanced", dur: 360, tags: ["agents", "project"] },
  { title: "Voice Studio Admin Path", kind: "path", diff: "intermediate", dur: 480, tags: ["voice", "studio"] },
  { title: "Compliance Quiz — AI Act", kind: "quiz", diff: "intermediate", dur: 15, tags: ["compliance", "ai-act"] },
];

const SKILLS = [
  { name: "Prompt Engineering", cat: "AI Fundamentals" }, { name: "Agent Design", cat: "AI Fundamentals" }, { name: "Workflow Composition", cat: "AI Fundamentals" },
  { name: "Data Analysis", cat: "Data" }, { name: "Knowledge Graphs", cat: "Data" }, { name: "RAG Patterns", cat: "Data" },
  { name: "Voice Design", cat: "Multimodal" }, { name: "Video Production", cat: "Multimodal" },
  { name: "Governance", cat: "Compliance" }, { name: "Responsible AI", cat: "Compliance" }, { name: "Audit & Review", cat: "Compliance" },
  { name: "Leadership Briefings", cat: "Leadership" }, { name: "ROI Measurement", cat: "Leadership" },
];

async function loadAll<T>(ids: string[], keyFn: (id: string) => string): Promise<T[]> {
  const out: T[] = [];
  for (const id of ids) {
    const r = await redis.hgetall(keyFn(id));
    if (r._doc) out.push(JSON.parse(r._doc) as T);
  }
  return out;
}

export const EducationService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.cs(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("education", logger);
    const now = new Date().toISOString();
    for (const c of CONTENT_SEED) {
      const id = uid("lc-");
      const content: LearningContent & { seed?: boolean } = {
        id, title: c.title, kind: c.kind, author: uid0,
        description: `${c.title} — sample catalog title (Windels demo data). No enrollments or ratings are claimed.`,
        durationMin: c.dur, difficulty: c.diff, tags: c.tags, modulesCount: c.mods,
        status: "published",
        rating: null,
        enrollments: 0,
        completions: 0,
        certificationId: c.kind === "certification_prep" ? "cert-" + randomUUID().slice(0, 6) : undefined,
        createdAt: now, updatedAt: now, seed: true,
      };
      await redis.hset(K.c(oid, id), "_doc", s2(content));
      await redis.sadd(K.cs(oid), id);
    }
    for (const s of SKILLS) {
      const id = uid("sk-");
      const sk: Skill & { seed?: boolean } = {
        id, name: s.name, category: s.cat, level: 0, target: 5, seed: true,
      };
      await redis.hset(K.sk(oid, id), "_doc", s2(sk));
      await redis.sadd(K.sks(oid), id);
    }
    // No fabricated assessments or tutor sessions — those are learner events.
    logger?.info?.("[education] bootstrap complete", { content: CONTENT_SEED.length, orgId: oid });
  },

  async dashboard(oid = "org-windels"): Promise<EducationDashboard> {
    const [cids, tids, aids, sids, pids] = await Promise.all([
      redis.smembers(K.cs(oid)), redis.smembers(K.ts(oid)),
      redis.smembers(K.as(oid)), redis.smembers(K.sks(oid)),
      redis.smembers(K.ps(oid)),
    ]);
    const [content, tutors, assessments, skills, paths] = await Promise.all([
      loadAll<LearningContent>(cids, (id) => K.c(oid, id)),
      loadAll<TutorSession>(tids, (id) => K.t(oid, id)),
      loadAll<Assessment>(aids, (id) => K.a(oid, id)),
      loadAll<Skill>(sids, (id) => K.sk(oid, id)),
      loadAll<LearningPath>(pids, (id) => K.p(oid, id)),
    ]);
    const published = content.filter((c) => c.status === "published");
    const now = Date.now();
    const assessments30 = assessments.filter((a) => now - new Date(a.takenAt).getTime() < 30 * 86_400_000);
    const hours = +(assessments30.reduce((s, a) => s + a.timeSpentSec, 0) / 3600).toFixed(2);
    const mastery = skills.length
      ? +((skills.reduce((s, x) => s + x.level, 0) / (skills.length * 5)) * 100).toFixed(1)
      : null;
    const cats: Record<string, { lvl: number; cnt: number }> = {};
    for (const s of skills) {
      const e = cats[s.category] || { lvl: 0, cnt: 0 };
      e.lvl += s.level; e.cnt++;
      cats[s.category] = e;
    }
    const skillCategories = Object.entries(cats).map(([category, v]) => ({
      category, avgLevel: +(v.lvl / v.cnt).toFixed(2), count: v.cnt,
    }));
    const learners = new Set<string>();
    for (const a of assessments) if (a.userId) learners.add(a.userId);
    for (const t of tutors) if (t.userId) learners.add(t.userId);
    for (const p of paths) if (p.userId) learners.add(p.userId);
    const certContent = new Set(content.filter((c) => c.kind === "certification_prep").map((c) => c.id));
    const certificationsIssued = assessments.filter((a) => a.passed && certContent.has(a.contentId)).length;

    return {
      totalContent: content.length,
      publishedContent: published.length,
      activeLearners: learners.size,
      completions30d: assessments30.length,
      avgMasteryPct: mastery,
      certificationsIssued,
      hoursLearned30d: hours,
      popularContent: [...content].sort((a, b) => b.enrollments - a.enrollments || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      recentAssessments: [...assessments].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 6),
      activeTutorSessions: tutors.filter((t) => !t.endedAt).length,
      skillCategories,
      pathsInProgress: paths.filter((p) => !p.completedAt).length,
      provenance: {
        avgMasteryPct: "Mean of recorded skill levels / 5, or null when no skills exist. An empty inventory is not 0% mastery.",
        activeLearners: "Distinct userIds on assessments, tutor sessions and learning paths. Never inflated.",
        hoursLearned30d: "Sum of assessment timeSpentSec in the last 30 days, in hours. Not catalog duration × completions.",
        certificationsIssued: "Passed assessments whose content kind is certification_prep. No inferred certificates.",
      },
    };
  },

  async startTutor(topic: string, userId: string, oid = "org-windels"): Promise<TutorSession> {
    const id = uid("ts-");
    const s: TutorSession = { id, userId, topic, startedAt: new Date().toISOString(), messages: 0 };
    await redis.hset(K.t(oid, id), "_doc", s2(s));
    await redis.sadd(K.ts(oid), id);
    return s;
  },

  async createPath(input: { title: string; goal: string; contentIds: string[]; userId: string; targetDate?: string; organizationId?: string }): Promise<LearningPath> {
    const oid = input.organizationId || "org-windels";
    const id = uid("lp-");
    const p: LearningPath = {
      id, title: input.title, userId: input.userId, goal: input.goal,
      contentIds: input.contentIds, progressPct: 0, startedAt: new Date().toISOString(),
      targetDate: input.targetDate,
    };
    await redis.hset(K.p(oid, id), "_doc", s2(p));
    await redis.sadd(K.ps(oid), id);
    return p;
  },

  async assess(contentId: string, userId: string, scorePct: number, correct: number, questions: number, timeSpentSec: number, oid = "org-windels"): Promise<Assessment> {
    const id = uid("as-");
    const a: Assessment = {
      id, contentId, userId, scorePct, passed: scorePct >= 70,
      questions, correct, timeSpentSec, takenAt: new Date().toISOString(),
    };
    await redis.hset(K.a(oid, id), "_doc", s2(a));
    await redis.sadd(K.as(oid), id);
    if (a.passed) {
      const raw = await redis.hgetall(K.c(oid, contentId));
      if (raw._doc) {
        const c: LearningContent = JSON.parse(raw._doc);
        c.completions = (c.completions ?? 0) + 1;
        c.updatedAt = new Date().toISOString();
        await redis.hset(K.c(oid, contentId), "_doc", s2(c));
      }
    }
    return a;
  },

  async listContent(oid: string): Promise<LearningContent[]> {
    const ids = await redis.smembers(K.cs(oid));
    const out = await loadAll<LearningContent>(ids, (id) => K.c(oid, id));
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listPaths(oid: string): Promise<LearningPath[]> {
    const ids = await redis.smembers(K.ps(oid));
    const out = await loadAll<LearningPath>(ids, (id) => K.p(oid, id));
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  async listAssessments(oid: string): Promise<Assessment[]> {
    const ids = await redis.smembers(K.as(oid));
    const out = await loadAll<Assessment>(ids, (id) => K.a(oid, id));
    return out.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  },

  async listSkills(oid: string): Promise<Skill[]> {
    const ids = await redis.smembers(K.sks(oid));
    const out = await loadAll<Skill>(ids, (id) => K.sk(oid, id));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async listTutorSessions(oid: string): Promise<TutorSession[]> {
    const ids = await redis.smembers(K.ts(oid));
    const out = await loadAll<TutorSession>(ids, (id) => K.t(oid, id));
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  async createContent(oid: string, userId: string, input: {
    title: string; kind: LearningContent["kind"]; description?: string;
    durationMin: number; difficulty: LearningContent["difficulty"]; tags?: string[];
  }): Promise<LearningContent> {
    const id = uid("lc-");
    const now = new Date().toISOString();
    const c: LearningContent = {
      id, title: input.title, kind: input.kind, author: userId,
      description: input.description ?? "",
      durationMin: input.durationMin, difficulty: input.difficulty,
      tags: input.tags ?? [], status: "draft",
      rating: null, enrollments: 0, completions: 0,
      createdAt: now, updatedAt: now,
    };
    await redis.hset(K.c(oid, id), "_doc", s2(c));
    await redis.sadd(K.cs(oid), id);
    return c;
  },

  async createSkill(oid: string, input: {
    name: string; category: string; level?: number; target?: number;
  }): Promise<Skill> {
    const id = uid("sk-");
    const level = Math.max(0, Math.min(5, input.level ?? 0));
    const target = Math.max(0, Math.min(5, input.target ?? 5));
    const sk: Skill = { id, name: input.name, category: input.category, level, target };
    await redis.hset(K.sk(oid, id), "_doc", s2(sk));
    await redis.sadd(K.sks(oid), id);
    return sk;
  },
};
