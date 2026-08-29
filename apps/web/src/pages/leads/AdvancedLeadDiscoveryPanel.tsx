import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BrainCircuit, CheckCircle2, ChevronDown, Download, ExternalLink, FileSearch,
  Globe2, Loader2, Mail, MapPin, Phone, Plus, ShieldCheck, Sparkles, Tag,
  Trash2, UsersRound, X,
} from "lucide-react";
import { advancedLeadApi, leadApi, type AdvancedLead, type LeadAdvancedSearchInput, type LeadAgentLeadRecommendation, type LeadDiscoveryJob } from "@/lib/leadDiscovery";
import { LEAD_PERSONAL_EMAIL_DOMAINS, LEAD_PRIVACY_NOTE, LEAD_QUALITY_NOTE, LEAD_VERIFICATION_NOTE, type LeadDiscoveryMode } from "@windels/shared/leadDiscoveryAdvanced";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";

const INDUSTRIES = ["Logistics", "Supply Chain", "Banking", "Insurance", "Healthcare", "Technology", "Real Estate", "Construction", "Manufacturing", "Education", "Professional Services"];
const modeCopy: Record<LeadDiscoveryMode, { title: string; description: string; icon: typeof BrainCircuit }> = {
  apollo: { title: "Apollo Mode", description: "Industry and professional discovery through the authorized Apollo API.", icon: Sparkles },
  business: { title: "Business Mode", description: "Keyword and location company discovery through Google Places.", icon: Globe2 },
  person: { title: "Person Mode", description: "Permitted people search criteria through the authorized Apollo API.", icon: UsersRound },
};
const statusStyle = (status: AdvancedLead["verificationStatus"]) => ({
  verified: "emerald", likely_valid: "azure", unverified: "amber", invalid: "crimson",
}[status] as "emerald" | "azure" | "amber" | "crimson");
const titleize = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const csv = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function emptyForm(mode: LeadDiscoveryMode): LeadAdvancedSearchInput {
  return { mode, industry: undefined, companySizeRanges: [], jobTitles: [], country: undefined, stateRegion: undefined, city: undefined, region: undefined, postalCode: undefined, businessType: undefined, company: undefined, keywords: [], names: [], contactAvailability: "any", emailDomains: [], limit: 25 };
}

export function AdvancedLeadDiscoveryPanel({ onRecordsChanged }: { onRecordsChanged: () => Promise<void> }) {
  const actor = useAuthStore((state) => state.user);
  const canDelete = actor?.role === "admin" || actor?.role === "super_admin";
  const [form, setForm] = useState<LeadAdvancedSearchInput>(() => emptyForm("apollo"));
  const [naturalLanguage, setNaturalLanguage] = useState("");
  const [agentInfo, setAgentInfo] = useState<{ source: string; recommendations: string[]; limitations: string[] } | null>(null);
  const [job, setJob] = useState<LeadDiscoveryJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<LeadDiscoveryJob[]>([]);
  const [results, setResults] = useState<AdvancedLead[]>([]);
  const [stored, setStored] = useState<AdvancedLead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<AdvancedLead | null>(null);
  const [recommendation, setRecommendation] = useState<LeadAgentLeadRecommendation | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [newList, setNewList] = useState("");
  const [listName, setListName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"quality_desc" | "discovery_desc" | "name_asc">("quality_desc");
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);
  const flashError = (value: unknown) => setError(value instanceof Error ? value.message : String(value));
  const run = useCallback(async (key: string, work: () => Promise<string | void>) => {
    setBusy(key); setError(null); setNotice(null);
    try { const message = await work(); if (message) setNotice(message); }
    catch (reason) { flashError(reason); }
    finally { if (mounted.current) setBusy(null); }
  }, []);

  const loadStored = useCallback(async () => {
    const page = await advancedLeadApi.list({ sort, limit: 100 });
    if (mounted.current) setStored(page.leads);
  }, [sort]);
  const loadHistory = useCallback(async () => {
    const history = await advancedLeadApi.jobHistory(8);
    if (mounted.current) setRecentJobs(history.jobs);
  }, []);
  useEffect(() => { void Promise.all([loadStored(), loadHistory()]).catch(() => {}); }, [loadHistory, loadStored]);

  const pollJob = useCallback(async (id: string) => {
    const current = await advancedLeadApi.job(id);
    if (!mounted.current) return;
    setJob(current);
    if (current.status === "queued" || current.status === "running") {
      window.setTimeout(() => { void pollJob(id).catch(flashError); }, 750);
      return;
    }
    if (current.status === "failed") { setError(current.error ?? "Lead discovery failed."); return; }
    const rows = await advancedLeadApi.jobResults(id);
    if (!mounted.current) return;
    setResults(rows);
    setSelected(new Set(rows.map((row) => row.id)));
    await Promise.all([loadStored(), loadHistory(), onRecordsChanged()]);
    if (mounted.current) setNotice(`Discovery completed: ${current.created} new lead${current.created === 1 ? "" : "s"}; ${current.duplicates} existing record${current.duplicates === 1 ? "" : "s"} retained without duplication.`);
  }, [loadHistory, loadStored, onRecordsChanged]);

  const selectMode = (mode: LeadDiscoveryMode) => {
    setForm((current) => ({ ...emptyForm(mode), country: current.country, stateRegion: current.stateRegion, city: current.city, region: current.region, limit: current.limit }));
    setAgentInfo(null); setError(null);
  };
  const startSearch = () => run("search", async () => {
    const accepted = await advancedLeadApi.startSearch(form);
    setJob(accepted.job); setResults([]); setSelected(new Set());
    void pollJob(accepted.job.id).catch(flashError);
    return "Discovery job accepted. Provider work continues in the background.";
  });
  const interpret = () => run("agent", async () => {
    if (!naturalLanguage.trim()) throw new Error("Describe the leads you need first.");
    const interpreted = await advancedLeadApi.interpret(naturalLanguage.trim());
    setAgentInfo(interpreted);
    setForm((current) => ({ ...current, ...interpreted.criteria, mode: interpreted.criteria.mode ?? current.mode, jobTitles: interpreted.criteria.jobTitles?.length ? interpreted.criteria.jobTitles : current.jobTitles, keywords: interpreted.criteria.keywords?.length ? interpreted.criteria.keywords : current.keywords, names: interpreted.criteria.names?.length ? interpreted.criteria.names : current.names }));
    return interpreted.source === "ai" ? "AI agent criteria applied. Review them before searching." : "Heuristic criteria applied. Review them before searching.";
  });
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectedIds = [...selected];

  const saveTags = (lead: AdvancedLead) => run(`tags:${lead.id}`, async () => {
    const updated = await advancedLeadApi.setTags(lead.id, csv(tagDraft));
    setDetail(updated); setResults((rows) => rows.map((row) => row.id === updated.id ? updated : row)); setStored((rows) => rows.map((row) => row.id === updated.id ? updated : row));
    return "Tags saved.";
  });
  const verify = (lead: AdvancedLead) => run(`verify:${lead.id}`, async () => {
    const updated = await advancedLeadApi.verify(lead.id);
    setDetail(updated); setResults((rows) => rows.map((row) => row.id === updated.id ? updated : row)); setStored((rows) => rows.map((row) => row.id === updated.id ? updated : row));
    return `Verification result: ${titleize(updated.verificationStatus)}.`;
  });
  const reviewLead = (lead: AdvancedLead) => run(`recommend:${lead.id}`, async () => {
    const review = await advancedLeadApi.recommendations([lead.id]);
    setRecommendation(review.recommendations[0] ?? null);
    return "Local source-evidence recommendations prepared. No lead, list, or outreach action was changed.";
  });
  const deleteLead = (lead: AdvancedLead) => run(`remove:${lead.id}`, async () => {
    await advancedLeadApi.remove(lead.id);
    setDetail(null); setResults((rows) => rows.filter((row) => row.id !== lead.id)); setStored((rows) => rows.filter((row) => row.id !== lead.id)); setSelected((ids) => { const next = new Set(ids); next.delete(lead.id); return next; });
    await onRecordsChanged();
    return "Lead removed from this organization and its lists.";
  });
  const createList = () => run("list", async () => {
    const name = newList.trim();
    if (!name) throw new Error("Enter a lead-list name.");
    const list = await leadApi.createCollection(name);
    setNewList(""); setListName(list.name);
    return `Lead list “${list.name}” created.`;
  });
  const addToList = () => run("save-list", async () => {
    if (!listName.trim()) throw new Error("Create a lead list or enter its exact name.");
    if (!selectedIds.length) throw new Error("Select at least one lead.");
    const lists = await leadApi.collections();
    let list = lists.find((item) => item.name.toLowerCase() === listName.trim().toLowerCase());
    if (!list) list = await leadApi.createCollection(listName.trim());
    await Promise.all(selectedIds.map((id) => leadApi.addToCollection(list!.id, id)));
    await onRecordsChanged();
    return `${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"} saved to “${list.name}”.`;
  });
  const exportSelected = () => run("export", async () => {
    if (!selectedIds.length) throw new Error("Select at least one lead to export.");
    const exported = await advancedLeadApi.export(selectedIds);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "windels-advanced-leads.json"; anchor.click(); URL.revokeObjectURL(url);
    return `Exported ${exported.leads.length} normalized lead record${exported.leads.length === 1 ? "" : "s"}.`;
  });
  const outreach = () => run("outreach", async () => {
    if (!selectedIds.length) throw new Error("Select at least one lead.");
    const handoff = await advancedLeadApi.prepareOutreach(selectedIds);
    return `${handoff.emailEligibleLeadIds.length} lead${handoff.emailEligibleLeadIds.length === 1 ? "" : "s"} can be reviewed in Email Intelligence. Nothing was sent.`;
  });

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const source = results.length ? results : stored;
    return !query ? source : source.filter((lead) => [lead.name, lead.jobTitle, lead.company, lead.industry, lead.city, lead.country, lead.email, ...lead.tags].some((value) => value?.toLowerCase().includes(query)));
  }, [filter, results, stored]);
  const mode = modeCopy[form.mode];

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-azure/25 bg-gradient-to-br from-azure/10 via-bg-elevated to-bg-elevated">
        <CardHeader className="border-b border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2"><Badge variant="azure">UPGRADE</Badge><span className="text-xs font-semibold uppercase tracking-[0.16em] text-azure">Multi-mode intelligence</span></div>
              <CardTitle className="flex items-center gap-2 text-xl"><BrainCircuit className="h-5 w-5 text-azure" /> Advanced Lead Discovery</CardTitle>
              <CardDescription className="mt-1 max-w-3xl">Search permitted business data through connected providers, retain source traceability, and separate data quality from verification. No lead is contacted automatically.</CardDescription>
            </div>
            <Link to="/app/lead-pipeline" className="text-xs font-semibold text-azure hover:underline">Open pipeline →</Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(modeCopy) as LeadDiscoveryMode[]).map((key) => {
              const item = modeCopy[key]; const Icon = item.icon;
              return <button key={key} type="button" onClick={() => selectMode(key)} className={`flex min-w-48 flex-1 items-start gap-2 rounded-xl border p-3 text-left transition ${form.mode === key ? "border-azure/50 bg-azure/15" : "border-white/10 bg-black/10 hover:border-white/25"}`}>
                <Icon className={`mt-0.5 h-4 w-4 ${form.mode === key ? "text-azure" : "text-text-muted"}`} />
                <span><span className="block text-sm font-semibold text-text-bright">{item.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{item.description}</span></span>
              </button>;
            })}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright"><Sparkles className="h-4 w-4 text-violet" /> Lead Discovery AI Agent</div>
            <div className="flex flex-col gap-2 md:flex-row"><Input value={naturalLanguage} onChange={(event) => setNaturalLanguage(event.target.value)} placeholder="e.g. Find logistics companies in Lagos with business decision-makers" /><Button variant="outline" onClick={() => void interpret()} disabled={busy === "agent"}>{busy === "agent" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />} Interpret request</Button></div>
            {agentInfo && <div className="mt-3 grid gap-2 text-xs md:grid-cols-2"><div><span className="font-semibold text-text-bright">{agentInfo.source === "ai" ? "AI guidance" : "Heuristic guidance"}</span><ul className="mt-1 list-inside list-disc text-text-muted">{agentInfo.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div><div><span className="font-semibold text-text-bright">Limits</span><ul className="mt-1 list-inside list-disc text-text-muted">{agentInfo.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {form.mode !== "business" && <label className="text-xs text-text-muted">Industry<Select value={form.industry ?? ""} onChange={(event) => setForm({ ...form, industry: event.target.value || undefined })}><option value="">Any industry</option>{INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</Select></label>}
            {form.mode === "business" && <label className="text-xs text-text-muted">Business keyword<Input value={form.keywords.join(", ")} onChange={(event) => setForm({ ...form, keywords: csv(event.target.value) })} placeholder="Commercial Real Estate" /></label>}
            {form.mode === "business" && <label className="text-xs text-text-muted">Business type<Input value={form.businessType ?? ""} onChange={(event) => setForm({ ...form, businessType: event.target.value || undefined })} placeholder="Warehousing, cafe, legal services" /></label>}
            {form.mode === "person" && <label className="text-xs text-text-muted">Names (comma-separated)<Input value={form.names.join(", ")} onChange={(event) => setForm({ ...form, names: csv(event.target.value) })} placeholder="Mark, David, Emma" /></label>}
            {form.mode !== "business" && <label className="text-xs text-text-muted">Professional titles<Input value={form.jobTitles.join(", ")} onChange={(event) => setForm({ ...form, jobTitles: csv(event.target.value) })} placeholder="CEO, Operations Director" /></label>}
            <label className="text-xs text-text-muted">Company<Input value={form.company ?? ""} onChange={(event) => setForm({ ...form, company: event.target.value || undefined })} placeholder="Optional company" /></label>
            <label className="text-xs text-text-muted">Country<Input value={form.country ?? ""} onChange={(event) => setForm({ ...form, country: event.target.value || undefined })} placeholder="Nigeria" /></label>
            <label className="text-xs text-text-muted">State / region<Input value={form.stateRegion ?? ""} onChange={(event) => setForm({ ...form, stateRegion: event.target.value || undefined })} placeholder="Lagos" /></label>
            <label className="text-xs text-text-muted">City<Input value={form.city ?? ""} onChange={(event) => setForm({ ...form, city: event.target.value || undefined })} placeholder="Lagos" /></label>
            <label className="text-xs text-text-muted">Postal code<Input value={form.postalCode ?? ""} onChange={(event) => setForm({ ...form, postalCode: event.target.value || undefined })} placeholder="Optional postal code" /></label>
            <label className="text-xs text-text-muted">Company-size range<Select value={form.companySizeRanges[0] ?? ""} onChange={(event) => setForm({ ...form, companySizeRanges: event.target.value ? [event.target.value] : [] })}><option value="">Any size</option><option value="1,10">1–10</option><option value="11,50">11–50</option><option value="51,200">51–200</option><option value="201,500">201–500</option><option value="501,1000">501–1,000</option><option value="1001,10000">1,001–10,000</option></Select></label>
            <label className="text-xs text-text-muted">Contact availability<Select value={form.contactAvailability} onChange={(event) => setForm({ ...form, contactAvailability: event.target.value as LeadAdvancedSearchInput["contactAvailability"] })}><option value="any">Any returned data</option><option value="email">Email returned</option><option value="phone">Phone returned</option><option value="email_or_phone">Email or phone returned</option></Select></label>
            <label className="text-xs text-text-muted">Max results<Select value={String(form.limit)} onChange={(event) => setForm({ ...form, limit: Number(event.target.value) })}><option value="10">10</option><option value="25">25</option><option value="50">50</option></Select></label>
          </div>
          {form.mode === "person" && <div className="rounded-lg border border-amber/25 bg-amber/5 p-3"><div className="mb-2 text-xs font-semibold text-amber">Permitted personal email domains — policy-controlled</div><div className="flex flex-wrap gap-3">{LEAD_PERSONAL_EMAIL_DOMAINS.map((domain) => <label key={domain} className="flex items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" className="accent-azure" checked={form.emailDomains.includes(domain)} onChange={() => setForm((current) => ({ ...current, emailDomains: current.emailDomains.includes(domain) ? current.emailDomains.filter((item) => item !== domain) : [...current.emailDomains, domain] }))} />{domain}</label>)}</div><p className="mt-2 text-[11px] text-text-muted">Only addresses actually returned by the authorized provider are evaluated. A domain match is not email verification; Super Admin compliance policy can disable this filter.</p></div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-[11px] leading-relaxed text-text-muted">{LEAD_PRIVACY_NOTE}</p><Button onClick={() => void startSearch()} disabled={busy === "search" || job?.status === "queued" || job?.status === "running"}>{busy === "search" || job?.status === "queued" || job?.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Search {mode.title}</Button></div>
        </CardContent>
      </Card>

      {job && <Card className={job.status === "failed" ? "border-crimson/35" : "border-white/10"}><CardContent className="py-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-text-bright">{job.message}</span><Badge variant={job.status === "failed" ? "crimson" : job.status === "completed" ? "emerald" : "azure"}>{job.status}</Badge></div><div className="mt-3 h-2 overflow-hidden rounded bg-white/10"><div className={`h-full transition-all ${job.status === "failed" ? "bg-crimson" : "bg-azure"}`} style={{ width: `${job.progress}%` }} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted"><span>Found: {job.discovered}</span><span>New: {job.created}</span><span>Existing: {job.duplicates}</span>{job.filteredOut > 0 && <span>Filtered out: {job.filteredOut}</span>}</div>{job.limitations.length > 0 && <ul className="mt-2 list-inside list-disc text-[11px] text-text-muted">{job.limitations.map((item) => <li key={item}>{item}</li>)}</ul>}</CardContent></Card>}
      {recentJobs.length > 0 && <Card><CardHeader><CardTitle className="text-base">Recent discovery history</CardTitle><CardDescription>User-initiated provider jobs retained for this organization. Failed jobs show the real configuration or upstream error rather than a synthetic result.</CardDescription></CardHeader><CardContent><ul className="divide-y divide-white/10 rounded-lg border border-white/10">{recentJobs.map((recent) => <li key={recent.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs"><span className="text-text-muted">{new Date(recent.createdAt).toLocaleString()} · {titleize(recent.input.mode)} · {recent.discovered} found / {recent.created} new</span><Badge variant={recent.status === "failed" ? "crimson" : recent.status === "completed" ? "emerald" : "azure"}>{recent.status}</Badge>{recent.error && <span className="w-full text-crimson">{recent.error}</span>}</li>)}</ul></CardContent></Card>}
      {error && <div className="flex items-start gap-2 rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson"><X className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && !error && <div className="flex items-start gap-2 rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle>Structured lead results</CardTitle><CardDescription>{results.length ? `${results.length} lead record${results.length === 1 ? "" : "s"} from the completed discovery job.` : `${stored.length} stored lead record${stored.length === 1 ? "" : "s"}. Search above to replace this view with a job result.`}</CardDescription></div><div className="flex flex-wrap gap-2"><Input className="h-8 w-44 text-xs" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter stored fields…" /><Select className="h-8 w-36 py-1 text-xs" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="quality_desc">Quality score</option><option value="discovery_desc">Discovery date</option><option value="name_asc">Name A–Z</option></Select></div></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2"><label className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" className="accent-azure" checked={visible.length > 0 && visible.every((row) => selected.has(row.id))} onChange={() => setSelected((current) => visible.every((row) => current.has(row.id)) ? new Set() : new Set(visible.map((row) => row.id)))} />Select visible</label><span className="text-xs text-text-muted">{selected.size} selected</span><span className="mx-1 h-4 w-px bg-white/10" /><Input className="h-8 w-40 text-xs" value={listName} onChange={(event) => setListName(event.target.value)} placeholder="Existing/new lead list" /><Button size="sm" variant="outline" onClick={() => void addToList()} disabled={!selected.size || busy === "save-list"}>Save to list</Button><Button size="sm" variant="outline" onClick={() => void exportSelected()} disabled={!selected.size || busy === "export"}><Download className="h-3.5 w-3.5" /> Export</Button><Button size="sm" variant="outline" onClick={() => void outreach()} disabled={!selected.size || busy === "outreach"}><Mail className="h-3.5 w-3.5" /> Use with outreach</Button><Link className="text-xs font-semibold text-azure hover:underline" to="/app/email-intel">Email Intelligence →</Link></div>
          <div className="flex max-w-md gap-2"><Input className="h-8 text-xs" value={newList} onChange={(event) => setNewList(event.target.value)} placeholder="Create reusable lead list" /><Button size="sm" variant="outline" onClick={() => void createList()} disabled={busy === "list"}><Plus className="h-3.5 w-3.5" /> Create list</Button></div>
          {visible.length === 0 ? <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-text-muted">No structured lead records match this view. Provider results appear here only after a configured provider returns them.</div> : <ul className="divide-y divide-white/10 rounded-xl border border-white/10">{visible.map((lead) => <LeadRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={() => toggle(lead.id)} onOpen={() => { setDetail(lead); setRecommendation(null); setTagDraft(lead.tags.join(", ")); }} />)}</ul>}
          <div className="rounded-lg border border-azure/15 bg-azure/5 p-3 text-[11px] leading-relaxed text-text-muted"><strong className="text-text-bright">Quality:</strong> {LEAD_QUALITY_NOTE}<br /><strong className="text-text-bright">Verification:</strong> {LEAD_VERIFICATION_NOTE}</div>
        </CardContent>
      </Card>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} size="xl" title={detail ? `Lead details · ${detail.name}` : "Lead details"} footer={<Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && <LeadDetail lead={detail} recommendation={recommendation} tags={tagDraft} setTags={setTagDraft} canDelete={canDelete} busy={busy} onVerify={() => void verify(detail)} onReview={() => void reviewLead(detail)} onSaveTags={() => void saveTags(detail)} onDelete={() => void deleteLead(detail)} />}
      </Modal>
    </section>
  );
}

function LeadRow({ lead, selected, onToggle, onOpen }: { lead: AdvancedLead; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const location = [lead.city, lead.stateRegion, lead.country].filter(Boolean).join(", ");
  return <li className={`p-3 transition ${selected ? "bg-azure/10" : "bg-white/[0.015] hover:bg-white/[0.035]"}`}><div className="flex gap-3"><input type="checkbox" className="mt-1 accent-azure" checked={selected} onChange={onToggle} aria-label={`Select ${lead.name}`} /><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-text-bright">{lead.name}</span><Badge variant={statusStyle(lead.verificationStatus)}>{titleize(lead.verificationStatus)}</Badge><span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-azure">Quality {lead.qualityScore}%</span></div><div className="mt-1 text-sm text-text-muted">{lead.jobTitle ?? "Job title not returned"}{lead.company && <> · <span className="text-text-bright">{lead.company}</span></>}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">{location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</span>}{lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />Email: {titleize(lead.emailStatus)}</span>}{lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />Phone available</span>}{lead.companyWebsite && <span className="inline-flex items-center gap-1"><Globe2 className="h-3 w-3" />Website available</span>}</div>{lead.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{lead.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>}</button><ChevronDown className="mt-1 h-4 w-4 text-text-muted" /></div></li>;
}

function LeadDetail({ lead, recommendation, tags, setTags, canDelete, busy, onVerify, onReview, onSaveTags, onDelete }: { lead: AdvancedLead; recommendation: LeadAgentLeadRecommendation | null; tags: string; setTags: (value: string) => void; canDelete: boolean; busy: string | null; onVerify: () => void; onReview: () => void; onSaveTags: () => void; onDelete: () => void }) {
  const location = [lead.city, lead.stateRegion, lead.country].filter(Boolean).join(", ") || "Not returned by the source";
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-bold text-text-bright">{lead.name}</h4><Badge variant={statusStyle(lead.verificationStatus)}>{titleize(lead.verificationStatus)}</Badge></div><p className="mt-1 text-sm text-text-muted">{lead.jobTitle ?? "Job title not returned"}{lead.company ? ` · ${lead.company}` : ""}</p></div><div className="rounded-lg border border-azure/25 bg-azure/10 px-3 py-2 text-right"><div className="text-lg font-bold text-azure">{lead.qualityScore}%</div><div className="text-[10px] uppercase tracking-wider text-text-muted">Data quality</div></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Industry" value={lead.industry} /><Field label="Location" value={location} /><Field label="Email" value={lead.email} /><Field label="Email status" value={titleize(lead.emailStatus)} /><Field label="Phone" value={lead.phone} /><Field label="Discovery date" value={new Date(lead.discoveryDate).toLocaleString()} /><Field label="Last verified" value={lead.lastVerifiedDate ? new Date(lead.lastVerifiedDate).toLocaleString() : "Not verified"} /><Field label="Pipeline" value={titleize(lead.pipelineStatus)} /></div>
    <div className="flex flex-wrap gap-2">{lead.companyWebsite && <a className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-azure hover:bg-white/5" href={lead.companyWebsite} target="_blank" rel="noreferrer"><Globe2 className="h-3.5 w-3.5" /> Company website <ExternalLink className="h-3 w-3" /></a>}{lead.professionalProfileUrl && <a className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-azure hover:bg-white/5" href={lead.professionalProfileUrl} target="_blank" rel="noreferrer"><UsersRound className="h-3.5 w-3.5" /> Professional profile <ExternalLink className="h-3 w-3" /></a>}{lead.email && <Button size="sm" onClick={onVerify} disabled={busy === `verify:${lead.id}`}><ShieldCheck className="h-3.5 w-3.5" /> Verify email</Button>}<Button size="sm" variant="outline" onClick={onReview} disabled={busy === `recommend:${lead.id}`}><BrainCircuit className="h-3.5 w-3.5" /> Agent review</Button></div>
    <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 text-sm font-semibold text-text-bright">Verification evidence</div><div className="text-xs text-text-muted">{lead.verification.detail ?? "No authorized verification request has been recorded."}</div>{lead.verification.method && <div className="mt-1 text-[11px] text-text-muted">Method: {lead.verification.method}</div>}</div>
    {recommendation && <div className="rounded-lg border border-violet/25 bg-violet/5 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright"><BrainCircuit className="h-4 w-4 text-violet" /> Lead Agent evidence review</div><div className="grid gap-3 text-xs text-text-muted sm:grid-cols-2"><div><strong className="text-text-bright">Classification & normalization</strong><p className="mt-1">{recommendation.classification.provider} · {recommendation.classification.industry ?? "Industry not returned"}</p><p className="mt-1">Normalized: {recommendation.classification.normalizedFields.join(", ") || "No fields"}</p></div><div><strong className="text-text-bright">Quality & missing data</strong><p className="mt-1">{recommendation.qualityRecommendation.score}% completeness</p><p className="mt-1">Missing: {recommendation.qualityRecommendation.missingFields.join(", ") || "None in scored fields"}</p></div><div><strong className="text-text-bright">Duplicate review</strong><p className="mt-1">{recommendation.duplicateRecommendation.note}</p></div><div><strong className="text-text-bright">Verification & lists</strong><p className="mt-1">{recommendation.verificationRecommendation}</p><p className="mt-1">{recommendation.listRecommendation}</p></div></div><p className="mt-3 text-[11px] text-text-muted">Local deterministic review from stored evidence only. It does not infer contact data, update tags/lists, or send outreach.</p></div>}
    <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright"><Tag className="h-4 w-4 text-azure" /> Tags</div><div className="flex gap-2"><Input className="h-8 text-xs" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="logistics, priority, q3" /><Button size="sm" variant="outline" onClick={onSaveTags} disabled={busy === `tags:${lead.id}`}>Save</Button></div></div>
    <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 text-sm font-semibold text-text-bright">Source traceability</div><ul className="space-y-2">{lead.sourceTrace.map((trace, index) => <li key={`${trace.provider}-${trace.providerRecordId}-${index}`} className="rounded border border-white/10 bg-black/10 p-2 text-xs"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{trace.provider}</Badge><span className="text-text-muted">{titleize(trace.discoveryMethod)} · {titleize(trace.searchMode)}</span>{trace.sourceUrl && <a href={trace.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-azure hover:underline">Open legitimate source <ExternalLink className="h-3 w-3" /></a>}</div><div className="mt-1 text-text-muted">Query: {trace.searchQuery} · {new Date(trace.discoveredAt).toLocaleString()}</div></li>)}</ul></div>
    <div><div className="mb-2 text-sm font-semibold text-text-bright">Quality factors</div><div className="flex flex-wrap gap-2">{lead.qualityFactors.map((factor) => <Badge key={factor.field} variant={factor.present ? "emerald" : "outline"}>{factor.present ? "✓" : "—"} {factor.field} ({factor.weight})</Badge>)}</div></div>
    {canDelete && <div className="border-t border-white/10 pt-4"><Button size="sm" variant="danger" onClick={onDelete} disabled={busy === `remove:${lead.id}`}><Trash2 className="h-3.5 w-3.5" /> Remove lead</Button></div>}
  </div>;
}
function Field({ label, value }: { label: string; value: string | null }) { return <div className="rounded-lg border border-white/10 bg-black/10 p-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div><div className="mt-1 break-words text-sm text-text-bright">{value ?? "Not returned by the source"}</div></div>; }
