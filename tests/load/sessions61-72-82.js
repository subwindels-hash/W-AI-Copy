/** k6 load test for Sessions 61–72 + 82. 2 VUs × 3 iters each, all dashboards + a write. */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

export const options = {
  vus: 2,
  iterations: 6,
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
    checks: ["rate>0.95"],
  },
};

function login() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } });
  const body = res.json();
  return body.data.token;
}

const DASHES = [
  "/data-marketplace/dashboard/rollup",
  "/digital-humans/dashboard/rollup",
  "/quantum/dashboard/rollup",
  "/sustainability/dashboard/rollup",
  "/biomedical/dashboard/rollup",
  "/legal/dashboard/rollup",
  "/education/dashboard/rollup",
  "/scientific/dashboard/rollup",
  "/cognitive/dashboard/rollup",
  "/command/dashboard/rollup",
  "/ai-economy/dashboard/rollup",
  "/autonomous/dashboard/rollup",
  "/cyber/dashboard/rollup",
];

export default function () {
  const token = login();
  const params = { headers: { Authorization: `Bearer ${token}` } };
  for (const ep of DASHES) {
    const r = http.get(`${BASE}${ep}`, params);
    check(r, { [`${ep} 200`]: (x) => x.status === 200 });
  }
  // Write: start cyber lab
  const r = http.post(`${BASE}/cyber/labs`, JSON.stringify({ domain: "ethical_hacking", difficulty: "intermediate", cloud: "aws" }),
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  check(r, { "POST /cyber/labs 200": (x) => x.status === 200 });
  sleep(1);
}
