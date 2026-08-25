import { useCallback, useEffect, useState } from "react";
import { lotteryApi } from "@/lib/lotteryIntelligence";
import type { LiDashboard, LiGeneratedLine, LiTicket } from "@/lib/lotteryIntelligence";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";

const TABS = ["home", "generate", "tickets", "numbers"] as const;

export function MobileLotteryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("home");
  const [dash, setDash] = useState<LiDashboard | null>(null);
  const [lines, setLines] = useState<LiGeneratedLine[]>([]);
  const [tickets, setTickets] = useState<LiTicket[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([lotteryApi.dashboard(), lotteryApi.tickets()]);
      setDash(d); setTickets(t); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="pb-8">
      <MobileTopBar title="Lottery Intel" subtitle="EuroMillions" />
      <div className="px-4 pt-3">
        <div className={`rounded-2xl px-3 py-2 text-xs ${dash?.mode === "SANDBOX" ? "bg-amber/15 text-amber" : "bg-azure/15 text-azure"}`}>
          {dash?.mode === "SANDBOX" ? "DEMO / SANDBOX DATA" : "Draws are random — no guaranteed numbers."}
        </div>
        {err ? <div className="mt-2 text-xs text-crimson">{err}</div> : null}
      </div>
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${tab === t ? "border-azure/40 bg-azure/20 text-white" : "border-white/10 text-text-muted"}`}>{t}</button>
        ))}
      </div>

      {tab === "home" && (
        <div className="px-4 mt-4 space-y-3">
          <Box>
            <div className="text-xs text-text-muted">Last result</div>
            <div className="text-lg font-black text-white mt-1">
              {dash?.lastDraw ? dash.lastDraw.mainNumbers.map((n) => String(n).padStart(2, "0")).join(" ") : "—"}
            </div>
            <div className="text-xs text-azure">★ {dash?.lastDraw ? dash.lastDraw.bonusNumbers.map((n) => String(n).padStart(2, "0")).join(" ") : "—"}</div>
          </Box>
          <Box>
            <div className="text-xs text-text-muted">Hot numbers (historical window)</div>
            <div className="text-sm text-white mt-1">{dash?.hotMain.join(" · ") || "—"}</div>
            <div className="text-[11px] text-text-muted mt-1">Observation only — not “due” to appear.</div>
          </Box>
        </div>
      )}

      {tab === "generate" && (
        <div className="px-4 mt-4 space-y-3">
          <button
            className="w-full rounded-2xl bg-azure-600 text-white py-3 text-sm font-semibold"
            onClick={async () => {
              const data = await lotteryApi.generate({ lotteryId: "euromillions", mode: "BALANCED", count: 5, lockedMain: [], excludedMain: [], lockedBonus: [], excludedBonus: [] });
              setLines(data.lines);
            }}
          >Generate 5 balanced lines</button>
          {lines.map((l) => (
            <Box key={l.id}>
              <div className="text-white font-semibold">{l.mainNumbers.map((n) => String(n).padStart(2, "0")).join(" ")} ★ {l.bonusNumbers.map((n) => String(n).padStart(2, "0")).join(" ")}</div>
              <div className="text-[11px] text-text-muted">Statistical fit {l.profile.statisticalFitScore}/100 — not a win chance</div>
            </Box>
          ))}
        </div>
      )}

      {tab === "tickets" && (
        <div className="px-4 mt-4 space-y-2">
          {tickets.length === 0 ? <Box><div className="text-sm text-text-muted">No saved tickets.</div></Box> : tickets.map((t) => (
            <Box key={t.id}>
              <div className="text-sm text-white">{t.name}</div>
              <div className="text-[11px] text-text-muted">{t.lines.length} lines · {t.status}</div>
            </Box>
          ))}
        </div>
      )}

      {tab === "numbers" && (
        <div className="px-4 mt-4 space-y-2">
          <Box>
            <div className="text-xs text-text-muted">Cold (window)</div>
            <div className="text-sm text-white">{dash?.coldMain.join(" · ") || "—"}</div>
          </Box>
          <Box>
            <div className="text-xs text-text-muted">Longest gaps</div>
            <div className="text-sm text-white">{dash?.longestGaps.map((g) => `${g.number} (${g.drawsSince ?? "—"})`).join(" · ") || "—"}</div>
            <div className="text-[11px] text-text-muted mt-1">Absence ≠ higher next-draw probability.</div>
          </Box>
        </div>
      )}
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-bg-elevated px-4 py-3">{children}</div>;
}
