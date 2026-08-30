import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, CheckCircle2, Clock, History, Loader2, Play, Plus,
  Trash2, XCircle, Zap,
} from "lucide-react";
import { cronJobsApi, CRON_TASK_LABELS, CRON_PRIVACY_NOTE, type CronAdminOverview, type CronJob, type CronJobInput, type CronRunLog } from "@/lib/cronJobs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";

const TASK_TYPES = ["http_webhook", "exchange_rate_refresh", "health_report", "cleanup_expired", "log_heartbeat"] as const;

const statusBadge = (status: CronJob["lastStatus"]) => ({
  ok: "emerald", error: "crimson", never: "outline",
}[status] as "emerald" | "crimson" | "outline");

function emptyForm(): CronJobInput {
  return { name: "", expression: "0 * * * *", taskType: "log_heartbeat", payload: {}, enabled: true };
}

export function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [overview, setOverview] = useState<CronAdminOverview | null>(null);
  const [logs, setLogs] = useState<CronRunLog[]>([]);
  const [form, setForm] = useState<CronJobInput>(emptyForm);
  const [payloadUrl, setPayloadUrl] = useState("");
  const [payloadBody, setPayloadBody] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [j, o, l] = await Promise.all([cronJobsApi.jobs(), cronJobsApi.overview(), cronJobsApi.logs(40)]);
    setJobs(j); setOverview(o); setLogs(l);
  }, []);

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, [load]);

  const run = useCallback(async (key: string, work: () => Promise<string>) => {
    setBusy(key); setError(null); setNotice(null);
    try { setNotice(await work()); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm()); setPayloadUrl(""); setPayloadBody(""); setModalOpen(true);
  };

  const save = () => run("save", async () => {
    const payload: Record<string, string> = {};
    if (form.taskType === "http_webhook") {
      if (!payloadUrl.trim()) throw new Error("Webhook URL is required for this task type.");
      payload.url = payloadUrl.trim();
      if (payloadBody.trim()) payload.body = payloadBody.trim();
    }
    await cronJobsApi.create({ ...form, payload });
    setModalOpen(false);
    return `Cron job "${form.name}" created and scheduled.`;
  });

  const toggle = (job: CronJob) => run(`toggle:${job.id}`, async () => {
    await cronJobsApi.setEnabled(job.id, !job.enabled);
    return `Cron job "${job.name}" ${job.enabled ? "paused" : "resumed"}.`;
  });

  const runNow = (job: CronJob) => run(`run:${job.id}`, async () => {
    const result = await cronJobsApi.runNow(job.id);
    return `"${job.name}" finished: ${result.lastStatus === "ok" ? "success" : "error"} (${result.lastRunMs ?? 0}ms).`;
  });

  const remove = (job: CronJob) => run(`remove:${job.id}`, async () => {
    await cronJobsApi.remove(job.id);
    return `Cron job "${job.name}" deleted.`;
  });

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="crimson" className="mb-2"><CalendarClock className="mr-1 h-3 w-3" /> Super Admin · Cron</Badge>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><Clock className="h-6 w-6 text-azure" /> Cron Jobs</h1>
          <p className="mt-1 text-sm text-text-muted">Schedule and run platform-level jobs on standard 5-field cron expressions. Jobs are stored in Redis and dispatched by the in-process scheduler every 30 seconds.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> New cron job</Button>
      </div>

      {error && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}</div>}
      {notice && !error && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total jobs" value={overview?.total ?? "…"} tint="azure" />
        <StatCard label="Enabled" value={overview?.enabled ?? "…"} tint="emerald" />
        <StatCard label="Due in next hour" value={overview?.dueSoon ?? "…"} tint="violet" />
        <StatCard label="Last runs OK" value={overview?.lastRunsOk ?? "…"} tint="emerald" />
        <StatCard label="Last runs error" value={overview?.lastRunsError ?? "…"} tint="crimson" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-azure" /> Scheduled jobs</CardTitle>
          <CardDescription>Each row shows the cron expression, next fire time, and last outcome.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-text-muted">No cron jobs yet. Create one to schedule a platform task.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text-bright">{job.name}</span>
                      <Badge variant={job.enabled ? "emerald" : "outline"}>{job.enabled ? "Enabled" : "Paused"}</Badge>
                      <Badge variant={statusBadge(job.lastStatus)}>last: {job.lastStatus}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      <code className="rounded bg-black/20 px-1.5 py-0.5 text-azure">{job.expression}</code>
                      <span className="mx-2">·</span>
                      {CRON_TASK_LABELS[job.taskType]}
                      <span className="mx-2">·</span>
                      next: {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "—"}
                      {job.lastRunAt && <><span className="mx-2">·</span>last run: {new Date(job.lastRunAt).toLocaleString()} {job.lastRunMs != null ? `(${job.lastRunMs}ms)` : ""}</>}
                    </div>
                    {job.lastError && <div className="mt-1 text-xs text-crimson">Error: {job.lastError}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void runNow(job)} disabled={busy === `run:${job.id}`}><Play className="h-3.5 w-3.5" /> Run now</Button>
                    <Button size="sm" variant="outline" onClick={() => void toggle(job)} disabled={busy === `toggle:${job.id}`}>{job.enabled ? "Pause" : "Resume"}</Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(job)} disabled={busy === `remove:${job.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-azure" /> Recent runs</CardTitle><CardDescription>Latest dispatched executions, newest first.</CardDescription></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-text-muted">No runs recorded yet. Use "Run now" or wait for a schedule.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3 py-2">
                  {log.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <XCircle className="h-4 w-4 text-crimson" />}
                  <span className="font-semibold text-text-bright">{log.jobName}</span>
                  <span className="text-xs text-text-muted">{new Date(log.startedAt).toLocaleString()}</span>
                  <span className="text-xs text-text-muted">{log.durationMs}ms</span>
                  {log.error && <span className="text-xs text-crimson">{log.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber/15 bg-amber/5 p-3 text-[11px] leading-relaxed text-text-muted">
        <strong className="text-text-bright">Security note:</strong> {CRON_PRIVACY_NOTE}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md" title="New cron job"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={busy === "save"}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Create</Button></>}>
        <div className="space-y-4">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Daily exchange-rate refresh" />
          <Field label="Cron expression (5 fields)" value={form.expression} onChange={(v) => setForm({ ...form, expression: v })} placeholder="0 0 * * *" hint="minute hour day-of-month month day-of-week. e.g. 0 0 * * * = daily at midnight." />
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">Task type</label>
            <Select value={form.taskType} onChange={(e) => setForm({ ...form, taskType: e.target.value as CronJobInput["taskType"] })}>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{CRON_TASK_LABELS[t]}</option>)}
            </Select>
          </div>
          {form.taskType === "http_webhook" && (
            <>
              <Field label="Webhook URL" value={payloadUrl} onChange={setPayloadUrl} placeholder="https://hooks.example.com/…" />
              <Field label="Request body (optional)" value={payloadBody} onChange={setPayloadBody} placeholder='{"event":"daily"}' />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string | number; tint: "emerald" | "azure" | "violet" | "crimson" }) {
  const tints: Record<string, string> = {
    emerald: "text-emerald bg-emerald/15",
    azure: "text-sky bg-azure/15",
    violet: "text-violet bg-violet/15",
    crimson: "text-crimson bg-crimson/15",
  };
  return <Card><div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${tints[tint]}`}><Clock className="h-5 w-5" /></div><div className="text-lg font-bold text-text-bright">{value}</div><div className="text-xs text-text-muted">{label}</div></Card>;
}
