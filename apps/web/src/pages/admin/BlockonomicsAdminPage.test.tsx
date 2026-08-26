// @vitest-environment happy-dom
/**
 * Blockonomics Super Admin control — per-method ON/OFF switches.
 *
 * Covers the core control the spec asks for: independent BTC and USDT toggles
 * that persist immediately, the ON/OFF status reflecting configuration, and the
 * mandatory USDT wrong-network warning. The admin API client and toast are
 * mocked; only the page's own wiring is exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BlockonomicsAdminDashboard } from "@windels/shared/payments";

const dashboardFn = vi.fn();
const setAssetEnabledFn = vi.fn();
const setEnabledFn = vi.fn();
const updateConfigFn = vi.fn();
const checkHealthFn = vi.fn();
const reconcileFn = vi.fn();

vi.mock("@/lib/blockonomicsAdmin", () => ({
  blockonomicsAdmin: {
    dashboard: (...a: unknown[]) => dashboardFn(...a),
    setAssetEnabled: (...a: unknown[]) => setAssetEnabledFn(...a),
    setEnabled: (...a: unknown[]) => setEnabledFn(...a),
    updateConfig: (...a: unknown[]) => updateConfigFn(...a),
    checkHealth: (...a: unknown[]) => checkHealthFn(...a),
    reconcile: (...a: unknown[]) => reconcileFn(...a),
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { BlockonomicsAdminPage } from "./BlockonomicsAdminPage";

function makeDashboard(supportedAssets: ("BTC" | "USDT")[]): BlockonomicsAdminDashboard {
  return {
    generatedAt: new Date().toISOString(),
    configuration: {
      provider: "blockonomics",
      configured: true,
      apiKeyConfigured: true,
      callbackSecretConfigured: true,
      source: "database",
      version: 4,
      enabled: true,
      testMode: false,
      matchCallback: "pay.example.test",
      supportedAssets,
      quoteExpiryMinutes: 15,
      requiredConfirmations: 2,
      healthStatus: "HEALTHY",
      lastHealthAt: null,
      lastError: null,
    },
    totals: { payments: 0, webhookEvents: 0, failedWebhookEvents: 0 },
    paymentsByStatus: [],
    reconciliationByStatus: [],
    paymentsByAsset: [],
    webhooksByStatus: [],
    recentPayments: [],
    recentWebhookErrors: [],
    recentReconciliationRuns: [],
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlockonomicsAdminPage per-asset switches", () => {
  it("renders BTC and USDT as switches reflecting configured state", async () => {
    dashboardFn.mockResolvedValue(makeDashboard(["BTC"]));
    render(<BlockonomicsAdminPage />);

    const btc = await screen.findByRole("switch", { name: "Enable BTC payments" });
    const usdt = screen.getByRole("switch", { name: "Enable USDT payments" });
    expect(btc.getAttribute("aria-checked")).toBe("true");
    expect(usdt.getAttribute("aria-checked")).toBe("false");
  });

  it("enables USDT independently, persisting the change", async () => {
    const user = userEvent.setup();
    dashboardFn.mockResolvedValue(makeDashboard(["BTC"]));
    setAssetEnabledFn.mockResolvedValue(makeDashboard(["BTC", "USDT"]).configuration);
    render(<BlockonomicsAdminPage />);

    const usdt = await screen.findByRole("switch", { name: "Enable USDT payments" });
    await user.click(usdt);
    expect(setAssetEnabledFn).toHaveBeenCalledWith("USDT", true);
  });

  it("disables BTC independently (allowing an eventual both-off state)", async () => {
    const user = userEvent.setup();
    dashboardFn.mockResolvedValue(makeDashboard(["BTC", "USDT"]));
    setAssetEnabledFn.mockResolvedValue(makeDashboard(["USDT"]).configuration);
    render(<BlockonomicsAdminPage />);

    const btc = await screen.findByRole("switch", { name: "Enable BTC payments" });
    await user.click(btc);
    expect(setAssetEnabledFn).toHaveBeenCalledWith("BTC", false);
  });

  it("always shows the USDT wrong-network loss warning", async () => {
    dashboardFn.mockResolvedValue(makeDashboard(["BTC", "USDT"]));
    render(<BlockonomicsAdminPage />);
    await screen.findByRole("switch", { name: "Enable USDT payments" });
    expect(screen.getByText(/permanent loss of funds/i)).toBeTruthy();
    expect(screen.getAllByText(/Ethereum \(ERC-20\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows OFF badges for both methods when neither is enabled", async () => {
    dashboardFn.mockResolvedValue(makeDashboard([]));
    render(<BlockonomicsAdminPage />);
    const btc = await screen.findByRole("switch", { name: "Enable BTC payments" });
    const usdt = screen.getByRole("switch", { name: "Enable USDT payments" });
    expect(btc.getAttribute("aria-checked")).toBe("false");
    expect(usdt.getAttribute("aria-checked")).toBe("false");
    await waitFor(() => expect(screen.getAllByText("OFF").length).toBeGreaterThanOrEqual(2));
  });
});
