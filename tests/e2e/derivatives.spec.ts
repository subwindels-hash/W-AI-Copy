/**
 * Playwright E2E — Sessions 81 + 113: Derivatives & Fixed-Income Desk.
 *
 * Exercises the Session 113 desk against a live API and asserts the honesty
 * behaviours the risk screens depend on, not just response shape:
 *   - the Session 81 stateless calculators still answer on their original
 *     paths after the Session 113 sub-router was mounted ahead of them;
 *   - a position with no mark is *excluded and explained*, and an empty book
 *     reports `deltaNotional: null` rather than a confident `0`;
 *   - the portfolio agrees with the position it was built from;
 *   - a scenario cell is a full reprice and reports how many positions it
 *     priced;
 *   - a bond holding with neither a yield nor a price is refused;
 *   - the desk summary declares `marketDataSource: "none_operator_entered_only"`.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Sessions 81 + 113 — derivatives desk API", () => {
  let token: string;
  const created: string[] = [];
  const createdBonds: string[] = [];

  test.beforeAll(async () => { token = await apiLogin(); });
  test.afterAll(async () => {
    for (const id of created) {
      await fetch(`${BASE}/derivatives/positions/${id}`, { method: "DELETE", headers: auth() }).catch(() => {});
    }
    for (const id of createdBonds) {
      await fetch(`${BASE}/derivatives/bonds/${id}`, { method: "DELETE", headers: auth() }).catch(() => {});
    }
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: auth() }).then((r) => r.json());
  const post = (path: string, body?: any) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body ?? {}) }).then((r) => r.json());

  test("the Session 81 calculators still answer after the desk router was mounted ahead of them", async () => {
    const greeks = await post("/derivatives/option-greeks", { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" });
    expect(greeks.ok).toBe(true);
    expect(greeks.data.greeks.price).toBeCloseTo(10.4506, 1);
    expect(greeks.data.note).toMatch(/black-scholes|approximation/i);

    const bond = await post("/fixed-income/bond-analytics", { couponRate: 0.05, yearsToMaturity: 10, ytm: 0.05 });
    expect(bond.ok).toBe(true);
    expect(bond.data.price).toBeCloseTo(1000, 0);
  });

  test("a marked position is priced and the portfolio agrees with it", async () => {
    const made = await post("/derivatives/positions", {
      label: "E2E long call", underlying: "E2EACME", type: "call", side: "long",
      strike: 100, yearsToExpiry: 1, contracts: 1,
      premiumPerShare: 8, markSpot: 100, impliedVol: 0.2, riskFreeRate: 0.05,
    });
    expect(made.ok).toBe(true);
    expect(made.data.markSource).toBe("operator_entered");
    created.push(made.data.id);

    const portfolio = await get("/derivatives/portfolio?underlying=E2EACME");
    expect(portfolio.ok).toBe(true);
    expect(portfolio.data.pricedCount).toBe(1);
    const valuation = portfolio.data.valuations[0];
    expect(valuation.theoreticalPricePerShare).toBeCloseTo(10.4506, 1);
    expect(valuation.positionValue).toBeCloseTo(valuation.theoreticalPricePerShare * 100, 2);
    expect(portfolio.data.disclaimer).toMatch(/fetches no market data/i);
    expect(portfolio.data.aggregationNote).toMatch(/delta notional/i);
  });

  test("an unmarked position is excluded with a reason instead of counted as zero", async () => {
    const made = await post("/derivatives/positions", {
      label: "E2E unmarked", underlying: "E2EDARK", type: "put", side: "long",
      strike: 50, yearsToExpiry: 0.5, contracts: 1,
    });
    expect(made.ok).toBe(true);
    created.push(made.data.id);
    expect(made.data.markedAt).toBeNull();

    const portfolio = await get("/derivatives/portfolio?underlying=E2EDARK");
    expect(portfolio.data.pricedCount).toBe(0);
    expect(portfolio.data.unpriceableCount).toBe(1);
    expect(portfolio.data.unpriceable[0].reason).toMatch(/no underlying mark recorded/i);
    // The distinction the whole module exists to preserve.
    expect(portfolio.data.totals.deltaNotional).toBeNull();
  });

  test("a scenario grid fully reprices and reports what each cell could price", async () => {
    const grid = await post("/derivatives/portfolio/scenarios", {
      underlying: "E2EACME", spotShocks: [-0.1, 0, 0.1], volShocks: [0, 0.05],
    });
    expect(grid.ok).toBe(true);
    expect(grid.data.method).toBe("full_reprice");
    expect(grid.data.rows).toHaveLength(3);
    expect(grid.data.rows[0].cells[0]).toHaveProperty("pricedPositions");
    expect(grid.data.rows[2].cells[0].pnlVsBase).toBeGreaterThan(0);
    expect(grid.data.rows[0].cells[0].pnlVsBase).toBeLessThan(0);
  });

  test("payoff curve and parity check label their own limits", async () => {
    const curve = await post("/derivatives/payoff-curve", {
      legs: [{ type: "call", side: "long", K: 100, premium: 5 }],
      spotMin: 80, spotMax: 130, steps: 51,
    });
    expect(curve.ok).toBe(true);
    expect(curve.data.breakevens[0]).toBeCloseTo(105, 4);
    expect(curve.data.unboundedAbove).toBe(true);
    expect(curve.data.rangeNote).toMatch(/sampled range/i);

    const parity = await post("/derivatives/parity-check", {
      callPrice: 10.4506, putPrice: 5.5735, S: 100, K: 100, T: 1, r: 0.05,
    });
    expect(parity.ok).toBe(true);
    expect(parity.data.withinTolerance).toBe(true);
    expect(parity.data.note).toMatch(/not an arbitrage claim/i);
  });

  test("a bond needs a yield or a price, and the ladder weights what it could value", async () => {
    const refused = await fetch(`${BASE}/derivatives/bonds`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ label: "E2E unvaluable", couponRate: 0.05, yearsToMaturity: 5 }),
    });
    expect(refused.status).toBe(400);

    const made = await post("/derivatives/bonds", {
      label: "E2E treasury", couponRate: 0.05, yearsToMaturity: 10, ytm: 0.05, quantity: 2,
    });
    expect(made.ok).toBe(true);
    createdBonds.push(made.data.id);

    const ladder = await get("/derivatives/bonds/ladder?shiftsBps=-100,100");
    expect(ladder.ok).toBe(true);
    expect(ladder.data.valuedCount).toBeGreaterThanOrEqual(1);
    const down = ladder.data.shiftedYields.find((s: any) => s.shiftBps === -100);
    const up = ladder.data.shiftedYields.find((s: any) => s.shiftBps === 100);
    expect(down.changeFromBase).toBeGreaterThan(0);
    expect(up.changeFromBase).toBeLessThan(0);
    expect(ladder.data.note).toMatch(/full reprice/i);
  });

  test("the desk summary declares where its numbers came from", async () => {
    const summary = await get("/derivatives/desk");
    expect(summary.ok).toBe(true);
    expect(summary.data.marketDataSource).toBe("none_operator_entered_only");
    expect(summary.data.disclaimer).toMatch(/model output, not a market quote/i);
    expect(summary.data.positions.total).toBeGreaterThanOrEqual(1);
  });
});
