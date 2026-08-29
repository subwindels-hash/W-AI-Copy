/**
 * k6 load test — Sessions 42-47.
 * 2 VUs × 3 iterations, p95 < 800ms, 0% errors.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = "http://127.0.0.1:4000/api/v1";
const LOGIN = JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" });

export const options = {
  vus: 2, iterations: 6,
  thresholds: { http_req_duration: ["p(95)<800"], http_req_failed: ["rate==0"], checks: ["rate==1"] },
};

function login() {
  return http.post(`${BASE}/auth/login`, LOGIN, { headers: { "Content-Type": "application/json" } }).json().data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };

  // S42 Media Gen
  let r = http.get(`${BASE}/media-generation/dashboard/rollup`, auth);
  check(r, { "mg-dash": v => v.status === 200 && v.json().ok && v.json().data.capabilities >= 24 });
  r = http.get(`${BASE}/media-generation/capabilities`, auth);
  check(r, { "mg-caps": v => v.status === 200 && Array.isArray(v.json().data) });
  r = http.post(`${BASE}/media-generation/generate`, JSON.stringify({ modality: "image", op: "text-to-image", prompt: "A clean corporate logo" }), auth);
  check(r, { "mg-gen": v => v.status === 200 && v.json().data.status === "ready" });

  // S43 Hybrid Exec
  r = http.get(`${BASE}/hybrid-execution/dashboard/rollup`, auth);
  check(r, { "hx-dash": v => v.status === 200 && v.json().data.vendorNeutral === true && v.json().data.modes.length === 3 });
  r = http.get(`${BASE}/hybrid-execution/nodes`, auth);
  check(r, { "hx-nodes": v => v.status === 200 && v.json().data.length >= 4 });
  r = http.post(`${BASE}/hybrid-execution/route`, JSON.stringify({ modality: "text", requiredVramMb: 4000 }), auth);
  check(r, { "hx-route": v => v.status === 200 && v.json().data.requestId });

  // S44 Voice Ownership
  r = http.get(`${BASE}/voice-ownership/dashboard/rollup`, auth);
  check(r, { "vo-dash": v => v.status === 200 && v.json().data.immutableAudit === true && v.json().data.governanceWired === true });
  r = http.get(`${BASE}/voice-ownership/policies`, auth);
  check(r, { "vo-pol": v => v.status === 200 && v.json().data.length >= 4 });
  r = http.get(`${BASE}/voice-ownership/audit`, auth);
  check(r, { "vo-audit": v => v.status === 200 && Array.isArray(v.json().data) });

  // S45 Core Integration
  r = http.get(`${BASE}/core-integration/checkpoint`, auth);
  check(r, { "cei-checkpoint": v => v.status === 200 && v.json().data.criticalPassed === true && v.json().data.canProceedToSession46 === true });
  check(r, { "cei-kernel-ms": v => v.json().data.kernelDispatchRoundtripMs < 100 });

  // S46 Model Factory
  r = http.get(`${BASE}/model-factory/dashboard/rollup`, auth);
  check(r, { "mf2-dash": v => v.status === 200 && v.json().data.extendsS43Registry === true });
  r = http.get(`${BASE}/model-factory/models`, auth);
  check(r, { "mf2-models": v => v.status === 200 && Array.isArray(v.json().data) });
  const modelId = r.json().data[0].id;
  r = http.post(`${BASE}/model-factory/models/${modelId}/safety`, JSON.stringify({ passed: true }), auth);
  check(r, { "mf2-safety": v => v.status === 200 && v.json().data.safetyPassed === true });

  // S47 Memory Evolution
  r = http.get(`${BASE}/memory-evolution/dashboard/rollup`, auth);
  check(r, { "me-dash": v => v.status === 200 && v.json().data.extendsS37Fabric === true });
  r = http.post(`${BASE}/memory-evolution/memories`, JSON.stringify({ type: "knowledge", content: "k6 test memory " + Date.now(), tags: ["k6"] }), auth);
  check(r, { "me-add": v => v.status === 200 && v.json().data.id });
  r = http.post(`${BASE}/memory-evolution/consolidate`, JSON.stringify({ kind: "deduplicate" }), auth);
  check(r, { "me-consol": v => v.status === 200 && v.json().data.kind === "deduplicate" });

  sleep(0.2);
}
