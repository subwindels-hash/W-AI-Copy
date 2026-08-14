/**
 * Session 162 — Voice Studio completion.
 *
 * The headline defect these tests pin: before S162 every store in this module
 * was global. A cloned voice is biometric data gated by a consent record, and
 * `listPresets()` / `listJobs()` took no scope at all — every tenant could read
 * every other tenant's voices, presets and TTS history.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});
// The kernel dispatch is best-effort; keep it out of these tests.
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: async () => undefined } }));

const { VoiceStudioService } = await import("./voiceStudio.service.js");

const ORG_A = "org-vs-a";
const ORG_B = "org-vs-b";

const cloneInput = (org: string, owner = "user-1", name = "Voice") => ({
  organizationId: org, ownerId: owner, name,
  gender: "feminine" as const, age: "adult" as const, language: "en",
  method: "fast-clone" as const, consentGranted: true, consentRecordedBy: owner,
});

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Voice Studio — Session 162 tenant isolation", () => {
  it("a cloned voice is NOT visible to another organization", async () => {
    const cv = await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-1", "Alice Clone"));
    expect(cv.organizationId).toBe(ORG_A);

    expect(await VoiceStudioService.listCustom(ORG_A)).toHaveLength(1);
    // The breach: this used to return every cloned voice in the deployment.
    expect(await VoiceStudioService.listCustom(ORG_B)).toEqual([]);
  });

  it("presets are org-scoped (listPresets took no scope at all before)", async () => {
    const cv = await VoiceStudioService.cloneVoice(cloneInput(ORG_A));
    await VoiceStudioService.createPreset(ORG_A, { voiceId: cv.id, name: "Warm", settings: { warmth: 0.9 } });

    expect(await VoiceStudioService.listPresets(ORG_A)).toHaveLength(1);
    expect(await VoiceStudioService.listPresets(ORG_B)).toEqual([]);
  });

  it("TTS job history is org-scoped (listJobs took no scope at all before)", async () => {
    await VoiceStudioService.synthesize(ORG_A, { voiceId: "bv-adult-female", text: "hello" });
    expect((await VoiceStudioService.listJobs(ORG_A)).length).toBe(1);
    expect(await VoiceStudioService.listJobs(ORG_B)).toEqual([]);
  });

  it("another org cannot read or mutate a voice it does not own", async () => {
    const cv = await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-1"));
    expect(await VoiceStudioService.getCustom(ORG_B, cv.id)).toBeNull();
    // Tenancy is checked before ownership.
    expect(await VoiceStudioService.updateSettings(ORG_B, cv.id, { pitch: 5 }, "user-1")).toBeNull();
  });

  it("ownership is still enforced inside an organization", async () => {
    const cv = await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-1"));
    expect(await VoiceStudioService.updateSettings(ORG_A, cv.id, { pitch: 5 }, "user-2")).toBeNull();
    const ok = await VoiceStudioService.updateSettings(ORG_A, cv.id, { pitch: 5 }, "user-1");
    expect(ok!.settings.pitch).toBe(5);
  });

  it("mine-filter narrows to one user without leaking the org set", async () => {
    await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-1", "A"));
    await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-2", "B"));
    expect(await VoiceStudioService.listCustom(ORG_A)).toHaveLength(2);
    expect(await VoiceStudioService.listCustom(ORG_A, "user-1")).toHaveLength(1);
  });

  it("every tenant-scoped call rejects a missing organization", async () => {
    await expect(VoiceStudioService.listCustom("" as any)).rejects.toThrow(/organization/i);
    await expect(VoiceStudioService.listPresets("" as any)).rejects.toThrow(/organization/i);
    await expect(VoiceStudioService.listJobs("" as any)).rejects.toThrow(/organization/i);
    await expect(VoiceStudioService.summary("" as any)).rejects.toThrow(/organization/i);
  });

  it("consent violations are counted per organization, not globally", async () => {
    await expect(VoiceStudioService.cloneVoice({ ...cloneInput(ORG_A), consentGranted: false }))
      .rejects.toThrow(/consent/i);

    expect((await VoiceStudioService.summary(ORG_A)).consentViolations).toBe(1);
    // The counter meant to surface misuse used to be shared across tenants.
    expect((await VoiceStudioService.summary(ORG_B)).consentViolations).toBe(0);
  });
});

describe("Voice Studio — Session 162 honest metrics", () => {
  it("latency is null until something is measured, never a hardcoded 180", async () => {
    const d = await VoiceStudioService.summary(ORG_A);
    expect(d.avgSynthLatencyMs).toBeNull();
  });

  it("languages is a real distinct count, not 19 + n", async () => {
    const builtin = await VoiceStudioService.listBuiltIn();
    const expected = new Set(builtin.map((b) => b.language)).size;

    const d = await VoiceStudioService.summary(ORG_A);
    expect(d.languages).toBe(expected);

    // A custom voice in a language already covered must not inflate the count.
    await VoiceStudioService.cloneVoice(cloneInput(ORG_A));
    expect((await VoiceStudioService.summary(ORG_A)).languages).toBe(expected);
  });

  it("a genuinely new language increments the count by exactly one", async () => {
    const before = (await VoiceStudioService.summary(ORG_A)).languages;
    await VoiceStudioService.cloneVoice({ ...cloneInput(ORG_A), language: "xx-not-a-builtin" });
    expect((await VoiceStudioService.summary(ORG_A)).languages).toBe(before + 1);
  });

  it("emotions is the canonical list length, not a literal", async () => {
    const { VS_EMOTIONS } = await import("@windels/shared");
    const d = await VoiceStudioService.summary(ORG_A);
    expect(d.emotions).toBe(VS_EMOTIONS.length);
  });

  it("ttsJobs24h is a real window and total is reported separately", async () => {
    await VoiceStudioService.synthesize(ORG_A, { voiceId: "bv-x", text: "one" });
    let d = await VoiceStudioService.summary(ORG_A);
    expect(d.ttsJobs24h).toBe(1);
    expect(d.ttsJobsTotal).toBe(1);

    // Age one job past the window — a monotonic counter could never do this.
    const ids = await kv.zrange(`vs:jobs:${ORG_A}`, 0, -1);
    const h = kv.hashes.get(`vs:job:${ORG_A}:${ids[0]}`)!;
    const doc = JSON.parse(h["_doc"]!);
    doc.requestedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    h["_doc"] = JSON.stringify(doc);

    d = await VoiceStudioService.summary(ORG_A);
    expect(d.ttsJobs24h).toBe(0);
    expect(d.ttsJobsTotal).toBe(1);
  });

  it("cloning invents no training epochs", async () => {
    const cv = await VoiceStudioService.cloneVoice({ ...cloneInput(ORG_A), method: "hf-clone" });
    // Used to be `method === "hf-clone" ? 12 : 3` for a process that trains nothing.
    expect(cv.trainedEpochs).toBeNull();
  });

  it("a clone records who granted consent and when", async () => {
    const cv = await VoiceStudioService.cloneVoice(cloneInput(ORG_A, "user-7"));
    expect(cv.consent).toBe("consent-recorded");
    expect(cv.consentRecordedAt).toBeTruthy();
    expect(cv.consentRecordedBy).toBe("user-7");
    expect(cv.visibility).toBe("private");
  });

  it("dashboard reports provenance for its figures", async () => {
    const d = await VoiceStudioService.summary(ORG_A);
    expect(d.provenance.latency).toMatch(/no synthesis has been measured/i);
    expect(d.provenance.jobs).toMatch(/rolling window/i);
  });
});

describe("Voice Studio — Session 162 reads and migration", () => {
  it("the built-in catalogue is served without seeding Redis", async () => {
    const voices = await VoiceStudioService.listBuiltIn();
    expect(voices.length).toBeGreaterThan(40);
    expect(voices.every((v) => v.id.startsWith("bv-"))).toBe(true);
    // A read must not write. Nothing should exist in the kv store yet.
    expect(kv.zsets.size).toBe(0);
    expect(kv.hashes.size).toBe(0);
  });

  it("built-in ids and genders are stable across calls", async () => {
    const a = await VoiceStudioService.listBuiltIn();
    const b = await VoiceStudioService.listBuiltIn();
    expect(a.map((v) => `${v.id}:${v.gender}`)).toEqual(b.map((v) => `${v.id}:${v.gender}`));
  });

  it("summary does not seed on read", async () => {
    await VoiceStudioService.summary(ORG_A);
    expect(await VoiceStudioService.listCustom(ORG_A)).toEqual([]);
    expect(await VoiceStudioService.listPresets(ORG_A)).toEqual([]);
  });

  it("legacy global records are adopted into the org and flagged", async () => {
    // Simulate a pre-S162 deployment: a voice in the old global store.
    const legacy = {
      id: "cv-legacy1", name: "Legacy Voice", ownerId: "admin",
      gender: "feminine", age: "adult", language: "en", languagesSpoken: ["en"],
      consent: "consent-recorded", visibility: "private",
      settings: {}, emotions: [], createdAt: "2026-01-01T00:00:00.000Z",
    };
    await kv.zadd("vs:custom", 0, "cv-legacy1");
    await kv.hset("vs:cv:cv-legacy1", "_doc", JSON.stringify(legacy));

    await VoiceStudioService.ensureBootstrapped(undefined, ORG_A);

    const adopted = await VoiceStudioService.listCustom(ORG_A);
    expect(adopted).toHaveLength(1);
    expect(adopted[0]!.organizationId).toBe(ORG_A);
    expect(adopted[0]!.migratedFrom).toBe("global");
    // No timestamp was invented for the adopted record.
    expect(adopted[0]!.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("migration runs once, not on every boot", async () => {
    await kv.zadd("vs:custom", 0, "cv-legacy1");
    await kv.hset("vs:cv:cv-legacy1", "_doc", JSON.stringify({
      id: "cv-legacy1", name: "L", ownerId: "a", gender: "feminine", age: "adult",
      language: "en", languagesSpoken: ["en"], consent: "none", visibility: "private",
      settings: {}, emotions: [], createdAt: "2026-01-01T00:00:00.000Z",
    }));
    await VoiceStudioService.ensureBootstrapped(undefined, ORG_A);
    await VoiceStudioService.ensureBootstrapped(undefined, ORG_A);
    expect(await VoiceStudioService.listCustom(ORG_A)).toHaveLength(1);
  });
});
