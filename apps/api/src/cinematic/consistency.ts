/**
 * WINDELS Character & Scene Consistency engines (§7–9, §14–15, §26).
 *
 * - Character profiles are reusable references with an internal identity key
 *   (a hash of their face/body references) used to lock identity across shots.
 *   Biometric raw data is never permanently retained — only references + key.
 * - Scene continuity records the set of locked elements (characters, wardrobe,
 *   props, environment, lighting, palette) that must persist between shots
 *   unless the user intentionally changes them. Shots inherit these locks.
 * - The realism engine emits structured negative prompts targeting common
 *   artifacts (extra fingers, face drift, etc.) so the quality agent can
 *   auto-regenerate affected shots.
 */
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CharacterProfile, CinematicReference, ReferenceStrength } from "@windels/shared";
import { logger } from "../config/logger.js";

const K = {
  characters: (oid: string) => `cin:${oid}:characters`,
  character: (id: string) => `cin:char:${id}`,
};
const s2 = (o: unknown) => JSON.stringify(o);

function identityKey(refs: CinematicReference[]): string {
  const face = refs.filter((r) => r.role === "face" || r.role === "character").map((r) => r.assetId).sort().join("|");
  return createHash("sha256").update(face || refs.map((r) => r.assetId).join("|")).digest("hex").slice(0, 24);
}

export const CharacterService = {
  async create(oid: string, userId: string, input: {
    name: string; description?: string; ageRange?: string; voiceId?: string; style?: string;
    clothing?: string; attributes?: Record<string, string>; references: CinematicReference[];
  }): Promise<CharacterProfile> {
    const now = new Date().toISOString();
    const c: CharacterProfile = {
      id: "chr-" + randomUUID().slice(0, 10), organizationId: oid, userId,
      name: input.name, description: input.description, ageRange: input.ageRange,
      voiceId: input.voiceId, style: input.style, clothing: input.clothing,
      attributes: input.attributes ?? {}, references: input.references,
      identityKey: identityKey(input.references), createdAt: now, updatedAt: now,
    };
    await redis.hset(K.character(c.id), "_doc", s2(c), "orgId", oid);
    await redis.zadd(K.characters(oid), Date.now(), c.id);
    return c;
  },

  async get(oid: string, id: string): Promise<CharacterProfile | null> {
    const raw = await redis.hget(K.character(id), "_doc");
    if (!raw) return null;
    const c = JSON.parse(raw) as CharacterProfile;
    return c.organizationId === oid ? c : null;
  },

  async list(oid: string): Promise<CharacterProfile[]> {
    const ids = await redis.zrange(K.characters(oid), 0, -1, "REV");
    const out: CharacterProfile[] = [];
    for (const id of ids) { const c = await this.get(oid, id); if (c) out.push(c); }
    return out;
  },

  async remove(oid: string, id: string): Promise<boolean> {
    const c = await this.get(oid, id);
    if (!c) return false;
    await redis.zrem(K.characters(oid), id);
    await redis.del(K.character(id));
    return true;
  },

  /**
   * Lock identity for a generation request: returns the references and the
   * identity key so the provider can keep the character consistent. The key is
   * derived only from asset references; no biometric data is stored.
   */
  lock(characters: CharacterProfile[]): { identityKey?: string; references: CinematicReference[] } {
    if (!characters.length) return { references: [] };
    return {
      identityKey: characters.map((c) => c.identityKey).filter(Boolean).join(","),
      references: characters.flatMap((c) => c.references.map((r) => ({ ...r, label: `${c.name}: ${r.label ?? r.role}`, lockKey: c.identityKey }))),
    };
  },
};

export interface SceneLock {
  characterIds: string[];
  wardrobe: Record<string, string>;
  props: string[];
  environment?: string;
  lighting?: string;
  palette: string[];
}

/**
 * Inherit continuity from shot n-1 to shot n. The director uses this so a red
 * car, a character's jacket, or a room's lighting do not drift between shots
 * unless the user changes them intentionally.
 */
export function inheritContinuity(previous: SceneLock | undefined, next: Partial<SceneLock>): SceneLock {
  if (!previous) return { characterIds: next.characterIds ?? [], wardrobe: next.wardrobe ?? {}, props: next.props ?? [], environment: next.environment, lighting: next.lighting, palette: next.palette ?? [] };
  return {
    characterIds: next.characterIds ?? previous.characterIds,
    wardrobe: { ...previous.wardrobe, ...(next.wardrobe ?? {}) },
    props: next.props ?? previous.props,
    environment: next.environment ?? previous.environment,
    lighting: next.lighting ?? previous.lighting,
    palette: next.palette?.length ? next.palette : previous.palette,
  };
}

const ARTIFACT_NEGATIVES = [
  "extra fingers", "fused fingers", "deformed hands", "mutated hands",
  "face distortion", "asymmetric face", "face drift", "identity change",
  "clothing instability", "body deformation", "flicker", "frame jump",
  "object duplication", "broken physics", "floating objects",
  "incorrect shadows", "bad anatomy", "extra limbs", "watermark", "text",
];

export const RealismEngine = {
  /** Negative prompt optimized for photoreal cinematic output (§14, §67). */
  negativePrompt(userNegative?: string, style?: string): string {
    const base = [...ARTIFACT_NEGATIVES];
    if (style === "photorealistic" || style === "cinematic" || style === "commercial") {
      base.push("cartoon", "anime", "3d render", "cgi look", "plastic skin", "uncanny valley");
    }
    if (userNegative) base.push(userNegative);
    return [...new Set(base)].join(", ");
  },
  /** Heuristic artifact score from a generation metadata/quality signal. */
  scoreArtifactSignals(signals: { flicker?: number; faceDrift?: number; handDefects?: number; audioDrift?: number }): number {
    // 1.0 is perfect; each detected defect reduces the score.
    let score = 1;
    if (signals.flicker) score -= Math.min(0.3, signals.flicker);
    if (signals.faceDrift) score -= Math.min(0.4, signals.faceDrift);
    if (signals.handDefects) score -= Math.min(0.2, signals.handDefects);
    if (signals.audioDrift) score -= Math.min(0.2, signals.audioDrift);
    return Math.max(0, Math.round(score * 100) / 100);
  },
};

void logger;
