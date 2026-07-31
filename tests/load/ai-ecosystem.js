import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

export const options = {
  executor: "per-vu-iterations",
  vus: 2,
  iterations: 3,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

function login() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }), { headers: { "Content-Type": "application/json" } });
  return r.json().data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };

  let res = http.get(`${BASE}/ai-ecosystem/dashboard/rollup`, auth);
  check(res, { "dashboard 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/ai-ecosystem/providers`, auth);
  check(res, { "providers 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/ai-ecosystem/models`, auth);
  check(res, { "models 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/ai-ecosystem/routing-policies`, auth);
  check(res, { "policies 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.post(`${BASE}/ai-ecosystem/route`, JSON.stringify({ capabilities: ["chat"], strategy: "balanced" }), auth);
  check(res, { "route 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/ai-ecosystem/personalities`, auth);
  check(res, { "personalities 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/ai-ecosystem/trust/scores`, auth);
  check(res, { "scores 200": (r) => r.status === 200 });
  sleep(0.2);
}
