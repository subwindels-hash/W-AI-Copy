import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import * as billing from "@/lib/billing";
import { api } from "@/lib/api";

export default function AnalyticsPage() {
  const [insights, setInsights] = useState<billing.PredictiveInsights | null>(null);
  const [workflowAnalytics, setWorkflowAnalytics] = useState<any>(null);
  useEffect(() => {
    billing.getInsights().then(setInsights).catch(()=>{});
    api.get("/workflows/analytics/overview").then(setWorkflowAnalytics).catch(()=>{});
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 h-[calc(100vh-56px)] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-bright">Analytics</h1>
        <p className="text-sm text-text-muted mt-1">Usage, performance, and predictive insights across your organization.</p>
      </div>

      {workflowAnalytics?.runs && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Workflows" value={workflowAnalytics.workflows} />
          <Stat label="Total runs" value={workflowAnalytics.runs.total} />
          <Stat label="Success rate" value={`${workflowAnalytics.runs.successRate}%`} tone="emerald" />
          <Stat label="Avg run time" value={`${workflowAnalytics.runs.avgDurationMs}ms`} />
        </div>
      )}

      {workflowAnalytics?.byDay && (
        <Card>
          <CardHeader><CardTitle>Runs over last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {workflowAnalytics.byDay.map((d: any) => {
                const max = Math.max(1, ...workflowAnalytics.byDay.map((x:any)=>x.total));
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col-reverse" style={{ height: "120px" }}>
                      <div className="w-full bg-emerald/60 rounded-t" style={{ height: `${(d.succeeded/max)*100}%` }} title={`${d.succeeded} succeeded`}/>
                      <div className="w-full bg-crimson/60" style={{ height: `${(d.failed/max)*100}%` }} title={`${d.failed} failed`}/>
                    </div>
                    <div className="text-[9px] text-text-muted">{d.date.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {insights && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Usage (30d)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(insights.usage).map(([k,v]) => (
                <div key={k} className="flex justify-between"><span className="text-text-muted capitalize">{k.replace("30d","")}</span><span className="text-text-bright font-medium">{v}</span></div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Smart insights</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {insights.insights.map((i,idx) => <li key={idx} className="flex gap-2"><span>💡</span>{i}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {workflowAnalytics?.topWorkflows?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Top workflows</CardTitle><CardDescription>By run count</CardDescription></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted text-left"><th className="py-2">Name</th><th>Runs</th><th>Success</th><th>Failed</th><th>Last run</th></tr></thead>
              <tbody>
                {workflowAnalytics.topWorkflows.map((w: any) => (
                  <tr key={w.id} className="border-t border-white/5">
                    <td className="py-2 text-text-bright">{w.name}</td>
                    <td>{w.runsCount}</td>
                    <td><Badge variant="emerald">{w.successCount}</Badge></td>
                    <td><Badge variant={w.failureCount>0?"crimson":"slate"}>{w.failureCount}</Badge></td>
                    <td className="text-text-muted text-xs">{w.lastRunAt ? new Date(w.lastRunAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "azure" }: { label: string; value: any; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-text-muted">{label}</div>
        <div className={`text-2xl font-semibold mt-1 text-${tone}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
