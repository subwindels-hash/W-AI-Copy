/**
 * k6 load test: Session 22 — Enterprise QA Platform (read-only).
 * Exercises QA dashboard, suites, cases, and runs listing endpoints.
 * Read-only to avoid self-DoSing via the rate limiter on run triggers.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASS = "W1ndels!Admin#2026";

export const options = {
  vus: 2, duration: "6s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<80"],
  },
};

export function setup() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASS }), { headers: { "Content-Type": "application/json" } });
  return { token: JSON.parse(res.body).data.token };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" } };

  const dash = http.get(`${BASE}/qa/dashboard`, params);
  check(dash, { "dashboard 200": (r) => r.status === 200 });

  const suites = http.get(`${BASE}/qa/suites`, params);
  check(suites, { "suites 200": (r) => r.status === 200 });

  const cases = http.get(`${BASE}/qa/cases`, params);
  check(cases, { "cases 200": (r) => r.status === 200 });

  const runs = http.get(`${BASE}/qa/runs?limit=10`, params);
  check(runs, { "runs 200": (r) => r.status === 200 });

  sleep(0.3);
}
