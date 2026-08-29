/**
 * Blockonomics per-asset control — pure shared helpers.
 *
 * The Super Admin BTC/USDT ON-OFF switches, the "both off = crypto unavailable"
 * state, the user payment-method availability rule, and the mandatory USDT
 * network labelling all rest on pure functions in @windels/shared/payments.
 * @windels/shared has no test harness of its own, so these run inside the API
 * suite (the shared build is a prerequisite of the API test run).
 *
 * These have no Prisma/Redis dependency, so they run green everywhere.
 */
import { describe, it, expect } from "vitest";
import {
  BLOCKONOMICS_ASSETS,
  BlockonomicsProviderSettingsSchema,
  BlockonomicsAdminAssetToggleSchema,
  toggleBlockonomicsAsset,
  isBlockonomicsAssetAvailable,
  availableBlockonomicsAssets,
  blockonomicsNetworkLabel,
  blockonomicsAssetDisplayName,
  blockonomicsAssetNetworkWarning,
  type BlockonomicsAsset,
} from "@windels/shared/payments";

function cfg(overrides: Partial<{ configured: boolean; enabled: boolean; supportedAssets: BlockonomicsAsset[] }> = {}) {
  return { configured: true, enabled: true, supportedAssets: ["BTC", "USDT"] as BlockonomicsAsset[], ...overrides };
}

describe("toggleBlockonomicsAsset", () => {
  it("enables an asset, keeping canonical BTC-before-USDT order", () => {
    expect(toggleBlockonomicsAsset(["USDT"], "BTC", true)).toEqual(["BTC", "USDT"]);
  });

  it("disables an asset without touching the other", () => {
    expect(toggleBlockonomicsAsset(["BTC", "USDT"], "USDT", false)).toEqual(["BTC"]);
  });

  it("supports turning both off -> empty list (crypto unavailable)", () => {
    const afterBtcOff = toggleBlockonomicsAsset(["BTC", "USDT"], "BTC", false);
    expect(toggleBlockonomicsAsset(afterBtcOff, "USDT", false)).toEqual([]);
  });

  it("is idempotent and de-duplicates", () => {
    expect(toggleBlockonomicsAsset(["BTC"], "BTC", true)).toEqual(["BTC"]);
    expect(toggleBlockonomicsAsset([], "USDT", false)).toEqual([]);
  });
});

describe("BlockonomicsProviderSettingsSchema — both-off is valid", () => {
  const base = { enabled: true, matchCallback: "pay.example.test" };

  it("accepts an empty supportedAssets array (BTC OFF + USDT OFF)", () => {
    const parsed = BlockonomicsProviderSettingsSchema.parse({ ...base, supportedAssets: [] });
    expect(parsed.supportedAssets).toEqual([]);
  });

  it("accepts BTC only, USDT only, and both", () => {
    expect(BlockonomicsProviderSettingsSchema.parse({ ...base, supportedAssets: ["BTC"] }).supportedAssets).toEqual(["BTC"]);
    expect(BlockonomicsProviderSettingsSchema.parse({ ...base, supportedAssets: ["USDT"] }).supportedAssets).toEqual(["USDT"]);
    expect(BlockonomicsProviderSettingsSchema.parse({ ...base, supportedAssets: ["BTC", "USDT"] }).supportedAssets).toEqual(["BTC", "USDT"]);
  });

  it("rejects an unknown asset", () => {
    expect(() => BlockonomicsProviderSettingsSchema.parse({ ...base, supportedAssets: ["DOGE"] })).toThrow();
  });

  it("defaults to BTC when supportedAssets is omitted (backward compatible)", () => {
    expect(BlockonomicsProviderSettingsSchema.parse({ ...base }).supportedAssets).toEqual(["BTC"]);
  });
});

describe("isBlockonomicsAssetAvailable — the shared user/backend rule", () => {
  it("is true only when configured AND enabled AND the asset is toggled on", () => {
    expect(isBlockonomicsAssetAvailable(cfg(), "BTC")).toBe(true);
    expect(isBlockonomicsAssetAvailable(cfg(), "USDT")).toBe(true);
  });

  it("is false for an asset that is toggled off", () => {
    expect(isBlockonomicsAssetAvailable(cfg({ supportedAssets: ["BTC"] }), "USDT")).toBe(false);
    expect(isBlockonomicsAssetAvailable(cfg({ supportedAssets: ["USDT"] }), "BTC")).toBe(false);
  });

  it("is false for every asset when the provider is disabled or unconfigured", () => {
    expect(isBlockonomicsAssetAvailable(cfg({ enabled: false }), "BTC")).toBe(false);
    expect(isBlockonomicsAssetAvailable(cfg({ configured: false }), "USDT")).toBe(false);
  });
});

describe("availableBlockonomicsAssets — the four control matrix states", () => {
  it("BTC ON, USDT OFF -> only BTC", () => {
    expect(availableBlockonomicsAssets(cfg({ supportedAssets: ["BTC"] }))).toEqual(["BTC"]);
  });
  it("BTC OFF, USDT ON -> only USDT", () => {
    expect(availableBlockonomicsAssets(cfg({ supportedAssets: ["USDT"] }))).toEqual(["USDT"]);
  });
  it("BTC ON, USDT ON -> both", () => {
    expect(availableBlockonomicsAssets(cfg({ supportedAssets: ["BTC", "USDT"] }))).toEqual(["BTC", "USDT"]);
  });
  it("BTC OFF, USDT OFF -> none", () => {
    expect(availableBlockonomicsAssets(cfg({ supportedAssets: [] }))).toEqual([]);
  });
});

describe("USDT network labelling (loss-prevention)", () => {
  it("labels USDT with its network and BTC as Bitcoin", () => {
    expect(blockonomicsNetworkLabel("USDT")).toBe("Ethereum (ERC-20)");
    expect(blockonomicsNetworkLabel("BTC")).toBe("Bitcoin");
  });

  it("names USDT with its network in the picker so it is never bare 'USDT'", () => {
    expect(blockonomicsAssetDisplayName("USDT")).toMatch(/ERC-20/);
    expect(blockonomicsAssetDisplayName("USDT")).toMatch(/USDT/);
    expect(blockonomicsAssetDisplayName("BTC")).toMatch(/Bitcoin/);
  });

  it("shows a wrong-network warning for USDT and none for BTC", () => {
    const warn = blockonomicsAssetNetworkWarning("USDT");
    expect(warn).toMatch(/ERC-20/);
    expect(warn).toMatch(/permanent loss/i);
    expect(blockonomicsAssetNetworkWarning("BTC")).toBe("");
  });
});

describe("BlockonomicsAdminAssetToggleSchema", () => {
  it("accepts a valid asset + enabled pair", () => {
    expect(BlockonomicsAdminAssetToggleSchema.parse({ asset: "BTC", enabled: false })).toEqual({ asset: "BTC", enabled: false });
  });
  it("rejects an unknown asset", () => {
    expect(() => BlockonomicsAdminAssetToggleSchema.parse({ asset: "XRP", enabled: true })).toThrow();
  });
  it("covers exactly the documented asset set", () => {
    expect([...BLOCKONOMICS_ASSETS]).toEqual(["BTC", "USDT"]);
  });
});
