/** WINDELS AI OS — Revenue Guardian API client. */
import { api } from "./api";

export interface RgCustomer {
  id: string; name: string; email: string; phone?: string; company?: string; industry?: string;
  creditLimitCents: number; creditScore: number; riskLevel: "low" | "medium" | "high" | "critical";
  status: string; accountManagerId?: string; aiEmployeeId?: string;
  avgPaymentDelayDays: number; lifetimeValueCents: number; outstandingBalanceCents: number;
  totalInvoices: number; paidInvoices: number; unpaidInvoices: number; brokenPromises: number;
  lastCommunicationAt?: string; preferredChannel?: string; tags: string[]; notes: string;
  createdAt: string; updatedAt: string;
}

export interface RgInvoice {
  id: string; customerId: string; number: string; currency: string;
  amountCents: number; paidCents: number; status: string;
  issueDate: string; dueDate: string; paidAt?: string;
  daysOverdue: number; agingBucket: string; caseId?: string;
  lines: Array<{ description: string; quantity: number; unitPriceCents: number; totalCents: number }>;
}

export interface RgCollectionCase {
  id: string; customerId: string; primaryInvoiceId: string; invoiceIds: string[];
  totalOutstandingCents: number; status: string; priority: string;
  aiEmployeeId?: string; accountManagerId?: string;
  communicationsCount: number; promisesCount: number; brokenPromisesCount: number;
  lastActionAt?: string; resolutionNotes?: string; recoveredCents: number;
  openedAt: string; closedAt?: string;
}

export interface RgPaymentPromise {
  id: string; customerId: string; caseId?: string; invoiceId?: string;
  amountCents: number; promisedDate: string; status: string;
  confidenceScore: number; notes: string; recordedBy: string; actualPaidAt?: string;
}

export interface RgCommunication {
  id: string; customerId: string; caseId?: string; channel: string;
  direction: string; subject?: string; body: string; automated: boolean;
  aiEmployeeId?: string; deliveryStatus: string; createdAt: string;
}

export interface RgAiEmployee {
  id: string; type: string; name: string; description: string; enabled: boolean;
  casesHandled: number; messagesSent: number; recoveryRatePct: number;
}

export interface RgTask {
  id: string; customerId?: string; caseId?: string; assigneeId?: string;
  aiEmployeeId?: string; title: string; description: string; priority: string;
  status: string; dueAt: string; completedAt?: string;
}

export interface RgCollectionRule {
  id: string; name: string; enabled: boolean; triggerDaysOverdue: number;
  action: string; channel?: string; template?: string; priority?: string; order: number;
}

export interface RgDashboardRollup {
  generatedAt: string;
  totalOutstandingCents: number; overdueCents: number;
  collectedTodayCents: number; collectedThisWeekCents: number; collectedThisMonthCents: number;
  recoveryRatePct: number; collectionSuccessRatePct: number; badDebtRiskPct: number;
  overdueCustomerCount: number; openCaseCount: number;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d91_120: number; d120_plus: number };
  aiPerformance: Array<{ aiEmployeeId: string; name: string; type: string; casesHandled: number; recoveryRatePct: number; messagesSent: number }>;
  forecast: { days30: number; days60: number; days90: number };
  collectionTrend: Array<{ date: string; collectedCents: number }>;
  riskBreakdown: Record<string, number>;
  openTaskCount: number; brokenPromiseCount: number; totalCustomerCount: number;
}

export interface RgCustomerProfile {
  customer: RgCustomer;
  invoices: RgInvoice[];
  cases: RgCollectionCase[];
  promises: RgPaymentPromise[];
  communications: RgCommunication[];
  tasks: RgTask[];
  insights: Array<{ type: string; message: string; confidence: number; data?: any }>;
}

export interface RgExecutiveReport {
  generatedAt: string; period: { from: string; to: string };
  summary: { totalInvoicedCents: number; totalCollectedCents: number; totalOutstandingCents: number; totalOverdueCents: number; recoveryRatePct: number; avgCollectionDays: number };
  aging: RgDashboardRollup["aging"];
  topOverdueCustomers: Array<{ customerId: string; name: string; outstandingCents: number; daysOverdue: number }>;
  aiVsHumanPerformance: { aiRecoveredCents: number; humanRecoveredCents: number; aiCasesClosed: number; humanCasesClosed: number };
  cashFlowForecast: { week1: number; week2: number; week3: number; week4: number };
  recommendations: string[];
}

const base = "/revenue-guardian";

export const revenueGuardianApi = {
  rollup: () => api<RgDashboardRollup>(`${base}/dashboard/rollup`),
  executiveReport: (from?: string, to?: string) =>
    api<RgExecutiveReport>(`${base}/reports/executive`, { params: { from, to } }),

  // Customers
  listCustomers: (opts?: { q?: string; status?: string; riskLevel?: string }) =>
    api<RgCustomer[]>(`${base}/customers`, { params: opts }),
  getCustomerProfile: (id: string) => api<RgCustomerProfile>(`${base}/customers/${id}`),
  createCustomer: (data: Partial<RgCustomer>) =>
    api<RgCustomer>(`${base}/customers`, { method: "POST", json: data }),
  updateCustomer: (id: string, data: Partial<RgCustomer>) =>
    api<RgCustomer>(`${base}/customers/${id}`, { method: "PATCH", json: data }),
  deleteCustomer: (id: string) => api<void>(`${base}/customers/${id}`, { method: "DELETE" }),

  // Invoices
  listInvoices: (opts?: { customerId?: string; status?: string }) =>
    api<RgInvoice[]>(`${base}/invoices`, { params: opts }),
  createInvoice: (data: any) => api<RgInvoice>(`${base}/invoices`, { method: "POST", json: data }),
  recordPayment: (id: string, amountCents: number) =>
    api<RgInvoice>(`${base}/invoices/${id}/pay`, { method: "POST", json: { amountCents } }),

  // Cases
  listCases: (opts?: { customerId?: string; status?: string }) =>
    api<RgCollectionCase[]>(`${base}/cases`, { params: opts }),
  createCase: (data: any) => api<RgCollectionCase>(`${base}/cases`, { method: "POST", json: data }),
  updateCase: (id: string, data: any) =>
    api<RgCollectionCase>(`${base}/cases/${id}`, { method: "PATCH", json: data }),

  // Promises
  listPromises: (opts?: { status?: string }) =>
    api<RgPaymentPromise[]>(`${base}/promises`, { params: opts }),
  evaluatePromises: () => api<{ broken: number; kept: number }>(`${base}/promises/evaluate`, { method: "POST" }),

  // AI Employees
  listAiEmployees: () => api<RgAiEmployee[]>(`${base}/ai-employees`),
  createAiEmployee: (data: any) => api<RgAiEmployee>(`${base}/ai-employees`, { method: "POST", json: data }),

  // Tasks
  listTasks: (opts?: { assigneeId?: string; status?: string }) =>
    api<RgTask[]>(`${base}/tasks`, { params: opts }),
  updateTaskStatus: (id: string, status: string) =>
    api<RgTask>(`${base}/tasks/${id}/status`, { method: "PATCH", json: { status } }),

  // Rules
  listRules: () => api<RgCollectionRule[]>(`${base}/rules`),
  evaluateRules: () => api<any[]>(`${base}/rules/evaluate`, { method: "POST" }),

  // Automation
  refreshCustomer: (id: string) =>
    api<RgCustomer>(`${base}/automation/refresh-customer/${id}`, { method: "POST" }),
};
