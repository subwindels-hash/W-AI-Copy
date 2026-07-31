/**
 * k6 load test: GET /api/v1/health
 *
 * Usage:
 *   k6 run --vus 50 --duration 1m tests/load/health-get.js
 *   k6 run -e BASE_URL=https://windels.example.com/api/v1 tests/load/health-get.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS) : 20,
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],       // <1% errors
    http_req_duration: ["p(95)<300"],     // p95 < 300ms
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:4000/api/v1";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, {
    "status 200": (r) => r.status === 200,
    "status ok": (r) => r.json("data.status") === "ok",
  });
  sleep(1);
}
