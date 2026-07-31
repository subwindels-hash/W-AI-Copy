/**
 * k6 load test — Sessions 54-60 (Updates, Usage, Fabric, Robotics, Spatial, SDK, Training).
 * 2 VUs × 3 iterations, p95 < 800ms, 0% errors.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = "http://127.0.0.1:4000/api/v1";
const LOGIN = JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" });

export const options = {
  vus: 2, iterations: 6,
  thresholds: { http_req_duration: ["p(95)<800"], http_req_failed: ["rate==0"], checks: ["rate==1"] },
};

function login() {
  return http.post(`${BASE}/auth/login`, LOGIN, { headers: { "Content-Type": "application/json" } }).json().data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  let r;

  // S54 Updates
  r = http.get(`${BASE}/updates/dashboard/rollup`, auth);
  check(r, { "upd-dash": v => v.status === 200 && v.json().data.currentVersion });
  r = http.get(`${BASE}/updates/packages`, auth);
  check(r, { "upd-pkgs": v => v.status === 200 && Array.isArray(v.json().data) });

  // S55 Usage
  r = http.get(`${BASE}/usage-intel/dashboard/rollup`, auth);
  check(r, { "usg-dash": v => v.status === 200 && Array.isArray(v.json().data.metrics) });

  // S56 Fabric
  r = http.get(`${BASE}/fabric/dashboard/rollup`, auth);
  check(r, { "fab-dash": v => v.status === 200 && v.json().data.trust && v.json().data.mission });
  r = http.get(`${BASE}/fabric/twins`, auth);
  check(r, { "fab-twins": v => v.status === 200 && Array.isArray(v.json().data) });
  if (r.json().data.length) {
    const tid = r.json().data[0].id;
    r = http.post(`${BASE}/fabric/twins/${tid}/simulate`, null, auth);
    check(r, { "fab-sim": v => v.status === 200 });
  }
  r = http.post(`${BASE}/fabric/sandboxes`, JSON.stringify({ name: "k6-sandbox", experiment: "perf" }), auth);
  check(r, { "fab-sb": v => v.status === 200 && v.json().data.id });

  // S57 Robotics
  r = http.get(`${BASE}/robotics/dashboard/rollup`, auth);
  check(r, { "rob-dash": v => v.status === 200 && typeof v.json().data.totalRobots === "number" });
  r = http.post(`${BASE}/robotics/robots`, JSON.stringify({ name: "k6-bot", kind: "drone", site: "test" }), auth);
  check(r, { "rob-create": v => v.status === 200 && v.json().data.id });

  // S58 Spatial
  r = http.get(`${BASE}/spatial/dashboard/rollup`, auth);
  check(r, { "spa-dash": v => v.status === 200 && Array.isArray(v.json().data.byMode) });
  r = http.post(`${BASE}/spatial/sessions`, JSON.stringify({ title: "k6-xr", mode: "xr", deviceTarget: "quest" }), auth);
  check(r, { "spa-create": v => v.status === 200 && v.json().data.id });

  // S59 SDK
  r = http.get(`${BASE}/sdk/dashboard/rollup`, auth);
  check(r, { "sdk-dash": v => v.status === 200 && Array.isArray(v.json().data.commands) });
  r = http.post(`${BASE}/sdk/emulators`, JSON.stringify({ name: "k6-emu", sdkKind: "agent" }), auth);
  check(r, { "sdk-emu": v => v.status === 200 });

  // S60 Training
  r = http.get(`${BASE}/training/dashboard/rollup`, auth);
  check(r, { "tr-dash": v => v.status === 200 && typeof v.json().data.datasets === "number" });
  r = http.post(`${BASE}/training/datasets`, JSON.stringify({ name: "k6-ds", format: "jsonl" }), auth);
  check(r, { "tr-ds": v => v.status === 200 && v.json().data.id });

  sleep(0.2);
}
