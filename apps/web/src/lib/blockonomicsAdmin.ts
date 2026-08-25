import { api } from "./api";
import type {
  BlockonomicsAdminConfigUpdateInput,
  BlockonomicsAdminDashboard,
  BlockonomicsAdminHealthResult,
  BlockonomicsAdminPublicConfig,
  BlockonomicsAsset,
  BlockonomicsReconciliationResult,
  BlockonomicsReconciliationTimeframe,
} from "@windels/shared/payments";

const base = "/admin/payments/blockonomics";

export const blockonomicsAdmin = {
  config: () => api<BlockonomicsAdminPublicConfig>(`${base}/config`),
  dashboard: () => api<BlockonomicsAdminDashboard>(`${base}/dashboard`),
  updateConfig: (input: BlockonomicsAdminConfigUpdateInput) =>
    api<BlockonomicsAdminPublicConfig>(`${base}/config`, { method: "PUT", json: input }),
  setEnabled: (enabled: boolean) =>
    api<BlockonomicsAdminPublicConfig>(`${base}/enabled`, { method: "PATCH", json: { enabled } }),
  setAssetEnabled: (asset: BlockonomicsAsset, enabled: boolean) =>
    api<BlockonomicsAdminPublicConfig>(`${base}/assets`, { method: "PATCH", json: { asset, enabled } }),
  checkHealth: () => api<BlockonomicsAdminHealthResult>(`${base}/health`, { method: "POST" }),
  reconcile: (timeframe: BlockonomicsReconciliationTimeframe) =>
    api<BlockonomicsReconciliationResult>(`${base}/reconcile`, { method: "POST", json: { timeframe } }),
};
