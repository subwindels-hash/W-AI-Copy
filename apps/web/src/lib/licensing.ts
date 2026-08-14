import { api } from "./api";
import type { LicensedAsset, LicenseGrant, LicensingDashboard, RoyaltyEntry } from "@windels/shared";
export type { LicensedAsset, LicenseGrant, LicensingDashboard, RoyaltyEntry, LicensableAssetType, BillingModel, LicensedAssetSource } from "@windels/shared";
export { PLATFORM_FEE_PCT } from "@windels/shared";

export const licensingApi = {
  dashboard: () => api<LicensingDashboard>("/licensing/dashboard/rollup"),
  assets: () => api<LicensedAsset[]>("/licensing/assets"),
  grants: () => api<LicenseGrant[]>("/licensing/grants"),
  register: (input: Omit<LicensedAsset, "id"|"organizationId"|"ownerId"|"status"|"listings"|"revenueCents30d"|"revenueCentsAllTime"|"source"|"createdAt"|"updatedAt">) =>
    api<LicensedAsset>("/licensing/assets", { method: "POST", json: input }),
  grant: (input: { assetId: string; licenseeOrgId: string; expiresAt?: string }) =>
    api<LicenseGrant>("/licensing/grants", { method: "POST", json: input }),
  recordUsage: (input: { grantId: string; usageCents?: number }) =>
    api<RoyaltyEntry>("/licensing/usage", { method: "POST", json: input }),
  // S164 — the royalty ledger, previously written and never readable.
  royalties: () => api<RoyaltyEntry[]>("/licensing/royalties"),
  cancelGrant: (input: { grantId: string }) =>
    api<LicenseGrant>("/licensing/grants/cancel", { method: "POST", json: input }),
  /** S164 — marks ledger entries paid. Moves no money. */
  settlePayouts: (input: { royaltyIds?: string[] } = {}) =>
    api<{ settled: number; centsSettled: number; moneyMoved: false }>("/licensing/payouts/settle", { method: "POST", json: input }),
};
