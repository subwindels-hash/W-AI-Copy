import { test, expect } from "@playwright/test";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

test.describe("Session 30 — AI Infrastructure (MLOps)", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const r = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const j = await r.json();
    token = j.data.token;
    expect(token).toBeTruthy();
  });

  test("dashboard aggregates all MLOps slices", async ({ request }) => {
    const r = await request.get(`${API}/ml-ops/dashboard/rollup`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(j.ok).toBe(true);
    const d = j.data;
    expect(d.models).toBeGreaterThanOrEqual(10);
    expect(d.modelsInProduction).toBeGreaterThanOrEqual(3);
    expect(d.deployments).toBeGreaterThanOrEqual(5);
    expect(d.deploymentsHealthy).toBeGreaterThanOrEqual(3);
    expect(d.prompts).toBeGreaterThanOrEqual(8);
    expect(d.promptVersions).toBeGreaterThanOrEqual(8);
    expect(d.ragIndices).toBeGreaterThanOrEqual(5);
    expect(d.vectorsIndexed).toBeGreaterThan(0);
    expect(d.embeddingsModels).toBeGreaterThanOrEqual(4);
    expect(d.knowledgeSources).toBeGreaterThanOrEqual(5);
    expect(d.knowledgeDocuments).toBeGreaterThan(0);
  });

  test("promote -> deploy model advances lifecycle", async ({ request }) => {
    // register a test model
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const slug = `test-${Date.now()}`;
    const create = await request.post(`${API}/ml-ops/models`, {
      headers: h,
      data: {
        slug, name: "Test Model E2E", description: "e2e test model",
        kind: "llm", provider: "windels-self-hosted", framework: "custom",
        tags: ["test"], license: "mit", modalities: ["text"], color: "azure",
      },
    });
    expect(create.ok()).toBeTruthy();
    const model = (await create.json()).data;
    expect(model.currentStage).toBe("draft");

    // add new version and promote through lifecycle to production
    const v = await request.post(`${API}/ml-ops/models/${model.id}/versions`, {
      headers: h, data: { version: "0.2.0", metrics: [{name:"acc",value:92,pass:true}] },
    });
    expect(v.ok()).toBeTruthy();
    const afterVersion = (await v.json()).data;
    const vid = afterVersion.versions[0].id;
    const startStage = afterVersion.currentStage;
    // advance from whatever stage new version landed in through production
    const flow = ["draft","registering","staging","approval","production"];
    const startIdx = flow.indexOf(startStage);
    for (let i = Math.max(0,startIdx+1); i < flow.length; i++) {
      const pr = await request.post(`${API}/ml-ops/models/${model.id}/promote/${vid}`, {
        headers: h, data: { to: flow[i] },
      });
      expect(pr.ok()).toBeTruthy();
    }
    const dep = await request.post(`${API}/ml-ops/deployments`, {
      headers: h, data: {
        modelId: model.id, modelVersionId: vid, name: `test-dep-${Date.now()}`,
        environment: "staging", replicas: 1, cpu: "1", memory: "2Gi",
      },
    });
    expect(dep.ok()).toBeTruthy();
  });

  test("prompt test run returns scores", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const list = await request.get(`${API}/ml-ops/prompts`, { headers: h });
    const prompts = (await list.json()).data;
    expect(prompts.length).toBeGreaterThan(0);
    const p = prompts[0];
    const run = await request.post(`${API}/ml-ops/prompts/${p.id}/run-tests`, {
      headers: h, data: { model: "claude-3.5-sonnet" },
    });
    expect(run.ok()).toBeTruthy();
    const rj = await run.json();
    expect(rj.data.run.passPct).toBeGreaterThanOrEqual(0);
    expect(rj.data.run.casesTotal).toBeGreaterThan(0);
  });

  test("lists for every slice are non-empty", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}` };
    for (const path of [
      "/ml-ops/models", "/ml-ops/deployments", "/ml-ops/monitors",
      "/ml-ops/model-policies", "/ml-ops/prompts", "/ml-ops/rag/policy",
      "/ml-ops/indexes", "/ml-ops/embeddings", "/ml-ops/knowledge",
    ]) {
      const r = await request.get(`${API}${path}`, { headers: h });
      expect(r.ok()).toBeTruthy();
      const j = await r.json();
      expect(j.ok).toBe(true);
      const data = j.data;
      if (Array.isArray(data)) expect(data.length).toBeGreaterThan(0);
      else expect(typeof data).toBe("object");
    }
  });
});
