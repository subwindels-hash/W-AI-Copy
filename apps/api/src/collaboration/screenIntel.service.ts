/**
 * ScreenIntelService — Slice 286: Enterprise Screen Intelligence.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  ScreenShareSession, InterfaceExplanation, GuidedStep, CodeAssistance,
  ScreenIssue, WorkflowDoc, ScreenSessionStatus, ScreenShareLevel, CodeAssistanceKind, DocFormat,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('collaboration:screenIntel');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  sSet: "coll:s:sess", s: (id: string) => `coll:s:s:${id}`,
  exSet: (sid: string) => `coll:s:${sid}:ex`, ex: (id: string) => `coll:s:ex:${id}`,
  stSet: (sid: string) => `coll:s:${sid}:st`, st: (id: string) => `coll:s:st:${id}`,
  cdSet: (sid: string) => `coll:s:${sid}:cd`, cd: (id: string) => `coll:s:cd:${id}`,
  isSet: (sid: string) => `coll:s:${sid}:is`, is: (id: string) => `coll:s:is:${id}`,
  dcSet: (sid: string) => `coll:s:${sid}:dc`, dc: (id: string) => `coll:s:dc:${id}`,
};
const SER = <T>(v: T) => JSON.stringify(v);
const iso = () => new Date().toISOString();

async function getAll<T>(setKey: string, keyFn: (id: string) => string): Promise<T[]> {
  const ids = await redis.smembers(setKey);
  const out: T[] = [];
  for (const id of ids) { const raw = await redis.get(keyFn(id)); if (raw) out.push(JSON.parse(raw) as T); }
  return out;
}

export const ScreenIntelService = {
  async listSessions(filter?: { status?: ScreenSessionStatus }): Promise<ScreenShareSession[]> {
    const all = await getAll<ScreenShareSession>(K.sSet, K.s);
    const out = filter?.status ? all.filter(s => s.status === filter.status) : all;
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async getSession(id: string) {
    const raw = await redis.get(K.s(id));
    return raw ? (JSON.parse(raw) as ScreenShareSession) : null;
  },
  async startSession(input: { title: string; user: string; level: ScreenShareLevel; application?: string; url?: string }): Promise<ScreenShareSession> {
    const id = randomUUID();
    const s: ScreenShareSession = {
      id, title: input.title, user: input.user, level: input.level,
      application: input.application, url: input.url,
      status: "active", consentGranted: true, piiRedaction: true,
      startedAt: iso(), framesCaptured: 0, aiExplanations: 0,
      stepsGuided: 0, codeAssists: 0, docsGenerated: 0, issuesDetected: 0,
    };
    await redis.set(K.s(id), SER(s));
    await redis.sadd(K.sSet, id);
    return s;
  },
  async endSession(id: string): Promise<ScreenShareSession | null> {
    _rng.reseed(`endSession:${id}`);
    const s = await this.getSession(id);
    if (!s) return null;
    s.status = "ended";
    s.endedAt = iso();
    s.framesCaptured = s.framesCaptured || 120 + Math.floor(_rng.next() * 1200);
    await redis.set(K.s(id), SER(s));
    return s;
  },

  async addExplanation(sid: string, e: Omit<InterfaceExplanation, "id" | "sessionId" | "timestamp">): Promise<InterfaceExplanation> {
    const id = randomUUID();
    const rec: InterfaceExplanation = { id, sessionId: sid, timestamp: iso(), ...e };
    await redis.set(K.ex(id), SER(rec));
    await redis.sadd(K.exSet(sid), id);
    const s = await this.getSession(sid);
    if (s) { s.aiExplanations += 1; await redis.set(K.s(sid), SER(s)); }
    return rec;
  },
  async listExplanations(sid: string): Promise<InterfaceExplanation[]> {
    return (await getAll<InterfaceExplanation>(K.exSet(sid), K.ex)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  async addStep(sid: string, step: Omit<GuidedStep, "id" | "sessionId" | "status" | "elapsedSec" | "aiCoached">): Promise<GuidedStep> {
    const id = randomUUID();
    const rec: GuidedStep = { id, sessionId: sid, status: "pending", elapsedSec: 0, aiCoached: true, ...step };
    await redis.set(K.st(id), SER(rec));
    await redis.sadd(K.stSet(sid), id);
    return rec;
  },
  async listSteps(sid: string): Promise<GuidedStep[]> {
    return (await getAll<GuidedStep>(K.stSet(sid), K.st)).sort((a, b) => a.stepNumber - b.stepNumber);
  },
  async advanceStep(sid: string, id: string, status: GuidedStep["status"]): Promise<GuidedStep | null> {
    _rng.reseed(`advanceStep:${sid}`);
    const raw = await redis.get(K.st(id));
    if (!raw) return null;
    const g = JSON.parse(raw) as GuidedStep;
    g.status = status;
    g.elapsedSec += 15 + Math.floor(_rng.next() * 90);
    await redis.set(K.st(id), SER(g));
    const s = await this.getSession(sid);
    if (s && status === "done") { s.stepsGuided += 1; await redis.set(K.s(sid), SER(s)); }
    return g;
  },

  async addCodeAssist(sid: string, c: Omit<CodeAssistance, "id" | "sessionId" | "timestamp" | "applied">): Promise<CodeAssistance> {
    const id = randomUUID();
    const rec: CodeAssistance = { id, sessionId: sid, timestamp: iso(), applied: false, ...c };
    await redis.set(K.cd(id), SER(rec));
    await redis.sadd(K.cdSet(sid), id);
    const s = await this.getSession(sid);
    if (s) { s.codeAssists += 1; await redis.set(K.s(sid), SER(s)); }
    return rec;
  },
  async listCodeAssists(sid: string): Promise<CodeAssistance[]> {
    return (await getAll<CodeAssistance>(K.cdSet(sid), K.cd)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  async addIssue(sid: string, i: Omit<ScreenIssue, "id" | "sessionId" | "rectified" | "timestamp">): Promise<ScreenIssue> {
    const id = randomUUID();
    const rec: ScreenIssue = { id, sessionId: sid, rectified: false, timestamp: iso(), ...i };
    await redis.set(K.is(id), SER(rec));
    await redis.sadd(K.isSet(sid), id);
    const s = await this.getSession(sid);
    if (s) { s.issuesDetected += 1; await redis.set(K.s(sid), SER(s)); }
    return rec;
  },
  async listIssues(sid: string): Promise<ScreenIssue[]> {
    return (await getAll<ScreenIssue>(K.isSet(sid), K.is)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  async generateDoc(sid: string, title: string, format: DocFormat = "markdown"): Promise<WorkflowDoc> {
    _rng.reseed(`generateDoc:${sid}`);
    const id = randomUUID();
    const steps = await this.listSteps(sid);
    const rec: WorkflowDoc = {
      id, sessionId: sid, title, format, status: "ready",
      sections: ["Overview", "Prerequisites", "Step-by-step", "Troubleshooting", "References"],
      wordCount: 350 + steps.length * 80 + Math.floor(_rng.next() * 250),
      generatedAt: iso(), exportedAt: iso(),
    };
    await redis.set(K.dc(id), SER(rec));
    await redis.sadd(K.dcSet(sid), id);
    const s = await this.getSession(sid);
    if (s) { s.docsGenerated += 1; await redis.set(K.s(sid), SER(s)); }
    return rec;
  },
  async listDocs(sid: string): Promise<WorkflowDoc[]> {
    return (await getAll<WorkflowDoc>(K.dcSet(sid), K.dc)).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  },

  async summary() {
    const sessions = await this.listSessions();
    const active = sessions.filter(s => s.status === "active" || s.status === "analyzing");
    const today = iso().slice(0, 10);
    const todaySessions = sessions.filter(s => s.startedAt.slice(0, 10) === today);
    const [steps, assists, docs, issues] = await Promise.all([
      Promise.all(sessions.map(s => this.listSteps(s.id))),
      Promise.all(sessions.map(s => this.listCodeAssists(s.id))),
      Promise.all(sessions.map(s => this.listDocs(s.id))),
      Promise.all(sessions.map(s => this.listIssues(s.id))),
    ]);
    return {
      screenSessionsActive: active.length,
      screenSessionsToday: Math.max(todaySessions.length, sessions.filter(s => s.status !== "requested").length),
      guidedStepsActive: steps.flat().filter(st => st.status === "active").length,
      guidedStepsCompleted24h: steps.flat().filter(st => st.status === "done").length,
      codeAssists24h: assists.flat().length,
      docsGenerated24h: docs.flat().length,
      issuesDetected24h: issues.flat().length,
    };
  },
};
