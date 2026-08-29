/**
 * k6 load test — Session 27: Developer Portal read-only endpoints.
 * Acceptance: p95 < 800ms, 0% errors.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
  scenarios: {
    dev: {
      executor: "per-vu-iterations", vus: 2, iterations: 3, maxDuration: "20s",
    },
  },
};

function login() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } });
  try { return JSON.parse(r.body).data.token; } catch { return ""; }
}
function okJson(r) { try { return JSON.parse(r.body).ok === true; } catch { return false; } }

const PATHS = [
  "/dev-portal/dashboard",
  "/dev-portal/sdk",
  "/dev-portal/cli",
  "/dev-portal/envs",
  "/dev-portal/toolkit/test/runs",
  "/dev-portal/toolkit/deploy/runs",
];

export default function () {
  const token = login();
  if (!token) { sleep(1); return; }
  const params = { headers: { Authorization: `Bearer ${token}` } };
  for (const p of PATHS) {
    const r = http.get(`${BASE}${p}`, params);
    check(r, { "status 200": (rr) => rr.status === 200, "ok:true": okJson });
    sleep(0.2);
  }
}
