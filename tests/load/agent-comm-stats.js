import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://localhost:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASS = "W1ndels!Admin#2026";

// Note: the global API rate limit is ~60 req/min/ip, so we keep VUs and
// duration low enough to stay under that budget while still measuring p95.
export const options = {
  vus: 3,
  duration: "5s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<80"],
  },
};

export function setup() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASS }), { headers: { "Content-Type": "application/json" } });
  const body = JSON.parse(res.body);
  return { token: body.data.token };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" } };
  const r = http.get(`${BASE}/agents/comm/stats`, params);
  check(r, {
    "status 200": (r) => r.status === 200,
    "ok true": (r) => r.status === 200 && JSON.parse(r.body).ok === true,
  });
  sleep(0.4);
}
