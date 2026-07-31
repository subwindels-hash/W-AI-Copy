#!/usr/bin/env node
// Simplified inventory script - runs in CJS
const fs = require("fs");
const path = require("path");
const ROOT = "/home/user/windels";
const API_ROUTES = path.join(ROOT, "apps/api/src/http/routes");
const API_SERVICES = path.join(ROOT, "apps/api/src");
const SHARED = path.join(ROOT, "packages/shared/src");
const WEB_LIB = path.join(ROOT, "apps/web/src/lib");
const TESTS = path.join(ROOT, "tests/e2e");
const PRISMA_FILE = path.join(ROOT, "apps/api/prisma/schema.prisma");

function ls(dir){ try{return fs.readdirSync(dir)}catch(e){return[]} }
function read(p){ try{return fs.readFileSync(p,"utf8")}catch(e){return""} }
function exists(p){try{return fs.existsSync(p)}catch(e){return false} }
function sloc(p){return read(p).split("\n").length}

// Parse prisma models
const prismaSrc = read(PRISMA_FILE);
const prismaModels = [...prismaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m=>m[1]);

// Route overrides (file basename -> module key)
const ROUTE_OVERRIDES = {
  admin:"admin", agentComm:"agentComm", agentKnowledge:"agentComm",
  agentMemories:"agentComm", agents:"agents", ai:"kernel",
  architecture:"architecture", attachments:"attachments", auth:"auth",
  autonomous:"autonomous", benchmarks:"benchmarks", billing:"billing",
  biomedical:"biomedical", canvases:"collaboration", cognitive:"cognitive",
  collaboration:"collaboration", command:"command", composer:"composer",
  constitution:"constitution", conversations:"conversations",
  coreIntegration:"coreIntegration", cryptoIntelligence:"cryptoIntelligence",
  cyber:"cyber", dataMarketplace:"dataMarketplace", dataPlatform:"dataMarketplace",
  deployment:"deployment", devPortal:"devportal", developers:"developers",
  digitalHumans:"digitalHumans", disasterRecovery:"disasterRecovery",
  education:"education", engineering:"engineering", enterprise:"enterprise",
  enterpriseFoundation:"enterpriseFoundation", expertsPlatform:"expertsPlatform",
  extensions:"extensions", fabric:"fabric", giftCards:"giftCards",
  globalCurrency:"globalCurrency", governance:"governance",
  health:"healthEcosystem", healthEcosystem:"healthEcosystem",
  hybridExec:"hybridExec", industry:"industry", infrastructure:"infrastructure",
  kernel:"kernel", legal:"legal", licensing:"licensing",
  marketplace:"marketplace", mediaFactory:"mediaFactory", mediaGen:"mediaGen",
  memoryEvolution:"memoryEvolution", me:"auth", messages:"conversations",
  mlOps:"mlOps", mobile:"mobile", modelFactory:"modelFactory",
  opex:"opex", platform:"platform", platformServices:"platformServices",
  profile:"auth", program:"program", promptTemplates:"promptTemplates",
  publicApi:"publicApi", qa:"qa", quantum:"quantum", release:"release",
  robotics:"robotics", scientific:"scientific", sdk:"sdk",
  selfHosted:"selfHosted", spatial:"spatial", sustainability:"sustainability",
  talk:"talk", tradingIntel:"tradingIntel", training:"training",
  updates:"updates", usage:"usage", uxIntelligence:"uxIntelligence",
  v76validation:"v76validation", voiceFoundry:"voiceFoundry",
  voiceOwnership:"voiceOwnership", voiceStudio:"voiceStudio",
  wakeIntel:"wakeIntel", workflows:"composer", workspace:"collaboration",
};
const MODULE_META = {
  auth:{title:"Auth & Sessions",sessions:[1,13,14],tier:"core"},
  agents:{title:"Agent Framework",sessions:[7,8],tier:"core"},
  conversations:{title:"Conversations/Messaging",sessions:[2,3,4],tier:"core"},
  attachments:{title:"Message Attachments",sessions:[4],tier:"support"},
  talk:{title:"Talk / Voice Channels",sessions:[5,6],tier:"core"},
  billing:{title:"Billing & Subscriptions",sessions:[20],tier:"support"},
  mobile:{title:"Mobile PWA",sessions:[21],tier:"core"},
  canvas:{title:"Canvas Collab",sessions:[22],tier:"core"},
  collaboration:{title:"Collaboration Primitives",sessions:[22],tier:"core"},
  agentComm:{title:"Agent Communication",sessions:[],tier:"core"},
  promptTemplates:{title:"Prompt Template Library",sessions:[23],tier:"support"},
  program:{title:"Program Mgmt (S25)",sessions:[25],tier:"platform"},
  engineering:{title:"Engineering/Observability (S26)",sessions:[26],tier:"platform"},
  devportal:{title:"Developer Portal (S27)",sessions:[27],tier:"platform"},
  developers:{title:"Developers Public Pages",sessions:[],tier:"support"},
  publicApi:{title:"Public API",sessions:[],tier:"platform"},
  architecture:{title:"Architecture ESI (S37)",sessions:[37],tier:"platform"},
  selfHosted:{title:"Self-Hosted Inference (S38)",sessions:[38],tier:"platform"},
  kernel:{title:"AI Kernel (S39)",sessions:[39],tier:"core"},
  voiceStudio:{title:"Voice Studio (S40)",sessions:[40],tier:"feature"},
  voiceFoundry:{title:"Voice Foundry (S41)",sessions:[41],tier:"feature"},
  mediaGen:{title:"Media Generation (S42)",sessions:[42],tier:"feature"},
  hybridExec:{title:"Hybrid Execution (S43)",sessions:[43],tier:"platform"},
  voiceOwnership:{title:"Voice Ownership/Consent (S44)",sessions:[44],tier:"platform"},
  coreIntegration:{title:"Core Integration (S45)",sessions:[45],tier:"platform"},
  modelFactory:{title:"Model Factory (S46)",sessions:[46],tier:"platform"},
  memoryEvolution:{title:"Memory Evolution (S47)",sessions:[47],tier:"core"},
  constitution:{title:"Constitution",sessions:[48],tier:"platform"},
  governance:{title:"Governance Engine",sessions:[48,73],tier:"platform"},
  composer:{title:"Composer/Workflows",sessions:[49],tier:"feature"},
  benchmarks:{title:"Benchmarks (S50)",sessions:[50],tier:"platform"},
  licensing:{title:"Licensing (S51)",sessions:[51],tier:"platform"},
  deployment:{title:"Deployment (S52)",sessions:[52],tier:"platform"},
  disasterRecovery:{title:"DR/BCP (S53)",sessions:[53],tier:"platform"},
  updates:{title:"OTA Updates (S54)",sessions:[54],tier:"platform"},
  usage:{title:"Usage Intel (S55)",sessions:[55],tier:"platform"},
  fabric:{title:"Intelligence Fabric (S56)",sessions:[56],tier:"platform"},
  robotics:{title:"Robotics (S57)",sessions:[57],tier:"feature"},
  spatial:{title:"Spatial (S58)",sessions:[58],tier:"feature"},
  sdk:{title:"SDK (S59)",sessions:[59],tier:"platform"},
  training:{title:"Training/LoRA (S60)",sessions:[60],tier:"feature"},
  dataMarketplace:{title:"Data Marketplace (S61)",sessions:[61],tier:"feature"},
  digitalHumans:{title:"Digital Humans (S62)",sessions:[62],tier:"feature"},
  quantum:{title:"Quantum (S63)",sessions:[63],tier:"feature"},
  sustainability:{title:"Sustainability/ESG (S64)",sessions:[64],tier:"feature"},
  biomedical:{title:"Biomedical (S65)",sessions:[65],tier:"feature"},
  legal:{title:"Legal Research (S66)",sessions:[66],tier:"feature"},
  education:{title:"Education (S67)",sessions:[67],tier:"feature"},
  scientific:{title:"Scientific Research (S68)",sessions:[68],tier:"feature"},
  cognitive:{title:"Cognitive/World (S69)",sessions:[69],tier:"feature"},
  command:{title:"Command Center (S70)",sessions:[70],tier:"platform"},
  aiEconomy:{title:"AI Economy/GPU (S71)",sessions:[71],tier:"feature"},
  autonomous:{title:"Autonomous Org (S72)",sessions:[72],tier:"feature"},
  opex:{title:"OpEx/Trust/Safety (S73)",sessions:[73],tier:"platform"},
  industry:{title:"Industry Packs (S74)",sessions:[74],tier:"feature"},
  healthEcosystem:{title:"Health V10 (S75)",sessions:[75],tier:"feature"},
  v76validation:{title:"S76 Validation",sessions:[76],tier:"platform"},
  expertsPlatform:{title:"Experts (S77a)",sessions:[77],tier:"feature"},
  mediaFactory:{title:"Media Factory (S77b)",sessions:[77],tier:"feature"},
  uxIntelligence:{title:"UX Intel (S78)",sessions:[78],tier:"platform"},
  giftCards:{title:"Gift Cards WMPC (S79)",sessions:[79],tier:"feature"},
  globalCurrency:{title:"Global Currency (S80)",sessions:[80],tier:"feature"},
  tradingIntel:{title:"Trading Intel (S81)",sessions:[81],tier:"feature"},
  cyber:{title:"Cyber Academy (S82)",sessions:[82],tier:"feature"},
  platform:{title:"Platform Admin Shell",sessions:[],tier:"core"},
  platformServices:{title:"Platform Services",sessions:[],tier:"platform"},
  release:{title:"Release Pipeline",sessions:[],tier:"platform"},
  qa:{title:"QA Engine",sessions:[],tier:"platform"},
  mlOps:{title:"ML Ops",sessions:[],tier:"platform"},
  marketplace:{title:"Plugin Marketplace",sessions:[],tier:"feature"},
  extensions:{title:"Plugin System",sessions:[],tier:"platform"},
  aiEcosystem:{title:"AI Ecosystem",sessions:[],tier:"feature"},
  enterprise:{title:"Enterprise Dashboard",sessions:[],tier:"feature"},
  enterpriseFoundation:{title:"Enterprise Foundation",sessions:[],tier:"platform"},
  wakeIntel:{title:"Wake-word Intel",sessions:[],tier:"feature"},
  cryptoIntelligence:{title:"Crypto Intel (S35)",sessions:[35],tier:"feature"},
  admin:{title:"Admin Utilities",sessions:[],tier:"support"},
  infrastructure:{title:"Infrastructure Monitoring",sessions:[],tier:"platform"},
};

const ROUTE_PREFIX = {
  healthEcosystem:"health-ecosystem", v76validation:"validation",
  expertsPlatform:"experts", giftCards:"gift-cards", globalCurrency:"global-currency",
  tradingIntel:"trading-intel", digitalHumans:"digital-humans",
  dataMarketplace:"data-marketplace", disasterRecovery:"disaster-recovery",
  coreIntegration:"core-integration", memoryEvolution:"memory-evolution",
  platformServices:"platform-services", aiEcosystem:"ai-ecosystem",
  aiEconomy:"ai-economy", enterpriseFoundation:"enterprise-foundation",
  mediaFactory:"media-factory", uxIntelligence:"ux-intelligence",
  voiceFoundry:"voice-foundry", voiceOwnership:"voice-ownership",
  voiceStudio:"voice-studio", wakeIntel:"wake-intel",
  mlOps:"ml-ops", cyber:"cyber", biomedical:"biomedical",
  hybridExec:"hybrid-execution", mediaGen:"media-generation",
  selfHosted:"self-hosted", devportal:"dev-portal",
};
function routePrefixFor(k){ return ROUTE_PREFIX[k]||k }

// Parse a route file's endpoints
function parseRoutes(file){
  const src = read(file);
  const counts = {GET:0,POST:0,PUT:0,PATCH:0,DELETE:0};
  const endpoints = [];
  const re = /router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while((m=re.exec(src))){
    counts[m[1].toUpperCase()]++;
    endpoints.push(m[1].toUpperCase()+" "+m[2]);
  }
  counts.total = counts.GET+counts.POST+counts.PUT+counts.PATCH+counts.DELETE;
  return {counts, endpoints};
}

// Build route map
const routeByModule = new Map();
for(const f of ls(API_ROUTES)){
  if(!f.endsWith(".ts")) continue;
  const base = f.replace(/\.ts$/,"");
  const mod = ROUTE_OVERRIDES[base] || base;
  if(!routeByModule.has(mod)) routeByModule.set(mod, []);
  const pr = parseRoutes(path.join(API_ROUTES,f));
  routeByModule.get(mod).push({file:f, sloc:sloc(path.join(API_ROUTES,f)), ...pr});
}

// Service dirs
const INFRA = new Set(["db","http","utils","services","config","observability","security"]);
const serviceDirs = ls(API_SERVICES).filter(n=>{
  const p=path.join(API_SERVICES,n);
  try{return fs.statSync(p).isDirectory()&&!INFRA.has(n)}catch(e){return false}
});

// Test finder
function findTests(modKey){
  const tests=[];
  const prefix = "/api/v1/"+routePrefixFor(modKey);
  for(const f of ls(TESTS)){
    if(!f.endsWith(".spec.ts")) continue;
    const p = path.join(TESTS,f);
    const src = read(p);
    if(src.includes(prefix) || src.includes(`from "@/lib/${modKey}`) ||
       src.includes(`${modKey}Api`) || src.includes(`${modKey}.service`) ||
       src.includes(`"${modKey}"`) || src.includes(`'${modKey}'`)){
      tests.push(f);
    }
  }
  return [...new Set(tests)];
}

// Synthetic data audit
function auditSynthetic(modKey){
  const svcDir = path.join(API_SERVICES,modKey);
  const findings=[];
  if(!exists(svcDir)) return findings;
  for(const f of ls(svcDir)){
    if(!f.endsWith(".ts")) continue;
    const p = path.join(svcDir,f);
    const src = read(p);
    const hasRandom = /Math\.random\s*\(/.test(src);
    const hasRnd = /\brnd\s*\(|\brndInt\s*\(/.test(src);
    const hasSeedKw = /seed|demo|sample|synthetic|placeholder|fixture/i.test(src);
    if(hasRandom || hasRnd || hasSeedKw){
      findings.push({file:f, mathRandom:hasRandom, rndHelper:hasRnd, seedKeywords:hasSeedKw});
    }
  }
  return findings;
}

// External integrations
function findExt(modKey, routeFiles){
  const srcs = [];
  const svcDir = path.join(API_SERVICES,modKey);
  if(exists(svcDir)) for(const f of ls(svcDir)) if(f.endsWith(".ts")) srcs.push(read(path.join(svcDir,f)));
  for(const r of routeFiles||[]) srcs.push(read(path.join(API_ROUTES,r.file)));
  const src = srcs.join("\n");
  const exts=[];
  const pats = [
    ["openai","OpenAI"],["anthropic","Anthropic"],["stripe","Stripe"],
    ["sendgrid","SendGrid"],["twilio","Twilio"],["aws","AWS"],
    ["gcp","GCP"],["azure","Azure"],["google","Google"],
    ["alphavantage","AlphaVantage"],["twelvedata","TwelveData"],
    ["polygon","Polygon.io"],["coingecko","CoinGecko"],
    ["elevenlabs","ElevenLabs"],["playht","Play.ht"],
    ["whisper","Whisper"],["ffmpeg","FFmpeg"],
    ["resend","Resend"],["plaid","Plaid"],
    ["yfinance","Yahoo Finance"],["iex","IEX Cloud"],
  ];
  for(const [pat,name] of pats) if(new RegExp(pat,"i").test(src)) exts.push(name);
  return [...new Set(exts)];
}

// Conservative status classifier
function classify(mod){
  const routeTotal = mod.routes.reduce((a,b)=>a+b.counts.total,0);
  const hasClient = !!mod.webClient;
  const hasTypes = !!mod.sharedTypes;
  const hasBootstrap = !!mod.backend.bootstrapFile;
  const hasService = mod.backend.serviceTotalSloc > 0;
  const hasTests = mod.tests.length > 0;
  const hasSynthetic = mod.syntheticData.length > 0;
  const svcSloc = mod.backend.serviceTotalSloc;

  if (!hasService && routeTotal === 0) return "MISSING";

  // Core auth/kernel/platform are truly production-like
  if (["auth","kernel","platform"].includes(mod.moduleKey)) return "COMPLETE";

  // Single-endpoint rollup with tiny service = STUB
  if (routeTotal === 1 && svcSloc < 200) return "STUB";
  // Single-endpoint rollup but bigger service with lots of seeded data = DEMO DATA
  if (routeTotal <= 2 && hasSynthetic && !hasClient) return "STUB";
  if (routeTotal <= 2 && hasClient) return hasSynthetic ? "DEMO DATA" : "PARTIAL";
  // Has CRUD routes + client + types but mostly synthetic = DEMO DATA
  if (routeTotal >= 5 && hasClient && hasTypes && hasSynthetic) return "DEMO DATA";
  if (routeTotal >= 5 && hasClient && hasTypes && hasTests && !hasSynthetic) return "COMPLETE";
  if (routeTotal >= 3 && hasService) return "PARTIAL";
  return "STUB";
}

// Build all module keys
const allModules = new Set();
serviceDirs.forEach(m=>allModules.add(m));
for(const f of ls(API_ROUTES)){
  if(!f.endsWith(".ts")) continue;
  const b=f.replace(/\.ts$/,"");
  allModules.add(ROUTE_OVERRIDES[b]||b);
}
["billing","mobile","canvas","platform","release","qa","developers","publicApi","admin","collaboration","agents","conversations","talk","attachments","agentComm","promptTemplates","enterprise","enterpriseFoundation","aiEcosystem","wakeIntel","cryptoIntelligence"].forEach(m=>allModules.add(m));

const inventory=[];
for(const modKey of [...allModules].sort()){
  const meta = MODULE_META[modKey] || {title:modKey,sessions:[],tier:"unknown"};
  const svcDir = path.join(API_SERVICES,modKey);
  const svcFiles = exists(svcDir) ? ls(svcDir).filter(f=>f.endsWith(".ts")) : [];
  const svcEntry = svcFiles.find(f=>f.includes("service")||f==="index.ts") || svcFiles[0];
  const bootstrapFile = svcFiles.find(f=>f.startsWith("bootstrap"));
  const svcSloc = svcFiles.reduce((a,f)=>a+sloc(path.join(svcDir,f)),0);
  const routes = routeByModule.get(modKey)||[];

  const mod = {
    moduleKey: modKey,
    title: meta.title,
    sessions: meta.sessions,
    tier: meta.tier,
    routePrefix: "/api/v1/"+routePrefixFor(modKey),
    backend: {
      serviceDir: exists(svcDir) ? `apps/api/src/${modKey}` : null,
      serviceFile: svcEntry ? `apps/api/src/${modKey}/${svcEntry}` : null,
      serviceEntrySloc: svcEntry ? sloc(path.join(svcDir,svcEntry)) : 0,
      serviceTotalSloc: svcSloc,
      serviceFiles: svcFiles,
      bootstrapFile: bootstrapFile ? `apps/api/src/${modKey}/${bootstrapFile}` : null,
    },
    routes: routes.map(r=>({
      file: `apps/api/src/http/routes/${r.file}`,
      sloc: r.sloc,
      counts: r.counts,
      endpoints: r.endpoints,
    })),
    sharedTypes: exists(path.join(SHARED, modKey+".ts")) ? { file:`packages/shared/src/${modKey}.ts`, sloc: sloc(path.join(SHARED, modKey+".ts")) } : null,
    webClient: exists(path.join(WEB_LIB, modKey+".ts")) ? { file:`apps/web/src/lib/${modKey}.ts`, sloc: sloc(path.join(WEB_LIB, modKey+".ts")) } : null,
    db: {
      storage: "Redis primary + Prisma for auth/org/billing core",
      prismaModelsTouched: prismaModels.filter(mname=>{
        const rx = new RegExp("\\b"+mname+"\\b","i");
        return svcFiles.some(f=>rx.test(read(path.join(svcDir,f)))) ||
               routes.some(r=>rx.test(read(path.join(API_ROUTES,r.file))));
      }),
    },
    tests: findTests(modKey),
    syntheticData: auditSynthetic(modKey),
    externalIntegrations: findExt(modKey, routes),
  };
  mod.status = classify(mod);
  inventory.push(mod);
}

// Write output
const outDir = path.join(ROOT,"audit");
if(!exists(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir,"module-inventory.json"), JSON.stringify(inventory,null,2));

// Summary
const counts = {};
for(const i of inventory) counts[i.status]=(counts[i.status]||0)+1;
console.log("Inventory written to audit/module-inventory.json");
console.log("\n=== MODULE COUNT BY STATUS ===");
for(const s of ["PRODUCTION READY","COMPLETE","PARTIAL","DEMO DATA","SIMULATED","STUB","MISSING","DISCONNECTED"]) if(counts[s]) console.log(`  ${s.padEnd(20)} ${counts[s]}`);
console.log(`  ${"TOTAL".padEnd(20)} ${inventory.length}`);
console.log("\n=== ALL MODULES ===");
for(const i of inventory){
  const rt = i.routes.reduce((a,b)=>a+b.counts.total,0);
  const syn = i.syntheticData.length ? `SYNTH×${i.syntheticData.length}` : "live";
  const ext = i.externalIntegrations.length ? "ext:"+i.externalIntegrations.join(",") : "";
  console.log(`  ${i.moduleKey.padEnd(22)} ${i.status.padEnd(14)} rt=${String(rt).padStart(2)} svc=${String(i.backend.serviceTotalSloc).padStart(5)} tests=${String(i.tests.length).padStart(2)} ${syn} ${ext}`);
}
