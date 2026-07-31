/**
 * MeetingsService — Slice 285: Enterprise Live Meeting Intelligence.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  MeetingConnector, LiveMeeting, TranscriptSegment, TranslationChannel,
  SpeakerProfile, AgendaItem, MeetingActionItem, MeetingDecision, MeetingRisk,
  MeetingSummary, FollowUpTask, MeetingPlatform, MeetingStatus,
  TranslationLanguage, WriteThroughSystem,
} from "@windels/shared";

const K = {
  connSet: "coll:m:conns", conn: (id: string) => `coll:m:conn:${id}`,
  meetSet: "coll:m:meets", meet: (id: string) => `coll:m:m:${id}`,
  segSet: (mid: string) => `coll:m:${mid}:segs`, seg: (id: string) => `coll:m:seg:${id}`,
  trSet: (mid: string) => `coll:m:${mid}:tr`, tr: (id: string) => `coll:m:tr:${id}`,
  spkSet: (mid: string) => `coll:m:${mid}:spk`, spk: (id: string) => `coll:m:spk:${id}`,
  agSet: (mid: string) => `coll:m:${mid}:ag`, ag: (id: string) => `coll:m:ag:${id}`,
  aiSet: (mid: string) => `coll:m:${mid}:ai`, ai: (id: string) => `coll:m:ai:${id}`,
  decSet: (mid: string) => `coll:m:${mid}:dec`, dec: (id: string) => `coll:m:dec:${id}`,
  rkSet: (mid: string) => `coll:m:${mid}:rk`, rk: (id: string) => `coll:m:rk:${id}`,
  sumKey: (mid: string) => `coll:m:${mid}:sum`,
  fuSet: (mid: string) => `coll:m:${mid}:fu`, fu: (id: string) => `coll:m:fu:${id}`,
};
const SER = <T>(v: T) => JSON.stringify(v);
const iso = () => new Date().toISOString();

async function getAll<T>(setKey: string, keyFn: (id: string) => string): Promise<T[]> {
  const ids = await redis.smembers(setKey);
  const out: T[] = [];
  for (const id of ids) {
    const raw = await redis.get(keyFn(id));
    if (raw) out.push(JSON.parse(raw) as T);
  }
  return out;
}

export const MeetingsService = {
  // connectors
  async listConnectors(): Promise<MeetingConnector[]> {
    const cs = await getAll<MeetingConnector>(K.connSet, K.conn);
    return cs.sort((a, b) => b.meetingsToday - a.meetingsToday);
  },
  async getConnector(id: string) {
    const raw = await redis.get(K.conn(id));
    return raw ? (JSON.parse(raw) as MeetingConnector) : null;
  },
  async registerConnector(input: { name: string; platform: MeetingPlatform; owner: string; tenantDomain?: string; capabilities?: string[] }): Promise<MeetingConnector> {
    const id = randomUUID();
    const c: MeetingConnector = {
      id, name: input.name, platform: input.platform, status: "connected",
      tenantDomain: input.tenantDomain,
      capabilities: input.capabilities ?? ["transcription", "translation", "speakerId", "calendarSync"],
      meetingsToday: 0, minutesTranscribed24h: 0, languagesActive: ["en", "es", "fr"],
      lastSyncAt: iso(), owner: input.owner,
    };
    await redis.set(K.conn(id), SER(c));
    await redis.sadd(K.connSet, id);
    return c;
  },

  // meetings
  async listMeetings(filter?: { status?: MeetingStatus }): Promise<LiveMeeting[]> {
    const ms = await getAll<LiveMeeting>(K.meetSet, K.meet);
    const out = filter?.status ? ms.filter(m => m.status === filter.status) : ms;
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async getMeeting(id: string) {
    const raw = await redis.get(K.meet(id));
    return raw ? (JSON.parse(raw) as LiveMeeting) : null;
  },
  async scheduleMeeting(input: { title: string; platform: MeetingPlatform; connectorId: string; organizer: string; attendees?: number; languages?: TranslationLanguage[]; tags?: string[]; externalMeetingId?: string }): Promise<LiveMeeting> {
    const id = randomUUID();
    const m: LiveMeeting = {
      id, title: input.title, platform: input.platform, connectorId: input.connectorId,
      externalMeetingId: input.externalMeetingId,
      joinUrl: `https://meet.windels.ai/${id}`,
      aiParticipantJoined: false, status: "scheduled",
      startedAt: iso(), durationMin: 0, organizer: input.organizer,
      attendees: input.attendees ?? 1,
      languages: input.languages ?? ["en"],
      agendaCoveragePct: 0, actionItemsOpen: 0, decisionsCount: 0, riskCount: 0,
      summaryReady: false, writeThroughPending: 0,
      tags: input.tags ?? [],
    };
    await redis.set(K.meet(id), SER(m));
    await redis.sadd(K.meetSet, id);
    await this.addAgendaItem(id, { title: "Kick-off / intros", order: 1, durationMin: 5 });
    await this.addAgendaItem(id, { title: input.title, order: 2, durationMin: 20 });
    await this.addAgendaItem(id, { title: "Action items & next steps", order: 3, durationMin: 5 });
    return m;
  },
  async joinAiParticipant(id: string): Promise<LiveMeeting | null> {
    const m = await this.getMeeting(id);
    if (!m) return null;
    m.aiParticipantJoined = true;
    if (m.status === "scheduled") m.status = "live";
    await redis.set(K.meet(id), SER(m));
    return m;
  },
  async endMeeting(id: string): Promise<LiveMeeting | null> {
    const m = await this.getMeeting(id);
    if (!m) return null;
    m.status = "summarizing";
    m.endedAt = iso();
    m.durationMin = Math.max(15, m.durationMin || 30);
    await redis.set(K.meet(id), SER(m));
    if (!(await this.getSummary(id))) await this.generateSummary(id);
    await this.enqueueWriteThrough(id);
    m.status = "completed";
    m.summaryReady = true;
    await redis.set(K.meet(id), SER(m));
    return m;
  },

  // transcripts
  async listSegments(mid: string): Promise<TranscriptSegment[]> {
    const segs = await getAll<TranscriptSegment>(K.segSet(mid), K.seg);
    return segs.sort((a, b) => a.startSec - b.startSec);
  },
  async addSegment(mid: string, s: Omit<TranscriptSegment, "id" | "meetingId">): Promise<TranscriptSegment> {
    const id = randomUUID();
    const seg: TranscriptSegment = { id, meetingId: mid, ...s };
    await redis.set(K.seg(id), SER(seg));
    await redis.sadd(K.segSet(mid), id);
    return seg;
  },

  // translations
  async listTranslationChannels(mid: string): Promise<TranslationChannel[]> {
    return getAll<TranslationChannel>(K.trSet(mid), K.tr);
  },
  async enableTranslationChannel(mid: string, language: TranslationLanguage): Promise<TranslationChannel> {
    const id = randomUUID();
    const ch: TranslationChannel = {
      id, meetingId: mid, language, activeListeners: Math.floor(Math.random() * 8),
      segmentsTranslated: 0, latencyMs: 180 + Math.floor(Math.random() * 140), enabled: true,
    };
    await redis.set(K.tr(id), SER(ch));
    await redis.sadd(K.trSet(mid), id);
    return ch;
  },

  // speakers
  async listSpeakers(mid: string): Promise<SpeakerProfile[]> {
    return getAll<SpeakerProfile>(K.spkSet(mid), K.spk);
  },
  async addSpeaker(mid: string, s: Omit<SpeakerProfile, "id" | "meetingId">): Promise<SpeakerProfile> {
    const id = randomUUID();
    const sp: SpeakerProfile = { id, meetingId: mid, ...s };
    await redis.set(K.spk(id), SER(sp));
    await redis.sadd(K.spkSet(mid), id);
    return sp;
  },

  // agenda
  async listAgenda(mid: string): Promise<AgendaItem[]> {
    const ag = await getAll<AgendaItem>(K.agSet(mid), K.ag);
    return ag.sort((a, b) => a.order - b.order);
  },
  async addAgendaItem(mid: string, a: Omit<AgendaItem, "id" | "meetingId" | "status" | "notes"> & { status?: AgendaItem["status"]; notes?: string }): Promise<AgendaItem> {
    const id = randomUUID();
    const item: AgendaItem = { id, meetingId: mid, status: a.status ?? "pending", notes: a.notes ?? "", ...a };
    await redis.set(K.ag(id), SER(item));
    await redis.sadd(K.agSet(mid), id);
    return item;
  },

  // action items
  async listActionItems(mid: string): Promise<MeetingActionItem[]> {
    return getAll<MeetingActionItem>(K.aiSet(mid), K.ai);
  },
  async addActionItem(mid: string, a: Omit<MeetingActionItem, "id" | "meetingId" | "status">): Promise<MeetingActionItem> {
    const id = randomUUID();
    const ai: MeetingActionItem = { id, meetingId: mid, status: "open", ...a };
    await redis.set(K.ai(id), SER(ai));
    await redis.sadd(K.aiSet(mid), id);
    const m = await this.getMeeting(mid);
    if (m) { m.actionItemsOpen = (await this.listActionItems(mid)).filter(x => x.status !== "done").length; await redis.set(K.meet(mid), SER(m)); }
    return ai;
  },
  async updateActionItemStatus(mid: string, id: string, status: MeetingActionItem["status"]): Promise<MeetingActionItem | null> {
    const raw = await redis.get(K.ai(id));
    if (!raw) return null;
    const a = JSON.parse(raw) as MeetingActionItem;
    a.status = status;
    await redis.set(K.ai(id), SER(a));
    const m = await this.getMeeting(mid);
    if (m) { m.actionItemsOpen = (await this.listActionItems(mid)).filter(x => x.status !== "done").length; await redis.set(K.meet(mid), SER(m)); }
    return a;
  },

  // decisions
  async listDecisions(mid: string): Promise<MeetingDecision[]> {
    return getAll<MeetingDecision>(K.decSet(mid), K.dec);
  },
  async addDecision(mid: string, d: Omit<MeetingDecision, "id" | "meetingId">): Promise<MeetingDecision> {
    const id = randomUUID();
    const dec: MeetingDecision = { id, meetingId: mid, ...d };
    await redis.set(K.dec(id), SER(dec));
    await redis.sadd(K.decSet(mid), id);
    const m = await this.getMeeting(mid);
    if (m) { m.decisionsCount = (await this.listDecisions(mid)).length; await redis.set(K.meet(mid), SER(m)); }
    return dec;
  },

  // risks
  async listRisks(mid: string): Promise<MeetingRisk[]> {
    return getAll<MeetingRisk>(K.rkSet(mid), K.rk);
  },
  async addRisk(mid: string, r: Omit<MeetingRisk, "id" | "meetingId" | "acknowledged">): Promise<MeetingRisk> {
    const id = randomUUID();
    const risk: MeetingRisk = { id, meetingId: mid, acknowledged: false, ...r };
    await redis.set(K.rk(id), SER(risk));
    await redis.sadd(K.rkSet(mid), id);
    const m = await this.getMeeting(mid);
    if (m) { m.riskCount = (await this.listRisks(mid)).length; await redis.set(K.meet(mid), SER(m)); }
    return risk;
  },
  async ackRisk(mid: string, id: string): Promise<MeetingRisk | null> {
    const raw = await redis.get(K.rk(id));
    if (!raw) return null;
    const r = JSON.parse(raw) as MeetingRisk;
    r.acknowledged = true;
    await redis.set(K.rk(id), SER(r));
    return r;
  },

  // summary + follow-ups
  async getSummary(mid: string): Promise<MeetingSummary | null> {
    const raw = await redis.get(K.sumKey(mid));
    return raw ? (JSON.parse(raw) as MeetingSummary) : null;
  },
  async generateSummary(mid: string): Promise<MeetingSummary | null> {
    const m = await this.getMeeting(mid);
    if (!m) return null;
    const segs = await this.listSegments(mid);
    const tldr = `Discussion covered ${m.title}; AI synthesized ${segs.length} transcript segments into key takeaways, decisions, and action items.`;
    const sum: MeetingSummary = {
      id: randomUUID(), meetingId: mid, tldr,
      keyPoints: [
        `Reviewed the state of ${m.title} including blockers and owners.`,
        "Identified cross-functional dependencies and target dates.",
        "Captured decisions and assigned action items with due dates.",
      ],
      topicsDiscussed: [m.title, "Timeline", "Risks", "Next steps"],
      sentimentOverall: "positive",
      generatedAt: iso(),
      wordCount: 180 + Math.floor(Math.random() * 260) + segs.reduce((a, s) => a + s.text.split(/\s+/).length, 0),
    };
    await redis.set(K.sumKey(mid), SER(sum));
    m.summaryReady = true;
    await redis.set(K.meet(mid), SER(m));
    return sum;
  },
  async listFollowUps(mid: string): Promise<FollowUpTask[]> {
    return getAll<FollowUpTask>(K.fuSet(mid), K.fu);
  },
  async enqueueWriteThrough(mid: string): Promise<FollowUpTask[]> {
    const targets: Array<{ sys: WriteThroughSystem; action: string; count: number }> = [
      { sys: "crm", action: "Sync attendees and next-step to CRM opportunity/contact records.", count: 2 },
      { sys: "project", action: "Create tickets for open action items in the project system.", count: 2 },
      { sys: "knowledge-graph", action: "Extract entities, decisions, and relations to the knowledge graph.", count: 1 },
      { sys: "enterprise-memory", action: "Persist meeting summary and key takeaways to enterprise memory.", count: 1 },
      { sys: "calendar", action: "Send follow-up calendar invite with attached summary.", count: 1 },
    ];
    const out: FollowUpTask[] = [];
    for (const t of targets) {
      for (let i = 0; i < t.count; i++) {
        const id = randomUUID();
        const fu: FollowUpTask = { id, meetingId: mid, system: t.sys, action: t.action, status: "queued" };
        await redis.set(K.fu(id), SER(fu));
        await redis.sadd(K.fuSet(mid), id);
        out.push(fu);
      }
    }
    // simulate immediate sync for ~70%
    for (const f of out) {
      if (Math.random() < 0.7) {
        f.status = "synced";
        f.syncedAt = iso();
        f.targetRecordId = `rec_${Math.random().toString(36).slice(2, 9)}`;
        await redis.set(K.fu(f.id), SER(f));
      }
    }
    const m = await this.getMeeting(mid);
    if (m) {
      const all = await this.listFollowUps(mid);
      m.writeThroughPending = all.filter(f => f.status === "queued" || f.status === "pending").length;
      await redis.set(K.meet(mid), SER(m));
    }
    return out;
  },

  async summary() {
    const conns = await this.listConnectors();
    const meets = await this.listMeetings();
    const today = iso().slice(0, 10);
    const live = meets.filter(m => (["live", "transcribing", "translating", "summarizing"] as MeetingStatus[]).includes(m.status));
    const todayMeets = meets.filter(m => m.startedAt.slice(0, 10) === today);
    const ais = (await Promise.all(meets.map(m => this.listActionItems(m.id)))).flat();
    const risks = (await Promise.all(meets.map(m => this.listRisks(m.id)))).flat();
    const decs = (await Promise.all(meets.map(m => this.listDecisions(m.id)))).flat();
    const fus = (await Promise.all(meets.map(m => this.listFollowUps(m.id)))).flat();
    const summs = meets.filter(m => m.summaryReady).length;
    const langs = new Set<TranslationLanguage>();
    conns.forEach(c => c.languagesActive.forEach(l => langs.add(l)));
    meets.forEach(m => m.languages.forEach(l => langs.add(l)));
    return {
      connectors: conns.length,
      connectorsHealthy: conns.filter(c => c.status === "connected").length,
      meetingsLive: live.length,
      meetingsToday: Math.max(todayMeets.length, meets.filter(m => m.status !== "scheduled").length),
      minutesTranscribed24h: conns.reduce((a, c) => a + c.minutesTranscribed24h, 0),
      languagesActive: langs.size,
      aiParticipantsActive: meets.filter(m => m.aiParticipantJoined && (m.status === "live" || m.status === "transcribing")).length,
      actionItemsOpen: ais.filter(a => a.status !== "done").length,
      decisionsCaptured: decs.length,
      risksFlagged: risks.length,
      summariesGenerated24h: summs,
      writeThroughPending: fus.filter(f => f.status === "queued" || f.status === "pending").length,
      writeThroughSynced24h: fus.filter(f => f.status === "synced").length,
    };
  },
};
