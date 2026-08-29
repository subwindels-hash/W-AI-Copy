/**
 * k6 load tests for Sessions 37-40 + 81 (Architecture, Self-Hosted, Kernel, Voice Studio, Trading Intel).
 * 2 VUs × 3 iterations each, sleep 0.2s, p95 < 800ms.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = "http://127.0.0.1:4000/api/v1";

export function setup() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({
    email: "admin@windels.ai", password: "W1ndels!Admin#2026",
  }), { headers: { "Content-Type": "application/json" } });
  return { token: res.json("data.token") };
}

export const options = {
  vus: 2,
  iterations: 6,
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.05"],
  },
};

function r(data, method, path, body) {
  const params = { headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` } };
  const res = body
    ? http.request(method, BASE + path, JSON.stringify(body), params)
    : http.request(method, BASE + path, null, params);
  check(res, { [`${method} ${path} ok`]: (rr) => rr.status === 200 });
  return res;
}

export default function (data) {
  // S37 Architecture
  r(data, "GET", "/architecture/dashboard/rollup");
  r(data, "GET", "/architecture/modules");
  // S38 Self-Hosted
  r(data, "GET", "/self-hosted/dashboard/rollup");
  r(data, "GET", "/self-hosted/nodes");
  r(data, "GET", "/self-hosted/models");
  r(data, "GET", "/self-hosted/vector-stores");
  // S39 Kernel
  r(data, "GET", "/kernel/status");
  r(data, "POST", "/kernel/dispatch", { kind: "load.test", source: "k6", payload: { ts: Date.now() } });
  r(data, "POST", "/kernel/policy/evaluate", { action: "read", risk: "low" });
  // S40 Voice Studio
  const bv = r(data, "GET", "/voice-studio/voices/builtin").json("data[0].id");
  r(data, "GET", "/voice-studio/dashboard/rollup");
  if (bv) r(data, "POST", "/voice-studio/synthesize", { voiceId: bv, text: "Hello from k6 load test" });
  // S81 Trading Intel
  r(data, "GET", "/trading-intel/dashboard/rollup");
  r(data, "GET", "/trading-intel/agents");
  r(data, "GET", "/trading-intel/indicators");
  r(data, "GET", "/trading-intel/instruments");
  r(data, "GET", "/trading-intel/risk");
  r(data, "GET", "/trading-intel/positions");
  r(data, "GET", "/trading-intel/sentiment?limit=10");
  r(data, "GET", "/trading-intel/economic-calendar?days=7");
  r(data, "GET", "/trading-intel/insights?limit=10");
  r(data, "POST", "/trading-intel/simulate", { instrumentId: "BTC/USD", horizon: "7d" });
  r(data, "POST", "/trading-intel/propose", { instrumentId: "AAPL", marketClass: "stocks", side: "long", size: 10, reason: "k6 load test proposal" });

  sleep(0.2);
}
