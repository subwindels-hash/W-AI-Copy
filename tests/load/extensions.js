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
  const r = http.post(`${API}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { "Content-Type": "application/json" },
  });
  const j = r.json();
  return j.data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const endpoints = [
    "/extensions/dashboard/rollup",
    "/extensions",
    "/extensions?kind=business",
    "/extensions?kind=skill",
    "/extensions/business/list",
    "/extensions/industry/list",
    "/extensions/skills/list",
    "/extensions/agents/list",
    "/extensions/workflows/list",
    "/extensions/dashboards/list",
    "/extensions/ui/list",
  ];

  for (const ep of endpoints) {
    const r = http.get(`${API}${ep}`, auth);
    check(r, {
      "status 200": (x) => x.status === 200,
      "envelope ok": (x) => x.json("ok") === true,
    });
    sleep(0.2);
  }

  // one install + uninstall cycle against a published-but-not-installed extension
  const list = http.get(`${API}/extensions?status=published`, auth).json("data") || [];
  const target = list.find((e) => !e.installed);
  if (target) {
    const inst = http.post(`${API}/extensions/${target.id}/install`, null, auth);
    check(inst, { "install ok": (x) => x.status === 200 });
    sleep(0.2);
    const uninst = http.post(`${API}/extensions/${target.id}/uninstall`, null, auth);
    check(uninst, { "uninstall ok": (x) => x.status === 200 });
    sleep(0.2);
  }
}
