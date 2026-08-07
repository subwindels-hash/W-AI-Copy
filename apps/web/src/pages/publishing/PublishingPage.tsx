import { useEffect, useState, useCallback } from "react";
import { Megaphone, RefreshCw, Radio, Upload, ClipboardList } from "lucide-react";
import * as pub from "@/lib/publishing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function PublishingPage(){
  const [platforms, setPlatforms]=useState<any[]>([]);
  const [jobs, setJobs]=useState<any[]>([]);
  const [audit, setAudit]=useState<any[]>([]);
  const [err, setErr]=useState<string|null>(null);
  const load=useCallback(async()=>{
    try{ setPlatforms(await pub.listPlatforms()); setJobs(await pub.listJobs()); setAudit(await pub.listAudit()); setErr(null); }catch(e){ setErr(e instanceof Error? e.message:String(e)); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Megaphone className="h-6 w-6 text-violet"/><h1 className="text-2xl font-black text-text-bright">Publishing</h1><Badge variant="emerald">Session 134</Badge></div><Button size="sm" variant="outline" onClick={()=> void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
      {err? <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>:null}
      <Card><CardHeader><CardTitle className="flex gap-2"><Radio className="h-5 w-5"/>Platforms</CardTitle><CardDescription>Org-scoped connections via mediaFactory PublishingService.</CardDescription></CardHeader><CardContent className="grid md:grid-cols-3 gap-2">{platforms.map((p:any)=>(
        <div key={p.id||p.platform||p} className="border border-white/10 rounded p-3 text-sm"><div className="font-semibold text-text-bright">{p.id||p.platform||JSON.stringify(p)}</div><div className="text-xs text-text-muted">{p.connected? "connected":"not connected"} · {p.configured? "configured":"needs credentials"}</div></div>
      ))}{!platforms.length? <span className="text-sm text-text-muted">No platforms.</span>:null}</CardContent></Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="flex gap-2"><ClipboardList className="h-5 w-5"/>Jobs</CardTitle></CardHeader><CardContent>{jobs.length? jobs.map((j:any)=> <div key={j.id||Math.random()} className="text-xs border border-white/10 rounded p-2 mb-1">{JSON.stringify(j)}</div>): <span className="text-sm text-text-muted">No jobs.</span>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex gap-2"><Upload className="h-5 w-5"/>Audit</CardTitle></CardHeader><CardContent>{audit.length? audit.map((a:any)=> <div key={a.id||Math.random()} className="text-xs border border-white/10 rounded p-2 mb-1">{a.action||a.platform||JSON.stringify(a)}</div>): <span className="text-sm text-text-muted">No audit entries.</span>}</CardContent></Card>
      </div>
    </div>
  );
}
