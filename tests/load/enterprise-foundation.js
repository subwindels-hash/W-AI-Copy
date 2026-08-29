import http from "k6/http";
import { check, sleep } from "k6";

const API = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

export const options = {
  executor: "per-vu-iterations",
  vus: 2,
  iterations: 3,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
  },
};

function login() {
  const r = http.post(`${API}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } });
  return r.json().data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const paths = [
    "/enterprise-foundation/dashboard/rollup",
    "/enterprise-foundation/connectors",
    "/enterprise-foundation/products",
    "/enterprise-foundation/principals",
    "/enterprise-foundation/idps",
    "/enterprise-foundation/accounts",
    "/enterprise-foundation/anomalies",
    "/enterprise-foundation/optimizations",
    "/enterprise-foundation/incidents",
    "/enterprise-foundation/playbooks",
    "/enterprise-foundation/bcp",
    "/enterprise-foundation/scorecards",
    "/enterprise-foundation/global-status",
    "/enterprise-foundation/kpis",
  ];
  for (const p of paths) {
    const r = http.get(`${API}${p}`, auth);
    check(r, { "status 200": (x) => x.status === 200, "ok": (x) => x.json().ok === true });
    sleep(0.2);
  }
}
