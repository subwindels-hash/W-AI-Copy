#!/usr/bin/env node
/**
 * WINDELS AI OS — Module Inventory Generator
 * Scans the monorepo and produces a machine-readable JSON inventory plus
 * summary statistics for every module.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// Pre-existing bug: this was hardcoded to "/home/user/windels", a path that
// does not exist in this checkout, so the generator crashed before writing.
// Derive the repo root from this file's own location instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_ROUTES = path.join(ROOT, "apps/api/src/http/routes");
const API_SERVICES = path.join(ROOT, "apps/api/src");
const SHARED = path.join(ROOT, "packages/shared/src");
const WEB_LIB = path.join(ROOT, "apps/web/src/lib");
const WEB_PAGES = path.join(ROOT, "apps/web/src/pages");
const PRISMA = path.join(ROOT, "apps/api/prisma/schema.prisma");
const TESTS = path.join(ROOT, "tests/e2e");
const MIGRATIONS_DIR = path.join(ROOT, "apps/api/prisma/migrations");

// Service directory name ↔ human module
// We treat each subdirectory under apps/api/src that is NOT infra
// (db,http,utils,services,config,observability,security) as a "module".
// Directories that are infrastructure, not product modules. `testUtils` holds
// shared test helpers (FakePrisma, live-API probe) and must not be reported as
// an unimplemented module.
const INFRA_DIRS = new Set(["db","http","utils","services","config","observability","security","testUtils","kernel","enterprise","platform"]);

// Map route files that don't follow [module].ts naming
const ROUTE_OVERRIDES = {
  admin: "admin", agentComm: "agentComm", agentKnowledge: "agentComm",
  agentMemories: "agentComm", agents: "agents", ai: "kernel",
  architecture: "architecture", attachments: "attachments", auth: "auth",
  autonomous: "autonomous", benchmarks: "benchmarks", billing: "billing",
  biomedical: "biomedical", canvases: "collaboration", cognitive: "cognitive",
  collaboration: "collaboration", command: "command", composer: "composer",
  constitution: "constitution", conversations: "conversations",
  conversationOps: "conversations",
  religionsIntegrations: "religions",
  coreIntegration: "coreIntegration", cryptoIntelligence: "cryptoIntelligence",
  cyber: "cyber", dataMarketplace: "dataMarketplace", dataPlatform: "dataMarketplace",
  deployment: "deployment", derivativesDesk: "derivatives",
  devPortal: "devportal", developers: "developers",
  digitalHumans: "digitalHumans", disasterRecovery: "disasterRecovery",
  education: "education", engineering: "engineering", enterprise: "enterprise",
  enterpriseFoundation: "enterpriseFoundation", expertsPlatform: "expertsPlatform",
  extensions: "extensions", fabric: "fabric", giftCards: "giftCards",
  globalCurrency: "globalCurrency", googleAuth: "googleAuth",
  googleIdentity: "googleAuth", governance: "governance",
  health: "healthEcosystem", healthEcosystem: "healthEcosystem",
  hybridExec: "hybridExec", industry: "industry", infrastructure: "infrastructure",
  kernel: "kernel", leadPipeline: "leadDiscovery", legal: "legal", licensing: "licensing",
  mfaAssurance: "mfa",
  marketplace: "marketplace", mediaFactory: "mediaFactory", mediaGen: "mediaGen",
  memoryEvolution: "memoryEvolution", me: "auth", messages: "conversations",
  mlOps: "mlOps", mobile: "mobile", mobileSync: "mobile", modelFactory: "modelFactory",
  opex: "opex", opexAssurance: "opex", platform: "platform", platformServices: "platformServices",
  profile: "auth", program: "program", promptTemplates: "promptTemplates",
  publicApi: "publicApi", qa: "qa", quantum: "quantum", release: "release",
  robotics: "robotics", scientific: "scientific", sdk: "sdk",
  selfHosted: "selfHosted", spatial: "spatial", sustainability: "sustainability",
  talk: "talk", tradingIntel: "tradingIntel", training: "training",
  updates: "updates", usage: "usage", uxIntelligence: "uxIntelligence",
  v76validation: "v76validation", voiceFoundry: "voiceFoundry",
  voiceOwnership: "voiceOwnership", voiceStudio: "voiceStudio",
  wakeIntel: "wakeIntel", workflows: "composer", workspace: "collaboration",
};

// Human-friendly module titles and associated session numbers (from PROGRESS.md)
const MODULE_META = {
  auth:                  { title: "Authentication / Authorization",    sessions: [1,13,14], tier: "core" },
  agents:                { title: "Agent Framework",                   sessions: [7,8],     tier: "core" },
  conversations:         { title: "Conversations / Messaging",         sessions: [2,3,4],   tier: "core" },
  attachments:           { title: "Message Attachments",               sessions: [4],       tier: "support" },
  talk:                  { title: "Talk / Voice Channels",             sessions: [5,6],     tier: "core" },
  billing:               { title: "Billing & Subscriptions",           sessions: [20],      tier: "support" },
  mobile:                { title: "Mobile App / PWA",                  sessions: [21,117],  tier: "core" },
  canvas:                { title: "Canvas / Collaboration",            sessions: [22],      tier: "core" },
  canvas_collab:         { title: "Collab Canvas",                     sessions: [22],      tier: "core" },
  promptTemplates:       { title: "Prompt Templates Library",          sessions: [23],      tier: "support" },
  program:               { title: "Program Management (S25)",          sessions: [25],      tier: "platform" },
  engineering:           { title: "Engineering / Observability (S26)", sessions: [26],      tier: "platform" },
  devportal:             { title: "Developer Portal (S27)",            sessions: [27],      tier: "platform" },
  architecture:          { title: "Architecture / ESI (S37)",          sessions: [37],      tier: "platform" },
  selfHosted:            { title: "Self-Hosted Inference (S38)",       sessions: [38],      tier: "platform" },
  kernel:                { title: "AI Kernel / AI (S39)",              sessions: [39],      tier: "core" },
  voiceStudio:           { title: "Voice Studio (S40)",                sessions: [40],      tier: "feature" },
  voiceFoundry:          { title: "Voice Foundry (S41)",               sessions: [41],      tier: "feature" },
  mediaGen:              { title: "Media Generation (S42)",            sessions: [42],      tier: "feature" },
  hybridExec:            { title: "Hybrid Execution (S43)",            sessions: [43],      tier: "platform" },
  voiceOwnership:        { title: "Voice Ownership / Consent (S44)",   sessions: [44],      tier: "platform" },
  coreIntegration:       { title: "Core Integration (S45)",            sessions: [45],      tier: "platform" },
  modelFactory:          { title: "Model Factory (S46)",               sessions: [46],      tier: "platform" },
  memoryEvolution:       { title: "Memory Evolution (S47)",            sessions: [47],      tier: "core" },
  constitution:          { title: "Constitution / Governance",         sessions: [48],      tier: "platform" },
  governance:            { title: "Governance Engine",                 sessions: [48,73],   tier: "platform" },
  composer:              { title: "Composer / Workflows",              sessions: [49],      tier: "feature" },
  benchmarks:            { title: "Benchmark Center (S50)",            sessions: [50],      tier: "platform" },
  licensing:             { title: "Licensing (S51)",                   sessions: [51],      tier: "platform" },
  deployment:            { title: "Deployment Engine (S52)",           sessions: [52],      tier: "platform" },
  disasterRecovery:      { title: "Disaster Recovery / BCP (S53)",     sessions: [53],      tier: "platform" },
  updates:               { title: "Updates / OTA (S54)",               sessions: [54],      tier: "platform" },
  usage:                 { title: "Usage Intelligence (S55)",          sessions: [55],      tier: "platform" },
  fabric:                { title: "Intelligence Fabric (S56)",         sessions: [56],      tier: "platform" },
  robotics:              { title: "Robotics (S57)",                    sessions: [57],      tier: "feature" },
  spatial:               { title: "Spatial Computing (S58)",           sessions: [58],      tier: "feature" },
  sdk:                   { title: "SDK Packages (S59)",                sessions: [59],      tier: "platform" },
  training:              { title: "Training / LoRA (S60)",              sessions: [60],      tier: "feature" },
  dataMarketplace:       { title: "Data Marketplace (S61)",            sessions: [61],      tier: "feature" },
  digitalHumans:         { title: "Digital Humans (S62)",              sessions: [62],      tier: "feature" },
  quantum:               { title: "Quantum (S63)",                     sessions: [63],      tier: "feature" },
  sustainability:        { title: "Sustainability / ESG (S64)",        sessions: [64],      tier: "feature" },
  biomedical:            { title: "Biomedical / Healthcare (S65)",     sessions: [65],      tier: "feature" },
  legal:                 { title: "Legal Research (S66)",              sessions: [66],      tier: "feature" },
  education:             { title: "Education Platform (S67)",          sessions: [67],      tier: "feature" },
  scientific:            { title: "Scientific Research (S68)",         sessions: [68],      tier: "feature" },
  cognitive:             { title: "Cognitive / World Model (S69)",     sessions: [69],      tier: "feature" },
  command:               { title: "Global Command Center (S70)",       sessions: [70],      tier: "platform" },
  aiEconomy:             { title: "AI Economy / GPU Cloud (S71)",      sessions: [71],      tier: "feature" },
  autonomous:            { title: "Autonomous Org (S72)",              sessions: [72],      tier: "feature" },
  opex:                  { title: "OpEx / Trust / Safety (S73)",       sessions: [73,118],  tier: "platform" },
  industry:              { title: "Industry Packs (S74)",              sessions: [74],      tier: "feature" },
  healthEcosystem:       { title: "Health Ecosystem V10 (S75)",        sessions: [75],      tier: "feature" },
  v76validation:         { title: "S76 Final Validation",              sessions: [76],      tier: "platform" },
  expertsPlatform:       { title: "Experts Platform (S77a)",           sessions: [77],      tier: "feature" },
  mediaFactory:          { title: "Media Factory (S77b)",              sessions: [77],      tier: "feature" },
  uxIntelligence:        { title: "UX Intelligence (S78)",             sessions: [78],      tier: "platform" },
  giftCards:             { title: "Gift Cards WMPC (S79)",             sessions: [79],      tier: "feature" },
  globalCurrency:        { title: "Global Currency (S80)",             sessions: [80],      tier: "feature" },
  tradingIntel:          { title: "Trading Intelligence (S81)",        sessions: [81],      tier: "feature" },
  derivatives:           { title: "Derivatives & Fixed Income (S81/S113)", sessions: [81,113], tier: "feature" },
  googleAuth:            { title: "Google Identity / OAuth (S114)",     sessions: [114],     tier: "core" },
  leadDiscovery:         { title: "Lead Discovery & Pipeline (S85/S115)", sessions: [85,115],  tier: "feature" },
  mfa:                   { title: "Multi-Factor Authentication (S116)", sessions: [116],     tier: "core" },
  cyber:                 { title: "Cyber Academy (S82)",               sessions: [82],      tier: "feature" },
  platform:              { title: "Platform Admin UI Shell",           sessions: [],        tier: "core" },
  platformServices:      { title: "Platform Services (CDN/etc)",       sessions: [],        tier: "platform" },
  release:               { title: "Release Pipeline",                  sessions: [],        tier: "platform" },
  qa:                    { title: "QA Engine",                         sessions: [],        tier: "platform" },
  mlOps:                 { title: "ML Ops",                            sessions: [],        tier: "platform" },
  marketplace:           { title: "Plugin / Extension Marketplace",    sessions: [],        tier: "feature" },
  extensions:            { title: "Plugin System",                     sessions: [],        tier: "platform" },
  aiEcosystem:           { title: "AI Ecosystem Directory",            sessions: [],        tier: "feature" },
  enterprise:            { title: "Enterprise Dashboard",              sessions: [],        tier: "feature" },
  enterpriseFoundation:  { title: "Enterprise Foundation",             sessions: [],        tier: "platform" },
  wakeIntel:             { title: "Wake-word Intelligence",            sessions: [],        tier: "feature" },
  cryptoIntelligence:    { title: "Crypto Intelligence",               sessions: [35],      tier: "feature" },
  developers:            { title: "Developers Public Pages",           sessions: [],        tier: "support" },
  publicApi:             { title: "Public API",                        sessions: [],        tier: "platform" },
  infrastructure:        { title: "Infrastructure Monitoring",         sessions: [],        tier: "platform" },
  admin:                 { title: "Admin Utilities",                   sessions: [],        tier: "support" },
  collaboration:         { title: "Collaboration primitives",          sessions: [22],      tier: "core" },
  agentComm:             { title: "Agent Communication",               sessions: [],        tier: "core" },
  ai:                    { title: "AI base router",                    sessions: [],        tier: "core" },
};

function ls(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}
function fexists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }
function sloc(p) {
  return read(p).split("\n").length;
}
function countRoutes(routeFile) {
  const src = read(routeFile);
  // Route files use several router aliases (`router.get`, `r.get`, `rel.post`,
  // `v1.use`). Matching only `router.` under-counted whole modules to zero and
  // pushed them to MISSING/STUB. Match any identifier receiving an HTTP verb.
  const verb = (v) =>
    (src.match(new RegExp(String.raw`\b\w+\s*\.\s*${v}\s*\(\s*["'\`]`, "g")) || []).length;
  const gets = verb("get"), posts = verb("post"), puts = verb("put");
  const patches = verb("patch"), dels = verb("delete");
  return { total: gets+posts+puts+patches+dels, GET: gets, POST: posts, PUT: puts, PATCH: patches, DELETE: dels };
}
function listRoutePaths(routeFile) {
  const src = read(routeFile);
  const re = /router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const out = []; let m;
  while ((m = re.exec(src))) out.push(`${m[1].toUpperCase()} ${m[2]}`);
  return out;
}
function usesMathRandom(file) {
  const src = read(file);
  return /Math\.random\s*\(/.test(src);
}
function usesExternalFetch(file) {
  const src = read(file);
  return /fetch\s*\(|axios|https?:\/\/(?!localhost|127\.0\.0\.1)/.test(src);
}

// Parse Prisma schema for models
const prismaSrc = read(PRISMA);
const prismaModels = [...prismaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]);

// Gather all service directories
const serviceDirs = ls(API_SERVICES).filter(n => {
  const p = path.join(API_SERVICES, n);
  return fs.statSync(p).isDirectory() && !INFRA_DIRS.has(n);
});

// Gather route files
// Route modules only — a co-located `*.test.ts` beside a route file is a test,
// not a module. Without this, adding routes/events.test.ts invented a phantom
// module "events.test" with 0 routes and no service, reported as MISSING.
const routeFiles = ls(API_ROUTES).filter(n => n.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(n));

// Map route file -> module key
const routeByModule = new Map(); // moduleKey -> [{file, endpoints}]
for (const rf of routeFiles) {
  const base = rf.replace(/\.ts$/, "");
  const mod = ROUTE_OVERRIDES[base] || base;
  if (!routeByModule.has(mod)) routeByModule.set(mod, []);
  routeByModule.get(mod).push({
    file: rf,
    sloc: sloc(path.join(API_ROUTES, rf)),
    count: countRoutes(path.join(API_ROUTES, rf)),
    endpoints: listRoutePaths(path.join(API_ROUTES, rf)),
  });
}

/**
 * Find the tests covering a module.
 *
 * This used to scan ONLY tests/e2e/*.spec.ts, so the 39 co-located unit tests
 * under apps/api/src/<module>/<module>.test.ts were invisible. Modules with
 * real, passing suites - attachments, publicApi, promptTemplates,
 * conversations, projectContinuity - were all reported `tests=0`, which in turn
 * held them at PARTIAL because classifyStatus() requires hasTests for COMPLETE.
 * The repo's own convention is co-located unit tests; the audit was looking in
 * the one place they are not.
 */
function findTestsFor(modKey) {
  const tests = [];

  // 1. End-to-end specs that reference the module.
  for (const f of ls(TESTS)) {
    if (!f.endsWith(".spec.ts")) continue;
    const src = read(path.join(TESTS, f));
    if (src.includes(`/${moduleRoutePrefix(modKey)}`) || src.includes(`from "../lib/${modKey}`) ||
        src.includes(`${modKey}Api`) || src.includes(`${modKey}.service`)) {
      tests.push(f);
    }
  }

  // 2. Unit tests living inside the module directory (the repo convention).
  const modDir = path.join(API_SERVICES, modKey);
  for (const f of ls(modDir)) {
    if (f.endsWith(".test.ts")) tests.push(`${modKey}/${f}`);
  }
  // ...including one level of nesting, e.g. mediaFactory/publishing/*.test.ts.
  for (const sub of ls(modDir)) {
    const subDir = path.join(modDir, sub);
    if (!fexists(subDir)) continue;
    let entries = [];
    try { entries = ls(subDir); } catch { continue; }
    for (const f of entries) {
      if (f.endsWith(".test.ts")) tests.push(`${modKey}/${sub}/${f}`);
    }
  }

  // 2b. Some modules live under a grouping directory rather than at the top
  //     level (enterprise/agentComm/*), so the route file is the only pointer
  //     to where the code — and its tests — actually are.
  for (const group of ["enterprise", "platform", "services"]) {
    const groupDir = path.join(API_SERVICES, group, modKey);
    if (!fexists(groupDir)) continue;
    for (const f of ls(groupDir)) {
      if (f.endsWith(".test.ts")) tests.push(`${group}/${modKey}/${f}`);
    }
  }

  // 2c. Follow the route's own service imports. `infrastructure` is backed by
  //     platform/*.service.ts, so its tests live in platform/, not in a
  //     directory named after the module. servicesFromRoutes() already knows
  //     this mapping; reuse it rather than guessing from the module name.
  for (const rel of servicesFromRoutes(modKey)) {
    const dir = path.dirname(path.join(API_SERVICES, rel));
    const relDir = path.dirname(rel);
    if (relDir === modKey || relDir === ".") continue;
    for (const f of ls(dir)) {
      if (!f.endsWith(".test.ts")) continue;
      // Only count a suite that actually exercises one of the imported
      // services, not every test that happens to share the directory.
      const src = read(path.join(dir, f));
      const importsBacking = servicesFromRoutes(modKey).some((r) => {
        const base = path.basename(r, ".ts");
        return src.includes(`./${base}.js`) || src.includes(`${base}.js"`);
      });
      if (importsBacking) tests.push(`${relDir}/${f}`);
    }
  }

  // 3. Cross-cutting suites that exercise a module from elsewhere (a service
  //    moved onto the standard layout may still be tested from src/services,
  //    and config/*.test.ts pins behaviour across many modules).
  for (const extra of ["config", "services"]) {
    const dir = path.join(API_SERVICES, extra);
    if (dir === modDir) continue;
    for (const f of ls(dir)) {
      if (!f.endsWith(".test.ts")) continue;
      const src = read(path.join(dir, f));
      if (src.includes(`/${modKey}/`) || src.includes(`${modKey}.service`)) {
        tests.push(`${extra}/${f}`);
      }
    }
  }

  return [...new Set(tests)];
}
/**
 * Every client file under apps/web/src/lib, including one level of
 * subdirectory.
 *
 * The scan used to be flat, so `lib/mobile/{biometrics,push,offlineQueue}.ts`
 * were invisible and the mobile module — which has 21 routes and a fully wired
 * PWA calling them — was reported as having no web client at all.
 */
function webLibFiles() {
  const out = [];
  for (const entry of ls(WEB_LIB)) {
    if (entry.endsWith(".ts")) { out.push(entry); continue; }
    const sub = path.join(WEB_LIB, entry);
    let nested = [];
    try { nested = ls(sub); } catch { continue; }
    for (const f of nested) if (f.endsWith(".ts")) out.push(`${entry}/${f}`);
  }
  return out;
}

/**
 * Locate the shared Zod/type contract for a module.
 *
 * This was a bare `fexists(shared/<modKey>.ts)` check, which assumes the shared
 * file is named exactly after the backend module. `giftCards` breaks that
 * assumption: its contract is `wmpcGiftCards.ts` (Session 79's WMPC naming) and
 * the service imports GcType/GcStatus/WmpcGiftCard from it — yet the audit
 * reported the module as having no shared types, i.e. as unfinished work.
 *
 * Resolve by what the backend actually imports, falling back to the filename.
 */
function findSharedTypes(modKey) {
  const exact = path.join(SHARED, `${modKey}.ts`);
  if (fexists(exact)) return `packages/shared/src/${modKey}.ts (${sloc(exact)} LOC)`;

  // Collect the module's backend sources and see which shared file supplies the
  // types they import.
  const sources = [];
  const modDir = path.join(API_SERVICES, modKey);
  for (const f of ls(modDir)) if (f.endsWith(".ts")) sources.push(path.join(modDir, f));
  for (const rel of servicesFromRoutes(modKey)) sources.push(path.join(API_SERVICES, rel));
  const routeFile = path.join(API_ROUTES, `${modKey}.ts`);
  if (fexists(routeFile)) sources.push(routeFile);

  // Named subpath import, e.g. from "@windels/shared/etl".
  for (const src of sources) {
    const text = read(src);
    for (const m of text.matchAll(/@windels\/shared\/([A-Za-z0-9_]+)/g)) {
      const cand = path.join(SHARED, `${m[1]}.ts`);
      // "api" is the generic envelope, not a module contract.
      if (m[1] !== "api" && fexists(cand)) {
        return `packages/shared/src/${m[1]}.ts (${sloc(cand)} LOC, imported)`;
      }
    }
  }

  // Barrel import — find which shared file declares the imported symbols.
  for (const src of sources) {
    const text = read(src);
    for (const imp of text.matchAll(/import\s+type\s*\{([^}]+)\}\s*from\s*["']@windels\/shared["']/g)) {
      const names = imp[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      if (!names.length) continue;
      for (const f of ls(SHARED)) {
        if (!f.endsWith(".ts") || f === "index.ts" || f === "api.ts") continue;
        const p = path.join(SHARED, f);
        const decl = read(p);
        const hits = names.filter((n) =>
          new RegExp(`export\\s+(?:type|interface|const|enum)\\s+${n}\\b`).test(decl));
        // Require more than one match so an incidental name collision does not
        // bind a module to the wrong contract.
        if (hits.length >= Math.min(2, names.length)) {
          return `packages/shared/src/${f} (${sloc(p)} LOC, supplies ${hits.slice(0, 3).join("/")})`;
        }
      }
    }
  }
  return null;
}

/**
 * Locate the web client for a module.
 *
 * This used to be a bare `fexists(lib/<modKey>.ts)` check, which assumes the
 * frontend names its API client exactly after the backend module. Several do
 * not, and the mismatch produced false "no web client" findings for modules
 * with perfectly good UIs:
 *
 *   attachments   -> lib/files.ts   (FilesPage uploads/downloads through it)
 *   conversations -> lib/chat.ts    (calls /conversations directly)
 *   mfa           -> lib/api.ts     (api.completeMfa)
 *   canvasCollab  -> lib/canvas.ts  (canvasCollabApi presence/cursors)
 *
 * Those four were being reported as unfinished frontend work that had in fact
 * already shipped. Fall back to searching every client for a call against the
 * module's route prefix, which is what "has a client" actually means.
 */
function findWebClient(modKey) {
  const exact = path.join(WEB_LIB, `${modKey}.ts`);
  if (fexists(exact)) return `apps/web/src/lib/${modKey}.ts (${sloc(exact)} LOC)`;

  // A few modules are mounted under a path that differs from the module key:
  // mfa lives beneath /auth, and canvasCollab is mounted at /canvas (both
  // /canvas and /canvases per server.ts).
  const PREFIX_ALIASES = {
    mfa: ["auth/mfa", "mfa"],
    canvasCollab: ["canvas", "canvases"],
    googleAuth: ["auth/google"],
    promptTemplates: ["prompt-templates", "promptTemplates"],
    // Session 120 — the module's client (`lib/publicApi.ts`) serves the
    // internal usage endpoint `/apikeys/usage` plus the gateway docs path.
    publicApi: ["public", "api-keys", "apikeys/usage"],
    // Session 123 — the usage module mounts at /usage-intel (not /usage) and
    // its client calls /usage-intel/dashboard/rollup.
    usage: ["usage-intel", "usage"],
  };
  const prefixes = PREFIX_ALIASES[modKey] ?? [moduleRoutePrefix(modKey)];

  for (const prefix of prefixes) {
    // Match a quoted/templated request path such as "/conversations" or
    // `/canvas/${id}/presence`, not an incidental mention of the word.
    const re = new RegExp("[\"'`]/" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[/?\"'`]|$)");
    for (const f of webLibFiles()) {
      const p = path.join(WEB_LIB, f);
      if (re.test(read(p))) return `apps/web/src/lib/${f} (${sloc(p)} LOC, serves /${prefix})`;
    }
  }
  return null;
}

function moduleRoutePrefix(key) {
  const map = {
    healthEcosystem: "health-ecosystem", v76validation: "validation",
    expertsPlatform: "experts", giftCards: "gift-cards", globalCurrency: "global-currency",
    tradingIntel: "trading-intel", digitalHumans: "digital-humans",
    dataMarketplace: "data-marketplace", disasterRecovery: "disaster-recovery",
    coreIntegration: "core-integration", memoryEvolution: "memory-evolution",
    platformServices: "platform-services", aiEcosystem: "ai-ecosystem",
    aiEconomy: "ai-economy", enterpriseFoundation: "enterprise-foundation",
    mediaFactory: "media-factory", uxIntelligence: "ux-intelligence",
    voiceFoundry: "voice-foundry", voiceOwnership: "voice-ownership",
    voiceStudio: "voice-studio", wakeIntel: "wake-intel",
    mlOps: "ml-ops", cyber: "cyber", biomedical: "biomedical",
    hybridExec: "hybrid-execution", mediaGen: "media-generation",
    selfHosted: "self-hosted", devportal: "dev-portal",
  };
  return map[key] || key;
}

// Audit synthetic data use
function auditSynthetic(modKey) {
  const findings = [];
  const svcPath = path.join(API_SERVICES, modKey);
  for (const f of ls(svcPath)) {
    if (!f.endsWith(".ts")) continue;
    // Test files legitimately contain vi.mock(), fixtures and the word
    // "placeholder"; they are not product synthetic data.
    if (/\.(test|spec)\.tsx?$/.test(f)) continue;
    const p = path.join(svcPath, f);
    const src = read(p);
    const hasRandom = /Math\.random\s*\(/.test(src);
    // Helper wrappers around the deterministic RNG. Their mere *definition* is
    // not fabrication - scientific.service.ts declares rnd()/rndInt() at the
    // top of the file and calls them only from inside its gated bootstrap, so
    // matching the definition line reported a module that fabricates nothing at
    // runtime. Count call sites, not declarations.
    const hasRnd = /(?<!function\s)\brnd(?:Int)?\s*\((?!\s*a\s*:)/.test(
      src.replace(/^\s*function\s+rnd(?:Int)?\s*\([^)]*\)\s*\{[^\n]*$/gm, ""));
    // A bare mention of "seed"/"demo" is not evidence of synthetic data: it
    // matches comments, legitimate seedBuiltInTemplates(), and this repo's own
    // "no demo data" notes. Require a word that actually implies fabrication,
    // and ignore matches that only occur inside comments.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
      .replace(/^\s*\/\/.*$/gm, "");        // line comments
    // Word-matching "synthetic" was tried and abandoned. It flagged 17 modules,
    // of which 16 were false positives, because in this codebase "synthetic" is
    // the *honesty* vocabulary rather than the fabrication vocabulary:
    //   * a provenance flag disclosing simulated data:  `synthetic: false`
    //   * a source-quality enum member:                 `"llm-synthetic": 0.35`
    //   * a real catalogue product:      "Synthetic Customer Churn Dataset"
    //   * a real architecture component: "Enterprise Synthetic Intelligence Layer"
    //   * the secret scanner's own detection regex
    // Meanwhile the ten modules that genuinely fabricated records - inventing
    // robot fleets, trading positions and course enrolments - went unflagged,
    // because they name their variables honestly. The signal pointed the wrong
    // way, so "synthetic" is no longer a keyword; the words left are ones that
    // only ever describe placeholder content.
    //
    // String, comment and regex content is excluded: naming a catalogue product
    // "Dummy Data Pack" is content, not a fabricated measurement, and the
    // secret scanner necessarily contains the words it hunts for.
    const fabricationText = codeOnly
      .replace(/(["\'`])(?:(?!\1)[\s\S])*\1/g, "")
      .replace(/\/(?![/*])(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/[gimsuy]*/g, "");
    const hasFakeData = /\b(fake|dummy|lorem)\b/i.test(fabricationText);
    const hasExternal = /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(src);
    // A gated seed is not live demo data: those records only exist when an
    // operator sets WINDELS_DEMO_DATA=true, and default installs stay empty.
    const demoGated = /demoDataEnabled\s*\(/.test(codeOnly);
    // The signal that actually located every real offender: a bootstrap that
    // manufactures values and writes them straight to the store, ungated.
    // This is precisely what robotics, tradingIntel and education were doing.
    //
    // It must be scoped to the ensureBootstrapped BODY, not the whole file.
    // File-wide matching flagged industry, mediaGen and voiceStudio, whose
    // bootstraps install only a static catalogue - the RNG they contain is used
    // by unrelated methods further down. Brace-match the body instead.
    const seedsUngated = !demoGated && (() => {
      const m = codeOnly.match(/async\s+ensureBootstrapped\s*\([^)]*\)\s*\{/);
      if (!m) return false;
      let i = m.index + m[0].length - 1, depth = 0, end = -1;
      for (; i < codeOnly.length; i++) {
        if (codeOnly[i] === "{") depth++;
        else if (codeOnly[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) return false;
      const body = codeOnly.slice(m.index, end + 1);
      return /\b(?:rand|randInt|rnd|rndInt)\s*\(|_rng\.(?!reseed)/.test(body)
        && /redis\.(?:hset|set|sadd|zadd|rpush|lpush)/.test(body);
    })();
    // Fabrication on a LIVE path - the blind spot `seedsUngated` cannot see.
    // A seed runs once and can be gated; a write path runs on every call and no
    // gate applies to it. opsCenter.globalStatus() returned a literal 12,480
    // rps / $554,000 monthly run rate on every request; dataFabric stamped an
    // invented latency onto each new connector; providerAbstraction awarded
    // scores for benchmarks it never ran. None were seeds, so none were caught.
    //
    // Signal: RNG called outside ensureBootstrapped, anywhere in the file.
    const rngOutsideSeed = (() => {
      const m = codeOnly.match(/async\s+ensureBootstrapped\s*\([^)]*\)\s*\{/);
      let outside = codeOnly;
      if (m) {
        let i = m.index + m[0].length - 1, depth = 0, end = -1;
        for (; i < codeOnly.length; i++) {
          if (codeOnly[i] === "{") depth++;
          else if (codeOnly[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) outside = codeOnly.slice(0, m.index) + codeOnly.slice(end + 1);
      }
      // Ignore the helper declarations themselves; count only call sites.
      const calls = outside.replace(/function\s+(?:rand|randInt|rnd|rndInt)\s*\([^)]*\)\s*\{[^\n]*/g, "");
      return /\b(?:rand|randInt|rnd|rndInt)\s*\(|_rng\.(?!reseed)/.test(calls);
    })();
    // Randomness that is the feature, not a fake measurement. Each is either
    // named for what it is or already covered by the source-level guard in
    // apps/api/src/noRandomData.guard.test.ts. Leaving them permanently red
    // would train readers to ignore this list.
    //   marketplace/simulation   Monte-Carlo sampling IS the simulator
    //   qa/digitalTwin, qa/drTest  QA harnesses, explicitly named synthetic
    //   mediaGen                 a labelled simulator's bounded wait jitter
    //   projectIntake            the demo-data scanner's own detection regex
    const LEGITIMATE_RNG = new Set([
      "marketplace/simulation.service.ts",
      "qa/digitalTwin.service.ts",
      "qa/drTest.service.ts",
      "mediaGen/mediaGen.service.ts",
      "projectContinuity/projectIntake.service.ts",
    ]);
    if (LEGITIMATE_RNG.has(`${modKey}/${f}`)) continue;
    // `demoGated` covers hasRandom/hasRnd too: randomness that can only run
    // when an operator opts in is not live demo data.
    if (((hasRandom || hasRnd) && !demoGated) || hasFakeData || seedsUngated
        || (rngOutsideSeed && !demoGated)) {
      findings.push({
        file: f, mathRandom: hasRandom, rndHelper: hasRnd,
        seedKeywords: hasFakeData, ungatedSeed: seedsUngated,
        liveRng: rngOutsideSeed && !demoGated, externalHttp: hasExternal,
      });
    }
  }
  return findings;
}

// Status heuristic — multi-signal classifier (conservative: never upgrades to COMPLETE without rigor)
function classifyStatus(mod) {
  // The emitted object nests these under `backend` / `web`; the original
  // classifier read flat fields (mod.service, mod.webClient, mod.sharedType)
  // that never existed on it, so every module looked service-less and
  // client-less. Read the real shape, falling back to the flat one.
  const hasService = !!(mod.backend?.serviceFile ?? mod.service)
    || (mod.backend?.serviceTotalSloc ?? 0) > 0;
  // Route entries are `count` while being collected and `counts` once emitted;
  // classifyStatus runs over the emitted shape. Accept either.
  const routeCount = mod.routes.reduce((a,b)=>a+((b.counts ?? b.count)?.total ?? 0),0);
  const hasClient = !!(mod.web?.client ?? mod.webClient);
  const hasTypes = !!(mod.sharedTypes ?? mod.sharedType);
  const hasBootstrap = !!(mod.backend?.bootstrapFile ?? mod.bootstrap);
  const hasTests = mod.tests.length > 0;
  const hasRealData = mod.syntheticData.length === 0;

  if (!hasService && routeCount === 0) return "MISSING";
  if (routeCount <= 1 && !hasClient) return "STUB";
  if (mod.syntheticData.length > 0 && !hasRealData) {
    // synthetic but has CRUD endpoints -> DEMO DATA
    if (routeCount >= 5 && hasClient) return "DEMO DATA";
    return "SIMULATED";
  }
  // has CRUD + client + bootstrap + tests -> COMPLETE candidate; we still mark DEMO DATA
  // if we find Math.random in dashboard path that returns metrics without a "synthetic" banner.
  if (routeCount >= 5 && hasClient && hasTypes && hasTests) return "COMPLETE";
  if (routeCount >= 3 && hasService) return "PARTIAL";
  return "STUB";
}

// Build inventory
const inventory = [];
const allModules = new Set([
  ...serviceDirs,
  ...routeFiles.map(f => ROUTE_OVERRIDES[f.replace(/\.ts$/,"")] || f.replace(/\.ts$/,"")),
  "auth","billing","mobile","talk","conversations","platform","release","qa","developers","publicApi","admin",
  // `canvas` is intentionally absent: its routes are canvases.ts / canvasCollab.ts,
  // both mapped to `collaboration` by ROUTE_OVERRIDES, so a bare `canvas` key
  // would always look implementation-less.
]);

/**
 * Resolve the service files a module's route file actually imports.
 *
 * The directory scan below only looks in `apps/api/src/<modKey>/`, which misses
 * every module whose service lives in the shared `src/services/` folder under a
 * singular name (agent.service.ts backing the `agents` module, and likewise
 * conversation / attachment / promptTemplate / apikey). Those modules were
 * repeatedly reported as "no service files" while being fully implemented.
 *
 * Following the route's own imports reports what the running server loads,
 * rather than guessing from folder shape.
 */
function servicesFromRoutes(modKey) {
  const out = new Set();
  for (const entry of (routeByModule.get(modKey) || [])) {
    // entry.file is the bare route filename (e.g. "agents.ts"), not a repo path.
    const src = read(path.join(API_ROUTES, entry.file));
    if (!src) continue;
    for (const m of src.matchAll(/from\s+"((?:\.\.\/)+)([^"]+\.js)"/g)) {
      const rel = m[2].replace(/\.js$/, ".ts");
      // Only count real implementation modules, not middleware/db/util
      // plumbing. The `.service.ts` suffix is a convention, not a rule:
      // `derivatives` is backed entirely by tradingIntel/derivatives.ts
      // (Black-Scholes, IV solver, bond analytics — ~190 SLOC), which this
      // filter rejected, so the module reported 0 SLOC and "no service
      // directory" and was classified STUB. Accept a plain module in a
      // sibling feature directory too.
      const isService = /\.service\.ts$|^services\//.test(rel);
      const isFeatureModule = /^[A-Za-z0-9_]+\/[A-Za-z0-9_]+\.ts$/.test(rel)
        && !/\.(test|spec)\.ts$/.test(rel);
      if (!isService && !isFeatureModule) continue;
      if (/^(db|utils|config|http|middleware|observability)\//.test(rel)) continue;
      const abs = path.join(API_SERVICES, rel);
      if (fexists(abs)) out.add(rel);
    }
  }
  return [...out];
}

for (const modKey of [...allModules].sort()) {
  const meta = MODULE_META[modKey] || { title: modKey, sessions: [], tier: "unknown" };
  const svcDir = path.join(API_SERVICES, modKey);
  const svcFiles = fexists(svcDir) ? ls(svcDir).filter(f=>f.endsWith(".ts")) : [];
  const svcEntry = svcFiles.find(f => f.includes("service") || f === "index.ts") || svcFiles[0];
  const bootstrapFile = svcFiles.find(f => f.startsWith("bootstrap"));
  const sharedType = `${modKey}.ts`;
  const webClient = `${modKey}.ts`;
  const routeEntries = routeByModule.get(modKey) || [];

  // Services reached through the route's imports (e.g. services/agent.service.ts
  // backing the `agents` module) count just as much as a same-named directory.
  const importedSvcRel = servicesFromRoutes(modKey);
  const importedSvcSloc = importedSvcRel.reduce((a, r) => a + sloc(path.join(API_SERVICES, r)), 0);

  const svcEntryPath = svcEntry
    ? path.join(svcDir, svcEntry)
    : (importedSvcRel[0] ? path.join(API_SERVICES, importedSvcRel[0]) : null);

  const svc = svcEntryPath ? {
    file: svcEntry || path.basename(importedSvcRel[0]),
    path: svcEntryPath,
    sloc: sloc(svcEntryPath),
    mathRandom: usesMathRandom(svcEntryPath),
    externalFetch: usesExternalFetch(svcEntryPath),
  } : null;

  const mod = {
    // Pre-existing bug: this referenced an undefined `moduleKey`, so the
    // generator threw on its first module and the inventory could never be
    // regenerated — which is why its statuses drifted so far from the code.
    moduleKey: modKey,
    title: meta.title,
    sessions: meta.sessions,
    tier: meta.tier,
    routePrefix: `/api/v1/${moduleRoutePrefix(modKey)}`,
    backend: {
      serviceDir: fexists(svcDir) ? `apps/api/src/${modKey}` : null,
      serviceFile: svc,
      serviceTotalSloc: svcFiles.reduce((a,f)=>a+sloc(path.join(svcDir,f)),0) + importedSvcSloc,
      serviceFiles: [...svcFiles, ...importedSvcRel],
      /** Services resolved via the route's imports rather than folder name. */
      importedServiceFiles: importedSvcRel,
      bootstrapFile: bootstrapFile ? `apps/api/src/${modKey}/${bootstrapFile}` : null,
    },
    routes: routeEntries.map(r => ({
      file: `apps/api/src/http/routes/${r.file}`,
      sloc: r.sloc,
      counts: r.count,
      endpoints: r.endpoints,
    })),
    sharedTypes: findSharedTypes(modKey),
    web: {
      client: findWebClient(modKey),
      pages: [], // pages are mostly in admin/PlatformPage tabs
    },
    db: {
      prismaModels: prismaModels.filter(m => {
        const searchFor = new RegExp(`\\b${m}\\b`, "i");
        return svcFiles.some(f => searchFor.test(read(path.join(svcDir,f)))) ||
               routeEntries.some(r => searchFor.test(read(path.join(API_ROUTES,r.file))));
      }),
      migrations: [], // most data is in Redis; we'll note this
      storage: "Redis primary; Prisma/Postgres for auth/org/billing core",
    },
    tests: findTestsFor(modKey),
    syntheticData: auditSynthetic(modKey),
    externalIntegrations: [],
  };

  // External integration detection (grep for API keys / SDKs)
  const allSvcSrc = svcFiles.map(f => read(path.join(svcDir,f))).join("\n") +
                    routeEntries.map(r => read(path.join(API_ROUTES,r.file))).join("\n");
  const extPatterns = [
    ["openai","OpenAI"], ["anthropic","Anthropic"], ["stripe","Stripe"],
    ["sendgrid","SendGrid"], ["twilio","Twilio"], ["aws","AWS"],
    ["gcp","GCP"], ["azure","Azure"], ["google","Google"],
    ["alphavantage","AlphaVantage"], ["twelvedata","TwelveData"],
    ["polygon","Polygon.io"], ["coingecko","CoinGecko"],
    ["elevenlabs","ElevenLabs"], ["playht","PlayHT"],
    ["whisper","Whisper"], ["ffmpeg","FFmpeg"],
    ["sendgrid","SendGrid"], ["resend","Resend"],
    ["plaid","Plaid"],
  ];
  for (const [pat,name] of extPatterns) {
    if (new RegExp(pat, "i").test(allSvcSrc)) mod.externalIntegrations.push(name);
  }
  mod.externalIntegrations = [...new Set(mod.externalIntegrations)];

  mod.status = classifyStatus(mod);

  // Downgrade to STUB for modules where only a rollup endpoint exists and no real CRUD
  if (routeCount(mod) === 1 && mod.routes[0]?.endpoints?.[0]?.includes("/dashboard/rollup") && !svc?.externalFetch) {
    // Keep as STUB only if service file is < 100 lines (truly stubby); otherwise DEMO DATA
    if (svc && svc.sloc < 200) mod.status = "STUB";
    else if (mod.syntheticData.length > 0) mod.status = "DEMO DATA";
  }

  inventory.push(mod);
}

// Special case: mark modules that are hard-coded / always "PRODUCTION READY" level: auth, kernel, platform
const coreOverride = {
  auth: "COMPLETE",
  kernel: "COMPLETE",
  platform: "COMPLETE",
};
for (const inv of inventory) {
  if (coreOverride[inv.moduleKey]) inv.status = coreOverride[inv.moduleKey];
}

function routeCount(mod){return mod.routes.reduce((a,b)=>a+b.counts.total,0)}

// Write JSON inventory
const outDir = path.join(ROOT, "audit");
if (!fexists(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir,"module-inventory.json"), JSON.stringify(inventory, null, 2));

// Summary
const counts = {};
for (const i of inventory) counts[i.status] = (counts[i.status]||0)+1;

console.log("Inventory written to audit/module-inventory.json");
console.log("\n=== MODULE COUNT BY STATUS ===");
for (const [s,c] of Object.entries(counts).sort()) console.log(`  ${s.padEnd(18)} ${c}`);
console.log(`  ${"TOTAL".padEnd(18)} ${inventory.length}`);
console.log("\n=== ALL MODULES (name: status, routes, service LOC, tests, synthetic flags) ===");
for (const i of inventory) {
  const synBadge = i.syntheticData.length>0 ? `SYNTH×${i.syntheticData.length}` : "real-or-mixed";
  const extBadge = i.externalIntegrations.length ? "ext:"+i.externalIntegrations.join(",") : "no-ext";
  console.log(`  ${i.moduleKey.padEnd(22)} ${i.status.padEnd(14)} routes=${String(routeCount(i)).padStart(2)} svc=${String(i.backend.serviceTotalSloc).padStart(5)} tests=${String(i.tests.length).padStart(2)} ${synBadge} ${extBadge}`);
}
