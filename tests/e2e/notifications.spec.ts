import { test, expect } from "@playwright/test";
const BASE = process.env.API_URL ?? "http://localhost:4000/api/v1";
async function login(r:any){
  const res=await r.post(`${BASE}/auth/login`,{data:{email:process.env.E2E_ADMIN_EMAIL??"admin@windels.ai", password:process.env.E2E_ADMIN_PASSWORD??"W1ndels!Admin#2026"}});
  if(!res.ok()) return null;
  const b=await res.json().catch(()=>null);
  return b?.data?.accessToken ?? b?.accessToken ?? null;
}
test.describe("Notifications — /api/v1/notifications",()=>{
  test("requires auth", async({request})=>{
    const r=await request.get(`${BASE}/notifications`);
    if(r.status()===502) test.skip();
    expect([401,403]).toContain(r.status());
  });
  test("list + unread-count", async({request})=>{
    const t=await login(request); if(!t) test.skip();
    const l=await request.get(`${BASE}/notifications`,{headers:{Authorization:`Bearer ${t}`}});
    if(l.status()===502) test.skip(); expect(l.ok()).toBeTruthy();
    const b=await l.json(); expect(b.data).toHaveProperty("notifications"); expect(b.data).toHaveProperty("unreadCount");
    const u=await request.get(`${BASE}/notifications/unread-count`,{headers:{Authorization:`Bearer ${t}`}});
    expect(u.ok()).toBeTruthy();
  });
  test("preferences get/patch", async({request})=>{
    const t=await login(request); if(!t) test.skip();
    const g=await request.get(`${BASE}/notifications/preferences`,{headers:{Authorization:`Bearer ${t}`}});
    if(g.status()===502) test.skip(); expect(g.ok()).toBeTruthy();
    const p=await request.patch(`${BASE}/notifications/preferences`,{headers:{Authorization:`Bearer ${t}`}, data:{ category:"auth.new_device", channels:["in_app"], enabled:true }});
    expect(p.ok()).toBeTruthy();
  });
});
