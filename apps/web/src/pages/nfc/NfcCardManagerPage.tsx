import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle, Bot, CheckCircle2, Cpu, Eraser, History, Info, Library, LockKeyhole,
  Nfc, Plus, QrCode, Radio, RefreshCw, Save, ScanLine, ShieldCheck, Sparkles, Trash2,
  Unplug, Wifi, XCircle,
} from "lucide-react";
import { NfcRecordListSchema, encodeNdefMessage, type NfcRecordInput, type2TlvSize } from "@windels/shared/nfc";
import type { DesktopNfcCardObservation, DesktopNfcState } from "@windels/shared/desktop";
import { useDesktop } from "@/app/desktop/hooks/useDesktop";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { aiApi } from "@/lib/ai";
import {
  desktopCardObservation, nfcApi, scanWebNfc,
  type LocalCardObservation, type NfcCard, type NfcOperation, type NfcProfile,
  type NfcReaderRow, type NfcTemplate,
} from "@/lib/nfc";

const KINDS: Array<{ value: NfcRecordInput["kind"]; label: string }> = [
  { value: "url", label: "URL" }, { value: "text", label: "Text" }, { value: "vcard", label: "Contact / vCard" },
  { value: "email", label: "Email" }, { value: "telephone", label: "Telephone" }, { value: "sms", label: "SMS" },
  { value: "wifi", label: "Wi-Fi configuration" }, { value: "deep_link", label: "Application / deep link" },
  { value: "social_profile", label: "Social profile" }, { value: "business_profile", label: "Business profile" },
  { value: "digital_business_card", label: "Digital business card" }, { value: "windels_profile", label: "WINDELS profile" },
  { value: "marketplace_profile", label: "Marketplace profile" }, { value: "product_profile", label: "Product profile" },
  { value: "custom_uri", label: "Custom URI" }, { value: "custom", label: "Custom NDEF record" },
];

type Action = "write" | "erase" | "lock" | "protect";
type LocalAssociation = { readerLocalId: string; hardwareCardKey: string; observation: LocalCardObservation };

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function idempotency(action: string): string { return `nfc-${action}-${crypto.randomUUID()}`; }
function statusBadge(status: NfcCard["supportStatus"]): "emerald" | "azure" | "amber" | "crimson" | "slate" {
  if (status === "WRITE_SUPPORTED" || status === "SUPPORTED") return "emerald";
  if (status === "READ_ONLY") return "azure";
  if (status === "UNSUPPORTED") return "crimson";
  if (status === "PARTIALLY_SUPPORTED") return "amber";
  return "slate";
}
function operationBadge(status: string): "emerald" | "amber" | "crimson" | "slate" {
  if (status === "SUCCEEDED") return "emerald";
  if (["FAILED", "EXPIRED", "CANCELLED"].includes(status)) return "crimson";
  if (["READY", "VERIFYING", "IN_PROGRESS"].includes(status)) return "amber";
  return "slate";
}
function initialRecord(): NfcRecordInput { return { kind: "windels_profile", value: "https://app.windels.ai/profile/me", language: "en" }; }

export function NfcCardManagerPage() {
  const desktop = useDesktop();
  const [tab, setTab] = useState("manager");
  const [desktopState, setDesktopState] = useState<DesktopNfcState | null>(null);
  const [readers, setReaders] = useState<NfcReaderRow[]>([]);
  const [cards, setCards] = useState<NfcCard[]>([]);
  const [operations, setOperations] = useState<NfcOperation[]>([]);
  const [templates, setTemplates] = useState<NfcTemplate[]>([]);
  const [profiles, setProfiles] = useState<NfcProfile[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ code: string; guidance: string }>>([]);
  const [selected, setSelected] = useState<NfcCard | null>(null);
  const [records, setRecords] = useState<NfcRecordInput[]>([initialRecord()]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [permanentPhrase, setPermanentPhrase] = useState("");
  const [aiPrompt, setAiPrompt] = useState("Create a concise NFC digital business card for my company using a secure profile URL.");
  const [qrData, setQrData] = useState<string | null>(null);
  const observed = useRef(new Set<string>());
  const associations = useRef(new Map<string, LocalAssociation>());

  const refresh = useCallback(async () => {
    try {
      const [readerRows, cardRows, history, templateRows, profileRows, diag] = await Promise.all([
        nfcApi.readers(), nfcApi.cards(), nfcApi.operations(), nfcApi.templates(), nfcApi.profiles(), nfcApi.diagnostics(),
      ]);
      setReaders(readerRows); setCards(cardRows); setOperations(history); setTemplates(templateRows); setProfiles(profileRows); setDiagnostics(diag.checks);
      if (selected) setSelected(cardRows.find((card) => card.id === selected.id) ?? selected);
      setError(null);
    } catch (err) { setError(errorMessage(err)); }
  }, [selected]);

  const registerObservation = useCallback(async (observation: LocalCardObservation, association?: Omit<LocalAssociation, "observation">) => {
    setBusy("read");
    try {
      const stored = await nfcApi.read(observation);
      setSelected(stored);
      if (association) associations.current.set(stored.id, { ...association, observation });
      setNotice(`NFC card detected and read: ${stored.technology}`);
      await refresh();
      return stored;
    } catch (err) { setError(errorMessage(err)); return null; }
    finally { setBusy(null); }
  }, [refresh]);

  const handleDesktopState = useCallback((state: DesktopNfcState) => {
    setDesktopState(state);
    const present = new Set(state.cards.map((card) => `${card.readerLocalId}:${card.hardwareCardKey}`));
    for (const key of [...observed.current]) if (!present.has(key)) observed.current.delete(key);
    for (const card of state.cards) {
      const key = `${card.readerLocalId}:${card.hardwareCardKey}`;
      if (observed.current.has(key)) continue;
      const reader = state.readers.find((item) => item.localId === card.readerLocalId);
      if (!reader) continue;
      observed.current.add(key);
      const observation = desktopCardObservation(reader, card);
      void registerObservation(observation, { readerLocalId: card.readerLocalId, hardwareCardKey: card.hardwareCardKey });
    }
  }, [registerObservation]);

  useEffect(() => { void refresh(); }, []); // initial load only
  useEffect(() => {
    if (!desktop?.nfc) return;
    void desktop.nfc.state().then(handleDesktopState).catch((err) => setError(errorMessage(err)));
    return desktop.nfc.onState(handleDesktopState);
  }, [desktop, handleDesktopState]);

  const memory = useMemo(() => {
    try {
      const parsed = NfcRecordListSchema.parse(records);
      const ndefBytes = encodeNdefMessage(parsed).byteLength;
      const required = type2TlvSize(ndefBytes);
      return { valid: true, required, ndefBytes, error: null };
    } catch (err) { return { valid: false, required: 0, ndefBytes: 0, error: errorMessage(err) }; }
  }, [records]);
  const available = selected?.writableBytes ?? null;
  const usage = available && memory.valid ? Math.min(100, Math.round((memory.required / available) * 100)) : null;
  const qrValue = useMemo(() => records.find((record) => ["url", "deep_link", "social_profile", "business_profile", "digital_business_card", "windels_profile", "marketplace_profile", "product_profile", "custom_uri"].includes(record.kind))?.value, [records]);
  useEffect(() => {
    let cancelled = false;
    if (!qrValue) { setQrData(null); return; }
    void QRCode.toDataURL(qrValue, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" }, errorCorrectionLevel: "M" }).then((value) => { if (!cancelled) setQrData(value); }).catch(() => setQrData(null));
    return () => { cancelled = true; };
  }, [qrValue]);

  async function scanBrowser() {
    setBusy("web-scan"); setError(null);
    try { await registerObservation(await scanWebNfc()); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  function selectCard(card: NfcCard) {
    setSelected(card);
    if (card.records.length) {
      const next = card.records.map((row) => ({
        kind: (row.payload.kind ?? row.kind) as NfcRecordInput["kind"], value: row.payload.value,
        language: row.payload.language ?? "en", mediaType: row.payload.mediaType,
        ...(row.kind === "custom" ? { tnf: row.tnf, type: row.recordType, payloadBase64: row.payload.payloadBase64 ?? "" } : {}),
      }));
      const parsed = NfcRecordListSchema.safeParse(next);
      if (parsed.success) setRecords(parsed.data);
    }
    setTab("manager");
  }

  async function performAction() {
    if (!selected || !confirmAction) return;
    const association = associations.current.get(selected.id);
    if (!desktop?.nfc || !association) {
      setError("Place this card on a WINDELS Desktop PC/SC reader and read it again before performing a hardware operation.");
      return;
    }
    setBusy(confirmAction); setError(null);
    const action = confirmAction;
    try {
      const isPermanent = action === "lock" || action === "protect";
      const prepared = await nfcApi.prepare(action === "write" && selected.records.length ? "update" : action, {
        cardId: selected.id,
        readerId: selected.readerId!,
        idempotencyKey: idempotency(action),
        ...(action === "write" ? { records } : {}),
        previousNdefHash: selected.ndefHash ?? undefined,
        overwriteConfirmed,
        irreversibleConfirmed: isPermanent && permanentPhrase === "LOCK PERMANENTLY",
        confirmationPhrase: isPermanent ? permanentPhrase : undefined,
      });
      if (!prepared.writePlan) throw new Error("The API did not return a hardware execution plan.");
      const hardware = await desktop.nfc.execute({
        ...prepared.writePlan,
        operationToken: prepared.operationToken,
        readerLocalId: association.readerLocalId,
        hardwareCardKey: association.hardwareCardKey,
        previousNdefHash: prepared.writePlan.previousNdefHash ?? undefined,
        irreversibleConfirmed: isPermanent,
      });
      const verified = await nfcApi.verify({
        operationId: prepared.operation.id,
        operationToken: prepared.operationToken,
        hardwareSucceeded: hardware.hardwareSucceeded,
        readbackNdefBase64: hardware.readbackNdefBase64,
        lockStatus: hardware.lockStatus,
        protected: hardware.protected,
        hardwareEvidence: hardware.hardwareEvidence,
        errorCode: hardware.errorCode,
        errorMessage: hardware.errorMessage,
      });
      if (verified.status !== "SUCCEEDED") throw new Error(verified.errorMessage || "NFC write verification failed. No success status was recorded.");
      setNotice(`${action === "write" ? "Write" : action} completed and independently read back successfully.`);
      setConfirmAction(null); setOverwriteConfirmed(false); setPermanentPhrase("");
      await refresh();
      setSelected(await nfcApi.card(selected.id));
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  async function askAi() {
    setBusy("ai"); setError(null);
    try {
      const result = await aiApi.complete({
        messages: [{ role: "user", content: aiPrompt }],
        system: "You are the WINDELS NFC content assistant. Return JSON only: an array named records containing 1-4 compact NDEF record objects with kind, value, and language. Prefer one secure HTTPS WINDELS/profile URL over personal data. Allowed kinds: url,text,vcard,email,telephone,sms,deep_link,social_profile,business_profile,digital_business_card,windels_profile,marketplace_profile,product_profile,custom_uri. Never propose erase, lock, protection, credentials, payment secrets, or destructive operations.",
        responseFormat: { type: "json_object" }, temperature: 0.2, maxTokens: 800,
      });
      const parsed = JSON.parse(result.content);
      const validated = NfcRecordListSchema.parse(parsed.records);
      setRecords(validated);
      setNotice(`WINDELS AI prepared ${validated.length} record${validated.length === 1 ? "" : "s"}; review before writing.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  function applyTemplate(template: NfcTemplate) {
    setRecords(template.records.map((record) => ({ ...record, metadata: record.metadata ? { ...record.metadata } : undefined })));
    setTab("manager");
    setNotice(`${template.name} loaded. Customize and review it before writing.`);
  }
  function updateRecord(index: number, patch: Partial<NfcRecordInput>) { setRecords((current) => current.map((record, i) => i === index ? { ...record, ...patch } : record)); }
  function removeRecord(index: number) { setRecords((current) => current.filter((_, i) => i !== index)); }

  const currentLocal = selected ? associations.current.get(selected.id) : undefined;
  const desktopReader = desktopState?.readers.find((reader) => reader.localId === currentLocal?.readerLocalId);
  const localCard = desktopState?.cards.find((card) => card.readerLocalId === currentLocal?.readerLocalId && card.hardwareCardKey === currentLocal?.hardwareCardKey);
  const canWrite = !!selected?.writable && selected.qualification === "QUALIFIED" && !!currentLocal && memory.valid && available !== null && memory.required <= available;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Nfc className="h-7 w-7 text-azure" /><h1 className="text-2xl font-black text-text-bright">NFC Card Manager</h1><Badge variant="azure">WINDELS AI OS</Badge></div>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">Detect, inspect, create, write, read back, and manage NDEF cards through capability-aware hardware adapters. No reader/card combination is treated as write-supported until it passes real-hardware qualification.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Refresh</Button><Button size="sm" onClick={() => void scanBrowser()} loading={busy === "web-scan"}><ScanLine className="h-4 w-4" />Scan with Web NFC</Button></div>
      </header>

      <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Hardware validation gate active.</strong> Web NFC is read-only here because browsers do not expose trustworthy capacity or lock data. Desktop writes require an exact PC/SC reader + card technology combination recorded as qualified after real read/write/read-back testing.</div></div>
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson"><XCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}>✕</button></div>}
      {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald/30 bg-emerald/10 p-4 text-sm text-emerald"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="flex-1">{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}>✕</button></div>}

      <div className="grid gap-3 md:grid-cols-3">
        <Summary icon={<Cpu className="h-5 w-5" />} label="Connected readers" value={String(desktopState?.readers.filter((reader) => reader.status === "ONLINE").length ?? 0)} detail={desktop ? "Desktop PC/SC adapter" : "Desktop bridge not active"} />
        <Summary icon={<Radio className="h-5 w-5" />} label="Card detection" value={localCard ? "Card present" : "Waiting"} detail={localCard?.technology ?? "Place a card on a reader"} tone={localCard ? "emerald" : "slate"} />
        <Summary icon={<Library className="h-5 w-5" />} label="Card library" value={String(cards.length)} detail={`${operations.filter((item) => item.status === "SUCCEEDED").length} verified operations`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap justify-start">
          <TabsTrigger value="manager">Card Manager</TabsTrigger><TabsTrigger value="library">Card Library</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="history">Write History</TabsTrigger><TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="manager" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <div className="space-y-4">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4 text-azure" />Connected Reader</CardTitle><CardDescription>Automatic PC/SC card events are delivered by the integrated desktop bridge.</CardDescription></CardHeader><CardContent className="space-y-3">
                {desktopReader ? <><div className="flex items-center justify-between"><span className="font-medium text-text-bright">{desktopReader.name}</span><Badge variant={desktopReader.status === "ONLINE" ? "emerald" : "crimson"}>{desktopReader.status}</Badge></div><div className="text-xs text-text-muted">PC/SC · bridge {desktopReader.bridgeVersion} · {desktopReader.platform}</div></> : <div className="flex items-start gap-2 text-sm text-text-muted"><Unplug className="mt-0.5 h-4 w-4" />Open WINDELS Desktop and connect a compatible USB PC/SC reader, or use Web NFC for read-only inspection.</div>}
                {desktopState?.error && <div className="rounded border border-crimson/20 bg-crimson/10 p-2 text-xs text-crimson">{desktopState.error.code}: {desktopState.error.message}</div>}
              </CardContent></Card>

              <Card><CardHeader><CardTitle>Card Information</CardTitle><CardDescription>{selected ? "Latest server-recorded, tenant-scoped observation." : "No NFC card selected."}</CardDescription></CardHeader><CardContent>
                {selected ? <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2"><Nfc className="h-6 w-6 text-azure" /><div className="flex-1"><div className="font-semibold text-text-bright">{selected.name}</div><div className="text-xs text-text-muted">{selected.uidMasked || "UID not retained / unavailable"}</div></div><Badge variant={statusBadge(selected.supportStatus)}>{selected.supportStatus.replaceAll("_", " ")}</Badge></div>
                  <InfoRow label="Technology" value={selected.technology} /><InfoRow label="Memory" value={selected.memoryBytes === null ? "Unknown" : `${selected.memoryBytes} bytes`} /><InfoRow label="Writable capacity" value={selected.writableBytes === null ? "Unknown" : `${selected.writableBytes} bytes`} /><InfoRow label="NDEF" value={selected.ndefSupported ? "Supported" : "Not verified"} /><InfoRow label="Lock status" value={selected.lockStatus} /><InfoRow label="Qualification" value={selected.qualification.replaceAll("_", " ")} />
                  <div className="grid grid-cols-2 gap-2 pt-1"><Badge variant={selected.readable ? "emerald" : "slate"}>Read {selected.readable ? "yes" : "no"}</Badge><Badge variant={selected.writable ? "emerald" : "slate"}>Write {selected.writable ? "yes" : "no"}</Badge><Badge variant={selected.erasable ? "emerald" : "slate"}>Erase {selected.erasable ? "yes" : "no"}</Badge><Badge variant={selected.lockable ? "amber" : "slate"}>Lock {selected.lockable ? "available" : "no"}</Badge></div>
                </div> : <div className="py-8 text-center text-sm text-text-muted"><ScanLine className="mx-auto mb-2 h-8 w-8 opacity-50" />Place a card on a connected reader. Desktop detection is automatic; browser scanning requires the button above.</div>}
              </CardContent></Card>
            </div>

            <div className="space-y-4">
              <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="flex items-center gap-2"><Save className="h-4 w-4 text-violet" />NDEF Content Creator</CardTitle><CardDescription>Create multiple records, then preview and confirm. Existing content is never silently overwritten.</CardDescription></div><Button size="sm" variant="outline" onClick={() => setRecords((current) => [...current, initialRecord()])} disabled={records.length >= 16}><Plus className="h-4 w-4" />Add record</Button></div></CardHeader><CardContent className="space-y-3">
                {profiles.length > 0 && <div className="rounded-lg border border-emerald/20 bg-emerald/5 p-3"><label className="mb-1 block text-xs font-medium text-emerald">Use a managed WINDELS identity/profile</label><Select defaultValue="" onChange={(event) => { const profile = profiles.find((item) => item.id === event.target.value); if (profile) setRecords([{ kind: profile.profileType === "VENDOR" ? "marketplace_profile" : profile.profileType === "PRODUCT" ? "product_profile" : profile.profileType === "BUSINESS" || profile.profileType === "COMPANY" ? "business_profile" : "windels_profile", value: profile.secureUrl, language: "en" }]); }}><option value="">Select a secure profile URL…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.profileType}</option>)}</Select><div className="mt-1 text-[11px] text-text-muted">Recommended: the card stores only this updateable HTTPS destination, not the profile's personal fields.</div></div>}
                {records.map((record, index) => <RecordEditor key={index} record={record} index={index} onChange={(patch) => updateRecord(index, patch)} onRemove={() => removeRecord(index)} canRemove={records.length > 1} />)}
              </CardContent></Card>

              <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <Card><CardHeader><CardTitle>Capacity validation</CardTitle><CardDescription>NDEF bytes plus NFC Forum Type 2 TLV overhead.</CardDescription></CardHeader><CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3"><InfoTile label="Available" value={available === null ? "Unknown" : `${available} bytes`} /><InfoTile label="Required" value={memory.valid ? `${memory.required} bytes` : "Invalid"} /></div>
                  {usage !== null && <><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${usage > 100 ? "bg-crimson" : usage > 85 ? "bg-amber" : "bg-azure"}`} style={{ width: `${Math.min(100, usage)}%` }} /></div><div className="text-right text-xs text-text-muted">Usage {usage}%</div></>}
                  {!memory.valid && <div className="text-xs text-crimson">{memory.error}</div>}
                  {available === null && <div className="text-xs text-amber">Writable capacity is unknown. WINDELS blocks writing rather than relying on the hardware to reject an oversized message.</div>}
                  <div className="flex flex-wrap gap-2 pt-2"><Button onClick={() => { setOverwriteConfirmed(false); setConfirmAction("write"); }} disabled={!canWrite}><Save className="h-4 w-4" />Preview & write</Button><Button variant="outline" onClick={() => { setOverwriteConfirmed(false); setConfirmAction("erase"); }} disabled={!selected?.erasable || !currentLocal}><Eraser className="h-4 w-4" />Erase</Button><Button variant="danger" onClick={() => { setOverwriteConfirmed(false); setPermanentPhrase(""); setConfirmAction("lock"); }} disabled={!selected?.lockable || !currentLocal}><LockKeyhole className="h-4 w-4" />Lock</Button><Button variant="warning" onClick={() => { setOverwriteConfirmed(false); setPermanentPhrase(""); setConfirmAction("protect"); }} disabled={!selected?.protectable || !currentLocal}><ShieldCheck className="h-4 w-4" />Protect</Button></div>
                  {!canWrite && selected && <div className="text-xs text-text-muted">Write unavailable: the card must be present, capacity-known, unlocked, writable, and qualified with this exact reader/software stack.</div>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4" />NFC + QR fallback</CardTitle><CardDescription>The first URI record is rendered as a scannable fallback.</CardDescription></CardHeader><CardContent className="text-center">{qrData ? <><img src={qrData} alt={`QR code for ${qrValue}`} className="mx-auto w-48 rounded-lg bg-white p-2" /><div className="mt-2 break-all text-xs text-text-muted">{qrValue}</div></> : <div className="py-10 text-sm text-text-muted">Add a URL or profile record to generate QR.</div>}</CardContent></Card>
              </div>

              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet" />WINDELS AI assistance</CardTitle><CardDescription>AI may prepare safe content, but it can never write, erase, lock, or protect a card.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea rows={3} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} /><Button variant="secondary" onClick={() => void askAi()} loading={busy === "ai"}><Sparkles className="h-4 w-4" />Prepare NDEF structure</Button></CardContent></Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="library"><Card><CardHeader><CardTitle>My NFC Cards</CardTitle><CardDescription>Sensitive raw card identifiers are not stored; only an HMAC-derived key and optional masked suffix are retained.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <button key={card.id} onClick={() => selectCard(card)} className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-azure/40 hover:bg-azure/5"><div className="flex items-start gap-3"><Nfc className="mt-1 h-5 w-5 text-azure" /><div className="min-w-0 flex-1"><div className="font-semibold text-text-bright">{card.name}</div><div className="mt-0.5 text-xs text-text-muted">{card.technology} · {card.uidMasked || "identifier private"}</div></div><Badge variant={statusBadge(card.supportStatus)}>{card.status}</Badge></div><div className="mt-3 text-xs text-text-muted">Assigned: {card.profile?.name ?? "No profile"}</div><div className="mt-1 text-xs text-text-muted">Last updated: {new Date(card.updatedAt).toLocaleString()}</div><div className="mt-3 flex gap-1"><Badge variant={card.readable ? "emerald" : "slate"}>read</Badge><Badge variant={card.writable ? "emerald" : "slate"}>write</Badge><Badge variant={card.lockable ? "amber" : "slate"}>lock</Badge></div></button>)}{cards.length === 0 && <div className="col-span-full py-12 text-center text-sm text-text-muted">No cards have been read into this organization's NFC library.</div>}</div></CardContent></Card></TabsContent>

        <TabsContent value="templates"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <Card key={template.id}><CardHeader><CardTitle>{template.name}</CardTitle><CardDescription>{template.description}</CardDescription></CardHeader><CardContent><div className="mb-4 flex flex-wrap gap-1">{template.records.map((record, index) => <Badge key={index} variant="violet">{record.kind.replaceAll("_", " ")}</Badge>)}</div><Button size="sm" onClick={() => applyTemplate(template)}>Use template</Button></CardContent></Card>)}</div></TabsContent>

        <TabsContent value="history"><Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />NFC operation history</CardTitle><CardDescription>Detection, reads, requested mutations, read-back verification, failures, and hardware errors are audit-linked.</CardDescription></CardHeader><CardContent><div className="space-y-2">{operations.map((operation) => <div key={operation.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><Badge variant={operationBadge(operation.status)}>{operation.status}</Badge><div className="min-w-0 flex-1"><div className="text-sm font-medium text-text-bright">{operation.operationType} · {operation.card?.name ?? "Card"}</div><div className="text-xs text-text-muted">{new Date(operation.createdAt).toLocaleString()} · {operation.reader?.name ?? "reader unavailable"}</div>{operation.errorMessage && <div className="mt-1 text-xs text-crimson">{operation.errorCode}: {operation.errorMessage}</div>}</div>{operation.result?.verified === true && <Badge variant="emerald"><CheckCircle2 className="h-3 w-3" />read-back verified</Badge>}</div>)}{operations.length === 0 && <div className="py-12 text-center text-sm text-text-muted">No NFC operations recorded.</div>}</div></CardContent></Card></TabsContent>

        <TabsContent value="diagnostics" className="space-y-4"><Card><CardHeader><CardTitle>Hardware diagnostics</CardTitle><CardDescription>Specific remediation for readers, cards, drivers, NDEF formatting, capacity, lock state, and qualification.</CardDescription></CardHeader><CardContent className="space-y-2">{diagnostics.map((item) => <div key={item.code} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="font-mono text-xs text-amber">{item.code}</div><div className="mt-1 text-sm text-text-muted">{item.guidance}</div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Reader inventory</CardTitle></CardHeader><CardContent className="space-y-2">{readers.map((reader) => <div key={reader.id} className="rounded-lg border border-white/10 p-3"><div className="flex items-center gap-2"><span className="font-medium text-text-bright">{reader.name}</span><Badge variant={reader.status === "ONLINE" ? "emerald" : "slate"}>{reader.status}</Badge><span className="ml-auto text-xs text-text-muted">{reader.interfaceType}</span></div><div className="mt-1 text-xs text-text-muted">Qualified combinations: {reader.qualifiedCombinations.length}. Last seen {reader.lastSeenAt ? new Date(reader.lastSeenAt).toLocaleString() : "never"}.</div>{reader.lastError && <div className="mt-1 text-xs text-crimson">{reader.lastError}</div>}</div>)}{readers.length === 0 && <div className="py-8 text-center text-sm text-text-muted">No reader has reported to this organization.</div>}</CardContent></Card><Card><CardHeader><CardTitle>Local bridge log</CardTitle><CardDescription>Sanitized local diagnostics; card UIDs, payloads, credentials, and operation tokens are never logged.</CardDescription></CardHeader><CardContent className="space-y-2">{desktopState?.logs?.slice(0, 30).map((entry, index) => <div key={`${entry.at}-${index}`} className="grid gap-1 rounded border border-white/10 bg-bg-deep/50 p-2 text-xs sm:grid-cols-[170px_180px_1fr]"><span className="text-text-muted">{new Date(entry.at).toLocaleString()}</span><span className={entry.level === "error" ? "font-mono text-crimson" : entry.level === "warn" ? "font-mono text-amber" : "font-mono text-azure"}>{entry.code}</span><span className="text-text-main">{entry.message}</span></div>)}{!desktopState?.logs.length && <div className="py-8 text-center text-sm text-text-muted">No local hardware log is available. Open this page in WINDELS Desktop to inspect PC/SC events.</div>}</CardContent></Card></TabsContent>
      </Tabs>

      <Modal open={!!confirmAction} onClose={() => !busy && setConfirmAction(null)} title={confirmAction ? `${confirmAction === "write" ? "Preview and write" : confirmAction.charAt(0).toUpperCase() + confirmAction.slice(1)} NFC card` : "Confirm"} size="lg" closeOnBackdrop={!busy}>
        {selected && confirmAction && <div className="space-y-4">
          <div className={`rounded-lg border p-3 text-sm ${confirmAction === "lock" || confirmAction === "protect" ? "border-crimson/30 bg-crimson/10 text-crimson" : "border-amber/30 bg-amber/10 text-amber"}`}><strong>{confirmAction === "write" ? "Existing content will be replaced only after confirmation." : confirmAction === "erase" ? "This removes supported user NDEF data." : "This operation may be permanent and irreversible."}</strong> The card will be read immediately before execution and changed contents cancel the operation.</div>
          <div className="grid gap-3 sm:grid-cols-3"><InfoTile label="Card" value={selected.name} /><InfoTile label="Technology" value={selected.technology} /><InfoTile label="Reader" value={desktopReader?.name ?? "Not present"} /></div>
          {selected.records.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Existing content</div><div className="space-y-1">{selected.records.map((record) => <div key={record.id} className="rounded border border-white/10 bg-white/5 p-2 text-xs"><span className="font-medium text-text-bright">{record.kind}</span><span className="ml-2 break-all text-text-muted">{record.payload.value ?? "Protected/custom payload"}</span></div>)}</div></div>}
          {confirmAction === "write" && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Intended content · {memory.required} / {available ?? "?"} bytes</div><div className="space-y-1">{records.map((record, index) => <div key={index} className="rounded border border-azure/20 bg-azure/5 p-2 text-xs"><span className="font-medium text-azure">{record.kind}</span><span className="ml-2 break-all text-text-muted">{record.kind === "wifi" ? `${record.value} (credential hidden)` : record.value ?? record.type}</span></div>)}</div></div>}
          <label className="flex items-start gap-2 text-sm text-text-main"><input type="checkbox" className="mt-1" checked={overwriteConfirmed} onChange={(event) => setOverwriteConfirmed(event.target.checked)} /><span>I reviewed the existing content, selected card, capacity, and intended result. I authorize this {confirmAction} operation.</span></label>
          {(confirmAction === "lock" || confirmAction === "protect") && <div><label className="mb-1 block text-xs font-medium text-crimson">Type LOCK PERMANENTLY</label><Input value={permanentPhrase} onChange={(event) => setPermanentPhrase(event.target.value)} placeholder="LOCK PERMANENTLY" /></div>}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Safe execution workflow</div><div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">Detect <span>→</span> Identify <span>→</span> Check capability <span>→</span> Validate size <span>→</span> Confirm <span>→</span> Write <span>→</span> Read back <span>→</span> Compare <span>→</span> Verified result</div></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmAction(null)} disabled={!!busy}>Cancel</Button><Button variant={confirmAction === "lock" || confirmAction === "protect" ? "danger" : "primary"} onClick={() => void performAction()} loading={busy === confirmAction} disabled={!overwriteConfirmed || ((confirmAction === "lock" || confirmAction === "protect") && permanentPhrase !== "LOCK PERMANENTLY")}>{confirmAction === "write" ? "Write & verify" : `Confirm ${confirmAction}`}</Button></div>
        </div>}
      </Modal>
    </div>
  );
}

function RecordEditor({ record, index, onChange, onRemove, canRemove }: { record: NfcRecordInput; index: number; onChange: (patch: Partial<NfcRecordInput>) => void; onRemove: () => void; canRemove: boolean }) {
  const wifi = record.kind === "wifi";
  const custom = record.kind === "custom";
  const multiline = record.kind === "vcard" || record.kind === "text";
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="mb-3 flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded bg-violet/15 text-xs font-bold text-violet">{index + 1}</span><Select value={record.kind} onChange={(event) => onChange({ kind: event.target.value as NfcRecordInput["kind"], value: "", metadata: undefined, ...(event.target.value === "custom" ? { tnf: 4, type: "ai.windels:custom", payloadBase64: "" } : {}) })}>{KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</Select><Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={!canRemove} aria-label={`Remove record ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
    {custom ? <div className="grid gap-2 sm:grid-cols-[100px_1fr]"><Input type="number" min={0} max={7} value={record.tnf ?? 4} onChange={(event) => onChange({ tnf: Number(event.target.value) })} placeholder="TNF" /><Input value={record.type ?? ""} onChange={(event) => onChange({ type: event.target.value })} placeholder="Record type" /><Input className="sm:col-span-2" value={record.payloadBase64 ?? ""} onChange={(event) => onChange({ payloadBase64: event.target.value })} placeholder="Payload (base64)" /></div> : multiline ? <Textarea rows={record.kind === "vcard" ? 6 : 3} value={record.value ?? ""} onChange={(event) => onChange({ value: event.target.value })} placeholder={record.kind === "vcard" ? "BEGIN:VCARD…" : "Text to store"} /> : wifi ? <div className="grid gap-2 sm:grid-cols-2"><Input value={record.value ?? ""} onChange={(event) => onChange({ value: event.target.value, metadata: { ...(record.metadata ?? {}), ssid: event.target.value } })} placeholder="Wi-Fi SSID" /><Input type="password" value={String(record.metadata?.password ?? "")} onChange={(event) => onChange({ metadata: { ...(record.metadata ?? {}), ssid: record.value ?? "", password: event.target.value, authentication: "WPA2_PERSONAL", encryption: "AES" } })} placeholder="Wi-Fi password" /><div className="sm:col-span-2 flex items-start gap-2 text-xs text-amber"><Wifi className="h-3.5 w-3.5 shrink-0" />Credentials are stored on the tag. Prefer guest-network credentials and review exposure risk.</div></div> : <Input value={record.value ?? ""} onChange={(event) => onChange({ value: event.target.value })} placeholder={record.kind === "email" ? "name@example.com" : record.kind === "telephone" ? "+1…" : record.kind.includes("profile") || record.kind === "url" ? "https://…" : "Value"} />}
  </div>;
}
function Summary({ icon, label, value, detail, tone = "azure" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: "azure" | "emerald" | "slate" }) { const color = { azure: "bg-azure/15 text-azure", emerald: "bg-emerald/15 text-emerald", slate: "bg-slate-500/15 text-slate-300" }[tone]; return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>{icon}</div><div><div className="text-xs text-text-muted">{label}</div><div className="font-semibold text-text-bright">{value}</div><div className="text-[11px] text-text-muted">{detail}</div></div></CardContent></Card>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2"><span className="text-text-muted">{label}</span><span className="text-right font-medium text-text-bright">{value}</span></div>; }
function InfoTile({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div><div className="mt-1 break-words text-sm font-semibold text-text-bright">{value}</div></div>; }
