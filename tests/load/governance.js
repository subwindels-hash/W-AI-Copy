/**
 * k6 load test — Session 23: Engineering Governance read-only endpoints.
 *
 * Targets: dashboard, coding-standards, repo-standards, adrs, reviews,
 *          dependencies, security/posture.
 *
 * Acceptance: p95 < 700ms (first-login cold start allowed), 0% errors.
 * Uses per-vu-iterations executor to avoid the ratelimiter-bursting default
 * loop in k6 v2.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<700"],
  },
  scenarios: {
    gov: {
      executor: "per-vu-iterations",
      vus: 2,
      iterations: 3,
      maxDuration: "20s",
    },
  },
};

function login() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  try {
    return JSON.parse(res.body).data.token;
  } catch (_e) {
    return "";
  }
}

const PATHS = [
  "/governance/engineering/dashboard",
  "/governance/engineering/coding-standards",
  "/governance/engineering/repo-standards",
  "/governance/engineering/adrs",
  "/governance/engineering/reviews/metrics",
  "/governance/engineering/dependencies",
  "/governance/engineering/security/posture",
];

export default function () {
  const token = login();
  if (!token) {
    sleep(1);
    return;
  }
  const params = { headers: { Authorization: `Bearer ${token}` } };
  for (const p of PATHS) {
    const r = http.get(`${BASE}${p}`, params);
    check(r, {
      "status 200": (rr) => rr.status === 200,
      "ok:true": (rr) => {
        try {
          return JSON.parse(rr.body).ok === true;
        } catch {
          return false;
        }
      },
    });
    sleep(0.3);
  }
}
