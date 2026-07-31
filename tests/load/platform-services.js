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
  const j = r.json();
  return j.data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const paths = [
    "/platform-services/dashboard/rollup",
    "/platform-services/config",
    "/platform-services/flags",
    "/platform-services/policies",
    "/platform-services/tenants",
    "/platform-services/licenses",
    "/platform-services/billing",
    "/platform-services/capabilities",
    "/platform-services/ontology",
    "/platform-services/blueprints",
  ];

  for (const p of paths) {
    const r = http.get(`${API}${p}`, auth);
    check(r, { "status 200": (x) => x.status === 200, "ok envelope": (x) => x.json().ok === true });
    sleep(0.2);
  }

  // eval policy
  const er = http.post(`${API}/platform-services/policies/evaluate`,
    JSON.stringify({ context: { action: "read", dataset: "crm" } }),
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  check(er, { "eval 200": (x) => x.status === 200, "allow": (x) => x.json().data.allow === true });
  sleep(0.2);
}
