/**
 * AI Personality Studio singleton (Slice 289).
 */
import { randomUUID } from "node:crypto";
import type {
  PersonalityProfile,
  VoicePersona,
  AvatarConfig,
  DepartmentPersonality,
  ResolvedPersona,
  PersonaDepartment,
  VoiceGender,
  RegionalPersonaOverride,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const KEYS = {
  profiles: "ae:profiles", voices: "ae:voices", avatars: "ae:avatars", depts: "ae:depts",
};

function hydrateProfile(raw: Record<string, string>): PersonalityProfile {
  return {
    id: raw.id, name: raw.name, description: raw.description, tone: raw.tone,
    formality: Number(raw.formality), empathy: Number(raw.empathy), humor: Number(raw.humor),
    verbosity: Number(raw.verbosity), assertiveness: Number(raw.assertiveness),
    brandAlignment: Number(raw.brandAlignment),
    voicePersonaId: raw.voicePersonaId || undefined,
    avatarId: raw.avatarId || undefined,
    useCases: raw.useCases ? JSON.parse(raw.useCases) : [],
    regionalOverrides: raw.regionalOverrides ? JSON.parse(raw.regionalOverrides) : [],
    createdAt: raw.createdAt,
  };
}
function dehydrateProfile(p: PersonalityProfile): Record<string, string> {
  return {
    id: p.id, name: p.name, description: p.description, tone: p.tone,
    formality: String(p.formality), empathy: String(p.empathy), humor: String(p.humor),
    verbosity: String(p.verbosity), assertiveness: String(p.assertiveness),
    brandAlignment: String(p.brandAlignment),
    voicePersonaId: p.voicePersonaId ?? "", avatarId: p.avatarId ?? "",
    useCases: JSON.stringify(p.useCases), regionalOverrides: JSON.stringify(p.regionalOverrides),
    createdAt: p.createdAt,
  };
}
function hydrateVoice(raw: Record<string, string>): VoicePersona {
  return {
    id: raw.id, name: raw.name, gender: raw.gender as VoiceGender, language: raw.language,
    accent: raw.accent || undefined, paceWpm: Number(raw.paceWpm), pitch: Number(raw.pitch),
    warmth: Number(raw.warmth), clarity: Number(raw.clarity),
    sampleText: raw.sampleText || undefined, createdAt: raw.createdAt,
  };
}
function dehydrateVoice(v: VoicePersona): Record<string, string> {
  return {
    id: v.id, name: v.name, gender: v.gender, language: v.language,
    accent: v.accent ?? "", paceWpm: String(v.paceWpm), pitch: String(v.pitch),
    warmth: String(v.warmth), clarity: String(v.clarity),
    sampleText: v.sampleText ?? "", createdAt: v.createdAt,
  };
}
function hydrateAvatar(raw: Record<string, string>): AvatarConfig {
  return {
    id: raw.id, name: raw.name, style: raw.style as AvatarConfig["style"],
    accentColor: raw.accentColor, imageUrl: raw.imageUrl || undefined, createdAt: raw.createdAt,
  };
}
function dehydrateAvatar(a: AvatarConfig): Record<string, string> {
  return {
    id: a.id, name: a.name, style: a.style, accentColor: a.accentColor,
    imageUrl: a.imageUrl ?? "", createdAt: a.createdAt,
  };
}
function hydrateDept(raw: Record<string, string>): DepartmentPersonality {
  return {
    id: raw.id, department: raw.department as PersonaDepartment, profileId: raw.profileId,
    voicePersonaId: raw.voicePersonaId || undefined, avatarId: raw.avatarId || undefined,
    inheritedByWorkforces: raw.inheritedByWorkforces ? JSON.parse(raw.inheritedByWorkforces) : [],
    enabled: raw.enabled === "true",
  };
}
function dehydrateDept(d: DepartmentPersonality): Record<string, string> {
  return {
    id: d.id, department: d.department, profileId: d.profileId,
    voicePersonaId: d.voicePersonaId ?? "", avatarId: d.avatarId ?? "",
    inheritedByWorkforces: JSON.stringify(d.inheritedByWorkforces), enabled: String(d.enabled),
  };
}

type LoggerT = any;
export const PersonalityStudioService = {
  logger: null as LoggerT | null,
  init(logger: LoggerT) { this.logger = logger; },

  async listProfiles(_filter?: { kind?: string; enabled?: boolean }): Promise<PersonalityProfile[]> {
    const ids = await redis.zrange(KEYS.profiles, 0, -1);
    const out: PersonalityProfile[] = [];
    for (const id of ids) {
      const raw = await redis.hgetall(`ae:profile:${id}`);
      if (raw?.id) out.push(hydrateProfile(raw));
    }
    return out;
  },
  async getProfile(id: string): Promise<PersonalityProfile | null> {
    const raw = await redis.hgetall(`ae:profile:${id}`);
    return raw?.id ? hydrateProfile(raw) : null;
  },
  async createProfile(p: Omit<PersonalityProfile, "id" | "createdAt"> & { kind?: string; toneDimensions?: string[]; forbiddenPhrases?: string[]; requiredSignoff?: string; languageStyleGuideRef?: string; regionOverrides?: Record<string, Partial<RegionalPersonaOverride>>; departmentScopes?: string[] }): Promise<PersonalityProfile> {
    const id = "prof-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const regionalOverrides: RegionalPersonaOverride[] = [];
    if (p.regionOverrides) {
      for (const [region, o] of Object.entries(p.regionOverrides)) {
        regionalOverrides.push({
          region,
          formality: o.formality != null ? Number(o.formality) / 5 : undefined,
          empathy: o.empathy, humor: undefined, verbosity: o.verbosity,
          assertiveness: undefined,
        });
      }
    }
    const profile: PersonalityProfile = {
      id, name: p.name, description: p.description, tone: p.tone,
      formality: Number(p.formality), empathy: Number(p.empathy),
      humor: Number(p.humor), verbosity: Number(p.verbosity), assertiveness: Number(p.assertiveness),
      brandAlignment: Number(p.brandAlignment ?? 90),
      voicePersonaId: p.voicePersonaId, avatarId: p.avatarId,
      useCases: p.useCases ?? p.departmentScopes ?? [],
      regionalOverrides: p.regionalOverrides.length ? p.regionalOverrides : regionalOverrides,
      createdAt: now,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.profiles, 0, id);
    multi.hset(`ae:profile:${id}`, dehydrateProfile(profile));
    await multi.exec();
    return profile;
  },

  async listVoicePersonas(): Promise<VoicePersona[]> {
    const ids = await redis.zrange(KEYS.voices, 0, -1);
    const out: VoicePersona[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`ae:voice:${id}`); if (raw?.id) out.push(hydrateVoice(raw)); }
    return out;
  },
  async createVoicePersona(v: Omit<VoicePersona, "id" | "createdAt"> & { voiceId?: string; pace?: number; providerTtsVendor?: string }): Promise<VoicePersona> {
    const id = v.voiceId ?? "voice-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const voice: VoicePersona = {
      id, name: v.name, gender: v.gender ?? "neutral", language: v.language ?? "en",
      accent: v.accent, paceWpm: Math.round(150 * (v.pace ?? 1)), pitch: v.pitch ?? 0,
      warmth: v.warmth ?? 0.6, clarity: v.clarity ?? 0.9,
      sampleText: v.sampleText ?? `Hello, I'm ${v.name}.`, createdAt: now,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.voices, 0, id);
    multi.hset(`ae:voice:${id}`, dehydrateVoice(voice));
    await multi.exec();
    return voice;
  },

  async listAvatars(): Promise<AvatarConfig[]> {
    const ids = await redis.zrange(KEYS.avatars, 0, -1);
    const out: AvatarConfig[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`ae:avatar:${id}`); if (raw?.id) out.push(hydrateAvatar(raw)); }
    return out;
  },
  async createAvatar(a: Omit<AvatarConfig, "id" | "createdAt"> & { primaryColor?: string; secondaryColor?: string; shape?: string; emoji?: string }): Promise<AvatarConfig> {
    const id = "av-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const styleIn = a.style as string;
    const style = (styleIn === "brand-mascot" ? "illustrated" : (styleIn === "none" ? "abstract" : styleIn)) as AvatarConfig["style"];
    const avatar: AvatarConfig = {
      id, name: a.name, style, accentColor: a.accentColor ?? a.primaryColor ?? "#3B82F6",
      imageUrl: a.imageUrl, createdAt: now,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.avatars, 0, id);
    multi.hset(`ae:avatar:${id}`, dehydrateAvatar(avatar));
    await multi.exec();
    return avatar;
  },

  async listDepartments(): Promise<DepartmentPersonality[]> {
    const ids = await redis.zrange(KEYS.depts, 0, -1);
    const out: DepartmentPersonality[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`ae:dept:${id}`); if (raw?.id) out.push(hydrateDept(raw)); }
    return out;
  },
  async setDepartment(b: { department: PersonaDepartment; defaultProfileId?: string; profileId?: string; overrideProfileId?: string; regionalDefault?: Record<string, string>; approvedBy?: string; voicePersonaId?: string; avatarId?: string; inheritedByWorkforces?: string[]; enabled?: boolean }): Promise<DepartmentPersonality> {
    const id = "dept-" + b.department;
    const profileId = b.profileId ?? b.defaultProfileId ?? "";
    const existing = await redis.hgetall(`ae:dept:${id}`);
    const prev = existing?.id ? hydrateDept(existing) : null;
    const dept: DepartmentPersonality = {
      id, department: b.department, profileId,
      voicePersonaId: b.voicePersonaId ?? prev?.voicePersonaId,
      avatarId: b.avatarId ?? prev?.avatarId,
      inheritedByWorkforces: b.inheritedByWorkforces ?? prev?.inheritedByWorkforces ?? [],
      enabled: b.enabled ?? true,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.depts, 0, id);
    multi.hset(`ae:dept:${id}`, dehydrateDept(dept));
    await multi.exec();
    return dept;
  },

  async resolvePersonaFor(department: PersonaDepartment, region?: string): Promise<ResolvedPersona | null> {
    const bindings = await this.listDepartments();
    const b = bindings.find((x) => x.department === department && x.enabled);
    if (!b) return null;
    const profiles = await this.listProfiles();
    const profile = profiles.find((p) => p.id === b.profileId);
    if (!profile) return null;
    const voices = await this.listVoicePersonas();
    const avatars = await this.listAvatars();
    const voice = voices.find((v) => v.id === (b.voicePersonaId ?? profile.voicePersonaId)) ?? null;
    const avatar = avatars.find((a) => a.id === (b.avatarId ?? profile.avatarId)) ?? null;
    const override = region ? profile.regionalOverrides.find((r) => r.region === region) : undefined;
    const effective = {
      formality: override?.formality ?? profile.formality,
      empathy: override?.empathy ?? profile.empathy,
      humor: override?.humor ?? profile.humor,
      verbosity: override?.verbosity ?? profile.verbosity,
      assertiveness: override?.assertiveness ?? profile.assertiveness,
    };
    return { department, region: region ?? undefined, profile, voice: voice ?? undefined, avatar: avatar ?? undefined, effectiveTraits: effective };
  },

  async summary() {
    const [profiles, voices, avatars, depts] = await Promise.all([
      this.listProfiles(), this.listVoicePersonas(), this.listAvatars(), this.listDepartments(),
    ]);
    const avgBrand = profiles.length ? Math.round(profiles.reduce((s, p) => s + p.brandAlignment, 0) / profiles.length) : 0;
    return {
      personalityProfiles: profiles.length,
      activePersonas: depts.filter((d) => d.enabled).length,
      voicePersonas: voices.length,
      avatars: avatars.length,
      departmentsCovered: depts.filter((d) => d.enabled).length,
      avgBrandAlignment: avgBrand,
    };
  },
};
