/** Session 61 — Data & Knowledge Marketplace client */
import { api } from "./api";
import type { MarketplaceAsset, DmDashboard, MarketplaceInstall } from "@windels/shared";
export type { MarketplaceAsset, DmDashboard, MarketplaceInstall } from "@windels/shared";

export const dmApi = {
  dashboard: () => api<DmDashboard>("/data-marketplace/dashboard/rollup"),
  list: (kind?: string) => api<MarketplaceAsset[]>(`/data-marketplace/assets${kind?`?kind=${kind}`:""}`),
  get: (id: string) => api<MarketplaceAsset>(`/data-marketplace/assets/${id}`),
  publish: (input: Partial<MarketplaceAsset> & { name: string; kind: MarketplaceAsset["kind"]; description: string; licenseModel: MarketplaceAsset["licenseModel"] }) =>
    api<MarketplaceAsset>("/data-marketplace/assets", { method: "POST", json: input }),
  install: (id: string) => api<MarketplaceInstall>(`/data-marketplace/assets/${id}/install`, { method: "POST" }),
  review: (id: string, rating: number, comment?: string) => api<MarketplaceAsset>(`/data-marketplace/assets/${id}/review`, { method: "POST", json: { rating, comment } }),
  
  // Shared license and access check
  checkAccess: (id: string) => api<{ allowed: boolean; reason?: string; licenseModel?: string }>(`/data-marketplace/assets/${id}/access`),
};
