/**
 * Playwright E2E — Sessions 2/3/4 + 112: Conversations / Messaging.
 *
 * Exercises the Session 112 operations surface against a live API: the read
 * state and its declared basis, participant management, measured statistics,
 * message search, the extractive digest, transcript export and soft-delete
 * recovery.
 *
 * The assertions are deliberately about *honesty*, not just shape:
 *   - a thread nobody has marked read reports `never_marked_read`;
 *   - usage counters that no message recorded come back `null`, not `0`;
 *   - search declares itself a substring matcher;
 *   - the digest declares `aiGenerated: false`.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Sessions 2/3/4 + 112 — conversations API", () => {
  let token: string;
  test.beforeAll(async () => { token = await apiLogin(); });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: auth() }).then((r) => r.json());
  const post = (path: string, body?: any) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body ?? {}) }).then((r) => r.json());
  const del = (path: string) => fetch(`${BASE}${path}`, { method: "DELETE", headers: auth() }).then((r) => r.json());

  test("S112 read state declares its basis and excludes own messages", async () => {
    const created = await post("/conversations", { title: "E2E read state" });
    expect(created.ok).toBe(true);
    const id = created.data.id;

    const initial = await get(`/conversations/${id}/read-state`);
    expect(initial.ok).toBe(true);
    expect(initial.data.basis).toBe("never_marked_read");
    expect(initial.data.lastReadAt).toBeNull();
    expect(initial.data.excludesOwnMessages).toBe(true);

    const marked = await post(`/conversations/${id}/read`, {});
    expect(marked.ok).toBe(true);
    expect(marked.data.basis).toBe("last_read_at");
    expect(marked.data.unreadCount).toBe(0);

    const unread = await get("/conversations/unread?limit=50");
    expect(unread.ok).toBe(true);
    expect(Array.isArray(unread.data.items)).toBe(true);
    expect(typeof unread.data.truncated).toBe("boolean");
    expect(unread.data.items.every((i: any) => i.conversationId !== id)).toBe(true);

    await del(`/conversations/${id}`);
  });

  test("S112 participants list, add and creator protection", async () => {
    const created = await post("/conversations", { title: "E2E participants" });
    const id = created.data.id;

    const people = await get(`/conversations/${id}/participants`);
    expect(people.ok).toBe(true);
    expect(people.data.length).toBeGreaterThan(0);
    const creator = people.data.find((p: any) => p.isCreator);
    expect(creator).toBeTruthy();

    // The creator's row is not removable — the roster must match reality.
    const refused = await del(`/conversations/${id}/participants/${creator.id}`);
    expect(refused.ok).toBeFalsy();

    await del(`/conversations/${id}`);
  });

  test("S112 statistics report unknown usage as null, never as zero", async () => {
    const created = await post("/conversations", { title: "E2E stats" });
    const id = created.data.id;

    const stats = await get(`/conversations/${id}/stats`);
    expect(stats.ok).toBe(true);
    expect(stats.data.measuredFrom).toBe("stored_messages");
    expect(stats.data.messageCount).toBe(0);
    expect(stats.data.usage.messagesWithUsage).toBe(0);
    expect(stats.data.usage.tokensIn).toBeNull();
    expect(stats.data.usage.avgAssistantDurationMs).toBeNull();

    await del(`/conversations/${id}`);
  });

  test("S112 search labels itself as substring matching", async () => {
    const result = await get("/conversations/search?q=windels&perPage=5");
    expect(result.ok).toBe(true);
    expect(result.data.matchKind).toBe("substring_case_insensitive");
    expect(Array.isArray(result.data.hits)).toBe(true);
    expect(typeof result.data.searchedConversations).toBe("number");
  });

  test("S112 digest is extractive and declares that no model produced it", async () => {
    const created = await post("/conversations", { title: "E2E digest" });
    const id = created.data.id;

    const digest = await get(`/conversations/${id}/digest?maxKeywords=5`);
    expect(digest.ok).toBe(true);
    expect(digest.data.kind).toBe("extractive_deterministic");
    expect(digest.data.aiGenerated).toBe(false);
    expect(typeof digest.data.disclaimer).toBe("string");
    expect(Array.isArray(digest.data.keywords)).toBe(true);

    const transcript = await get(`/conversations/${id}/transcript?format=markdown`);
    expect(transcript.ok).toBe(true);
    expect(transcript.data.format).toBe("markdown");
    expect(typeof transcript.data.markdown).toBe("string");

    await del(`/conversations/${id}`);
  });

  test("S112 soft-deleted conversations are listable and restorable", async () => {
    const created = await post("/conversations", { title: "E2E restore" });
    const id = created.data.id;
    await del(`/conversations/${id}`);

    const deleted = await get("/conversations/deleted?perPage=50");
    expect(deleted.ok).toBe(true);
    expect(deleted.data.items.some((c: any) => c.id === id)).toBe(true);

    const restored = await post(`/conversations/${id}/restore`, {});
    expect(restored.ok).toBe(true);
    expect(restored.data.id).toBe(id);

    // Restoring twice is a conflict, not a silent success.
    const again = await post(`/conversations/${id}/restore`, {});
    expect(again.ok).toBeFalsy();

    await del(`/conversations/${id}`);
  });
});
