import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Send, Paperclip, AtSign, X, Image as ImageIcon, FileText, Smile, HardDrive } from "lucide-react";

interface AgentMention { id: string; name: string; color: string; emoji: string; role: string; }

function base64ToFile(b64: string, name: string, type = "application/octet-stream"): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}

interface AttachedFile { id: string; filename: string; mimeType: string; sizeBytes: number; }

const COMMON_EMOJI = ["👍","❤️","😂","🎉","🔥","✅","👀","🙏","🚀","💯","🤔","😮"];

interface Props {
  onSend: (content: string, opts: { attachmentIds?: string[] }) => void;
  agents: AgentMention[];
  loading?: boolean;
  onUploadFile?: (file: File) => Promise<AttachedFile>;
  placeholder?: string;
}

export function TalkComposer({ onSend, agents, loading, onUploadFile, placeholder }: Props) {
  const [text, setText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 180) + "px";
    }
  }, [text]);

  function insertAtCursor(insert: string) {
    const ta = taRef.current;
    if (!ta) { setText((t) => t + insert); return; }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + insert + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + insert.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "@" && !e.shiftKey) {
      setMentionStart((e.target as HTMLTextAreaElement).selectionStart);
      setMentionQuery("");
      setMentionOpen(true);
    }
    if (e.key === "Escape") { setMentionOpen(false); setEmojiOpen(false); }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    if (mentionStart !== null) {
      const tail = v.slice(mentionStart + 1);
      const endIdx = tail.search(/\s/);
      const q = endIdx === -1 ? tail : tail.slice(0, endIdx);
      if (q.length > 20) setMentionOpen(false);
      else setMentionQuery(q);
    }
  }

  function pickAgent(a: AgentMention) {
    if (mentionStart === null) return;
    const ta = taRef.current!;
    const after = text.slice(mentionStart);
    const endIdx = after.search(/\s/);
    const end = endIdx === -1 ? text.length : mentionStart + 1 + endIdx;
    const insert = `@${a.name} `;
    const next = text.slice(0, mentionStart) + insert + text.slice(end);
    setText(next);
    setMentionOpen(false); setMentionStart(null);
    requestAnimationFrame(() => { ta.focus(); const pos = mentionStart + insert.length; ta.setSelectionRange(pos, pos); });
  }

  function handleSend() {
    if (loading || !text.trim()) return;
    const ids = attachments.map((a) => a.id);
    onSend(text.trim(), { attachmentIds: ids.length ? ids : undefined });
    setText(""); setAttachments([]); setEmojiOpen(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !onUploadFile) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      try {
        const att = await onUploadFile(f);
        setAttachments((cur) => [...cur, att]);
      } catch { /* handled upstream */ }
    }
    setUploading(false);
  }

  async function handleDesktopPick() {
    const d = (window as any).desktop;
    if (!d?.fs?.openDialog || !onUploadFile) return;
    setUploading(true);
    try {
      const r = await d.fs.openDialog({
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "All supported", extensions: ["pdf", "md", "txt", "docx", "json", "csv", "png", "jpg", "jpeg", "gif", "webp"] },
          { name: "Documents", extensions: ["pdf", "md", "txt", "docx", "json", "csv"] },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        ],
      });
      if (r?.canceled || !r.files) return;
      for (const f of r.files) {
        try {
          const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
          const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", json: "application/json", txt: "text/plain", md: "text/markdown", csv: "text/csv", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[ext] ?? "application/octet-stream";
          const file = base64ToFile(f.dataBase64, f.name, mime);
          const att = await onUploadFile(file);
          setAttachments((cur) => [...cur, att]);
        } catch { /* ignore */ }
      }
    } finally {
      setUploading(false);
    }
  }

  const filteredAgents = agents.filter(
    (a) => !mentionQuery || a.name.toLowerCase().includes(mentionQuery.toLowerCase()) || a.role.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  return (
    <div className="relative px-4 pb-4">
      <div className="glass p-3 flex flex-col gap-2 focus-within:ring-2 focus-within:ring-azure/40 transition-shadow">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1 text-xs text-slate-300">
                {a.mimeType.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <button onClick={() => setAttachments((s) => s.filter((x) => x.id !== a.id))} className="hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder ?? "Message #channel… (@ to mention an AI teammate, ⏎ to send)"}
          className="w-full bg-transparent resize-none outline-none text-sm text-text-main placeholder:text-text-muted leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-md hover:bg-white/5 text-slate-300"
              title="Attach file"
              disabled={!onUploadFile || uploading}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => handleFiles(e.target.files)} />
            {typeof window !== "undefined" && (window as any).desktop?.fs?.openDialog && (
              <button
                type="button"
                onClick={handleDesktopPick}
                className="p-2 rounded-md hover:bg-white/5 text-azure-300"
                title="Pick from filesystem (native dialog)"
                disabled={!onUploadFile || uploading}
              >
                <HardDrive className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMentionOpen((o) => !o); setEmojiOpen(false); }}
              className="p-2 rounded-md hover:bg-white/5 text-slate-300"
              title="Mention an AI teammate"
            >
              <AtSign className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setEmojiOpen((o) => !o); setMentionOpen(false); }}
              className="p-2 rounded-md hover:bg-white/5 text-slate-300"
              title="Add emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" onClick={handleSend} loading={loading || uploading} disabled={!text.trim() && attachments.length === 0}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>

      {mentionOpen && (
        <div className="absolute bottom-full left-4 mb-2 w-72 glass p-1.5 max-h-60 overflow-y-auto z-20">
          <div className="text-[10px] uppercase tracking-widest text-text-muted px-2 py-1">Mention an AI teammate</div>
          {filteredAgents.length === 0 && <div className="text-xs text-text-muted px-2 py-2">No agents match "{mentionQuery}"</div>}
          {filteredAgents.map((a) => (
            <button
              key={a.id}
              onClick={() => pickAgent(a)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 text-left"
            >
              <span className={cn(
                "h-7 w-7 rounded-full grid place-items-center text-sm shrink-0",
                { azure: "bg-azure/20", violet: "bg-violet/20", teal: "bg-teal/20", fuchsia: "bg-fuchsia/20", amber: "bg-amber/20", emerald: "bg-emerald/20", crimson: "bg-crimson/20" }[a.color] ?? "bg-white/10"
              )}>{a.emoji ?? "🤖"}</span>
              <div className="min-w-0">
                <div className="text-sm text-text-bright truncate">{a.name}</div>
                <div className="text-[11px] text-text-muted truncate">{a.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <div className="absolute bottom-full left-4 mb-2 w-72 glass p-2 z-20">
          <div className="text-[10px] uppercase tracking-widest text-text-muted px-1 pb-1">Quick reactions</div>
          <div className="grid grid-cols-6 gap-1">
            {COMMON_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => { insertAtCursor(e); setEmojiOpen(false); }}
                className="h-8 w-8 rounded-md hover:bg-white/10 text-lg"
              >{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
