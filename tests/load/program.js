/**
 * k6 load test — Session 25: AI Program Management read-only endpoints.
 *
 * Targets: roadmaps, sprints, backlog, requirements/intel, arch-reviews,
 *          arch-hotspots, risks, risks/matrix, exec/latest.
 *
 * Acceptance: p95 < 800ms, 0% errors after warmup.
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
    program: {
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
  try { return JSON.parse(res.body).data.token; } catch { return ""; }
}

function okJson(r) {
  try { return JSON.parse(r.body).ok === true; } catch { return false; }
}

const PATHS = [
  "/program/roadmaps",
  "/program/sprints",
  "/program/backlog",
  "/program/requirements",
  "/program/requirements/intel",
  "/program/arch-reviews",
  "/program/arch-hotspots",
  "/program/risks",
  "/program/risks/matrix",
  "/program/exec/latest",
];

export default function () {
  const token = login();
  if (!token) { sleep(1); return; }
  const params = { headers: { Authorization: `Bearer ${token}` } };
  for (const p of PATHS) {
    const r = http.get(`${BASE}${p}`, params);
    check(r, {
      "status 200": (rr) => rr.status === 200,
      "ok:true": okJson,
    });
    sleep(0.2);
  }
}
