/**
 * Session 90 — Enterprise CRM dashboard.
 *
 * Contacts, companies, a stage-aware deal pipeline and an activity ledger,
 * all served from the real org-scoped API. Every number on this page is
 * computed from stored records — there is no fabricated data here. A fresh
 * org starts empty (zeros); records appear as they are created.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { crmApi } from "@/lib/crm";
import type {
  CrmDashboardRollup,
  CrmContact,
  CrmCompany,
  CrmDeal,
  CrmActivity,
  CrmPipelineStage,
  CrmDealStageKey,
} from "@/lib/crm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Users, Building2, Target, TrendingUp, Trophy, Percent, PlusCircle, Phone, Mail, CalendarDays, StickyNote, XCircle } from "lucide-react";

const STAGE_VARIANT: Record<CrmDealStageKey, "slate" | "azure" | "violet" | "amber" | "emerald" | "danger"> = {
  lead: "slate",
  qualified: "azure",
  proposal: "violet",
  negotiation: "amber",
  closed_won: "emerald",
  closed_lost: "danger",
};

const STAGE_ORDER: CrmDealStageKey[] = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];

function fmtCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtPct(p: number | null): string {
  return p === null ? "—" : `${Math.round(p * 100)}%`;
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-azure">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function CrmPage() {
  const [rollup, setRollup] = useState<CrmDashboardRollup | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [activityKind, setActivityKind] = useState<CrmActivity["kind"]>("note");
  const [activitySubject, setActivitySubject] = useState("");

  // New-record form state
  const [cFirst, setCFirst] = useState("");
  const [cLast, setCLast] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [coName, setCoName] = useState("");
  const [coIndustry, setCoIndustry] = useState("");
  const [dName, setDName] = useState("");
  const [dCompany, setDCompany] = useState("");
  const [dAmount, setDAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, s, c, co, d, a] = await Promise.all([
        crmApi.rollup(),
        crmApi.stages(),
        crmApi.listContacts(),
        crmApi.listCompanies(),
        crmApi.listDeals(),
        crmApi.listActivities(),
      ]);
      setRollup(r); setStages(s); setContacts(c); setCompanies(co); setDeals(d); setActivities(a);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const companyName = useMemo(() => {
    const map = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [companies]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const createContact = useCallback(async () => {
    if (!cFirst.trim() || !cLast.trim()) return;
    try {
      await crmApi.createContact({
        firstName: cFirst.trim(),
        lastName: cLast.trim(),
        email: cEmail.trim() || null,
        companyId: cCompany || null,
      });
      setCFirst(""); setCLast(""); setCEmail(""); setCCompany("");
      setShowNewContact(false);
      flash("Contact created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [cFirst, cLast, cEmail, cCompany, load]);

  const createCompany = useCallback(async () => {
    if (!coName.trim()) return;
    try {
      await crmApi.createCompany({ name: coName.trim(), industry: coIndustry.trim() || null });
      setCoName(""); setCoIndustry("");
      setShowNewCompany(false);
      flash("Company created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [coName, coIndustry, load]);

  const createDeal = useCallback(async () => {
    if (!dName.trim() || !dCompany) return;
    try {
      await crmApi.createDeal({
        name: dName.trim(),
        companyId: dCompany,
        amountCents: Math.round((Number(dAmount) || 0) * 100),
        stage: "lead",
      });
      setDName(""); setDCompany(""); setDAmount("");
      setShowNewDeal(false);
      flash("Deal created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [dName, dCompany, dAmount, load]);

  const advanceDeal = useCallback(async (deal: CrmDeal) => {
    const idx = STAGE_ORDER.indexOf(deal.stage);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return;
    const next = STAGE_ORDER[idx + 1];
    if (!next) return;
    try {
      await crmApi.updateDeal(deal.id, { stage: next });
      flash(`Deal moved to ${next.replace("_", " ")}.`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const deleteDeal = useCallback(async (id: string) => {
    try {
      await crmApi.deleteDeal(id);
      flash("Deal deleted.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const addActivity = useCallback(async () => {
    if (!activitySubject.trim()) return;
    try {
      await crmApi.createActivity({ kind: activityKind, subject: activitySubject.trim() });
      setActivitySubject("");
      flash("Activity logged.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [activityKind, activitySubject, load]);

  const counts = rollup?.counts;
  const maxStageSum = Math.max(1, ...(rollup?.pipeline.map((p) => p.sumCents) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Enterprise CRM</h1>
          <p className="text-sm text-text-muted">
            Contacts, companies, deal pipeline and activity ledger — Session 90. All numbers are computed from stored records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowNewCompany(true); setShowNewContact(false); setShowNewDeal(false); }}>
            <Building2 className="w-4 h-4 mr-1" /> Company
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowNewContact(true); setShowNewCompany(false); setShowNewDeal(false); }}>
            <Users className="w-4 h-4 mr-1" /> Contact
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowNewDeal(true); setShowNewCompany(false); setShowNewContact(false); }}>
            <PlusCircle className="w-4 h-4 mr-1" /> Deal
          </Button>
        </div>
      </div>

      {err ? (
        <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div>
      ) : null}

      {/* Quick-create forms */}
      {showNewCompany || showNewContact || showNewDeal ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {showNewCompany ? (
              <>
                <div className="flex gap-2">
                  <Input placeholder="Company name" value={coName} onChange={(e) => setCoName(e.target.value)} />
                  <Input placeholder="Industry (optional)" value={coIndustry} onChange={(e) => setCoIndustry(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createCompany} disabled={!coName.trim()}>Create company</Button>
                  <Button variant="ghost" onClick={() => setShowNewCompany(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
            {showNewContact ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="First name" value={cFirst} onChange={(e) => setCFirst(e.target.value)} />
                  <Input placeholder="Last name" value={cLast} onChange={(e) => setCLast(e.target.value)} />
                  <Input placeholder="Email (optional)" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                  <Select value={cCompany} onChange={(e) => setCCompany(e.target.value)}>
                    <option value="">No company</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={createContact} disabled={!cFirst.trim() || !cLast.trim()}>Create contact</Button>
                  <Button variant="ghost" onClick={() => setShowNewContact(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
            {showNewDeal ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Deal name" value={dName} onChange={(e) => setDName(e.target.value)} />
                  <Select value={dCompany} onChange={(e) => setDCompany(e.target.value)}>
                    <option value="">Company…</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Input placeholder="Amount (USD, e.g. 25000)" value={dAmount} onChange={(e) => setDAmount(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createDeal} disabled={!dName.trim() || !dCompany}>Create deal</Button>
                  <Button variant="ghost" onClick={() => setShowNewDeal(false)}>Cancel</Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat icon={<Users className="w-5 h-5" />} label="Contacts" value={String(counts?.contacts ?? 0)} />
        <Stat icon={<Building2 className="w-5 h-5" />} label="Companies" value={String(counts?.companies ?? 0)} />
        <Stat icon={<Target className="w-5 h-5" />} label="Open deals" value={String(counts?.openDeals ?? 0)} sub={`${counts?.closedWonDeals ?? 0} won / ${counts?.closedLostDeals ?? 0} lost`} />
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="Weighted forecast" value={fmtCents(rollup?.forecastCents ?? 0)} sub={`${fmtCents(rollup?.openPipelineCents ?? 0)} open pipeline`} />
        <Stat icon={<Trophy className="w-5 h-5" />} label="Closed won" value={fmtCents(rollup?.closedWonCents ?? 0)} />
        <Stat icon={<Percent className="w-5 h-5" />} label="Conversion" value={fmtPct(rollup?.conversionRate ?? null)} />
      </div>

      {/* Pipeline + activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline by stage</CardTitle>
            <CardDescription>Deal count and value per stage, computed from stored deals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(rollup?.pipeline ?? []).map((p) => (
              <div key={p.stageKey} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-main flex items-center gap-2">
                    <Badge variant={STAGE_VARIANT[p.stageKey]}>{p.label}</Badge>
                    <span className="text-text-muted">×{p.count}</span>
                  </span>
                  <span className="text-text-bright font-semibold">{fmtCents(p.sumCents)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round((p.sumCents / maxStageSum) * 100)}%`, background: "linear-gradient(90deg, rgba(56,189,248,0.9), rgba(139,92,246,0.9))" }}
                  />
                </div>
              </div>
            ))}
            {(rollup?.pipeline ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No deals yet — create one to see the pipeline.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity ledger</CardTitle>
            <CardDescription>Notes, calls, emails, meetings, tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Select value={activityKind} onChange={(e) => setActivityKind(e.target.value as CrmActivity["kind"])}>
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="task">Task</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Log an activity…" value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} />
              <Button onClick={addActivity} disabled={!activitySubject.trim()}>Add</Button>
            </div>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {(rollup?.recentActivities ?? activities).map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                  {a.kind === "email" ? <Mail className="w-4 h-4 mt-0.5 text-azure shrink-0" />
                    : a.kind === "call" ? <Phone className="w-4 h-4 mt-0.5 text-teal shrink-0" />
                    : a.kind === "meeting" ? <CalendarDays className="w-4 h-4 mt-0.5 text-violet shrink-0" />
                    : a.kind === "task" ? <Target className="w-4 h-4 mt-0.5 text-amber shrink-0" />
                    : <StickyNote className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-text-bright truncate">{a.subject}</div>
                    <div className="text-xs text-text-muted">
                      {a.kind} · {new Date(a.createdAt).toLocaleDateString()}
                      {a.companyId ? ` · ${companyName(a.companyId)}` : ""}
                    </div>
                  </div>
                </li>
              ))}
              {(rollup?.recentActivities ?? []).length === 0 ? (
                <li className="text-sm text-text-muted">No activity yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Deals + contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open deals</CardTitle>
            <CardDescription>Advance a deal to move it through the pipeline (each change is audited).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright truncate">{d.name}</div>
                    <div className="text-xs text-text-muted">
                      {companyName(d.companyId)} · {fmtCents(d.amountCents, d.currency)} · {d.probabilityPct}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STAGE_VARIANT[d.stage]}>{d.stage.replace("_", " ")}</Badge>
                    <Button size="sm" variant="outline" onClick={() => advanceDeal(d)}>Advance</Button>
                    <button onClick={() => deleteDeal(d.id)} className="text-text-muted hover:text-crimson" aria-label="Delete deal">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").length === 0 ? (
                <p className="text-sm text-text-muted">No open deals.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contacts</CardTitle>
            <CardDescription>People in this organization's CRM.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright truncate">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-text-muted">
                      {c.email ?? "no email"} · {companyName(c.companyId)}
                    </div>
                  </div>
                  <Badge variant={c.status === "customer" ? "emerald" : c.status === "churned" ? "danger" : c.status === "prospect" ? "azure" : "slate"}>
                    {c.status}
                  </Badge>
                </div>
              ))}
              {contacts.length === 0 ? <p className="text-sm text-text-muted">No contacts yet.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Companies</CardTitle>
          <CardDescription>Accounts this organization works with.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {companies.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-sm font-semibold text-text-bright truncate">{c.name}</div>
                <div className="text-xs text-text-muted truncate">{c.industry ?? "—"}{c.domain ? ` · ${c.domain}` : ""}</div>
                <div className="text-xs text-text-muted">{c.city ? `${c.city}, ` : ""}{c.country ?? ""} · {c.sizeBand}</div>
              </div>
            ))}
            {companies.length === 0 ? <p className="text-sm text-text-muted">No companies yet.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
