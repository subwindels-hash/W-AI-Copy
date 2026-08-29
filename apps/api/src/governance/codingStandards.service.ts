/**
 * CodingStandardsService — Slice 193.
 *
 * Canonical registry of code-quality rules the project is expected to follow.
 * Seeded with WINDELS house rules (TypeScript strict, React hooks, Tailwind
 * conventions, testing, security, accessibility, performance). Supports CRUD
 * for custom team rules and an aggregate summary used by the engineering
 * governance dashboard.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CodingStandard } from "@windels/shared/governance";

const KEY = "gov:coding:standards";

const SEED: Omit<CodingStandard, "id">[] = [
  { category: "typescript", title: "Strict mode enabled", description: "tsconfig must have strict: true; no `any` without an explicit justification comment.", rule: "tsc-strict-no-implicit-any", severity: "required", enabled: true, examples: { good: "const x: string = \"hi\";", bad: "const x: any = \"hi\";" } },
  { category: "typescript", title: "Explicit return types on exported functions", description: "Exported functions must declare return types to keep API boundaries explicit.", rule: "export-func-return-type", severity: "recommended", enabled: true },
  { category: "typescript", title: "No enums — use union types", description: "Use `type X = \"a\"|\"b\"` union types instead of TypeScript enums to avoid runtime overhead.", rule: "no-const-enum", severity: "recommended", enabled: true },
  { category: "react", title: "Rules of hooks respected", description: "Hooks only called at top level; exhaustive deps on useEffect/useMemo/useCallback.", rule: "react-hooks/exhaustive-deps", severity: "required", enabled: true },
  { category: "react", title: "No default exports", description: "Prefer named exports to keep import renames consistent across codebase.", rule: "no-default-export", severity: "recommended", enabled: true },
  { category: "react", title: "Client components marked explicitly", description: "Any component using hooks/browser APIs must be marked 'use client' (keeps pattern clear for future RSC migration).", rule: "use-client-marker", severity: "optional", enabled: false },
  { category: "styling", title: "Tailwind utility-first", description: "Use Tailwind classes instead of custom CSS where possible; custom CSS lives in globals.css only.", rule: "tailwind-utility-first", severity: "recommended", enabled: true },
  { category: "styling", title: "Design tokens over raw colors", description: "Reference semantic tokens (text-text-bright, bg-bg-elevated, border-white/10) rather than hard-coded hex.", rule: "use-design-tokens", severity: "required", enabled: true },
  { category: "testing", title: "Every new module ships tests", description: "New backend services need at least one test file; new UI components need at least one interaction test.", rule: "tests-required", severity: "recommended", enabled: true },
  { category: "testing", title: "No skipped tests on main", description: "`test.skip` and `it.skip` are forbidden in code merged to main.", rule: "no-skipped-tests", severity: "required", enabled: true },
  { category: "security", title: "No secrets in source", description: "Never commit API keys, passwords, or tokens. Use env vars validated at boot.", rule: "no-secrets-in-code", severity: "required", enabled: true, examples: { good: "const KEY = env.OPENAI_KEY;", bad: "const KEY = \"sk-abc123\";" } },
  { category: "security", title: "All HTTP inputs validated with Zod", description: "Every request body/query/param must be validated with a Zod schema via validate() middleware.", rule: "zod-input-validation", severity: "required", enabled: true },
  { category: "accessibility", title: "Buttons have accessible names", description: "Icon-only buttons need aria-label; interactive elements must be keyboard reachable.", rule: "a11y-button-names", severity: "required", enabled: true },
  { category: "performance", title: "No client-side barrel-import bloat", description: "Avoid importing large libraries just for one function; prefer tree-shakeable named imports.", rule: "no-barrel-bloat", severity: "recommended", enabled: true },
  { category: "node", title: "Prefer async/await over raw promises", description: "Use async/await for readability; always handle promise rejections.", rule: "prefer-async-await", severity: "recommended", enabled: true },
  { category: "general", title: "Files under 400 lines", description: "If a file exceeds 400 lines, split into submodules. Prevents unreadable behemoths.", rule: "max-file-length", severity: "optional", enabled: false },
];

async function readAll(): Promise<CodingStandard[]> {
  const raw = await redis.hgetall(KEY);
  return Object.values(raw).map((v) => JSON.parse(v));
}

async function ensureSeeded() {
  const existing = await redis.hlen(KEY);
  if (existing > 0) return;
  for (const s of SEED) {
    const id = randomUUID();
    await redis.hset(KEY, id, JSON.stringify({ id, ...s }));
  }
}

export const CodingStandardsService = {
  async list(): Promise<CodingStandard[]> { await ensureSeeded(); return (await readAll()).sort((a, b) => a.category.localeCompare(b.category)); },
  async get(id: string): Promise<CodingStandard | null> { const v = await redis.hget(KEY, id); return v ? JSON.parse(v) : null; },
  async create(input: Omit<CodingStandard, "id">): Promise<CodingStandard> {
    await ensureSeeded();
    const s: CodingStandard = { id: randomUUID(), ...input };
    await redis.hset(KEY, s.id, JSON.stringify(s)); return s;
  },
  async update(id: string, patch: Partial<CodingStandard>): Promise<CodingStandard | null> {
    const cur = await this.get(id); if (!cur) return null;
    const next = { ...cur, ...patch, id };
    await redis.hset(KEY, id, JSON.stringify(next)); return next;
  },
  async remove(id: string): Promise<boolean> { const n = await redis.hdel(KEY, id); return n > 0; },
  async summary() {
    const all = await this.list();
    return { total: all.length, required: all.filter(s => s.severity === "required").length, enabled: all.filter(s => s.enabled).length };
  },
};
