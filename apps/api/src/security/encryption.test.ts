import { beforeAll, describe, expect, it } from "vitest";

let encryption: typeof import("./encryption.js");
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.WINDELS_ENCRYPTION_KEY = "a".repeat(64);
  process.env.WINDELS_ENCRYPTION_KEY_ID = "primary-a";
  delete process.env.WINDELS_ENCRYPTION_KEYRING;
  encryption = await import("./encryption.js");
});

describe("credential envelope encryption", () => {
  it("encrypts with the configured key id and authenticates ciphertext", () => {
    const blob = encryption.encryptString("secret-value");
    expect(blob.kid).toBe("primary-a");
    expect(blob.data).not.toContain("secret-value");
    expect(encryption.decryptString(blob)).toBe("secret-value");
    const tampered = { ...blob, data: blob.data.slice(0, -2) + "AA" };
    expect(encryption.decryptString(tampered)).toBeNull();
  });

  it("fails closed for an unknown key id", () => {
    const blob = encryption.encryptString("secret-value");
    expect(encryption.decryptString({ ...blob, kid: "unknown" })).toBeNull();
  });

  it("supports controlled key rotation while retaining old decrypt capability", () => {
    const oldBlob = encryption.encryptString("before-rotation");
    encryption.registerKey("primary-b", "b".repeat(64));
    encryption.setPrimaryKey("primary-b");
    const newBlob = encryption.encryptString("after-rotation");
    expect(newBlob.kid).toBe("primary-b");
    expect(encryption.decryptString(oldBlob)).toBe("before-rotation");
    expect(encryption.decryptString(newBlob)).toBe("after-rotation");
  });

  it("never returns a full secret from the masking helper", () => {
    expect(encryption.maskSecret("github_pat_1234567890")).toBe("git***90");
    expect(encryption.maskSecret("short")).toBe("***");
  });
});
