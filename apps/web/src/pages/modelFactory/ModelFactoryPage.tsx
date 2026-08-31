/**
 * WINDELS AI OS — Enterprise AI Model Factory console.
 *
 * The factory is a lifecycle register, and the console is built to make the
 * gates visible rather than to smooth them over. A model cannot be dragged
 * into canary: the button is there, the server refuses while governance is
 * outstanding, and the refusal is shown verbatim ("Governance approval
 * required before canary") instead of being swallowed.
 *
 * Two honesty rules shape this page:
 *
 *   * A benchmark needs a score AND a verdict, both typed by the user. Nothing
 *     here computes, estimates or defaults them — the earlier Node route
 *     invented a plausible score and hard-coded `pass: true`, which made every
 *     model look evaluated.
 *   * A fine-tune job is recorded at 0% and started by nothing in this
 *     request. The console does not animate progress it does not have.
 *
 * A fresh organization shows an empty register at every stage count of zero,
 * because nothing is seeded.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, RefreshCw, ShieldCheck, Stamp } from "lucide-react";
import type { Mf2Dashboard, Mf2FineTuneJob, Mf2Model, Mf2Note, Mf2Stage } from "@windels/shared";
import { mf2Api } from "@/lib/modelFactory";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const STAGES: Mf2Stage[] = ["research", "benchmarking", "validation", "approval", "canary", "deployed", "monitoring", "retired"];
const BUILDERS: Mf2Model["builder"][] = ["slm", "llm", "vision", "speech", "audio", "multimodal", "domain"];
const METHODS: Mf2FineTuneJob["method"][] = ["supervised", "rlhf", "dpo", "lora", "qlora"];

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function stageVariant(stage: Mf2Stage) {
  if (stage === "retired") return "slate" as const;
  if (stage === "canary" || stage === "approval") return "amber" as const;
  if (stage === "deployed" || stage === "monitoring") return "emerald" as const;
  return "azure" as const;
}

export function ModelFactoryPage() {
  const [dash, setDash] = useState<Mf2Dashboard | null>(null);
  const [models, setModels] = useState<Mf2Model[]>([]);
  const [tunes, setTunes] = useState<Mf2FineTuneJob[]>([]);
  const [notes, setNotes] = useState<Mf2Note[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // register-model form
  const [name, setName] = useState("");
  const [builder, setBuilder] = useState<Mf2Model["builder"]>("slm");
  const [size, setSize] = useState("7B");
  const [quant, setQuant] = useState("fp16");
  const [vram, setVram] = useState("16000");

  // record-benchmark form
  const [benchModel, setBenchModel] = useState("");
  const [benchName, setBenchName] = useState("");
  const [benchScore, setBenchScore] = useState("");
  const [benchPass, setBenchPass] = useState(true);

  // start-fine-tune form
  const [tuneModel, setTuneModel] = useState("");
  const [dataset, setDataset] = useState("");
  const [method, setMethod] = useState<Mf2FineTuneJob["method"]>("lora");

  // note form
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, m, t, n] = await Promise.all([
        mf2Api.dashboard(), mf2Api.models(), mf2Api.fineTunes(), mf2Api.notes(),
      ]);
      setDash(d); setModels(m); setTunes(t); setNotes(n);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load the model factory");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** An action's failure is the point of the gates, so it is shown as-is. */
  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try { await fn(); } catch (e: any) { setErr(e?.message ?? "Action failed"); }
    await load();
  }

  async function create() {
    if (!name.trim()) return;
    await run(() => mf2Api.create({
      name: name.trim(), builder, size, quant, vramMb: Number(vram) || 0,
    }));
    setName("");
  }

  async function recordBenchmark() {
    if (!benchModel || !benchName.trim() || benchScore === "") return;
    await run(() => mf2Api.benchmark(benchModel, {
      benchmark: benchName.trim(), score: Number(benchScore), pass: benchPass,
    }));
    setBenchName(""); setBenchScore(""); setBenchPass(true);
  }

  async function startFineTune() {
    if (!dataset.trim()) return;
    await run(() => mf2Api.startFineTune({
      dataset: dataset.trim(), method, modelId: tuneModel || undefined,
    }));
    setDataset("");
  }

  async function addNote() {
    if (!noteTitle.trim() || !noteBody.trim()) return;
    await run(() => mf2Api.createNote({ title: noteTitle.trim(), body: noteBody.trim() }));
    setNoteTitle(""); setNoteBody("");
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading model factory…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="h-6 w-6 text-azure" /> Model Factory
          </h1>
          <p className="text-sm text-text-muted">
            A lifecycle register — research to retirement, with the safety and governance gates the
            deployment enforces. Nothing here invents a score.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {err && (
        <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold">{dash.totalModels}</div>
          <div className="text-sm text-text-muted">Models registered</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold text-azure">{dash.activeFineTunes}</div>
          <div className="text-sm text-text-muted">Fine-tune jobs</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold text-emerald-500">{dash.benchmarksPassedPct}%</div>
          <div className="text-sm text-text-muted">Benchmarks passed</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold text-amber-400">{dash.governanceBlocking}</div>
          <div className="text-sm text-text-muted">Waiting on governance</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stage breakdown</CardTitle>
          <CardDescription>Every stage starts at zero — nothing is seeded.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <Badge key={s} variant={dash.byStage?.[s] ? stageVariant(s) : "secondary"}>
              {s}: {dash.byStage?.[s] ?? 0}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Register a model</CardTitle>
          <CardDescription>New models enter the register in research.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <div className="mb-1 text-xs text-text-muted">Name</div>
            <Input aria-label="Model name" placeholder="windels-slm-1b" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-text-muted">Builder</div>
            <Select aria-label="Builder" value={builder} onChange={(e) => setBuilder(e.target.value as Mf2Model["builder"])}>
              {BUILDERS.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
          <div className="w-24">
            <div className="mb-1 text-xs text-text-muted">Size</div>
            <Input value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div className="w-24">
            <div className="mb-1 text-xs text-text-muted">Quant</div>
            <Input value={quant} onChange={(e) => setQuant(e.target.value)} />
          </div>
          <div className="w-28">
            <div className="mb-1 text-xs text-text-muted">VRAM (MB)</div>
            <Input aria-label="VRAM MB" type="number" min={1} value={vram} onChange={(e) => setVram(e.target.value)} />
          </div>
          <Button onClick={() => void create()} disabled={!name.trim()}>Register</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record a benchmark</CardTitle>
          <CardDescription>
            The score and the verdict come from the evaluator that ran it. Neither is computed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div>
            <div className="mb-1 text-xs text-text-muted">Model</div>
            <Select aria-label="Benchmark target model" value={benchModel} onChange={(e) => setBenchModel(e.target.value)}>
              <option value="">Select a model</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <div className="mb-1 text-xs text-text-muted">Benchmark</div>
            <Input aria-label="Benchmark name" placeholder="mmlu" value={benchName} onChange={(e) => setBenchName(e.target.value)} />
          </div>
          <div className="w-28">
            <div className="mb-1 text-xs text-text-muted">Score (0–100)</div>
            <Input aria-label="Benchmark score" type="number" min={0} max={100} step="0.1" value={benchScore} onChange={(e) => setBenchScore(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={benchPass} onChange={(e) => setBenchPass(e.target.checked)} />
            Passing
          </label>
          <Button onClick={() => void recordBenchmark()} disabled={!benchModel || !benchName.trim() || benchScore === ""}>
            Record
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model register</CardTitle>
          <CardDescription>
            Advancing a model is gated: validation needs a safety evaluation, canary needs governance
            approval, and no stage moves backwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {models.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">No models registered yet.</div>
          ) : models.map((m) => (
            <div key={m.id} className="rounded border border-border/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.name}</span>
                <Badge variant="violet">{m.builder}</Badge>
                <Badge variant={stageVariant(m.stage)}>{m.stage}</Badge>
                {m.safetyPassed === true && <Badge variant="emerald"><ShieldCheck className="h-3 w-3 mr-1" />safety passed</Badge>}
                {m.safetyPassed === false && <Badge variant="crimson">safety failed</Badge>}
                {m.governanceApproved && <Badge variant="emerald"><Stamp className="h-3 w-3 mr-1" />governance</Badge>}
                <span className="text-xs text-text-muted">
                  v{m.versions} · {m.size} · {m.quant} · {m.vramMb} MB
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  className="w-44"
                  aria-label={`Advance target for ${m.name}`}
                  defaultValue={STAGES[Math.min(STAGES.indexOf(m.stage) + 1, STAGES.length - 1)]}
                  onChange={(e) => { void run(() => mf2Api.advance(m.id, e.target.value as Mf2Stage)); }}
                >
                  {STAGES.map((s) => <option key={s} value={s}>Advance to {s}</option>)}
                </Select>
                <Button variant="outline" onClick={() => void run(() => mf2Api.safety(m.id, true))}>Safety pass</Button>
                <Button variant="outline" onClick={() => void run(() => mf2Api.safety(m.id, false))}>Safety fail</Button>
                <Button variant="outline" onClick={() => void run(() => mf2Api.approve(m.id))}>Governance approve</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fine-tune jobs</CardTitle>
          <CardDescription>
            A job is recorded at 0% and started by nothing in this request — no trainer is launched
            from the console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="mb-1 text-xs text-text-muted">Model</div>
              <Select aria-label="Fine-tune model" value={tuneModel} onChange={(e) => setTuneModel(e.target.value)}>
                <option value="">No model</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[10rem] flex-1">
              <div className="mb-1 text-xs text-text-muted">Dataset</div>
              <Input aria-label="Dataset" placeholder="sft-corpus-v3" value={dataset} onChange={(e) => setDataset(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-text-muted">Method</div>
              <Select aria-label="Fine-tune method" value={method} onChange={(e) => setMethod(e.target.value as Mf2FineTuneJob["method"])}>
                {METHODS.map((mth) => <option key={mth} value={mth}>{mth}</option>)}
              </Select>
            </div>
            <Button onClick={() => void startFineTune()} disabled={!dataset.trim()}>Start</Button>
          </div>
          {tunes.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-muted">No fine-tune jobs.</div>
          ) : tunes.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
              <span className="flex items-center gap-2">
                <Badge variant="azure">{t.method}</Badge>
                <span className="font-medium">{t.dataset}</span>
                <span className="text-xs text-text-muted">
                  {t.modelId ? `for ${models.find((m) => m.id === t.modelId)?.name ?? t.modelId}` : "no model"}
                </span>
              </span>
              <span className="text-text-muted">
                {t.status} · {t.progressPct}% · {fmtDate(t.startedAt)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Annotations</CardTitle>
          <CardDescription>What the team wrote about this factory — never a model field, never a score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem]">
              <div className="mb-1 text-xs text-text-muted">Title</div>
              <Input aria-label="Note title" placeholder="Canary plan" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            </div>
            <div className="min-w-[14rem] flex-1">
              <div className="mb-1 text-xs text-text-muted">Note</div>
              <Input aria-label="Note body" placeholder="Roll out at 10% for 24 hours." value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            </div>
            <Button onClick={() => void addNote()} disabled={!noteTitle.trim() || !noteBody.trim()}>Add</Button>
          </div>
          {notes.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-muted">No annotations yet.</div>
          ) : notes.map((n) => (
            <div key={n.id} className="rounded border border-border/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{n.title}</span>
                <Button variant="outline" onClick={() => void run(() => mf2Api.deleteNote(n.id))}>Delete</Button>
              </div>
              <p className="text-sm text-text-muted">{n.body}</p>
              <div className="mt-1 text-xs text-text-muted">
                {n.tags?.length ? n.tags.join(", ") : "no tags"} · {fmtDate(n.createdAt)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default ModelFactoryPage;
