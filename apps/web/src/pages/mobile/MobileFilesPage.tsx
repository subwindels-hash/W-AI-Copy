import { useEffect, useState } from "react";
import { Camera, File, FileText, FolderOpen, Image as ImageIcon, Paperclip, Search, UploadCloud } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { MButton } from "@/components/mobile/MButton";
import { api } from "@/lib/api";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

type FileRec = { id: string; filename: string; mimeType: string; sizeBytes: number; createdAt: string };

export function MobileFilesPage() {
  const [files, setFiles] = useState<FileRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const fileRef = useState<HTMLInputElement | null>(null);
  const h = useHaptics();

  useEffect(() => {
    api<{ items: FileRec[] }>("/attachments?perPage=100")
      .then((data) => setFiles(data.items))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = files.filter((f) => f.filename.toLowerCase().includes(q.toLowerCase()));

  const openCamera = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => { h.success(); };
    input.click();
  };
  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => { h.success(); };
    input.click();
  };
  const pickDoc = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => { h.success(); };
    input.click();
  };

  return (
    <div>
      <MobileTopBar title="Files" />
      <div className="px-4 pt-3">
        <div className="flex items-center h-11 px-4 rounded-xl bg-white/5 border border-white/10 focus-within:border-azure-400">
          <Search size={18} className="text-text-muted mr-2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files…"
            className="flex-1 bg-transparent outline-none text-[15px] text-text-main placeholder:text-text-muted"
          />
        </div>
      </div>

      <div className="px-4 pt-4 grid grid-cols-3 gap-3">
        <UploadTile icon={<Camera size={20} />} label="Camera" color="from-rose-500 to-crimson" onClick={openCamera} />
        <UploadTile icon={<ImageIcon size={20} />} label="Photo" color="from-violet-500 to-fuchsia-500" onClick={pickImage} />
        <UploadTile icon={<FileText size={20} />} label="Document" color="from-azure-500 to-sky-500" onClick={pickDoc} />
      </div>

      <div className="px-4 pt-6">
        <h3 className="text-sm font-semibold text-text-bright px-1 mb-3">Recent files</h3>
        {!loading && filtered.length === 0 && (
          <MEmptyState
            icon={<FolderOpen size={48} />}
            title="No files yet"
            message="Upload documents, images, and attachments from chat — they'll show up here."
          />
        )}
        <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 active:bg-white/5">
              <span className="h-10 w-10 rounded-xl bg-white/5 grid place-items-center text-azure-400">
                {f.mimeType.startsWith("image/") ? <ImageIcon size={18} /> : <File size={18} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-text-main truncate">{f.filename}</p>
                <p className="text-xs text-text-muted">{Math.round(f.sizeBytes/1024)} KB · {new Date(f.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadTile({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-bg-elevated border border-white/10 active:scale-95 transition">
      <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${color} grid place-items-center text-white`}>{icon}</span>
      <span className="text-xs text-text-main">{label}</span>
    </button>
  );
}
