/**
 * Enterprise Voice Studio singleton (Session 40).
 * Consent gate enforced BEFORE any cloning. Voices default to private.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  BuiltInVoice, CustomVoice, VoiceSettings, VoicePreset, VsEmotion as Emotion,
  TtsJob, VoiceStudioDashboard, VsCloneMethod as CloneMethod, VsConsentState as ConsentState,
  VsVoiceVisibility as VoiceVisibility, VsVoiceGender as VoiceGender, VsVoiceAge as VoiceAge,
} from "@windels/shared";

const K = {
  builtin: "vs:builtin",
  custom: "vs:custom",
  presets: "vs:presets",
  jobs: "vs:jobs", jobs24: "vs:jobs24", lats: "vs:lats", consentViol: "vs:consent-viol",
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
  BUILTIN.push(bv(id, name+" Voice", genderFor(lang,region), age, lang, region, "regional", tags));
}
function genderFor(lang: string, _region?: string): VoiceGender { return lang === "en" ? "feminine" : "masculine"; } // deterministic

const DEFAULT_SETTINGS: VoiceSettings = { pitch:0, speed:1.0, volume:0.9, energy:0.6, warmth:0.7, emotion:"calm", formality:0.5, accentStrength:0.8, pauseMs:240, breathing:0.2 };

export const VoiceStudioService = {
  async ensureBootstrapped() {
    if (await redis.zcard(K.builtin) > 0) return;
    for (const b of BUILTIN) {
      const id = "bv-" + b.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40);
      await redis.zadd(K.builtin, 0, id);
      await redis.hset(`vs:bvin:${id}`, "_doc", JSON.stringify({ ...b, id }));
    }
  },
  async listBuiltIn(): Promise<BuiltInVoice[]> {
    await this.ensureBootstrapped();
    const ids = await redis.zrange(K.builtin,0,-1);
    const out: BuiltInVoice[] = [];
    for (const id of ids) { const r = await redis.hgetall(`vs:bvin:${id}`); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
  async listCustom(ownerId?: string): Promise<CustomVoice[]> {
    const ids = await redis.zrange(K.custom, 0, -1);
    let out: CustomVoice[] = [];
    for (const id of ids) { const r = await redis.hgetall(`vs:cv:${id}`); if (r._doc) out.push(JSON.parse(r._doc)); }
    if (ownerId) out = out.filter(v => v.ownerId === ownerId);
    return out;
  },
  async cloneVoice(input: {
    ownerId: string; name: string; gender: VoiceGender; age: VoiceAge; language: string;
    method: CloneMethod; consentGranted: boolean; consentRecordedBy?: string;
    baseVoiceId?: string;
  }): Promise<CustomVoice> {
    if (!input.consentGranted) {
      await redis.incr(K.consentViol);
      throw Object.assign(new Error("Consent required before cloning"), { code:"CONSENT_REQUIRED" });
    }
    const id = "cv-" + randomUUID().slice(0,8);
    const cv: CustomVoice = {
      id, name: input.name, ownerId: input.ownerId, baseVoiceId: input.baseVoiceId,
      gender: input.gender, age: input.age, language: input.language, languagesSpoken: [input.language],
      consent: "consent-recorded", consentRecordedAt: new Date().toISOString(),
      cloneMethod: input.method, trainedEpochs: input.method==="hf-clone"?12:3,
      visibility: "private", settings: { ...DEFAULT_SETTINGS }, emotions: ["calm","friendly","professional"],
      createdAt: new Date().toISOString(),
    };
    const multi = redis.multi();
    multi.zadd(K.custom, Date.now(), id);
    multi.hset(`vs:cv:${id}`, "_doc", JSON.stringify(cv));
    await multi.exec();
    return cv;
  },
  async updateSettings(id: string, patch: Partial<VoiceSettings>, ownerId: string): Promise<CustomVoice | null> {
    const r = await redis.hgetall(`vs:cv:${id}`);
    if (!r._doc) return null;
    const cv: CustomVoice = JSON.parse(r._doc);
    if (cv.ownerId !== ownerId) return null;
    cv.settings = { ...cv.settings, ...patch };
    await redis.hset(`vs:cv:${id}`, "_doc", JSON.stringify(cv));
    return cv;
  },
  async createPreset(input: { voiceId: string; name: string; settings: Partial<VoiceSettings>; description?: string }): Promise<VoicePreset> {
    const id = "vp-" + randomUUID().slice(0,8);
    const p: VoicePreset = { id, ...input };
    await redis.zadd(K.presets, Date.now(), JSON.stringify(p));
    return p;
  },
  async listPresets(): Promise<VoicePreset[]> {
    return (await redis.zrange(K.presets,0,-1)).map(s=>JSON.parse(s));
  },
  async synthesize(req: { voiceId: string; text: string; settings?: Partial<VoiceSettings>; emotion?: Emotion; language?: string; clientSide?: boolean }): Promise<TtsJob & { clientSide?: boolean; provider?: string; language?: string; warning?: string }> {
    const { VoiceService } = await import("./voice.service.js");
    const job = await VoiceService.synthesize({
      text: req.text,
      voiceId: req.voiceId,
      emotion: req.emotion,
      speed: req.settings?.speed,
      clientSide: req.clientSide,
    });
    // Preserve legacy audit record
    await redis.zadd(K.jobs, Date.now(), JSON.stringify({
      id: job.id, voiceId: job.voiceId, status: job.status, durationMs: job.durationMs,
      audioUrl: job.audioUrl, requestedAt: job.createdAt,
    }));
    await redis.incr(K.jobs24);
    if (job.durationMs) { await redis.lpush(K.lats, String(job.durationMs)); await redis.ltrim(K.lats,0,99); }
    try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ kind:"voice.tts", source:"voice-studio", target:"voice", payload:{voiceId:req.voiceId,length:req.text.length,clientSide:job.clientSide,provider:job.provider,status:job.status} }); } catch {}
    const legacy: any = { id: job.id, voiceId: job.voiceId, status: job.status, durationMs: job.durationMs, audioUrl: job.audioUrl, requestedAt: job.createdAt };
    if (job.status === "failed" || job.error) legacy.error = job.error;
    if (job.clientSide) legacy.clientSide = true;
    legacy.provider = job.provider;
    legacy.language = job.language;
    if (job.status === "failed" && !job.audioUrl) legacy.warning = "VOICE MODEL NOT CONFIGURED — server-side audio unavailable. Use browser speech synthesis (clientSide=true) or configure ELEVENLABS_API_KEY / PLAYHT_API_KEY.";
    return legacy;
  },
  async listJobs(limit=50): Promise<TtsJob[]> {
    return (await redis.zrange(K.jobs,0,-1,"REV")).slice(0,limit).map(s=>JSON.parse(s));
  },
  async summary(): Promise<VoiceStudioDashboard> {
    await this.ensureBootstrapped();
    const [builtin, custom, presets, jobs, lats, cv] = await Promise.all([
      redis.zcard(K.builtin), redis.zcard(K.custom), redis.zcard(K.presets),
      redis.get(K.jobs24).then(n=>Number(n??0)),
      redis.lrange(K.lats,0,99),
      this.listCustom(),
    ]);
    const lat = lats.map(Number).filter(n=>n>0);
    const avg = lat.length?Math.round(lat.reduce((a,b)=>a+b,0)/lat.length):180;
    const langs = new Set<string>();
    for (const v of cv) { langs.add(v.language); v.languagesSpoken.forEach((l: any)=>langs.add(l)); }
    return {
      builtInVoices: builtin, customVoices: custom, clonedVoices: cv.filter(v=>!!v.cloneMethod).length,
      languages: 19 + langs.size, emotions: 13, presets, ttsJobs24h: jobs,
      avgSynthLatencyMs: avg, consentViolations: Number(await redis.get(K.consentViol)??"0"),
    };
  },
};
