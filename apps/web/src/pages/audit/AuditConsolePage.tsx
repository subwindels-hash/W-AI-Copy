import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Download, Calendar, Filter, Clock, Search } from "lucide-react";
import * as audit from "@/lib/audit";
import type { AuditLog, AuditTimelineEntry } from "@windels/shared/audit";
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, auditActionCategory } from "@windels/shared/audit";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";

function catColor(cat: string): "slate"|"azure"|"emerald"|"amber"|"violet"|"crimson" {
  switch(cat){
    case "authentication": return "azure";
    case "authorization": return "violet";
    case "data": return "emerald";
    case "system": return "slate";
    case "security": return "crimson";
    case "billing": return "amber";
    case "ai": return "violet";
    default: return "slate";
  }
}

export function AuditConsolePage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [timeline, setTimeline] = useState<AuditTimelineEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  // filters
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [userId, setUserId] = useState("");
  const [limit, setLimit] = useState("20");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [qr, tl, st] = await Promise.all([
        audit.queryAudit({
          action: action as any || undefined,
          resourceType: resourceType as any || undefined,
          userId: userId || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          limit: Number(limit) || 20,
        }),
        audit.getAuditTimeline(14).catch(()=> ({ days:14, entries:[] } as any)),
        audit.getAuditStats(30).catch(()=> ({ stats:{}, period:{days:30}} as any)),
      ]);
      setLogs(qr.logs); setTotal(qr.total);
      setTimeline(tl.entries ?? []);
      setStats(st.stats ?? {});
    } catch(e){ setError(e instanceof Error ? e.message : String(e)); }
    finally{ setLoading(false); }
  }, [action, resourceType, userId, limit, startDate, endDate]);

  useEffect(()=> { void load(); }, [load]);

  async function handleExport(format: "json"|"csv") {
    if(!exportStart || !exportEnd){ setError("Pick start and end dates for export"); return; }
    try{
      const blob = await audit.exportAudit({ startDate: new Date(exportStart).toISOString(), endDate: new Date(exportEnd).toISOString(), format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `audit-${exportStart}-to-${exportEnd}.${format}`;
      a.click(); URL.revokeObjectURL(url);
    } catch(e){ setError(e instanceof Error ? e.message : String(e)); }
  }

  async function openDetail(id: string){
    try{ const d = await audit.getAuditById(id); setDetail(d); } catch(e){ setError(e instanceof Error ? e.message : String(e)); }
  }

  const topStats = Object.entries(stats).sort((a,b)=> b[1]-a[1]).slice(0,6);
  const maxTimeline = Math.max(1, ...timeline.map(e=> e.total));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald" />
            <h1 className="text-2xl font-black text-text-bright">Audit Trail</h1>
            <Badge variant="emerald">Session 130</Badge>
            <Badge variant="slate">{total} total</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">Organization-scoped audit log — every action is attributed and timestamped. No cross-tenant leak, empty windows are zero-filled not hidden.</p>
        </div>
        <Button size="sm" variant="outline" onClick={()=> void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error} <button className="float-right" onClick={()=> setError(null)}>✕</button></div> : null}

      {/* Stats bar */}
      <Card>
        <CardContent className="p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-2"><Filter className="h-3 w-3" /> Top actions (30d)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {topStats.length ? topStats.map(([act,c])=> (
              <Badge key={act} variant={catColor(auditActionCategory(act as any))}>{act} · {c}</Badge>
            )) : <span className="text-sm text-text-muted">No audit events in the last 30 days.</span>}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-azure" /> 14-day timeline</CardTitle><CardDescription>Daily total — zero days are rendered as empty bars, never omitted. Hover for by-action breakdown.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-24">
            {timeline.length ? timeline.map(e=> (
              <div key={e.date} className="flex-1 flex flex-col items-center gap-1" title={`${e.date}: ${e.total} — ${Object.entries(e.byAction).map(([k,v])=> `${k}=${v}`).join(", ") || "no events"}`}>
                <div className="w-full rounded-t bg-azure/70" style={{ height: `${(e.total / maxTimeline)*80}px`, minHeight: e.total? '4px':'1px', opacity: e.total?1:0.15 }} />
                <span className="text-[9px] text-text-muted rotate-[-45deg] origin-left whitespace-nowrap">{e.date.slice(5)}</span>
              </div>
            )) : <span className="text-sm text-text-muted">No timeline data.</span>}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <Select value={action} onChange={e=> setAction(e.target.value)}>
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map(a=> <option key={a} value={a}>{a}</option>)}
            </Select>
            <Select value={resourceType} onChange={e=> setResourceType(e.target.value)}>
              <option value="">All resources</option>
              {AUDIT_RESOURCE_TYPES.map(r=> <option key={r} value={r}>{r}</option>)}
            </Select>
            <Input placeholder="User ID" value={userId} onChange={e=> setUserId(e.target.value)} />
            <Input type="datetime-local" value={startDate} onChange={e=> setStartDate(e.target.value)} placeholder="Start" />
            <Input type="datetime-local" value={endDate} onChange={e=> setEndDate(e.target.value)} placeholder="End" />
            <Select value={limit} onChange={e=> setLimit(e.target.value)}>
              <option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option>
            </Select>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={()=> void load()}><Search className="h-4 w-4" />Search</Button>
            <Button size="sm" variant="ghost" onClick={()=> { setAction(""); setResourceType(""); setUserId(""); setStartDate(""); setEndDate(""); setLimit("20"); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-azure" /> Audit log</CardTitle><CardDescription>Click a row to open full detail (metadata, IP, user-agent, request ID). Paginated via limit/offset.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {logs.map(row=> (
              <button key={row.id} onClick={()=> void openDetail(row.id)} className="w-full text-left flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10">
                <span className="text-xs font-mono text-text-muted">{new Date(row.createdAt).toLocaleString()}</span>
                <Badge variant={catColor(auditActionCategory(row.action as any))}>{row.action}</Badge>
                {row.resourceType ? <Badge variant="slate">{row.resourceType}</Badge> : null}
                {row.resourceId ? <span className="text-xs font-mono text-text-muted truncate max-w-[180px]">{row.resourceId}</span> : null}
                {row.userId ? <span className="text-xs text-text-muted">user:{row.userId.slice(0,8)}</span> : <span className="text-xs text-text-muted">system</span>}
                <span className="ml-auto text-xs text-text-muted">{row.ipAddress ?? ""}</span>
              </button>
            ))}
            {logs.length===0 ? <p className="py-8 text-center text-sm text-text-muted">No audit entries match the current filters.</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-azure" /> Export for compliance</CardTitle><CardDescription>Pick a date window and download JSON or CSV. CSV is RFC-4180 escaped.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input type="datetime-local" value={exportStart} onChange={e=> setExportStart(e.target.value)} placeholder="Export start" className="max-w-xs" />
          <Input type="datetime-local" value={exportEnd} onChange={e=> setExportEnd(e.target.value)} placeholder="Export end" className="max-w-xs" />
          <Button size="sm" variant="outline" onClick={()=> void handleExport("json")}><Download className="h-4 w-4" />JSON</Button>
          <Button size="sm" variant="outline" onClick={()=> void handleExport("csv")}><Download className="h-4 w-4" />CSV</Button>
        </CardContent>
      </Card>

      {/* Detail drawer */}
      {detail ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={()=> setDetail(null)} />
          <div className="w-full max-w-lg bg-bg-dark border-l border-white/10 p-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-text-bright">Audit detail</h3>
              <Button size="sm" variant="ghost" onClick={()=> setDetail(null)}>Close</Button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="text-text-muted">ID</span><div className="font-mono text-text-bright break-all">{detail.id}</div></div>
              <div><span className="text-text-muted">Action</span><div><Badge variant={catColor(auditActionCategory(detail.action as any))}>{detail.action}</Badge></div></div>
              <div><span className="text-text-muted">Resource</span><div className="font-mono text-text-bright">{detail.resourceType ?? "—"} {detail.resourceId ?? ""}</div></div>
              <div><span className="text-text-muted">User / Org</span><div className="font-mono text-text-bright">{detail.userId ?? "—"} / {detail.organizationId ?? "—"}</div></div>
              <div><span className="text-text-muted">IP / Request</span><div className="font-mono text-text-bright">{detail.ipAddress ?? "—"} / {detail.requestId ?? "—"}</div></div>
              <div><span className="text-text-muted">User-Agent</span><div className="font-mono text-text-bright break-all text-xs">{detail.userAgent ?? "—"}</div></div>
              <div><span className="text-text-muted">At</span><div className="text-text-bright">{new Date(detail.createdAt).toLocaleString()}</div></div>
              <div><span className="text-text-muted">Metadata</span><pre className="mt-1 max-h-64 overflow-auto rounded bg-black/30 p-3 text-xs font-mono text-text-bright">{JSON.stringify(detail.metadata ?? {}, null, 2)}</pre></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
