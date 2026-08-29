import { useEffect, useState, useCallback } from "react";
import { Shield, RefreshCw, Plus, Trash2 } from "lucide-react";
import * as perm from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";

export function PermissionsPage(){
  const [my, setMy]=useState<any>(null);
  const [catalog, setCatalog]=useState<Record<string,string[]>>({});
  const [userId, setUserId]=useState("");
  const [userPerms, setUserPerms]=useState<any>(null);
  const [target, setTarget]=useState("");
  const [permission, setPermission]=useState("ORG_READ");
  const [checkPerm, setCheckPerm]=useState("ORG_READ");
  const [checkRes, setCheckRes]=useState<boolean|null>(null);
  const [err, setErr]=useState<string|null>(null);
  const load=useCallback(async()=>{
    try{
      setMy(await perm.listMyPermissions());
      try{ setCatalog(await perm.getCatalog()); }catch{}
      setErr(null);
    }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  async function doGrant(){
    try{ await perm.grant(target, permission); setErr(null); await load(); }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  }
  async function doCheck(){
    try{ const r=await perm.check(checkPerm); setCheckRes(r.hasPermission); }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  }
  async function lookup(){
    try{ setUserPerms(await perm.listUserPermissions(userId)); }catch(e){ setErr(e instanceof Error? e.message: String(e)); }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Shield className="h-6 w-6 text-violet"/><h1 className="text-2xl font-black text-text-bright">Permissions</h1><Badge variant="emerald">Session 133</Badge></div><Button size="sm" variant="outline" onClick={()=> void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
      {err? <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{err}<button className="float-right" onClick={()=> setErr(null)}>✕</button></div>:null}
      {my? <Card><CardHeader><CardTitle>My permissions</CardTitle><CardDescription>Role: {my.role ?? "—"} · grants {my.grants?.length}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-1">{my.permissions?.map((p:string)=> <Badge key={p} variant="slate">{p}</Badge>)} {!my.permissions?.length? <span className="text-sm text-text-muted">No permissions.</span>:null}</CardContent></Card>:null}
      <Card><CardHeader><CardTitle>Catalog</CardTitle><CardDescription>All available permissions by category.</CardDescription></CardHeader><CardContent className="space-y-2">{Object.entries(catalog).map(([cat, perms])=>(
        <div key={cat} className="text-sm"><span className="font-semibold text-text-bright">{cat}:</span> {perms.map(p=> <Badge key={p} variant="slate" className="ml-1">{p}</Badge>)}</div>
      ))} {!Object.keys(catalog).length? <span className="text-sm text-text-muted">Catalog requires ORG_ADMIN. Login as admin to view.</span>:null}</CardContent></Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Grant</CardTitle><CardDescription>Admin: grant permission to user.</CardDescription></CardHeader><CardContent className="space-y-2">
          <Input placeholder="targetUserId" value={target} onChange={e=> setTarget(e.target.value)}/>
          <Select value={permission} onChange={e=> setPermission(e.target.value)}>{Object.values(catalog).flat().map(p=> <option key={p} value={p}>{p}</option>)}{!Object.keys(catalog).length? <option>ORG_READ</option>:null}</Select>
          <Button size="sm" onClick={()=> void doGrant()}><Plus className="h-4 w-4"/>Grant</Button>
          {my?.grants?.length? <div className="space-y-1">{my.grants.map((g:any)=>(
            <div key={g.id} className="flex items-center gap-2 text-xs border border-white/10 rounded p-1"><span className="font-mono">{g.permission}</span><span className="text-text-muted">{g.resourceId||"global"}</span><Button size="sm" variant="ghost" onClick={async()=>{ await perm.revoke(g.id); await load();}}><Trash2 className="h-3 w-3"/></Button></div>
          ))}</div>:null}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Check & Lookup</CardTitle></CardHeader><CardContent className="space-y-2">
          <div className="flex gap-2"><Select value={checkPerm} onChange={e=> setCheckPerm(e.target.value)}>{Object.values(catalog).flat().map(p=> <option key={p} value={p}>{p}</option>)}{!Object.keys(catalog).length? <option>ORG_READ</option>:null}</Select><Button size="sm" onClick={()=> void doCheck()}>Check</Button>{checkRes!==null? <Badge variant={checkRes? "emerald":"crimson"}>{checkRes? "has":"no"}</Badge>:null}</div>
          <div className="flex gap-2"><Input placeholder="userId lookup" value={userId} onChange={e=> setUserId(e.target.value)}/><Button size="sm" variant="outline" onClick={()=> void lookup()}>Lookup</Button></div>
          {userPerms? <div className="text-xs"><div>role {userPerms.role}</div><div className="flex flex-wrap gap-1">{userPerms.permissions?.map((p:string)=> <Badge key={p} variant="slate">{p}</Badge>)}</div></div>:null}
        </CardContent></Card>
      </div>
    </div>
  );
}
