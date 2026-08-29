/**
 * Files — real document store UI backed by the Session 4 attachment module
 * (authenticated upload/download/list/search/delete, org-scoped). Replaces the
 * old "coming in later sessions" placeholder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filesApi, formatBytes, type FileRecord } from "@/lib/files";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Folder, Upload, Loader2, Search, FileText, FileImage, FileCode, File as FileIcon,
  Download, Trash2, CheckCircle2,
} from "lucide-react";

const MIME_ICON: Record<string, typeof FileText> = {
  "image/": FileImage,
  "text/": FileText,
  "application/json": FileCode,
  "application/pdf": FileText,
};
function iconFor(mime: string) {
  const Icon = Object.entries(MIME_ICON).find(([k]) => mime.startsWith(k))?.[1] ?? FileIcon;
  return Icon;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString();

export function FilesPage() {
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (search = q) => {
    try {
      const res = await filesApi.list({ q: search || undefined, perPage: 100 });
      setFiles(res.items);
      setTotal(res.pagination.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [q]);

  useEffect(() => { void refresh(""); }, [refresh]);

  const upload = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setErr(null); setNotice(null);
    try {
      const rec = await filesApi.upload(file);
      setNotice(`Uploaded ${rec.filename} (${formatBytes(rec.sizeBytes)}).`);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setUploading(false); }
  }, [refresh]);

  const remove = useCallback(async (id: string, filename: string) => {
    if (!window.confirm(`Delete ${filename}?`)) return;
    setBusyId(id); setErr(null);
    try {
      await filesApi.remove(id);
      setNotice(`${filename} deleted.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!files) return [];
    const s = q.trim().toLowerCase();
    return s ? files.filter((f) => f.filename.toLowerCase().includes(s)) : files;
  }, [files, q]);

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><Folder className="h-6 w-6 text-azure"/> Files</h1>
          <p className="text-sm text-text-muted mt-1">Your organization's documents — real uploads stored with sha256 verification, MIME allowlist, and org-scoped access.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"/>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="w-56 pl-8 h-9 text-sm"/>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}/>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>} Upload
          </Button>
        </div>
      </div>

      {err && <DataBanner variant="no-creds" title="FILES" message={err}/>}
      {notice && !err && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0"/> {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{total} file{total === 1 ? "" : "s"}</CardTitle>
          <CardDescription>PDF, documents, images, text, JSON, CSV — 25 MB cap per file.</CardDescription>
        </CardHeader>
        <CardContent>
          {!files && <div className="text-sm text-text-muted">Loading…</div>}
          {files && files.length === 0 && <div className="text-sm text-text-muted">No files yet. Upload a document to get started.</div>}
          {files && files.length > 0 && filtered.length === 0 && <div className="text-sm text-text-muted">No files match "{q}".</div>}
          <ul className="space-y-2">
            {filtered.map((f) => {
              const Icon = iconFor(f.mimeType);
              return (
                <li key={f.id} className="p-3 rounded-lg border border-white/10 bg-white/[0.03] flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-white/5 grid place-items-center shrink-0"><Icon className="h-4 w-4 text-azure"/></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-bright truncate">{f.filename}</span>
                        <Badge variant="outline" className="text-[10px]">{f.mimeType}</Badge>
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {formatBytes(f.sizeBytes)} · {fmtDate(f.createdAt)} · sha256 {f.sha256.slice(0, 12)}…
                      </div>
                      {f.previewText && <div className="text-[11px] text-text-muted mt-1 line-clamp-2">{f.previewText}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a href={filesApi.downloadUrl(f.id)} target="_blank" rel="noreferrer" className="text-azure hover:underline flex items-center gap-1 text-xs px-2 py-1.5"><Download className="h-3.5 w-3.5"/> Open</a>
                    <Button size="sm" variant="outline" onClick={() => remove(f.id, f.filename)} disabled={busyId === f.id} className="gap-1 h-7 text-xs text-rose-300">
                      {busyId === f.id ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>} Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default FilesPage;
