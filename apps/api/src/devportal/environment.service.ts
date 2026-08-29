/**
 * EnvironmentService - Slices 231-233: Local Dev / Sandbox / Integrated Emulator environments.
 *
 * MVP-simulated: state stored in Redis; start/stop flip status and seed a few log lines + ports.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DevEnvironment, DevEnvKind, DevEnvStatus } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
// Deterministic demo RNG — stable within a running process.



const LIST_KEY = "dev:envs";
const DETAIL = (id: string) => `dev:env:${id}`;
const SER = <T>(v: T) => JSON.stringify(v);

function iso() { return new Date().toISOString(); }

const SEED_ENVS: Array<Omit<DevEnvironment, "id"|"status"|"logs"|"uptimeSec"|"cpuPct"|"memMb"|"startedAt"|"url">> = [
  {
    kind: "local", name: "Local Dev", ports: [{name:"web",port:5173},{name:"api",port:4000},{name:"db",port:5432},{name:"redis",port:6379}],
    services: ["web","api","postgres","redis","mailhog"],
  },
  {
    kind: "sandbox", name: "Preview Sandbox", ports: [{name:"https",port:443}],
    services: ["isolated-api","sandbox-db","sandbox-redis"],
  },
  {
    kind: "emulator", name: "Cross-platform Emulator", ports: [{name:"emulator",port:8200}],
    services: ["web","api","mobile-shell","electron-shell","voice-agent"],
  },
];

export const EnvironmentService = {
  async list(): Promise<DevEnvironment[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: DevEnvironment[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as DevEnvironment);
    }
    return out.sort((a,b) => a.kind.localeCompare(b.kind));
  },
  async get(id: string): Promise<DevEnvironment | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as DevEnvironment) : null;
  },
  async start(id: string): Promise<DevEnvironment | null> {
    const e = await this.get(id);
    if (!e) return null;
    e.status = "starting";
    e.logs = [...(e.logs ?? []), `[${iso()}] starting ${e.name}...`];
    await redis.set(DETAIL(id), SER(e));
    // Simulate boot
    e.status = "running";
    e.startedAt = iso();
    e.uptimeSec = 0;
    // An environment reports 5-40% CPU and 200-800 MB the instant it starts,
    // before it has run anything. Undefined until the environment reports.
    e.cpuPct = 0;
    e.memMb = 0;
    e.url = e.kind === "local"
      ? `http://localhost:${e.ports.find(p=>p.name==="web"||p.name==="https"||p.name==="emulator")?.port ?? 5173}`
      : `https://${e.kind}-${randomUUID().slice(0,8)}.windels.dev`;
    e.logs.push(`[${iso()}] ${e.name} ready: ${e.url}`);
    e.logs.push(`[${iso()}] services healthy: ${e.services.join(", ")}`);
    e.logs = e.logs.slice(-30);
    await redis.set(DETAIL(id), SER(e));
    return e;
  },
  async stop(id: string): Promise<DevEnvironment | null> {
    const e = await this.get(id);
    if (!e) return null;
    e.status = "stopped";
    e.logs.push(`[${iso()}] ${e.name} stopped`);
    e.logs = e.logs.slice(-30);
    e.uptimeSec = 0;
    e.url = undefined;
    await redis.set(DETAIL(id), SER(e));
    return e;
  },
  async seed() {
    const existing = await redis.scard(LIST_KEY);
    if (existing > 0) return;
    // Seeds developer environments as already-running, with uptime, CPU and
    // memory for workloads that were never started.
    if (!demoDataEnabled()) return skipDemoSeed("devportal-environments");
    for (const spec of SEED_ENVS) {
      const id = randomUUID();
      const env: DevEnvironment = {
        id, ...spec,
        status: spec.kind === "local" ? "running" : "stopped",
        logs: spec.kind === "local"
          ? [`[${iso()}] ${spec.name} already running`, `[${iso()}] services healthy: ${spec.services.join(", ")}`]
          : [],
        uptimeSec: spec.kind === "local" ? 3800 : 0,
        cpuPct: 0,
        memMb: spec.kind === "local" ? 420 : 0,
        url: spec.kind === "local" ? "http://localhost:5173" : undefined,
        startedAt: spec.kind === "local" ? iso() : undefined,
      };
      await redis.set(DETAIL(id), SER(env));
      await redis.sadd(LIST_KEY, id);
    }
  },
};
