/**
 * WINDELS AI OS — Music Studio.
 *
 * Generates REAL, audible music tracks (16-bit PCM WAV, synthesized in pure
 * Node on the server — no external provider or ffmpeg binary required). Pick a
 * genre / key / tempo / length / mood, generate, and play/download the track.
 * Manage your library: favorite, tag, rename, regenerate variations, delete.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { musicApi, MUSIC_KEYS, MUSIC_MOODS, type MusicCapability, type MusicGenre, type MusicKey, type MusicMood, type MusicTrackRecord } from "@/lib/musicGen";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Music, Loader2, Download, RefreshCw, Music2, HeartPulse, Waves, Heart, Pencil, Trash2, Star, Repeat, Tag, Play, Gauge } from "lucide-react";

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
  const [mood, setMood] = useState<MusicMood>("balanced");
  const [loop, setLoop] = useState(false);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [tagInput, setTagInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([musicApi.capabilities(), musicApi.tracks()]);
      setCaps(c); setTracks(t);
    } catch { /* degrades before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      if (res) setNotice(res as string);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [refresh]);

  const generate = useCallback(async () => {
    await run("generate", async () => {
      const rec = await musicApi.generate({ genre, key, tempo, durationSec: dur, mood, loop, title: `${genre} · ${key} · ${tempo}bpm${loop ? " · loop" : ""}` });
      return `Track rendered (${fmtBytes(rec.bytes)}) — it's real audio, play it below.`;
    });
  }, [genre, key, tempo, dur, mood, loop, run]);

  const toggleFav = useCallback((t: MusicTrackRecord) => {
    void run(`fav-${t.id}`, async () => {
      await musicApi.favorite(t.id, !t.favorite);
    });
  }, [run]);

  const saveRename = useCallback((t: MusicTrackRecord) => {
    void run(`ren-${t.id}`, async () => {
      await musicApi.rename(t.id, editTitle.trim() || t.title);
      setEditingId(null);
    });
  }, [editTitle, run]);

  const saveTags = useCallback((t: MusicTrackRecord) => {
    void run(`tags-${t.id}`, async () => {
      const tags = tagInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
      await musicApi.tags(t.id, tags);
      setTagInput("");
    });
  }, [tagInput, run]);

  const remove = useCallback((t: MusicTrackRecord) => {
    void run(`del-${t.id}`, async () => {
      await musicApi.remove(t.id);
    });
  }, [run]);

  const regenerate = useCallback((t: MusicTrackRecord) => {
    void run(`reg-${t.id}`, async () => {
      const rec = await musicApi.regenerate(t.id);
      return `New variation created: "${rec.title}".`;
    });
  }, [run]);

  const recordPlay = useCallback((t: MusicTrackRecord) => {
    // fire-and-forget play counter
    void musicApi.play(t.id).catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    let v = tracks;
    if (onlyFavs) v = v.filter((t) => t.favorite);
    if (tagFilter.trim()) {
      const q = tagFilter.trim().toLowerCase();
      v = v.filter((t) => t.tags.some((tag) => tag.toLowerCase().includes(q)));
    }
    return v;
  }, [tracks, onlyFavs, tagFilter]);

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
            <CardDescription>Pick genre, key, tempo, length and mood, then render real audio.</CardDescription>
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Mood / energy</label>
                <Select value={mood} onChange={(e) => setMood(e.target.value as MusicMood)}>
                  {MUSIC_MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Tempo (BPM)</label>
                <Input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} min={50} max={180} />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Length (seconds)</label>
                <Input type="number" value={dur} onChange={(e) => setDur(Number(e.target.value))} min={3} max={120} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Seamless loop</label>
                <button onClick={() => setLoop((l) => !l)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${loop ? "border-azure-500 bg-azure-500/10 text-azure-200" : "border-border text-text-muted"}`}>
                  <Repeat className="h-3 w-3 inline mr-1" /> {loop ? "On" : "Off"}
                </button>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={generate} disabled={busy === "generate"}>
                  {busy === "generate" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Music2 className="h-4 w-4 mr-2" />}
                  {busy === "generate" ? "Rendering…" : "Generate music"}
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
          <CardHeader><CardTitle className="text-sm">Genres & moods</CardTitle></CardHeader>
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
            <div className="rounded-lg border border-border bg-bg-elevated p-2 text-xs text-text-muted">
              <Gauge className="h-3 w-3 inline mr-1" /> Mood shapes intensity: mellow (soft), balanced, energetic (dense & bright).
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Track library */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm">Your tracks</CardTitle>
              <CardDescription>Generated WAV files — play, favorite, tag, rename, regenerate or delete.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={onlyFavs ? "primary" : "outline"} onClick={() => setOnlyFavs((f) => !f)}>
                <Star className="h-3 w-3 mr-1" /> Favorites
              </Button>
              <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Filter by tag" className="w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <div className="text-sm text-text-muted py-8 text-center">
              {tracks.length === 0 ? "No tracks yet. Generate one above." : "No tracks match your filters."}
            </div>
          ) : (
            <div className="grid gap-2">
              {visible.map((t) => (
                <div key={t.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Title + meta */}
                    <div className="min-w-0 flex-1">
                      {editingId === t.id ? (
                        <div className="flex items-center gap-2">
                          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-56" autoFocus />
                          <Button size="sm" onClick={() => saveRename(t)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="font-medium text-text-bright flex items-center gap-2">
                          {t.title}
                          {t.favorite && <Star className="h-3 w-3 text-amber-400" />}
                          {t.loop && <Repeat className="h-3 w-3 text-azure-400" />}
                        </div>
                      )}
                      <div className="text-xs text-text-muted mt-0.5 flex flex-wrap items-center gap-1">
                        {t.genre} · {t.key} · {t.tempo}bpm · {t.mood} · {Math.round(t.durationSec)}s · {fmtBytes(t.bytes)}
                        {t.playCount > 0 && <span className="text-azure-300">· ▶ {t.playCount}</span>}
                        {t.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-bg-hover px-1.5 text-[10px]"><Tag className="h-2.5 w-2.5" />{tag}</span>)}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === "completed" ? "outline" : "secondary"}>{t.status}</Badge>
                      {t.status === "completed" && t.url && (
                        <>
                          <audio src={t.url} className="h-8 w-36" controls preload="none" onPlay={() => recordPlay(t)} />
                          <a href={t.url} download><Button size="sm" variant="outline"><Download className="h-3 w-3" /></Button></a>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => toggleFav(t)} title={t.favorite ? "Unfavorite" : "Favorite"}>
                        <Heart className={`h-3 w-3 ${t.favorite ? "fill-rose-400 text-rose-400" : ""}`} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(t.id); setEditTitle(t.title); }} title="Rename">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => regenerate(t)} disabled={busy === `reg-${t.id}`} title="New variation">
                        {busy === `reg-${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setTagInput(t.tags.join(", ")); }} title="Tag">
                        <Tag className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(t)} disabled={busy === `del-${t.id}`} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline tag editor */}
                  {tagInput !== "" && (
                    <div className="flex items-center gap-2 mt-2 border-t border-border pt-2">
                      <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="tags, comma separated" className="w-56" />
                      <Button size="sm" onClick={() => saveTags(t)}>Save tags</Button>
                      <Button size="sm" variant="outline" onClick={() => setTagInput("")}>Close</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
