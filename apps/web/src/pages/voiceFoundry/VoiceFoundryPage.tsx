/**
 * WINDELS AI OS — Voice Foundry console.
 *
 * Generate, evolve and deploy AI voices. Ownership/governance of voice clones
 * lives in the separate Voice Ownership module.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Mic, Plus, X, Rocket } from "lucide-react";
import type { VfDashboard, VfGeneratedVoice, VfDeployment, VfVoicePack, VfCategory } from "@windels/shared";
import { vfApi } from "@/lib/voiceFoundry";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function VoiceFoundryPage() {
  const [dash, setDash] = useState<VfDashboard | null>(null);
  const [voices, setVoices] = useState<VfGeneratedVoice[]>([]);
  const [deployments, setDeployments] = useState<VfDeployment[]>([]);
  const [packs, setPacks] = useState<VfVoicePack[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // generate form
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VfCategory>("narrator");

  const CATEGORIES: VfCategory[] = ["original-male", "original-female", "narrator", "executive", "customer-service", "character", "digital-human", "ai-employee", "brand", "accessibility"];

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, v, dep, p] = await Promise.all([vfApi.dashboard(), vfApi.voices(), vfApi.deployments(), vfApi.packs()]);
      setDash(d); setVoices(v); setDeployments(dep); setPacks(p);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    if (!name.trim()) { setErr("Name the voice."); return; }
    setErr(null);
    try { await vfApi.generate({ name: name.trim(), category }); setName(""); await load(); }
    catch (e: any) { setErr(e?.message ?? "Generate failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading voice foundry…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Mic className="h-6 w-6 text-azure" /> Voice Foundry</h1>
          <p className="text-sm text-text-muted">Generate, evolve and deploy AI voices.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Generated voices" value={dash.generatedVoices} />
        <Stat label="Ready" value={dash.voicesReady} />
        <Stat label="Deployments" value={dash.deployments} />
        <Stat label="Voice packs" value={dash.voicePacks} />
        <Stat label="Languages" value={dash.languagesSupported} />
        <Stat label="Evolution jobs (24h)" value={dash.evolutionJobs24h} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-azure"/>Generate a voice</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <Input placeholder="Voice name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <select
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as VfCategory)}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, " ")}</option>)}
          </select>
          <Button onClick={() => void generate()}>Generate</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="voices">
        <TabsList>
          <TabsTrigger value="voices">Voices ({voices.length})</TabsTrigger>
          <TabsTrigger value="deployments">Deployments ({deployments.length})</TabsTrigger>
          <TabsTrigger value="packs">Packs ({packs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="voices">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {voices.length === 0 ? (
                <div className="text-sm text-text-muted">No generated voices yet.</div>
              ) : voices.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{v.name}</span>
                      <Badge variant="outline">{v.category}</Badge>
                      <Badge variant="outline">v{v.version}</Badge>
                      <Badge variant="outline">{v.ownership}</Badge>
                      {v.ready ? <Badge variant="emerald">ready</Badge> : <Badge variant="amber">processing</Badge>}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{v.languagesSpoken.join(", ")} · {fmtDate(v.createdAt)}</div>
                  </div>
                  {v.ready && (
                    <Button size="sm" variant="outline" onClick={() => void (async () => { try { await vfApi.deploy(v.id, "ai-assistant"); await load(); } catch (e: any) { setErr(e?.message ?? "Deploy failed"); } })()}>
                      <Rocket className="h-3 w-3 mr-1"/>Deploy
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployments">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {deployments.length === 0 ? (
                <div className="text-sm text-text-muted">No deployments yet.</div>
              ) : deployments.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b border-border/30 py-1.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.voiceId}</div>
                    <div className="text-xs text-text-muted">{d.target} · {fmtDate(d.deployedAt)}</div>
                  </div>
                  <Badge variant={d.active ? "emerald" : "slate"}>{d.active ? "active" : "inactive"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packs">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {packs.length === 0 ? (
                <div className="text-sm text-text-muted">No voice packs yet.</div>
              ) : packs.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-border/30 py-1.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-text-muted">{p.languages.join(", ") || p.kind}</div>
                  </div>
                  <span className="text-text-muted text-xs shrink-0">{p.voiceIds.length} voices</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default VoiceFoundryPage;
