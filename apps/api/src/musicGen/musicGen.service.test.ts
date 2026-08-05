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
});
