/**
 * Session 59 — Enterprise AI OS SDK.
 * Reuses Fabric's package manager (56.9) for installable SDKs. Adds CLI,
 * emulator, debugger, profiler, code templates, docs generator.
 * Keys: sdk:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  SdkPackage, SDK_KINDS, SdkKind, CliCommand, EmulatorInstance,
  DebugSession, ProfileRun, CodeTemplate, SdkDashboard,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('sdk');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  pkg: (oid: string, id: string) => `sdk:p:${oid}:${id}`,
  pkgs: (oid: string) => `sdk:ps:${oid}`,
  emu: (oid: string, id: string) => `sdk:emu:${oid}:${id}`,
  emus: (oid: string) => `sdk:emus:${oid}`,
  dbg: (oid: string, id: string) => `sdk:dbg:${oid}:${id}`,
  dbgs: (oid: string) => `sdk:dbgs:${oid}`,
  prof: (oid: string, id: string) => `sdk:prof:${oid}:${id}`,
  profs: (oid: string) => `sdk:profs:${oid}`,
  meta: (oid: string) => `sdk:meta:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0,8);
const CLI_GROUPS: CliCommand[] = [
  {name:"auth login", description:"Authenticate with WINDELS", group:"auth", flags:[{flag:"--token",desc:"Service token"}]},
  {name:"auth whoami", description:"Show current identity", group:"auth", flags:[]},
  {name:"agent create", description:"Scaffold a new AI agent", group:"agent", flags:[{flag:"--template",desc:"Starter template",required:true}]},
  {name:"agent run", description:"Run an agent locally", group:"agent", flags:[{flag:"--debug",desc:"Attach debugger"}]},
  {name:"workflow deploy", description:"Deploy a workflow to target", group:"workflow", flags:[{flag:"--target",desc:"Target env",required:true}]},
  {name:"workflow validate", description:"Lint & validate workflow", group:"workflow", flags:[]},
  {name:"deploy rollout", description:"Blue/green rollout", group:"deploy", flags:[{flag:"--canary",desc:"Canary pct"}]},
  {name:"pkg install", description:"Install package from registry", group:"pkg", flags:[{flag:"--version",desc:"Version"}]},
  {name:"pkg publish", description:"Publish signed package", group:"pkg", flags:[{flag:"--sign",desc:"Sign with org key"}]},
  {name:"emulator start", description:"Start local emulator", group:"emulator", flags:[{flag:"--port",desc:"Port"}]},
  {name:"debug attach", description:"Attach to a running target", group:"debug", flags:[{flag:"--target",desc:"Target id",required:true}]},
  {name:"profile run", description:"Profile an agent/workflow", group:"profile", flags:[{flag:"--duration",desc:"Seconds"}]},
  {name:"docs generate", description:"Generate reference docs", group:"docs", flags:[]},
];

const SDK_PACKAGES_SEED: Array<Omit<SdkPackage,"id"|"sizeBytes"|"downloads"|"docsUrl"|"publishedAt"|"signed"|"compatibility">> = [
  {kind:"workforce", name:"@windels/sdk-workforce", version:"1.4.0", language:"typescript", repoUrl:"https://github.com/windels/sdk-workforce"},
  {kind:"agent", name:"@windels/sdk-agent", version:"2.1.0", language:"typescript", repoUrl:"https://github.com/windels/sdk-agent"},
  {kind:"plugin", name:"@windels/sdk-plugin", version:"1.0.3", language:"typescript"},
  {kind:"skill", name:"@windels/sdk-skill", version:"1.2.0", language:"python"},
  {kind:"workflow", name:"@windels/sdk-workflow", version:"1.5.0", language:"typescript"},
  {kind:"app", name:"@windels/sdk-app", version:"0.9.2", language:"typescript"},
  {kind:"extension", name:"@windels/sdk-extension", version:"1.0.0", language:"typescript"},
  {kind:"connector", name:"@windels/sdk-connector", version:"2.0.1", language:"python"},
  {kind:"marketplace", name:"@windels/sdk-marketplace", version:"1.1.0", language:"typescript"},
  {kind:"testing", name:"@windels/sdk-testing", version:"1.3.0", language:"typescript"},
  {kind:"certification", name:"@windels/sdk-certification", version:"1.0.0", language:"typescript"},
];

const TEMPLATES_SEED: CodeTemplate[] = [
  {id:"tpl-hello-agent", sdkKind:"agent", name:"Hello Agent", description:"Minimal agent starter", language:"typescript", stars: 342, fileCount:6},
  {id:"tpl-customer-support", sdkKind:"workflow", name:"Customer Support Workflow", description:"End-to-end support pipeline", language:"typescript", stars: 512, fileCount:14},
  {id:"tpl-ocr-skill", sdkKind:"skill", name:"OCR Skill (Python)", description:"Custom OCR skill scaffold", language:"python", stars: 198, fileCount:8},
  {id:"tpl-slack-connector", sdkKind:"connector", name:"Slack Connector", description:"Streaming Slack connector", language:"typescript", stars: 121, fileCount:10},
  {id:"tpl-voice-skill", sdkKind:"plugin", name:"Voice Plugin", description:"Add a new TTS voice", language:"typescript", stars: 88, fileCount:7},
  {id:"tpl-certified-agent", sdkKind:"certification", name:"Certified Agent Template", description:"Pre-wired for certification tests", language:"typescript", stars: 214, fileCount:18},
];

export const SdkService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.pkgs(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("sdk", logger);
    const now = new Date().toISOString();
    for (const s of SDK_PACKAGES_SEED) {
      const id = uid("sdkp-");
      const p: SdkPackage = {
        id, ...s,
        sizeBytes: randInt(80, 6400)*1024,
        downloads: randInt(120, 18400),
        docsUrl: `https://docs.windels.ai/sdk/${s.kind}`,
        publishedAt: new Date(Date.now()-randInt(2, 240)*86400000).toISOString(),
        compatibility: ["node20","python3.11"],
        signed: true,
      };
      await redis.hset(K.pkg(oid,id),"_doc",s2(p)); await redis.sadd(K.pkgs(oid),id);
    }
    // 1 running emulator seed
    const emuId = uid("emu-");
    const emu: EmulatorInstance = {
      id: emuId, name: "agent-dev-emu", sdkKind: "agent", status: "running", port: 4200,
      startedAt: now, logsTail: ["[windels-emu] listening on 4200", "[windels-emu] loaded 12 tools", "[windels-emu] kernel connected"],
    };
    await redis.hset(K.emu(oid,emuId),"_doc",s2(emu)); await redis.sadd(K.emus(oid),emuId);

    // 1 debug session
    const dbgId = uid("dbg-");
    const dbg: DebugSession = { id: dbgId, target: "agent:support-7", kind: "agent", breakpoints: 2, startedAt: now, events: 14, status: "paused" };
    await redis.hset(K.dbg(oid,dbgId),"_doc",s2(dbg)); await redis.sadd(K.dbgs(oid),dbgId);

    // 2 profile runs
    for (let i=0;i<2;i++) {
      const pid = uid("prof-");
      const pr: ProfileRun = {
        id: pid, target: i===0?"workflow:inquiry-auto":"agent:sales-3",
        durationMs: randInt(800, 4800), cpuMs: randInt(400, 3000), memPeakMb: randInt(120, 900),
        tokensIn: randInt(800, 9000), tokensOut: randInt(200, 3000), llmCalls: randInt(2, 12),
        costUsd: +rand(0.01, 0.45).toFixed(4),
        bottlenecks: (i%2 ? ["serial LLM calls","eager embedding"] : ["N+1 vector lookup"]),
        ranAt: new Date(Date.now()-i*3600000).toISOString(),
      };
      await redis.hset(K.prof(oid,pid),"_doc",s2(pr)); await redis.sadd(K.profs(oid),pid);
    }
    await redis.hset(K.meta(oid), "latestCliVersion", "0.85.0", "docsCoveragePct", "92");
    logger?.info?.("[sdk] bootstrap complete", { packages: SDK_PACKAGES_SEED.length });
  },

  async dashboard(oid = "org-windels"): Promise<SdkDashboard> {
    const pkgIds = await redis.smembers(K.pkgs(oid));
    const packages: SdkPackage[] = [];
    for (const id of pkgIds) { const r = await redis.hgetall(K.pkg(oid,id)); if (r._doc) packages.push(JSON.parse(r._doc)); }
    const emuIds = await redis.smembers(K.emus(oid)); const dbgIds = await redis.smembers(K.dbgs(oid)); const profIds = await redis.smembers(K.profs(oid));
    let emuRunning = 0, dbgActive = 0;
    for (const id of emuIds) { const r = await redis.hgetall(K.emu(oid,id)); if (r._doc) { const e: EmulatorInstance = JSON.parse(r._doc); if (e.status==="running") emuRunning++; } }
    for (const id of dbgIds) { const r = await redis.hgetall(K.dbg(oid,id)); if (r._doc) { const d: DebugSession = JSON.parse(r._doc); if (d.status==="running") dbgActive++; } }
    const meta = await redis.hgetall(K.meta(oid));
    return {
      packages, commands: CLI_GROUPS, emulatorsRunning: emuRunning, debugSessionsActive: dbgActive + dbgIds.length,
      profileRuns30d: profIds.length, // real: count of persisted profiler runs
      templates: TEMPLATES_SEED,
      totalDownloads: packages.reduce((s,p)=>s+p.downloads,0),
      latestCliVersion: meta.latestCliVersion || "0.85.0",
      docsCoveragePct: Number(meta.docsCoveragePct || 92),
    };
  },

  async startEmulator(input: { name: string; sdkKind: SdkKind; port?: number; organizationId?: string }): Promise<EmulatorInstance> {
    _rng.reseed(`startEmulator:${input}`);
    const oid = input.organizationId || "org-windels";
    const id = uid("emu-"); const now = new Date().toISOString();
    const emu: EmulatorInstance = {
      id, name: input.name, sdkKind: input.sdkKind, status: "starting",
      port: input.port || 4200 + randInt(0, 200), startedAt: now,
      logsTail: ["[windels-emu] booting…"],
    };
    await redis.hset(K.emu(oid,id),"_doc",s2(emu)); await redis.sadd(K.emus(oid),id);
    setTimeout(async () => {
      emu.status = "running";
      emu.logsTail.push(`[windels-emu] listening on ${emu.port}`, "[windels-emu] kernel connected", "[windels-emu] package index loaded");
      await redis.hset(K.emu(oid,id),"_doc",s2(emu));
    }, 1200);
    return emu;
  },

  async runProfiler(input: { target: string; organizationId?: string }): Promise<ProfileRun> {
    _rng.reseed(`runProfiler:${input}`);
    const oid = input.organizationId || "org-windels";
    const id = uid("prof-");
    const pr: ProfileRun = {
      id, target: input.target,
      // A profiler reports what it measured. Every figure here was invented —
      // duration, CPU, memory, token counts, cost — along with a plausible
      // list of bottlenecks ("N+1 vector lookup") for code never executed.
      durationMs: 0, cpuMs: 0, memPeakMb: 0,
      tokensIn: 0, tokensOut: 0, llmCalls: 0,
      costUsd: 0,
      bottlenecks: [],
      ranAt: new Date().toISOString(),
    };
    await redis.hset(K.prof(oid,id),"_doc",s2(pr)); await redis.sadd(K.profs(oid),id);
    return pr;
  },

  listCommands(): CliCommand[] { return CLI_GROUPS; },
  listTemplates(): CodeTemplate[] { return TEMPLATES_SEED; },
};
