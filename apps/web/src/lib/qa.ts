/**
 * Session 22 — Enterprise QA Platform API client.
 */
import { api } from "./api";
import type {
  TestSuite, TestCase, TestRun, QADashboard,
} from "@windels/shared/qa";

export type { TestSuite, TestCase, TestRun, QADashboard } from "@windels/shared/qa";

export const qaApi = {
  dashboard: () => api<QADashboard>("/qa/dashboard"),
  listSuites: () => api<{ suites: TestSuite[] }>("/qa/suites").then(r=>r.suites),
  getSuite: (id: string) => api<TestSuite>(`/qa/suites/${id}`),
  createSuite: (b: { name: string; description?: string; kind?: any; tags?: string[]; schedule?: any }) =>
    api<TestSuite>("/qa/suites", { method:"POST", json: b }),
  deleteSuite: (id: string) => api<{removed:boolean}>(`/qa/suites/${id}`, { method:"DELETE" }).then(r=>r.removed),
  runSuite: (id: string, opts: { triggeredBy?: string; selector?: string; actorId?: string } = {}) =>
    api<TestRun>(`/qa/suites/${id}/run`, { method:"POST", json: opts }),
  listCases: (filter?: { suiteId?: string; kind?: any; tag?: string; selector?: string }) =>
    api<{ cases: TestCase[] }>("/qa/cases", { params: filter as any }).then(r=>r.cases),
  createCase: (b: any) => api<TestCase>("/qa/cases", { method:"POST", json: b }),
  deleteCase: (id: string) => api<{removed:boolean}>(`/qa/cases/${id}`, { method:"DELETE" }).then(r=>r.removed),
  runCase: (id: string) => api<TestCaseResult>(`/qa/cases/${id}/run`, { method:"POST" }),
  listRuns: (limit = 30) => api<{ runs: TestRun[] }>("/qa/runs", { params: { limit } }).then(r=>r.runs),
  getRun: (id: string) => api<TestRun>(`/qa/runs/${id}`),
};

export interface TestCaseResult {
  caseId: string; caseName: string; status: string; durationMs: number;
  startedAt: string; finishedAt?: string; assertions: Array<{id:string;label:string;passed:boolean;message?:string;expected?:any;actual?:any}>;
  error?: {code:string;message:string}; logs: string[]; metrics: Record<string,number>;
}
