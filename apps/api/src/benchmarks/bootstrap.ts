import BenchmarksService from "./benchmarks.service.js";
export async function bootstrapBenchmarks(opts: { logger: any; defaultOrgId?: string }) {
  await BenchmarksService.ensureBootstrapped(opts.logger, opts.defaultOrgId);
}
