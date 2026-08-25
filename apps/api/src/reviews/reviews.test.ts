/**
 * WINDELS AI OS — Platform Reviews (completion).
 *
 * Pins the honesty contract:
 *   - a fresh platform shows ZERO reviews and a 0.0 average
 *   - the average/distribution are computed from persisted reviews on read
 *   - one review per user (upsert), never fabricated
 *   - moderation: hidden reviews are excluded from the public dashboard
 *
 * Redis is substituted with the repo's FakeKv.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { ReviewsService } = await import("./reviews.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

const USER_A = "user-a";
const USER_B = "user-b";

const reviewInput = (rating: number, content = "Solid platform for our ops.") => ({ rating: rating as 1 | 2 | 3 | 4 | 5, title: "Great", content });

describe("a fresh platform invents nothing", () => {
  it("reports zero reviews and a zero average", async () => {
    const d = await ReviewsService.dashboard();
    expect(d.totalPublished).toBe(0);
    expect(d.totalAll).toBe(0);
    expect(d.averageRating).toBe(0);
    expect(d.reviews).toEqual([]);
    expect(d.distribution).toEqual({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
  });
});

describe("writing a review", () => {
  it("creates a published review for a user", async () => {
    const r = await ReviewsService.upsert(USER_A, "Alice", reviewInput(5));
    expect(r.rating).toBe(5);
    expect(r.status).toBe("published");
    expect(r.userId).toBe(USER_A);
    expect(r.userName).toBe("Alice");

    const d = await ReviewsService.dashboard();
    expect(d.totalPublished).toBe(1);
    expect(d.averageRating).toBe(5);
    expect(d.distribution["5"]).toBe(1);
  });

  it("upserts — a user keeps one review, updating in place", async () => {
    await ReviewsService.upsert(USER_A, "Alice", reviewInput(3));
    const updated = await ReviewsService.upsert(USER_A, "Alice", reviewInput(4, "Even better after the update."));
    const mine = await ReviewsService.getByUser(USER_A);
    expect(mine!.rating).toBe(4);
    expect(mine!.content).toMatch(/Even better/);
    expect(updated.id).toBe(mine!.id);

    const d = await ReviewsService.dashboard();
    expect(d.totalPublished).toBe(1);
    expect(d.averageRating).toBe(4);
  });

  it("computes the average across multiple reviewers", async () => {
    await ReviewsService.upsert(USER_A, "Alice", reviewInput(5));
    await ReviewsService.upsert(USER_B, "Bob", reviewInput(3));
    const d = await ReviewsService.dashboard();
    expect(d.totalPublished).toBe(2);
    expect(d.averageRating).toBe(4);
    expect(d.distribution["5"]).toBe(1);
    expect(d.distribution["3"]).toBe(1);
  });

  it("deletes a user's review", async () => {
    await ReviewsService.upsert(USER_A, "Alice", reviewInput(5));
    expect(await ReviewsService.delete(USER_A)).toBe(true);
    expect(await ReviewsService.getByUser(USER_A)).toBeNull();
    expect((await ReviewsService.dashboard()).totalPublished).toBe(0);
    expect(await ReviewsService.delete(USER_A)).toBe(false);
  });
});

describe("moderation", () => {
  it("hides a review from the public dashboard but keeps it in the admin list", async () => {
    const r = await ReviewsService.upsert(USER_A, "Alice", reviewInput(5));
    const hidden = await ReviewsService.setStatus(r.id, "hidden");
    expect(hidden!.status).toBe("hidden");

    const pub = await ReviewsService.dashboard();
    expect(pub.totalPublished).toBe(0);
    expect(pub.averageRating).toBe(0);
    expect(pub.totalAll).toBe(1);

    const all = await ReviewsService.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("hidden");
  });
});
