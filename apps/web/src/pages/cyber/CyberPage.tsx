/**
 * Session 161 — Cyber console (/app/cyber).
 *
 * Tabs: Academy · Labs · Challenges · Cloud Posture · Certifications · Ranges
 *
 * Honesty:
 *   - the cloud posture register starts EMPTY. WINDELS scans no cloud account;
 *     a finding is what an operator or an external scanner posted to it.
 *   - certifications are recorded credentials. The vendor exams are shown as
 *     "tracks" — available exams, never presented as held.
 *   - enrolled / rating / solvedBy are not collected and render "—", never 0.
 *   - there is no leaderboard, so rank renders "—", never "#0".
 *   - a lab is a register entry (local_state_only) — no VM is provisioned.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Shield, FlaskConical, Flag, Cloud, Award, Swords, Plus, Loader2, AlertTriangle, StopCircle,
} from "lucide-react";
import {
  cybApi, CYBER_LEVELS, CYBER_CLOUDS, CYBER_RANGE_KINDS, FINDING_SEVERITIES,
  type CyberDashboard, type CloudSecurityFinding, type CyberCertification,
  type CyberRange, type CyberLab, type CyberConnector,
} from "@/lib/cyber";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

/** An uncollected statistic renders as an em dash, never as 0. */
function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

function sevTone(s: string) {
  if (s === "critical") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  if (s === "high") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (s === "medium") return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  return "bg-slate-700/40 text-slate-400";
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function CyberPage() {
  const [dash, setDash] = useState<CyberDashboard | null>(null);
  const [findings, setFindings] = useState<CloudSecurityFinding[]>([]);
  const [certs, setCerts] = useState<CyberCertification[]>([]);
  const [ranges, setRanges] = useState<CyberRange[]>([]);
  const [labs, setLabs] = useState<CyberLab[]>([]);
  const [connectors, setConnectors] = useState<CyberConnector[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // finding form
  const [fCloud, setFCloud] = useState<(typeof CYBER_CLOUDS)[number]>("aws");
  const [fService, setFService] = useState("S3");
  const [fSeverity, setFSeverity] = useState<(typeof FINDING_SEVERITIES)[number]>("high");
  const [fRule, setFRule] = useState("");
  const [fResource, setFResource] = useState("");
  const [fRegion, setFRegion] = useState("us-east-1");

  // cert form
  const [cName, setCName] = useState("");
  const [cVendor, setCVendor] = useState("");
  const [cPassed, setCPassed] = useState(false);
  const [cScore, setCScore] = useState("");

  // range form
  const [rName, setRName] = useState("");
  const [rKind, setRKind] = useState<(typeof CYBER_RANGE_KINDS)[number]>("purple_team");

  // lab form
  const [lDomain, setLDomain] = useState("web_security");
  const [lDiff, setLDiff] = useState<(typeof CYBER_LEVELS)[number]>("intermediate");

  const load = useCallback(async () => {
    const [d, f, c, r, l, cn] = await Promise.all([
      cybApi.dashboard(), cybApi.findings(), cybApi.certifications(),
      cybApi.ranges(), cybApi.labs(), cybApi.connectors(),
    ]);
    setDash(d); setFindings(f); setCerts(c); setRanges(r); setLabs(l); setConnectors(cn);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.message ?? "request failed"); }
    finally { setBusy(false); }
  };

  if (!dash) {
    return <div className="p-6 flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const domains = Array.from(new Set(dash.courses.map((c) => c.domain)));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Shield className="h-6 w-6 text-sky-400 mt-0.5" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Cybersecurity Academy & Cloud Posture</h1>
          <p className="text-xs text-slate-400">
            Curriculum is a catalogue. Cloud findings, credentials, ranges and labs are your
            organization's own records — WINDELS does not scan your cloud accounts and provisions
            no live range.
          </p>
        </div>
      </div>

      {msg && <div className="text-xs text-slate-300 border border-white/10 rounded px-3 py-2">{msg}</div>}

      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Learners" value={fmt(dash.learners)} hint="recorded activity" />
        <Stat label="Courses" value={dash.coursesAvailable} hint="catalogue" />
        <Stat label="Active labs" value={dash.labsActive} />
        <Stat label="Certs held" value={dash.certificationsHeld} hint="recorded passes" />
        <Stat label="Open findings" value={dash.cloudFindingsOpen} />
        <Stat label="Critical" value={dash.cloudFindingsCritical} />
        <Stat label="Remediated 30d" value={dash.cloudFindingsRemediated30d} hint="real window" />
        <Stat label="Leaderboard" value={dash.leaderboardRank == null ? "—" : `#${dash.leaderboardRank}`} hint="no leaderboard exists" />
      </div>

      <Tabs defaultValue="academy">
        <TabsList>
          <TabsTrigger value="academy"><Shield className="h-3.5 w-3.5 mr-1" />Academy</TabsTrigger>
          <TabsTrigger value="labs"><FlaskConical className="h-3.5 w-3.5 mr-1" />Labs</TabsTrigger>
          <TabsTrigger value="challenges"><Flag className="h-3.5 w-3.5 mr-1" />Challenges</TabsTrigger>
          <TabsTrigger value="cloud"><Cloud className="h-3.5 w-3.5 mr-1" />Cloud Posture</TabsTrigger>
          <TabsTrigger value="certs"><Award className="h-3.5 w-3.5 mr-1" />Certifications</TabsTrigger>
          <TabsTrigger value="ranges"><Swords className="h-3.5 w-3.5 mr-1" />Ranges</TabsTrigger>
        </TabsList>

        {/* ------------------------------ Academy ----------------------------- */}
        <TabsContent value="academy">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Course catalogue</CardTitle>
              <CardDescription className="text-xs">
                Static curriculum. Enrollment counts and ratings are not collected, so they read “—”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {dash.courses.map((c) => (
                <div key={c.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                  <span className="flex-1 font-medium">{c.title}</span>
                  <Badge>{c.domain}</Badge>
                  <Badge>{c.level}</Badge>
                  <span className="text-slate-500">{c.durationHours}h · {c.modules} modules</span>
                  <span className="text-slate-500">enrolled {fmt(c.enrolled)}</span>
                  <span className="text-slate-500">rating {fmt(c.rating)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- Labs ------------------------------ */}
        <TabsContent value="labs">
          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Provision a lab</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Select value={lDomain} onChange={(e) => setLDomain(e.target.value)}>
                  {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
                <Select value={lDiff} onChange={(e) => setLDiff(e.target.value as any)}>
                  {CYBER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
                <Button size="sm" disabled={busy}
                  onClick={() => run(() => cybApi.startLab({ domain: lDomain as any, difficulty: lDiff }), "lab registered")}>
                  <Plus className="h-3 w-3 mr-1" />Register lab
                </Button>
                <p className="text-[10px] text-slate-500">
                  A lab row is a register entry. No container or VM is provisioned by this process.
                </p>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-sm">Labs</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {!labs.length && <div className="text-slate-500">No labs registered.</div>}
                {labs.map((l) => (
                  <div key={l.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <span className="flex-1 font-medium">{l.name}</span>
                    <Badge>{l.status}</Badge>
                    {l.provisioning === "local_state_only" && <Badge>local state only</Badge>}
                    {l.status !== "stopped" && l.status !== "expired" && (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => run(() => cybApi.stopLab(l.id), "lab stopped")}>
                        <StopCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ----------------------------- Challenges --------------------------- */}
        <TabsContent value="challenges">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Challenge catalogue</CardTitle>
              <CardDescription className="text-xs">
                Domain, points and difficulty are authored per challenge. Solve counts are not
                collected across tenants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {dash.challenges.map((c) => (
                <div key={c.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                  <Flag className="h-3 w-3 text-slate-400" />
                  <span className="flex-1 font-medium">{c.title}</span>
                  <Badge>{c.domain}</Badge>
                  <Badge>{c.difficulty}</Badge>
                  <span className="text-slate-500">{c.points} pts</span>
                  <span className="text-slate-500">solved by {fmt(c.solvedBy)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------- Cloud posture -------------------------- */}
        <TabsContent value="cloud">
          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Record a finding</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Select value={fCloud} onChange={(e) => setFCloud(e.target.value as any)}>
                  {CYBER_CLOUDS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input placeholder="service (S3, IAM…)" value={fService} onChange={(e) => setFService(e.target.value)} />
                <Select value={fSeverity} onChange={(e) => setFSeverity(e.target.value as any)}>
                  {FINDING_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input placeholder="rule" value={fRule} onChange={(e) => setFRule(e.target.value)} />
                <Input placeholder="resource" value={fResource} onChange={(e) => setFResource(e.target.value)} />
                <Input placeholder="region" value={fRegion} onChange={(e) => setFRegion(e.target.value)} />
                <Button size="sm" disabled={busy || !fRule || !fResource}
                  onClick={() => run(() => cybApi.createFinding({
                    cloud: fCloud, service: fService, severity: fSeverity,
                    rule: fRule, resource: fResource, region: fRegion,
                  }), "finding recorded")}>
                  <Plus className="h-3 w-3 mr-1" />Record
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Findings register</CardTitle>
                <CardDescription className="text-xs">{dash.provenance.findings}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {!findings.length && (
                  <div className="text-slate-500">
                    No findings recorded. WINDELS does not scan your cloud accounts — an empty
                    register means nothing was reported, not that you are secure.
                  </div>
                )}
                {findings.map((f) => (
                  <div key={f.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-slate-400" />
                    <span className="w-24 font-medium">{f.cloud}/{f.service}</span>
                    <span className="flex-1 text-slate-400">{f.rule}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${sevTone(f.severity)}`}>{f.severity}</span>
                    <Badge>{f.status}</Badge>
                    <Badge>{f.source}</Badge>
                    {f.status === "open" && (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => run(() => cybApi.updateFinding(f.id, { status: "remediated" }), "marked remediated")}>
                        remediate
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-3">
            <CardHeader><CardTitle className="text-sm">Connectors</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {connectors.map((c) => (
                <div key={c.id} className="p-2 border border-white/5 rounded">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{c.name}</span>
                    <Badge>{c.status}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{c.note}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------- Certifications ------------------------- */}
        <TabsContent value="certs">
          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Record a credential</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Input placeholder="name" value={cName} onChange={(e) => setCName(e.target.value)} />
                <Input placeholder="vendor" value={cVendor} onChange={(e) => setCVendor(e.target.value)} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={cPassed} onChange={(e) => setCPassed(e.target.checked)} />
                  passed
                </label>
                <Input placeholder="score % (optional)" value={cScore} onChange={(e) => setCScore(e.target.value)} />
                <Button size="sm" disabled={busy || !cName || !cVendor}
                  onClick={() => run(() => cybApi.createCertification({
                    name: cName, vendor: cVendor, passed: cPassed,
                    scorePct: cScore ? Number(cScore) : undefined,
                  }), "credential recorded")}>
                  <Plus className="h-3 w-3 mr-1" />Record
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Held credentials</CardTitle>
                <CardDescription className="text-xs">{dash.provenance.certifications}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {!certs.length && <div className="text-slate-500">No credentials recorded.</div>}
                {certs.map((c) => (
                  <div key={c.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <Award className="h-3 w-3 text-slate-400" />
                    <span className="flex-1 font-medium">{c.name}</span>
                    <Badge>{c.vendor}</Badge>
                    {c.passed
                      ? <Badge>passed{c.scorePct != null ? ` ${c.scorePct}%` : ""}</Badge>
                      : <Badge>prep {fmt(c.preparationProgressPct, "%")}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle className="text-sm">Available exam tracks</CardTitle>
              <CardDescription className="text-xs">
                Exams that exist and can be attempted. A track is not an achievement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {dash.certificationTracks.map((t) => (
                <div key={t.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                  <span className="flex-1">{t.name}</span>
                  <Badge>{t.vendor}</Badge>
                  <Badge>{t.level}</Badge>
                  <Badge>track</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- Ranges ----------------------------- */}
        <TabsContent value="ranges">
          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Schedule a range</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Input placeholder="name" value={rName} onChange={(e) => setRName(e.target.value)} />
                <Select value={rKind} onChange={(e) => setRKind(e.target.value as any)}>
                  {CYBER_RANGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
                <Button size="sm" disabled={busy || !rName}
                  onClick={() => run(() => cybApi.createRange({ name: rName, kind: rKind }), "range scheduled")}>
                  <Plus className="h-3 w-3 mr-1" />Schedule
                </Button>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-sm">Ranges</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {!ranges.length && <div className="text-slate-500">No ranges scheduled.</div>}
                {ranges.map((r) => (
                  <div key={r.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <Swords className="h-3 w-3 text-slate-400" />
                    <span className="flex-1 font-medium">{r.name}</span>
                    <Badge>{r.kind}</Badge>
                    <Badge>{r.status}</Badge>
                    {r.status === "scheduled" && (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => run(() => cybApi.updateRange(r.id, { status: "live" }), "range live")}>
                        go live
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
