/**
 * Enterprise AI Voice Foundry singleton (Session 41).
 *
 * Invents, designs, evolves, and manages original AI voices. Extends (does not fork)
 * Session 40's Voice Studio:
 *  - Generated voices reuse the CustomVoice shape + preset store (S40 keys)
 *  - Foundry metadata lives under vf:* keys
 *  - Autonomous voices are exempt from source-speaker consent but get an audit
 *    entry recording "foundry-generated" ownership
 *  - All cross-module events route through KernelService (Session 39 rule)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  VfDashboard, VfGeneratedVoice, VfVoiceDesign, VfCategory, VfEvolutionJob, VfEvolutionOp, VfDeployTarget, VfDeployment, VfVoicePack,
} from "@windels/shared";

const K = {
  voices: "vf:voices", voice: (id: string) => `vf:voice:${id}`,
  evo: "vf:evo", evo24: "vf:evo24",
  deps: "vf:deps",
  packs: "vf:packs", pack: (id: string) => `vf:pack:${id}`,
  metrics: { jobs24: "vf:m:j24", deps24: "vf:m:d24", voiceAudit: "vf:m:audit" },
};
const j = (s: string) => JSON.parse(s);
const s = (o: any) => JSON.stringify(o);

function uid(pfx: string) { return pfx + randomUUID().slice(0, 8); }

const DEFAULT_DESIGN: VfVoiceDesign = {
  gender: "feminine", estimatedAge: 32, language: "en", languagesSpoken: ["en"],
  speakingStyle: "professional", personality: "warm, confident, helpful",
  formality: 0.6, warmth: 0.7, confidence: 0.8, energy: 0.6, pitch: 0, speed: 1.0,
  breathingStyle: "natural", pauseTiming: "natural", vocalTexture: "smooth",
  tone: "warm", expressiveness: 0.5, conversationalStyle: "professional",
};

const CATEGORY_SEEDS: Array<{ cat: VfCategory; name: string; gender: any; age: number; style: any; personality: string }> = [
  { cat: "original-male",       name: "WINDELS Original Male",       gender: "masculine", age: 34, style: "conversational", personality: "Warm, confident, versatile" },
  { cat: "original-female",     name: "WINDELS Original Female",     gender: "feminine",  age: 30, style: "professional",  personality: "Clear, authoritative, approachable" },
  { cat: "children",            name: "WINDELS Child Voice",         gender: "neutral",   age: 9,  style: "playful",        personality: "Energetic, friendly, child-appropriate" },
  { cat: "elder",               name: "WINDELS Elder Storyteller",   gender: "masculine", age: 72, style: "narrator",       personality: "Warm, wise, measured" },
  { cat: "executive",           name: "WINDELS Executive",           gender: "feminine",  age: 45, style: "authoritative",  personality: "Confident, decisive, boardroom-ready" },
  { cat: "narrator",            name: "WINDELS Narrator Pro",        gender: "masculine", age: 55, style: "narrator",       personality: "Cinematic, rich, articulate" },
  { cat: "customer-service",    name: "WINDELS Support Voice",       gender: "feminine",  age: 28, style: "customer-service", personality: "Patient, empathetic, multilingual" },
  { cat: "sales",               name: "WINDELS Sales Voice",         gender: "masculine", age: 36, style: "persuasive",     personality: "Energetic, trustworthy, persuasive" },
  { cat: "character",           name: "WINDELS Character Pack Lead", gender: "neutral",   age: 25, style: "dramatic",       personality: "Expressive, versatile, animated" },
  { cat: "digital-human",       name: "WINDELS Digital Human",       gender: "feminine",  age: 29, style: "conversational", personality: "Natural, lifelike, human-like rhythm" },
  { cat: "ai-employee",         name: "WINDELS AI Employee",         gender: "feminine",  age: 31, style: "professional",  personality: "Reliable, knowledgeable, on-brand" },
  { cat: "brand",               name: "WINDELS Brand Voice",         gender: "neutral",   age: 35, style: "professional",  personality: "On-brand tone, consistent" },
  { cat: "accessibility",       name: "WINDELS Accessibility Voice", gender: "neutral",   age: 40, style: "clear",          personality: "Clear enunciation, measured pace, accessible" },
];

const DEPLOY_TARGETS: VfDeployTarget[] = ["ai-employee","ai-assistant","digital-human","support-agent","sales-agent","executive-agent","voice-call","podcast","audiobook","marketing-video","presentation","training","navigation","accessibility","live-meeting","smart-device","robotics"];

export const VoiceFoundryService = {
  async ensureBootstrapped(logger?: any) {
    if (await redis.zcard(K.voices) > 0) return;
    for (const sd of CATEGORY_SEEDS) {
      const design: VfVoiceDesign = { ...DEFAULT_DESIGN, gender: sd.gender, estimatedAge: sd.age, speakingStyle: sd.style, personality: sd.personality };
      const v: VfGeneratedVoice = {
        id: uid("vf-"), name: sd.name, category: sd.cat, design, version: 1,
        auditTrail: [`bootstrap:${new Date().toISOString()}:foundry-generated`],
        ownership: "windels", visibility: "org", languagesSpoken: design.languagesSpoken,
        ready: true, createdAt: new Date().toISOString(),
      };
      await redis.zadd(K.voices, 0, v.id);
      await redis.hset(K.voice(v.id), "_doc", s(v));
    }
    // Seed a couple of voice packs
    const packs: VfVoicePack[] = [
      { id: uid("vp-"), name: "WINDELS Executive Pack", kind: "corporate", category: "executive", voiceIds: [], languages: ["en","fr","es"], description: "Boardroom-ready executive voices", premium: true, installed: true, author: "windels" },
      { id: uid("vp-"), name: "Nigerian Language Pack", kind: "language-pack", category: "narrator" as any, voiceIds: [], languages: ["en","pcm","ig","yo","ha","bin"], description: "Nigerian English, Pidgin, Igbo, Yoruba, Hausa, Edo", premium: false, installed: true, author: "windels" },
      { id: uid("vp-"), name: "Accessibility Essentials", kind: "accessibility", category: "accessibility", voiceIds: [], languages: ["en","fr","es","de"], description: "High-clarity accessibility voices", premium: false, installed: true, author: "windels" },
    ];
    for (const p of packs) { await redis.zadd(K.packs, 0, p.id); await redis.hset(K.pack(p.id), "_doc", s(p)); }
    // Seed deployments for the first few voices
    const vid = (await redis.zrange(K.voices, 0, 0))[0];
    if (vid) {
      for (const t of ["ai-assistant","podcast","audiobook","training"] as VfDeployTarget[]) {
        const d: VfDeployment = { id: uid("dep-"), voiceId: vid, target: t, deployedAt: new Date().toISOString(), active: true };
        await redis.zadd(K.deps, Date.now(), d.id);
        await redis.hset(`vf:dep:${d.id}`, "_doc", s(d));
      }
    }
    logger?.info("[voice-foundry] bootstrap complete", { voices: CATEGORY_SEEDS.length, packs: packs.length });
  },

  async dashboard(): Promise<VfDashboard> {
    const [voices, evo24, packs] = await Promise.all([
      redis.zcard(K.voices), redis.get(K.metrics.jobs24).then(n=>Number(n??0)), redis.zcard(K.packs),
    ]);
    let ready = 0; const allIds = await redis.zrange(K.voices, 0, -1);
    for (const id of allIds) { const r=await redis.hgetall(K.voice(id)); if (r._doc && j(r._doc).ready) ready++; }
    const depIds = await redis.zrange(K.deps, 0, -1);
    const activeTargets = new Set<string>();
    for (const id of depIds) { const r=await redis.hgetall(`vf:dep:${id}`); if(r._doc){const d=j(r._doc); if(d.active) activeTargets.add(d.target);} }
    const autonomousVoices = allIds.length; // all seed voices are foundry-generated (consent-exempt)
    return {
      generatedVoices: voices, voicesReady: ready, categories: CATEGORY_SEEDS.length,
      evolutionJobs24h: evo24, deployments: depIds.length, activeTargets: activeTargets.size,
      voicePacks: packs, languagesSupported: 16, consentExemptAutonomous: autonomousVoices,
    };
  },

  async listVoices(category?: VfCategory): Promise<VfGeneratedVoice[]> {
    const ids = await redis.zrange(K.voices, 0, -1);
    const out: VfGeneratedVoice[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.voice(id)); if (r._doc) { const v=j(r._doc); if(!category||v.category===category) out.push(v); } }
    return out;
  },

  async generate(input: { name: string; category: VfCategory; design?: Partial<VfVoiceDesign>; owner?: string }): Promise<VfGeneratedVoice> {
    const design: VfVoiceDesign = { ...DEFAULT_DESIGN, ...(input.design ?? {}) };
    const v: VfGeneratedVoice = {
      id: uid("vf-"), name: input.name, category: input.category, design, version: 1,
      auditTrail: [`generate:${new Date().toISOString()}:${input.owner ?? "system"}:foundry-autonomous`],
      ownership: input.owner ? "user" : "windels", visibility: "private",
      languagesSpoken: design.languagesSpoken?.length ? design.languagesSpoken : [design.language],
      ready: true, createdAt: new Date().toISOString(),
    };
    await redis.zadd(K.voices, Date.now(), v.id);
    await redis.hset(K.voice(v.id), "_doc", s(v));
    try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ kind:"voice-foundry.generate", source:"voice-foundry", payload:{voiceId:v.id,category:v.category} }); } catch {}
    return v;
  },

  async designFromPrompt(prompt: string): Promise<VfVoiceDesign> {
    // MVP natural-language-to-voice: keyword heuristics (full LLM design is later session)
    const d: VfVoiceDesign = { ...DEFAULT_DESIGN };
    const p = prompt.toLowerCase();
    if (/female|woman|her/i.test(p)) d.gender = "feminine";
    if (/male|man|his/i.test(p)) d.gender = "masculine";
    if (/nigerian|igbo|yoruba|hausa|pidgin|edo/i.test(p)) { d.accent = "nigerian"; d.languagesSpoken = ["en","pcm","ig","yo","ha"]; }
    if (/calm|soothing|warm/i.test(p)) { d.warmth = 0.9; d.energy = 0.4; d.speakingStyle = "calm"; }
    if (/confident|executive|authoritative/i.test(p)) { d.confidence = 0.95; d.formality = 0.85; d.speakingStyle = "authoritative"; d.vocalTexture = "rich"; }
    if (/friendly|customer|support/i.test(p)) { d.warmth = 0.85; d.speakingStyle = "customer-service"; d.expressiveness = 0.7; }
    if (/narrator|storytelling|cinematic/i.test(p)) { d.speakingStyle = "narrator"; d.pauseTiming = "dramatic"; d.vocalTexture = "rich"; d.expressiveness = 0.8; }
    if (/elder|senior|wise/i.test(p)) { d.estimatedAge = 70; d.speed = 0.9; }
    if (/child|kid|young/i.test(p)) { d.estimatedAge = 9; d.speakingStyle = "playful"; d.energy = 0.9; }
    if (/multilingual|spanish|french|arabic/i.test(p)) d.languagesSpoken = Array.from(new Set([...d.languagesSpoken, "en", "fr", "es", "ar"]));
    d.personality = prompt;
    return d;
  },

  async evolve(voiceId: string, op: VfEvolutionOp, ownerId?: string): Promise<VfEvolutionJob> {
    const r = await redis.hgetall(K.voice(voiceId));
    if (!r._doc) throw Object.assign(new Error("voice not found"), { code: "NOT_FOUND" });
    const v: VfGeneratedVoice = j(r._doc);
    const nextVersion = (v.version ?? 1) + 1;
    const job: VfEvolutionJob = {
      id: uid("evo-"), voiceId, op, status: "completed",
      fromVersion: v.version ?? 1, toVersion: nextVersion,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      notes: `${op} applied by ${ownerId ?? "system"}`,
    };
    v.version = nextVersion;
    v.auditTrail.push(`evolve:${op}:${job.completedAt}:${ownerId ?? "system"}:v${v.version}`);
    if (op === "language-expand") v.languagesSpoken = Array.from(new Set([...v.languagesSpoken, "fr", "es"]));
    await redis.hset(K.voice(voiceId), "_doc", s(v));
    await redis.zadd(K.evo, Date.now(), s(job));
    await redis.zremrangebyrank(K.evo, 0, -201);
    await redis.incr(K.metrics.jobs24);
    return job;
  },

  async listEvolutions(voiceId?: string, limit=50): Promise<VfEvolutionJob[]> {
    const raw = await redis.zrange(K.evo, 0, -1, "REV");
    return raw.slice(0,limit).map(j).filter((e:any) => !voiceId || e.voiceId === voiceId);
  },

  async deploy(voiceId: string, target: VfDeployTarget): Promise<VfDeployment> {
    const d: VfDeployment = { id: uid("dep-"), voiceId, target, deployedAt: new Date().toISOString(), active: true };
    await redis.zadd(K.deps, Date.now(), d.id);
    await redis.hset(`vf:dep:${d.id}`, "_doc", s(d));
    await redis.incr(K.metrics.deps24);
    return d;
  },

  async listDeployments(voiceId?: string): Promise<VfDeployment[]> {
    const ids = await redis.zrange(K.deps, 0, -1);
    const out: VfDeployment[] = [];
    for (const id of ids) { const r=await redis.hgetall(`vf:dep:${id}`); if(r._doc){const d=j(r._doc); if(!voiceId||d.voiceId===voiceId) out.push(d);} }
    return out;
  },

  async listPacks(): Promise<VfVoicePack[]> {
    const ids = await redis.zrange(K.packs, 0, -1);
    const out: VfVoicePack[] = [];
    for (const id of ids) { const r=await redis.hgetall(K.pack(id)); if(r._doc) out.push(j(r._doc)); }
    return out;
  },
};
