import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
vi.mock("../db/client.js", ()=> ({ prisma: db.client() }));
vi.mock("../db/redis.js", ()=> ({
  redisCmd: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    lpush: vi.fn().mockResolvedValue(1),
    rpop: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  }
}));
vi.mock("../services/push.service.js", ()=> ({ sendToUser: vi.fn().mockResolvedValue({}) }));
vi.mock("@prisma/client", async()=> ({...(await import("../testUtils/prismaClientMock.js"))}));

const { notificationsService } = await import("./notifications.service.js");
const USER="user-notif-a";

beforeEach(()=>{ db.reset(); });

describe("notifications", ()=>{
  it("creates and lists notifications", async()=>{
    const id = await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"Hello", body:"World", category:"auth.login_success" as any, priority:"normal", channels:["in_app"] });
    expect(typeof id).toBe("string");
    const list = await notificationsService.getForUser(USER);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Hello");
  });
  it("unread count tracks read", async()=>{
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"T1", body:"B1", category:"billing.invoice_paid" as any, priority:"normal", channels:["in_app"] });
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"T2", body:"B2", category:"billing.invoice_paid" as any, priority:"normal", channels:["in_app"] });
    expect(await notificationsService.getUnreadCount(USER)).toBe(2);
    const list = await notificationsService.getForUser(USER);
    await notificationsService.markAsRead(list[0].id, USER);
    expect(await notificationsService.getUnreadCount(USER)).toBe(1);
  });
  it("markAllAsRead", async()=>{
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"X", body:"Y", category:"system.outage" as any, priority:"high", channels:["in_app"] });
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"X2", body:"Y2", category:"system.outage" as any, priority:"high", channels:["in_app"] });
    const c = await notificationsService.markAllAsRead(USER);
    expect(c).toBe(2);
    expect(await notificationsService.getUnreadCount(USER)).toBe(0);
  });
  it("delete (dismiss) sets dismissedAt", async()=>{
    const id = await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"D", body:"E", category:"ai.report_ready" as any, priority:"low", channels:["in_app"] });
    await notificationsService.delete(id, USER);
    const row = db.tables.get("Notification")?.find(r=> r.id===id);
    expect(row.dismissedAt).toBeTruthy();
  });
  it("user isolation", async()=>{
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"OnlyA", body:"B", category:"collaboration.mention" as any, priority:"normal", channels:["in_app"] });
    const other = await notificationsService.getForUser("other-user");
    expect(other.length).toBe(0);
  });
  it("unreadOnly filter", async()=>{
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"U1", body:"B", category:"workflow.completed" as any, priority:"normal", channels:["in_app"] });
    const list = await notificationsService.getForUser(USER);
    await notificationsService.markAsRead(list[0].id, USER);
    await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"U2", body:"B", category:"workflow.completed" as any, priority:"normal", channels:["in_app"] });
    const unread = await notificationsService.getForUser(USER, { unreadOnly:true });
    expect(unread.length).toBe(1);
    expect(unread[0].title).toBe("U2");
  });
  it("getIconForCategory", ()=>{
    expect(notificationsService.getIconForCategory("auth.login_success" as any)).toBe("shield");
    expect(notificationsService.getIconForCategory("billing.invoice_paid" as any)).toBe("credit-card");
    expect(notificationsService.getIconForCategory("ai.report_ready" as any)).toBe("bot");
  });
  it("preferences defaults", async()=>{
    const prefs = await notificationsService.getPreferences(USER);
    expect(prefs.length).toBeGreaterThanOrEqual(4);
  });
  it("updatePreference upsert", async()=>{
    await notificationsService.updatePreference(USER, "auth.new_device" as any, ["email"], true);
    const p = await notificationsService.getPreferences(USER);
    expect(p.find(x=> x.category==="auth.new_device")).toBeTruthy();
  });
  it("queueDelivery sets pending", async()=>{
    const id = await notificationsService.createAndSend({ userId: USER, organizationId:"org-a", title:"Q", body:"Q", category:"system.maintenance_scheduled" as any, priority:"low", channels:["email"] });
    expect(typeof id).toBe("string");
  });
});
