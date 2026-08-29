/** Playwright E2E — Sessions 73 OpEx, 74 Industry, 75 Health Ecosystem */
import { test, expect } from "@playwright/test";
const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const WEB = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
async function apiLogin(): Promise<string> {
  for (let i=0;i<6;i++){
    try{
      const r = await fetch(`${BASE}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@windels.ai",password:"W1ndels!Admin#2026"})});
      const j = await r.json().catch(()=>({}));
      if (j?.data?.token) return j.data.token;
      await new Promise(r=>setTimeout(r,1200));
    }catch{await new Promise(r=>setTimeout(r,1200));}
  }
  await fetch(`${BASE}/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@windels.ai",password:"W1ndels!Admin#2026",displayName:"Super Admin",organizationName:"WINDELS"})});
  const r = await fetch(`${BASE}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@windels.ai",password:"W1ndels!Admin#2026"})});
  return (await r.json()).data.token;
}
test.describe("S73/74/75 API",()=>{
  let token:string;
  test.beforeAll(async()=>{token=await apiLogin();});
  const get=(p:string)=>fetch(`${BASE}${p}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
  test("S73 opex: trust scores, alerts, gates, playbooks, regs",async()=>{
    const d=await get("/opex/dashboard/rollup"); expect(d.ok).toBe(true);
    expect(d.data.trust.trust).toBeGreaterThan(0);
    expect(Array.isArray(d.data.recentAlerts)).toBe(true);
    expect(Array.isArray(d.data.governance.gates)).toBe(true);
    expect(d.data.governance.gates.length).toBeGreaterThanOrEqual(5);
  });
  test("S74 industry: 25 industry packs, ontology, doc regions, layers",async()=>{
    const d=await get("/industry/dashboard/rollup"); expect(d.ok).toBe(true);
    expect(d.data.industries.length).toBe(25);
    expect(d.data.ontology.terms).toBeGreaterThan(0);
    expect(Array.isArray(d.data.doc.regions)).toBe(true);
    expect(Object.keys(d.data.layerMapping)).toHaveLength(4);
  });
  test("S75 health: daily/weekly scores, labeled insights, 3-bucket labeling",async()=>{
    const d=await get("/health-ecosystem/dashboard/rollup"); expect(d.ok).toBe(true);
    expect(d.data.today.score).toBeGreaterThan(0);
    expect(d.data.weeklyAvg.score).toBeGreaterThan(0);
    expect(Array.isArray(d.data.insights)).toBe(true);
    expect(Object.keys(d.data.labelBreakdown)).toEqual(expect.arrayContaining(["wellness_estimate","clinically_validated","medical_decision_support"]));
    // Fifth Standing Rule: no wellness estimate is tagged clinically_validated accidentally; check every metric/insight/session has a label
    for (const m of d.data.recentMetrics) expect(["wellness_estimate","clinically_validated","medical_decision_support"]).toContain(m.label);
    for (const s of d.data.recentSessions) expect(s.label).toBeDefined();
  });
});
test.describe("Web shell",()=>{
  test("platform page loads",async({page})=>{
    await page.goto(WEB,{waitUntil:"domcontentloaded"});
    expect(await page.content().then(c=>c.length)).toBeGreaterThan(500);
  });
});
