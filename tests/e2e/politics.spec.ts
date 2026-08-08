/**
 * Playwright E2E — Session 144: Global Politics, Government & Political
 * History Intelligence System.
 *
 * Validates against a live API that: the catalog serves countries and all
 * entity kinds; the question engine answers the §26 examples (history,
 * first president, list-all presidents, current president, elections,
 * federal government, transition to democracy); the neutral comparison
 * engine works; the fact-vs-opinion engine classifies the §23 examples;
 * timelines, leader timelines and the knowledge graph answer; education
 * mode generates quizzes; and the update engine records change logs
 * without overwriting history.
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

test.describe("Session 144 — Global Politics, Government & Political History", () => {
  let token = "";
  const marker = `e2e-pol-${Date.now()}`;

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

  test("GET /politics/catalog serves countries with the neutrality and current-info notes", async () => {
    const res = await get("/politics/catalog");
    expect(res.status).toBe(200);
    expect(res.data.catalogVersion).toContain("2026.08");
    expect(res.data.recordCount).toBeGreaterThan(140);
    expect(res.data.countryCount).toBeGreaterThan(15);
    expect(res.data.neutralityNote).toContain("INFORM, NOT MANIPULATE");
    expect(res.data.currentInfoNote).toContain("Last Verified");
  });

  test("POST /politics/ask answers the §26 Nigeria examples", async () => {
    const history = await send("POST", "/politics/ask", { question: "Tell me the history of Nigeria." });
    expect(history.data.matches.some((m: any) => m.id === "pol.country.nigeria")).toBe(true);

    const first = await send("POST", "/politics/ask", { question: "Who was Nigeria's first president?" });
    expect(first.data.matches.some((m: any) => m.id === "pol.leader.nigeria.azikiwe")).toBe(true);

    const list = await send("POST", "/politics/ask", { question: "List all presidents of Nigeria" });
    expect(list.data.mode).toBe("leader_list");
    expect(list.data.leaders.length).toBeGreaterThanOrEqual(14);
    expect(list.data.leaders[0].name).toBe("Nnamdi Azikiwe");

    const current = await send("POST", "/politics/ask", { question: "Who is the current president of Nigeria?" });
    expect(current.data.matches.some((m: any) => m.id === "pol.leader.nigeria.tinubu")).toBe(true);

    const elections = await send("POST", "/politics/ask", { question: "Explain every Nigerian presidential election", limit: 10 });
    expect(elections.data.matches.some((m: any) => m.id === "pol.election.nigeria.1979")).toBe(true);
    expect(elections.data.matches.some((m: any) => m.id === "pol.election.nigeria.2023")).toBe(true);

    const transition = await send("POST", "/politics/ask", { question: "What happened during Nigeria's transition to democracy?" });
    expect(transition.data.matches.some((m: any) => m.id === "pol.event.nigeria.transition-1999")).toBe(true);
  });

  test("POST /politics/compare is neutral and compares systems", async () => {
    const res = await send("POST", "/politics/compare", { countryIds: ["pol.country.nigeria", "pol.country.united-states"] });
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBe(2);
    expect(res.data.rows.length).toBeGreaterThanOrEqual(10);
    expect(res.data.note).toContain("does not rank political systems");
    const uk = await send("POST", "/politics/compare", { countryIds: ["pol.country.nigeria", "pol.country.united-kingdom"] });
    const form = uk.data.rows.find((r: any) => r.category === "government_form");
    expect(form.values[1].text).toBe("Parliamentary monarchy");
  });

  test("POST /politics/claim classifies the §23 examples", async () => {
    const fact = await send("POST", "/politics/claim", { text: "Person X served as president from year A to year B." });
    expect(fact.data.category).toBe("verified_fact");
    const opinion = await send("POST", "/politics/claim", { text: "Person X was the greatest president." });
    expect(opinion.data.category).toBe("opinion");
    const causal = await send("POST", "/politics/claim", { text: "Person X destroyed the economy." });
    expect(causal.data.category).toBe("historical_interpretation");
    const allegation = await send("POST", "/politics/claim", { text: "Person X is accused of corruption." });
    expect(allegation.data.category).toBe("allegation");
  });

  test("timelines and leader timelines work", async () => {
    const t = await get("/politics/timeline/pol.country.nigeria");
    expect(t.status).toBe(200);
    expect(t.data.periods.length).toBeGreaterThanOrEqual(5);
    expect(t.data.events.some((e: any) => e.eventType === "independence")).toBe(true);
    const l = await get("/politics/leaders/pol.country.nigeria");
    expect(l.data.length).toBeGreaterThanOrEqual(14);
    expect(l.data[0].name).toBe("Nnamdi Azikiwe");
  });

  test("the knowledge graph answers who led during an event", async () => {
    const res = await send("POST", "/politics/graph/answer", { question: "Who was president during the Nigerian civil war?" });
    expect(res.data.mode).toBe("graph_answer");
    expect(res.data.event.name).toContain("Civil War");
    expect(res.data.leadersAtEvent[0].leaders.some((l: any) => l.name === "Yakubu Gowon")).toBe(true);
  });

  test("education mode generates a deterministic quiz", async () => {
    const quiz = await send("POST", "/politics/quiz", { topicId: "pol.country.nigeria", level: "intermediate", count: 5 });
    expect(quiz.status).toBe(200);
    expect(quiz.data.questions.length).toBe(5);
    for (const q of quiz.data.questions) {
      expect(q.choices.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    }
  });

  test("the update engine records change logs and never overwrites history", async () => {
    const created = await send("POST", "/politics/updates", {
      kind: "leadership_change",
      entityId: "pol.country.nigeria",
      entityKind: "country",
      title: `${marker} — leadership change`,
      changeSummary: `${marker}: a hypothetical leadership change for testing.`,
      field: "currentSituation",
      previousValue: "Bola Tinubu has been president since 2023.",
      newValue: `${marker}: a new president has taken office.`,
      effectiveDate: "2027-05-29",
      sources: [{ label: `${marker} official announcement`, type: "official_government" }],
      verification: "unverified",
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("pending_review");
    expect(created.data.changeLog).toBeNull();

    const applied = await send("PATCH", `/politics/updates/${created.data.id}`, { status: "applied", reviewNote: "test" });
    expect(applied.status).toBe(200);
    expect(applied.data.status).toBe("applied");
    expect(applied.data.changeLog).not.toBeNull();
    expect(applied.data.changeLog.previousValue).toContain("Bola Tinubu");

    // The historical record is untouched.
    const tinubu = await get("/politics/records/pol.leader.nigeria.tinubu");
    expect(tinubu.data.officeEnd).toBe("");

    const history = await get(`/politics/records/pol.country.nigeria/history?field=currentSituation`);
    expect(history.data.some((h: any) => h.newValue.includes(marker))).toBe(true);
  });

  test("current records carry Last Verified timestamps", async () => {
    const tinubu = await get("/politics/records/pol.leader.nigeria.tinubu");
    expect(tinubu.data.meta.verification).toBe("current_as_of");
    expect(tinubu.data.meta.lastVerified).toBeTruthy();
    expect(tinubu.data.meta.asOfDate).toBeTruthy();
  });
});

test.describe("Session 145 — Politics coverage completion (§17 diplomacy & remaining items)", () => {
  let token = "";

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

  test("the §17 diplomacy database resolves with real content", async () => {
    for (const id of ["pol.dip.nigeria-us", "pol.dip.nigeria-china", "pol.dip.nigeria-uk", "pol.dip.treaty-lagos", "pol.dip.treaty-abuja", "pol.dip.ecowas-alliance"]) {
      const res = await get(`/politics/records/${id}`);
      expect(res.status, id).toBe(200);
      expect(res.data.kind).toBe("diplomacy");
      expect(res.data.partners.length).toBeGreaterThan(0);
    }
    const us = await get("/politics/records/pol.dip.nigeria-us");
    expect(us.data.relationshipType).toBe("bilateral_relationship");
  });

  test("the §26 additions answer: senators, ministers, pre-independence leader, democracy", async () => {
    const senators = await send("POST", "/politics/ask", { question: "Who are the current Nigerian senators?", limit: 6 });
    expect(senators.data.matches.some((m: any) => m.id === "pol.sen.nigeria.akpabio")).toBe(true);
    expect(senators.data.matches.some((m: any) => m.id === "pol.sen.nigeria.oshiomhole")).toBe(true);

    const ministers = await send("POST", "/politics/ask", { question: "Who are Nigeria's current ministers?", limit: 8 });
    expect(ministers.data.matches.some((m: any) => m.id === "pol.ministry.nigeria.finance")).toBe(true);
    expect(ministers.data.matches.some((m: any) => m.id === "pol.ministry.nigeria.health")).toBe(true);

    const before = await send("POST", "/politics/ask", { question: "Who governed Nigeria before independence?" });
    expect(before.data.matches.some((m: any) => m.id === "pol.leader.nigeria.balewa")).toBe(true);

    const democracy = await send("POST", "/politics/ask", { question: "Explain democracy" });
    expect(democracy.data.matches.some((m: any) => m.id === "pol.concept.democracy")).toBe(true);
  });

  test("new §13/§14/§16/§4 records resolve", async () => {
    for (const id of ["pol.ideo.democratic-socialism", "pol.ideo.pan-nationalism", "pol.mov.ogoni", "pol.mov.mau-mau", "pol.mov.endsars", "org.icc", "pol.leader.germany.merkel", "pol.leader.germany.merz", "pol.event.kenya.2008-crisis", "pol.event.kenya.2017-annulment"]) {
      const res = await get(`/politics/records/${id}`);
      expect(res.status, id).toBe(200);
    }
    const merz = await get("/politics/records/pol.leader.germany.merz");
    expect(merz.data.meta.verification).toBe("current_as_of");
    const icc = await get("/politics/records/org.icc");
    expect(icc.data.membership).toContain("124");
  });

  test("the integrity report stays clean with the additions", async () => {
    const res = await get("/politics/integrity");
    expect(res.data.ok).toBe(true);
    expect(res.data.issues).toEqual([]);
  });
});
