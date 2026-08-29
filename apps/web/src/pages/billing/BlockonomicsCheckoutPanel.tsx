import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { AlertTriangle, CheckCircle2, Copy, QrCode, Radio, RefreshCw, Timer } from "lucide-react";
import type { PaymentTransaction } from "@windels/shared";
import { getBlockonomicsPayment, monitorBlockonomicsUsdt } from "@/lib/payments";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  blockonomicsQrPayload,
  blockonomicsQuoteCountdown,
  blockonomicsStatusMessage,
  formatBlockonomicsCryptoAmount,
  isBlockonomicsTerminal,
  isEthereumTransactionHash,
} from "./blockonomicsCheckout";

interface BlockonomicsCheckoutPanelProps {
  payment: PaymentTransaction;
  testMode?: boolean;
  onPaymentChange: (payment: PaymentTransaction) => void;
}

export function BlockonomicsCheckoutPanel({ payment, testMode = false, onPaymentChange }: BlockonomicsCheckoutPanelProps) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState<string | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const exactAmount = useMemo(() => formatBlockonomicsCryptoAmount(payment), [payment]);
  const qrPayload = useMemo(() => blockonomicsQrPayload(payment), [payment]);
  const quote = blockonomicsQuoteCountdown(payment.expiresAt, nowMs);
  const terminal = isBlockonomicsTerminal(payment.status);
  const confirmations = payment.confirmations ?? 0;
  const requiredConfirmations = payment.requiredConfirmations ?? 2;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    if (!qrPayload) return () => { cancelled = true; };
    void QRCode.toDataURL(qrPayload, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    }).catch(() => {
      if (!cancelled) setQrDataUrl(null);
    });
    return () => { cancelled = true; };
  }, [qrPayload]);

  const refreshBackendStatus = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setRefreshError(null);
    try {
      const updated = await getBlockonomicsPayment(payment.id);
      onPaymentChange(updated);
    } catch (error: any) {
      if (!quiet) setRefreshError(error?.message ?? "Backend payment status is unavailable");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [onPaymentChange, payment.id]);

  useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => { void refreshBackendStatus(true); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refreshBackendStatus, terminal]);

  const copy = async (value: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1_500);
    } catch {
      setCopied(null);
    }
  };

  const submitUsdtHash = async (event: FormEvent) => {
    event.preventDefault();
    setMonitorError(null);
    setMonitorMessage(null);
    const normalized = txHash.trim();
    if (!isEthereumTransactionHash(normalized)) {
      setMonitorError("Enter a complete Ethereum transaction hash beginning with 0x.");
      return;
    }
    setMonitoring(true);
    try {
      const updated = await monitorBlockonomicsUsdt(payment.id, normalized);
      onPaymentChange(updated);
      setMonitorMessage("Monitoring requested. Completion still requires provider confirmations and backend reconciliation.");
    } catch (error: any) {
      setMonitorError(error?.message ?? "The backend could not register this transaction for monitoring");
    } finally {
      setMonitoring(false);
    }
  };

  const statusVariant = payment.status === "completed"
    ? "default"
    : ["failed", "cancelled", "under_review", "expired"].includes(payment.status)
      ? "danger"
      : "secondary";

  return (
    <section className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-text-bright">Blockonomics payment instructions</h3>
            <Badge variant={statusVariant}>{payment.status.replace("_", " ")}</Badge>
            {testMode ? <Badge variant="outline">Test Mode</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-text-muted">{blockonomicsStatusMessage(payment)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshBackendStatus()} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Backend status
        </Button>
      </div>

      {refreshError ? <div className="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-400">{refreshError}</div> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-background/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Send exactly</div>
            <div className="mt-1 break-all font-mono text-xl font-semibold text-emerald-300">
              {exactAmount ?? "Amount unavailable"} {payment.cryptoCurrency}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Invoice amount: {payment.currency} {payment.amount.toFixed(2)}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                {payment.cryptoCurrency === "USDT" ? "Ethereum ERC-20 address" : "Bitcoin address"}
              </div>
              {payment.cryptoAddress ? (
                <button type="button" onClick={() => void copy(payment.cryptoAddress!, "address")} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <Copy className="h-3 w-3" /> {copied === "address" ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
            <code className="mt-1 block break-all font-mono text-sm text-text-bright">
              {payment.cryptoAddress ?? "Provider address unavailable"}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-background/60 p-3">
              <div className="flex items-center gap-1 text-[11px] uppercase text-text-muted"><Radio className="h-3 w-3" /> Confirmations</div>
              <div className="mt-1 font-semibold text-text-bright">{confirmations} / {requiredConfirmations}</div>
            </div>
            <div className={`rounded-md border p-3 ${quote.expired ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-background/60"}`}>
              <div className="flex items-center gap-1 text-[11px] uppercase text-text-muted"><Timer className="h-3 w-3" /> Quote timer</div>
              <div className={`mt-1 font-semibold ${quote.expired ? "text-amber-300" : "text-text-bright"}`}>{quote.label}</div>
            </div>
          </div>

          {quote.expired && !terminal ? (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The browser timer only reports quote age. It does not cancel, confirm, or settle payment; refresh backend status before taking further action.
            </div>
          ) : null}

          {payment.cryptoCurrency === "USDT" ? (
            <form onSubmit={submitUsdtHash} className="rounded-md border border-border bg-background/60 p-3">
              <label htmlFor={`blockonomics-tx-${payment.id}`} className="block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                USDT Ethereum transaction hash
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id={`blockonomics-tx-${payment.id}`}
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text-bright"
                  disabled={monitoring || terminal}
                />
                <Button type="submit" size="sm" disabled={monitoring || terminal}>
                  {monitoring ? "Registering…" : "Monitor transaction"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Submitting a hash only asks the backend and Blockonomics to monitor it. It cannot complete or credit this payment.</p>
              {monitorMessage ? <p className="mt-2 flex items-start gap-1 text-xs text-emerald-300"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{monitorMessage}</p> : null}
              {monitorError ? <p className="mt-2 text-xs text-red-400">{monitorError}</p> : null}
            </form>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-start rounded-md border border-border bg-white p-3 text-slate-900">
          <div className="flex items-center gap-1 text-xs font-semibold"><QrCode className="h-4 w-4" /> Scan to pay</div>
          {qrDataUrl ? <img src={qrDataUrl} alt={`${payment.cryptoCurrency} payment QR code`} className="mt-2 h-44 w-44" /> : <div className="mt-2 flex h-44 w-44 items-center justify-center text-xs text-slate-500">QR unavailable</div>}
          <div className="mt-2 text-center text-[10px] leading-4 text-slate-600">
            {payment.cryptoCurrency === "USDT" ? "USDT on Ethereum ERC-20 only. Set the exact amount in your wallet." : "Bitcoin URI includes the exact backend amount."}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">
        Never send another asset or use another network. Browser state is informational; only backend provider verification and billing settlement can complete this payment.
      </div>
    </section>
  );
}
