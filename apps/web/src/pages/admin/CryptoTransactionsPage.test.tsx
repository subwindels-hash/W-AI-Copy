// @vitest-environment happy-dom
/**
 * Super Admin → Payments → Crypto Transactions (spec §10).
 *
 * Verifies the read-only search/filter view: it lists ledger rows, sends the
 * right query when filtering by User ID / transaction reference / asset /
 * status, paginates via the returned cursor, and never exposes a
 * balance-mutating control. The admin API client is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BlockonomicsAdminTransactionPage } from "@windels/shared/payments";

const transactionsFn = vi.fn();

vi.mock("@/lib/blockonomicsAdmin", () => ({
  blockonomicsAdmin: { transactions: (...a: unknown[]) => transactionsFn(...a) },
}));

import { CryptoTransactionsPage } from "./CryptoTransactionsPage";

function page(overrides: Partial<BlockonomicsAdminTransactionPage> = {}): BlockonomicsAdminTransactionPage {
  return {
    transactions: [
      {
        id: "pay-2", organizationId: "org-1", requestedById: "user-9", reference: "BLK_2",
        providerTransactionId: "0xabc", asset: "USDT", network: "eth_erc20", status: "completed",
        amountCents: 5000, currency: "USD", confirmations: 2, requiredConfirmations: 2,
        reconciliationStatus: "matched", paymentAddress: "0xaaa", createdAt: "2026-08-18T10:00:00.000Z",
        confirmedAt: "2026-08-18T10:20:00.000Z", completedAt: "2026-08-18T10:25:00.000Z",
      },
    ],
    nextCursor: null,
    query: {},
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CryptoTransactionsPage", () => {
  it("loads and renders transactions on mount", async () => {
    transactionsFn.mockResolvedValue(page());
    render(<CryptoTransactionsPage />);
    const cell = await screen.findByText("BLK_2");
    expect(cell).toBeTruthy();
    expect(screen.getByText("user-9")).toBeTruthy();
    // Status appears both as a badge and as a <select> option; assert the badge
    // in the table row (a <span>), not the option.
    const row = cell.closest("tr")!;
    expect(within(row).getByText("completed").tagName).toBe("SPAN");
    expect(transactionsFn).toHaveBeenCalledTimes(1);
  });

  it("sends user id, reference, asset and status filters on search", async () => {
    const user = userEvent.setup();
    transactionsFn.mockResolvedValue(page());
    render(<CryptoTransactionsPage />);
    await screen.findByText("BLK_2");

    await user.type(screen.getByPlaceholderText("requesting user id"), "user-9");
    await user.type(screen.getByPlaceholderText("BLK_… or provider tx id"), "BLK_2");
    await user.selectOptions(screen.getByLabelText("Filter asset"), "USDT");
    await user.selectOptions(screen.getByLabelText("Filter status"), "completed");
    await user.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(transactionsFn).toHaveBeenCalledTimes(2));
    expect(transactionsFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "user-9", reference: "BLK_2", asset: "USDT", status: "completed", limit: 50 }),
    );
  });

  it("shows an empty state when no transactions match", async () => {
    transactionsFn.mockResolvedValue(page({ transactions: [] }));
    render(<CryptoTransactionsPage />);
    expect(await screen.findByText(/No cryptocurrency transactions match/i)).toBeTruthy();
  });

  it("paginates with the returned cursor via Load more", async () => {
    const user = userEvent.setup();
    transactionsFn
      .mockResolvedValueOnce(page({ nextCursor: "pay-2" }))
      .mockResolvedValueOnce(page({
        transactions: [{
          id: "pay-1", organizationId: "org-1", requestedById: "user-1", reference: "BLK_1",
          providerTransactionId: null, asset: "BTC", network: "btc", status: "pending",
          amountCents: 1000, currency: "USD", confirmations: 0, requiredConfirmations: 2,
          reconciliationStatus: "pending", paymentAddress: "bc1q", createdAt: "2026-08-17T11:00:00.000Z",
          confirmedAt: null, completedAt: null,
        }],
        nextCursor: null,
      }));

    render(<CryptoTransactionsPage />);
    await screen.findByText("BLK_2");
    await user.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(screen.getByText("BLK_1")).toBeTruthy());
    expect(transactionsFn).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "pay-2" }));
    // Rows are appended, not replaced.
    expect(screen.getByText("BLK_2")).toBeTruthy();
  });

  it("exposes no balance-mutating control (read-only surface)", async () => {
    transactionsFn.mockResolvedValue(page());
    const { container } = render(<CryptoTransactionsPage />);
    await screen.findByText("BLK_2");
    const buttons = within(container).getAllByRole("button").map((b) => b.textContent?.toLowerCase() ?? "");
    expect(buttons.some((t) => /mark.*paid|credit|settle|approve/.test(t))).toBe(false);
  });
});
