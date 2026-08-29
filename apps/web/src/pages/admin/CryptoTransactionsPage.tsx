import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, Search, X } from "lucide-react";
import type {
  BlockonomicsAdminTransactionQuery,
  BlockonomicsAdminTransactionRow,
  BlockonomicsAsset,
  PaymentTransactionStatus,
} from "@windels/shared/payments";
import { BLOCKONOMICS_ASSETS, PAYMENT_TRANSACTION_STATUSES } from "@windels/shared/payments";
import { blockonomicsAdmin } from "@/lib/blockonomicsAdmin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type StatusFilter = PaymentTransactionStatus | "all";
type AssetFilter = BlockonomicsAsset | "all";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (["failed", "cancelled", "expired", "under_review"].includes(status)) return "danger" as const;
  if (["confirming", "confirmed", "detected"].includes(status)) return "azure" as const;
  return "secondary" as const;
}

export function CryptoTransactionsPage() {
  const [userId, setUserId] = useState("");
  const [reference, setReference] = useState("");
  const [asset, setAsset] = useState<AssetFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [rows, setRows] = useState<BlockonomicsAdminTransactionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback((cursor?: string): BlockonomicsAdminTransactionQuery => ({
    ...(userId.trim() ? { userId: userId.trim() } : {}),
    ...(reference.trim() ? { reference: reference.trim() } : {}),
    ...(asset !== "all" ? { asset } : {}),
    ...(status !== "all" ? { status } : {}),
    limit: 50,
    ...(cursor ? { cursor } : {}),
  }), [userId, reference, asset, status]);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await blockonomicsAdmin.transactions(buildQuery(cursor));
      setRows((current) => (cursor ? [...current, ...page.transactions] : page.transactions));
      setNextCursor(page.nextCursor);
    } catch (cause: any) {
      setError(cause?.message ?? "Unable to load cryptocurrency transactions");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Initial load only; subsequent loads are driven by explicit Search/Refresh so
  // the admin controls when a query runs.
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const runSearch = () => void load();
  const clearFilters = () => {
    setUserId("");
    setReference("");
    setAsset("all");
    setStatus("all");
  };

  const hasFilters = useMemo(
    () => Boolean(userId.trim() || reference.trim() || asset !== "all" || status !== "all"),
    [userId, reference, asset, status],
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-7 w-7 text-emerald-400" />
            <h1 className="text-2xl font-black text-text-bright">Crypto Transactions</h1>
            <Badge variant="danger">Super Admin only</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Read-only search over the durable Blockonomics payment ledger. Balances are settled only by verified
            provider evidence — there is no manual &ldquo;mark as paid&rdquo; here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}>
          <RefreshCw className="h-4 w-4" />Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search &amp; filter</CardTitle>
          <CardDescription>Find by User ID or transaction reference; filter by asset and status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs uppercase text-text-muted">User ID</label>
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="requesting user id" onKeyDown={(e) => e.key === "Enter" && runSearch()} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase text-text-muted">Transaction ID / reference</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BLK_… or provider tx id" onKeyDown={(e) => e.key === "Enter" && runSearch()} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase text-text-muted">Asset</label>
              <select value={asset} onChange={(e) => setAsset(e.target.value as AssetFilter)} className="w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright" aria-label="Filter asset">
                <option value="all">All assets</option>
                {BLOCKONOMICS_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase text-text-muted">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright" aria-label="Filter status">
                <option value="all">All statuses</option>
                {PAYMENT_TRANSACTION_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={runSearch} loading={loading}><Search className="h-4 w-4" />Search</Button>
            {hasFilters ? <Button size="sm" variant="outline" onClick={() => { clearFilters(); }}><X className="h-4 w-4" />Clear</Button> : null}
          </div>
        </CardContent>
      </Card>

      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div> : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              {loading ? "Loading transactions…" : "No cryptocurrency transactions match the current filters."}
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border uppercase text-text-muted">
                  <th className="py-2 pr-3">Transaction</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Asset / network</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Confirmations</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2">Confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 pr-3 font-mono text-text-bright">
                      {tx.reference}
                      {tx.providerTransactionId ? <div className="break-all text-text-muted">{tx.providerTransactionId}</div> : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-text-muted">{tx.requestedById ?? "—"}</td>
                    <td className="py-2 pr-3">{tx.asset ?? "—"}{tx.network ? <div className="text-text-muted">{tx.network}</div> : null}</td>
                    <td className="py-2 pr-3">{tx.currency} {(tx.amountCents / 100).toFixed(2)}</td>
                    <td className="py-2 pr-3">{tx.confirmations}/{tx.requiredConfirmations}</td>
                    <td className="py-2 pr-3"><Badge variant={statusVariant(tx.status)}>{tx.status.replace("_", " ")}</Badge></td>
                    <td className="py-2 pr-3 text-text-muted">{new Date(tx.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-text-muted">{tx.completedAt ? new Date(tx.completedAt).toLocaleString() : tx.confirmedAt ? new Date(tx.confirmedAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void load(nextCursor)} loading={loading}>Load more</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default CryptoTransactionsPage;
