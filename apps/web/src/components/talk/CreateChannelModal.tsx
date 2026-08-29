import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { talkApi } from "@/lib/talk";

interface Agent { id: string; name: string; emoji: string; color: string; role: string; isBuiltIn: boolean }
interface OrgUser { id: string; displayName: string; email: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: any) => void;
  mode: "channel" | "dm";
  users: OrgUser[];
  agents: Agent[];
}

export function CreateChannelModal({ open, onClose, onCreated, mode, users, agents }: Props) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [access, setAccess] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [peerId, setPeerId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setName(""); setTopic(""); setAccess("PUBLIC"); setPeerId(""); setMemberIds([]); setAgentIds([]); setError(null); }
  }, [open, mode]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "dm") {
        if (!peerId) { setError("Select a peer for the DM"); setLoading(false); return; }
        const ch = await talkApi.createChannel({ type: "DM", peerUserId: peerId });
        onCreated(ch);
      } else {
        if (!name.trim()) { setError("Channel name is required"); setLoading(false); return; }
        const ch = await talkApi.createChannel({
          type: "CHANNEL",
          name: name.trim(),
          topic: topic.trim() || undefined,
          access,
          memberUserIds: memberIds,
          memberAgentIds: agentIds,
        });
        onCreated(ch);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="glass w-full max-w-md p-5 flex flex-col gap-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">
            {mode === "dm" ? "New direct message" : "Create channel"}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/5 text-text-muted"><X className="h-4 w-4" /></button>
        </div>

        {mode === "dm" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">With</span>
            <select value={peerId} onChange={(e) => setPeerId(e.target.value)} className="h-10 bg-white/5 border border-white/10 rounded-md px-3 text-sm text-text-main">
              <option value="">Select a teammate…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName} — {u.email}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Name</span>
              <div className="flex items-center h-10 rounded-md bg-white/5 border border-white/10 px-3">
                <span className="text-text-muted mr-1">#</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-transparent outline-none text-text-main" placeholder="general" />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Topic (optional)</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} className="h-10 bg-white/5 border border-white/10 rounded-md px-3 text-text-main" placeholder="What's this channel about?" />
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Access</span>
              <div className="flex gap-2">
                {(["PUBLIC", "PRIVATE"] as const).map((a) => (
                  <button type="button" key={a} onClick={() => setAccess(a)}
                    className={`flex-1 h-9 rounded-md border text-sm ${access === a ? "bg-azure/20 border-azure/40 text-azure" : "bg-white/5 border-white/10 text-slate-300"}`}>
                    {a === "PUBLIC" ? "Public — anyone in org" : "Private — only members"}
                  </button>
                ))}
              </div>
            </div>
            {access === "PRIVATE" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-muted">Add AI teammates</span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {agents.map((a) => (
                    <button type="button" key={a.id} onClick={() => setAgentIds((ids) => ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id])}
                      className={`px-2 py-1 rounded-full text-xs border ${agentIds.includes(a.id) ? "bg-violet/20 border-violet/40 text-violet" : "bg-white/5 border-white/10 text-slate-300"}`}>
                      {a.emoji} {a.name}
                    </button>
                  ))}
                </div>
              </label>
            )}
          </>
        )}

        {error && <div className="text-xs text-crimson">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{mode === "dm" ? "Create DM" : "Create channel"}</Button>
        </div>
      </form>
    </div>
  );
}
