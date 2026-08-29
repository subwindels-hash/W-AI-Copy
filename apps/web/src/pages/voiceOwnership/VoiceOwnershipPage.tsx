/**
 * WINDELS AI OS — Voice Ownership, Security & Governance console.
 *
 * Tracks who owns a voice, their consent state and identity level, backed by
 * an immutable audit log. Consent is a first-class governance fact here.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Fingerprint, ShieldCheck, ShieldAlert, History, X } from "lucide-react";
import type { VoDashboard, VoVoiceOwner, VoAuditEntry, VoPolicy } from "@windels/shared";
import { voApi } from "@/lib/voiceOwnership";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function consentTone(s: string): any {
  return s === "recorded" ? "emerald" : s === "revoked" || s === "expired" ? "crimson" : "amber";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function VoiceOwnershipPage() {
  const [dash, setDash] = useState<VoDashboard | null>(null);
  const [owners, setOwners] = useState<VoVoiceOwner[]>([]);
  const [audit, setAudit] = useState<VoAuditEntry[]>([]);
  const [policies, setPolicies] = useState<VoPolicy[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, o, a, p] = await Promise.all([voApi.dashboard(), voApi.owners(), voApi.audit(), voApi.policies()]);
      setDash(d); setOwners(o); setAudit(a); setPolicies(p);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function consent(voiceId: string, granted: boolean) {
    setErr(null); try { await voApi.consent(voiceId, granted); await load(); } catch (e: any) { setErr(e?.message ?? "Consent failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading voice ownership…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Fingerprint className="h-6 w-6 text-azure" /> Voice Ownership &amp; Consent</h1>
          <p className="text-sm text-text-muted">Governance over voice identity, consent and immutable audit.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Voices tracked" value={dash.voicesTracked} />
        <Stat label="Verified owners" value={dash.verifiedOwners} />
        <Stat label="Consent compliant" value={dash.consentCompliant} />
        <Stat label="Consent missing" value={dash.consentMissing} />
        <Stat label="Audit entries" value={dash.auditEntries} />
        <Stat label="Active policies" value={dash.policiesActive} />
        <Stat label="Violations (24h)" value={dash.violations24h} />
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold flex items-center gap-1">
            {dash.immutableAudit ? <ShieldCheck className="h-6 w-6 text-emerald-400"/> : <ShieldAlert className="h-6 w-6 text-amber-400"/>}
            {dash.immutableAudit ? "On" : "Off"}
          </div>
          <div className="text-sm text-text-muted">Immutable audit</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="owners">
        <TabsList>
          <TabsTrigger value="owners">Owners ({owners.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger>
          <TabsTrigger value="policies">Policies ({policies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="owners">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {owners.length === 0 ? (
                <div className="text-sm text-text-muted">No voice owners onboarded yet.</div>
              ) : owners.map((o) => (
                <div key={o.voiceId} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{o.voiceId}</span>
                      <Badge variant="outline">{o.ownershipSource}</Badge>
                      <Badge variant="outline">{o.identityLevel}</Badge>
                      <Badge variant={consentTone(o.consentState)}>{o.consentState}</Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {o.immutableAuditEntries} audit entries{o.consentRecordedAt ? ` · consent ${fmtDate(o.consentRecordedAt)}` : ""}
                      {o.humanOversightRequired && <span className="text-amber-400"> · human oversight required</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {o.consentState !== "recorded" && <Button size="sm" variant="outline" onClick={() => void consent(o.voiceId, true)}>Grant consent</Button>}
                    {o.consentState === "recorded" && <Button size="sm" variant="outline" onClick={() => void consent(o.voiceId, false)}>Revoke</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="space-y-1 pt-4">
              {audit.length === 0 ? (
                <div className="text-sm text-text-muted">No audit entries yet.</div>
              ) : audit.slice(0, 30).map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <History className="h-4 w-4 text-azure shrink-0" />
                    <span className="truncate">{a.kind.replace(/-/g, " ")}</span>
                    {a.detail && <span className="text-text-muted text-xs truncate">· {a.detail}</span>}
                  </div>
                  <div className="text-text-muted text-xs shrink-0">{fmtDate(a.at)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {policies.length === 0 ? (
                <div className="text-sm text-text-muted">No policies defined.</div>
              ) : policies.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-border/30 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-text-muted">applies to {p.appliesTo} · approval above risk {p.requireApprovalAboveRiskScore} · {p.humanOversight ? "human oversight" : "no oversight"}</div>
                  </div>
                  <Badge variant={p.enabled ? "emerald" : "slate"}>{p.enabled ? "enabled" : "disabled"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default VoiceOwnershipPage;
