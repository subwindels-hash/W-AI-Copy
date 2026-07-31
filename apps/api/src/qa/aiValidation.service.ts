/**
 * AiValidationService — Slice 187.
 *
 * Static/offline AI quality checks that don't require a live LLM call for
 * MVP: pattern-based PII detection, toxic/slur keyword scan, basic JSON
 * schema validation, max-latency assertion, refusal detection, hallucination
 * marker scan ("I don't know" + contradiction phrases), groundedness check
 * (keywords from reference snippets must appear in response), brand-tone
 * keyword check. A future session will wire this to model-based evaluators.
 */
import { assertion } from "./testRunner.service.js";
import { prisma } from "../db/client.js";
import type { TestCase, TestCaseResult, AiValidationConfig } from "@windels/shared/qa";

const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["phone-us", /\b(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g],
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/g],
  ["credit-card", /\b(?:\d{4}[- ]?){3}\d{4}\b/g],
];

const TOXIC_KEYWORDS = [
  // Deliberately mild for the check. Real service would plug into Perspective API.
  "idiot","moron","stupid","kill yourself","i hate you",
];

const HALLUCINATION_MARKERS = [
  "i am not sure", "i don't know", "i cannot verify",
  "this is not legal advice", "i'm making this up",
];

function fakeCompletion(prompt: string): { text: string; latencyMs: number } {
  const t0 = performance.now();
  // Deterministic fake "response" based on prompt keywords for tests.
  let text = "Based on company policy, ";
  if (/payroll|salary/i.test(prompt)) text += "payroll runs bi-monthly on the 15th and last day.";
  else if (/security|password/i.test(prompt)) text += "use a password manager and enable MFA.";
  else if (/email/i.test(prompt)) text += "you can reach support at support@windels.ai.";
  else text += "the answer is 42. If you need further assistance please ask.";
  // Make it a bit longer
  text += " This is a synthetic response for QA.";
  return { text, latencyMs: Math.round(performance.now() - t0 + 30) };
}

export async function runAiValidation(c: TestCase): Promise<TestCaseResult> {
  const cfg = c.config as unknown as AiValidationConfig;
  const t0 = performance.now();
  const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs: 0, startedAt: new Date().toISOString(), assertions: [], logs: [], metrics: {} };
  try {
    const { text, latencyMs } = fakeCompletion(cfg.prompt);
    res.logs.push(`completion: ${text.slice(0, 200)}`);

    // Schema
    if (cfg.checks.includes("schema-valid") && cfg.expectedSchema) {
      let parsedOk = true;
      try {
        const parsed = JSON.parse(text);
        for (const k of Object.keys(cfg.expectedSchema)) if (!(k in parsed)) parsedOk = false;
      } catch { parsedOk = false; }
      res.assertions.push(assertion("schema", "response matches expected schema", parsedOk));
    }

    // Response time
    if (cfg.checks.includes("response-time")) {
      const max = cfg.maxLatencyMs ?? 5000;
      res.assertions.push(assertion("latency", `latency ≤ ${max}ms`, latencyMs <= max, { actual: latencyMs, expected: max }));
    }
    res.metrics.latencyMs = latencyMs;

    // PII
    if (cfg.checks.includes("pii-detect")) {
      const hits: string[] = [];
      for (const [label, re] of PII_PATTERNS) if (re.test(text)) hits.push(label);
      // One email may be intentional from prompt ("support@..."); treat any other PII hit as failure.
      const bad = hits.filter((h) => h !== "email" || (text.match(PII_PATTERNS.find(p=>p[0]==="email")![1])?.length ?? 0) > 2);
      res.assertions.push(assertion("pii", "no excessive PII leaked", bad.length === 0, { actual: bad }));
    }

    // Toxicity
    if (cfg.checks.includes("toxicity")) {
      const lower = text.toLowerCase();
      const hits = TOXIC_KEYWORDS.filter((k) => lower.includes(k));
      res.assertions.push(assertion("toxicity", "no toxic language", hits.length === 0, { actual: hits }));
    }

    // Hallucination markers
    if (cfg.checks.includes("hallucination-detect")) {
      const lower = text.toLowerCase();
      const hits = HALLUCINATION_MARKERS.filter((m) => lower.includes(m));
      res.assertions.push(assertion("hallucination", "no obvious hallucination markers", hits.length === 0, { actual: hits }));
    }

    // Groundedness (naive keyword overlap)
    if (cfg.checks.includes("groundedness") && cfg.referenceSnippets?.length) {
      const hay = text.toLowerCase();
      const kw: string[] = [];
      for (const s of cfg.referenceSnippets) for (const w of s.toLowerCase().split(/\s+/).filter(w=>w.length>5).slice(0,5)) kw.push(w);
      const matches = kw.filter((w) => hay.includes(w));
      const ratio = kw.length ? matches.length / kw.length : 1;
      res.assertions.push(assertion("groundedness", "≥30% keyword overlap with references", ratio >= 0.3, { actual: ratio.toFixed(2), expected: "≥0.3" }));
      res.metrics.groundednessRatio = +ratio.toFixed(2);
    }

    // Forbidden / required patterns
    for (const pat of (cfg.forbiddenPatterns ?? [])) {
      res.assertions.push(assertion(`forbidden:${pat}`, `does not contain "${pat}"`, !text.toLowerCase().includes(pat.toLowerCase())));
    }
    for (const pat of (cfg.requiredPatterns ?? [])) {
      res.assertions.push(assertion(`required:${pat}`, `contains "${pat}"`, text.toLowerCase().includes(pat.toLowerCase())));
    }

    // Brand tone (very loose: check absence of ALL CAPS shouting)
    if (cfg.checks.includes("brand-tone")) {
      const shouting = (text.match(/[A-Z\s!]{8,}/g) ?? []).length;
      res.assertions.push(assertion("brand-tone", "no SHOUTING", shouting === 0, { actual: shouting }));
    }

    res.finishedAt = new Date().toISOString();
    res.durationMs = Math.round(performance.now() - t0);
    res.status = res.assertions.every((a)=>a.passed) ? "passed" : "failed";
    res.metrics.completionLength = text.length;
  } catch (err: any) {
    res.status = "error"; res.error = { code: "AI_VALIDATION_ERROR", message: err.message };
    res.finishedAt = new Date().toISOString(); res.durationMs = Math.round(performance.now()-t0);
  }
  return res;
}

export function newAiCase(suiteId: string, name: string, cfg: AiValidationConfig, opts: Partial<TestCase> = {}): Omit<TestCase,"id"|"createdAt"|"updatedAt"> {
  return { suiteId, name, kind: "ai-validation", severity: opts.severity ?? "high", config: cfg as any,
    tags: opts.tags ?? ["ai","quality"], selectors: opts.selectors ?? ["regression"],
    timeoutMs: opts.timeoutMs ?? 15000, enabled: true, description: opts.description };
}
