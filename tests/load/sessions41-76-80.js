/**
 * k6 load test — Sessions 41, 76, 77, 78, 79, 80.
 *
 * 2 VUs × 3 iterations, sleep(0.2), p95 must be < 800ms, 0% errors.
 * Covers all 7 new module rollups + key flows:
 *   vf: dashboard, voices, packs, deployments
 *   ep: dashboard, agents, courses, packages
 *   mf: dashboard, jobs, characters, courses
 *   ux: dashboard, tokens, components, findings, agents, brands, devices, qa/run
 *   gc: dashboard, cards (list), loyalty, agents, payment-method
 *   gcu: dashboard, currencies, rates USD→NGN, detect NG, fraud/check
 *   v76: validation/report (22-point checklist)
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = "http://127.0.0.1:4000/api/v1";
const LOGIN = JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" });

export const options = {
  vus: 2,
  iterations: 6,          // 2 VUs × 3 iterations
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

function login() {
  const res = http.post(`${BASE}/auth/login`, LOGIN, { headers: { "Content-Type": "application/json" } });
  const body = res.json();
  return body.data.token;
}

export default function () {
  const token = login();
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };

  // Session 41 — Voice Foundry
  let r = http.get(`${BASE}/voice-foundry/dashboard/rollup`, auth);
  check(r, { "vf-dash-ok": (v) => v.status === 200 && v.json().ok && v.json().data.generatedVoices >= 13 });
  r = http.get(`${BASE}/voice-foundry/voices`, auth);
  check(r, { "vf-voices": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/voice-foundry/packs`, auth);
  check(r, { "vf-packs": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/voice-foundry/deployments`, auth);
  check(r, { "vf-deps": (v) => v.status === 200 && Array.isArray(v.json().data) });

  // Session 77A — Experts Platform
  r = http.get(`${BASE}/experts/dashboard/rollup`, auth);
  check(r, { "ep-dash": (v) => v.status === 200 && v.json().data.experts >= 6 });
  r = http.get(`${BASE}/experts/agents`, auth);
  check(r, { "ep-agents": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/experts/courses`, auth);
  check(r, { "ep-courses": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/experts/packages`, auth);
  check(r, { "ep-packages": (v) => v.status === 200 && Array.isArray(v.json().data) });

  // Session 77B — Media Factory
  r = http.get(`${BASE}/media-factory/dashboard/rollup`, auth);
  check(r, { "mf-dash": (v) => v.status === 200 && v.json().data.childSafetyGateActive === true });
  r = http.get(`${BASE}/media-factory/jobs`, auth);
  check(r, { "mf-jobs": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/media-factory/characters`, auth);
  check(r, { "mf-chars": (v) => v.status === 200 && Array.isArray(v.json().data) && v.json().data.length >= 4 });
  r = http.get(`${BASE}/media-factory/courses`, auth);
  check(r, { "mf-courses": (v) => v.status === 200 && Array.isArray(v.json().data) });

  // Session 78 — UX Intelligence
  r = http.get(`${BASE}/ux-intelligence/dashboard/rollup`, auth);
  check(r, { "ux-dash": (v) => v.status === 200 && v.json().data.designGateActive === true });
  r = http.get(`${BASE}/ux-intelligence/tokens`, auth);
  check(r, { "ux-tokens": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/ux-intelligence/components`, auth);
  check(r, { "ux-comps": (v) => v.status === 200 && Array.isArray(v.json().data) && v.json().data.length >= 12 });
  r = http.get(`${BASE}/ux-intelligence/findings`, auth);
  check(r, { "ux-find": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/ux-intelligence/agents`, auth);
  check(r, { "ux-agents": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/ux-intelligence/brands`, auth);
  check(r, { "ux-brands": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/ux-intelligence/devices`, auth);
  check(r, { "ux-devices": (v) => v.status === 200 && Array.isArray(v.json().data) });

  // Session 79 — Gift Cards (WMPC)
  r = http.get(`${BASE}/gift-cards/dashboard/rollup`, auth);
  check(r, { "gc-dash": (v) => v.status === 200 && v.json().data.registeredAsPaymentMethod === true });
  r = http.get(`${BASE}/gift-cards/cards`, auth);
  check(r, { "gc-list": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/gift-cards/loyalty`, auth);
  check(r, { "gc-loyalty": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/gift-cards/agents`, auth);
  check(r, { "gc-agents": (v) => v.status === 200 && Array.isArray(v.json().data) && v.json().data.length === 4 });
  r = http.get(`${BASE}/gift-cards/payment-method`, auth);
  check(r, { "gc-pm": (v) => v.status === 200 && v.json().data.kind === "gift-card" });
  // Issue → activate → partial-redeem lifecycle
  r = http.post(`${BASE}/gift-cards/cards`, JSON.stringify({ type: "digital", amount: 25, currency: "USD", pin: "9999" }), auth);
  check(r, { "gc-issue": (v) => v.status === 200 && v.json().data.status === "issued" });
  const cardId = r.json().data.id;
  r = http.post(`${BASE}/gift-cards/cards/${cardId}/activate`, JSON.stringify({ pin: "9999" }), auth);
  check(r, { "gc-activate": (v) => v.status === 200 && v.json().data.status === "active" });
  r = http.post(`${BASE}/gift-cards/cards/${cardId}/redeem`, JSON.stringify({ amount: 10, pin: "9999" }), auth);
  check(r, { "gc-redeem": (v) => v.status === 200 && v.json().data.redeemed === 10 && v.json().data.card.balance === 15 });

  // Session 80 — Global Currency
  r = http.get(`${BASE}/global-currency/dashboard/rollup`, auth);
  check(r, { "gcu-dash": (v) => v.status === 200 && v.json().data.fraudGuardsActive === 2 });
  r = http.get(`${BASE}/global-currency/currencies`, auth);
  check(r, { "gcu-ccy": (v) => v.status === 200 && Array.isArray(v.json().data) });
  r = http.get(`${BASE}/global-currency/rates/USD/NGN`, auth);
  check(r, { "gcu-rate": (v) => v.status === 200 && v.json().data.rate > 0 });
  r = http.post(`${BASE}/global-currency/detect`, JSON.stringify({ country: "NG" }), auth);
  check(r, { "gcu-detect": (v) => v.status === 200 && v.json().data.currency === "NGN" });
  r = http.post(`${BASE}/global-currency/localize-price`, JSON.stringify({ amount: 100, from: "USD", to: "NGN", country: "NG" }), auth);
  check(r, { "gcu-loc": (v) => v.status === 200 && typeof v.json().data.formatted === "string" });
  r = http.post(`${BASE}/global-currency/fraud/check`, JSON.stringify({ from: "USD", to: "NGN", observedRate: 5000 }), auth);
  check(r, { "gcu-fraud": (v) => v.status === 200 && v.json().data.safe === false });

  // Session 76 — Validation Report
  r = http.get(`${BASE}/validation/report`, auth);
  check(r, {
    "v76-report": (v) => v.status === 200
      && v.json().data.wired >= 20
      && v.json().data.consentGateEnforced === true
      && v.json().data.governanceGateEnforced === true
      && v.json().data.duplicatesDetected === 0,
  });
  const passed = r.json().data.checklist.filter((c) => c.passed).length;
  check(r, { "v76-22-checklist": () => passed === 22 });

  sleep(0.2);
}
