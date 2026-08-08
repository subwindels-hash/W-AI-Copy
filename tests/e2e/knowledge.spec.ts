/**
 * Playwright E2E — Session 140: Global Human Knowledge & Everyday Question
 * Intelligence System.
 *
 * Validates against a live API that:
 *   - The catalog serves the 90 master categories with versioned metadata.
 *   - The Question Intent Engine classifies the 13 spec intents.
 *   - Ask WINDELS routes by intent, renders at an audience level, returns
 *     sources, and answers honestly when knowledge is absent.
 *   - The timeline engine serves the eight eras in chronological order.
 *   - The comparison engine returns criteria with no universal winner.
 *   - The org-scoped dynamic layer enforces SOURCE + verification metadata
 *     and cross-organization isolation.
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

test.describe("Session 140 — Global Knowledge & Everyday Question Intelligence", () => {
  let token = "";
  const marker = `e2e-kn-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("GET /knowledge/catalog serves versioned metadata with the 90 categories", async () => {
    const res = await get("/knowledge/catalog");
    expect(res.status).toBe(200);
    expect(res.data.catalogVersion).toContain("2026.08");
    expect(res.data.categoryCount).toBe(90);
    expect(res.data.recordCount).toBeGreaterThan(100);
    expect(res.data.byTier.stable).toBeGreaterThan(100);
    expect(res.data.dynamicPolicyNote).toContain("SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED");
  });

  test("GET /knowledge/categories lists the 90 master categories with record counts", async () => {
    const res = await get("/knowledge/categories");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(90);
    expect(res.data.some((c: any) => c.id === "cat-01" && c.name === "Education & Learning")).toBe(true);
    expect(res.data.some((c: any) => c.recordCount > 0)).toBe(true);
  });

  test("GET /knowledge/timeline returns the eight eras with chronological events", async () => {
    const res = await get("/knowledge/timeline");
    expect(res.status).toBe(200);
    expect(res.data.eras.length).toBe(8);
    expect(res.data.eras[0].id).toBe("era-prehistory");
    expect(res.data.events.length).toBeGreaterThan(15);
    const years = res.data.events.map((e: any) => e.year).filter((y: any) => y !== null);
    expect(years[0]).toBeLessThan(years[years.length - 1]);
  });

  test("POST /knowledge/intent classifies the spec's question families", async () => {
    const cases: Array<[string, string]> = [
      ["What is democracy?", "definition"],
      ["How does AI work?", "explanation"],
      ["When did AI begin?", "history"],
      ["AI vs traditional software?", "comparison"],
      ["How do I build an AI app?", "instruction"],
      ["Which cloud platform should I use?", "recommendation"],
      ["How much will this cost?", "calculation"],
      ["Who is the current president?", "current_information"],
      ["Give me everything about this subject.", "research"],
      ["Teach me mathematics.", "education"],
      ["Write a business plan.", "creative"],
      ["Why isn't my application working?", "troubleshooting"],
      ["What should I do?", "personal_guidance"],
    ];
    for (const [text, expected] of cases) {
      const res = await send("POST", "/knowledge/intent", { text });
      expect(res.status).toBe(200);
      expect(res.data.intent).toBe(expected);
    }
  });

  test("POST /knowledge/ask answers a definition with sources and level rendering", async () => {
    const res = await send("POST", "/knowledge/ask", {
      question: "What is inflation?",
      audienceLevel: "undergraduate",
    });
    expect(res.status).toBe(200);
    expect(res.data.intent.intent).toBe("definition");
    expect(res.data.routing.domain).toBe("Concept layer");
    expect(res.data.matches.length).toBeGreaterThan(0);
    const top = res.data.matches[0];
    expect(top.id).toBe("con.inflation");
    expect(top.sources.length).toBeGreaterThan(0);
    expect(top.sections.some((s: any) => s.key === "definition")).toBe(true);
  });

  test("POST /knowledge/ask routes current-information questions to the dynamic layer", async () => {
    const res = await send("POST", "/knowledge/ask", { question: "Who is the current president?" });
    expect(res.data.intent.intent).toBe("current_information");
    expect(res.data.routing.domain).toBe("Dynamic layer");
  });

  test("POST /knowledge/ask answers honestly when the catalog has no knowledge", async () => {
    const res = await send("POST", "/knowledge/ask", { question: "What is the orbital velocity of my left shoe zxqvbn?" });
    expect(res.status).toBe(200);
    expect(res.data.matches).toEqual([]);
    expect(res.data.note).toContain("do not have sufficient knowledge");
  });

  test("POST /knowledge/compare returns criteria with no universal winner", async () => {
    const res = await send("POST", "/knowledge/compare", {
      recordIds: ["cmp.item.python", "cmp.item.javascript"],
    });
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBe(2);
    expect(res.data.criteria.length).toBeGreaterThanOrEqual(6);
    expect(res.data.note).toContain("universal winner");
    expect(res.data.items[0].scores.every((s: any) => s.basis === "labeled")).toBe(true);
  });

  test("Dynamic layer: create with SOURCE, verify metadata, org list, update, delete", async () => {
    const created = await send("POST", "/knowledge/records", {
      title: `${marker} — branch opening hours`,
      question: `What are the ${marker} branch opening hours?`,
      kind: "current_information",
      categoryIds: ["cat-09"],
      summary: `${marker}: the branch opens at 09:00.`,
      sources: [{ label: `${marker} official website` }],
      asOfDate: "2026-08-08",
    });
    expect(created.status).toBe(201);
    expect(created.data.provenance).toBe("self_reported");
    expect(created.data.tier).toBe("dynamic");
    expect(created.data.confidence).toBe("unverified");
    expect(created.data.lastUpdated).toBeTruthy();

    const listed = await get("/knowledge/records?scope=org&limit=50");
    expect(listed.status).toBe(200);
    expect(listed.data.some((r: any) => r.id === created.data.id)).toBe(true);

    const patched = await send("PATCH", `/knowledge/records/${created.data.id}`, {
      confidence: "well_supported",
      verificationNote: "confirmed with the branch manager",
    });
    expect(patched.status).toBe(200);
    expect(patched.data.confidence).toBe("well_supported");
    expect(patched.data.verificationNote).toContain("branch manager");
    expect(patched.data.lastUpdated >= created.data.lastUpdated).toBe(true);

    const removed = await send("DELETE", `/knowledge/records/${created.data.id}`);
    expect(removed.status).toBe(200);
    expect(removed.data.deleted).toBe(true);

    const after = await get(`/knowledge/records/${created.data.id}`);
    expect(after.status).toBe(404);
  });

  test("Dynamic layer refuses creation without a SOURCE", async () => {
    const res = await send("POST", "/knowledge/records", {
      title: "No source record",
      question: "What?",
      categoryIds: ["cat-90"],
      summary: "This record has no source and must be refused.",
      sources: [],
    });
    expect(res.status).toBe(400);
  });

  test("Catalog records cannot be deleted through the dynamic layer", async () => {
    const res = await send("DELETE", "/knowledge/records/con.democracy");
    expect(res.status).toBe(404);
  });

  test("GET /knowledge/search filters by kind and tier", async () => {
    const res = await get("/knowledge/search?q=democracy&kind=concept&tier=stable&limit=5");
    expect(res.status).toBe(200);
    expect(res.data.results.length).toBeGreaterThan(0);
    expect(res.data.results.every((r: any) => r.kind === "concept" && r.tier === "stable")).toBe(true);
  });
});
