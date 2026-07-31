import { useEffect, useState } from "react";
import { Bot, File, Gauge, Grid3X3, MessageSquare, RefreshCw, Workflow, Download, ExternalLink, MessageCircle } from "lucide-react";
import { DesktopTitleBar } from "@/app/desktop/DesktopTitleBar";
import { MButton } from "@/components/mobile/MButton";
import { useDesktop } from "@/app/desktop/hooks/useDesktop";
import { api } from "@/lib/api";

/**
 * Desktop landing page shown in the Electron main window.
 * Mirrors the web dashboard but adds desktop-specific actions:
 *  - Multi-window launchers (Chat, Workflow, Canvas)
 *  - Native open/save file actions
 *  - Auto-update status
 *  - System tray & badge counts
 */
export function DesktopHomePage() {
  const d = useDesktop();
  const [info, setInfo] = useState<any>(null);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [badge, setBadge] = useState(0);
  const [stats, setStats] = useState({ agents: 0, convos: 0, workflows: 0 });

  useEffect(() => {
    d?.app.info().then(setInfo);
    Promise.all([
      api.get<any[]>("/agents").catch(() => []),
      api.get<any[]>("/conversations").catch(() => []),
      api.get<any[]>("/workflows").catch(() => []),
    ]).then(([a, c, w]) => setStats({ agents: a.length, convos: c.length, workflows: w.length }));
    const off = d?.onUpdateDownloaded(() => setUpdateStatus("ready"));
    return () => off?.();
  }, [d]);

  const launchWindow = (kind: "chat" | "workflow" | "canvas") => d?.window.show(kind);
  const openFile = async () => {
    const r = await d?.fs.openDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Documents", extensions: ["pdf", "md", "txt", "docx", "json", "csv"] }],
    });
    if (r && !r.canceled) d?.notify.send({ title: "Files opened", body: `${r.files?.length ?? 0} file(s) selected` });
  };
  const checkUpdates = async () => {
    setUpdateStatus("checking");
    const r = await d?.app.checkForUpdates();
    setUpdateStatus(r?.dev ? "dev" : r?.ok ? "checked" : "error");
  };
  const sendNotif = () => {
    d?.notify.send({ title: "WINDELS AI OS", body: "Desktop notifications are working.", url: "/app" });
    setBadge((n) => n + 1);
    d?.notify.setBadge(badge + 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright">Desktop</h1>
          <p className="text-text-muted text-sm">
            You're running WINDELS AI OS as a native desktop app{info ? ` · v${info.version} (${info.platform}-${info.arch})` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <MButton size="md" variant="secondary" onClick={checkUpdates}>
            <RefreshCw size={16} /> Check for updates
          </MButton>
          <MButton size="md" onClick={sendNotif}>
            <ExternalLink size={16} /> Test notification
          </MButton>
        </div>
      </div>

      {updateStatus === "ready" && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div>
            <p className="text-emerald-300 font-semibold">Update ready to install</p>
            <p className="text-sm text-text-muted">Restart WINDELS to apply the update.</p>
          </div>
          <MButton variant="success" size="md" onClick={() => d?.app.installUpdateAndRestart()}>
            <Download size={16} /> Restart & install
          </MButton>
        </div>
      )}

      <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide mb-3">Windows</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <LaunchCard icon={<MessageCircle size={22} />} label="Chat Window" desc="Pop-out AI chat" color="from-azure-500 to-sky-500" onClick={() => launchWindow("chat")} />
        <LaunchCard icon={<Workflow size={22} />} label="Workflow Builder" desc="Dedicated editor" color="from-violet-500 to-fuchsia-500" onClick={() => launchWindow("workflow")} />
        <LaunchCard icon={<Grid3X3 size={22} />} label="Canvas" desc="Floating workspace" color="from-teal-500 to-emerald-500" onClick={() => launchWindow("canvas")} alwaysOnTop />
        <LaunchCard icon={<File size={22} />} label="Open File…" desc="Native picker" color="from-amber-500 to-orange-500" onClick={openFile} />
      </div>

      <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide mb-3">Workspace</h2>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat icon={<Bot size={18} className="text-violet-400" />} label="AI Agents" value={stats.agents} />
        <Stat icon={<MessageSquare size={18} className="text-azure-400" />} label="Conversations" value={stats.convos} />
        <Stat icon={<Gauge size={18} className="text-emerald-400" />} label="Workflows" value={stats.workflows} />
      </div>

      <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide mb-3">System</h2>
      <div className="bg-bg-elevated border border-white/10 rounded-2xl p-5 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <Info label="Version" value={info?.version ?? "—"} />
        <Info label="Platform" value={info ? `${info.platform} ${info.arch}` : "web"} />
        <Info label="OS release" value={info?.osVersion ?? "—"} />
        <Info label="Packaged" value={info?.isPackaged ? "yes" : "dev"} />
        <Info label="Badge count" value={String(badge)} />
        <Info label="Update status" value={updateStatus || "idle"} />
        <Info label="User data" value={info?.userDataPath ?? "—"} mono />
        <Info label="Documents" value={info?.documentsPath ?? "—"} mono />
      </div>
    </div>
  );
}

function LaunchCard({ icon, label, desc, color, onClick, alwaysOnTop }: { icon: React.ReactNode; label: string; desc: string; color: string; onClick: () => void; alwaysOnTop?: boolean }) {
  const d = useDesktop();
  return (
    <button
      onClick={() => { onClick(); if (alwaysOnTop) d?.window.setAlwaysOnTop(true, "floating"); }}
      className="p-4 rounded-2xl bg-bg-elevated border border-white/10 text-left hover:bg-white/5 active:scale-[0.98] transition"
    >
      <span className={`h-11 w-11 rounded-xl bg-gradient-to-br ${color} grid place-items-center text-white mb-3 shadow-lg`}>{icon}</span>
      <p className="text-[15px] font-semibold text-text-bright">{label}</p>
      <p className="text-xs text-text-muted mt-0.5">{desc}</p>
    </button>
  );
}
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-bg-elevated border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-text-muted text-xs">{icon} {label}</div>
      <p className="text-2xl font-bold text-text-bright mt-2">{value}</p>
    </div>
  );
}
function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={"text-text-main text-[13px] truncate " + (mono ? "font-mono" : "")}>{value}</p>
    </div>
  );
}
