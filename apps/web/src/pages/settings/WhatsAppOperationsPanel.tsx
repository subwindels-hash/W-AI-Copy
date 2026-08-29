/**
 * Settings → Channels → WhatsApp → operations (Phase 2 §16).
 *
 * Extends the Phase 1 panel rather than replacing it: connection + settings
 * stay where they are, and this component adds the live operational views —
 * conversations, the message log, background jobs, and a real connectivity
 * test.
 *
 * Every number shown is read from the API. Nothing is simulated, and an empty
 * state says "none yet" instead of inventing sample traffic.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import * as wa from "@/lib/whatsapp";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const MSG_STATUS: Record<string, "emerald" | "amber" | "crimson" | "slate" | "azure"> = {
  READ: "emerald",
  DELIVERED: "emerald",
  SENT: "azure",
  PENDING: "amber",
  QUEUED: "amber",
  RECEIVED: "slate",
  FAILED: "crimson",
};

const JOB_STATUS: Record<string, "emerald" | "amber" | "crimson" | "slate" | "azure"> = {
  COMPLETED: "emerald",
  RUNNING: "azure",
  QUEUED: "amber",
  FAILED: "crimson",
  CANCELLED: "slate",
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-text-muted">{children}</p>;
}

export default function WhatsAppOperationsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState("conversations");

  const [status, setStatus] = useState<wa.WhatsAppStatus | null>(null);
  const [conversations, setConversations] = useState<wa.WhatsAppConversationListItem[] | null>(null);
  const [messages, setMessages] = useState<wa.WhatsAppMessageRow[] | null>(null);
  const [jobs, setJobs] = useState<wa.WhatsAppJobRow[] | null>(null);

  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "INBOUND" | "OUTBOUND">("");
  const [jobFilter, setJobFilter] = useState("");

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<wa.WhatsAppTestResult | null>(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await wa.getStatus()); } catch { /* the parent panel surfaces channel errors */ }
  }, []);

  useEffect(() => {
    void loadStatus();
    const t = setInterval(() => { void loadStatus(); }, 20_000);
    return () => clearInterval(t);
  }, [loadStatus]);

  useEffect(() => {
    if (tab !== "conversations") return;
    void wa.listConversations({ limit: 50 }).then(setConversations).catch(() => setConversations([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== "messages") return;
    void wa
      .listMessages({ limit: 100, ...(direction ? { direction } : {}) })
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [tab, direction]);

  useEffect(() => {
    if (tab !== "jobs") return;
    void wa
      .listJobs({ limit: 50, ...(jobFilter ? { status: jobFilter } : {}) })
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [tab, jobFilter]);

  const filteredConversations = (conversations ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.contact.displayName ?? "").toLowerCase().includes(q) ||
      (c.contact.phoneNumber ?? "").toLowerCase().includes(q)
    );
  });

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await wa.testChannel(testTo.trim() ? { to: testTo.trim() } : {});
      setTestResult(result);
      toast[result.passed ? "success" : "error"](
        result.passed ? "Channel test passed" : "Channel test found problems",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Channel test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operations</CardTitle>
        <CardDescription>
          Live conversations, message log, background jobs and connectivity testing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Live pipeline health ─────────────────────────────────── */}
        {status && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Queue", value: status.queueDepth, bad: status.queueDepth > 50 },
              { label: "Dead letter", value: status.dlqDepth, bad: status.dlqDepth > 0 },
              { label: "Jobs pending", value: status.pendingJobs, bad: false },
              { label: "Jobs running", value: status.runningJobs, bad: false },
              { label: "Active sessions", value: status.activeSessions, bad: false },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className={cn("text-xl font-semibold", s.bad ? "text-crimson" : "text-text-bright")}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="messages">Message log</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            {isAdmin && <TabsTrigger value="test">Test</TabsTrigger>}
          </TabsList>

          {/* ── Conversations ──────────────────────────────────────── */}
          <TabsContent value="conversations" className="pt-4">
            <Input
              placeholder="Search by name or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-3 max-w-sm"
            />
            {conversations === null ? (
              <Skeleton className="h-24 w-full" />
            ) : filteredConversations.length === 0 ? (
              <Empty>{conversations.length === 0 ? "No conversations yet." : "No conversations match that search."}</Empty>
            ) : (
              <ul className="space-y-2">
                {filteredConversations.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-bright">
                          {c.contact.displayName || c.contact.phoneNumber || "Unknown"}
                        </span>
                        {c.contact.linked ? (
                          <Badge variant="emerald">linked</Badge>
                        ) : (
                          <Badge variant="slate">unverified</Badge>
                        )}
                        {c.status === "ESCALATED" && <Badge variant="amber">escalated</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-text-muted">
                        {c.contact.phoneNumber} · {c.messageCount} messages
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-text-muted">{fmtWhen(c.lastMessageAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ── Message log ────────────────────────────────────────── */}
          <TabsContent value="messages" className="pt-4">
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              className="mb-3 max-w-[200px]"
            >
              <option value="">All directions</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
            </Select>
            {messages === null ? (
              <Skeleton className="h-24 w-full" />
            ) : messages.length === 0 ? (
              <Empty>No messages recorded yet.</Empty>
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={m.direction === "INBOUND" ? "azure" : "violet"}>
                          {m.direction === "INBOUND" ? "in" : "out"}
                        </Badge>
                        <Badge variant={MSG_STATUS[m.status] ?? "slate"}>{m.status.toLowerCase()}</Badge>
                        {m.messageType !== "TEXT" && (
                          <span className="text-xs text-text-muted">{m.messageType.toLowerCase()}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-text-muted">{fmtWhen(m.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-text-main">
                      {m.text ?? <span className="italic text-text-muted">hidden — admin access required</span>}
                    </p>
                    {m.errorMessage && (
                      <p className="mt-1 text-xs text-crimson">
                        {m.errorCode ? `${m.errorCode}: ` : ""}{m.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Jobs ───────────────────────────────────────────────── */}
          <TabsContent value="jobs" className="pt-4">
            <Select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="mb-3 max-w-[200px]"
            >
              <option value="">All statuses</option>
              <option value="QUEUED">Queued</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </Select>
            {jobs === null ? (
              <Skeleton className="h-24 w-full" />
            ) : jobs.length === 0 ? (
              <Empty>No background jobs yet. Commands like “create report …” appear here.</Empty>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <div key={j.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={JOB_STATUS[j.status] ?? "slate"}>{j.status.toLowerCase()}</Badge>
                        <span className="font-medium text-text-bright">{j.kind.replace(/_/g, " ")}</span>
                        {j.attempts > 1 && (
                          <span className="text-xs text-text-muted">attempt {j.attempts}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-text-muted">{fmtWhen(j.createdAt)}</span>
                    </div>
                    {j.requestText && <p className="mt-1 line-clamp-1 text-text-muted">{j.requestText}</p>}
                    {j.resultText && <p className="mt-1 line-clamp-2 text-text-main">{j.resultText}</p>}
                    {j.errorMessage && <p className="mt-1 text-xs text-crimson">{j.errorMessage}</p>}
                    {j.workflowRunId && (
                      <p className="mt-1 text-xs text-text-muted">workflow run {j.workflowRunId}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Connectivity test ──────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="test" className="pt-4">
              <p className="mb-3 text-sm text-text-muted">
                Checks the stored credentials against the Meta Graph API for real. Add a number to
                send an actual WhatsApp message — it will be delivered and billed like any other.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Optional: recipient number, e.g. 2348012345678"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="max-w-sm"
                />
                <Button loading={testing} onClick={() => void runTest()}>Run test</Button>
              </div>

              {testResult && (
                <div className="mt-4 space-y-2">
                  {testResult.checks.map((c) => (
                    <div
                      key={c.name}
                      className={cn(
                        "rounded-lg border p-3 text-sm",
                        c.ok ? "border-emerald/20 bg-emerald/5" : "border-crimson/20 bg-crimson/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={c.ok ? "emerald" : "crimson"}>{c.ok ? "pass" : "fail"}</Badge>
                        <span className="font-medium text-text-bright">{c.name.replace(/_/g, " ")}</span>
                      </div>
                      <p className="mt-1 text-text-main">{c.detail}</p>
                    </div>
                  ))}
                  {testResult.verifiedName && (
                    <p className="text-xs text-text-muted">
                      Verified name: {testResult.verifiedName}
                      {testResult.qualityRating ? ` · quality ${testResult.qualityRating}` : ""}
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
