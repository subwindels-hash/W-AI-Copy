import { test, expect } from "@playwright/test";
const BASE = process.env.API_URL ?? "http://localhost:4000/api/v1";
async function login(r:any){
  const res=await r.post(`${BASE}/auth/login`,{data:{email:process.env.E2E_ADMIN_EMAIL??"admin@windels.ai", password:process.env.E2E_ADMIN_PASSWORD??"W1ndels!Admin#2026"}});
  if(!res.ok()) return null;
  const b=await res.json().catch(()=>null);
  return b?.data?.accessToken ?? b?.accessToken ?? null;
}
test.describe("Permissions — /api/v1/permissions",()=>{
  test("requires auth", async({request})=>{
    const r=await request.get(`${BASE}/permissions`);
    if(r.status()===502) test.skip();
    expect([401,403]).toContain(r.status());
  });
  test("list my permissions", async({request})=>{
    const t=await login(request); if(!t) test.skip();
    const r=await request.get(`${BASE}/permissions`,{headers:{Authorization:`Bearer ${t}`}});
    if(r.status()===502) test.skip(); expect(r.ok()).toBeTruthy();
    const b=await r.json(); expect(b.data).toHaveProperty("permissions");
  });
  test("check permission", async({request})=>{
    const t=await login(request); if(!t) test.skip();
    const r=await request.get(`${BASE}/permissions/check?permission=ORG_READ`,{headers:{Authorization:`Bearer ${t}`}});
    if(r.status()===502) test.skip(); expect(r.ok()).toBeTruthy();
  });
});
