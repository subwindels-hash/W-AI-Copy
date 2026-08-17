import { api } from "./api";
import type {
  BlockonomicsAdminConfigUpdateInput,
  BlockonomicsAdminDashboard,
  BlockonomicsAdminHealthResult,
  BlockonomicsAdminPublicConfig,
} from "@windels/shared/payments";

const base = "/admin/payments/blockonomics";

export const blockonomicsAdmin = {
  config: () => api<BlockonomicsAdminPublicConfig>(`${base}/config`),
  dashboard: () => api<BlockonomicsAdminDashboard>(`${base}/dashboard`),
  updateConfig: (input: BlockonomicsAdminConfigUpdateInput) =>
    api<BlockonomicsAdminPublicConfig>(`${base}/config`, { method: "PUT", json: input }),
  setEnabled: (enabled: boolean) =>
    api<BlockonomicsAdminPublicConfig>(`${base}/enabled`, { method: "PATCH", json: { enabled } }),
  checkHealth: () => api<BlockonomicsAdminHealthResult>(`${base}/health`, { method: "POST" }),
};
