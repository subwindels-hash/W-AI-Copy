/**
 * Session 74 / Session 169 — Industry Solutions & Digital Operations Console (/app/industry)
 *
 * Honesty & provenance:
 * - Read path does not seed. An empty organization starts with 0 adoptions and unmeasured metrics.
 * - Unmeasured metrics (maturity assessment, search latency) render as "—", never 0 or fabricated percentiles.
 * - Employee counts and workflow deployments reflect actual tenant adoptions from the adoption registry.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Users,
  Layers,
  ShieldCheck,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Activity,
} from "lucide-react";
import {
  indApi,
  type IndustryDashboard,
  type IndustryAdoption,
  type CreateIndustryAdoptionInput,
  type IndustrySuite,
} from "@/lib/industry";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

/** Render an unmeasured value as an em-dash. Never `|| 0`. */
function metric(v: number | null | undefined, fmt: (n: number) => string = String) {
  return v === null || v === undefined ? <span className="text-slate-500">—</span> : fmt(v);
}

export function IndustryPage() {
  const [dash, setDash] = useState<IndustryDashboard | null>(null);
  const [adoptions, setAdoptions] = useState<IndustryAdoption[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form state for creating adoption
  const [selectedSuite, setSelectedSuite] = useState<string>("healthcare");
  const [packageName, setPackageName] = useState("");
  const [employees, setEmployees] = useState("50");
  const [status, setStatus] = useState<"planned" | "piloting" | "adopted" | "sunset">("piloting");
  const [notes, setNotes] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [d, adList] = await Promise.all([indApi.dashboard(), indApi.listAdoptions()]);
      setDash(d);
      setAdoptions(adList);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load industry dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateAdoption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageName.trim()) {
      setMsg({ text: "Package name is required", type: "error" });
      return;
    }

    try {
      const payload: CreateIndustryAdoptionInput = {
        industry: selectedSuite,
        packageName: packageName.trim(),
        status,
        employees: parseInt(employees, 10) || 0,
        notes: notes.trim() || undefined,
      };
      await indApi.createAdoption(payload);
      setMsg({ text: `Adopted package "${packageName}" for ${selectedSuite}`, type: "success" });
      setPackageName("");
      setNotes("");
      await loadData();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to create adoption", type: "error" });
    }
  };

  const handleDeleteAdoption = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove adoption "${name}"?`)) return;
    try {
      await indApi.deleteAdoption(id);
      setMsg({ text: `Removed adoption "${name}"`, type: "success" });
      await loadData();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to delete adoption", type: "error" });
    }
  };

  const handleStatusChange = async (id: string, newStatus: "planned" | "piloting" | "adopted" | "sunset") => {
    try {
      await indApi.updateAdoption(id, { status: newStatus });
      setMsg({ text: "Updated adoption status", type: "success" });
      await loadData();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to update status", type: "error" });
    }
  };

  const totalEmployees = adoptions.reduce((acc, a) => acc + (a.employees || 0), 0);
  const activeAdoptionsCount = adoptions.filter((a) => a.status === "adopted" || a.status === "piloting").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Industry Solutions & Digital Ops</h1>
            <Badge variant="outline" className="text-xs">
              25 Vertical Suites
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Enterprise vertical solution packs, domain ontologies, and operational maturity framework. All tenant
            metrics are derived strictly from recorded adoptions.
          </p>
        </div>
        {dash?.provenance && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Telemetry: {dash.provenance.source}</span>
          </div>
        )}
      </div>

      {/* Alerts */}
      {msg && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-sm ${
            msg.type === "success"
              ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300"
              : "border border-rose-900/50 bg-rose-950/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Active Deployments</span>
              <Building2 className="h-4 w-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">
              {loading ? "…" : activeAdoptionsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {adoptions.length} total registered records
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Employees Covered</span>
              <Users className="h-4 w-4 text-emerald-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">
              {loading ? "…" : totalEmployees.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Across all vertical workflows</CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Maturity Score</span>
              <Sparkles className="h-4 w-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">
              {loading ? "…" : metric(dash?.maturity.overall, (v) => `${v}%`)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {dash?.maturity.overall === null ? "Assessment not conducted" : "Assessed score"}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Semantic Latency</span>
              <Activity className="h-4 w-4 text-indigo-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">
              {loading ? "…" : metric(dash?.semanticSearchLatencyMs, (v) => `${v} ms`)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {dash?.semanticSearchLatencyMs === null ? "No live search query" : "Average response"}
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="adoptions" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent">
          <TabsTrigger value="adoptions" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">
            Active Adoptions ({adoptions.length})
          </TabsTrigger>
          <TabsTrigger value="suites" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">
            Industry Suites Catalog (25)
          </TabsTrigger>
          <TabsTrigger value="architecture" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">
            Platform Layer Architecture
          </TabsTrigger>
          <TabsTrigger value="governance" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">
            Governance & Ops
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Adoptions */}
        <TabsContent value="adoptions" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Adoptions Table */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-slate-800 bg-slate-900/30">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-100">Organization Adoptions</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Tracked industry solution packages deployed for this tenant.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {adoptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
                      <Building2 className="mx-auto h-8 w-8 opacity-40 mb-2" />
                      <p className="text-sm">No industry packages adopted yet.</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Use the form on the right or the suites catalog to record your first deployment.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-300">
                        <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="pb-3 font-medium">Industry</th>
                            <th className="pb-3 font-medium">Package</th>
                            <th className="pb-3 font-medium">Status</th>
                            <th className="pb-3 font-medium">Employees</th>
                            <th className="pb-3 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {adoptions.map((ad) => (
                            <tr key={ad.id} className="hover:bg-slate-800/30">
                              <td className="py-3 font-medium text-slate-200 capitalize">{ad.industry}</td>
                              <td className="py-3">
                                <div>{ad.packageName}</div>
                                {ad.notes && <div className="text-xs text-slate-500">{ad.notes}</div>}
                              </td>
                              <td className="py-3">
                                <select
                                  value={ad.status}
                                  onChange={(e) => handleStatusChange(ad.id, e.target.value as any)}
                                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                                >
                                  <option value="planned">Planned</option>
                                  <option value="piloting">Piloting</option>
                                  <option value="adopted">Adopted</option>
                                  <option value="sunset">Sunset</option>
                                </select>
                              </td>
                              <td className="py-3 text-slate-400">{ad.employees.toLocaleString()}</td>
                              <td className="py-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400"
                                  onClick={() => handleDeleteAdoption(ad.id, ad.packageName)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Adoption Registration Form */}
            <div>
              <Card className="border-slate-800 bg-slate-900/30">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-sky-400" />
                    <span>Register New Adoption</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Add a vertical deployment to this organization.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateAdoption} className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Industry Vertical</label>
                      <select
                        value={selectedSuite}
                        onChange={(e) => setSelectedSuite(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      >
                        {dash?.industries.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">Package / Solution Name</label>
                      <Input
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        placeholder="e.g. AML Intelligence Copilot"
                        className="mt-1"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-300">Status</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                        >
                          <option value="planned">Planned</option>
                          <option value="piloting">Piloting</option>
                          <option value="adopted">Adopted</option>
                          <option value="sunset">Sunset</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-300">Employees</label>
                        <Input
                          type="number"
                          min="0"
                          value={employees}
                          onChange={(e) => setEmployees(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">Notes (Optional)</label>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Scope, department or timeline details"
                        className="mt-1"
                      />
                    </div>

                    <Button type="submit" className="w-full">
                      Register Adoption
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Suites Catalog */}
        <TabsContent value="suites" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {dash?.industries.map((suite) => (
              <Card key={suite.id} className="border-slate-800 bg-slate-900/30 hover:border-slate-700 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-100">{suite.name}</CardTitle>
                    {suite.adoptionsCount && suite.adoptionsCount > 0 ? (
                      <Badge variant="outline" className="border-emerald-700 text-emerald-400 text-xs">
                        {suite.adoptionsCount} Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-slate-500">
                        Available
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-slate-500 capitalize">{suite.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between border-t border-slate-800/80 pt-2">
                    <span>Workflows Deployed:</span>
                    <span className="font-medium text-slate-200">{suite.workflows}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Employees Covered:</span>
                    <span className="font-medium text-slate-200">{suite.employees.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Readiness:</span>
                    <span className="font-medium">{metric(suite.readinessPct, (v) => `${v}%`)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Platform Architecture */}
        <TabsContent value="architecture" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {dash &&
              Object.entries(dash.layerMapping).map(([layer, modules]) => (
                <Card key={layer} className="border-slate-800 bg-slate-900/30">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-sky-400" />
                      <span>{layer}</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Unified enterprise architecture slice
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {modules.map((m) => (
                        <Badge key={m} variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-300 text-xs">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* Tab 4: Governance & Ops */}
        <TabsContent value="governance" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-100">Governance Lifecycle</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Architecture review and policy status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Active Architecture Policies:</span>
                  <span className="font-semibold text-slate-100">{dash?.governance.activePolicies ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Pending Architecture Reviews:</span>
                  <span className="font-semibold text-slate-100">{dash?.governance.pendingReviews ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Open Exceptions:</span>
                  <span className="font-semibold text-slate-100">{dash?.governance.exceptionsOpen ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Audit Findings:</span>
                  <span className="font-semibold text-slate-100">{dash?.governance.auditFindings ?? 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-100">Maturity Assessment Dimensions</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Structured assessment recommendations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                {dash?.maturity.dimensions.map((dim) => (
                  <div key={dim.name} className="flex justify-between border-b border-slate-800 pb-2 capitalize">
                    <span>{dim.name.replace(/_/g, " ")}:</span>
                    <span className="font-semibold">{metric(dim.score, (s) => `${s}%`)}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-500 mt-2">{dash?.maturity.recommendedNext}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
