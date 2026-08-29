/**
 * Mobile authentication — device registration, PIN fallback, WebAuthn challenges.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `mobileAuth.service.ts` handles second-factor and device-trust decisions on
 * mobile, and the module inventory reported `tests=0`. Writing coverage for it
 * surfaced two real defects, both pinned below as regression tests:
 *
 *  1. **The PIN hash shared a column with client-supplied data.** `setPin()`
 *     stored its bcrypt hash in `MobileDevice.deviceModel`, and
 *     `registerDevice()` writes that same column straight from the request body
 *     (`deviceModel: z.string().max(64)`). A bcrypt hash is exactly 60
 *     characters, so it fits — meaning a caller could overwrite another
 *     device's PIN hash, or plant a hash of a PIN they chose. Fixed by moving
 *     the secret to its own `pinHash` column that no request body can address.
 *
 *  2. **Biometric assertions were never cryptographically verified.**
 *     `verifyAuthAssertion()` checked structure and the RP-ID hash, then
 *     returned `{ ok: true }` without validating the signature — so possession
 *     of the private key was never proven. The endpoint sits behind JWT auth so
 *     this is not a login bypass, but it made the biometric factor decorative.
 *     Now verified with the stored public key.
 *
 * Prisma is substituted with FakePrisma; bcrypt and WebAuthn crypto run for
 * real, so the assertions below exercise genuine verification paths.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const mobileAuth = await import("./mobileAuth.service.js");

const USER = "user-1";
const OTHER_USER = "user-2";
const RP_ID = "windels.ai";

function seedDevice(id: string, userId = USER, extra: Record<string, unknown> = {}) {
  db.seed("MobileDevice", [{
    id, userId, platform: "ios", deviceName: "iPhone", biometricEnabled: false,
    lastSeenAt: new Date(1), createdAt: new Date(1), ...extra,
  }]);
}

beforeEach(() => {
  db.reset();
});

describe("PIN storage is not addressable by client input", () => {
  it("does not persist the PIN hash in deviceModel", async () => {
    seedDevice("dev-1");
    await mobileAuth.setPin(USER, "dev-1", "4821");

    const row = (db.tables.get("MobileDevice") ?? []).find((d: any) => d.id === "dev-1")!;
    // deviceModel is client-writable via POST /mobile/devices/register, so a
    // secret must never live there. (It is unset here; the point is that
    // setPin did not put a bcrypt hash into it.)
    expect(row.deviceModel ?? "").not.toMatch(/^\$2[aby]\$/);
    expect(row.pinHash).toMatch(/^\$2[aby]\$/);
  });

  it("survives a device re-registration that sets deviceModel", async () => {
    seedDevice("dev-1");
    await mobileAuth.setPin(USER, "dev-1", "4821");

    // Exactly what an attacker (or an ordinary client) can send: a 60-char
    // bcrypt hash of a PIN they know, inside the 64-char schema limit.
    const plantedHash = "$2a$10$znTPw7t1i6Fa/cfwgY/UTuAiopkK9iGvzTwsyhgWJFepATQx79vVy";
    expect(plantedHash).toHaveLength(60);
    await mobileAuth.registerDevice(
      USER,
      { deviceId: "dev-1", platform: "ios", deviceModel: plantedHash },
      {},
    );

    // The real PIN must still be the only one that works.
    await expect(mobileAuth.verifyPin(USER, "dev-1", "4821")).resolves.toEqual({ ok: true });
    await expect(mobileAuth.verifyPin(USER, "dev-1", "1234")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a wrong PIN", async () => {
    seedDevice("dev-1");
    await mobileAuth.setPin(USER, "dev-1", "4821");
    await expect(mobileAuth.verifyPin(USER, "dev-1", "0000")).rejects.toMatchObject({ status: 401 });
  });

  it("refuses to verify a PIN for another user's device", async () => {
    seedDevice("dev-1", USER);
    await mobileAuth.setPin(USER, "dev-1", "4821");
    await expect(
      mobileAuth.verifyPin(OTHER_USER, "dev-1", "4821"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("reports no PIN set rather than passing", async () => {
    seedDevice("dev-1");
    await expect(mobileAuth.verifyPin(USER, "dev-1", "4821")).rejects.toMatchObject({ status: 401 });
  });

  it.each(["123", "123456789", "abcd", "12a4", "", "12 34"])(
    "rejects %j as a PIN",
    async (bad) => {
      seedDevice("dev-1");
      await expect(mobileAuth.setPin(USER, "dev-1", bad)).rejects.toMatchObject({ status: 400 });
    },
  );

  it("never stores the PIN in plaintext", async () => {
    seedDevice("dev-1");
    await mobileAuth.setPin(USER, "dev-1", "4821");
    const row = (db.tables.get("MobileDevice") ?? []).find((d: any) => d.id === "dev-1")!;
    expect(JSON.stringify(row)).not.toContain("4821");
  });
});

describe("WebAuthn challenges", () => {
  it("issues a fresh registration challenge with platform-authenticator options", () => {
    const opts = mobileAuth.getRegisterChallenge(USER, RP_ID, "WINDELS", "person@windels.ai");
    expect(opts.challenge).toMatch(/^[\w-]+$/);
    expect(opts.rp.id).toBe(RP_ID);
    expect(opts.authenticatorSelection.userVerification).toBe("required");
    // ES256 + RS256 must both be offered or iOS/Android platform keys fail.
    expect(opts.pubKeyCredParams.map((p) => p.alg).sort()).toEqual([-257, -7]);
  });

  it("issues a distinct challenge each time", () => {
    const a = mobileAuth.getRegisterChallenge(USER, RP_ID, "W", "p");
    const b = mobileAuth.getRegisterChallenge(USER, RP_ID, "W", "p");
    expect(a.challenge).not.toBe(b.challenge);
  });

  it("requires user verification on the auth challenge", () => {
    const opts = mobileAuth.getAuthChallenge(USER, RP_ID);
    expect(opts.userVerification).toBe("required");
    expect(opts.rpId).toBe(RP_ID);
  });
});

describe("biometric assertion verification", () => {
  /**
   * Build a real ES256 credential and a correctly signed assertion, so the
   * negative cases below fail on genuine signature checks rather than on a
   * stub that was told to return false.
   */
  function makeCredential() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    return { publicKey, privateKey };
  }

  function buildAuthenticatorData(rpId: string, signCount = 1) {
    const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
    const flags = Buffer.from([0x05]); // UP | UV
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(signCount, 0);
    return Buffer.concat([rpIdHash, flags, counter]);
  }

  function signAssertion(privateKey: crypto.KeyObject, authData: Buffer, clientDataJSON: Buffer) {
    const clientDataHash = crypto.createHash("sha256").update(clientDataJSON).digest();
    const signer = crypto.createSign("SHA256");
    signer.update(Buffer.concat([authData, clientDataHash]));
    return signer.sign(privateKey);
  }

  function seedCredential(publicKey: crypto.KeyObject, userId = USER) {
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    db.seed("BiometricCredential", [{
      id: "bio-1", userId, deviceId: "dev-1", credentialId: "cred-1",
      publicKey: spki.toString("base64url"), counter: 0, transports: "internal",
      createdAt: new Date(1),
    }]);
  }

  function assertionFor(privateKey: crypto.KeyObject, challenge: string, rpId = RP_ID) {
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: "webauthn.get", challenge, origin: `https://${rpId}`,
    }));
    const authData = buildAuthenticatorData(rpId);
    const signature = signAssertion(privateKey, authData, clientDataJSON);
    return {
      id: "cred-1", rawId: "cred-1",
      response: {
        clientDataJSON: clientDataJSON.toString("base64url"),
        authenticatorData: authData.toString("base64url"),
        signature: signature.toString("base64url"),
      },
    };
  }

  it("accepts an assertion signed by the registered key", async () => {
    const { publicKey, privateKey } = makeCredential();
    seedDevice("dev-1");
    seedCredential(publicKey);

    const { challenge } = mobileAuth.getAuthChallenge(USER, RP_ID);
    const res = await mobileAuth.verifyAuthAssertion(USER, RP_ID, assertionFor(privateKey, challenge));
    expect(res.ok).toBe(true);
  });

  it("rejects an assertion signed by a different key", async () => {
    const registered = makeCredential();
    const attacker = makeCredential();
    seedDevice("dev-1");
    seedCredential(registered.publicKey);

    const { challenge } = mobileAuth.getAuthChallenge(USER, RP_ID);
    // Structurally perfect, correct challenge and RP — only the key is wrong.
    // Before the fix this returned { ok: true }.
    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, assertionFor(attacker.privateKey, challenge)),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a replayed challenge", async () => {
    const { publicKey, privateKey } = makeCredential();
    seedDevice("dev-1");
    seedCredential(publicKey);

    const { challenge } = mobileAuth.getAuthChallenge(USER, RP_ID);
    const assertion = assertionFor(privateKey, challenge);
    await mobileAuth.verifyAuthAssertion(USER, RP_ID, assertion);

    // The challenge is single-use; replaying the same assertion must fail.
    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, assertion),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an assertion for the wrong relying party", async () => {
    const { publicKey, privateKey } = makeCredential();
    seedDevice("dev-1");
    seedCredential(publicKey);

    mobileAuth.getAuthChallenge(USER, RP_ID);
    const { challenge } = mobileAuth.getAuthChallenge(USER, "evil.example.com");
    // authData carries evil.example.com's RP hash while we verify against RP_ID.
    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, assertionFor(privateKey, challenge, "evil.example.com")),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a clientData type that is not webauthn.get", async () => {
    const { publicKey, privateKey } = makeCredential();
    seedDevice("dev-1");
    seedCredential(publicKey);

    const { challenge } = mobileAuth.getAuthChallenge(USER, RP_ID);
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: "webauthn.create", challenge, origin: `https://${RP_ID}`,
    }));
    const authData = buildAuthenticatorData(RP_ID);
    const signature = signAssertion(privateKey, authData, clientDataJSON);

    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, {
        id: "cred-1", rawId: "cred-1",
        response: {
          clientDataJSON: clientDataJSON.toString("base64url"),
          authenticatorData: authData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses when the user has no registered credential", async () => {
    seedDevice("dev-1");
    mobileAuth.getAuthChallenge(USER, RP_ID);
    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, {
        id: "x", rawId: "x",
        response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" },
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("requires a pending challenge", async () => {
    const { publicKey, privateKey } = makeCredential();
    seedDevice("dev-1");
    seedCredential(publicKey);
    // No getAuthChallenge() call — nothing pending.
    await expect(
      mobileAuth.verifyAuthAssertion(USER, RP_ID, assertionFor(privateKey, "made-up-challenge")),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("device lifecycle", () => {
  it("registers a device against the calling user", async () => {
    const d = await mobileAuth.registerDevice(
      USER, { platform: "android", deviceName: "Pixel" }, { ip: "1.2.3.4" },
    );
    expect(d.userId).toBe(USER);
    expect(d.platform).toBe("android");
  });

  it("lists only the caller's devices", async () => {
    seedDevice("dev-mine", USER);
    seedDevice("dev-theirs", OTHER_USER);

    const mine = await mobileAuth.listDevices(USER);
    expect(mine.map((d: any) => d.id)).toEqual(["dev-mine"]);
  });

  it("never returns the PIN hash when listing devices", async () => {
    seedDevice("dev-1");
    await mobileAuth.setPin(USER, "dev-1", "4821");
    const list = await mobileAuth.listDevices(USER);
    expect(JSON.stringify(list)).not.toMatch(/\$2[aby]\$/);
  });

  it("revoking a device clears its credentials and subscriptions", async () => {
    seedDevice("dev-1");
    db.seed("BiometricCredential", [{ id: "bio-1", userId: USER, deviceId: "dev-1", credentialId: "c" }]);
    db.seed("PushSubscription", [{ id: cuid(), userId: USER, deviceId: "dev-1", endpoint: "e" }]);

    await mobileAuth.revokeDevice(USER, "dev-1");

    expect(db.tables.get("MobileDevice")!.filter((d: any) => d.id === "dev-1")).toHaveLength(0);
    expect(db.tables.get("BiometricCredential")!.filter((c: any) => c.deviceId === "dev-1")).toHaveLength(0);
    expect(db.tables.get("PushSubscription")!.filter((s: any) => s.deviceId === "dev-1")).toHaveLength(0);
  });

  it("does not let a user revoke someone else's device", async () => {
    seedDevice("dev-theirs", OTHER_USER);
    await mobileAuth.revokeDevice(USER, "dev-theirs");
    // Still present — the delete is scoped by userId.
    expect(db.tables.get("MobileDevice")!.filter((d: any) => d.id === "dev-theirs")).toHaveLength(1);
  });
});
