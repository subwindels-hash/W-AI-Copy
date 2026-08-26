/**
 * Consensus cancelProposal authorization.
 *
 * cancelProposal() documented "by proposer or admin" but the admin branch was a
 * `// TODO: Check if canceller is org admin` that always threw. It now performs
 * a real role check: the proposer, an ADMIN of the proposal's organization, or
 * any SUPER_ADMIN may cancel; everyone else is refused. Uses FakeKv for Redis
 * and FakePrisma for the user role lookup, so it runs green with no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../http/routes/events.js", () => ({ pushEvent: vi.fn() }));

const { createProposal, cancelProposal, getProposal } = await import("./consensus.service.js");

const ORG = "org-a";

async function newProposal(proposerId = "user-proposer") {
  return createProposal(ORG, proposerId, { title: "Ship it", description: "Deploy release", quorum: 3 } as any);
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
});

describe("cancelProposal authorization", () => {
  it("lets the proposer cancel their own open proposal", async () => {
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "user-proposer")).resolves.toBe(true);
    expect((await getProposal(p.id))?.status).toBe("cancelled");
  });

  it("lets an ADMIN of the same organization cancel", async () => {
    await db.client().user.create({ data: { id: "admin-1", email: "a@x.test", role: "ADMIN", organizationId: ORG } });
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "admin-1")).resolves.toBe(true);
    expect((await getProposal(p.id))?.status).toBe("cancelled");
  });

  it("lets a SUPER_ADMIN cancel across organizations", async () => {
    await db.client().user.create({ data: { id: "root-1", email: "r@x.test", role: "SUPER_ADMIN", organizationId: "org-other" } });
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "root-1")).resolves.toBe(true);
  });

  it("refuses an ADMIN from a different organization", async () => {
    await db.client().user.create({ data: { id: "admin-2", email: "a2@x.test", role: "ADMIN", organizationId: "org-other" } });
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "admin-2")).rejects.toMatchObject({ status: 403 });
    expect((await getProposal(p.id))?.status).toBe("open");
  });

  it("refuses a non-admin who is not the proposer", async () => {
    await db.client().user.create({ data: { id: "member-1", email: "m@x.test", role: "USER", organizationId: ORG } });
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "member-1")).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an unknown canceller", async () => {
    const p = await newProposal("user-proposer");
    await expect(cancelProposal(p.id, "ghost")).rejects.toMatchObject({ status: 403 });
  });
});
