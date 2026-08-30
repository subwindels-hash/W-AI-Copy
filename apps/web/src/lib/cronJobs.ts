/** Super Admin Cron — web client for the platform-level cron job control plane. */
import { api } from "./api";
import {
  CRON_TASK_LABELS,
  CRON_PRIVACY_NOTE,
  type CronAdminOverview,
  type CronJob,
  type CronJobInput,
  type CronJobUpdateInput,
  type CronRunLog,
} from "@windels/shared/superAdminCron";

export type { CronAdminOverview, CronJob, CronJobInput, CronJobUpdateInput, CronRunLog };
export { CRON_TASK_LABELS, CRON_PRIVACY_NOTE };

export const cronJobsApi = {
  overview: () => api.get<CronAdminOverview>("/super-admin/cron/overview"),
  jobs: () => api.get<CronJob[]>("/super-admin/cron/jobs"),
  job: (id: string) => api.get<CronJob>(`/super-admin/cron/jobs/${id}`),
  create: (input: CronJobInput) => api.post<CronJob>("/super-admin/cron/jobs", input),
  update: (id: string, patch: CronJobUpdateInput) => api.patch<CronJob>(`/super-admin/cron/jobs/${id}`, patch),
  remove: (id: string) => api.del<{ id: string; deleted: true; deletedAt: string }>(`/super-admin/cron/jobs/${id}`),
  setEnabled: (id: string, enabled: boolean) => api.post<CronJob>(`/super-admin/cron/jobs/${id}/enabled`, { enabled }),
  runNow: (id: string) => api.post<CronJob>(`/super-admin/cron/jobs/${id}/run`),
  logs: (limit = 50) => api.get<CronRunLog[]>("/super-admin/cron/logs", { limit }),
};
