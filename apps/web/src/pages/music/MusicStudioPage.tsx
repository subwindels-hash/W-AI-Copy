/**
 * WINDELS AI OS — Music Studio.
 *
 * Generates REAL, audible music tracks (16-bit PCM WAV, synthesized in pure
 * Node on the server — no external provider or ffmpeg binary required). Pick a
 * genre / key / tempo / length, generate, and play/download the track. This is
 * real audio output, not a placeholder — unlike the old mediaGen "music" stub.
 */
import { useCallback, useEffect, useState } from "react";
import { musicApi, MUSIC_KEYS, type MusicCapability, type MusicGenre, type MusicKey, type MusicTrackRecord } from "@/lib/musicGen";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Music, Loader2, Play, Download, RefreshCw, Music2, HeartPulse, Waves } from "lucide-react";

const genreIcon: Record<string, React.ReactNode> = {
  pop: <Music2 className="h-4 w-4" />,
  lofi: <Waves className="h-4 w-4" />,
  cinematic: <HeartPulse className="h-4 w-4" />,
  edm: <Music2 className="h-4 w-4" />,
  ambient: <Waves className="h-4 w-4" />,
  hiphop: <Music2 className="h-4 w-4" />,
};

const fmtBytes = (b?: number) => (b ? `${(b / 1024).toFixed(1)} KB` : "—");

export function MusicStudioPage() {
  const [caps, setCaps] = useState<MusicCapability[]>([]);
  const [tracks, setTracks] = useState<MusicTrackRecord[]>([]);
  const [genre, setGenre] = useState<MusicGenre>("pop");
  const [key, setKey] = useState<MusicKey>("C");
  const [tempo, setTempo] = useState(100);
  const [dur, setDur] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([musicApi.capabilities(), musicApi.tracks()]);
      setCaps(c); setTracks(t);
    } catch { /* degrades before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const generate = useCallback(async () => {
    setBusy(true); setErr(null); setNotice(null);
    try {
      const rec = await musicApi.generate({ genre, key, tempo, durationSec: dur, title: `${genre} · ${key} · ${tempo}bpm` });
      setNotice(`Track rendered (${fmtBytes(rec.bytes)}) — it's real audio, play it below.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [genre, key, tempo, dur, refresh]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Music className="h-6 w-6 text-azure-400" /> Music Studio
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Generate real, playable music tracks (WAV) — synthesized server-side, no external provider needed.
          </p>
        </div>
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Generator */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Generate a track</CardTitle>
            <CardDescription>Pick a genre, key, tempo and length, then render real audio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Genre</label>
                <Select value={genre} onChange={(e) => setGenre(e.target.value as MusicGenre)}>
                  {caps.map((c) => <option key={c.genre} value={c.genre}>{c.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Key</label>
                <Select value={key} onChange={(e) => setKey(e.target.value as MusicKey)}>
                  {MUSIC_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Tempo (BPM)</label>
                <Input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} min={50} max={180} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Length (seconds)</label>
                <Input type="number" value={dur} onChange={(e) => setDur(Number(e.target.value))} min={3} max={120} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={generate} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Music2 className="h-4 w-4 mr-2" />}
                  {busy ? "Rendering…" : "Generate music"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {caps.filter((c) => c.genre === genre).map((c) => (
                <div key={c.genre} className="text-xs text-text-muted">
                  {genreIcon[c.genre]} {c.blurb}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Capability legend */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Genres</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {caps.map((c) => (
              <div key={c.genre} className="flex items-start gap-2 rounded-lg border border-border bg-bg-elevated p-2">
                <span className="text-azure-300 mt-0.5">{genreIcon[c.genre]}</span>
                <div>
                  <div className="text-sm text-text-bright">{c.label}</div>
                  <div className="text-xs text-text-muted">{c.blurb}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Track list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your tracks</CardTitle>
          <CardDescription>Generated WAV files — play or download them. Each is a real audio file on disk.</CardDescription>
        </CardHeader>
        <CardContent>
          {tracks.length === 0 ? (
            <div className="text-sm text-text-muted py-8 text-center">No tracks yet. Generate one above.</div>
          ) : (
            <div className="grid gap-2">
              {tracks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div>
                    <div className="font-medium text-text-bright">{t.title}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {t.genre} · {t.key} · {t.tempo}bpm · {t.durationSec}s · {fmtBytes(t.bytes)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.status === "completed" ? "outline" : "secondary"}>{t.status}</Badge>
                    {t.status === "completed" && t.url && (
                      <>
                        <audio src={t.url} className="h-8 w-40" controls preload="none" />
                        <a href={t.url} download><Button size="sm" variant="outline"><Download className="h-3 w-3" /></Button></a>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
