import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", () => ({
  Role: { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" },
}));

const account = await import("./account.service.js");
const { registerUser, loginUser } = await import("./auth.service.js");

const PASSWORD = "CorrectHorseBatteryStaple!9";
let HASH: string;

beforeAll(async () => { HASH = await bcrypt.hash(PASSWORD, 10); });
beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.sets.clear(); kv.hashes.clear(); kv.lists.clear(); kv.zsets.clear();
});

describe("account identity", () => {
  it("assigns a unique six-digit User ID and username on register", async () => {
    const result = await registerUser({
      email: "ada@example.com", password: PASSWORD, displayName: "Ada Lovelace", organizationName: "Analytical",
      username: "ada", pin: "4827",
    });
    expect(result.publicUserId).toMatch(/^\d{6}$/);
    expect(result.username).toBe("ada");
    const user = db.tables.get("User")!.find((u) => u.email === "ada@example.com")!;
    expect(user.publicUserId).toBe(result.publicUserId);
    expect(user.pinHash).toBeTruthy();
    expect(user.pinHash).not.toBe("4827");
    expect(JSON.stringify(user)).not.toContain("4827");
  });

  it("allows login with email, username, or six-digit User ID", async () => {
    const created = await registerUser({
      email: "neo@example.com", password: PASSWORD, displayName: "Neo", organizationName: "Zion",
      username: "the-one",
    });
    const byEmail: any = await loginUser({ identifier: "neo@example.com", password: PASSWORD });
    const byName: any = await loginUser({ identifier: "the-one", password: PASSWORD });
    const byId: any = await loginUser({ identifier: created.publicUserId!, password: PASSWORD });
    expect(byEmail.token).toBeTruthy();
    expect(byName.user.username).toBe("the-one");
    expect(byId.user.publicUserId).toBe(created.publicUserId);
    expect(JSON.stringify(byId)).not.toContain("pinHash");
    expect(JSON.stringify(byId)).not.toContain("1111");
  });

  it("rejects a taken username and keeps the User ID unchanged", async () => {
    await registerUser({ email: "a@example.com", password: PASSWORD, displayName: "A", organizationName: "One", username: "taken" });
    const b = await registerUser({ email: "b@example.com", password: PASSWORD, displayName: "B", organizationName: "Two", username: "bravo" });
    await expect(account.changeUsername(b.userId, "taken")).rejects.toMatchObject({ code: "CONFLICT" });
    const snap = await account.getAccount(b.userId);
    expect(snap.username).toBe("bravo");
    expect(snap.publicUserId).toBe(b.publicUserId);
  });

  it("expires PINs using server time and never returns the PIN", async () => {
    const created = await registerUser({
      email: "pin@example.com", password: PASSWORD, displayName: "P", organizationName: "Org", pin: "1111",
    });
    const row = db.tables.get("User")!.find((u) => u.id === created.userId)!;
    row.pinExpiresAt = new Date(Date.now() - 1000);
    const snap = await account.getAccount(created.userId);
    expect(snap.pinExpired).toBe(true);
    expect(snap.pinSet).toBe(true);
    expect(JSON.stringify(snap)).not.toContain("1111");
    const next = await account.setPin(created.userId, { newPin: "9999", confirmPin: "9999" });
    expect(next.pinExpired).toBe(false);
    expect(next.pinSet).toBe(true);
  });

  it("requires the current password to change password", async () => {
    const created = await registerUser({ email: "pw@example.com", password: PASSWORD, displayName: "P", organizationName: "Org" });
    await expect(account.changePassword(created.userId, "WrongPass!234", "NewStrongPass!234", "NewStrongPass!234"))
      .rejects.toThrow("Current password is incorrect");
    await expect(account.changePassword(created.userId, PASSWORD, "NewStrongPass!234", "NewStrongPass!234"))
      .resolves.toEqual({ ok: true });
  });
});
