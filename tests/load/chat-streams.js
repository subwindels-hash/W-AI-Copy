/**
 * k6 load test: authenticate + chat stream
 *
 * Usage:
 *   k6 run -e AUTH_TOKEN=... tests/load/chat-streams.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:4000/api/v1";
const TOKEN = __ENV.AUTH_TOKEN;

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS) : 10,
  duration: __ENV.DURATION || "1m",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  if (!TOKEN) {
    const r = http.post(`${BASE}/auth/login`, JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
    }), { headers: { "Content-Type": "application/json" } });
    return { token: r.json("data.token") };
  }
  return { token: TOKEN };
}

export default function (data) {
  const params = {
    headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" },
    timeout: "30s",
  };
  const list = http.get(`${BASE}/conversations`, params);
  check(list, { "conversations 200": (r) => r.status === 200 });
  sleep(1);

  // Create a new conversation (or use first available)
  const create = http.post(`${BASE}/conversations`, JSON.stringify({ title: `load-test-${Date.now()}` }), params);
  check(create, { "create 20x": (r) => r.status === 200 || r.status === 201 });
  const id = create.json("data.id");
  if (id) {
    const send = http.post(`${BASE}/conversations/${id}/messages`, JSON.stringify({
      content: "Ping (load test).", modelId: "windels-assistant",
    }), params);
    check(send, { "message accepted": (r) => r.status === 200 || r.status === 201 });
  }
  sleep(2);
}
