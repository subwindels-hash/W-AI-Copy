import { useEffect, useState } from "react";
import { Camera, File, FileText, FolderOpen, Image as ImageIcon, Search } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { filesApi, type FileRecord } from "@/lib/files";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

type FileRec = Pick<FileRecord, "id" | "filename" | "mimeType" | "sizeBytes" | "createdAt">;

export function MobileFilesPage() {
  const [files, setFiles] = useState<FileRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const h = useHaptics();

  async function refresh() {
    try { const result = await filesApi.list({ perPage: 100 }); setFiles(result.items); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const uploadSelected = async (file: File | undefined) => {
    if (!file) return;
    try { const uploaded = await filesApi.upload(file); setFiles((current) => [uploaded, ...current]); h.success(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const choose = (accept: string, capture?: "environment") => {
    const input = document.createElement("input"); input.type = "file"; input.accept = accept;
    if (capture) input.capture = capture;
    input.onchange = () => { void uploadSelected(input.files?.[0]); };
    input.click();
  };

  const filtered = files.filter((file) => file.filename.toLowerCase().includes(q.toLowerCase()));

  return <div><MobileTopBar title="Files" /><div className="px-4 pt-3"><div className="flex items-center h-11 px-4 rounded-xl bg-white/5 border border-white/10 focus-within:border-azure-400"><Search size={18} className="text-text-muted mr-2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="flex-1 bg-transparent outline-none text-[15px] text-text-main placeholder:text-text-muted" /></div></div>{error ? <div className="mx-4 mt-3 rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">{error}</div> : null}
    <div className="px-4 pt-4 grid grid-cols-3 gap-3"><UploadTile icon={<Camera size={20} />} label="Camera" color="from-rose-500 to-crimson" onClick={() => choose("image/*", "environment")} /><UploadTile icon={<ImageIcon size={20} />} label="Photo" color="from-violet-500 to-fuchsia-500" onClick={() => choose("image/*")} /><UploadTile icon={<FileText size={20} />} label="Document" color="from-azure-500 to-sky-500" onClick={() => choose("application/pdf,text/plain,text/markdown,text/csv,application/json")}/></div>
    <div className="px-4 pt-6"><h3 className="text-sm font-semibold text-text-bright px-1 mb-3">Recent files</h3>{!loading && filtered.length === 0 ? <MEmptyState icon={<FolderOpen size={48} />} title="No files yet" message="Upload documents, images, and attachments from this device." /> : <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">{filtered.map((file) => <div key={file.id} className="flex items-center gap-3 px-4 py-3 active:bg-white/5"><span className="h-10 w-10 rounded-xl bg-white/5 grid place-items-center text-azure-400">{file.mimeType.startsWith("image/") ? <ImageIcon size={18} /> : <File size={18} />}</span><div className="flex-1 min-w-0"><p className="text-[14px] text-text-main truncate">{file.filename}</p><p className="text-xs text-text-muted">{Math.round(file.sizeBytes / 1024)} KB · {new Date(file.createdAt).toLocaleDateString()}</p></div></div>)}</div>}</div>
  </div>;
}

function UploadTile({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) { return <button onClick={onClick} className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-bg-elevated border border-white/10 active:scale-95 transition"><span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${color} grid place-items-center text-white`}>{icon}</span><span className="text-xs text-text-main">{label}</span></button>; }
