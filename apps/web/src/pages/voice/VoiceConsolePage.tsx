import { useEffect, useState, useCallback } from "react";
import { Mic, RefreshCw, Play } from "lucide-react";
import * as voice from "@/lib/voice";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export function VoiceConsolePage(){
  const [builtin, setBuiltin]=useState<any[]>([]);
  const [custom, setCustom]=useState<any[]>([]);
  const [dashboard, setDashboard]=useState<any>(null);
  const [text, setText]=useState("Hello from WINDELS AI OS");
  const [err, setErr]=useState<string|null>(null);
  const load=useCallback(async()=>{
    try{ setBuiltin(await voice.listBuiltin()); setCustom(await voice.listCustom()); setDashboard(await voice.getDashboard()); setErr(null); }catch(e){ setErr(e instanceof Error? e.message:String(e)); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  async function doSynth(){
    try{ const v = builtin[0]?.id || custom[0]?.id; if(!v) throw new Error("No voice available"); await voice.synthesize(text, v); setErr(null); }catch(e){ setErr(e instanceof Error? e.message:String(e)); }
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mic className="h-6 w-6 text-violet"/><h1 className="text-2xl font-black text-text-bright">Voice</h1><Badge variant="emerald">Session 135</Badge></div><Button size="sm" variant="outline" onClick={()=> void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
      {err? <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}</div>:null}
      {dashboard? <Card><CardContent className="p-4 text-xs text-text-muted">{JSON.stringify(dashboard).slice(0,400)}</CardContent></Card>:null}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Built-in ({builtin.length})</CardTitle><CardDescription>Unified catalog (Voice Studio + Foundry).</CardDescription></CardHeader><CardContent className="space-y-1 max-h-80 overflow-auto">{builtin.slice(0,20).map((v:any)=> <div key={v.id} className="flex items-center gap-2 text-xs border border-white/10 rounded p-2"><span className="font-mono text-text-bright">{v.name}</span><Badge variant="slate">{v.gender}</Badge><span className="text-text-muted">{v.language}</span></div>)}{!builtin.length? <span className="text-sm text-text-muted">No built-ins (bootstrap pending).</span>:null}</CardContent></Card>
        <Card><CardHeader><CardTitle>Custom ({custom.length})</CardTitle></CardHeader><CardContent>{custom.length? custom.slice(0,10).map((v:any)=> <div key={v.id} className="text-xs border border-white/10 rounded p-2 mb-1">{v.name}</div>): <span className="text-sm text-text-muted">No custom voices.</span>}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex gap-2"><Play className="h-5 w-5"/>Synthesize</CardTitle></CardHeader><CardContent className="flex gap-2"><Input value={text} onChange={e=> setText(e.target.value)} className="flex-1"/><Button onClick={()=> void doSynth()}><Play className="h-4 w-4"/>Synthesize</Button></CardContent></Card>
    </div>
  );
}
