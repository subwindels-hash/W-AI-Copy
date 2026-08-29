import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASS = "W1ndels!Admin#2026";

export const options = {
  scenarios: {
    smoke: { executor: "per-vu-iterations", vus: 2, iterations: 3, maxDuration: "60s" },
  },
  thresholds: { http_req_duration: ["p(95)<800"], http_req_failed: ["rate<0.05"] },
};

function login() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: EMAIL, password: PASS }), { headers: { "content-type": "application/json" } });
  return r.json("data.token");
}

export default function () {
  const token = login();
  const auth = { headers: { authorization: "Bearer " + token, "content-type": "application/json" } };
  const endpoints = [
    "GET /ai-ecosystem/dashboard/rollup",
    "GET /marketplace/dashboard/rollup",
    "GET /marketplace/skills",
    "GET /marketplace/twins",
    "GET /marketplace/scenarios",
    "GET /marketplace/apps?approved=true",
    "GET /crypto-intel/dashboard/rollup",
    "GET /wake-intel/dashboard/rollup",
    "GET /wake-intel/clap/patterns",
    "GET /wake-intel/devices",
    "GET /wake-intel/emergency/contacts",
    "GET /wake-intel/workforce-bindings",
  ];
  for (const ep of endpoints) {
    const [m, p] = ep.split(" ");
    const r = http.request(m, BASE + p, null, auth);
    check(r, { [`${p} 200`]: (x) => x.status === 200 });
    sleep(0.2);
  }
}
