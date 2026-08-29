import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

export const options = {
  executor: "per-vu-iterations",
  vus: 2,
  iterations: 3,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

function login() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }), { headers: { "Content-Type": "application/json" } });
  const body = r.json();
  return body.data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };

  let res = http.get(`${BASE}/collaboration/dashboard/rollup`, auth);
  check(res, { "dashboard 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/collaboration/meetings/connectors`, auth);
  check(res, { "connectors 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/collaboration/meetings`, auth);
  check(res, { "meetings 200": (r) => r.status === 200 });
  const meets = res.json().data;
  sleep(0.2);

  res = http.get(`${BASE}/collaboration/screen/sessions`, auth);
  check(res, { "screen 200": (r) => r.status === 200 });
  sleep(0.2);

  res = http.get(`${BASE}/collaboration/camera/pipelines`, auth);
  check(res, { "camera 200": (r) => r.status === 200 });
  sleep(0.2);

  // Join AI on a scheduled meeting (each VU picks a different one).
  const scheduled = meets.find((m) => m.status === "scheduled");
  if (scheduled) {
    res = http.post(`${BASE}/collaboration/meetings/${scheduled.id}/join`, null, auth);
    check(res, { "join 200": (r) => r.status === 200 });
  }
  sleep(0.3);
}
