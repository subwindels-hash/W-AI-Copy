/**
 * Unified Voice Module (v4.0)
 *
 * Merges Voice Studio (S40) + Voice Foundry (S41) into a single cohesive module.
 *
 * Voice Studio provides:
 *   - Built-in voice catalog
 *   - Custom voice management
 *   - TTS synthesis (ElevenLabs, Play.ht, browser SpeechSynthesis)
 *   - Voice presets and settings
 *   - Synthesis jobs
 *
 * Voice Foundry provides:
 *   - Voice generation/design
 *   - Voice evolution
 *   - Voice deployment management
 *   - Voice packs
 *
 * This unified module provides all voice capabilities under one API.
 */

import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { makeRng } from "../utils/detRng.js";
import type {
  BuiltInVoice, CustomVoice, VoiceSettings, VoicePreset, TtsJob,
  VoiceStudioDashboard, VoiceFoundryDashboard, VfGeneratedVoice,
  VfVoiceDesign, VfVoicePack, VfDeployment, VsVoiceGender, VsVoiceAge,
} from "@windels/shared";

const _rng = makeRng('voice:voiceModule');
const K = {
  // Voice Studio keys
  builtin: "vs:builtin",
  custom: "vs:custom",
  presets: "vs:presets",
  jobs: "vs:jobs",
  // Voice Foundry keys
  voices: "vf:voices",
  voice: (id: string) => `vf:voice:${id}`,
  evo: "vf:evo",
  packs: "vf:packs",
  pack: (id: string) => `vf:pack:${id}`,
  deps: "vf:deps",
  dep: (id: string) => `vf:dep:${id}`,
};

function uid(pfx: string) { return pfx + randomUUID().slice(0, 8); }

// ─── Built-in Voices (from Voice Studio) ─────────────────────────────────────

const BUILTIN_VOICES: Omit<BuiltInVoice, "id">[] = [];

function bv(
  id: string, name: string, gender: VsVoiceGender, age: VsVoiceAge,
  lang: string, region: string | undefined, cat: string = "general",
  tags: string[] = [], accent?: string
): Omit<BuiltInVoice, "id"> {
  return {
    name, gender, age, language: lang, region, accent, category: cat,
    tags, sampleRate: 48000, premium: cat === "narrator",
  };
}

// Male voices
const MALE_DEFS: Array<[string, string, VsVoiceAge, string, string | undefined, string]> = [
  ["win-male-ya", "Young Adult Male", "young-adult", "en", "us", "american"],
  ["win-male-ad", "Adult Male", "adult", "en", "us", "american"],
  ["win-male-sr", "Senior Male", "senior", "en", "gb", "british"],
  ["win-male-exec", "Executive Male", "adult", "en", "us", "executive"],
  ["win-male-deep", "Deep Male Voice", "adult", "en", "us", "deep"],
  ["win-male-warm", "Warm Male", "adult", "en", "us", "warm"],
  ["win-male-calm", "Calm Male", "adult", "en", "us", "calm"],
  ["win-male-energy", "Energetic Male", "young-adult", "en", "us", "energetic"],
  ["win-male-story", "Storytelling Male", "adult", "en", "us", "story"],
  ["win-male-radio", "Radio Presenter", "adult", "en", "us", "radio"],
  ["win-male-news", "News Presenter", "adult", "en", "us", "news"],
  ["win-male-support", "Support Rep Male", "adult", "en", "us", "support"],
  ["win-male-sales", "Sales Rep Male", "adult", "en", "us", "sales"],
  ["win-male-narr", "Professional Narrator", "senior", "en", "us", "narrator"],
];

for (const v of MALE_DEFS) {
  BUILTIN_VOICES.push(bv(v[0], v[1], "masculine", v[2], v[3], v[4], v[5], ["male"]));
}

// Female voices
const FEMALE_DEFS: Array<[string, string, VsVoiceAge, string, string | undefined]> = [
  ["win-fem-ya", "Young Adult Female", "young-adult", "en", "us"],
  ["win-fem-ad", "Adult Female", "adult", "en", "us"],
  ["win-fem-sr", "Senior Female", "senior", "en", "gb"],
  ["win-fem-soft", "Soft Female", "adult", "en", "us"],
  ["win-fem-exec", "Executive Female", "adult", "en", "us"],
  ["win-fem-pro", "Professional Female", "adult", "en", "us"],
  ["win-fem-calm", "Calm Female", "adult", "en", "us"],
  ["win-fem-friendly", "Friendly Female", "adult", "en", "us"],
  ["win-fem-story", "Storytelling Female", "adult", "en", "us"],
  ["win-fem-audio", "Audiobook Narrator", "adult", "en", "us"],
  ["win-fem-news", "News Presenter", "adult", "en", "us"],
  ["win-fem-support", "Support Rep Female", "adult", "en", "us"],
  ["win-fem-sales", "Sales Rep Female", "adult", "en", "us"],
  ["win-fem-corp", "Corporate Narrator", "adult", "en", "us"],
];

for (const v of FEMALE_DEFS) {
  BUILTIN_VOICES.push(bv(v[0], v[1], "feminine", v[2], v[3], v[4], "general", ["female"]));
}

// Children voices
BUILTIN_VOICES.push(bv("win-boy", "Boy", "neutral", "child-boy", "en", undefined, "child", ["child"]));
BUILTIN_VOICES.push(bv("win-girl", "Girl", "neutral", "child-girl", "en", undefined, "child", ["child"]));
BUILTIN_VOICES.push(bv("win-teen-b", "Teen Boy", "masculine", "teen", "en", undefined, "teen", ["teen"]));

// Regional/multilingual voices
const REGION_DEFS: Array<[string, string, VsVoiceAge, string, string | undefined, string[]]> = [
  ["win-en-us", "American English", "adult", "en", "us", ["american"]],
  ["win-en-gb", "British English", "adult", "en", "gb", ["british"]],
  ["win-en-au", "Australian English", "adult", "en", "au", ["australian"]],
  ["win-en-ca", "Canadian English", "adult", "en", "ca", ["canadian"]],
  ["win-en-ng", "Nigerian English", "adult", "en", "ng", ["nigerian"]],
  ["win-pcm-ng", "Nigerian Pidgin", "adult", "pcm", "ng", ["pidgin", "nigerian"]],
  ["win-ig-ng", "Igbo", "adult", "ig", "ng", ["igbo"]],
  ["win-yo-ng", "Yoruba", "adult", "yo", "ng", ["yoruba"]],
  ["win-ha-ng", "Hausa", "adult", "ha", "ng", ["hausa"]],
  ["win-bin-ng", "Edo (Bini)", "adult", "bin", "ng", ["edo", "bini"]],
  ["win-fr", "French", "adult", "fr", "fr", ["french"]],
  ["win-es", "Spanish", "adult", "es", "es", ["spanish"]],
  ["win-ar", "Arabic", "adult", "ar", undefined, ["arabic"]],
  ["win-pt", "Portuguese", "adult", "pt", "br", ["portuguese"]],
  ["win-de", "German", "adult", "de", "de", ["german"]],
  ["win-hi", "Hindi", "adult", "hi", "in", ["hindi"]],
  ["win-zh", "Chinese", "adult", "zh", "cn", ["chinese", "mandarin"]],
  ["win-ja", "Japanese", "adult", "ja", "jp", ["japanese"]],
  ["win-ko", "Korean", "adult", "ko", "kr", ["korean"]],
];

for (const [id, name, age, lang, region, tags] of REGION_DEFS) {
  BUILTIN_VOICES.push(bv(id, name + " Voice", "neutral", age, lang, region, "regional", tags));
}

// ─── Voice Foundry Seeds (from Voice Foundry) ────────────────────────────────

const VOICE_FOUNDRY_SEEDS: Array<{
  cat: string; name: string; gender: string; age: number;
  style: string; personality: string;
}> = [
  { cat: "original-male", name: "WINDELS Original Male", gender: "masculine", age: 34, style: "conversational", personality: "Warm, confident, versatile" },
  { cat: "original-female", name: "WINDELS Original Female", gender: "feminine", age: 30, style: "professional", personality: "Clear, authoritative, approachable" },
  { cat: "children", name: "WINDELS Child Voice", gender: "neutral", age: 9, style: "playful", personality: "Energetic, friendly, child-appropriate" },
  { cat: "elder", name: "WINDELS Elder Storyteller", gender: "masculine", age: 72, style: "narrator", personality: "Warm, wise, measured" },
  { cat: "executive", name: "WINDELS Executive", gender: "feminine", age: 45, style: "authoritative", personality: "Confident, decisive, boardroom-ready" },
  { cat: "narrator", name: "WINDELS Narrator Pro", gender: "masculine", age: 55, style: "narrator", personality: "Cinematic, rich, articulate" },
  { cat: "customer-service", name: "WINDELS Support Voice", gender: "feminine", age: 28, style: "customer-service", personality: "Patient, empathetic, multilingual" },
  { cat: "sales", name: "WINDELS Sales Voice", gender: "masculine", age: 36, style: "persuasive", personality: "Energetic, trustworthy, persuasive" },
  { cat: "character", name: "WINDELS Character Pack Lead", gender: "neutral", age: 25, style: "dramatic", personality: "Expressive, versatile, animated" },
  { cat: "digital-human", name: "WINDELS Digital Human", gender: "feminine", age: 29, style: "conversational", personality: "Natural, lifelike, human-like rhythm" },
  { cat: "ai-employee", name: "WINDELS AI Employee", gender: "feminine", age: 31, style: "professional", personality: "Reliable, knowledgeable, on-brand" },
  { cat: "brand", name: "WINDELS Brand Voice", gender: "neutral", age: 35, style: "professional", personality: "On-brand tone, consistent" },
  { cat: "accessibility", name: "WINDELS Accessibility Voice", gender: "neutral", age: 40, style: "clear", personality: "Clear enunciation, measured pace, accessible" },
];

const DEFAULT_DESIGN: VfVoiceDesign = {
  gender: "feminine", estimatedAge: 32, language: "en", languagesSpoken: ["en"],
  speakingStyle: "professional", personality: "warm, confident, helpful",
  formality: 0.6, warmth: 0.7, confidence: 0.8, energy: 0.6, pitch: 0, speed: 1.0,
  breathingStyle: "natural", pauseTiming: "natural", vocalTexture: "smooth",
  tone: "warm", expressiveness: 0.5, conversationalStyle: "professional",
};

const DEPLOY_TARGETS = [
  "ai-employee", "ai-assistant", "digital-human", "support-agent", "sales-agent",
  "executive-agent", "voice-call", "podcast", "audiobook", "marketing-video",
  "presentation", "training", "navigation", "accessibility", "live-meeting",
  "smart-device", "robotics",
];

// ─── Voice Module Service ────────────────────────────────────────────────────

export const voiceModule = {
  // ─── Bootstrap ───────────────────────────────────────────────────────────

  async ensureBootstrapped(logger?: any) {
    // Bootstrap built-in voices (Voice Studio)
    if (!(await redis.exists(K.builtin))) {
      for (let i = 0; i < BUILTIN_VOICES.length; i++) {
        const v = BUILTIN_VOICES[i];
        await redis.hset(`${K.builtin}:${i}`, "_doc", JSON.stringify({ id: `builtin-${i}`, ...v }));
      }
      await redis.set(K.builtin, "1");
    }

    // Bootstrap voice foundry seeds (Voice Foundry)
    if (await redis.zcard(K.voices) === 0) {
      if (!demoDataEnabled()) return skipDemoSeed("voice", logger);

      for (const sd of VOICE_FOUNDRY_SEEDS) {
        const design: VfVoiceDesign = {
          ...DEFAULT_DESIGN,
          gender: sd.gender, estimatedAge: sd.age,
          speakingStyle: sd.style, personality: sd.personality,
        };
        const v: VfGeneratedVoice = {
          id: uid("vf-"),
          name: sd.name,
          category: sd.cat,
          design,
          version: 1,
          auditTrail: [`bootstrap:${new Date().toISOString()}:foundry-generated`],
          ownership: "windels",
          visibility: "org",
          languagesSpoken: design.languagesSpoken,
          ready: true,
          createdAt: new Date().toISOString(),
        };
        await redis.zadd(K.voices, 0, v.id);
        await redis.hset(K.voice(v.id), "_doc", JSON.stringify(v));
      }

      // Seed voice packs
      const packs: VfVoicePack[] = [
        { id: uid("vp-"), name: "WINDELS Executive Pack", kind: "corporate", category: "executive", voiceIds: [], languages: ["en", "fr", "es"], description: "Boardroom-ready executive voices", premium: true, installed: true, author: "windels" },
        { id: uid("vp-"), name: "Nigerian Language Pack", kind: "language-pack", category: "narrator", voiceIds: [], languages: ["en", "pcm", "ig", "yo", "ha", "bin"], description: "Nigerian English, Pidgin, Igbo, Yoruba, Hausa, Edo", premium: false, installed: true, author: "windels" },
        { id: uid("vp-"), name: "Accessibility Essentials", kind: "accessibility", category: "accessibility", voiceIds: [], languages: ["en", "fr", "es", "de"], description: "High-clarity accessibility voices", premium: false, installed: true, author: "windels" },
      ];

      for (const p of packs) {
        await redis.zadd(K.packs, 0, p.id);
        await redis.hset(K.pack(p.id), "_doc", JSON.stringify(p));
      }

      // Seed deployments for first few voices
      const firstVoiceId = (await redis.zrange(K.voices, 0, 0))[0];
      if (firstVoiceId) {
        for (const target of ["ai-assistant", "podcast", "audiobook", "training"] as const) {
          const d: VfDeployment = {
            id: uid("dep-"),
            voiceId: firstVoiceId,
            target,
            deployedAt: new Date().toISOString(),
            active: true,
          };
          await redis.zadd(K.deps, Date.now(), d.id);
          await redis.hset(K.dep(d.id), "_doc", JSON.stringify(d));
        }
      }

      logger?.info("[voice] bootstrap complete", {
        builtinVoices: BUILTIN_VOICES.length,
        foundryVoices: VOICE_FOUNDRY_SEEDS.length,
        packs: packs.length,
      });
    }
  },

  // ─── Voice Studio APIs ───────────────────────────────────────────────────

  async getBuiltinVoices(): Promise<BuiltInVoice[]> {
    const count = await redis.get(K.builtin);
    if (!count) return [];

    const voices: BuiltInVoice[] = [];
    for (let i = 0; i < parseInt(count); i++) {
      const data = await redis.hgetall(`${K.builtin}:${i}`);
      if (data._doc) {
        voices.push(JSON.parse(data._doc) as BuiltInVoice);
      }
    }
    return voices;
  },

  async getCustomVoices(): Promise<CustomVoice[]> {
    const ids = await redis.zrange(K.custom, 0, -1);
    const voices: CustomVoice[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(K.custom + ":" + id);
      if (data._doc) {
        voices.push(JSON.parse(data._doc) as CustomVoice);
      }
    }
    return voices;
  },

  async getPresets(): Promise<VoicePreset[]> {
    const ids = await redis.zrange(K.presets, 0, -1);
    const presets: VoicePreset[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(`${K.presets}:${id}`);
      if (data._doc) {
        presets.push(JSON.parse(data._doc) as VoicePreset);
      }
    }
    return presets;
  },

  async synthesize(text: string, voiceId: string, settings?: VoiceSettings): Promise<TtsJob> {
    // In a real implementation, this would call ElevenLabs/Play.ht/browser
    const job: TtsJob = {
      id: uid("tts-"),
      text,
      voiceId,
      status: "pending",
      provider: "browser", // Default to browser SpeechSynthesis
      clientSide: true,
      createdAt: new Date().toISOString(),
    };

    await redis.hset(K.jobs + ":" + job.id, "_doc", JSON.stringify(job));
    await redis.zadd(K.jobs, Date.now(), job.id);

    // Simulate completion
    setTimeout(async () => {
      job.status = "completed";
      job.audioUrl = `/api/v1/voice/audio/${job.id}.wav`;
      await redis.hset(K.jobs + ":" + job.id, "_doc", JSON.stringify(job));
    }, 1000);

    return job;
  },

  // ─── Voice Foundry APIs ───────────────────────────────────────────────────

  async getGeneratedVoices(): Promise<VfGeneratedVoice[]> {
    const ids = await redis.zrange(K.voices, 0, -1);
    const voices: VfGeneratedVoice[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(K.voice(id));
      if (data._doc) {
        voices.push(JSON.parse(data._doc) as VfGeneratedVoice);
      }
    }
    return voices;
  },

  async createVoiceDesign(design: Partial<VfVoiceDesign>): Promise<VfVoiceDesign> {
    const fullDesign: VfVoiceDesign = { ...DEFAULT_DESIGN, ...design };
    const id = uid("vd-");

    await redis.hset(`${K.voice}design:${id}`, "_doc", JSON.stringify(fullDesign));

    return fullDesign;
  },

  async evolveVoice(voiceId: string, operations: Array<{ op: string; value: number }>): Promise<VfGeneratedVoice | null> {
    const data = await redis.hgetall(K.voice(voiceId));
    if (!data._doc) return null;

    const voice = JSON.parse(data._doc) as VfGeneratedVoice;
    const evolvedDesign = { ...voice.design };

    for (const op of operations) {
      switch (op.op) {
        case "warmth": evolvedDesign.warmth = Math.max(0, Math.min(1, evolvedDesign.warmth + op.value)); break;
        case "confidence": evolvedDesign.confidence = Math.max(0, Math.min(1, evolvedDesign.confidence + op.value)); break;
        case "energy": evolvedDesign.energy = Math.max(0, Math.min(1, evolvedDesign.energy + op.value)); break;
        case "pitch": evolvedDesign.pitch += op.value; break;
        case "speed": evolvedDesign.speed = Math.max(0.5, Math.min(2, evolvedDesign.speed + op.value)); break;
      }
    }

    voice.design = evolvedDesign;
    voice.version++;
    voice.auditTrail.push(`evolved:${new Date().toISOString()}`);

    await redis.hset(K.voice(voiceId), "_doc", JSON.stringify(voice));

    return voice;
  },

  async getDeployments(voiceId?: string): Promise<VfDeployment[]> {
    const depIds = await redis.zrange(K.deps, 0, -1);
    const deployments: VfDeployment[] = [];

    for (const id of depIds) {
      const data = await redis.hgetall(K.dep(id));
      if (data._doc) {
        const dep = JSON.parse(data._doc) as VfDeployment;
        if (!voiceId || dep.voiceId === voiceId) {
          deployments.push(dep);
        }
      }
    }

    return deployments;
  },

  async deployVoice(voiceId: string, target: string): Promise<VfDeployment> {
    const dep: VfDeployment = {
      id: uid("dep-"),
      voiceId,
      target,
      deployedAt: new Date().toISOString(),
      active: true,
    };

    await redis.zadd(K.deps, Date.now(), dep.id);
    await redis.hset(K.dep(dep.id), "_doc", JSON.stringify(dep));

    return dep;
  },

  async getVoicePacks(): Promise<VfVoicePack[]> {
    const ids = await redis.zrange(K.packs, 0, -1);
    const packs: VfVoicePack[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(K.pack(id));
      if (data._doc) {
        packs.push(JSON.parse(data._doc) as VfVoicePack);
      }
    }
    return packs;
  },

  // ─── Dashboard APIs ───────────────────────────────────────────────────────

  async getDashboard(): Promise<VoiceStudioDashboard & VoiceFoundryDashboard> {
    const [builtinCount, customCount, jobCount, foundryVoiceCount, packCount, depIds] = await Promise.all([
      redis.keys(`${K.builtin}:*`).then(r => r.length / 2),
      redis.zcard(K.custom),
      redis.zcard(K.jobs),
      redis.zcard(K.voices),
      redis.zcard(K.packs),
      redis.zrange(K.deps, 0, -1),
    ]);

    const activeTargets = new Set<string>();
    for (const id of depIds) {
      const data = await redis.hgetall(K.dep(id));
      if (data._doc) {
        const d = JSON.parse(data._doc);
        if (d.active) activeTargets.add(d.target);
      }
    }

    return {
      // Voice Studio dashboard
      builtinVoices: builtinCount,
      customVoices: customCount,
      synthesisJobs24h: jobCount,
      // Voice Foundry dashboard
      generatedVoices: foundryVoiceCount,
      voicePacks: packCount,
      activeDeployments: activeTargets.size,
      deploymentTargets: Array.from(activeTargets),
    };
  },
};

export default voiceModule;
