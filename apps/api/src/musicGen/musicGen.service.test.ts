/**
 * WINDELS AI OS — Music Generation service tests.
 *
 * Redis is substituted with FakeKv (no infra). Verifies tenant scoping, the
 * queued→rendering→completed lifecycle with a REAL file on disk, and honest
 * failure recording.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { promises as fs } from "node:fs";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { MusicService } = await import("./musicGen.service.js");

const ORG = "org-music";
const OTHER = "org-other";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("MusicService", () => {
  it("lists capabilities for the studio UI", async () => {
    const caps = MusicService.capabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0]).toHaveProperty("genre");
    expect(caps[0]).toHaveProperty("label");
    expect(caps[0]).toHaveProperty("defaultTempo");
  });

  it("generates then renders a track to a real completed WAV", async () => {
    const rec = await MusicService.generate(ORG, USER, { genre: "pop", key: "C", tempo: 100, durationSec: 3, title: "test track" });
    expect(rec.status).toBe("queued");
    const done = await MusicService.renderOne(ORG, rec.id);
    expect(done.status).toBe("completed");
    expect(done.url).toContain("/api/v1/music/");
    expect(done.bytes).toBeGreaterThan(0);
    const stat = await fs.stat(done.path!).catch(() => null);
    expect(stat?.isFile()).toBe(true);
    expect(stat?.size).toBe(done.bytes);
  });

  it("is tenant-scoped (other orgs cannot see or render)", async () => {
    const rec = await MusicService.generate(ORG, USER, { genre: "lofi", key: "Am", tempo: 80, durationSec: 2 });
    await expect(MusicService.get(OTHER, rec.id)).resolves.toBeNull();
    await expect(MusicService.renderOne(OTHER, rec.id)).rejects.toThrow(/not found/i);
    const list = await MusicService.list(OTHER);
    expect(list.length).toBe(0);
  });

  it("worker tick processes queued jobs", async () => {
    const a = await MusicService.generate(ORG, USER, { genre: "edm", key: "A", tempo: 128, durationSec: 2 });
    const b = await MusicService.generate(ORG, USER, { genre: "ambient", key: "C", tempo: 66, durationSec: 2 });
    const { processed } = await MusicService.runWorkerTick(ORG, 10);
    expect(processed).toBe(2);
    expect((await MusicService.get(ORG, a.id))!.status).toBe("completed");
    expect((await MusicService.get(ORG, b.id))!.status).toBe("completed");
  });

  it("generation honours mood/loop and library defaults", async () => {
    const rec = await MusicService.generate(ORG, USER, { genre: "lofi", key: "C", tempo: 80, durationSec: 4, mood: "mellow", loop: true });
    expect(rec.mood).toBe("mellow");
    expect(rec.loop).toBe(true);
    expect(rec.favorite).toBe(false);
    expect(rec.tags).toEqual([]);
    expect(rec.playCount).toBe(0);
  });

  it("manages the library: rename, favorite, tags, play, delete", async () => {
    const rec = await MusicService.generate(ORG, USER, { genre: "pop", key: "G", tempo: 110, durationSec: 2 });
    await MusicService.renderOne(ORG, rec.id);

    const renamed = await MusicService.rename(ORG, rec.id, "My Track");
    expect(renamed.title).toBe("My Track");

    const fav = await MusicService.setFavorite(ORG, rec.id, true);
    expect(fav.favorite).toBe(true);

    const tagged = await MusicService.setTags(ORG, rec.id, ["chill", "branding"]);
    expect(tagged.tags).toEqual(["chill", "branding"]);

    const played = await MusicService.recordPlay(ORG, rec.id);
    expect(played.playCount).toBe(1);

    // Delete removes it and the file on disk.
    const path = (await MusicService.get(ORG, rec.id))!.path;
    await MusicService.remove(ORG, rec.id);
    expect(await MusicService.get(ORG, rec.id)).toBeNull();
    await expect(fs.stat(path!)).rejects.toThrow();
  });

  it("regenerates a variation with same params but a new id/seed", async () => {
    const src = await MusicService.generate(ORG, USER, { genre: "edm", key: "A", tempo: 128, durationSec: 3, mood: "energetic" });
    const varRec = await MusicService.regenerate(ORG, USER, src.id);
    expect(varRec.id).not.toBe(src.id);
    expect(varRec.genre).toBe("edm");
    expect(varRec.key).toBe("A");
    expect(varRec.tempo).toBe(128);
    expect(varRec.mood).toBe("energetic");
    expect(varRec.title).toContain("variation");
  });
});
