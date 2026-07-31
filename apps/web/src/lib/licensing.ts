import { api } from "./api";
import type { LicensedAsset, LicenseGrant, LicensingDashboard, RoyaltyEntry } from "@windels/shared";
export type { LicensedAsset, LicenseGrant, LicensingDashboard, RoyaltyEntry, LicensableAssetType, BillingModel } from "@windels/shared";

export const licensingApi = {
  dashboard: () => api<LicensingDashboard>("/licensing/dashboard/rollup"),
  assets: () => api<LicensedAsset[]>("/licensing/assets"),
  grants: () => api<LicenseGrant[]>("/licensing/grants"),
  register: (input: Omit<LicensedAsset, "id"|"organizationId"|"ownerId"|"status"|"listings"|"revenueCents30d"|"createdAt"|"updatedAt">) =>
    api<LicensedAsset>("/licensing/assets", { method: "POST", json: input }),
  grant: (input: { assetId: string; licenseeOrgId: string; expiresAt?: string }) =>
    api<LicenseGrant>("/licensing/grants", { method: "POST", json: input }),
  recordUsage: (input: { grantId: string; usageCents?: number }) =>
    api<RoyaltyEntry>("/licensing/usage", { method: "POST", json: input }),
};
