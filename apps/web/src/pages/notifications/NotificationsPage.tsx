import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Trash2, RefreshCw, Settings } from "lucide-react";
import * as notif from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function NotificationsPage(){
  const [data, setData]=useState<{notifications:any[]; unreadCount:number}|null>(null);
  const [prefs, setPrefs]=useState<any[]>([]);
  const [err, setErr]=useState<string|null>(null);
  const [showPrefs, setShowPrefs]=useState(false);
  const load=useCallback(async()=>{
    try{
      const d=await notif.listNotifications({limit:50});
      setData(d);
      const p=await notif.getPreferences();
      setPrefs(p);
      setErr(null);
    }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  async function mark(id:string){ await notif.markRead(id); await load(); }
  async function markAll(){ await notif.markAllRead(); await load(); }
  async function dismiss(id:string){ await notif.dismiss(id); await load(); }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Bell className="h-6 w-6 text-azure"/><h1 className="text-2xl font-black text-text-bright">Notifications</h1>{data? <Badge variant="amber">{data.unreadCount} unread</Badge>:null}<Badge variant="emerald">Session 132</Badge></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=> void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button><Button size="sm" variant="outline" onClick={()=> setShowPrefs(v=>!v)}><Settings className="h-4 w-4"/>Preferences</Button></div>
      </div>
      {err? <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}<button className="float-right" onClick={()=> setErr(null)}>✕</button></div>:null}
      {data? <div className="flex gap-2"><Button size="sm" onClick={()=> void markAll()}><CheckCheck className="h-4 w-4"/>Mark all read</Button></div>:null}
      <Card><CardHeader><CardTitle>Inbox</CardTitle><CardDescription>In-app notifications (push/email via delivery queue). Unread badge counts `readAt===null`.</CardDescription></CardHeader><CardContent className="space-y-2">
        {data?.notifications.map((n:any)=>(
          <div key={n.id} className={`flex items-center gap-3 p-3 rounded border ${n.readAt? "border-white/5 bg-white/5":"border-azure/30 bg-azure/5"}`}>
            <div className="flex-1"><div className="font-medium text-text-bright text-sm">{n.title}</div><div className="text-xs text-text-muted">{n.body}</div><div className="text-[10px] text-text-muted">{n.type} · {new Date(n.createdAt).toLocaleString()}</div></div>
            {!n.readAt? <Button size="sm" variant="outline" onClick={()=> void mark(n.id)}><CheckCheck className="h-3 w-3"/>Read</Button>:null}
            <Button size="sm" variant="ghost" onClick={()=> void dismiss(n.id)}><Trash2 className="h-3 w-3"/></Button>
          </div>
        ))}
        {!data?.notifications.length? <p className="text-sm text-text-muted py-6 text-center">No notifications.</p>:null}
      </CardContent></Card>
      {showPrefs? <Card><CardHeader><CardTitle>Preferences</CardTitle><CardDescription>Per-category channel toggles (in-app/push/email/sms).</CardDescription></CardHeader><CardContent className="space-y-1">
        {prefs.map((p:any)=>(
          <div key={p.category} className="flex items-center gap-2 text-sm border border-white/10 rounded p-2">
            <span className="font-mono text-text-bright">{p.category}</span><span className="text-text-muted">{p.channels?.join(",")}</span><Badge variant={p.enabled? "emerald":"slate"}>{p.enabled? "on":"off"}</Badge>
          </div>
        ))}
        {!prefs.length? <p className="text-sm text-text-muted">No preferences.</p>:null}
      </CardContent></Card>:null}
    </div>
  );
}
