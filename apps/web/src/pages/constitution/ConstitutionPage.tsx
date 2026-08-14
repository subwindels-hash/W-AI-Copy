/**
 * Session 163 — Constitution Studio console (/app/constitution).
 *
 * Tabs: Policies · Constitution · Check · Violations
 *
 * Honesty:
 *   - the gate FAILS CLOSED. An organization with no published constitution
 *     gets `allowed: false` / posture "unconfigured", not a silent pass. Before
 *     S163 an unconfigured org received `allowed: true` for every request.
 *   - checking is a deterministic rule engine (keywords, monetary thresholds,
 *     human-approval requirements) plus a baseline safety blocklist. It is NOT
 *     a semantic classifier and cannot judge intent — the page says so.
 *   - a policy with no machine-checkable rule is labelled "not enforceable":
 *     it documents an intention and cannot block anything.
 *   - coveredWorkforces renders "—": nothing in the platform measures it.
 *   - activeVersion renders "—" when no constitution exists, never "0".
 */
import { useCallback, useEffect, useState } from "react";
import { Scale, ShieldCheck, ShieldAlert, FileText, Search, AlertTriangle, Loader2, Plus } from "lucide-react";
import {
  constitutionApi,
  type Constitution, type ConstitutionDashboard, type ConstitutionPolicy,
  type ConstitutionViolation, type CheckResult, type ConstitutionDomain,
} from "@/lib/constitution";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const DOMAINS: ConstitutionDomain[] = [
  "corporate_ethics", "decision_boundaries", "risk_appetite", "brand_standards",
  "communication_style", "regulatory_compliance", "industry_rules", "regional_policies",
  "escalation_requirements", "human_approval_rules", "ai_decision_limits",
];

const label = (d: string) => d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** An unmeasured figure renders as an em dash, never as a plausible number. */
function fmt(n: number | null | undefined) {
  return n == null ? "—" : String(n);
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

function PostureBanner({ posture }: { posture: ConstitutionDashboard["posture"] }) {
  if (posture === "enforced") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-sm">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
        <div>
          <div className="font-medium text-emerald-300">Enforcing</div>
          <div className="text-slate-400 text-xs">
            Requests are checked against this organization's active constitution.
          </div>
        </div>
      </div>
    );
  }
  if (posture === "fail_open") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
        <div>
          <div className="font-medium text-amber-300">Failing open — requests pass unchecked</div>
          <div className="text-slate-400 text-xs">
            No constitution is published and <code>WINDELS_CONSTITUTION_FAIL_OPEN</code> is set,
            so requests are allowed without any policy check. Publish a constitution and unset
            the flag to enforce.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm">
      <ShieldAlert className="h-4 w-4 mt-0.5 text-rose-400 shrink-0" />
      <div>
        <div className="font-medium text-rose-300">Not configured — the gate is refusing</div>
        <div className="text-slate-400 text-xs">
          This organization has published no constitution, so nothing can be reviewed and every
          check is refused. Create policies and publish a constitution to enable enforcement.
        </div>
      </div>
    </div>
  );
}

export function ConstitutionPage() {
  const [dash, setDash] = useState<ConstitutionDashboard | null>(null);
  const [policies, setPolicies] = useState<ConstitutionPolicy[]>([]);
  const [active, setActive] = useState<{ constitution?: Constitution; policies: ConstitutionPolicy[] } | null>(null);
  const [violations, setViolations] = useState<ConstitutionViolation[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // policy form
  const [pDomain, setPDomain] = useState<ConstitutionDomain>("corporate_ethics");
  const [pTitle, setPTitle] = useState("");
  const [pStatement, setPStatement] = useState("");
  const [pLevel, setPLevel] = useState<ConstitutionPolicy["enforcementLevel"]>("required");
  const [pRuleKind, setPRuleKind] = useState<"none" | "keyword" | "monetary_threshold" | "requires_human">("none");
  const [pRuleValue, setPRuleValue] = useState("");

  // publish form
  const [cName, setCName] = useState("Enterprise Constitution");

  // check form
  const [qText, setQText] = useState("");
  const [qAmount, setQAmount] = useState("");
  const [qActionKind, setQActionKind] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  const load = useCallback(async () => {
    const [d, p, a, v] = await Promise.all([
      constitutionApi.dashboard(), constitutionApi.policies(),
      constitutionApi.active(), constitutionApi.violations(),
    ]);
    setDash(d); setPolicies(p); setActive(a); setViolations(v);
  }, []);

  useEffect(() => { load().catch((e) => setMsg(String(e))); }, [load]);

  async function createPolicy() {
    setBusy(true); setMsg(null);
    try {
      let rule: any;
      if (pRuleKind === "keyword" && pRuleValue.trim()) {
        rule = { kind: "keyword", keywords: pRuleValue.split(",").map((s) => s.trim()).filter(Boolean) };
      } else if (pRuleKind === "monetary_threshold" && pRuleValue.trim()) {
        rule = { kind: "monetary_threshold", maxUsd: Number(pRuleValue) };
      } else if (pRuleKind === "requires_human" && pRuleValue.trim()) {
        rule = { kind: "requires_human", actionKinds: pRuleValue.split(",").map((s) => s.trim()).filter(Boolean) };
      }
      await constitutionApi.upsertPolicy({
        domain: pDomain, title: pTitle, statement: pStatement,
        enforcementLevel: pLevel, status: "approved", ...(rule ? { rule } : {}),
      } as any);
      setPTitle(""); setPStatement(""); setPRuleValue("");
      await load();
      setMsg("Policy saved.");
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setMsg(null);
    try {
      const approved = policies.filter((p) => p.status === "approved").map((p) => p.id);
      if (!approved.length) { setMsg("Approve at least one policy before publishing."); return; }
      await constitutionApi.publish({ name: cName, policyIds: approved });
      await load();
      setMsg("Constitution published — the gate is now enforcing.");
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  }

  async function runCheck() {
    setBusy(true); setMsg(null); setResult(null);
    try {
      const context: Record<string, unknown> = {};
      if (qAmount.trim()) context.amountUsd = Number(qAmount);
      if (qActionKind.trim()) context.actionKind = qActionKind.trim();
      const r = await constitutionApi.check({
        source: "console", promptOrAction: qText,
        ...(Object.keys(context).length ? { context } : {}),
      });
      setResult(r);
      await load();
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Constitution Studio</h1>
      </div>

      {dash && <PostureBanner posture={dash.posture} />}
      {msg && <div className="text-xs rounded border border-slate-700 bg-slate-900 p-2">{msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Active version" value={fmt(dash?.activeVersion)} hint={dash?.activeVersion == null ? "none published" : undefined} />
        <Stat label="Policies" value={dash?.totalPolicies ?? "—"} />
        <Stat label="Approved" value={dash?.approvedPolicies ?? "—"} />
        <Stat label="Not enforceable" value={dash?.unenforceablePolicies ?? "—"} hint="approved, but no rule" />
        <Stat label="Covered workforces" value={fmt(dash?.coveredWorkforces)} hint="not measured" />
      </div>

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="constitution">Constitution</TabsTrigger>
          <TabsTrigger value="check">Check</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Plus className="h-4 w-4" /> New policy</CardTitle>
              <CardDescription className="text-xs">
                A statement is prose for humans. To make a policy enforceable, give it a rule —
                otherwise it is recorded as an intention and cannot block anything.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <Select value={pDomain} onChange={(e) => setPDomain(e.target.value as ConstitutionDomain)}>
                {DOMAINS.map((d) => <option key={d} value={d}>{label(d)}</option>)}
              </Select>
              <Select value={pLevel} onChange={(e) => setPLevel(e.target.value as ConstitutionPolicy["enforcementLevel"])}>
                <option value="advisory">advisory — logged only</option>
                <option value="required">required — warns</option>
                <option value="hard_block">hard_block — blocks</option>
              </Select>
              <Input placeholder="Title" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
              <Input placeholder="Statement (min 10 chars)" value={pStatement} onChange={(e) => setPStatement(e.target.value)} />
              <Select value={pRuleKind} onChange={(e) => setPRuleKind(e.target.value as any)}>
                <option value="none">No rule — not enforceable</option>
                <option value="keyword">Keyword match</option>
                <option value="monetary_threshold">Monetary threshold (USD)</option>
                <option value="requires_human">Requires human approval</option>
              </Select>
              <Input
                placeholder={
                  pRuleKind === "monetary_threshold" ? "e.g. 10000"
                  : pRuleKind === "none" ? "—"
                  : "comma-separated values"
                }
                disabled={pRuleKind === "none"}
                value={pRuleValue}
                onChange={(e) => setPRuleValue(e.target.value)}
              />
              <div>
                <Button onClick={createPolicy} disabled={busy || !pTitle || pStatement.length < 10}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save policy"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {policies.length === 0 && (
              <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
                No policies yet. This organization starts empty — nothing is pre-approved on your behalf.
              </div>
            )}
            {policies.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.title}</span>
                      <Badge>{label(p.domain)}</Badge>
                      <Badge>{p.enforcementLevel}</Badge>
                      <Badge>{p.status}</Badge>
                      {!p.rule && <Badge className="bg-amber-900 text-amber-200">not enforceable</Badge>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{p.statement}</div>
                    {p.rule && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        rule: {p.rule.kind}
                        {p.rule.kind === "keyword" && ` — ${p.rule.keywords.join(", ")}`}
                        {p.rule.kind === "monetary_threshold" && ` — over $${p.rule.maxUsd.toLocaleString()}`}
                        {p.rule.kind === "requires_human" && ` — ${p.rule.actionKinds.join(", ")}`}
                      </div>
                    )}
                    {p.approvedBy === "demo_seed" && (
                      <div className="text-[10px] text-amber-400 mt-1">
                        seeded demo policy — review and re-approve before relying on it
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 shrink-0">v{p.version}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="constitution" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Publish</CardTitle>
              <CardDescription className="text-xs">
                Publishing bundles every approved policy into a new version and supersedes the
                previous one. Until a constitution is published, the gate refuses all requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
              <Button onClick={publish} disabled={busy}>Publish</Button>
            </CardContent>
          </Card>

          {active?.constitution ? (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{active.constitution.name}</span>
                  <Badge>v{active.constitution.version}</Badge>
                  <Badge>{active.constitution.status}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-1">{active.constitution.description}</div>
                <div className="text-[10px] text-slate-500 mt-2">
                  {active.policies.length} policies · effective {active.constitution.effectiveFrom?.slice(0, 10) ?? "—"}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              No constitution published.
            </div>
          )}
        </TabsContent>

        <TabsContent value="check" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4" /> Check a request</CardTitle>
              <CardDescription className="text-xs">
                Deterministic evaluation only: keyword matches, monetary thresholds and
                human-approval requirements, plus a baseline safety blocklist. This is not a
                semantic classifier — it cannot detect an intent that uses none of its keywords
                and supplies no structured context.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Prompt or action" value={qText} onChange={(e) => setQText(e.target.value)} />
              <Input placeholder="context.amountUsd (optional)" value={qAmount} onChange={(e) => setQAmount(e.target.value)} />
              <Input placeholder="context.actionKind (optional)" value={qActionKind} onChange={(e) => setQActionKind(e.target.value)} />
              <div>
                <Button onClick={runCheck} disabled={busy || !qText}>Check</Button>
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={result.allowed ? "bg-emerald-900 text-emerald-200" : "bg-rose-900 text-rose-200"}>
                    {result.allowed ? "allowed" : "refused"}
                  </Badge>
                  <Badge>posture: {result.posture}</Badge>
                  <Badge>version: {fmt(result.constitutionVersion)}</Badge>
                </div>
                {result.reason && <div className="text-xs text-amber-300">{result.reason}</div>}
                <div className="text-[10px] text-slate-500">
                  evaluated: {result.evaluated.length ? result.evaluated.join(", ") : "nothing"}
                </div>
                {result.violations.map((v, i) => (
                  <div key={i} className="text-xs border-l-2 border-rose-700 pl-2">
                    <span className="font-medium">{label(v.domain)}</span>{" "}
                    <Badge>{v.action}</Badge> <Badge>{v.severity}</Badge>
                    {v.unmatchedDomain && <Badge className="bg-amber-900 text-amber-200">no policy configured</Badge>}
                    <div className="text-slate-400">{v.reason}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="violations" className="space-y-2">
          {violations.length === 0 && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              No violations recorded.
            </div>
          )}
          {violations.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>{label(v.domain)}</Badge>
                  <Badge>{v.action}</Badge>
                  <Badge>{v.severity}</Badge>
                  <span className="text-[10px] text-slate-500">{v.at.slice(0, 19).replace("T", " ")}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">{v.summary}</div>
                <div className="text-[10px] text-slate-500 mt-1">source: {v.source}</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ConstitutionPage;
