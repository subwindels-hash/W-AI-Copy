import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Lock, MessageSquare } from "lucide-react";
import { resolveSharedView, type ConvSharedView } from "@/lib/shares";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function SharePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [view, setView] = useState<ConvSharedView | null>(null);
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (pw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await resolveSharedView(token, pw);
      setView(data);
    } catch (e: any) {
      const msg = e?.message ?? "This share link could not be opened.";
      if (msg.toLowerCase().includes("password")) {
        setNeedPassword(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function submitPassword() {
    await load(password);
  }

  return (
    <div className="app-min-screen bg-bg-deep text-text-main">
      <header className="border-b border-white/10 bg-bg-dark/60 backdrop-blur px-6 py-4 flex items-center gap-3 sticky top-0 z-10 app-sticky-top">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-azure/40 to-violet/40 grid place-items-center">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-bright">Shared conversation</div>
          <div className="text-[11px] text-text-muted">WINDELS AI OS</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading && <p className="text-sm text-text-muted text-center py-16">Loading…</p>}

        {needPassword && !view && (
          <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-bg-dark/60 p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-bright">
              <Lock className="h-4 w-4 text-azure" /> Password required
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitPassword(); }}
              placeholder="Enter link password"
              autoFocus
              className="h-10 w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-azure/50"
            />
            <Button onClick={() => void submitPassword()} className="w-full">Open conversation</Button>
            {error && <p className="text-xs text-crimson">{error}</p>}
          </div>
        )}

        {error && !needPassword && (
          <div className="mx-auto max-w-sm rounded-2xl border border-crimson/30 bg-crimson/10 p-6 text-center">
            <p className="text-sm text-crimson">{error}</p>
            <p className="mt-2 text-xs text-text-muted">Ask the conversation owner for a working link.</p>
          </div>
        )}

        {view && (
          <div className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="azure">view · {view.permissions}</Badge>
                {view.ownerName && <Badge variant="secondary">shared by {view.ownerName}</Badge>}
              </div>
              <h1 className="mt-3 text-2xl font-black text-text-bright">{view.title}</h1>
              {view.summary && <p className="mt-1 text-sm text-text-muted">{view.summary}</p>}
            </div>

            <div className="space-y-4">
              {view.messages.length === 0 && (
                <p className="text-sm text-text-muted text-center py-10">This conversation has no messages.</p>
              )}
              {view.messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/10 bg-bg-dark/50 px-4 py-3">
                  <div className="text-[11px] text-text-muted mb-1">
                    <span className="font-medium text-text-bright">{m.author}</span>
                    {" · "}{m.role}
                  </div>
                  <div className="text-sm text-text-main whitespace-pre-wrap">{m.content || "[redacted]"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
