import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASS = "W1ndels!Admin#2026";

export const options = {
  vus: 2, duration: "5s",
  thresholds: { http_req_failed: ["rate<0.10"], http_req_duration: ["p(95)<80"] },
};

export function setup() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASS }), { headers: { "Content-Type": "application/json" } });
  return { token: JSON.parse(res.body).data.token };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" } };
  const endpoints = [
    "/platform/infra/overview",
    "/platform/infra/cluster",
    "/platform/infra/nodes",
    "/platform/infra/workloads",
    "/platform/iac/stacks",
    "/platform/releases",
    "/platform/regions-mgmt",
    "/platform/optimization/recommendations",
    "/platform/optimization/cost",
    "/platform/releases/bg/prod/web",
    "/platform/releases/canary/prod/api",
  ];
  for (const ep of endpoints) {
    const r = http.get(`${BASE}${ep}`, params);
    check(r, { "200": (r) => r.status === 200 });
  }
  sleep(0.8);
}
