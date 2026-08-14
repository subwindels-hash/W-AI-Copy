/**
 * Enterprise Voice Studio singleton (Session 40).
 * Session 162 — completion.
 *
 * Consent gate enforced BEFORE any cloning. Voices default to private.
 *
 * **Tenant isolation (S162).** Before this session every store in this module
 * was global: `vs:custom`, `vs:cv:<id>`, `vs:presets`, `vs:jobs`, `vs:lats`
 * and `vs:consent-viol` carried no organization segment. `listPresets()` and
 * `listJobs()` took no scope at all, so every tenant could read every other
 * tenant's TTS history and presets, and `listCustom(ownerId?)` filtered only
 * when the caller happened to supply an id. A cloned voice is biometric data
 * gated by a consent record, so that was a compliance breach — and the
 * `consentViolations` counter meant to surface misuse was itself cross-tenant.
 *
 * Every mutable key now carries the org in the segment after a two-segment
 * prefix, and every read requires one.
 *
 * Keys: vs:cv:<org>:<id>     vs:custom:<org>
 *       vs:preset:<org>:<id> vs:presets:<org>
 *       vs:job:<org>:<id>    vs:jobs:<org>
 *       vs:lats:<org>        vs:cviol:<org>
 * The built-in catalogue is static configuration and is served from memory.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  BuiltInVoice, CustomVoice, VoiceSettings, VoicePreset, VsEmotion as Emotion,
  TtsJob, VoiceStudioDashboard, VoiceStudioProvenance,
  VsCloneMethod as CloneMethod,
  VsVoiceGender as VoiceGender, VsVoiceAge as VoiceAge,
} from "@windels/shared";
import { VS_EMOTIONS } from "@windels/shared";

const DAY_MS = 86_400_000;

const K = {
  // Org-scoped. Two-segment prefix, then the organization id.
  cv: (oid: string, id: string) => `vs:cv:${oid}:${id}`,
  custom: (oid: string) => `vs:custom:${oid}`,
  preset: (oid: string, id: string) => `vs:preset:${oid}:${id}`,
  presets: (oid: string) => `vs:presets:${oid}`,
  job: (oid: string, id: string) => `vs:job:${oid}:${id}`,
  jobs: (oid: string) => `vs:jobs:${oid}`,
  lats: (oid: string) => `vs:lats:${oid}`,
  consentViol: (oid: string) => `vs:cviol:${oid}`,
  migrated: "vs:migrated",
};

/** Pre-S162 global keys, read once during migration and then left alone. */
const LEGACY = {
  custom: "vs:custom",
  cv: (id: string) => `vs:cv:${id}`,
  presets: "vs:presets",
  jobs: "vs:jobs",
};
const BUILTIN: Omit<BuiltInVoice,"id">[] = [];
function bv(id: string, name: string, gender: VoiceGender, age: VoiceAge, lang: string, region: string | undefined, cat: string = "general", tags: string[] = [], accent?: string): Omit<BuiltInVoice,"id"> {
  return { name, gender, age, language: lang, region, accent, category: cat, tags, sampleRate: 48000, premium: cat === "narrator" };
}
type MaleDef = [string,string,VoiceAge,string,string|undefined,string];
const MALE: MaleDef[] = [
  ["win-male-ya","Young Adult Male","young-adult","en","us","american"],
  ["win-male-ad","Adult Male","adult","en","us","american"],
  ["win-male-sr","Senior Male","senior","en","gb","british"],
  ["win-male-exec","Executive Male","adult","en","us","executive"],
  ["win-male-deep","Deep Male Voice","adult","en","us","deep"],
  ["win-male-warm","Warm Male","adult","en","us","warm"],
  ["win-male-calm","Calm Male","adult","en","us","calm"],
  ["win-male-energy","Energetic Male","young-adult","en","us","energetic"],
  ["win-male-story","Storytelling Male","adult","en","us","story"],
  ["win-male-radio","Radio Presenter","adult","en","us","radio"],
  ["win-male-news","News Presenter","adult","en","us","news"],
  ["win-male-support","Support Rep Male","adult","en","us","support"],
  ["win-male-sales","Sales Rep Male","adult","en","us","sales"],
  ["win-male-narr","Professional Narrator","senior","en","us","narrator"],
];
for (const v of MALE) BUILTIN.push(bv(v[0], v[1], "masculine", v[2], v[3], v[4], v[5], ["male"]));
type FemDef = [string,string,VoiceAge,string,string|undefined];
const FEMALE: FemDef[] = [
  ["win-fem-ya","Young Adult Female","young-adult","en","us"],
  ["win-fem-ad","Adult Female","adult","en","us"],
  ["win-fem-sr","Senior Female","senior","en","gb"],
  ["win-fem-soft","Soft Female","adult","en","us"],
  ["win-fem-exec","Executive Female","adult","en","us"],
  ["win-fem-pro","Professional Female","adult","en","us"],
  ["win-fem-calm","Calm Female","adult","en","us"],
  ["win-fem-friendly","Friendly Female","adult","en","us"],
  ["win-fem-story","Storytelling Female","adult","en","us"],
  ["win-fem-audio","Audiobook Narrator","adult","en","us"],
  ["win-fem-news","News Presenter","adult","en","us"],
  ["win-fem-support","Support Rep Female","adult","en","us"],
  ["win-fem-sales","Sales Rep Female","adult","en","us"],
  ["win-fem-corp","Corporate Narrator","adult","en","us"],
];
for (const v of FEMALE) BUILTIN.push(bv(v[0], v[1], "feminine", v[2], v[3], v[4], "general", ["female"]));
// Children
BUILTIN.push(bv("win-boy","Boy","child-boy","child","en",undefined,"child",["child"]));
BUILTIN.push(bv("win-girl","Girl","child-girl","child","en",undefined,"child",["child"]));
BUILTIN.push(bv("win-teen-b","Teen Boy","teen","teen","en",undefined,"teen",["teen"]));
// Regional/multilingual (6-element tuples: id,name,age,lang,region,tags)
type RegionDef = [string,string,VoiceAge,string,string|undefined,string[]];
const REGION: RegionDef[] = [
  ["win-en-us","American English","adult","en","us",["american"]],
  ["win-en-gb","British English","adult","en","gb",["british"]],
  ["win-en-au","Australian English","adult","en","au",["australian"]],
  ["win-en-ca","Canadian English","adult","en","ca",["canadian"]],
  ["win-en-ng","Nigerian English","adult","en","ng",["nigerian"]],
  ["win-pcm-ng","Nigerian Pidgin","adult","pcm","ng",["pidgin","nigerian"]],
  ["win-ig-ng","Igbo","adult","ig","ng",["igbo"]],
  ["win-yo-ng","Yoruba","adult","yo","ng",["yoruba"]],
  ["win-ha-ng","Hausa","adult","ha","ng",["hausa"]],
  ["win-bin-ng","Edo (Bini)","adult","bin","ng",["edo","bini"]],
  ["win-fr","French","adult","fr","fr",["french"]],
  ["win-es","Spanish","adult","es","es",["spanish"]],
  ["win-ar","Arabic","adult","ar",undefined,["arabic"]],
  ["win-pt","Portuguese","adult","pt","br",["portuguese"]],
  ["win-de","German","adult","de","de",["german"]],
  ["win-hi","Hindi","adult","hi","in",["hindi"]],
  ["win-zh","Chinese","adult","zh","cn",["chinese","mandarin"]],
  ["win-ja","Japanese","adult","ja","jp",["japanese"]],
  ["win-ko","Korean","adult","ko","kr",["korean"]],
];
for (const [id,name,age,lang,region,tags] of REGION) {
  BUILTIN.push(bv(id, name+" Voice", genderFor(id), age, lang, region, "regional", tags));
}
/**
 * Gender for a regional built-in voice.
 *
 * This was a coin flip evaluated at module load, so a catalogue attribute that
 * users browse and filter by was assigned at random — and, because the RNG
 * advances per call, the same voice could differ between processes, giving two
 * servers disagreeing catalogues for the same voice id.
 *
 * Derived deterministically from the voice id instead: still an arbitrary
 * split across the regional set, but stable for a given voice everywhere.
 */
function genderFor(id: string): VoiceGender {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? "feminine" : "masculine";
}

const DEFAULT_SETTINGS: VoiceSettings = { pitch:0, speed:1.0, volume:0.9, energy:0.6, warmth:0.7, emotion:"calm", formality:0.5, accentStrength:0.8, pauseMs:240, breathing:0.2 };

/** Built-in catalogue with stable ids. Static configuration, served from memory. */
const BUILTIN_WITH_IDS: BuiltInVoice[] = BUILTIN.map((b) => ({
  ...b,
  id: "bv-" + b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
}));

const s2 = (o: unknown) => JSON.stringify(o);

/** An organization id is mandatory for every tenant-scoped operation. */
function requireOrg(oid: string | undefined | null): string {
  if (!oid || !oid.trim()) {
    throw Object.assign(new Error("organization context required"), { code: "FORBIDDEN" });
  }
  return oid;
}

async function readSet<T>(setKey: string, itemKey: (id: string) => string): Promise<T[]> {
  const ids = await redis.zrange(setKey, 0, -1);
  const out: T[] = [];
  for (const id of ids) {
    const r = await redis.hgetall(itemKey(id));
    if (r?._doc) { try { out.push(JSON.parse(r._doc) as T); } catch { /* skip */ } }
  }
  return out;
}

export const VoiceStudioService = {
  /**
   * One-time migration of the pre-S162 global stores into the default org.
   *
   * Reads never call this (the S156 rule) — it runs from the module bootstrap.
   * Adopted records are flagged `migratedFrom: "global"`; no timestamp is
   * invented for a record that did not carry one.
   */
  async ensureBootstrapped(logger?: { info?: (...a: unknown[]) => void }, oid = "org-windels") {
    if (await redis.exists(K.migrated)) return;
    await redis.set(K.migrated, new Date().toISOString());

    let voices = 0, presets = 0, jobs = 0;

    // Custom voices
    const legacyVoiceIds = await redis.zrange(LEGACY.custom, 0, -1);
    for (const id of legacyVoiceIds) {
      const r = await redis.hgetall(LEGACY.cv(id));
      if (!r?._doc) continue;
      try {
        const cv = JSON.parse(r._doc) as CustomVoice;
        cv.organizationId = cv.organizationId ?? oid;
        cv.migratedFrom = "global";
        await redis.zadd(K.custom(cv.organizationId), Date.now(), cv.id);
        await redis.hset(K.cv(cv.organizationId, cv.id), "_doc", s2(cv));
        voices++;
      } catch { /* skip malformed */ }
    }

    // Presets (legacy stored the whole doc as the zset member)
    for (const raw of await redis.zrange(LEGACY.presets, 0, -1)) {
      try {
        const p = JSON.parse(raw) as VoicePreset;
        if (!p?.id) continue;
        p.organizationId = p.organizationId ?? oid;
        p.migratedFrom = "global";
        await redis.zadd(K.presets(p.organizationId), Date.now(), p.id);
        await redis.hset(K.preset(p.organizationId, p.id), "_doc", s2(p));
        presets++;
      } catch { /* skip */ }
    }

    // Job ledger
    for (const raw of await redis.zrange(LEGACY.jobs, 0, -1)) {
      try {
        const j = JSON.parse(raw) as TtsJob;
        if (!j?.id) continue;
        j.organizationId = j.organizationId ?? oid;
        j.migratedFrom = "global";
        await redis.zadd(K.jobs(j.organizationId), Date.parse(j.requestedAt) || 0, j.id);
        await redis.hset(K.job(j.organizationId, j.id), "_doc", s2(j));
        jobs++;
      } catch { /* skip */ }
    }

    if (voices || presets || jobs) {
      logger?.info?.("[voice-studio] migrated pre-S162 global records into org namespace", { oid, voices, presets, jobs });
    }
  },

  /** Static catalogue — no Redis round-trip, and no seeding on read. */
  async listBuiltIn(): Promise<BuiltInVoice[]> {
    return BUILTIN_WITH_IDS;
  },

  /** Org-scoped. `ownerId` narrows further to one user's private voices. */
  async listCustom(oid: string, ownerId?: string): Promise<CustomVoice[]> {
    const org = requireOrg(oid);
    const out = await readSet<CustomVoice>(K.custom(org), (id) => K.cv(org, id));
    return ownerId ? out.filter((v) => v.ownerId === ownerId) : out;
  },

  async getCustom(oid: string, id: string): Promise<CustomVoice | null> {
    const org = requireOrg(oid);
    const r = await redis.hgetall(K.cv(org, id));
    if (!r?._doc) return null;
    try { return JSON.parse(r._doc) as CustomVoice; } catch { return null; }
  },

  /**
   * Consent gate. A voice clone is biometric data — without a recorded consent
   * grant this throws and increments the org's violation counter.
   */
  async cloneVoice(input: {
    organizationId: string;
    ownerId: string; name: string; gender: VoiceGender; age: VoiceAge; language: string;
    method: CloneMethod; consentGranted: boolean; consentRecordedBy?: string;
    baseVoiceId?: string;
  }): Promise<CustomVoice> {
    const org = requireOrg(input.organizationId);
    if (!input.consentGranted) {
      await redis.incr(K.consentViol(org));
      throw Object.assign(new Error("Consent required before cloning"), { code: "CONSENT_REQUIRED" });
    }
    const id = "cv-" + randomUUID().slice(0, 8);
    const cv: CustomVoice = {
      id, name: input.name, ownerId: input.ownerId, organizationId: org,
      baseVoiceId: input.baseVoiceId,
      gender: input.gender, age: input.age, language: input.language,
      languagesSpoken: [input.language],
      consent: "consent-recorded", consentRecordedAt: new Date().toISOString(),
      consentRecordedBy: input.consentRecordedBy,
      cloneMethod: input.method,
      // This process trains no model. An epoch count would be invented.
      trainedEpochs: null,
      visibility: "private", settings: { ...DEFAULT_SETTINGS },
      emotions: ["calm", "friendly", "professional"],
      createdAt: new Date().toISOString(),
    };
    await redis.zadd(K.custom(org), Date.now(), id);
    await redis.hset(K.cv(org, id), "_doc", s2(cv));
    return cv;
  },

  /** Tenancy is checked before ownership — the org gate is not optional. */
  async updateSettings(oid: string, id: string, patch: Partial<VoiceSettings>, ownerId: string): Promise<CustomVoice | null> {
    const org = requireOrg(oid);
    const r = await redis.hgetall(K.cv(org, id));
    if (!r?._doc) return null;
    const cv: CustomVoice = JSON.parse(r._doc);
    if (cv.organizationId && cv.organizationId !== org) return null;
    if (cv.ownerId !== ownerId) return null;
    cv.settings = { ...cv.settings, ...patch };
    await redis.hset(K.cv(org, id), "_doc", s2(cv));
    return cv;
  },

  async createPreset(oid: string, input: { voiceId: string; name: string; settings: Partial<VoiceSettings>; description?: string }): Promise<VoicePreset> {
    const org = requireOrg(oid);
    const id = "vp-" + randomUUID().slice(0, 8);
    const p: VoicePreset = { id, organizationId: org, createdAt: new Date().toISOString(), ...input };
    await redis.zadd(K.presets(org), Date.now(), id);
    await redis.hset(K.preset(org, id), "_doc", s2(p));
    return p;
  },

  async listPresets(oid: string): Promise<VoicePreset[]> {
    const org = requireOrg(oid);
    return readSet<VoicePreset>(K.presets(org), (id) => K.preset(org, id));
  },

  async synthesize(oid: string, req: { voiceId: string; text: string; settings?: Partial<VoiceSettings>; emotion?: Emotion; language?: string; clientSide?: boolean }): Promise<TtsJob & { clientSide?: boolean; provider?: string; language?: string; warning?: string }> {
    const org = requireOrg(oid);
    const { VoiceService } = await import("./voice.service.js");
    const job = await VoiceService.synthesize({
      text: req.text,
      voiceId: req.voiceId,
      emotion: req.emotion,
      speed: req.settings?.speed,
      clientSide: req.clientSide,
    });
    const record: TtsJob = {
      id: job.id, voiceId: job.voiceId, status: job.status, durationMs: job.durationMs,
      audioUrl: job.audioUrl, requestedAt: job.createdAt, organizationId: org,
    };
    await redis.zadd(K.jobs(org), Date.parse(record.requestedAt) || Date.now(), record.id);
    await redis.hset(K.job(org, record.id), "_doc", s2(record));
    if (job.durationMs) {
      await redis.lpush(K.lats(org), String(job.durationMs));
      await redis.ltrim(K.lats(org), 0, 99);
    }
    try {
      const { KernelService } = await import("../kernel/kernel.service.js");
      await KernelService.dispatch({ kind: "voice.tts", source: "voice-studio", target: "voice", payload: { voiceId: req.voiceId, length: req.text.length, clientSide: job.clientSide, provider: job.provider, status: job.status, organizationId: org } });
    } catch { /* best effort */ }
    const legacy: any = { ...record };
    if (job.status === "failed" || job.error) legacy.error = job.error;
    if (job.clientSide) legacy.clientSide = true;
    legacy.provider = job.provider;
    legacy.language = job.language;
    if (job.status === "failed" && !job.audioUrl) legacy.warning = "VOICE MODEL NOT CONFIGURED — server-side audio unavailable. Use browser speech synthesis (clientSide=true) or configure ELEVENLABS_API_KEY / PLAYHT_API_KEY.";
    return legacy;
  },

  async listJobs(oid: string, limit = 50): Promise<TtsJob[]> {
    const org = requireOrg(oid);
    const ids = await redis.zrange(K.jobs(org), 0, -1, "REV");
    const out: TtsJob[] = [];
    for (const id of ids.slice(0, limit)) {
      const r = await redis.hgetall(K.job(org, id));
      if (r?._doc) { try { out.push(JSON.parse(r._doc) as TtsJob); } catch { /* skip */ } }
    }
    return out;
  },

  async summary(oid: string): Promise<VoiceStudioDashboard> {
    const org = requireOrg(oid);
    const [presets, jobs, lats, cv, viol] = await Promise.all([
      redis.zcard(K.presets(org)),
      this.listJobs(org, 1000),
      redis.lrange(K.lats(org), 0, 99),
      this.listCustom(org),
      redis.get(K.consentViol(org)).then((n) => Number(n ?? 0)),
    ]);

    const lat = lats.map(Number).filter((n) => n > 0);
    // Null until something was actually measured — never a hardcoded 180.
    const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;

    // A real rolling window, not a monotonic counter mislabelled "24h".
    const since = Date.now() - DAY_MS;
    const jobs24h = jobs.filter((j) => (Date.parse(j.requestedAt) || 0) >= since).length;

    // Distinct languages actually present. The old figure was `19 + langs.size`,
    // which inflated by a constant and double-counted built-in languages.
    const langs = new Set<string>();
    for (const b of BUILTIN_WITH_IDS) langs.add(b.language);
    for (const v of cv) { langs.add(v.language); (v.languagesSpoken ?? []).forEach((l) => langs.add(l)); }

    const provenance: VoiceStudioProvenance = {
      latency: lat.length
        ? `mean of the last ${lat.length} measured synthesis job(s) in this organization`
        : "no synthesis has been measured in this organization",
      languages: "distinct languages across the built-in catalogue and this organization's custom voices",
      jobs: "this organization's job ledger; 24h is a rolling window over requestedAt",
      consentViolations: "cloning attempts rejected for missing consent in this organization",
    };

    return {
      builtInVoices: BUILTIN_WITH_IDS.length,
      customVoices: cv.length,
      clonedVoices: cv.filter((v) => !!v.cloneMethod).length,
      languages: langs.size,
      emotions: VS_EMOTIONS.length,
      presets,
      ttsJobs24h: jobs24h,
      ttsJobsTotal: jobs.length,
      avgSynthLatencyMs: avg,
      consentViolations: viol,
      provenance,
    };
  },
};
