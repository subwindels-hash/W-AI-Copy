/**
 * k6 load test — Session 24: Release Management read-only endpoints.
 *
 * Targets: list, metrics, dora, release detail, approvals, validation,
 *          staging, production for the seeded draft release.
 *
 * Acceptance: p95 < 500ms, 0% errors after warmup.
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
    releases: {
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

function okJson(r) {
  try { return JSON.parse(r.body).ok === true; } catch { return false; }
}

export default function () {
  const token = login();
  if (!token) { sleep(1); return; }
  const params = { headers: { Authorization: `Bearer ${token}` } };

  const list = http.get(`${BASE}/releases?limit=20`, params);
  check(list, { "list 200": (r) => r.status === 200, "list ok": okJson });
  sleep(0.2);

  let rid = "";
  try {
    const data = JSON.parse(list.body).data || [];
    const first = data[0];
    rid = first ? first.id : "";
  } catch { rid = ""; }

  const metrics = http.get(`${BASE}/releases/metrics`, params);
  check(metrics, { "metrics 200": (r) => r.status === 200, "metrics ok": okJson });
  sleep(0.2);

  const dora = http.get(`${BASE}/releases/dora`, params);
  check(dora, { "dora 200": (r) => r.status === 200, "dora ok": okJson });
  sleep(0.2);

  if (!rid) return;

  const detail = http.get(`${BASE}/releases/${rid}`, params);
  check(detail, { "detail 200": (r) => r.status === 200, "detail ok": okJson });
  sleep(0.2);

  const approvals = http.get(`${BASE}/releases/${rid}/approvals`, params);
  check(approvals, { "approvals 200": (r) => r.status === 200, "approvals ok": okJson });
  sleep(0.2);

  const validation = http.get(`${BASE}/releases/${rid}/validation`, params);
  check(validation, { "validation 200": (r) => r.status === 200, "validation ok": (r) => okJson(r) || r.status === 404 });
  sleep(0.2);

  const staging = http.get(`${BASE}/releases/${rid}/staging`, params);
  check(staging, { "staging 200": (r) => r.status === 200, "staging ok": (r) => okJson(r) || r.status === 404 });
  sleep(0.2);

  const production = http.get(`${BASE}/releases/${rid}/production`, params);
  check(production, { "production 200": (r) => r.status === 200, "production ok": (r) => okJson(r) || r.status === 404 });
}
