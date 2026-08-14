import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import * as p from "@/lib/platform";
import * as infra from "@/lib/infrastructure";
import * as qa from "@/lib/qa";
import * as gov from "@/lib/govEngineering";
import * as rel from "@/lib/release";
import * as pgm from "@/lib/program";
import * as eng from "@/lib/engineering";
import * as dev from "@/lib/devPortal";
import * as ext from "@/lib/extensions";
import * as psvc from "@/lib/platformServices";
import * as ml from "@/lib/mlOps";
import * as ef from "@/lib/enterpriseFoundation";
import * as cb from "@/lib/collaboration";
import * as aeco from "@/lib/aiEcosystem";
import * as mk from "@/lib/marketplace";
import * as ci from "@/lib/cryptoIntelligence";
import * as wi from "@/lib/wakeIntel";
import * as arch from "@/lib/architecture";
import * as sh from "@/lib/selfHosted";
import * as kr from "@/lib/kernel";
import * as vs from "@/lib/voiceStudio";
import * as ti from "@/lib/tradingIntel";
import * as vf from "@/lib/voiceFoundry";
import * as ep from "@/lib/expertsPlatform";
import * as mf from "@/lib/mediaFactory";
import * as ux from "@/lib/uxIntelligence";
import * as gc from "@/lib/giftCards";
import * as gcu from "@/lib/globalCurrency";
import * as v76 from "@/lib/v76validation";
import * as mg from "@/lib/mediaGen";
import * as hx from "@/lib/hybridExec";
import * as vo from "@/lib/voiceOwnership";
import * as cei from "@/lib/coreIntegration";
import * as mf2 from "@/lib/modelFactory";
import * as me from "@/lib/memoryEvolution";
import * as cst from "@/lib/constitution";
import * as cmp from "@/lib/composer";
import * as bm from "@/lib/benchmarks";
import * as dr from "@/lib/disasterRecovery";
import * as lic from "@/lib/licensing";
import * as dep from "@/lib/deployment";
import * as pcon from "@/lib/projectContinuity";
import * as ldis from "@/lib/leadDiscovery";
import * as etl from "@/lib/etl";
import * as cam from "@/lib/camera";
import * as upd from "@/lib/updates";
import * as usg from "@/lib/usage";
import * as fab from "@/lib/fabric";
import * as rob from "@/lib/robotics";
import * as spa from "@/lib/spatial";
import * as sdk from "@/lib/sdk";
import * as trn from "@/lib/training";
import * as dm from "@/lib/dataMarketplace";
import * as dh from "@/lib/digitalHumans";
import * as q from "@/lib/quantum";
import * as esg from "@/lib/sustainability";
import * as bio from "@/lib/biomedical";
import * as leg from "@/lib/legal";
import * as edu from "@/lib/education";
import * as sci from "@/lib/scientific";
import * as cog from "@/lib/cognitive";
import * as gcc from "@/lib/command";
import * as eco from "@/lib/aiEconomy";
import * as aut from "@/lib/autonomous";
import * as cyb from "@/lib/cyber";
import * as opex from "@/lib/opex";
import * as ind from "@/lib/industry";
import * as hec from "@/lib/healthEcosystem";
import { FolderOpen, Search, Server, Database, Globe, GitBranch, Activity, TrendingDown, Boxes, Container, HardDrive, AlertTriangle, CheckCircle2, XCircle, FlaskConical, Play, Clock, ShieldCheck, Bug, Zap, Scale, BookOpen, GitPullRequest, Package, ShieldAlert, Rocket, Check, X, ThumbsUp, ThumbsDown, Send, ClipboardList, Target, Kanban, FileSearch, DraftingCompass, AlertOctagon, LineChart, Users, Calendar, ChevronRight, TrendingUp, BarChart3, Gauge, GitCommit, Wrench, Timer, Code2, Terminal, Cpu, TestTube2, CloudUpload, Layers, Copy, Puzzle, Briefcase, Building2, Sparkles, Bot, Workflow, LayoutDashboard, Component, Power, Settings, ToggleRight, KeyRound, CreditCard, Network, Library, FileStack, Brain, FileText, Landmark, Key as KeyIcon, DollarSign, HeartPulse, Award, Video, Mic, Monitor, Eye, Languages, Users as UsersIcon, ListChecks, AlertCircle, FileDown, Shield as ShieldIcon, Mic2, Palette, BadgeCheck, ShieldCheck as ShieldCheckIcon, Quote, CircleDot, Speech, UserCircle, Volume2, Store, ShoppingBag, Factory, Cpu as CpuIcon, Download, Coins, Lock, Radio, Hand as HandIcon, Siren, Watch, Smartphone, Wifi, WifiOff, Keyboard, MousePointer2, Wand2, GraduationCap, Clapperboard, Gift, Image as ImageIcon, Music, Film, Server as ServerIcon, UserCheck, Link2, Factory as FactoryIcon, Database as DbIcon, Plus, Cloud, RefreshCw, PieChart, Cog as CogIcon, Bot as BotIcon, Box, Compass, Terminal as TerminalIcon, GraduationCap as GradIcon, Beaker, Bell, Pause, StopCircle, StopCircle as StopIcon, Leaf, Stethoscope, Gavel, School, Atom, Microscope, Globe2 as Globe2Icon, Crown, Wallet, Shield as ShieldLucide, Dumbbell, Pill } from "lucide-react";
const WorkflowIcon = Workflow;

export default function PlatformPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 h-[calc(100vh-56px)] overflow-y-auto">
      <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-100 text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber shrink-0"/>
        <div>
          <div className="font-semibold text-amber">DEMO DATA — Not Connected to Live Providers</div>
          <div className="opacity-90 mt-0.5">
            Most session dashboards display seeded synthetic data generated at bootstrap. Real market data, voice synthesis, media generation,
            FX rates, and biomedical results are not connected to live providers in this build. See <code className="px-1 py-0.5 bg-black/30 rounded">AUDIT-REPORT.md</code> for the honest status.
            Set <code className="px-1 py-0.5 bg-black/30 rounded">OPENAI_API_KEY</code> to enable real LLM responses instead of the Echo fallback.
          </div>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-text-bright">Platform Observability</h1>
        <p className="text-sm text-text-muted mt-1">Multi-region status, metrics, logs, traces, AI observability, CDN, DR/failover, and infrastructure operations.</p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="ai">AI Observability</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
          <TabsTrigger value="cdn">CDN</TabsTrigger>
          <TabsTrigger value="dr">DR &amp; Failover</TabsTrigger>
          <TabsTrigger value="infra"><Server className="h-3.5 w-3.5 mr-1"/>Infrastructure</TabsTrigger>
          <TabsTrigger value="qa"><FlaskConical className="h-3.5 w-3.5 mr-1"/>QA</TabsTrigger>
          <TabsTrigger value="gov"><Scale className="h-3.5 w-3.5 mr-1"/>Governance</TabsTrigger>
          <TabsTrigger value="rel"><Rocket className="h-3.5 w-3.5 mr-1"/>Releases</TabsTrigger>
          <TabsTrigger value="pgm"><ClipboardList className="h-3.5 w-3.5 mr-1"/>Program</TabsTrigger>
          <TabsTrigger value="eng"><BarChart3 className="h-3.5 w-3.5 mr-1"/>Observability</TabsTrigger>
          <TabsTrigger value="dev"><Code2 className="h-3.5 w-3.5 mr-1"/>Dev Portal</TabsTrigger>
          <TabsTrigger value="ext"><Puzzle className="h-3.5 w-3.5 mr-1"/>Extensions</TabsTrigger>
          <TabsTrigger value="psvc"><Settings className="h-3.5 w-3.5 mr-1"/>Platform Svcs</TabsTrigger>
          <TabsTrigger value="mlops"><Cpu className="h-3.5 w-3.5 mr-1"/>ML Ops</TabsTrigger>
          <TabsTrigger value="ef"><Landmark className="h-3.5 w-3.5 mr-1"/>Foundation</TabsTrigger>
          <TabsTrigger value="collab"><Video className="h-3.5 w-3.5 mr-1"/>Collab &amp; Vision</TabsTrigger>
          <TabsTrigger value="aeco"><Sparkles className="h-3.5 w-3.5 mr-1"/>AI Ecosystem</TabsTrigger>
          <TabsTrigger value="mkt"><Store className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Marketplace</TabsTrigger>
          <TabsTrigger value="ci"><Coins className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Crypto Intel</TabsTrigger>
          <TabsTrigger value="wi"><Radio className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Wake Intel</TabsTrigger>
          <TabsTrigger value="arch"><Landmark className="h-3.5 w-3.5 mr-1" style={{color:"#6366F1"}}/>Architecture</TabsTrigger>
          <TabsTrigger value="sh"><Server className="h-3.5 w-3.5 mr-1" style={{color:"#14B8A6"}}/>Self-Hosted</TabsTrigger>
          <TabsTrigger value="kr"><Cpu className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>AI Kernel</TabsTrigger>
          <TabsTrigger value="vs"><Mic2 className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Voice Studio</TabsTrigger>
          <TabsTrigger value="ti"><TrendingUp className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Trading Intel</TabsTrigger>
          <TabsTrigger value="vf"><Wand2 className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Voice Foundry</TabsTrigger>
          <TabsTrigger value="ep"><GraduationCap className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Experts</TabsTrigger>
          <TabsTrigger value="mf"><Clapperboard className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Media Factory</TabsTrigger>
          <TabsTrigger value="ux"><Palette className="h-3.5 w-3.5 mr-1" style={{color:"#14B8A6"}}/>UX Intel</TabsTrigger>
          <TabsTrigger value="gc"><Gift className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Gift Cards</TabsTrigger>
          <TabsTrigger value="gcu"><Globe className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Global Currency</TabsTrigger>
          <TabsTrigger value="v76"><ShieldCheckIcon className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Validation</TabsTrigger>
          <TabsTrigger value="mg"><ImageIcon className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Media Gen</TabsTrigger>
          <TabsTrigger value="hx"><ServerIcon className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Hybrid Exec</TabsTrigger>
          <TabsTrigger value="vo"><UserCheck className="h-3.5 w-3.5 mr-1" style={{color:"#3B82F6"}}/>Voice Ownership</TabsTrigger>
          <TabsTrigger value="cei"><Link2 className="h-3.5 w-3.5 mr-1" style={{color:"#14B8A6"}}/>Core Integration</TabsTrigger>
          <TabsTrigger value="mf2"><FactoryIcon className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Model Factory</TabsTrigger>
          <TabsTrigger value="me"><DbIcon className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Memory Evolution</TabsTrigger>
          <TabsTrigger value="cst"><BookOpen className="h-3.5 w-3.5 mr-1" style={{color:"#3B82F6"}}/>Constitution</TabsTrigger>
          <TabsTrigger value="cmp"><Workflow className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Composer</TabsTrigger>
          <TabsTrigger value="bm"><BarChart3 className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Benchmarks</TabsTrigger>
          <TabsTrigger value="dr"><HeartPulse className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>DR / BCP</TabsTrigger>
          <TabsTrigger value="lic"><DollarSign className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Licensing</TabsTrigger>
          <TabsTrigger value="dep"><Cloud className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Deployment</TabsTrigger>
          <TabsTrigger value="upd"><RefreshCw className="h-3.5 w-3.5 mr-1" style={{color:"#14B8A6"}}/>Updates</TabsTrigger>
          <TabsTrigger value="usg"><PieChart className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Usage Intel</TabsTrigger>
          <TabsTrigger value="fab"><CogIcon className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Intelligence Fabric</TabsTrigger>
          <TabsTrigger value="rob"><BotIcon className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Robotics</TabsTrigger>
          <TabsTrigger value="spa"><Box className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Spatial</TabsTrigger>
          <TabsTrigger value="sdk"><TerminalIcon className="h-3.5 w-3.5 mr-1" style={{color:"#3B82F6"}}/>SDK</TabsTrigger>
          <TabsTrigger value="trn"><GradIcon className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Training</TabsTrigger>
          <TabsTrigger value="dm"><ShoppingBag className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Data Marketplace</TabsTrigger>
          <TabsTrigger value="dh"><UserCircle className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Digital Humans</TabsTrigger>
          <TabsTrigger value="q"><Atom className="h-3.5 w-3.5 mr-1" style={{color:"#3B82F6"}}/>Quantum</TabsTrigger>
          <TabsTrigger value="esg"><Leaf className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Sustainability</TabsTrigger>
          <TabsTrigger value="bio"><Stethoscope className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Biomedical</TabsTrigger>
          <TabsTrigger value="leg"><Gavel className="h-3.5 w-3.5 mr-1" style={{color:"#64748B"}}/>Legal Intel</TabsTrigger>
          <TabsTrigger value="edu"><School className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Education</TabsTrigger>
          <TabsTrigger value="sci"><FlaskConical className="h-3.5 w-3.5 mr-1" style={{color:"#14B8A6"}}/>Scientific</TabsTrigger>
          <TabsTrigger value="cog"><Brain className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Cognitive / World</TabsTrigger>
          <TabsTrigger value="gcc"><Globe2Icon className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Command Center</TabsTrigger>
          <TabsTrigger value="eco"><Wallet className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>AI Economy</TabsTrigger>
          <TabsTrigger value="aut"><Crown className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>Autonomous Org</TabsTrigger>
          <TabsTrigger value="cyb"><ShieldLucide className="h-3.5 w-3.5 mr-1" style={{color:"#3B82F6"}}/>Cyber Academy</TabsTrigger>
          <TabsTrigger value="opex"><ShieldCheck className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>OpEx & RAI</TabsTrigger>
          <TabsTrigger value="ind"><Building2 className="h-3.5 w-3.5 mr-1" style={{color:"#8B5CF6"}}/>Industries</TabsTrigger>
          <TabsTrigger value="hec"><HeartPulse className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Health Ecosystem</TabsTrigger>
          <TabsTrigger value="pcon"><FolderOpen className="h-3.5 w-3.5 mr-1" style={{color:"#D946EF"}}/>Project Import</TabsTrigger>
          <TabsTrigger value="ldis"><Search className="h-3.5 w-3.5 mr-1" style={{color:"#10B981"}}/>Lead Discovery</TabsTrigger>
          <TabsTrigger value="etl"><DbIcon className="h-3.5 w-3.5 mr-1" style={{color:"#F59E0B"}}/>ETL Pipelines</TabsTrigger>
          <TabsTrigger value="cam"><Video className="h-3.5 w-3.5 mr-1" style={{color:"#DC2626"}}/>Live Camera</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab/></TabsContent>
        <TabsContent value="metrics"><MetricsTab/></TabsContent>
        <TabsContent value="logs"><LogsTab/></TabsContent>
        <TabsContent value="traces"><TracesTab/></TabsContent>
        <TabsContent value="ai"><AiTab/></TabsContent>
        <TabsContent value="regions"><RegionsTab/></TabsContent>
        <TabsContent value="cdn"><CdnTab/></TabsContent>
        <TabsContent value="dr"><DrTab/></TabsContent>
        <TabsContent value="infra"><InfraTab/></TabsContent>
        <TabsContent value="qa"><QaTab/></TabsContent>
        <TabsContent value="gov"><GovTab/></TabsContent>
          <TabsContent value="rel"><ReleaseTab/></TabsContent>
          <TabsContent value="pgm"><ProgramTab/></TabsContent>
          <TabsContent value="eng"><EngineeringTab/></TabsContent>
          <TabsContent value="dev"><DevPortalTab/></TabsContent>
          <TabsContent value="ext"><ExtensionsTab/></TabsContent>
          <TabsContent value="psvc"><PlatformServicesTab/></TabsContent>
          <TabsContent value="mlops"><MlOpsTab/></TabsContent>
          <TabsContent value="ef"><EnterpriseFoundationTab/></TabsContent>
          <TabsContent value="collab"><CollaborationTab/></TabsContent>
          <TabsContent value="aeco"><AiEcosystemTab/></TabsContent>
          <TabsContent value="mkt"><MarketplaceTab/></TabsContent>
          <TabsContent value="ci"><CryptoIntelTab/></TabsContent>
          <TabsContent value="wi"><WakeIntelTab/></TabsContent>
          <TabsContent value="arch"><ArchitectureTab/></TabsContent>
          <TabsContent value="sh"><SelfHostedTab/></TabsContent>
          <TabsContent value="kr"><KernelTab/></TabsContent>
          <TabsContent value="vs"><VoiceStudioTab/></TabsContent>
          <TabsContent value="ti"><TradingIntelTab/></TabsContent>
          <TabsContent value="vf"><VoiceFoundryTab/></TabsContent>
          <TabsContent value="ep"><ExpertsTab/></TabsContent>
          <TabsContent value="mf"><MediaFactoryTab/></TabsContent>
          <TabsContent value="ux"><UxIntelTab/></TabsContent>
          <TabsContent value="gc"><GiftCardsTab/></TabsContent>
          <TabsContent value="gcu"><GlobalCurrencyTab/></TabsContent>
          <TabsContent value="v76"><ValidationTab/></TabsContent>
          <TabsContent value="mg"><MediaGenTab/></TabsContent>
          <TabsContent value="hx"><HybridExecTab/></TabsContent>
          <TabsContent value="vo"><VoiceOwnershipTab/></TabsContent>
          <TabsContent value="cei"><CoreIntegrationTab/></TabsContent>
          <TabsContent value="mf2"><ModelFactoryTab/></TabsContent>
          <TabsContent value="me"><MemoryEvolutionTab/></TabsContent>
          <TabsContent value="cst"><ConstitutionTab/></TabsContent>
          <TabsContent value="cmp"><ComposerTab/></TabsContent>
          <TabsContent value="bm"><BenchmarksTab/></TabsContent>
          <TabsContent value="dr"><DisasterRecoveryTab/></TabsContent>
          <TabsContent value="lic"><LicensingTab/></TabsContent>
          <TabsContent value="dep"><DeploymentTab/></TabsContent>
          <TabsContent value="upd"><UpdatesTab/></TabsContent>
          <TabsContent value="usg"><UsageTab/></TabsContent>
          <TabsContent value="fab"><FabricTab/></TabsContent>
          <TabsContent value="rob"><RoboticsTab/></TabsContent>
          <TabsContent value="spa"><SpatialTab/></TabsContent>
          <TabsContent value="sdk"><SdkTab/></TabsContent>
          <TabsContent value="trn"><TrainingTab/></TabsContent>
          <TabsContent value="dm"><DataMarketplaceTab/></TabsContent>
          <TabsContent value="dh"><DigitalHumansTab/></TabsContent>
          <TabsContent value="q"><QuantumTab/></TabsContent>
          <TabsContent value="esg"><SustainabilityTab/></TabsContent>
          <TabsContent value="bio"><BiomedicalTab/></TabsContent>
          <TabsContent value="leg"><LegalTab/></TabsContent>
          <TabsContent value="edu"><EducationTab/></TabsContent>
          <TabsContent value="sci"><ScientificTab/></TabsContent>
          <TabsContent value="cog"><CognitiveTab/></TabsContent>
          <TabsContent value="gcc"><CommandCenterTab/></TabsContent>
          <TabsContent value="eco"><AiEconomyTab/></TabsContent>
          <TabsContent value="aut"><AutonomousTab/></TabsContent>
          <TabsContent value="cyb"><CyberTab/></TabsContent>
          <TabsContent value="opex"><OpexTab/></TabsContent>
          <TabsContent value="ind"><IndustryTab/></TabsContent>
          <TabsContent value="hec"><HealthEcosystemTab/></TabsContent>
          <TabsContent value="pcon"><ProjectContinuityTab/></TabsContent>
          <TabsContent value="ldis"><LeadDiscoveryTab/></TabsContent>
          <TabsContent value="etl"><EtlTab/></TabsContent>
          <TabsContent value="cam"><CameraTab/></TabsContent>
        </Tabs>
    </div>
  );
}

function useRefresh<T>(fn: () => Promise<T>, intervalMs?: number, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => { fn().then(setData).catch((e) => setErr(e?.message ?? String(e))); };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, deps);
  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
    /* eslint-disable-next-line */
  }, [intervalMs, ...deps]);
  return { data, err, refresh, setData };
}

function Stat({label, value, tone="azure", sub}:{label:string; value:React.ReactNode; tone?:string; sub?:string}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
        <div className={cn("text-2xl font-semibold mt-1", {
          "text-azure": tone==="azure","text-emerald":tone==="emerald","text-amber":tone==="amber","text-crimson":tone==="crimson","text-violet":tone==="violet","text-fuchsia":tone==="fuchsia","text-teal":tone==="teal",
          "text-text-bright": tone==="bright"
        })}>{value}</div>
        {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function OverviewTab() {
  const { data } = useRefresh(() => p.platformApi.overview(), 10_000);
  if (!data) return <Skeleton/>;
  const o = data;
  const httpReqs = o.metrics.counters["http.request.count"]?.total ?? 0;
  const errors = o.metrics.counters["http.response.count"]?.byTags["status=500"] ?? 0;
  const dbQ = o.metrics.counters["db.query.count"]?.total ?? 0;
  const regions = o.regions as p.RegionRecord[];
  const healthy = regions.filter(r => r.status==="active").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Regions healthy" value={`${healthy}/${regions.length}`} tone={healthy===regions.length?"emerald":"amber"}/>
        <Stat label="HTTP requests" value={httpReqs} tone="azure" sub="since boot"/>
        <Stat label="DB queries" value={dbQ} tone="violet"/>
        <Stat label="5xx errors" value={errors} tone={errors>0?"crimson":"emerald"}/>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Region status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {regions.map(r => (
              <div key={r.id} className="flex items-center gap-3">
                <span className={cn("h-2 w-2 rounded-full", r.status==="active"?"bg-emerald":r.status==="degraded"?"bg-amber animate-pulse":r.status==="down"?"bg-crimson":"bg-slate-500")}/>
                <div className="flex-1">
                  <div className="font-medium text-text-bright text-sm">{r.name} <span className="text-text-muted font-mono text-xs">{r.id}</span></div>
                  <div className="text-xs text-text-muted capitalize">{r.role}{r.latencyMs?` · ${r.latencyMs}ms`:''}</div>
                </div>
                <Badge variant={r.status==="active"?"emerald":r.status==="degraded"?"amber":r.status==="down"?"crimson":"slate"}>{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent warnings</CardTitle><CardDescription>Last 20 warn+ log entries</CardDescription></CardHeader>
          <CardContent>
            {o.recentWarns.length===0 ? <p className="text-sm text-text-muted">No warnings.</p> :
            <ul className="space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
              {(o.recentWarns as p.LogEntry[]).map((l,i) => (
                <li key={i} className={cn("truncate", l.level==="error"||l.level==="fatal"?"text-crimson":"text-amber")}>[{l.time.slice(11,19)}] {l.msg}</li>
              ))}
            </ul>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricsTab() {
  const { data, refresh } = useRefresh(() => p.platformApi.metrics(), 5000);
  if (!data) return <Skeleton/>;
  const makeBars = (series: {t:number;v:number}[]) => {
    const max = Math.max(1, ...series.map(s=>s.v));
    return (
      <div className="flex items-end gap-[2px] h-20 mt-2">
        {series.slice(-40).map((s,i)=>(
          <div key={i} title={`${new Date(s.t).toLocaleTimeString()}: ${s.v}`} className="flex-1 bg-azure/60 rounded-sm" style={{height:`${(s.v/max)*100}%`}}/>
        ))}
      </div>
    );
  };
  const reqSeries = data.series["http.request.count"]?.minute ?? [];
  const durSeries = data.series["http.request.duration_ms_ms"]?.minute ?? [];
  const dbSeries = data.series["db.query.duration_ms_ms"]?.minute ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-text-muted">Collected at {new Date(data.collectedAt).toLocaleTimeString()}</p>
        <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Card><CardHeader><CardTitle className="text-sm">HTTP requests/min</CardTitle></CardHeader>
          <CardContent>{makeBars(reqSeries as any)}<div className="text-xs text-text-muted mt-2">total: {data.counters["http.request.count"]?.total ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">HTTP latency (ms)</CardTitle></CardHeader>
          <CardContent>{makeBars(durSeries as any)}<div className="text-xs text-text-muted mt-2">avg: {Object.values(data.histograms["http.request.duration_ms"]?.byTags ?? {})[0]?.avg?.toFixed?.(1) ?? "-"}ms</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">DB query latency (ms)</CardTitle></CardHeader>
          <CardContent>{makeBars(dbSeries as any)}<div className="text-xs text-text-muted mt-2">queries: {data.counters["db.query.count"]?.total ?? 0}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Counters</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Metric</th><th>Total</th><th>By tags</th></tr></thead>
            <tbody>
              {Object.entries(data.counters).map(([k,v])=>(
                <tr key={k} className="border-t border-white/5">
                  <td className="py-1.5 font-mono text-xs">{k}</td>
                  <td className="font-semibold text-text-bright">{v.total}</td>
                  <td className="text-xs text-text-muted font-mono">{Object.entries(v.byTags).map(([t,n])=>`${t}=${n}`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Histograms</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Metric</th><th>Tags</th><th>Count</th><th>Avg</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              {Object.entries(data.histograms).flatMap(([k,v])=>Object.entries(v.byTags).map(([t,b])=>(
                <tr key={k+t} className="border-t border-white/5">
                  <td className="py-1.5 font-mono text-xs">{k}</td>
                  <td className="text-xs text-text-muted font-mono">{t || '—'}</td>
                  <td>{b.count}</td><td>{b.avg.toFixed(1)}</td><td>{b.min.toFixed(1)}</td><td>{b.max.toFixed(1)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function LogsTab() {
  const [level, setLevel] = useState<string>("info");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<p.LogEntry[]>([]);
  async function load() {
    setEntries(await p.platformApi.logs({ level: level as any, limit: 200, search: search || undefined }));
  }
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); /* eslint-disable-next-line */ }, [level]);
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-3 flex flex-wrap gap-2 items-center">
          <select value={level} onChange={e=>setLevel(e.target.value)} className="rounded border border-white/10 bg-bg-deep px-3 py-1.5 text-sm">
            <option value="debug">debug+</option><option value="info">info+</option><option value="warn">warn+</option><option value="error">error+</option><option value="fatal">fatal</option>
          </select>
          <Input placeholder="Search logs…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} className="max-w-xs"/>
          <Button size="sm" variant="outline" onClick={load}>Search</Button>
          <span className="text-xs text-text-muted ml-auto">{entries.length} entries</span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="font-mono text-xs max-h-[60vh] overflow-y-auto">
            {entries.map((l,i)=>(
              <div key={i} className={cn("px-3 py-1 border-b border-white/5 flex gap-2",
                l.level==="error"||l.level==="fatal"?"bg-crimson/5":l.level==="warn"?"bg-amber/5":""
              )}>
                <span className="text-text-muted shrink-0 w-20">{l.time.slice(11,23)}</span>
                <span className={cn("shrink-0 w-12 uppercase",{
                  "text-crimson font-bold":l.level==="fatal"||l.level==="error",
                  "text-amber":l.level==="warn","text-azure":l.level==="info","text-teal":l.level==="debug",
                })}>{l.level}</span>
                <span className="text-text-main truncate">{l.msg} {Object.keys(l).filter(k=>!['level','time','msg','traceId','userId','orgId','requestId'].includes(k)).length>0?JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k])=>!['level','time','msg','traceId','userId','orgId','requestId'].includes(k)))):''}</span>
              </div>
            ))}
            {entries.length===0 && <div className="p-6 text-center text-text-muted">No log entries match.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TracesTab() {
  const [roots, setRoots] = useState<p.SpanRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [spans, setSpans] = useState<p.SpanRecord[]>([]);
  async function load() { setRoots(await p.platformApi.traces(50)); }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected) p.platformApi.trace(selected).then(setSpans); }, [selected]);
  return (
    <div className="grid md:grid-cols-[1fr_1.5fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Recent traces</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-y-auto">
            {roots.map(r=>(
              <button key={r.spanId} onClick={()=>setSelected(r.traceId)} className={cn("w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/5 text-sm",
                selected===r.traceId && "bg-white/10")}>
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", r.status==="ok"?"bg-emerald":"bg-crimson")}/>
                  <span className="font-medium text-text-bright truncate">{r.name}</span>
                </div>
                <div className="text-xs text-text-muted pl-4 truncate font-mono">{r.traceId.slice(0,12)}… · {r.durationMs?.toFixed(1) ?? '—'}ms · {new Date(r.startedAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Trace {selected?selected.slice(0,16)+'…':'—'}</CardTitle></CardHeader>
        <CardContent>
          {!selected ? <p className="text-sm text-text-muted">Select a trace.</p> :
            <div className="space-y-1 font-mono text-xs">
              {spans.map(s=>(
                <div key={s.spanId} className="pl-[calc(var(--d,0)*16px)]" style={{'--d': depth(s, spans)} as any}>
                  <div className="flex items-center gap-2 py-1">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", s.status==="ok"?"bg-emerald":"bg-crimson")}/>
                    <span className="text-text-bright">{s.name}</span>
                    <Badge variant="slate">{s.kind}</Badge>
                    <span className="text-text-muted ml-auto">{s.durationMs?.toFixed?.(1) ?? '—'}ms</span>
                  </div>
                  {s.errorMessage && <div className="text-crimson pl-4">{s.errorMessage}</div>}
                  {Object.keys(s.attrs).length>0 && <div className="text-text-muted pl-4">{Object.entries(s.attrs).map(([k,v])=>`${k}=${v}`).slice(0,6).join(' · ')}</div>}
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
function depth(s: p.SpanRecord, all: p.SpanRecord[], seen=new Set<string>()): number {
  if (!s.parentSpanId) return 0;
  if (seen.has(s.spanId)) return 0;
  seen.add(s.spanId);
  const p = all.find(x => x.spanId === s.parentSpanId);
  if (!p) return 0;
  return 1 + depth(p, all, seen);
}

function AiTab() {
  const [minutes, setMinutes] = useState(60);
  const { data } = useRefresh(() => p.platformApi.aiObservability(minutes), 10_000, [minutes]);
  if (!data) return <Skeleton/>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">Window:</span>
        {[15,60,360,1440].map(m=>(
          <Button key={m} size="sm" variant={minutes===m?"primary":"outline"} onClick={()=>setMinutes(m)}>{m<60?`${m}m`:m<1440?`${m/60}h`:'24h'}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Requests" value={data.totals.requests} tone="azure"/>
        <Stat label="Error rate" value={`${(data.totals.errorRate*100).toFixed(1)}%`} tone={data.totals.errorRate>0.05?"crimson":"emerald"}/>
        <Stat label="p95 latency" value={`${data.totals.p95LatencyMs}ms`} tone="violet"/>
        <Stat label="Cost (est.)" value={`$${data.totals.totalCostUsd.toFixed(4)}`} tone="amber"/>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>By model</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Model</th><th>Reqs</th><th>Avg ms</th><th>Errors</th><th>Cost</th></tr></thead>
              <tbody>
                {Object.entries(data.byModel).map(([m,b])=>(
                  <tr key={m} className="border-t border-white/5">
                    <td className="py-1.5 font-mono text-xs">{m}</td><td>{b.requests}</td><td>{b.avgLatencyMs}</td><td>{(b.errorRate*100).toFixed(0)}%</td><td>${b.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
                {Object.keys(data.byModel).length===0 && <tr><td colSpan={5} className="py-4 text-center text-text-muted text-sm">No AI requests in window.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By feature</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Feature</th><th>Reqs</th><th>Errors</th></tr></thead>
              <tbody>
                {Object.entries(data.byFeature).map(([f,b])=>(
                  <tr key={f} className="border-t border-white/5"><td className="py-1.5 font-mono text-xs">{f}</td><td>{b.requests}</td><td>{b.errors}</td></tr>
                ))}
                {Object.keys(data.byFeature).length===0 && <tr><td colSpan={3} className="py-4 text-center text-text-muted text-sm">No data.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RegionsTab() {
  const { data } = useRefresh(() => p.platformApi.regions(), 10_000);
  if (!data) return <Skeleton/>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {data.map(r=>(
        <Card key={r.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", r.status==="active"?"bg-emerald":r.status==="degraded"?"bg-amber animate-pulse":r.status==="down"?"bg-crimson":"bg-slate-500")}/>{r.name} <Badge variant="slate">{r.role}</Badge></CardTitle>
            <CardDescription>{r.city}, {r.country} · <span className="font-mono">{r.id}</span></CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-text-muted">Status</div><div className="capitalize font-medium">{r.status}</div></div>
            <div><div className="text-xs text-text-muted">Latency</div><div>{r.latencyMs?`${r.latencyMs}ms`:'—'}</div></div>
            <div><div className="text-xs text-text-muted">RPO</div><div>{r.rpoSeconds}s</div></div>
            <div><div className="text-xs text-text-muted">RTO</div><div>{r.rtoSeconds}s</div></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CdnTab() {
  const [cfg, setCfg] = useState<p.CdnConfig | null>(null);
  const [paths, setPaths] = useState("/*");
  async function load() { setCfg(await p.platformApi.cdn()); }
  useEffect(() => { load(); }, []);
  async function doPurge() {
    const arr = paths.split('\n').map(s=>s.trim()).filter(Boolean);
    if (!arr.length) return;
    await p.platformApi.purgeCdn(arr); toast.success("Purge dispatched"); load();
  }
  if (!cfg) return <Skeleton/>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Provider" value={cfg.provider} tone="bright"/>
        <Stat label="POPs" value={cfg.popCount} tone="azure"/>
        <Stat label="Hit rate" value={`${(cfg.cacheHitRate*100).toFixed(0)}%`} tone="emerald"/>
        <Stat label="Bandwidth" value={`${cfg.bandwidthGb} GB`} tone="violet"/>
      </div>
      <Card>
        <CardHeader><CardTitle>Cache rules</CardTitle><CardDescription>TTL per path pattern</CardDescription></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Pattern</th><th>TTL (s)</th><th>SWR</th><th>Includes</th><th>Enabled</th></tr></thead>
            <tbody>
              {cfg.rules.map((r,i)=>(
                <tr key={i} className="border-t border-white/5"><td className="py-1.5 font-mono text-xs">{r.pathPattern}</td><td>{r.ttlSeconds}</td><td>{r.staleWhileRevalidate}</td><td className="text-xs text-text-muted">{r.cacheKeyIncludes.join(', ')||'—'}</td><td>{r.enabled?'✓':'—'}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Purge cache</CardTitle><CardDescription>One path per line. Purges are global across all POPs.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <textarea value={paths} onChange={e=>setPaths(e.target.value)} rows={3} className="w-full rounded border border-white/10 bg-bg-deep px-3 py-2 text-sm font-mono" placeholder={"/*\n/assets/*"}/>
          <Button variant="warning" onClick={doPurge}>Purge paths</Button>
          {cfg.recentPurges.length>0 && (
            <div className="pt-2 text-xs text-text-muted space-y-1">
              {cfg.recentPurges.slice(0,5).map((p:any)=>(<div key={p.id} className="font-mono">{new Date(p.createdAt).toLocaleString()} · {p.status} · {p.paths.join(', ')}</div>))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DrTab() {
  const { data, refresh } = useRefresh(() => p.platformApi.dr(), 10_000);
  const [toRegion, setToRegion] = useState("us-east-1");
  const [reason, setReason] = useState("");
  if (!data) return <Skeleton/>;
  async function trigger() {
    if (!reason) return toast.error("Enter a reason");
    await p.platformApi.triggerFailover(toRegion, reason); toast.success("Failover triggered"); setReason(""); refresh();
  }
  async function clear() {
    if (!confirm("Clear failover and return to primary?")) return;
    await p.platformApi.clearFailover(); toast.success("Failover cleared"); refresh();
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Status" value={data.status} tone={data.status==="healthy"?"emerald":data.status==="degraded"?"amber":"crimson"}/>
        <Stat label="Primary" value={data.primaryRegion||"—"} tone="azure"/>
        <Stat label="DR replica" value={data.drRegion||"—"} tone="violet"/>
        <Stat label="Replication lag" value={`${data.replicationLagMs}ms`} tone="teal"/>
      </div>
      <Card>
        <CardHeader><CardTitle>Replicas</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted text-left"><th className="py-1">Region</th><th>Status</th><th>RPO</th><th>RTO</th></tr></thead>
            <tbody>{data.replicas.map(r=>(
              <tr key={r.id} className="border-t border-white/5"><td className="py-1.5 font-mono">{r.id}</td><td className="capitalize">{r.status}</td><td>{r.rpoSeconds}s</td><td>{r.rtoSeconds}s</td></tr>
            ))}</tbody>
          </table>
          <div className="text-xs text-text-muted pt-3">Last backup: {new Date(data.lastBackupAt).toLocaleString()} · status: {data.backupStatus}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Manual failover</CardTitle><CardDescription>{data.failover.active?`Currently failed over to ${data.failover.toRegion} since ${data.failover.since}`:'Operating from primary.'}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <select value={toRegion} onChange={e=>setToRegion(e.target.value)} className="rounded border border-white/10 bg-bg-deep px-3 py-2 text-sm">
              <option value="us-east-1">us-east-1 (N. Virginia)</option>
              <option value="eu-west-1">eu-west-1 (Ireland)</option>
              <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
              <option value="dr-us-west-2">dr-us-west-2 (Oregon — DR)</option>
            </select>
            <Input placeholder="Reason for failover…" value={reason} onChange={e=>setReason(e.target.value)} className="flex-1 min-w-[240px]"/>
            <Button variant="danger" onClick={trigger}>Trigger failover</Button>
            {data.failover.active && <Button variant="outline" onClick={clear}>Return to primary</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Skeleton() { return <Card><CardContent className="py-10 text-center text-text-muted"><div className="inline-block h-5 w-5 border-2 border-azure/40 border-t-azure rounded-full animate-spin"/> Loading…</CardContent></Card>; }

// ─── Session 22: QA Platform Tab ────────────────────────────────────
function QaTab() {
  const dash = useRefresh<qa.QADashboard | null>(() => qa.qaApi.dashboard(), 10_000);
  const [suites, setSuites] = useState<qa.TestSuite[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<string | null>(null);
  const [suiteCases, setSuiteCases] = useState<qa.TestCase[]>([]);
  const [runs, setRuns] = useState<qa.TestRun[]>([]);
  const [activeRun, setActiveRun] = useState<qa.TestRun | null>(null);
  const [running, setRunning] = useState(false);

  async function reload() {
    const [s, r] = await Promise.all([qa.qaApi.listSuites(), qa.qaApi.listRuns(20)]);
    setSuites(s); setRuns(r);
    if (selectedSuite) setSuiteCases(await qa.qaApi.listCases({ suiteId: selectedSuite }));
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => { if (selectedSuite) qa.qaApi.listCases({ suiteId: selectedSuite }).then(setSuiteCases); }, [selectedSuite]);

  async function runSuite(id: string) {
    setRunning(true);
    try {
      const run = await qa.qaApi.runSuite(id, { triggeredBy: "manual" });
      setActiveRun(run);
      toast.success(`suite finished: ${run.passed}/${run.total} passed`);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "run failed"); }
    setRunning(false);
  }

  const d = dash.data;
  return (
    <div className="space-y-4">
      {d ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Stat label="Suites" value={d.totalSuites} tone="azure"/>
          <Stat label="Cases" value={d.totalCases}/>
          <Stat label="7-day Pass" value={`${Math.round(d.passRate7d*100)}%`} tone={d.passRate7d>0.9?"emerald":d.passRate7d>0.7?"amber":"crimson"}/>
          <Stat label="Open Failures" value={d.openFailures} tone={d.openFailures?"crimson":"emerald"}/>
          <Stat label="API Coverage" value={d.coverage.api}/>
          <Stat label="AI Checks" value={d.coverage.ai} tone="violet"/>
        </div>
      ) : <Skeleton/>}

      <div className="grid md:grid-cols-3 gap-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4 text-azure"/>Test Suites</CardTitle>
            <Button size="sm" variant="outline" onClick={reload}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {suites.map(s=>{
              const last = runs.find(r=>r.suiteId===s.id);
              const isSelected = selectedSuite === s.id;
              return (
                <div key={s.id} className={cn("border rounded-lg p-3 text-xs cursor-pointer transition-colors", isSelected?"border-azure/60 bg-azure/5":"border-white/5 hover:border-white/15")} onClick={()=>setSelectedSuite(isSelected?null:s.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <Badge variant={s.kind==="security"?"crimson":s.kind==="chaos"||s.kind==="dr"?"amber":s.kind==="ai-validation"?"violet":"azure"}>{s.kind}</Badge>
                      {s.schedule?.preset && s.schedule.preset !== "manual" && <Badge variant="default"><Clock className="h-3 w-3 mr-0.5"/>{s.schedule.preset}</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">{s.caseIds.length} cases</span>
                      {last && <Badge variant={last.status==="passed"?"emerald":last.status==="failed"?"crimson":"default"}>{last.passed}/{last.total} · {Math.round(last.passRate*100)}%</Badge>}
                      <Button size="sm" variant="primary" disabled={running} onClick={(e)=>{e.stopPropagation(); void runSuite(s.id);}}><Play className="h-3 w-3 mr-1"/>run</Button>
                    </div>
                  </div>
                  {isSelected && suiteCases.length>0 && (
                    <div className="mt-2 pl-2 border-l-2 border-white/10 space-y-1">
                      {suiteCases.map(c=>(
                        <div key={c.id} className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full",c.severity==="critical"?"bg-crimson":c.severity==="high"?"bg-amber":c.severity==="medium"?"bg-violet":"bg-teal")}/>
                            {c.name}
                          </span>
                          <span className="text-text-muted">{c.kind} · {c.timeoutMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber"/>Recent Runs</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {runs.slice(0,15).map(r=>(
              <div key={r.id} className="text-xs border border-white/5 rounded p-2 cursor-pointer hover:border-white/15" onClick={()=>setActiveRun(r)}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold truncate max-w-[140px]">{r.suiteName}</span>
                  <Badge variant={r.status==="passed"?"emerald":r.status==="failed"?"crimson":r.status==="running"?"azure":"default"}>{r.status}</Badge>
                </div>
                <div className="text-text-muted flex items-center justify-between mt-0.5">
                  <span>{r.passed}/{r.total} passed</span>
                  <span>{r.durationMs}ms</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {activeRun && (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2"><Bug className="h-4 w-4 text-azure"/>Run {activeRun.id.slice(0,8)}</CardTitle>
              <CardDescription className="text-xs">{activeRun.suiteName} · {activeRun.triggeredBy} · {new Date(activeRun.startedAt).toLocaleString()}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={activeRun.status==="passed"?"emerald":activeRun.status==="failed"?"crimson":"azure"}>{activeRun.status}</Badge>
              <Button size="sm" variant="ghost" onClick={()=>setActiveRun(null)}>close</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeRun.results.map(r=>(
              <div key={r.caseId} className="text-xs border border-white/5 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    {r.status==="passed" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald"/> : r.status==="failed" ? <XCircle className="h-3.5 w-3.5 text-crimson"/> : <span className="h-2 w-2 rounded-full bg-amber"/>}
                    {r.caseName}
                  </span>
                  <span className="text-text-muted">{r.durationMs}ms</span>
                </div>
                {r.assertions.filter(a=>!a.passed).length>0 && (
                  <div className="mt-1 space-y-0.5">
                    {r.assertions.filter(a=>!a.passed).map(a=>(
                      <div key={a.id} className="text-crimson pl-4">✗ {a.label}{a.message?`: ${a.message}`:""} (expected {JSON.stringify(a.expected)}, got {JSON.stringify(a.actual)})</div>
                    ))}
                  </div>
                )}
                {r.assertions.filter(a=>a.passed).length>0 && r.status==="passed" && (
                  <div className="text-emerald/70 text-[11px] mt-1">{r.assertions.length} assertions passed</div>
                )}
                {r.error && <div className="text-crimson mt-1">{r.error.code}: {r.error.message}</div>}
                {r.logs.length>0 && <div className="text-text-muted font-mono text-[10px] mt-1">{r.logs.join(" · ")}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Session 23: Engineering Governance Tab ──────────────────────────
function GovTab() {
  const dash = useRefresh<gov.GovEngineeringDashboard | null>(() => gov.govApi.dashboard(), 15_000);
  const [tab, setTab] = useState<"overview"|"coding"|"repo"|"adr"|"reviews"|"deps"|"security">("overview");
  const [adrs, setAdrs] = useState<gov.ADR[]>([]);
  const [coding, setCoding] = useState<gov.CodingStandard[]>([]);
  const [repo, setRepo] = useState<gov.RepoStandard[]>([]);
  const [reviews, setReviews] = useState<gov.CodeReview[]>([]);
  const [deps, setDeps] = useState<gov.Dependency[]>([]);
  const [sec, setSec] = useState<gov.SecurityStandard[]>([]);

  async function reload() {
    const [a,c,r,rv,d,s] = await Promise.all([
      gov.govApi.listADRs(), gov.govApi.listCodingStandards(), gov.govApi.listRepoStandards(),
      gov.govApi.listReviews(), gov.govApi.listDependencies(false), gov.govApi.listSecurity(),
    ]);
    setAdrs(a); setCoding(c); setRepo(r); setReviews(rv); setDeps(d); setSec(s);
  }
  useEffect(() => { void reload(); }, []);

  const d = dash.data;
  return (
    <div className="space-y-4">
      {d ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Coding Stds" value={`${d.codingStandards.enabled}/${d.codingStandards.total}`} tone="azure" sub={`${d.codingStandards.required} required`}/>
          <Stat label="Repo Stds" value={`${d.repoStandards.enforced}/${d.repoStandards.total}`} tone="teal" sub="enforced"/>
          <Stat label="ADRs" value={d.adrs.total} tone="violet" sub={`${d.adrs.accepted} accepted`}/>
          <Stat label="Open PRs" value={d.reviews.openReviews} tone={d.reviews.openReviews? "amber":"emerald"} sub={`${d.reviews.mergedThisWeek}/wk`}/>
          <Stat label="Outdated Deps" value={d.dependencies.outdated} tone={d.dependencies.criticalVulns? "crimson":"amber"} sub={`${d.dependencies.vulnerable} vulnerable`}/>
          <Stat label="Security Score" value={`${d.security.score}/100`} tone={d.security.score>85?"emerald":d.security.score>60?"amber":"crimson"} sub={`${d.security.implemented}/${d.security.total} controls`}/>
        </div>
      ) : <Skeleton/>}

      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Activity],
          ["coding","Coding Stds",BookOpen],
          ["repo","Repo Stds",GitBranch],
          ["adr","ADRs",BookOpen],
          ["reviews","Code Reviews",GitPullRequest],
          ["deps","Dependencies",Package],
          ["security","Security",ShieldAlert],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={tab===k?"primary":"outline"} onClick={()=>setTab(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {tab==="overview" && d && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-crimson"/>Security Posture</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex items-center justify-between"><span>Implemented</span><Badge variant="emerald">{d.security.implemented}</Badge></div>
              <div className="flex items-center justify-between"><span>Partial</span><Badge variant="amber">{d.security.partial}</Badge></div>
              <div className="flex items-center justify-between"><span>Missing</span><Badge variant="crimson">{d.security.missing}</Badge></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-azure"/>Review Metrics</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex items-center justify-between"><span>Avg review time</span><span className="font-semibold">{d.reviews.avgReviewHours}h</span></div>
              <div className="flex items-center justify-between"><span>Approval rate</span><span className="font-semibold">{Math.round(d.reviews.approvalRate*100)}%</span></div>
              <div className="flex items-center justify-between"><span>Avg comments/PR</span><span className="font-semibold">{d.reviews.avgCommentsPerPr}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab==="coding" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-azure"/>Coding Standards</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {coding.map(s => (
              <div key={s.id} className="border border-white/5 rounded p-2 text-xs flex items-start gap-2">
                <Badge variant={s.severity==="required"?"crimson":s.severity==="recommended"?"amber":"slate"}>{s.severity}</Badge>
                <div className="flex-1">
                  <div className="font-semibold text-text-bright">{s.title} <span className="text-text-muted font-normal">· {s.category} · {s.rule}</span></div>
                  <div className="text-text-muted">{s.description}</div>
                  {s.examples?.good && <div className="text-emerald/80 mt-1 font-mono text-[10px]">✓ {s.examples.good}</div>}
                  {s.examples?.bad && <div className="text-crimson/80 font-mono text-[10px]">✗ {s.examples.bad}</div>}
                </div>
                <Badge variant={s.enabled?"emerald":"slate"}>{s.enabled?"on":"off"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab==="repo" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-teal"/>Repository Standards</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {repo.map(s => (
              <div key={s.id} className="border border-white/5 rounded p-2 text-xs flex items-start gap-2">
                <Badge variant="slate">{s.area}</Badge>
                <div className="flex-1">
                  <div className="font-semibold text-text-bright">{s.title}</div>
                  <div className="text-text-muted">{s.description}</div>
                  {s.tooling && <div className="text-text-muted font-mono text-[10px]">via {s.tooling}</div>}
                </div>
                <Badge variant={s.enforced?"emerald":"amber"}>{s.enforced?"enforced":"advisory"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab==="adr" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet"/>Architecture Decision Records ({adrs.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {adrs.map(a => (
              <div key={a.id} className="border border-white/5 rounded p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-muted">ADR-{String(a.number).padStart(3,"0")}</span>
                  <span className="font-semibold text-text-bright">{a.title}</span>
                  <Badge variant={a.status==="accepted"?"emerald":a.status==="proposed"?"azure":a.status==="superseded"?"amber":"slate"}>{a.status}</Badge>
                  <span className="text-text-muted ml-auto">{new Date(a.date).toLocaleDateString()}</span>
                </div>
                <div className="text-text-muted mt-1 line-clamp-2">{a.decision}</div>
                {a.tags.length>0 && <div className="mt-1 flex gap-1">{a.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab==="reviews" && (
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-azure"/>Open & Recent Reviews ({reviews.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reviews.slice(0,20).map(r => (
                <div key={r.id} className="border border-white/5 rounded p-2 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-text-bright">{r.title}</div>
                    <div className="text-text-muted">by {r.author}{r.reviewer?` · reviewed by ${r.reviewer}`:""} · {r.filesChanged} files · {r.comments} comments</div>
                  </div>
                  <Badge variant={r.status==="merged"?"emerald":r.status==="approved"?"azure":r.status==="changes_requested"?"amber":"default"}>{r.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab==="deps" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-amber"/>Dependencies ({deps.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={async()=>{ setDeps(await gov.govApi.rescanDependencies()); toast.success("rescanned"); }}><Activity className="h-3 w-3 mr-1"/>rescan</Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div className="text-xs"><div className="text-text-muted">total</div><div className="text-lg font-semibold">{deps.length}</div></div>
              <div className="text-xs"><div className="text-text-muted">outdated</div><div className="text-lg font-semibold text-amber">{deps.filter(x=>x.outdated).length}</div></div>
              <div className="text-xs"><div className="text-text-muted">vulnerable</div><div className="text-lg font-semibold text-crimson">{deps.filter(x=>x.vulnerability!=="none").length}</div></div>
              <div className="text-xs"><div className="text-text-muted">unlicensed</div><div className="text-lg font-semibold">{deps.filter(x=>!x.license||x.license==="UNLICENSED").length}</div></div>
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {deps.slice(0,80).map(x=>(
                <div key={x.id} className="text-[11px] font-mono flex items-center justify-between border-b border-white/5 py-1">
                  <span className="truncate"><span className="text-text-muted">{x.type}:</span> {x.name}@{x.currentVersion}</span>
                  <span className="flex items-center gap-1">
                    {x.outdated && <Badge variant="amber">outdated{x.latestVersion?` → ${x.latestVersion}`:""}</Badge>}
                    {x.vulnerability!=="none" && <Badge variant="crimson">{x.vulnerability} ({x.advisoryCount})</Badge>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab==="security" && d && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-crimson"/>Security Controls ({sec.length}) — Posture {d.security.score}/100</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sec.map(s=>(
              <div key={s.id} className="border border-white/5 rounded p-2 text-xs flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-text-bright">{s.control} <span className="text-text-muted font-normal">· {s.category}</span></div>
                  <div className="text-text-muted">{s.description}</div>
                  {s.implementation && <div className="text-emerald/80 text-[10px] font-mono">implementation: {s.implementation}</div>}
                </div>
                <Badge variant={s.status==="implemented"?"emerald":s.status==="partial"?"amber":s.status==="missing"?"crimson":"slate"}>{s.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Session 24: Release Management Tab ──────────────────────────────
function ReleaseTab() {
  const [sub, setSub] = useState<"overview"|"pipeline"|"approvals"|"ai"|"staging"|"production"|"improve">("overview");
  const m = useRefresh<rel.ReleaseMetrics | null>(() => rel.releaseApi.metrics(), 15_000);
  const rels = useRefresh<rel.Release[] | null>(() => rel.releaseApi.list(30), 15_000, [sub]);
  const metrics = m.data;
  const releases = rels.data;
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    Promise.all([
      rel.releaseApi.get(selected),
      rel.releaseApi.approvals(selected),
      rel.releaseApi.getValidation(selected),
      rel.releaseApi.getStaging(selected),
      rel.releaseApi.getProduction(selected),
    ]).then(([r, a, v, s, p]) => setDetail({ release: r, approvals: a, validation: v, staging: s, production: p }));
  }, [selected]);
  useEffect(() => {
    if (releases && releases.length > 0 && !selected) setSelected(releases[0]!.id);
  }, [releases]);

  const statusVariant = (s: string) =>
    s==="deployed"||s==="staging_validated"||s==="approved" ? "emerald" :
    s==="rolled_back"||s==="rejected" ? "crimson" :
    s.startsWith("staging")||s==="canary"||s==="rolling"||s==="canary_ramping"||s==="rolling_out"||s==="awaiting_approval"||s==="validating" ? "amber" : "slate";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Activity],
          ["pipeline","Pipeline",GitBranch],
          ["approvals","Approvals",ThumbsUp],
          ["ai","AI Validation",Zap],
          ["staging","Staging",Rocket],
          ["production","Production",Send],
          ["improve","Improvement",TrendingDown],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" && metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Total Releases</div><div className="text-2xl font-bold text-azure">{metrics.total}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Success Rate</div><div className="text-2xl font-bold text-emerald">{Math.round(metrics.successRate*100)}%</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Lead Time</div><div className="text-2xl font-bold text-violet">{metrics.avgLeadTimeHours.toFixed(1)}h</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Change Fail Rate</div><div className="text-2xl font-bold text-amber">{metrics.dora.changeFailRate.toFixed(1)}%</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Deploy Freq/wk</div><div className="text-2xl font-bold text-teal">{metrics.dora.deploymentFrequency.toFixed(1)}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">MTTR</div><div className="text-2xl font-bold text-crimson">{metrics.dora.mttrHours.toFixed(1)}h</div></CardContent></Card>
        </div>
      ) : sub==="overview" ? <Skeleton/> : null}

      {sub==="pipeline" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between flex">
            <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-azure"/>Release Pipeline</CardTitle>
            <Button size="sm" variant="outline" onClick={()=>rels.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {releases ? releases.map((r:any) => (
              <div key={r.id} onClick={()=>setSelected(r.id)}
                className={cn("border border-white/5 rounded p-2 text-xs cursor-pointer flex items-center gap-2 transition-colors hover:border-white/15",
                  selected===r.id ? "border-azure/60 bg-azure/5" : "")}>
                <Badge variant={statusVariant(r.status) as any}>R-{String(r.number).padStart(4,"0")}</Badge>
                <span className="font-semibold text-text-bright truncate max-w-[22rem]">{r.title}</span>
                <Badge variant="slate">v{r.version}</Badge>
                <Badge variant="slate">{r.service}</Badge>
                <Badge variant="slate">{r.risk}</Badge>
                <span className="ml-auto text-text-muted">{r.status}</span>
              </div>
            )) : <Skeleton/>}
          </CardContent>
        </Card>
      )}

      {!selected && sub!=="overview" && sub!=="pipeline" && (
        <Card><CardContent className="py-8 text-center text-text-muted text-xs">Select a release from the Pipeline tab.</CardContent></Card>
      )}

      {detail && sub==="approvals" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Approvals — {detail.release.title}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs">Quorum: {detail.approvals.summary.quorumMet ? <Badge variant="emerald">met</Badge> : <Badge variant="amber">pending</Badge>}</div>
            {detail.approvals.records.map((a:any)=>(
              <div key={a.id} className="border border-white/5 rounded p-2 text-xs flex items-center gap-2">
                <span className="font-mono">{a.gate}</span>
                <Badge variant={a.status==="approved"?"emerald":a.status==="rejected"?"crimson":"slate"}>{a.status}</Badge>
                {a.approver && <span className="text-text-muted">{a.approver}</span>}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="success" onClick={async()=>{await rel.releaseApi.vote(detail.release.id,a.gate,"approved");void rels.refresh();}}><ThumbsUp className="h-3 w-3"/></Button>
                  <Button size="sm" variant="danger" onClick={async()=>{await rel.releaseApi.vote(detail.release.id,a.gate,"rejected");void rels.refresh();}}><ThumbsDown className="h-3 w-3"/></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {detail && sub==="ai" && (
        <Card>
          <CardHeader className="flex items-center justify-between flex-row">
            <CardTitle className="text-sm">AI Validation — {detail.release.title}</CardTitle>
            <Button size="sm" variant="outline" onClick={async()=>{await rel.releaseApi.runValidation(detail.release.id);setSelected(null);setTimeout(()=>setSelected(detail.release.id),300);}}><Activity className="h-3 w-3 mr-1"/>run validation</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.validation ? (<>
              <div className="flex items-center gap-2 text-xs">
                <span>Score: <strong>{detail.validation.score}</strong></span>
                <Badge variant={detail.validation.overallPassed?"emerald":"crimson"}>{detail.validation.overallPassed?"PASSED":"FAILED"}</Badge>
              </div>
              {detail.validation.checks.map((c:any)=>(
                <div key={c.id} className="border border-white/5 rounded p-2 text-xs flex items-center gap-2">
                  {c.passed ? <Check className="h-3 w-3 text-emerald"/> : <X className="h-3 w-3 text-crimson"/>}
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant={c.severity==="blocker"?"crimson":c.severity==="error"?"amber":"slate"}>{c.severity}</Badge>
                  <span className="text-text-muted truncate">{c.message}</span>
                </div>
              ))}
            </>) : <div className="text-xs text-text-muted">No validation run yet. Click "run validation" to start.</div>}
          </CardContent>
        </Card>
      )}

      {detail && sub==="staging" && (
        <Card>
          <CardHeader className="flex items-center justify-between flex-row">
            <CardTitle className="text-sm">Staging — {detail.release.title}</CardTitle>
            <Button size="sm" variant="primary" onClick={async()=>{await rel.releaseApi.deployStaging(detail.release.id);setSelected(null);setTimeout(()=>setSelected(detail.release.id),300);}}><Rocket className="h-3 w-3 mr-1"/>deploy to staging</Button>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {detail.staging ? (<>
              <div>Status: <Badge variant={detail.staging.status==="healthy"?"emerald":"amber"}>{detail.staging.status}</Badge></div>
              <div>URL: <span className="font-mono text-azure">{detail.staging.url}</span></div>
              <div>Smoke: {detail.staging.smokeTestsPassed}/{detail.staging.smokeTestsPassed+detail.staging.smokeTestsFailed} passed</div>
              <div>Regression: {detail.staging.regressionPassRate}%</div>
              <div>Health checks: {detail.staging.healthChecksPassed?<Badge variant="emerald">passing</Badge>:<Badge variant="crimson">failing</Badge>}</div>
            </>) : <div className="text-text-muted">Not deployed to staging yet. Click "deploy to staging" to start.</div>}
          </CardContent>
        </Card>
      )}

      {detail && sub==="production" && (
        <Card>
          <CardHeader className="flex items-center justify-between flex-row gap-2 flex-wrap">
            <CardTitle className="text-sm">Production — {detail.release.title}</CardTitle>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={async()=>{await rel.releaseApi.promote(detail.release.id,5);setSelected(null);setTimeout(()=>setSelected(detail.release.id),300);}}>promote (5% canary)</Button>
              <Button size="sm" variant="success" onClick={async()=>{await rel.releaseApi.rollout(detail.release.id);setSelected(null);setTimeout(()=>setSelected(detail.release.id),300);}}>full rollout</Button>
              <Button size="sm" variant="danger" onClick={async()=>{await rel.releaseApi.rollback(detail.release.id);setSelected(null);setTimeout(()=>setSelected(detail.release.id),300);}}>rollback</Button>
            </div>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {detail.production ? (<>
              <div>Status: <Badge variant={detail.production.status==="deployed"?"emerald":detail.production.status==="rolled_back"?"crimson":"amber"}>{detail.production.status}</Badge></div>
              <div>Canary: {detail.production.canaryPercent}%</div>
              <div>Healthy at 100%: {detail.production.healthyAt100?<Badge variant="emerald">yes</Badge>:<Badge variant="amber">no</Badge>}</div>
              <div>p95 latency: {detail.production.p95LatencyMs} ms</div>
              <div>Error rate: {detail.production.errorRate}%</div>
            </>) : <div className="text-text-muted">Not yet promoted. Deploy to staging and get approval first.</div>}
          </CardContent>
        </Card>
      )}

      {sub==="improve" && metrics ? (
        <div className="grid md:grid-cols-2 gap-3">
          <Card><CardHeader><CardTitle className="text-sm">DORA Metrics</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Deployment Frequency</span><strong>{metrics.dora.deploymentFrequency.toFixed(1)}/wk</strong></div>
              <div className="flex justify-between"><span>Lead Time for Changes</span><strong>{metrics.dora.leadTimeHours.toFixed(1)}h</strong></div>
              <div className="flex justify-between"><span>Change Fail Rate</span><strong>{metrics.dora.changeFailRate.toFixed(1)}%</strong></div>
              <div className="flex justify-between"><span>MTTR</span><strong>{metrics.dora.mttrHours.toFixed(1)}h</strong></div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
            <CardContent className="text-xs">
              {Object.entries(metrics.byStatus).map(([k,v]:any)=>(
                <div key={k} className="flex justify-between"><span>{k}</span><strong>{v}</strong></div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : sub==="improve" ? <Skeleton/> : null}
    </div>
  );
}

// ─── Session 25: AI Program Management Tab ────────────────────────────
function ProgramTab() {
  const [sub, setSub] = useState<"overview"|"roadmap"|"sprints"|"requirements"|"arch"|"risks"|"exec">("overview");
  const roadmaps = useRefresh<pgm.Roadmap[]>(() => pgm.programApi.listRoadmaps(), 20_000);
  const sprints = useRefresh<pgm.Sprint[]>(() => pgm.programApi.listSprints(), 20_000);
  const backlog = useRefresh<pgm.Story[]>(() => pgm.programApi.listBacklog(), 20_000);
  const intel = useRefresh<pgm.RequirementIntel | null>(() => pgm.programApi.intel(), 20_000);
  const reviews = useRefresh<pgm.ArchReview[]>(() => pgm.programApi.listReviews(), 20_000);
  const hotspots = useRefresh<pgm.ArchHotspot[]>(() => pgm.programApi.hotspots(), 60_000);
  const risks = useRefresh<pgm.Risk[]>(() => pgm.programApi.listRisks(), 20_000);
  const matrix = useRefresh<pgm.RiskMatrix | null>(() => pgm.programApi.matrix(), 20_000);
  const report = useRefresh<pgm.ExecReport | null>(() => pgm.programApi.latestReport(), 30_000);
  const [selectedRoadmap, setSelectedRoadmap] = useState<string | null>(null);
  const [initiatives, setInitiatives] = useState<pgm.Initiative[]>([]);
  useEffect(() => {
    const rm = roadmaps.data;
    if (rm && rm.length > 0 && !selectedRoadmap) setSelectedRoadmap(rm[0]!.id);
  }, [roadmaps.data]);
  useEffect(() => {
    if (!selectedRoadmap) { setInitiatives([]); return; }
    pgm.programApi.listInitiatives(selectedRoadmap).then(setInitiatives);
  }, [selectedRoadmap]);

  const riskColor = (l: number, i: number) => l*i >= 16 ? "crimson" : l*i >= 9 ? "amber" : "emerald";
  const statusTone = (s: string): any =>
    s==="completed"||s==="done"||s==="approved"||s==="resolved"||s==="deployed" ? "emerald" :
    s==="at_risk"||s==="blocked"||s==="mitigating"||s==="escalated" ? "crimson" :
    s==="in_progress"||s==="active"||s==="rolling"||s==="canary" ? "azure" : "slate";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",LineChart],
          ["roadmap","Roadmap",Target],
          ["sprints","Sprints",Kanban],
          ["requirements","Requirements",FileSearch],
          ["arch","Arch Review",DraftingCompass],
          ["risks","Risks",AlertOctagon],
          ["exec","Exec Report",BookOpen],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" && (report.data ? (
        <div className="space-y-3">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-text-muted">Executive Snapshot — {report.data.period}</div>
                  <div className="text-lg font-bold text-text-bright mt-1">{report.data.headline}</div>
                  <div className="text-xs text-text-muted mt-2 max-w-3xl">{report.data.summary}</div>
                </div>
                <Button size="sm" variant="outline" onClick={()=>report.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {report.data.kpis.map(k=>(
              <Card key={k.id}><CardContent className="py-4">
                <div className="text-xs text-text-muted">{k.label}</div>
                <div className="text-2xl font-bold text-text-bright">{k.value}{k.unit?<span className="text-sm text-text-muted ml-0.5">{k.unit}</span>:null}</div>
                <div className={cn("text-[11px] mt-1 flex items-center gap-1",
                  k.trend==="up"?"text-emerald":k.trend==="down"?"text-crimson":"text-text-muted")}>
                  {k.trend==="up"?<TrendingUp className="h-3 w-3"/>:k.trend==="down"?<TrendingDown className="h-3 w-3"/>:<Activity className="h-3 w-3"/>}
                  {typeof k.deltaPct==="number" ? `${k.deltaPct>0?"+":""}${k.deltaPct}%` : k.trend}
                </div>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-violet"/>Highlights</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {report.data.highlights.map((h,i)=>(<div key={i} className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald mt-0.5"/>{h}</div>))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber"/>Watch Items</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {report.data.watchItems.map((h,i)=>(<div key={i} className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber mt-0.5"/>{h}</div>))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : <Skeleton/>)}

      {sub==="roadmap" && (
        <div className="grid md:grid-cols-4 gap-3">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-azure"/>Roadmaps</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {(roadmaps.data??[]).map(r=>(
                <button key={r.id} onClick={()=>setSelectedRoadmap(r.id)}
                  className={cn("w-full text-left rounded p-2 text-xs flex items-center gap-2 transition-colors",
                    selectedRoadmap===r.id?"bg-azure/10 border border-azure/40":"hover:bg-white/5 border border-transparent")}>
                  <span className="font-semibold truncate">{r.title}</span>
                  <Badge variant={r.status==="approved"?"emerald":"slate"} className="ml-auto">{r.status}</Badge>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardHeader className="flex-row items-center justify-between flex">
              <CardTitle className="text-sm">Initiatives</CardTitle>
              <Button size="sm" variant="outline" onClick={()=>roadmaps.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {initiatives.map(i=>(
                <div key={i.id} className="border border-white/5 rounded p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={i.priority==="p0"?"crimson":i.priority==="p1"?"amber":"slate"}>{i.priority.toUpperCase()}</Badge>
                    <span className="font-semibold text-text-bright">{i.title}</span>
                    <Badge variant="slate">{i.quarter} {i.year}</Badge>
                    <Badge variant="slate"><Users className="h-3 w-3 inline mr-0.5"/>{i.owner}</Badge>
                    <Badge variant={statusTone(i.status) as any}>{i.status}</Badge>
                    <span className="ml-auto text-text-muted">AI conf {i.aiConfidence}%</span>
                  </div>
                  <div className="text-text-muted">{i.description}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full bg-azure" style={{width:`${i.progressPct}%`}}/>
                    </div>
                    <span className="text-[11px] text-text-muted w-10 text-right">{i.progressPct}%</span>
                  </div>
                  {i.milestones.length>0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.milestones.map(m=>(
                        <Badge key={m.id} variant={m.status==="done"?"emerald":m.status==="at_risk"?"crimson":"amber"}>
                          {m.title} · {m.progressPct}%
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="sprints" && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Kanban className="h-4 w-4 text-teal"/>Sprints</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(sprints.data??[]).map(s=>(
                <div key={s.id} className="border border-white/5 rounded p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <Badge variant={s.status==="active"?"azure":s.status==="completed"?"emerald":"slate"}>{s.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted mt-1">
                    <Calendar className="h-3 w-3"/>{new Date(s.startAt).toLocaleDateString()}–{new Date(s.endAt).toLocaleDateString()}
                  </div>
                  <div className="text-[11px] mt-1">Goal: {s.goal}</div>
                  <div className="text-[11px] text-text-muted mt-1">
                    {s.completedPoints}/{s.capacityPoints} pts · projected velocity {s.velocityProjected}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader className="flex-row items-center justify-between flex">
              <CardTitle className="text-sm">Backlog</CardTitle>
              <Button size="sm" variant="outline" onClick={()=>backlog.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {(backlog.data??[]).slice(0,40).map(s=>(
                <div key={s.id} className="border border-white/5 rounded p-2 text-xs flex items-center gap-2">
                  <Badge variant="slate">{s.key}</Badge>
                  <span className="font-medium truncate flex-1">{s.title}</span>
                  {s.epic && <Badge variant="violet">{s.epic}</Badge>}
                  <Badge variant={s.status==="done"?"emerald":s.status==="in_progress"?"azure":s.status==="blocked"?"crimson":"slate"}>{s.status}</Badge>
                  <span className="font-mono text-[11px] text-text-muted w-8 text-right">{s.points||s.suggestedPoints||"-"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="requirements" && (intel.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Requirements</div><div className="text-2xl font-bold text-azure">{intel.data.totalRequirements}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Coverage Score</div><div className="text-2xl font-bold text-emerald">{intel.data.coverageScore}%</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Feedback Clusters</div><div className="text-2xl font-bold text-violet">{intel.data.feedbackClusters.length}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Open Gaps</div><div className="text-2xl font-bold text-amber">{intel.data.topGaps.length}</div></CardContent></Card>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Feedback Clusters</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {intel.data.feedbackClusters.map(f=>(
                  <div key={f.id} className="flex items-start gap-2">
                    <Badge variant={f.sentiment==="negative"?"crimson":f.sentiment==="positive"?"emerald":"slate"}>{f.sentiment}</Badge>
                    <div className="flex-1">
                      <div className="font-semibold">{f.theme} <span className="text-text-muted font-normal">({f.count} mentions)</span></div>
                      {f.sampleQuote && <div className="text-text-muted italic mt-0.5">"{f.sampleQuote}"</div>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Top Gaps</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {intel.data.topGaps.map((g,i)=>(
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber mt-0.5"/>
                    <span>{g}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : <Skeleton/>)}

      {sub==="arch" && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between flex">
              <CardTitle className="text-sm flex items-center gap-2"><DraftingCompass className="h-4 w-4 text-violet"/>Architecture Reviews</CardTitle>
              <Button size="sm" variant="outline" onClick={()=>reviews.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(reviews.data??[]).map(r=>(
                <div key={r.id} className="border border-white/5 rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{r.title}</span>
                    <Badge variant={r.status==="approved"?"emerald":r.status==="rejected"?"crimson":"amber"}>{r.status}</Badge>
                    <span className="ml-auto text-text-muted">AI score: {r.aiScore}</span>
                  </div>
                  <div className="text-text-muted">Scope: {r.scope} · requested by {r.requestedBy}</div>
                  {r.findings.length>0 && (
                    <div className="mt-2 space-y-1">
                      {r.findings.slice(0,4).map(f=>(
                        <div key={f.id} className="flex items-center gap-2">
                          <Badge variant={f.severity==="critical"?"crimson":f.severity==="high"?"amber":"slate"}>{f.severity}</Badge>
                          <span>{f.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Tech-Debt Hotspots</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {(hotspots.data??[]).map((h,i)=>(
                <div key={i} className="border border-white/5 rounded p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{h.area}</span>
                    <Badge variant={h.churnScore>75?"crimson":h.churnScore>50?"amber":"emerald"}>churn {h.churnScore}</Badge>
                    <span className="ml-auto text-text-muted">{h.debtHours}h debt</span>
                  </div>
                  <div className="text-text-muted mt-1">{h.recommendation}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="risks" && (matrix.data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Total Risks</div><div className="text-2xl font-bold text-azure">{matrix.data.total}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Critical</div><div className="text-2xl font-bold text-crimson">{matrix.data.criticalCount}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">High</div><div className="text-2xl font-bold text-amber">{matrix.data.highCount}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Residual Score</div><div className="text-2xl font-bold text-violet">{matrix.data.residualScore}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-crimson"/>Risk Register</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(risks.data??[]).map(r=>(
                <div key={r.id} className="border border-white/5 rounded p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text-muted w-14">{r.key}</span>
                    <span className="font-semibold">{r.title}</span>
                    <Badge variant="slate">{r.category}</Badge>
                    <Badge variant={riskColor(r.likelihood,r.impact) as any}>{r.likelihood}×{r.impact} = {r.likelihood*r.impact}</Badge>
                    <Badge variant={statusTone(r.status) as any}>{r.status}</Badge>
                    <span className="ml-auto text-text-muted"><Users className="h-3 w-3 inline mr-0.5"/>{r.owner}</span>
                  </div>
                  {r.description && <div className="text-text-muted mt-1 pl-14">{r.description}</div>}
                  {r.mitigations.length>0 && (
                    <div className="mt-1 pl-14 space-y-0.5">
                      {r.mitigations.map(m=>(
                        <div key={m.id} className="flex items-center gap-2 text-[11px]">
                          <Badge variant={m.status==="done"?"emerald":m.status==="in_progress"?"azure":"slate"}>{m.status}</Badge>
                          <span>{m.action}</span>
                          <span className="text-text-muted ml-auto">— {m.owner}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : <Skeleton/>)}

      {sub==="exec" && (report.data ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between flex">
            <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-azure"/>Executive Report — {report.data.period}</CardTitle>
            <Button size="sm" variant="primary" onClick={async()=>{await pgm.programApi.generateReport();report.refresh();}}><Zap className="h-3 w-3 mr-1"/>regenerate</Button>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="text-base font-bold text-text-bright">{report.data.headline}</div>
            <div className="text-text-muted leading-relaxed">{report.data.summary}</div>
            <div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">AI Narrative</div>
              <div className="leading-relaxed p-3 rounded bg-violet/5 border border-violet/20">{report.data.aiNarrative}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Objectives & Key Results</div>
              <div className="space-y-3">
                {report.data.okrs.map(o=>(
                  <div key={o.id} className="border border-white/5 rounded p-3">
                    <div className="font-semibold text-sm text-text-bright mb-2">{o.objective}</div>
                    <div className="space-y-1.5">
                      {o.keyResults.map((kr,i)=>(
                        <div key={i}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge variant={kr.status==="on_track"?"emerald":kr.status==="at_risk"?"amber":"crimson"}>{kr.status.replace("_"," ")}</Badge>
                            <span>{kr.title}</span>
                            <span className="ml-auto text-text-muted">{kr.progressPct}%</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded overflow-hidden">
                            <div className={cn("h-full",kr.status==="on_track"?"bg-emerald":kr.status==="at_risk"?"bg-amber":"bg-crimson")} style={{width:`${kr.progressPct}%`}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : <Skeleton/>)}
    </div>
  );
}

// ─── Session 26: Engineering Observability Tab ─────────────────────────
function EngineeringTab() {
  const [sub, setSub] = useState<"overview"|"metrics"|"deployments"|"debt"|"pipelines"|"devs">("overview");
  const dash = useRefresh<{
    services: eng.ServiceMetric[];
    deployments: eng.DeploymentAnalytics;
    debt: eng.DebtSummary;
    pipelines: eng.PipelineAnalytics;
    productivity: eng.ProductivitySummary;
  } | null>(() => eng.engApi.dashboard(), 20_000);
  const services = useRefresh<eng.ServiceMetric[]>(() => eng.engApi.listServices(), 20_000);
  const deploys = useRefresh<eng.DeploymentRecord[]>(() => eng.engApi.listDeployments(30), 20_000);
  const debts = useRefresh<eng.DebtItem[]>(() => eng.engApi.listDebt(), 30_000);
  const pipes = useRefresh<eng.PipelineRun[]>(() => eng.engApi.listPipelines(30), 20_000);
  const devs = useRefresh<eng.DeveloperStats[]>(() => eng.engApi.listDevelopers(), 30_000);

  const d = dash.data;
  const tierTone = (t: string) => t==="tier1"?"crimson":t==="tier2"?"amber":"slate";
  const sevTone = (s: string): any => s==="critical"?"crimson":s==="high"?"amber":s==="medium"?"violet":"emerald";
  const sevLabel = (s: string) => s;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["metrics","Services",Server],
          ["deployments","Deployments",Rocket],
          ["debt","Tech Debt",AlertTriangle],
          ["pipelines","Pipelines",GitCommit],
          ["devs","Developers",Users],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (
        <>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Services</div><div className="text-2xl font-bold text-azure">{d.services.length}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Deploys/wk</div><div className="text-2xl font-bold text-emerald">{d.deployments.deployFrequencyPerWeek.toFixed(1)}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Change Fail</div><div className="text-2xl font-bold text-amber">{d.deployments.changeFailRatePct.toFixed(1)}%</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Lead Time</div><div className="text-2xl font-bold text-violet">{d.deployments.leadTimeMedianHours.toFixed(1)}h</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Debt Items</div><div className="text-2xl font-bold text-crimson">{d.debt.totalItems} <span className="text-xs text-text-muted font-normal">({d.debt.totalEffortHours}h)</span></div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">CI Pass</div><div className="text-2xl font-bold text-teal">{d.pipelines.passRatePct.toFixed(0)}%</div></CardContent></Card>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-azure"/>DORA Metrics</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between"><span>Deployment frequency</span><strong>{d.productivity.dora.deploymentFrequency.toFixed(1)}/wk</strong></div>
                <div className="flex justify-between"><span>Lead time for changes</span><strong>{d.productivity.dora.leadTimeHours.toFixed(1)}h</strong></div>
                <div className="flex justify-between"><span>Change fail rate</span><strong>{d.productivity.dora.changeFailRate.toFixed(1)}%</strong></div>
                <div className="flex justify-between"><span>MTTR</span><strong>{d.productivity.dora.mttrHours.toFixed(1)}h</strong></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber"/>Debt Hotspots</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {d.debt.hotspots.slice(0,5).map(h=>(
                  <div key={h.area} className="flex items-center gap-2">
                    <span className="font-semibold w-28 truncate">{h.area}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full bg-amber" style={{width:`${Math.min(100,h.churnScore)}%`}}/>
                    </div>
                    <span className="text-text-muted w-20 text-right">{h.items} items · {h.effortHours}h</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitCommit className="h-4 w-4 text-teal"/>Pipeline Health</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between"><span>Runs (7d)</span><strong>{d.pipelines.totalRuns7d}</strong></div>
                <div className="flex justify-between"><span>Avg duration</span><strong>{Math.round(d.pipelines.avgDurationMs/1000)}s</strong></div>
                <div className="flex justify-between"><span>Flaky tests</span><strong>{d.pipelines.flakyCount}</strong></div>
                <div className="flex justify-between"><span>Slowest</span><strong>{d.pipelines.slowestPipeline}</strong></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-violet"/>Developer Pulse</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between"><span>Active devs</span><strong>{d.productivity.activeDevelopers}</strong></div>
                <div className="flex justify-between"><span>PRs merged (7d)</span><strong>{d.productivity.prsMerged7d}</strong></div>
                <div className="flex justify-between"><span>Avg time to merge</span><strong>{d.productivity.avgTimeToMergeHours.toFixed(1)}h</strong></div>
                <div className="flex justify-between"><span>Focus score</span><strong>{d.productivity.focusScorePct}%</strong></div>
              </CardContent>
            </Card>
          </div>
        </div>
        </>
      ) : <Skeleton/>) : null}

      {sub==="metrics" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4 text-azure"/>Service Health & SLOs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(services.data??[]).map(s=>(
              <div key={s.serviceId} className="border border-white/5 rounded p-2">
                <div className="flex items-center gap-2">
                  <Badge variant={tierTone(s.tier) as any}>{s.tier}</Badge>
                  <span className="font-semibold">{s.name}</span>
                  <Badge variant="slate">{s.owner}</Badge>
                  <span className="ml-auto text-text-muted">
                    p95 {s.p95LatencyMs}ms · err {s.errorRatePct.toFixed(2)}% · avail {s.availabilityPct.toFixed(3)}%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <div>
                    <div className="text-[10px] text-text-muted">Error budget</div>
                    <div className="h-1.5 bg-white/5 rounded overflow-hidden mt-0.5">
                      <div className={cn("h-full",s.errorBudgetRemainingPct>50?"bg-emerald":s.errorBudgetRemainingPct>20?"bg-amber":"bg-crimson")} style={{width:`${Math.min(100,s.errorBudgetRemainingPct)}%`}}/>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">Latency (p95/p99)</div>
                    <div>{s.p95LatencyMs}/{s.p99LatencyMs}ms</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">RPS</div>
                    <div>{s.rps}/s</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">Saturation</div>
                    <div>{s.saturationPct}%</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sub==="deployments" && d && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm">Deployment Stats</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Last 7d</span><strong>{d.deployments.deploysLast7d}</strong></div>
              <div className="flex justify-between"><span>Last 30d</span><strong>{d.deployments.deploysLast30d}</strong></div>
              <div className="flex justify-between"><span>Frequency</span><strong>{d.deployments.deployFrequencyPerWeek.toFixed(1)}/wk</strong></div>
              <div className="flex justify-between"><span>Change fail</span><strong className={d.deployments.changeFailRatePct>10?"text-crimson":"text-emerald"}>{d.deployments.changeFailRatePct.toFixed(1)}%</strong></div>
              <div className="flex justify-between"><span>Median lead time</span><strong>{d.deployments.leadTimeMedianHours.toFixed(1)}h</strong></div>
              <div className="flex justify-between"><span>MTTR</span><strong>{d.deployments.mttrHours.toFixed(1)}h</strong></div>
              <div className="flex justify-between"><span>Trend</span><Badge variant={d.deployments.trend==="improving"?"emerald":d.deployments.trend==="degrading"?"crimson":"slate"}>{d.deployments.trend}</Badge></div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-sm">Recent Deployments</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {(deploys.data??[]).slice(0,20).map(dep=>(
                <div key={dep.id} className="flex items-center gap-2 border-b border-white/5 py-1.5">
                  <Badge variant={dep.status==="success"?"emerald":dep.status==="failed"||dep.status==="rolled_back"?"crimson":"amber"}>{dep.status}</Badge>
                  <span className="font-mono text-[11px] text-text-muted w-16">{dep.environment}</span>
                  <span className="font-semibold">{dep.service}</span>
                  <Badge variant="slate">v{dep.version}</Badge>
                  <span className="text-text-muted">by {dep.triggeredBy}</span>
                  <span className="ml-auto text-text-muted">{Math.round(dep.durationMs/1000)}s{dep.leadTimeHours != null ? ` · ${dep.leadTimeHours.toFixed(1)}h lead` : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="debt" && d && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Open Debt</div><div className="text-2xl font-bold text-crimson">{d.debt.totalItems}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Effort</div><div className="text-2xl font-bold text-amber">{d.debt.totalEffortHours}h</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Added 30d</div><div className="text-2xl font-bold text-violet">{d.debt.debtAddedLast30d}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Resolved 30d</div><div className="text-2xl font-bold text-emerald">{d.debt.debtResolvedLast30d}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4 text-amber"/>Debt Register</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {(debts.data??[]).slice(0,40).map(it=>(
                <div key={it.id} className="flex items-center gap-2 border-b border-white/5 py-1.5">
                  <span className="font-mono text-[11px] text-text-muted w-20">{it.key}</span>
                  <Badge variant={sevTone(it.severity) as any}>{sevLabel(it.severity)}</Badge>
                  <Badge variant="slate">{it.category}</Badge>
                  <span className="font-semibold truncate flex-1">{it.title}</span>
                  <Badge variant="slate">{it.area}</Badge>
                  <span className="text-text-muted">{it.estimatedEffortHours}h</span>
                  <Badge variant={it.status==="resolved"?"emerald":it.status==="in_progress"?"azure":"slate"}>{it.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="pipelines" && d && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm">Pipeline Stats (7d)</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Total runs</span><strong>{d.pipelines.totalRuns7d}</strong></div>
              <div className="flex justify-between"><span>Pass rate</span><strong className={d.pipelines.passRatePct>90?"text-emerald":"text-amber"}>{d.pipelines.passRatePct.toFixed(1)}%</strong></div>
              <div className="flex justify-between"><span>Avg duration</span><strong>{Math.round(d.pipelines.avgDurationMs/1000)}s</strong></div>
              <div className="flex justify-between"><span>Median duration</span><strong>{Math.round(d.pipelines.medianDurationMs/1000)}s</strong></div>
              <div className="flex justify-between"><span>Flaky tests</span><Badge variant={d.pipelines.flakyCount>0?"crimson":"emerald"}>{d.pipelines.flakyCount}</Badge></div>
              <div className="flex justify-between"><span>Slowest</span><strong>{d.pipelines.slowestPipeline}</strong></div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-sm">Recent Runs</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {(pipes.data??[]).slice(0,20).map(p=>(
                <div key={p.id} className="flex items-center gap-2 border-b border-white/5 py-1.5">
                  <Badge variant={p.status==="passed"?"emerald":p.status==="failed"?"crimson":p.status==="running"?"azure":"slate"}>{p.status}</Badge>
                  <span className="font-semibold w-24 truncate">{p.pipeline}</span>
                  <Badge variant="slate">{p.branch}</Badge>
                  <span className="font-mono text-[11px] text-text-muted">{p.commitSha}</span>
                  <span className="text-text-muted">{p.author}</span>
                  {p.flaky && <Badge variant="amber">flaky</Badge>}
                  <span className="ml-auto text-text-muted flex items-center gap-1"><Timer className="h-3 w-3"/>{Math.round(p.durationMs/1000)}s</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="devs" && d && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Devs</div><div className="text-2xl font-bold text-azure">{d.productivity.activeDevelopers}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">PRs Merged (7d)</div><div className="text-2xl font-bold text-emerald">{d.productivity.prsMerged7d}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Time to Merge</div><div className="text-2xl font-bold text-violet">{d.productivity.avgTimeToMergeHours.toFixed(1)}h</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Focus Score</div><div className="text-2xl font-bold text-teal">{d.productivity.focusScorePct}%</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-violet"/>Developers</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {(devs.data??[]).map(dv=>(
                <div key={dv.id} className="flex items-center gap-2 border-b border-white/5 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-violet/20 text-violet flex items-center justify-center text-[10px] font-semibold">
                    {dv.displayName.split(" ").map(n=>n[0]).join("").slice(0,2)}
                  </div>
                  <span className="font-semibold w-36">{dv.displayName}</span>
                  <span className="text-text-muted">opened {dv.prsOpened}</span>
                  <span className="text-text-muted">merged <strong className="text-text-bright">{dv.prsMerged}</strong></span>
                  <span className="text-text-muted">reviewed {dv.prsReviewed}</span>
                  <span className="text-text-muted">ttm {dv.avgTimeToMergeHours.toFixed(1)}h</span>
                  <span className="ml-auto text-text-muted">focus {dv.focusScorePct}% · +{dv.linesChanged} lines</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Session 27: Developer Portal Tab ─────────────────────────────────
function DevPortalTab() {
  const [sub, setSub] = useState<"overview"|"sdks"|"cli"|"local"|"sandbox"|"emulator"|"toolkit">("overview");
  const dash = useRefresh<dev.DevPortalDashboard | null>(() => dev.devApi.dashboard(), 30_000);
  const sdks = useRefresh<dev.SDKPackage[]>(() => dev.devApi.listSdks(), 60_000);
  const cmds = useRefresh<dev.CLICommand[]>(() => dev.devApi.listCli(), 60_000);
  const envs = useRefresh<dev.DevEnvironment[]>(() => dev.devApi.listEnvs(), 15_000);
  const [sdkFilter, setSdkFilter] = useState<string>("all");
  const [selectedSdk, setSelectedSdk] = useState<dev.SDKPackage | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string>("");
  const d = dash.data;

  function catTone(c: string): any {
    return c==="agent"?"violet":c==="api"?"azure":c==="web"||c==="mobile"||c==="desktop"?"teal":
      c==="voice"?"fuchsia":c==="knowledge"||c==="memory"?"emerald":c==="plugin"||c==="marketplace"?"amber":
      c==="workflow"||c==="automation"?"crimson":"slate";
  }

  async function ctrlEnv(id: string, action: "start"|"stop") {
    setRunning(id);
    try {
      if (action==="start") await dev.devApi.startEnv(id); else await dev.devApi.stopEnv(id);
      await envs.refresh();
    } finally { setRunning(null); }
  }

  async function runTests() {
    setRunning("test"); setTestLog("Running platform-smoke suite...\n");
    try {
      const r = await dev.devApi.runTests("platform-smoke", "local");
      setTestLog(l=>l+`${r.passed} passed / ${r.failed} failed / ${r.skipped} skipped in ${(r.durationMs/1000).toFixed(1)}s · coverage ${r.coveragePct}% · ${r.status.toUpperCase()}\n`);
    } catch(e:any) { setTestLog(l=>l+`error: ${e?.message??"unknown"}\n`); }
    setRunning(null);
  }

  const filteredSdks = (sdks.data ?? []).filter(s => sdkFilter === "all" || s.category === sdkFilter);
  const envKind = (kind: string) => envs.data?.find(e => e.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["sdks","SDKs",Package],
          ["cli","CLI",Terminal],
          ["local","Local Dev",Cpu],
          ["sandbox","Sandbox",Layers],
          ["emulator","Emulator",Boxes],
          ["toolkit","Toolkit",TestTube2],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (
        <>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">SDKs</div><div className="text-2xl font-bold text-azure">{d.totalSdks}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">GA</div><div className="text-2xl font-bold text-emerald">{d.gaCount}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Beta</div><div className="text-2xl font-bold text-amber">{d.betaCount}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">CLI Commands</div><div className="text-2xl font-bold text-violet">{d.totalCliCommands}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Running Envs</div><div className="text-2xl font-bold text-teal">{d.runningEnvironments}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Weekly Downloads</div><div className="text-2xl font-bold text-fuchsia">{d.weeklyDownloadsTotal.toLocaleString()}</div></CardContent></Card>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Code2 className="h-4 w-4 text-azure"/>Featured SDKs</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {(sdks.data??[]).slice(0,6).map(s=>(
                  <div key={s.id} className="flex items-center gap-2">
                    <Badge variant={catTone(s.category) as any}>{s.category}</Badge>
                    <span className="font-semibold">{s.name}</span>
                    <Badge variant={s.status==="ga"?"emerald":s.status==="beta"?"amber":"slate"}>{s.status} v{s.version}</Badge>
                    <span className="ml-auto text-text-muted">★ {s.stars ?? "—"} · ↓ {s.weeklyDownloads != null ? s.weeklyDownloads.toLocaleString() : "—"}/wk</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TestTube2 className="h-4 w-4 text-teal"/>Recent Toolkit Runs</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted font-semibold">Tests</div>
                {d.recentRuns.length===0 && <div className="text-text-muted">No runs yet.</div>}
                {d.recentRuns.map(r=>(
                  <div key={r.id} className="flex items-center gap-2">
                    <Badge variant={r.status==="passed"?"emerald":"crimson"}>{r.status}</Badge>
                    <span>{r.name}</span>
                    <span className="text-text-muted">{r.passed}/{r.passed+r.failed+r.skipped}</span>
                    <span className="ml-auto text-text-muted">{(r.durationMs/1000).toFixed(1)}s · {r.coveragePct}% cov</span>
                  </div>
                ))}
                <div className="text-text-muted font-semibold pt-2">Deploys</div>
                {d.recentDeploys.map(r=>(
                  <div key={r.id} className="flex items-center gap-2">
                    <Badge variant={r.status==="passed"?"emerald":"crimson"}>{r.status}</Badge>
                    <span>{r.service}@{r.version}</span>
                    <Badge variant="slate">{r.target}</Badge>
                    <span className="ml-auto text-text-muted">{(r.durationMs/1000).toFixed(1)}s</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
        </>
      ) : <Skeleton/>) : null}

      {sub==="sdks" && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm">Categories</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {["all","agent","plugin","workflow","marketplace","knowledge","memory","automation","dashboard","web","mobile","desktop","voice","api"].map(c=>(
                <button key={c} onClick={()=>setSdkFilter(c)}
                  className={cn("w-full text-left rounded p-2 text-xs capitalize transition-colors",
                    sdkFilter===c?"bg-azure/10 border border-azure/40":"hover:bg-white/5 border border-transparent")}>
                  {c}
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader className="flex-row items-center justify-between flex">
              <CardTitle className="text-sm">SDK Packages {sdkFilter!=="all" && <Badge variant="slate" className="ml-2">{sdkFilter}</Badge>}</CardTitle>
              <Button size="sm" variant="outline" onClick={()=>sdks.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {filteredSdks.map(s=>(
                <div key={s.id} className="border border-white/5 rounded p-2 cursor-pointer hover:border-white/15" onClick={()=>setSelectedSdk(s)}>
                  <div className="flex items-center gap-2">
                    <Badge variant={catTone(s.category) as any}>{s.category}</Badge>
                    <span className="font-semibold text-text-bright">{s.name}</span>
                    <Badge variant="slate">{s.language}</Badge>
                    <Badge variant={s.status==="ga"?"emerald":s.status==="beta"?"amber":"slate"}>{s.status} v{s.version}</Badge>
                    <span className="ml-auto text-text-muted">★{s.stars ?? "—"} · ↓{s.weeklyDownloads != null ? s.weeklyDownloads.toLocaleString() : "—"}/wk</span>
                  </div>
                  <div className="text-text-muted mt-1">{s.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          {selectedSdk && (
            <Card className="md:col-span-3">
              <CardHeader className="flex-row items-start justify-between flex">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-azure"/>{selectedSdk.name}</CardTitle>
                  <div className="text-xs text-text-muted mt-1">{selectedSdk.description}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={()=>setSelectedSdk(null)}><X className="h-3 w-3"/></Button>
              </CardHeader>
              <CardContent className="text-xs space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={catTone(selectedSdk.category) as any}>{selectedSdk.category}</Badge>
                  <Badge variant="slate">{selectedSdk.language}</Badge>
                  <Badge variant={selectedSdk.status==="ga"?"emerald":selectedSdk.status==="beta"?"amber":"slate"}>{selectedSdk.status} v{selectedSdk.version}</Badge>
                  <span className="text-text-muted">★ {selectedSdk.stars ?? "—"} · ↓ {selectedSdk.weeklyDownloads != null ? selectedSdk.weeklyDownloads.toLocaleString() : "—"}/wk</span>
                  {selectedSdk.bundleSizeKb && <span className="text-text-muted">{selectedSdk.bundleSizeKb} kB gz</span>}
                  <span className="text-text-muted">slice {selectedSdk.sliceNumber}</span>
                </div>
                <div>
                  <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Install</div>
                  <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px] overflow-x-auto flex items-center gap-2">
                    <code className="flex-1">{selectedSdk.installSnippet}</code>
                    <Button size="sm" variant="outline" onClick={()=>navigator.clipboard?.writeText(selectedSdk.installSnippet)}><Copy className="h-3 w-3"/></Button>
                  </pre>
                </div>
                {selectedSdk.features.length>0 && (
                  <div>
                    <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Features</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedSdk.features.map(f=><Badge key={f} variant="slate">{f}</Badge>)}
                    </div>
                  </div>
                )}
                {selectedSdk.exampleSnippet && (
                  <div>
                    <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Example</div>
                    <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">{selectedSdk.exampleSnippet}</pre>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>window.open(selectedSdk.docsUrl,"_blank")}><BookOpen className="h-3 w-3 mr-1"/>docs</Button>
                  {selectedSdk.repoUrl && <Button size="sm" variant="outline" onClick={()=>window.open(selectedSdk.repoUrl,"_blank")}><GitBranch className="h-3 w-3 mr-1"/>repo</Button>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {sub==="cli" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Terminal className="h-4 w-4 text-violet"/>WINDELS CLI</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-2 font-mono">
            <div className="text-text-muted mb-2">$ windels --help</div>
            {(cmds.data??[]).map(c=>(
              <div key={c.id} className="border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 font-sans">
                  <span className="font-semibold text-azure">{c.name}</span>
                  <Badge variant="slate">{c.group}</Badge>
                  <span className="text-text-muted ml-auto">{c.summary}</span>
                </div>
                <div className="text-[11px] text-violet font-mono mt-1">{c.usage}</div>
                {c.flags.length>0 && (
                  <div className="pl-3 text-[11px] text-text-muted mt-1">
                    {c.flags.map(f=><div key={f.name}>--{f.name}{f.default?` (${f.default})`:""} — {f.description}</div>)}
                  </div>
                )}
                {c.examples.length>0 && (
                  <div className="pl-3 mt-1 space-y-0.5">
                    {c.examples.map((e,i)=><div key={i} className="text-teal">$ {e}</div>)}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(["local","sandbox","emulator"] as const).map(kind => (
        sub === kind && (() => {
          const e = envKind(kind);
          if (!e) return <Skeleton key={kind}/>;
          return (
            <Card key={kind}>
              <CardHeader className="flex-row items-center justify-between flex">
                <CardTitle className="text-sm flex items-center gap-2">
                  {kind==="local"?<Cpu className="h-4 w-4 text-azure"/>:kind==="sandbox"?<Layers className="h-4 w-4 text-teal"/>:<Boxes className="h-4 w-4 text-violet"/>}
                  {e.name}
                </CardTitle>
                <div className="flex gap-2">
                  {e.status!=="running" ? (
                    <Button size="sm" variant="primary" disabled={running===e.id} onClick={()=>ctrlEnv(e.id,"start")}><Play className="h-3 w-3 mr-1"/>{running===e.id?"starting...":"start"}</Button>
                  ) : (
                    <Button size="sm" variant="danger" disabled={running===e.id} onClick={()=>ctrlEnv(e.id,"stop")}><X className="h-3 w-3 mr-1"/>{running===e.id?"stopping...":"stop"}</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={e.status==="running"?"emerald":e.status==="starting"?"amber":e.status==="error"?"crimson":"slate"}>{e.status}</Badge>
                  <span className="text-text-muted">{e.services.length} services</span>
                  {e.cpuPct!==undefined && <span className="text-text-muted">cpu {e.cpuPct}%</span>}
                  {e.memMb!==undefined && <span className="text-text-muted">mem {e.memMb} MB</span>}
                  {e.uptimeSec!==undefined && e.status==="running" && <span className="text-text-muted">uptime {Math.round(e.uptimeSec/60)}m</span>}
                  {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-azure font-mono">{e.url}</a>}
                </div>
                <div>
                  <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Ports</div>
                  <div className="flex flex-wrap gap-1">
                    {e.ports.map(p=><Badge key={p.name} variant="slate">{p.name}:{p.port}</Badge>)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Logs</div>
                  <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {e.logs.length===0 ? "(no logs yet — click start)" : e.logs.join("\n")}
                  </pre>
                </div>
              </CardContent>
            </Card>
          );
        })()
      ))}

      {sub==="toolkit" && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TestTube2 className="h-4 w-4 text-teal"/>Testing SDK</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="text-text-muted">Run unit/integration/E2E suites across the monorepo with coverage aggregation.</div>
              <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px]">$ windels test --suite platform-smoke --target local</pre>
              <Button size="sm" variant="primary" disabled={running==="test"} onClick={runTests}><Play className="h-3 w-3 mr-1"/>{running==="test"?"running...":"run smoke"}</Button>
              {testLog && <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px] whitespace-pre-wrap">{testLog}</pre>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CloudUpload className="h-4 w-4 text-violet"/>Deployment Toolkit</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="text-text-muted">Build → test → canary → full rollout with automatic rollback.</div>
              <pre className="bg-black/40 border border-white/10 rounded p-2 font-mono text-[11px]">$ windels deploy api --canary 5 --env staging</pre>
              <div className="flex flex-wrap gap-1">
                <Badge variant="slate">blue-green</Badge><Badge variant="slate">canary</Badge><Badge variant="slate">rolling</Badge><Badge variant="slate">recreate</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Session 21: Infrastructure Tab ────────────────────────────────────
function InfraTab() {
  const [sub, setSub] = useState<"overview"|"cluster"|"iac"|"releases"|"bg"|"canary"|"regions"|"recs">("overview");
  const ov = useRefresh(() => infra.infraApi.overview(), 10_000);
  const nodes = useRefresh(() => infra.infraApi.nodes(), 10_000, [sub]);
  const workloads = useRefresh(() => infra.infraApi.workloads(), 10_000, [sub]);
  const stacks = useRefresh(() => infra.infraApi.stacks(), 10_000, [sub]);
  const releases = useRefresh(() => infra.infraApi.releases(), 10_000, [sub]);
  const regions = useRefresh(() => infra.infraApi.regions(), 15_000, [sub]);
  const recs = useRefresh(() => infra.infraApi.recommendations(), 15_000, [sub]);
  const alerts = useRefresh(() => infra.infraApi.alerts(), 10_000, [sub]);
  const [bgEnv, setBgEnv] = useState("prod"); const [bgSvc, setBgSvc] = useState("web");
  const bg = useRefresh(() => infra.infraApi.bgGet(bgEnv, bgSvc), 10_000, [sub, bgEnv, bgSvc]);
  const [cEnv, setCEnv] = useState("prod"); const [cSvc, setCSvc] = useState("api");
  const canary = useRefresh(() => infra.infraApi.canaryGet(cEnv, cSvc), 10_000, [sub, cEnv, cSvc]);
  const [bgStageVer, setBgStageVer] = useState("");
  const [cStartVer, setCStartVer] = useState("");
  const [cWeight, setCWeight] = useState(5);
  const [deployForm, setDeployForm] = useState({ env:"staging" as any, svc:"api" as any, ver:"0.20.1", strat:"rolling" as any });

  if (!ov.data) return <Skeleton/>;
  const d = ov.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Activity],
          ["cluster","Cluster",Boxes],
          ["iac","IaC",GitBranch],
          ["releases","Releases",Container],
          ["bg","Blue/Green",Server],
          ["canary","Canary",TrendingDown],
          ["regions","Multi-Region",Globe],
          ["recs","Optimization",HardDrive],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Stat label="Clusters" value={d.clusters.length} tone="azure"/>
            <Stat label="Regions" value={`${d.regionsOnline}/${d.regionsTotal}`} tone="emerald"/>
            <Stat label="Deployments" value={`${d.deploymentsReady}/${d.deployments}`}/>
            <Stat label="Active Releases" value={d.activeReleases}/>
            <Stat label="Open Alerts" value={d.openEscalations} tone={d.openEscalations?"crimson":"emerald"}/>
            <Stat label="Open Recs" value={d.openRecommendations} tone="amber"/>
            <Stat label="Est. Savings" value={`$${Math.round(d.estimatedMonthlySavingsUsd)}/mo`} tone="teal"/>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber"/>Firing Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(alerts.data ?? []).length === 0 && <div className="text-xs text-text-muted flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald"/> all clear</div>}
                {(alerts.data ?? []).map((a) => (
                  <div key={a.id} className="text-xs flex items-start gap-2 border border-white/5 rounded p-2">
                    <Badge variant={a.severity==="crit"?"crimson":a.severity==="warn"?"amber":"azure"}>{a.severity}</Badge>
                    <div className="flex-1"><div className="font-semibold">{a.name}</div><div className="text-text-muted">{a.message}</div></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Top Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(recs.data ?? []).slice(0,5).map((r) => (
                  <div key={r.id} className="text-xs flex items-start gap-2 border border-white/5 rounded p-2">
                    <Badge variant={r.severity==="high"?"crimson":r.severity==="medium"?"amber":"teal"}>{r.kind}</Badge>
                    <div className="flex-1"><div className="font-semibold">{r.summary}</div><div className="text-emerald">save ~${Math.round(r.estimatedSavingsUsdPerMonth)}/mo</div></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {sub==="cluster" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">primary region</div><div className="text-2xl font-semibold">{d.primaryRegion}</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">cluster CPU</div><div className="text-2xl font-semibold">{d.clusters[0]?.cpuPercent.toFixed(0)}%</div></CardContent></Card>
            <Card><CardContent className="py-4"><div className="text-xs text-text-muted">cluster memory</div><div className="text-2xl font-semibold">{d.clusters[0]?.memoryPercent.toFixed(0)}%</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Nodes</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-text-muted"><th className="py-1">name</th><th>role</th><th>zone</th><th>cpu</th><th>mem</th><th>pods</th><th>status</th></tr></thead>
                <tbody>
                  {(nodes.data ?? []).map((n) => (
                    <tr key={n.name} className="border-t border-white/5">
                      <td className="py-1 font-mono">{n.name}</td>
                      <td>{n.roles.join(",")}</td>
                      <td>{n.zone}</td>
                      <td>{n.usage.cpuPercent.toFixed(0)}%</td>
                      <td>{n.usage.memoryPercent.toFixed(0)}%</td>
                      <td>{n.podCount}</td>
                      <td>{n.status === "healthy" ? <span className="text-emerald inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>healthy</span> : <span className="text-amber">{n.status}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Workloads</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2">
                {(workloads.data ?? []).map((w) => (
                  <div key={w.id} className="text-xs border border-white/5 rounded p-2 flex items-center justify-between">
                    <div><div className="font-semibold">{w.name} <span className="text-text-muted font-normal">· {w.namespace} · {w.kind}</span></div>
                    <div className="text-text-muted">{w.image}</div></div>
                    <div className="flex items-center gap-2">
                      <Badge variant={w.availableReplicas>=w.desiredReplicas?"emerald":"amber"}>{w.availableReplicas}/{w.desiredReplicas}</Badge>
                      {w.strategy && <Badge variant="violet">{w.strategy}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="iac" && (
        <div className="space-y-3">
          {(stacks.data ?? []).map((s) => (
            <Card key={s.id}>
              <CardHeader className="py-3 flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-teal"/>{s.name}<Badge variant={s.status==="applied"?"emerald":s.status==="drifted"?"crimson":"azure"}>{s.status}</Badge></CardTitle>
                  <CardDescription className="text-xs">{s.provider} · {s.environment} · {s.resources} resources · {s.path}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={async()=>{await infra.infraApi.runStack(s.id,"plan","web"); toast.success("plan queued"); stacks.refresh();}}>plan</Button>
                  <Button size="sm" variant="primary" onClick={async()=>{await infra.infraApi.runStack(s.id,"apply","web"); toast.success("apply queued"); stacks.refresh();}}>apply</Button>
                  {s.driftDetected && <Button size="sm" variant="danger" onClick={async()=>{await infra.infraApi.markDrift(s.id,false); toast.success("drift cleared"); stacks.refresh();}}>clear drift</Button>}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {sub==="releases" && (
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">New Deployment</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-5 gap-2">
              <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={deployForm.env} onChange={(e)=>setDeployForm({...deployForm,env:e.target.value as any})}>
                <option value="dev">dev</option><option value="staging">staging</option><option value="prod">prod</option>
              </select>
              <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={deployForm.svc} onChange={(e)=>setDeployForm({...deployForm,svc:e.target.value as any})}>
                <option value="api">api</option><option value="web">web</option><option value="all">all</option>
              </select>
              <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={deployForm.strat} onChange={(e)=>setDeployForm({...deployForm,strat:e.target.value as any})}>
                <option value="rolling">rolling</option><option value="blue-green">blue-green</option><option value="canary">canary</option><option value="recreate">recreate</option>
              </select>
              <Input placeholder="version e.g. 0.21.0" value={deployForm.ver} onChange={(e)=>setDeployForm({...deployForm,ver:e.target.value})}/>
              <Button size="sm" onClick={async()=>{await infra.infraApi.deploy({environment:deployForm.env,service:deployForm.svc,version:deployForm.ver,strategy:deployForm.strat}); toast.success("deploy started"); releases.refresh();}}>deploy</Button>
            </CardContent>
          </Card>
          {(releases.data ?? []).slice(0,20).map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 text-xs flex items-center justify-between">
                <div><span className="font-semibold">{r.service} v{r.version}</span> · <span className="text-text-muted">{r.environment}</span> · {r.strategy} by {r.author}</div>
                <Badge variant={r.status==="deployed"?"emerald":r.status==="failed"?"crimson":"azure"}>{r.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="bg" && (
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Blue/Green</CardTitle></CardHeader>
            <CardContent className="flex gap-2 items-end">
              <div><label className="text-xs text-text-muted block mb-1">env</label>
                <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={bgEnv} onChange={(e)=>setBgEnv(e.target.value)}>
                  <option value="prod">prod</option><option value="staging">staging</option>
                </select></div>
              <div><label className="text-xs text-text-muted block mb-1">svc</label>
                <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={bgSvc} onChange={(e)=>setBgSvc(e.target.value)}>
                  <option value="web">web</option><option value="api">api</option>
                </select></div>
              <div className="flex-1"><label className="text-xs text-text-muted block mb-1">stage version</label>
                <Input placeholder="0.21.0" value={bgStageVer} onChange={(e)=>setBgStageVer(e.target.value)}/></div>
              <Button size="sm" variant="outline" onClick={async()=>{if(!bgStageVer)return; await infra.infraApi.bgStage(bgEnv,bgSvc,bgStageVer); toast.success("staged"); bg.refresh();}}>stage</Button>
              <Button size="sm" variant="primary" onClick={async()=>{await infra.infraApi.bgSwap(bgEnv,bgSvc); toast.success("swapped"); bg.refresh();}} disabled={!bg.data?.stagingVersion}>swap</Button>
            </CardContent>
          </Card>
          {bg.data && (
            <Card>
              <CardContent className="py-4 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-text-muted">active</div><div className="text-lg font-semibold text-emerald">{bg.data.activeColor}</div><div>{bg.data.activeVersion}</div></div>
                <div><div className="text-text-muted">staging</div><div className="text-lg font-semibold text-amber">{bg.data.stagingColor || "—"}</div><div>{bg.data.stagingVersion ?? "none"}</div></div>
                <div><div className="text-text-muted">replicas</div><div>active {bg.data.activeReplicas} / staging {bg.data.stagingReplicas}</div></div>
                <div><div className="text-text-muted">last swap</div><div>{bg.data.lastSwappedAt ? new Date(bg.data.lastSwappedAt).toLocaleString() : "—"}</div></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {sub==="canary" && (
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Canary</CardTitle></CardHeader>
            <CardContent className="flex gap-2 items-end flex-wrap">
              <div><label className="text-xs text-text-muted block mb-1">env</label>
                <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={cEnv} onChange={(e)=>setCEnv(e.target.value)}>
                  <option value="prod">prod</option><option value="staging">staging</option>
                </select></div>
              <div><label className="text-xs text-text-muted block mb-1">svc</label>
                <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={cSvc} onChange={(e)=>setCSvc(e.target.value)}>
                  <option value="api">api</option><option value="web">web</option>
                </select></div>
              <div className="flex-1"><label className="text-xs text-text-muted block mb-1">canary version</label>
                <Input placeholder="0.21.0" value={cStartVer} onChange={(e)=>setCStartVer(e.target.value)}/></div>
              <div><label className="text-xs text-text-muted block mb-1">weight %</label>
                <input type="number" min={0} max={100} className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={cWeight} onChange={(e)=>setCWeight(Number(e.target.value))}/></div>
              <Button size="sm" variant="outline" onClick={async()=>{if(!cStartVer)return; await infra.infraApi.canaryStart(cEnv,cSvc,cStartVer); toast.success("canary started"); canary.refresh();}}>start</Button>
              <Button size="sm" variant="primary" onClick={async()=>{await infra.infraApi.canaryWeight(cEnv,cSvc,cWeight); toast.success("weight updated"); canary.refresh();}}>set weight</Button>
              <Button size="sm" variant="danger" onClick={async()=>{await infra.infraApi.canaryWeight(cEnv,cSvc,0); toast.success("rolled back"); canary.refresh();}}>rollback</Button>
              <Button size="sm" variant="primary" onClick={async()=>{await infra.infraApi.canaryWeight(cEnv,cSvc,100); toast.success("promoted"); canary.refresh();}}>promote</Button>
            </CardContent>
          </Card>
          {canary.data && (
            <Card>
              <CardContent className="py-4 text-xs grid grid-cols-2 md:grid-cols-5 gap-3">
                <div><div className="text-text-muted">status</div><div className="text-lg font-semibold">{canary.data.status}</div></div>
                <div><div className="text-text-muted">stable</div><div>{canary.data.stableVersion}</div></div>
                <div><div className="text-text-muted">canary</div><div>{canary.data.canaryVersion ?? "—"}</div></div>
                <div><div className="text-text-muted">weight</div><div className="text-lg font-semibold text-amber">{canary.data.canaryWeightPercent}%</div></div>
                <div><div className="text-text-muted">p95</div><div>{canary.data.latencyP95}ms · err {canary.data.errorRate}%</div></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {sub==="regions" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(regions.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader className="py-3 flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-azure"/>{r.name}<Badge variant={r.status==="online"?"emerald":r.status==="degraded"?"amber":"crimson"}>{r.status}</Badge></CardTitle>
                  <CardDescription className="text-xs">{r.cloud} · {r.tier} · {r.replicationRole} · lag {r.replicationLagMs ?? 0}ms · priority {r.failoverPriority}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-xs grid grid-cols-3 gap-2">
                <div><div className="text-text-muted">load</div><div className="text-base font-semibold">{r.loadPercent.toFixed(0)}%</div></div>
                <div><div className="text-text-muted">rps</div><div>{r.capacity.requestsPerSec.toLocaleString()}</div></div>
                <div><div className="text-text-muted">pods</div><div>{r.capacity.pods}</div></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="recs" && (
        <div className="space-y-2">
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={async()=>{await infra.infraApi.generateRecs(); toast.success("recommendations generated"); recs.refresh();}}>re-scan</Button></div>
          {(recs.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader className="py-3 flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-emerald"/>{r.summary}<Badge variant={r.severity==="high"?"crimson":r.severity==="medium"?"amber":"teal"}>{r.severity}</Badge></CardTitle>
                  <CardDescription className="text-xs">{r.target.kind}/{r.target.name} · risk {r.risk} · save ${Math.round(r.estimatedSavingsUsdPerMonth)}/mo</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="primary" onClick={async()=>{await infra.infraApi.setRecStatus(r.id,"applied"); toast.success("applied"); recs.refresh();}}>apply</Button>
                  <Button size="sm" variant="ghost" onClick={async()=>{await infra.infraApi.setRecStatus(r.id,"dismissed"); recs.refresh();}}>dismiss</Button>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-text-muted">{r.details}</CardContent>
            </Card>
          ))}
          {(recs.data ?? []).length===0 && <div className="text-xs text-text-muted">all optimizations applied</div>}
        </div>
      )}
    </div>
  );
}

// ─── Session 28: Extension Platform Tab ───────────────────────────────
function ExtensionsTab() {
  const [sub, setSub] = useState<"overview"|"registry"|"business"|"industry"|"skills"|"agents"|"workflows"|"dashboards"|"components">("overview");
  const dash = useRefresh<ext.ExtensionsDashboard | null>(() => ext.extApi.dashboard(), 30_000);
  const reg = useRefresh<ext.Extension[]>(() => ext.extApi.list(), 30_000, [sub]);
  const biz = useRefresh<ext.BusinessModule[]>(() => ext.extApi.listBusiness(), 60_000, [sub]);
  const ind = useRefresh<ext.IndustryModule[]>(() => ext.extApi.listIndustry(), 60_000, [sub]);
  const sk  = useRefresh<ext.AISkill[]>(() => ext.extApi.listSkills(), 60_000, [sub]);
  const ag  = useRefresh<ext.CustomAgentDef[]>(() => ext.extApi.listAgents(), 60_000, [sub]);
  const wf  = useRefresh<ext.WorkflowExt[]>(() => ext.extApi.listWorkflows(), 60_000, [sub]);
  const da  = useRefresh<ext.DashboardExt[]>(() => ext.extApi.listDashboards(), 60_000, [sub]);
  const ui  = useRefresh<ext.UIComponentExt[]>(() => ext.extApi.listUi(), 60_000, [sub]);
  const [selected, setSelected] = useState<ext.Extension | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const d = dash.data;

  function kindTone(k: string): any {
    return k==="business"?"azure":k==="industry"?"violet":k==="skill"?"emerald":
      k==="agent"?"fuchsia":k==="workflow"?"crimson":k==="dashboard"?"amber":
      k==="ui-component"?"teal":"slate";
  }
  function statusTone(s: string): any {
    return s==="published"||s==="enabled"||s==="approved"?"emerald":
      s==="draft"?"slate":s==="installed"?"teal":
      s==="disabled"?"slate":s==="deprecated"?"amber":s==="retired"||s==="rejected"?"crimson":"azure";
  }
  function colorTone(c: string): any {
    return (c==="azure"||c==="violet"||c==="teal"||c==="fuchsia"||c==="amber"||c==="emerald"||c==="crimson") ? c : "slate";
  }

  async function install(id: string) {
    setBusy(id);
    try { await ext.extApi.install(id); await reg.refresh(); toast.success("extension installed"); }
    catch(e:any){ toast.error(e?.message??"install failed"); }
    setBusy(null);
  }
  async function uninstall(id: string) {
    setBusy(id);
    try { await ext.extApi.uninstall(id); await reg.refresh(); toast.success("extension uninstalled"); }
    catch(e:any){ toast.error(e?.message??"uninstall failed"); }
    setBusy(null);
  }
  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      if (enabled) await ext.extApi.enable(id); else await ext.extApi.disable(id);
      await reg.refresh(); toast.success(enabled ? "enabled" : "disabled");
    } catch(e:any){ toast.error(e?.message??"failed"); }
    setBusy(null);
  }

  const filteredReg = (reg.data??[]).filter(x => !q ||
    x.name.toLowerCase().includes(q.toLowerCase()) || x.description.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["registry","Registry",Package],
          ["business","Business",Briefcase],
          ["industry","Industry",Building2],
          ["skills","AI Skills",Sparkles],
          ["agents","Agents",Bot],
          ["workflows","Workflows",Workflow],
          ["dashboards","Dashboards",LayoutDashboard],
          ["components","UI Components",Component],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Extensions</div><div className="text-2xl font-bold text-azure">{d.totalExtensions}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Installed</div><div className="text-2xl font-bold text-emerald">{d.installedCount}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Enabled</div><div className="text-2xl font-bold text-teal">{d.enabledCount}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Certified</div><div className="text-2xl font-bold text-violet">{d.certifiedCount}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Avg Rating</div><div className="text-2xl font-bold text-amber">{d.avgRating.toFixed(1)}★</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Pending Review</div><div className="text-2xl font-bold text-fuchsia">{d.pendingReviews}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Puzzle className="h-4 w-4 text-azure"/>By Kind</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {Object.entries(d.byKind).map(([k,v]:any)=>(
                <div key={k} className="flex items-center gap-2">
                  <Badge variant={kindTone(k)}>{k.replace("-"," ")}</Badge>
                  <div className="flex-1 h-1.5 bg-white/5 rounded overflow-hidden">
                    <div className={cn("h-full",`bg-${kindTone(k)}`)} style={{width:`${Math.min(100,(v/Math.max(1,d.totalExtensions))*100)}%`,background:
                      k==="business"?"#3B82F6":k==="industry"?"#8B5CF6":k==="skill"?"#10B981":k==="agent"?"#D946EF":k==="workflow"?"#DC2626":k==="dashboard"?"#F59E0B":"#14B8A6"}}/>
                  </div>
                  <span className="text-text-muted w-6 text-right">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald"/>Installed Counts</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Business Modules</span><strong className="text-azure">{d.businessModules}</strong></div>
              <div className="flex justify-between"><span>Industry Modules</span><strong className="text-violet">{d.industryModules}</strong></div>
              <div className="flex justify-between"><span>AI Skills</span><strong className="text-emerald">{d.skills}</strong></div>
              <div className="flex justify-between"><span>Custom Agents</span><strong className="text-fuchsia">{d.agents}</strong></div>
              <div className="flex justify-between"><span>Workflow Exts</span><strong className="text-crimson">{d.workflowExts}</strong></div>
              <div className="flex justify-between"><span>Dashboard Exts</span><strong className="text-amber">{d.dashboardExts}</strong></div>
              <div className="flex justify-between"><span>UI Components</span><strong className="text-teal">{d.uiComponents}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-violet"/>Recent Installs</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {d.recentInstalls.length===0 && <div className="text-text-muted">No recent installs.</div>}
              {d.recentInstalls.map(r=>(
                <div key={r.id} className="flex items-center gap-2">
                  <Badge variant={kindTone(r.kind)}>{r.kind.slice(0,3)}</Badge>
                  <span className="font-semibold truncate">{r.name}</span>
                  <span className="ml-auto text-text-muted">{new Date(r.installedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="registry" && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-3">
            <CardHeader className="flex-row items-center justify-between flex gap-2">
              <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-azure"/>Extension Registry</CardTitle>
              <Input placeholder="Search extensions…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs"/>
              <Button size="sm" variant="outline" onClick={()=>reg.refresh()}><Activity className="h-3 w-3 mr-1"/>refresh</Button>
            </CardHeader>
          </Card>
          {filteredReg.map(e=>(
            <Card key={e.id} className="cursor-pointer hover:border-white/20" onClick={()=>setSelected(e)}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{e.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-text-bright truncate">{e.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{e.tagline}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-2 pt-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={kindTone(e.kind)}>{e.kind}</Badge>
                  <Badge variant={statusTone(e.status)}>{e.status.replace("_"," ")}</Badge>
                  <Badge variant={colorTone(e.color)}>{e.certified}</Badge>
                </div>
                <div className="text-text-muted line-clamp-2">{e.description}</div>
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>★ {e.ratingAvg.toFixed(1)} · ↓ {e.installCount.toLocaleString()}</span>
                  <span>v{e.version}</span>
                </div>
                <div className="flex gap-1 flex-wrap" onClick={(ev)=>ev.stopPropagation()}>
                  {!e.installed
                    ? <Button size="sm" variant="primary" disabled={busy===e.id || e.status!=="published"} onClick={()=>install(e.id)}><Power className="h-3 w-3 mr-1"/>{busy===e.id?"installing…":"install"}</Button>
                    : (<>
                        <Button size="sm" variant={e.enabled?"outline":"primary"} disabled={busy===e.id} onClick={()=>toggle(e.id,!e.enabled)}>{e.enabled?"disable":"enable"}</Button>
                        <Button size="sm" variant="danger" disabled={busy===e.id} onClick={()=>uninstall(e.id)}>remove</Button>
                      </>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && sub==="registry" && (
        <Card>
          <CardHeader className="flex-row items-start justify-between flex gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2"><span className="text-2xl">{selected.icon}</span>{selected.name}</CardTitle>
              <CardDescription className="text-xs">{selected.description}</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={()=>setSelected(null)}><X className="h-3 w-3"/></Button>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={kindTone(selected.kind)}>{selected.kind}</Badge>
              <Badge variant={statusTone(selected.status)}>{selected.status.replace("_"," ")}</Badge>
              <Badge variant={colorTone(selected.color)}>{selected.certified}</Badge>
              <span className="text-text-muted">by {selected.author}</span>
              <span className="text-text-muted">★ {selected.ratingAvg.toFixed(1)} ({selected.reviewCount})</span>
              <span className="text-text-muted">↓ {selected.installCount.toLocaleString()}</span>
              <span className="text-text-muted">{selected.sizeKb} kB</span>
              <span className="text-text-muted">{selected.license}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {selected.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}
            </div>
            {selected.permissions.length>0 && (
              <div>
                <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Permissions</div>
                <div className="flex gap-1 flex-wrap">{selected.permissions.map(p=><Badge key={p} variant="amber">{p}</Badge>)}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Versions</div>
              <div className="space-y-1">
                {selected.versions.slice(0,5).map(v=>(
                  <div key={v.version} className="flex items-center gap-2 border border-white/5 rounded p-2">
                    <Badge variant="slate">v{v.version}</Badge>
                    <span>{v.changelog}</span>
                    <span className="ml-auto text-text-muted">{new Date(v.releasedAt).toLocaleDateString()} · ↓{v.downloads}</span>
                  </div>
                ))}
              </div>
            </div>
            {selected.reviews.length>0 && (
              <div>
                <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Reviews</div>
                <div className="space-y-1">
                  {selected.reviews.slice(0,5).map(r=>(
                    <div key={r.id} className="border border-white/5 rounded p-2">
                      <div className="flex items-center gap-2">
                        <strong>{r.author}</strong>
                        <Badge variant="amber">{r.rating}★</Badge>
                        <span className="ml-auto text-text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-text-muted mt-1">{r.comment}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {sub==="business" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4 text-azure"/>Business Modules ({biz.data?.length??0})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(biz.data??[]).map(m=>(
              <div key={m.id} className="border border-white/5 rounded p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-bright">{m.name}</span>
                  <Badge variant="azure">{m.category}</Badge>
                  <Badge variant={statusTone(m.status)}>{m.status.replace("_"," ")}</Badge>
                  <span className="ml-auto text-text-muted">{m.users.toLocaleString()} users</span>
                </div>
                <div className="text-text-muted mt-1">{m.description}</div>
                <div className="mt-2 flex gap-3 text-[11px] text-text-muted">
                  <span>{m.entities} entities</span><span>{m.workflows} workflows</span><span>{m.dashboards} dashboards</span>
                </div>
                <div className="mt-1 flex gap-1 flex-wrap">{m.integrations.map(i=><Badge key={i} variant="slate">{i}</Badge>)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sub==="industry" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(ind.data??[]).map(m=>(
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-violet"/>{m.name}</CardTitle>
                <CardDescription className="text-xs">{m.vertical} · {m.region}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted">{m.description}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[10px] text-text-muted">AI Employees</div><strong className="text-fuchsia">{m.aiEmployees}</strong></div>
                  <div><div className="text-[10px] text-text-muted">Workflows</div><strong className="text-azure">{m.workflows}</strong></div>
                  <div><div className="text-[10px] text-text-muted">Dashboards</div><strong className="text-teal">{m.dashboards}</strong></div>
                  <div><div className="text-[10px] text-text-muted">Regulations</div><strong className="text-crimson">{m.regulations}</strong></div>
                </div>
                <div className="flex gap-1 flex-wrap">{m.compliancePacks.map(c=><Badge key={c} variant="violet">{c}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="skills" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(sk.data??[]).map(s=>(
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald"/>{s.name}</CardTitle>
                <CardDescription className="text-xs">{s.category} · {s.avgLatencyMs}ms · {s.accuracyPct}% accurate · {(s.uses||0).toLocaleString()} uses</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted">{s.description}</div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="teal">in: {s.inputs.join(", ")}</Badge>
                  <Badge variant="violet">out: {s.outputs.join(", ")}</Badge>
                </div>
                <div className="flex gap-1 flex-wrap">{s.assignableWorkforces.map(w=><Badge key={w} variant="slate">{w}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="agents" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(ag.data??[]).map(a=>(
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="inline-block h-6 w-6 rounded-full grid place-items-center text-[10px] font-semibold text-white" style={{background:a.color}}>{a.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>
                  {a.name}
                </CardTitle>
                <CardDescription className="text-xs">{a.role} · {a.department} · ★{a.rating}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted line-clamp-3">{a.description}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[10px] text-text-muted">Tasks</div><strong>{a.tasksCompleted.toLocaleString()}</strong></div>
                  <div><div className="text-[10px] text-text-muted">Avg task</div><strong>{a.avgTaskTimeMin}m</strong></div>
                  <div><div className="text-[10px] text-text-muted">Memory</div><strong>{a.memoryKb?"✓":"—"}</strong></div>
                  <div><div className="text-[10px] text-text-muted">Voice</div><strong>{a.voiceEnabled?"✓":"—"}</strong></div>
                </div>
                <div className="flex gap-1 flex-wrap">{a.skills.slice(0,4).map(s=><Badge key={s} variant="fuchsia">{s}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="workflows" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Workflow className="h-4 w-4 text-crimson"/>Workflow Extensions ({wf.data?.length??0})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(wf.data??[]).map(w=>(
              <div key={w.id} className="border border-white/5 rounded p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="crimson">{w.category}</Badge>
                  <span className="font-semibold">{w.name}</span>
                  <Badge variant={statusTone(w.status)}>{w.status.replace("_"," ")}</Badge>
                  <span className="ml-auto text-text-muted">×{w.invocations.toLocaleString()} · {(w.avgDurationMs)}ms · err {w.errorRatePct.toFixed(2)}%</span>
                </div>
                <div className="text-text-muted mt-1">{w.description}</div>
                <div className="flex gap-1 flex-wrap mt-1">{w.integrations.map(i=><Badge key={i} variant="slate">{i}</Badge>)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sub==="dashboards" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(da.data??[]).map(d=>(
            <Card key={d.id}>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-amber"/>{d.name}</CardTitle>
                <CardDescription className="text-xs">by {d.author} · {d.installations.toLocaleString()} installs · refresh {d.refreshRateSec}s</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted">{d.description}</div>
                <div className="flex gap-1 flex-wrap">{d.widgets.map(w=><Badge key={w} variant="amber">{w.replace("-"," ")}</Badge>)}</div>
                <div className="flex gap-1 flex-wrap">{d.dataSources.map(s=><Badge key={s} variant="slate">{s}</Badge>)}</div>
                <div className="flex gap-1 flex-wrap">{d.roles.map(r=><Badge key={r} variant="teal">{r}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="components" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(ui.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Component className="h-4 w-4 text-teal"/>{c.name}</CardTitle>
                <CardDescription className="text-xs">{c.category} · {c.framework} · {c.bundleKb} kB · ↓{c.downloads.toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted">{c.description}</div>
                <div className="flex gap-1 flex-wrap">
                  {c.a11y && <Badge variant="emerald">a11y</Badge>}
                  {c.darkMode && <Badge variant="violet">dark</Badge>}
                  {c.responsive && <Badge variant="azure">responsive</Badge>}
                  <Badge variant="slate">{c.props} props · {c.variants} variants</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformServicesTab() {
  const [sub, setSub] = useState<"overview"|"config"|"flags"|"runtime"|"policies"|"tenants"|"licensing"|"billing"|"capabilities"|"ontology"|"blueprints">("overview");
  const dash = useRefresh<psvc.PlatformServicesDashboard | null>(() => psvc.psvcApi.dashboard(), 30_000);
  const cfg = useRefresh<psvc.ConfigEntry[]>(() => psvc.psvcApi.listConfig(), 60_000, [sub]);
  const flags = useRefresh<psvc.FeatureFlag[]>(() => psvc.psvcApi.listFlags(), 30_000, [sub]);
  const pols = useRefresh<psvc.Policy[]>(() => psvc.psvcApi.listPolicies(), 30_000, [sub]);
  const tens = useRefresh<psvc.Tenant[]>(() => psvc.psvcApi.listTenants(), 60_000, [sub]);
  const lics = useRefresh<psvc.License[]>(() => psvc.psvcApi.listLicenses(), 60_000, [sub]);
  const bills = useRefresh<psvc.BillingAccount[]>(() => psvc.psvcApi.listBilling(), 60_000, [sub]);
  const caps = useRefresh<psvc.CapabilityRecord[]>(() => psvc.psvcApi.listCapabilities(), 30_000, [sub]);
  const onto = useRefresh<psvc.OntologyClass[]>(() => psvc.psvcApi.listOntology(), 60_000, [sub]);
  const bps = useRefresh<psvc.Blueprint[]>(() => psvc.psvcApi.listBlueprints(), 60_000, [sub]);
  const [busy, setBusy] = useState<string | null>(null);
  const d = dash.data;

  function healthTone(h: string): any {
    return h==="healthy"?"emerald":h==="degraded"?"amber":h==="down"?"crimson":"slate";
  }
  function planTone(p: string): any {
    return p==="enterprise"||p==="unlimited"||p==="dedicated"?"violet":p==="business"||p==="scale"?"azure":p==="team"||p==="growth"||p==="pro"?"teal":p==="starter"?"amber":"slate";
  }
  function statusTone(s: string): any {
    if (s==="active"||s==="current"||s==="healthy"||s==="paid"||s==="published") return "emerald";
    if (s==="paused"||s==="draft"||s==="simulation"||s==="provisioning"||s==="trial") return "azure";
    if (s==="delinquent"||s==="past_due"||s==="degraded"||s==="expiring") return "amber";
    if (s==="expired"||s==="suspended"||s==="revoked"||s==="down"||s==="canceled") return "crimson";
    return "slate";
  }
  function tierColor(t: string): any {
    return t==="unlimited"?"fuchsia":t==="enterprise"?"violet":t==="pro"?"azure":t==="core"?"teal":"slate";
  }

  async function toggleFlag(id: string) {
    setBusy(id);
    try { await psvc.psvcApi.toggleFlag(id); await flags.refresh(); toast.success("flag toggled"); }
    catch(e:any){ toast.error(e?.message??"toggle failed"); }
    setBusy(null);
  }
  async function togglePolicy(id: string) {
    setBusy(id);
    try {
      const cur = (pols.data??[]).find(p=>p.id===id);
      if (!cur) return;
      await psvc.psvcApi.patchPolicy(id, { status: cur.status==="active" ? "disabled" : "active" });
      await pols.refresh(); toast.success("policy updated");
    } catch(e:any){ toast.error(e?.message??"failed"); }
    setBusy(null);
  }
  async function revokeLicense(id: string) {
    setBusy(id);
    try { await psvc.psvcApi.revokeLicense(id); await lics.refresh(); toast.success("license revoked"); }
    catch(e:any){ toast.error(e?.message??"failed"); }
    setBusy(null);
  }
  async function installBlueprint(id: string) {
    setBusy(id);
    try { await psvc.psvcApi.installBlueprint(id); await bps.refresh(); toast.success("blueprint installed"); }
    catch(e:any){ toast.error(e?.message??"failed"); }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["config","Config",Settings],
          ["flags","Feature Flags",ToggleRight],
          ["runtime","Runtime",Zap],
          ["policies","Policies",ShieldCheck],
          ["tenants","Tenants",Building2],
          ["licensing","Licensing",KeyRound],
          ["billing","Billing",CreditCard],
          ["capabilities","Capabilities",Sparkles],
          ["ontology","Ontology",Network],
          ["blueprints","Blueprints",Library],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Config Entries</div><div className="text-2xl font-bold text-azure">{d.configEntries}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Feature Flags</div><div className="text-2xl font-bold text-violet">{d.featureFlags}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Flags</div><div className="text-2xl font-bold text-teal">{d.flagsActive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Policies</div><div className="text-2xl font-bold text-fuchsia">{d.policies}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Tenants</div><div className="text-2xl font-bold text-amber">{d.tenants}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Licenses</div><div className="text-2xl font-bold text-emerald">{d.licenses}</div></CardContent></Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Licenses</div><div className="text-2xl font-bold text-emerald">{d.licensesActive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Expiring (30d)</div><div className="text-2xl font-bold text-amber">{d.expiringLicenses30d}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Capabilities</div><div className="text-2xl font-bold text-azure">{d.capabilities}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Healthy</div><div className="text-2xl font-bold text-emerald">{d.capabilitiesHealthy}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Ontology Classes</div><div className="text-2xl font-bold text-violet">{d.ontologyClasses}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Blueprints</div><div className="text-2xl font-bold text-teal">{d.blueprints}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald"/>Commercial</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Billing accounts</span><strong>{d.accounts}</strong></div>
              <div className="flex justify-between"><span>Total MRR</span><strong className="text-emerald">${d.totalMrr.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Total ARR</span><strong className="text-teal">${d.totalArr.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Delinquent</span><strong className="text-crimson">{d.delinquentAccounts}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-fuchsia"/>Policy Engine</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Active policies</span><strong>{d.policiesActive}</strong></div>
              <div className="flex justify-between"><span>Evaluations (30d)</span><strong>{d.evaluations24h.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Violations (30d)</span><strong className="text-crimson">{d.violations24h.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Runtime overrides</span><strong className="text-amber">{d.runtimeOverrides}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-azure"/>Tenants</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Total</span><strong>{d.tenants}</strong></div>
              <div className="flex justify-between"><span>Active</span><strong className="text-emerald">{d.tenantsActive}</strong></div>
              <div className="flex justify-between"><span>Isolated</span><strong className="text-violet">{d.isolatedTenants}</strong></div>
              <div className="flex justify-between"><span>Config hot-reloadable</span><strong className="text-teal">{d.hotReloadable}</strong></div>
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="config" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(cfg.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4 text-azure"/>{c.key}</CardTitle>
                <CardDescription className="text-xs">{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={c.scope==="global"?"azure":"violet"}>{c.scope}</Badge>
                  <Badge variant="slate">{c.valueType}</Badge>
                  <Badge variant="slate">{c.source}</Badge>
                  {c.hotReload && <Badge variant="amber">hot-reload</Badge>}
                  {c.encrypted && <Badge variant="crimson">encrypted</Badge>}
                </div>
                <div className="bg-white/5 rounded p-2 font-mono text-[11px] truncate">
                  {c.encrypted ? "••••••••" : JSON.stringify(c.value)}
                </div>
                <div className="text-text-muted">by {c.updatedBy} · {new Date(c.updatedAt).toLocaleString()}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="flags" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(flags.data??[]).map(f=>(
            <Card key={f.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ToggleRight className={f.enabled?"h-4 w-4 text-emerald":"h-4 w-4 text-text-muted"}/>{f.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{f.key}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={statusTone(f.status)}>{f.status}</Badge>
                  <Badge variant="violet">{f.strategy}</Badge>
                  <Badge variant="teal">{f.rolloutPct}%</Badge>
                  <Badge variant="slate">v{f.version}</Badge>
                </div>
                <div className="text-text-muted">{f.description}</div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant={f.enabled?"outline":"primary"} disabled={busy===f.id} onClick={()=>toggleFlag(f.id)}>
                    {busy===f.id?"…":(f.enabled?"disable":"enable")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="runtime" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(cfg.data??[]).filter(c=>c.hotReload).map(c=>(
            <Card key={c.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber"/>{c.key}</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="bg-white/5 rounded p-2 font-mono text-[11px]">{JSON.stringify(c.value)}</div>
                <div className="text-text-muted">{c.description}</div>
                <Badge variant="amber">runtime-editable</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="policies" && (
        <div className="space-y-2">
          {(pols.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className={p.status==="active"?"h-4 w-4 text-fuchsia":"h-4 w-4 text-text-muted"}/>{p.name}
                <span className="ml-auto flex gap-1">
                  <Badge variant={p.effect==="deny"||p.effect==="block"?"crimson":p.effect==="throttle"?"amber":p.effect==="audit"?"teal":"emerald"}>{p.effect}</Badge>
                  <Badge variant="slate">p{p.priority}</Badge>
                  <Badge variant={statusTone(p.status)}>{p.status}</Badge>
                </span>
              </CardTitle>
                <CardDescription className="text-xs font-mono">{p.key} · {p.type} · v{p.version}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0 space-y-2">
                <div className="text-text-muted">{p.description}</div>
                <div className="flex gap-1 flex-wrap">
                  {p.conditions.map((cond,i)=>(
                    <Badge key={i} variant="slate">{cond.field} {cond.op} {JSON.stringify(cond.value)}</Badge>
                  ))}
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>evals {p.evaluations30d.toLocaleString()} · violations {p.violations30d.toLocaleString()}</span>
                  <Button size="sm" variant="outline" disabled={busy===p.id} onClick={()=>togglePolicy(p.id)}>{busy===p.id?"…":(p.status==="active"?"disable":"activate")}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="tenants" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(tens.data??[]).map(t=>(
            <Card key={t.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-azure"/>{t.displayName}</CardTitle>
                <CardDescription className="text-xs font-mono">{t.slug} · {t.region}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={planTone(t.plan)}>{t.plan}</Badge>
                  <Badge variant={statusTone(t.status)}>{t.status}</Badge>
                  <Badge variant={t.isolated?"violet":"slate"}>{t.isolation}</Badge>
                  {t.ssoEnabled && <Badge variant="emerald">SSO</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{t.seatsUsed}/{t.seats}</div>seats</div>
                  <div><div className="text-text-bright font-semibold">{t.usersActive30d}</div>active 30d</div>
                  <div><div className="text-text-bright font-semibold">${t.mrr.toLocaleString()}</div>MRR</div>
                </div>
                <div className="flex gap-1 flex-wrap">{t.dataResidency.map(r=><Badge key={r} variant="teal">{r}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="licensing" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(lics.data??[]).map(l=>(
            <Card key={l.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4 text-violet"/>{l.holder}</CardTitle>
                <CardDescription className="text-xs font-mono truncate">{l.key}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={tierColor(l.tier)}>{l.tier}</Badge>
                  <Badge variant={statusTone(l.status)}>{l.status}</Badge>
                  <Badge variant="slate">{l.seatsUsed}/{l.seats} seats</Badge>
                </div>
                <div className="text-text-muted">expires {new Date(l.expiresAt).toLocaleDateString()}</div>
                <div className="flex gap-1 flex-wrap">{l.features.map(f=><Badge key={f} variant="slate">{f}</Badge>)}</div>
                {l.status!=="revoked" && l.status!=="expired" && (
                  <Button size="sm" variant="danger" disabled={busy===l.id} onClick={()=>revokeLicense(l.id)}>{busy===l.id?"…":"revoke"}</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="billing" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(bills.data??[]).map(b=>(
            <Card key={b.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald"/>{b.plan} · {b.period}</CardTitle>
                <CardDescription className="text-xs font-mono">{b.tenantId}{b.lastFour?` · •••• ${b.lastFour}`:""}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={planTone(b.plan)}>{b.plan}</Badge>
                  <Badge variant={statusTone(b.status)}>{b.status}</Badge>
                  <Badge variant="slate">{b.currency}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">${b.mrr.toLocaleString()}</div>MRR</div>
                  <div><div className="text-text-bright font-semibold">${b.arr.toLocaleString()}</div>ARR</div>
                  <div><div className="text-text-bright font-semibold">{b.seats}</div>seats</div>
                </div>
                <div className="text-text-muted">next bill {new Date(b.nextBillAt).toLocaleDateString()}{b.dunningLevel>0?` · dunning L${b.dunningLevel}`:""}</div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(b.usageThisPeriod).map(([k,v])=>(
                    <Badge key={k} variant="slate">{k}: {String(v)}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="capabilities" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(caps.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia"/>{c.name}</CardTitle>
                <CardDescription className="text-xs">{c.producer} · v{c.version}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="azure">{c.kind}</Badge>
                  <Badge variant={healthTone(c.health)}>{c.health}</Badge>
                  {c.deprecated && <Badge variant="crimson">deprecated</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{c.p95Ms}ms</div>p95</div>
                  <div><div className="text-text-bright font-semibold">{c.errorRatePct.toFixed(2)}%</div>errors</div>
                  <div><div className="text-text-bright font-semibold">{c.requestsPerMin.toLocaleString()}</div>rpm</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="ontology" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(onto.data??[]).map(o=>(
            <Card key={o.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><span className="text-lg">{o.icon}</span>{o.label}</CardTitle>
                <CardDescription className="text-xs font-mono truncate">{o.uri}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={o.color as any}>{o.properties.length} props</Badge>
                  <Badge variant="slate">{o.instances} inst</Badge>
                </div>
                <div className="text-text-muted line-clamp-2">{o.description}</div>
                <div className="flex gap-1 flex-wrap">
                  {o.properties.slice(0,4).map(p=><Badge key={p.name} variant="slate">{p.name}:{p.type}</Badge>)}
                  {o.properties.length>4 && <Badge variant="slate">+{o.properties.length-4}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="blueprints" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(bps.data??[]).map(b=>(
            <Card key={b.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><span className="text-lg">{b.icon}</span>{b.name}</CardTitle>
                <CardDescription className="text-xs">{b.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={b.color as any}>{b.category}</Badge>
                  <Badge variant={tierColor(b.compatibility)}>{b.compatibility}</Badge>
                  <Badge variant="slate">{b.certified}</Badge>
                  {b.industry && <Badge variant="amber">{b.industry}</Badge>}
                </div>
                <div className="text-text-muted line-clamp-3">{b.description}</div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{b.modules.length}</div>modules</div>
                  <div><div className="text-text-bright font-semibold">{b.agents.length}</div>agents</div>
                  <div><div className="text-text-bright font-semibold">{b.skills.length}</div>skills</div>
                  <div><div className="text-text-bright font-semibold">{b.installs}</div>installs</div>
                </div>
                <Button size="sm" variant="primary" disabled={busy===b.id} onClick={()=>installBlueprint(b.id)}><FileStack className="h-3 w-3 mr-1"/>{busy===b.id?"…":"install"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MlOpsTab() {
  const [sub, setSub] = useState<"overview"|"models"|"deployments"|"monitors"|"governance"|"prompts"|"rag"|"indexes"|"embeddings"|"knowledge">("overview");
  const dash = useRefresh<ml.MlOpsDashboard | null>(() => ml.mlApi.dashboard(), 30_000);
  const models = useRefresh<ml.ModelArtifact[]>(() => ml.mlApi.listModels(), 30_000, [sub]);
  const deps = useRefresh<ml.ModelDeployment[]>(() => ml.mlApi.listDeployments(), 30_000, [sub]);
  const mons = useRefresh<ml.ModelMonitor[]>(() => ml.mlApi.listMonitors(), 30_000, [sub]);
  const pols = useRefresh<ml.ModelPolicy[]>(() => ml.mlApi.listModelPolicies(), 60_000, [sub]);
  const prompts = useRefresh<ml.PromptDef[]>(() => ml.mlApi.listPrompts(), 30_000, [sub]);
  const idx = useRefresh<ml.VectorIndex[]>(() => ml.mlApi.listIndexes(), 60_000, [sub]);
  const embs = useRefresh<ml.EmbeddingModel[]>(() => ml.mlApi.listEmbeddings(), 60_000, [sub]);
  const ks = useRefresh<ml.KnowledgeSource[]>(() => ml.mlApi.listKnowledge(), 30_000, [sub]);
  const rag = useRefresh<ml.RagPolicy | null>(() => ml.mlApi.getRagPolicy(), 60_000, [sub]);
  const d = dash.data;

  function kindTone(k: string): any {
    return k==="llm"?"azure":k==="embedding"?"teal":k==="reranker"?"violet":k==="vision"?"fuchsia":k==="audio"?"amber":k==="custom"?"slate":"azure";
  }
  function stageTone(s: string): any {
    return s==="production"?"emerald":s==="staging"||s==="canary"?"azure":s==="approval"?"violet":s==="shadow"?"teal":s==="draft"||s==="registering"?"slate":s==="deprecated"?"amber":s==="retired"||s==="rejected"?"crimson":"slate";
  }
  function envTone(e: string): any {
    return e==="prod"?"emerald":e==="staging"?"azure":e==="canary"?"fuchsia":e==="edge"?"teal":e==="dev"?"slate":"slate";
  }
  function depStatus(s: string): any {
    return s==="healthy"?"emerald":s==="degraded"?"amber":s==="failed"?"crimson":s==="rolling-back"?"amber":"azure";
  }
  function monTypeTone(t: string): any {
    return t==="safety"||t==="error"?"crimson":t==="drift"||t==="latency"?"amber":t==="quality"||t==="fairness"?"violet":t==="cost"?"teal":"azure";
  }
  function kindColor(k: string): any {
    return k==="document"?"azure":k==="wiki"?"violet":k==="web"?"teal":k==="db"?"fuchsia":k==="s3"?"amber":k==="api"?"emerald":k==="conversation"?"crimson":"slate";
  }
  function provTone(p: string): any {
    return p==="windels-self-hosted"||p==="windels"?"azure":p==="anthropic"?"violet":p==="openai"?"emerald":p==="google"?"fuchsia":p==="cohere"?"teal":p==="mistral"?"amber":"slate";
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["models","Models",Boxes],
          ["deployments","Deployments",Rocket],
          ["monitors","Monitoring",Activity],
          ["governance","Governance",ShieldCheck],
          ["prompts","Prompts",FileText],
          ["rag","RAG Policy",Brain],
          ["indexes","Vector Indexes",Database],
          ["embeddings","Embeddings",Sparkles],
          ["knowledge","Knowledge",BookOpen],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic=Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Models</div><div className="text-2xl font-bold text-azure">{d.models}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">In Production</div><div className="text-2xl font-bold text-emerald">{d.modelsInProduction}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Deployments</div><div className="text-2xl font-bold text-violet">{d.deployments}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Healthy</div><div className="text-2xl font-bold text-teal">{d.deploymentsHealthy}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Open Alerts</div><div className="text-2xl font-bold text-crimson">{d.alertsOpen}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Policies</div><div className="text-2xl font-bold text-fuchsia">{d.policiesEnforced}/{d.policies}</div></CardContent></Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Prompts</div><div className="text-2xl font-bold text-violet">{d.prompts}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Prompt Versions</div><div className="text-2xl font-bold text-fuchsia">{d.promptVersions}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">RAG Indices</div><div className="text-2xl font-bold text-teal">{d.ragIndices}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Vectors</div><div className="text-2xl font-bold text-azure">{d.vectorsIndexed.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Embeddings</div><div className="text-2xl font-bold text-emerald">{d.embeddingsModels}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Knowledge</div><div className="text-2xl font-bold text-amber">{d.knowledgeSources}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Boxes className="h-4 w-4 text-azure"/>Models by Kind</CardTitle></CardHeader>
            <CardContent className="text-xs">
              <div className="text-text-muted">LLM, Embedding, Reranker, Vision, Audio, Custom — lifecycle dev → staging → approval → prod.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-fuchsia"/>Policy Enforcement</CardTitle></CardHeader>
            <CardContent className="text-xs">
              <div className="text-text-muted">{d.policiesEnforced}/{d.policies} policies enforced (red-team, PII scan, injection, cost, latency SLO, region-lock).</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-teal"/>RAG Engine</CardTitle></CardHeader>
            <CardContent className="text-xs">
              <div className="text-text-muted">{d.ragIndices} indexes · {d.knowledgeDocuments.toLocaleString()} docs · {d.embeddingsModels} embeddings — hybrid retrieval w/ re-rank.</div>
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="models" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(models.data??[]).map(m=>(
            <Card key={m.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4 text-azure"/>{m.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{m.slug} · {m.provider}/{m.framework}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={kindTone(m.kind)}>{m.kind}</Badge>
                  <Badge variant={stageTone(m.currentStage)}>{m.currentStage}</Badge>
                  <Badge variant={provTone(m.provider)}>{m.provider}</Badge>
                  <Badge variant="slate">{m.certified}</Badge>
                </div>
                <div className="text-text-muted line-clamp-2">{m.description}</div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{m.versions.length}</div>versions</div>
                  <div><div className="text-text-bright font-semibold">{m.contextWindow?.toLocaleString()??"—"}</div>context</div>
                  <div><div className="text-text-bright font-semibold">{m.installs}</div>installs</div>
                  <div><div className="text-text-bright font-semibold">{m.avgLatencyMs}ms</div>p95</div>
                </div>
                <div className="flex gap-1 flex-wrap">{m.modalities.map(mo=><Badge key={mo} variant="slate">{mo}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="deployments" && (
        <div className="space-y-2">
          {(deps.data??[]).map(d=>(
            <Card key={d.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Rocket className="h-4 w-4 text-emerald"/>{d.name}
                <span className="ml-auto flex gap-1">
                  <Badge variant={envTone(d.environment)}>{d.environment}</Badge>
                  <Badge variant={depStatus(d.status)}>{d.status}</Badge>
                  <Badge variant="slate">{d.strategy}</Badge>
                </span>
              </CardTitle>
                <CardDescription className="text-xs">{d.region} · {d.endpoint} · {d.trafficPct}% traffic · {d.replicas} replicas ({d.cpu}/{d.memory}{d.gpu?` · ${d.gpu}`:""}) · by {d.deployedBy}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0 grid grid-cols-4 gap-2 text-text-muted">
                {/* Serving telemetry is undefined until the serving layer reports
                    it. Show an em dash rather than 0, which would read as a real
                    measurement of an idle deployment. */}
                <div><div className="text-text-bright font-semibold">{d.qps != null ? d.qps.toLocaleString() : "—"}</div>QPS</div>
                <div><div className="text-text-bright font-semibold">{d.p95Ms != null ? `${d.p95Ms}ms` : "—"}</div>p95</div>
                <div><div className="text-text-bright font-semibold">{d.errorRatePct != null ? `${d.errorRatePct.toFixed(2)}%` : "—"}</div>errors</div>
                <div><div className="text-text-bright font-semibold">{d.costPerHour != null ? `$${d.costPerHour}/h` : "—"}</div>cost</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="monitors" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(mons.data??[]).map(m=>(
            <Card key={m.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Activity className={m.firing?"h-4 w-4 text-crimson animate-pulse":"h-4 w-4 text-azure"}/>{m.name}
                {m.firing && <Badge variant="crimson">FIRING</Badge>}
              </CardTitle>
                <CardDescription className="text-xs font-mono">{m.metric} &gt; {m.threshold} · window {m.window}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={monTypeTone(m.type)}>{m.type}</Badge>
                  <Badge variant={m.enabled?"emerald":"slate"}>{m.enabled?"enabled":"paused"}</Badge>
                  <Badge variant={m.severity==="critical"?"crimson":m.severity==="warn"?"amber":"teal"}>{m.severity}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{m.currentValue.toFixed?.(2) ?? m.currentValue}</div>current</div>
                  <div><div className="text-text-bright font-semibold">{m.alerts.filter(a=>a.status==="open").length}</div>open alerts</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="governance" && (
        <div className="space-y-2">
          {(pols.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-fuchsia"/>{p.name}
                <Badge className="ml-auto" variant={p.enforced?"emerald":"slate"}>{p.enforced?"enforced":"off"}</Badge>
              </CardTitle>
                <CardDescription className="text-xs font-mono">{p.key} · {p.type}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0">
                <div className="text-text-muted">{p.description}</div>
                <div className="text-text-muted mt-1">applies to: {p.appliesToStages.join(", ")} · owner {p.owner} · pass {p.passes24h} / fail {p.failures24h} (24h)</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="prompts" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(prompts.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-violet"/>{p.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{p.slug} · {p.kind}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={p.color as any}>{p.kind}</Badge>
                  <Badge variant="slate">{p.versions.length} v</Badge>
                  <Badge variant="slate">{p.testCases.length} tests</Badge>
                  <Badge variant="teal">{p.uses.toLocaleString()} uses</Badge>
                </div>
                <div className="text-text-muted line-clamp-2">{p.description}</div>
                {p.testRuns[0] && (
                  <div className="flex justify-between bg-white/5 rounded p-2">
                    <span>last run on {p.testRuns[0].model}</span>
                    <strong className={p.testRuns[0].passPct>=80?"text-emerald":p.testRuns[0].passPct>=50?"text-amber":"text-crimson"}>
                      {p.testRuns[0].passPct}% pass · {p.testRuns[0].avgLatencyMs}ms
                    </strong>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="rag" && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-teal"/>RAG Governance Policy</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-2">
            {rag.data && (<>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><div className="text-text-muted">retrieval mode</div><Badge variant="teal">{rag.data.mode}</Badge></div>
                <div><div className="text-text-muted">citation required</div><Badge variant={rag.data.citationRequired?"emerald":"slate"}>{String(rag.data.citationRequired)}</Badge></div>
                <div><div className="text-text-muted">PII redaction</div><Badge variant={rag.data.piiRedact?"crimson":"slate"}>{String(rag.data.piiRedact)}</Badge></div>
                <div><div className="text-text-muted">enforced</div><Badge variant={rag.data.enforced?"emerald":"slate"}>{String(rag.data.enforced)}</Badge></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-text-muted">
                <div><div className="text-text-bright font-semibold">{rag.data.chunkSize}/{rag.data.chunkOverlap}</div>chunk/overlap</div>
                <div><div className="text-text-bright font-semibold">topK={rag.data.topK}</div>{rag.data.minScore} min score</div>
                <div><div className="text-text-bright font-semibold">{rag.data.maxDocsPerQuery}</div>max docs/query</div>
              </div>
              <div className="text-text-muted">{rag.data.description}</div>
            </>)}
          </CardContent>
        </Card>
      )}

      {sub==="indexes" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(idx.data??[]).map(v=>(
            <Card key={v.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-teal"/>{v.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{v.namespace} · {v.metric} · {v.dimensions}d · {v.region}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={v.status==="ready"?"emerald":v.status==="reindexing"?"amber":v.status==="error"?"crimson":"slate"}>{v.status}</Badge>
                  <Badge variant="slate">{v.shards}×{v.replicas}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{v.vectors.toLocaleString()}</div>vectors</div>
                  <div><div className="text-text-bright font-semibold">{v.documents.toLocaleString()}</div>docs</div>
                  <div><div className="text-text-bright font-semibold">{v.sizeMb}MB</div>size</div>
                </div>
                <div className="text-text-muted">{v.qps} QPS · {v.avgLatencyMs}ms</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="embeddings" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(embs.data??[]).map(e=>(
            <Card key={e.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia"/>{e.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{e.slug} · {e.provider}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={provTone(e.provider)}>{e.provider}</Badge>
                  <Badge variant={e.status==="active"?"emerald":e.status==="beta"?"amber":"slate"}>{e.status}</Badge>
                  {e.multilingual && <Badge variant="violet">multilingual</Badge>}
                  {e.normalized && <Badge variant="teal">normalized</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{e.dimensions}</div>dims</div>
                  <div><div className="text-text-bright font-semibold">{e.avgLatencyMs}ms</div>latency</div>
                  <div><div className="text-text-bright font-semibold">${e.costPer1kTokens}</div>/1k</div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(e.benchmarks).map(([k,v])=><Badge key={k} variant="slate">{k}:{v}</Badge>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="knowledge" && (
        <div className="grid md:grid-cols-2 gap-3">
          {(ks.data??[]).map(k=>(
            <Card key={k.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-amber"/>{k.name}</CardTitle>
                <CardDescription className="text-xs truncate font-mono">{k.uri}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={kindColor(k.kind)}>{k.kind}</Badge>
                  <Badge variant={k.status==="indexed"?"emerald":k.status==="indexing"?"azure":k.status==="quarantined"?"crimson":"amber"}>{k.status}</Badge>
                  <Badge variant={k.approved?"emerald":"crimson"}>{k.approved?"approved":"blocked"}</Badge>
                  {k.piiScanned && <Badge variant="violet">PII scanned</Badge>}
                </div>
                <div className="text-text-muted line-clamp-2">{k.description}</div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{k.documents}</div>docs</div>
                  <div><div className="text-text-bright font-semibold">{k.chunks}</div>chunks</div>
                  <div><div className="text-text-bright font-semibold">{k.sizeMb}MB</div>size</div>
                  <div><div className="text-text-bright font-semibold">{k.freshnessHours}h</div>fresh</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EnterpriseFoundationTab() {
  const [sub, setSub] = useState<"overview"|"data"|"identity"|"finops"|"resilience"|"quality"|"ops">("overview");
  const dash = useRefresh<any | null>(() => ef.efApi.dashboard(), 30_000);
  const conns = useRefresh<ef.FabricConnector[]>(() => ef.efApi.listConnectors(), 60_000, [sub]);
  const dps = useRefresh<ef.DataProduct[]>(() => ef.efApi.listProducts(), 60_000, [sub]);
  const prins = useRefresh<ef.IdentityPrincipal[]>(() => ef.efApi.listPrincipals(), 60_000, [sub]);
  const idps = useRefresh<ef.IdentityProviderRec[]>(() => ef.efApi.listIdps(), 60_000, [sub]);
  const sas = useRefresh<ef.ServiceAccount[]>(() => ef.efApi.listServiceAccounts(), 60_000, [sub]);
  const accts = useRefresh<ef.FinOpsAccount[]>(() => ef.efApi.listAccounts(), 60_000, [sub]);
  const anoms = useRefresh<ef.CostAnomaly[]>(() => ef.efApi.listAnomalies(), 30_000, [sub]);
  const opts = useRefresh<ef.Optimization[]>(() => ef.efApi.listOptimizations(), 60_000, [sub]);
  const incs = useRefresh<ef.ResilienceIncident[]>(() => ef.efApi.listIncidents(), 30_000, [sub]);
  const pbs = useRefresh<ef.SelfHealingPlaybook[]>(() => ef.efApi.listPlaybooks(), 60_000, [sub]);
  const bcps = useRefresh<ef.BcpPlan[]>(() => ef.efApi.listBcps(), 60_000, [sub]);
  const cards = useRefresh<ef.AiQualityScorecard[]>(() => ef.efApi.listScorecards(), 60_000, [sub]);
  const runs = useRefresh<ef.EvalRun[]>(() => ef.efApi.listEvalRuns(), 30_000, [sub]);
  const glob = useRefresh<ef.GlobalStatus | null>(() => ef.efApi.globalStatus(), 15_000, [sub]);
  const kpis = useRefresh<ef.ExecKpi[]>(() => ef.efApi.kpis(), 30_000, [sub]);
  const [busy, setBusy] = useState<string | null>(null);
  const d = dash.data;

  function provColor(p: string): string { return p==="aws"?"#F59E0B":p==="gcp"?"#8B5CF6":p==="azure"?"#3B82F6":p==="windels"?"#14B8A6":p==="on-prem"?"#64748B":"#64748B"; }
  function connTone(s: string): any { return s==="connected"?"emerald":s==="syncing"?"azure":s==="degraded"?"amber":s==="error"?"crimson":"slate"; }
  function kindTone(k: string): any {
    return k==="human"?"azure":k==="ai-agent"?"fuchsia":k==="service"?"teal":k==="api-key"?"amber":k==="device"?"slate":"violet";
  }
  function sevTone(s: string): any { return s==="sev1"?"crimson":s==="sev2"?"amber":s==="sev3"?"violet":"slate"; }
  function incStatus(s: string): any { return s==="resolved"||s==="postmortem"?"emerald":s==="mitigated"?"teal":s==="investigating"?"azure":"crimson"; }
  function dimColor(d: string): any { return d==="hallucination"||d==="toxicity"||d==="safety"?"crimson":d==="groundedness"||d==="accuracy"?"azure":d==="bias"?"fuchsia":"teal"; }

  async function applyOpt(id: string) {
    setBusy(id); try { await ef.efApi.applyOptimization(id); await opts.refresh(); toast.success("optimization applied"); }
    catch(e:any){ toast.error(e?.message??"failed"); } setBusy(null);
  }
  async function runPlaybook(id: string) {
    setBusy(id); try { await ef.efApi.runPlaybook(id); await pbs.refresh(); toast.success("playbook executed"); }
    catch(e:any){ toast.error(e?.message??"failed"); } setBusy(null);
  }
  async function ackAnomaly(id: string) {
    setBusy(id); try { await ef.efApi.ackAnomaly(id); await anoms.refresh(); toast.success("anomaly acknowledged"); }
    catch(e:any){ toast.error(e?.message??"failed"); } setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["data","Data Fabric",Database],
          ["identity","Identity",KeyIcon],
          ["finops","FinOps",DollarSign],
          ["resilience","Resilience",HeartPulse],
          ["quality","AI Quality",Award],
          ["ops","Ops Center",Landmark],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic=Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Connectors</div><div className="text-2xl font-bold text-azure">{d.connectors}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Data Products</div><div className="text-2xl font-bold text-violet">{d.dataProducts}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Principals</div><div className="text-2xl font-bold text-fuchsia">{d.principals}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">AI Agents</div><div className="text-2xl font-bold text-teal">{d.aiAgents}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">MTD Cost</div><div className="text-2xl font-bold text-emerald">${(d.monthlyCost/1000).toFixed(0)}k</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Incidents</div><div className="text-2xl font-bold text-crimson">{d.activeIncidents}</div></CardContent></Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">IDPs</div><div className="text-2xl font-bold text-azure">{d.idps}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Open Anomalies</div><div className="text-2xl font-bold text-amber">{d.anomaliesOpen}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Savings</div><div className="text-2xl font-bold text-emerald">${(d.savingsOpportunity/1000).toFixed(1)}k/mo</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Playbooks</div><div className="text-2xl font-bold text-teal">{d.autoHealingPlaybooks}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Avg Quality</div><div className="text-2xl font-bold text-violet">{d.avgQualityScore.toFixed(0)}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Global RPS</div><div className="text-2xl font-bold text-fuchsia">{d.globalRps.toLocaleString()}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-azure"/>Data Fabric</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Healthy connectors</span><strong className="text-emerald">{d.connectorsHealthy}/{d.connectors}</strong></div>
              <div className="flex justify-between"><span>Rows processed (24h)</span><strong>{(d.rows24h/1_000_000).toFixed(1)}M</strong></div>
              <div className="flex justify-between"><span>Bytes processed (24h)</span><strong>{(d.bytes24h/1_000_000_000).toFixed(2)} GB</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><KeyIcon className="h-4 w-4 text-fuchsia"/>Identity</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Active principals</span><strong>{d.activePrincipals}</strong></div>
              <div className="flex justify-between"><span>MFA coverage</span><strong className="text-emerald">{d.mfaCoveragePct}%</strong></div>
              <div className="flex justify-between"><span>High-risk accounts</span><strong className="text-crimson">{d.highRisk}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><HeartPulse className="h-4 w-4 text-crimson"/>Resilience</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>BCP plans</span><strong>{d.bcpPlans}</strong></div>
              <div className="flex justify-between"><span>Playbook success</span><strong className="text-emerald">{d.autoHealSuccessPct}%</strong></div>
              <div className="flex justify-between"><span>Quality regressions</span><strong className={d.qualityRegressions?"text-crimson":"text-emerald"}>{d.qualityRegressions}</strong></div>
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="data" && (<>
        <div className="text-sm text-text-muted">Connectors ({(conns.data??[]).length}) · Products ({(dps.data??[]).length})</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(conns.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-azure"/>{c.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{c.kind} · {c.region}{c.database?` · ${c.database}`:""} · {c.owner}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={connTone(c.status)}>{c.status}</Badge>
                  <Badge variant="slate">{c.datasets} datasets</Badge>
                  {c.encrypted && <Badge variant="emerald">encrypted</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{(c.rowsProcessed24h/1_000_000).toFixed(1)}M</div>rows/24h</div>
                  <div><div className="text-text-bright font-semibold">{c.latencyMs}ms</div>latency</div>
                  <div><div className="text-text-bright font-semibold">{c.errorRatePct.toFixed(2)}%</div>errors</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Data Products</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(dps.data??[]).map(dp=>(
            <Card key={dp.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Boxes className="h-4 w-4 text-violet"/>{dp.name}</CardTitle>
                <CardDescription className="text-xs">{dp.domain} · {dp.owner} · SLA {dp.sla} · certified {dp.certified}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="text-text-muted line-clamp-2">{dp.description}</div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{dp.rows.toLocaleString()}</div>rows</div>
                  <div><div className="text-text-bright font-semibold">{dp.consumers}</div>consumers</div>
                  <div><div className="text-text-bright font-semibold">{dp.freshnessMinutes}m</div>fresh</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="identity" && (<>
        <div className="grid md:grid-cols-4 gap-3">
          {(idps.data??[]).map(i=>(
            <Card key={i.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><KeyIcon className="h-4 w-4 text-fuchsia"/>{i.name}</CardTitle></CardHeader>
              <CardContent className="text-xs">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={i.status==="active"?"emerald":i.status==="error"?"crimson":"azure"}>{i.status}</Badge>
                  <Badge variant="slate">{i.kind}</Badge>
                  {i.scimEnabled && <Badge variant="teal">SCIM</Badge>}
                </div>
                <div className="mt-2 text-text-muted">{i.usersSynced.toLocaleString()} users</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Principals ({(prins.data??[]).length})</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(prins.data??[]).slice(0,42).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><span>{p.kind==="human"?"👤":p.kind==="ai-agent"?"🤖":p.kind==="service"?"⚙️":"🔑"}</span>{p.displayName}</CardTitle>
                <CardDescription className="text-xs font-mono">{p.principalId} · {p.provider}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={kindTone(p.kind)}>{p.kind}</Badge>
                  <Badge variant={p.status==="active"?"emerald":"slate"}>{p.status}</Badge>
                  {p.mfaEnabled && <Badge variant="emerald">MFA</Badge>}
                  {p.aiClass && <Badge variant="fuchsia">{p.aiClass}</Badge>}
                </div>
                {p.lastLoginAt && <div className="text-text-muted mt-1">last login {new Date(p.lastLoginAt).toLocaleString()}</div>}
                <div className="text-text-muted">risk <span className={p.riskScore>70?"text-crimson":p.riskScore>40?"text-amber":"text-emerald"}>{p.riskScore}</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted">Service accounts ({(sas.data??[]).length})</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(sas.data??[]).map(s=>(
            <Card key={s.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm">🔑 {s.name}</CardTitle></CardHeader>
              <CardContent className="text-xs text-text-muted">scopes: {s.scopes.join(", ")} · rotated {new Date(s.rotatedAt).toLocaleDateString()}{s.expiresAt?` · expires ${new Date(s.expiresAt).toLocaleDateString()}`:""}</CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="finops" && (<>
        <div className="grid md:grid-cols-3 gap-3">
          {(accts.data??[]).map(a=>(
            <Card key={a.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" style={{color:provColor(a.provider)}}/>{a.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{a.provider} · {a.region} · {a.accountId}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">${a.monthToDate.toLocaleString()}</div>MTD</div>
                  <div><div className="text-text-bright font-semibold">${a.forecast.toLocaleString()}</div>fcst</div>
                  <div><div className="text-text-bright font-semibold">${a.budget.toLocaleString()}</div>budget</div>
                </div>
                <div className="flex gap-1">
                  <Badge variant={a.status==="on-track"?"emerald":a.status==="over"?"crimson":a.status==="under"?"teal":"amber"}>{a.status}</Badge>
                  <Badge variant={a.trendPct>10?"crimson":a.trendPct>0?"amber":"emerald"}>{a.trendPct>0?"+":""}{a.trendPct.toFixed(1)}%</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Anomalies</div>
        <div className="space-y-2">
          {(anoms.data??[]).map(a=>(
            <Card key={a.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${a.severity==="critical"?"text-crimson":a.severity==="warn"?"text-amber":"text-teal"}`}/>{a.service}</CardTitle></CardHeader>
              <CardContent className="text-xs pt-0 flex items-center gap-2">
                <Badge variant={a.severity==="critical"?"crimson":a.severity==="warn"?"amber":"teal"}>{a.severity}</Badge>
                <Badge variant="slate">{a.category}</Badge>
                <span className="text-text-muted">${a.expectedAmount.toLocaleString()} → ${a.actualAmount.toLocaleString()} ({a.deltaPct>0?"+":""}{a.deltaPct.toFixed(0)}%)</span>
                <span className="ml-auto flex gap-1">
                  <Badge variant={a.status==="open"?"crimson":"slate"}>{a.status}</Badge>
                  {a.status==="open" && <Button size="sm" variant="outline" disabled={busy===a.id} onClick={()=>ackAnomaly(a.id)}>ack</Button>}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Optimization Recommendations</div>
        <div className="space-y-2">
          {(opts.data??[]).filter(o=>o.status==="recommended").map(o=>(
            <Card key={o.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald"/>{o.title}</CardTitle>
                <CardDescription className="text-xs">{o.resource} · {o.region} · {o.provider}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0 flex items-center gap-2 flex-wrap">
                <Badge variant="emerald">${o.savingMonthly.toLocaleString()}/mo</Badge>
                <Badge variant={o.effort==="low"?"emerald":o.effort==="medium"?"amber":"crimson"}>effort {o.effort}</Badge>
                <Badge variant={o.risk==="low"?"emerald":o.risk==="medium"?"amber":"crimson"}>risk {o.risk}</Badge>
                <Button size="sm" variant="primary" disabled={busy===o.id} className="ml-auto" onClick={()=>applyOpt(o.id)}><Sparkles className="h-3 w-3 mr-1"/>apply</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="resilience" && (<>
        <div className="space-y-2">
          {(incs.data??[]).map(i=>(
            <Card key={i.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${i.severity==="sev1"?"text-crimson":i.severity==="sev2"?"text-amber":"text-violet"}`}/>{i.title}</CardTitle>
                <CardDescription className="text-xs">{i.service} · {i.region} · {i.impactedCustomers.toLocaleString()} impacted · {i.commander??"unassigned"}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0 flex items-center gap-1">
                <Badge variant={sevTone(i.severity)}>{i.severity}</Badge>
                <Badge variant={incStatus(i.status)}>{i.status}</Badge>
                <span className="ml-auto text-text-muted">opened {new Date(i.openedAt).toLocaleString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-2">
          {(pbs.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4 text-teal"/>{p.name}</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="text-text-muted">on <code>{p.trigger}</code> → <code>{p.action}</code></div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{p.runsLast30d}</div>runs/30d</div>
                  <div><div className="text-text-bright font-semibold">{p.successRatePct}%</div>success</div>
                  <div><div className="text-text-bright font-semibold">{p.avgResolveSec}s</div>resolve</div>
                </div>
                <Button size="sm" variant="outline" disabled={busy===p.id||!p.autoRun} onClick={()=>runPlaybook(p.id)}>{busy===p.id?"…":"run now"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Business Continuity Plans</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(bcps.data??[]).map(b=>(
            <Card key={b.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-crimson"/>{b.name}</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={b.status==="ready"?"emerald":b.status==="failover-active"?"crimson":"amber"}>{b.status}</Badge>
                  <Badge variant="slate">RTO {b.rtoMinutes}m</Badge>
                  <Badge variant="slate">RPO {b.rpoMinutes}m</Badge>
                  {b.lastDrillAt && <Badge variant={b.lastDrillPassed?"emerald":"crimson"}>drill {b.lastDrillPassed?"passed":"failed"}</Badge>}
                </div>
                <div className="text-text-muted">failover to {b.failoverRegion} · owner {b.owner}</div>
                <div className="flex flex-wrap gap-1">{b.criticalSystems.map(s=><Badge key={s} variant="slate">{s}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="quality" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(cards.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-violet"/>{c.modelName}</CardTitle>
                <CardDescription className="text-xs">{c.dataset} · {c.samples} samples · {c.evaluator}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={c.approved?"emerald":"crimson"}>{c.approved?"approved":"blocked"}</Badge>
                  <Badge variant={c.passPct>=90?"emerald":c.passPct>=70?"amber":"crimson"}>{c.passPct.toFixed(1)}% pass</Badge>
                  {c.regression && <Badge variant="crimson">regression</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {Object.entries(c.scores).map(([k,v])=>(
                    <div key={k} className="bg-white/5 rounded p-1">
                      <div className="font-semibold" style={{color: dimColor(k)==="crimson"?"#DC2626":dimColor(k)==="amber"?"#F59E0B":dimColor(k)==="fuchsia"?"#D946EF":dimColor(k)==="violet"?"#8B5CF6":dimColor(k)==="teal"?"#14B8A6":"#3B82F6"}}>{v}</div>
                      <div className="text-text-muted">{k}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-2">Eval Runs</div>
        <div className="space-y-2">
          {(runs.data??[]).map(r=>(
            <Card key={r.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><TestTube2 className="h-4 w-4 text-azure"/>{r.name}</CardTitle>
                <CardDescription className="text-xs font-mono">{r.modelId} · {r.dataset} · {r.dimensions.join(",")}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs pt-0 flex items-center gap-2">
                <Badge variant={r.status==="passed"?"emerald":r.status==="failed"?"crimson":"azure"}>{r.status}</Badge>
                <span className="text-text-muted">{r.passedSamples}/{r.samples} = {r.passPct}% · by {r.triggeredBy}</span>
                <span className="ml-auto text-text-muted">{new Date(r.startedAt).toLocaleString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="ops" && glob.data && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Global RPS</div><div className="text-2xl font-bold text-azure">{glob.data.trafficRps.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">P95 Latency</div><div className="text-2xl font-bold text-teal">{glob.data.p95Ms}ms</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Error Rate</div><div className="text-2xl font-bold text-crimson">{glob.data.errorRatePct}%</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Users</div><div className="text-2xl font-bold text-fuchsia">{glob.data.activeUsers.toLocaleString()}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-azure"/>Regions</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {glob.data.regions.map(r=>(
                <div key={r.region} className="flex items-center gap-2">
                  <Badge variant={r.status==="healthy"?"emerald":r.status==="degraded"?"amber":"crimson"}>{r.status}</Badge>
                  <span className="font-semibold">{r.region}</span>
                  <span className="text-text-muted">{r.latencyMs}ms</span>
                  <span className="ml-auto">{r.trafficPct}% traffic</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded overflow-hidden">
                    <div className="h-full bg-azure" style={{width:`${r.trafficPct}%`}}/>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-violet"/>Executive KPIs</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {(kpis.data??[]).map(k=>(
                <div key={k.id} className="flex items-center gap-2">
                  <span className="flex-1">{k.label}</span>
                  <span className={k.tone==="positive"?"text-emerald":k.tone==="negative"?"text-crimson":"text-text-bright"}>
                    {k.unit==="$"?`$${k.value.toLocaleString()}`:`${k.value}${k.unit??""}`}
                  </span>
                  <span className={k.trend>=0?"text-emerald":"text-crimson"}>{k.trend>=0?"▲":"▼"}{Math.abs(k.trend)}%</span>
                  {k.target && <div className="w-20 h-1.5 bg-white/5 rounded overflow-hidden"><div className="h-full bg-azure" style={{width:`${Math.min(100,(k.value/k.target)*100)}%`}}/></div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">AI req/min</div><div className="text-2xl font-bold text-violet">{glob.data.aiRequestsPerMin.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">MRR run-rate</div><div className="text-2xl font-bold text-emerald">${(glob.data.monthlyRunRate/1000).toFixed(0)}k</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Cost today</div><div className="text-2xl font-bold text-amber">${glob.data.costToday.toLocaleString()}</div></CardContent></Card>
        </div>
      </>)}
    </div>
  );
}

function CollaborationTab() {
  const [sub, setSub] = useState<"overview"|"meetings"|"screen"|"camera">("overview");
  const dash = useRefresh<cb.CollaborationDashboard|null>(() => cb.collabApi.dashboard(), 30_000);
  const conns = useRefresh<cb.MeetingConnector[]>(() => cb.collabApi.listConnectors(), 60_000, [sub]);
  const meets = useRefresh<cb.LiveMeeting[]>(() => cb.collabApi.listMeetings(), 30_000, [sub]);
  const meetDetailId = (meets.data??[]).find(m => m.status === "live" || m.status === "completed")?.id ?? (meets.data??[])[0]?.id;
  const meetSegs = useRefresh<cb.TranscriptSegment[]>(() => meetDetailId ? cb.collabApi.listSegments(meetDetailId) : Promise.resolve([]), 30_000, [sub, meetDetailId]);
  const meetAis = useRefresh<cb.MeetingActionItem[]>(() => meetDetailId ? cb.collabApi.listActionItems(meetDetailId) : Promise.resolve([]), 30_000, [sub, meetDetailId]);
  const meetRisks = useRefresh<cb.MeetingRisk[]>(() => meetDetailId ? cb.collabApi.listRisks(meetDetailId) : Promise.resolve([]), 30_000, [sub, meetDetailId]);
  const meetFus = useRefresh<cb.FollowUpTask[]>(() => meetDetailId ? cb.collabApi.listFollowUps(meetDetailId) : Promise.resolve([]), 30_000, [sub, meetDetailId]);
  const scrSess = useRefresh<cb.ScreenShareSession[]>(() => cb.collabApi.listSessions(), 30_000, [sub]);
  const scrId = (scrSess.data??[])[0]?.id;
  const scrSteps = useRefresh<cb.GuidedStep[]>(() => scrId ? cb.collabApi.listSteps(scrId) : Promise.resolve([]), 30_000, [sub, scrId]);
  const scrIssues = useRefresh<cb.ScreenIssue[]>(() => scrId ? cb.collabApi.listIssues(scrId) : Promise.resolve([]), 30_000, [sub, scrId]);
  const scrCode = useRefresh<cb.CodeAssistance[]>(() => scrId ? cb.collabApi.listCodeAssists(scrId) : Promise.resolve([]), 30_000, [sub, scrId]);
  const scrDocs = useRefresh<cb.WorkflowDoc[]>(() => scrId ? cb.collabApi.listDocs(scrId) : Promise.resolve([]), 60_000, [sub, scrId]);
  const pipes = useRefresh<cb.CameraPipeline[]>(() => cb.collabApi.listPipelines(), 30_000, [sub]);
  const camId = (pipes.data??[])[0]?.id;
  const camFinds = useRefresh<cb.CameraFinding[]>(() => camId ? cb.collabApi.listFindings(camId) : Promise.resolve([]), 30_000, [sub, camId]);
  const camDets = useRefresh<cb.Detection[]>(() => camId ? cb.collabApi.listDetections(camId) : Promise.resolve([]), 30_000, [sub, camId]);
  const [busy, setBusy] = useState<string|null>(null);
  const d = dash.data;

  function meetStatusTone(s: string): any {
    return s==="live"?"emerald":s==="scheduled"?"azure":s==="completed"?"teal":s==="summarizing"||s==="transcribing"||s==="translating"?"violet":s==="cancelled"?"crimson":"slate";
  }
  function platformColor(p: string): string {
    return p==="teams"?"#3B82F6":p==="zoom"?"#8B5CF6":p==="meet"?"#10B981":p==="webex"?"#0EA5E9":p==="slack-huddle"?"#D946EF":p==="windels-talk"?"#14B8A6":"#F59E0B";
  }
  function prioTone(p: string): any { return p==="critical"?"crimson":p==="high"?"amber":p==="medium"?"violet":p==="low"?"teal":"slate"; }
  function sevTone(s: string): any { return s==="critical"?"crimson":s==="high"?"amber":s==="medium"?"violet":s==="low"?"azure":"slate"; }
  function sessTone(s: string): any { return s==="active"||s==="analyzing"?"emerald":s==="paused"?"amber":s==="ended"?"teal":"slate"; }
  function codeKindTone(k: string): any { return k==="debug"?"crimson":k==="refactor"?"violet":k==="review"?"azure":k==="test-gen"?"emerald":k==="explain"?"teal":"slate"; }
  function camStatusTone(s: string): any { return s==="live"?"emerald":s==="paused"?"amber":s==="degraded"?"crimson":s==="offline"?"slate":"slate"; }
  function fndSevTone(s: string): any { return s==="critical"?"crimson":s==="warn"?"amber":"slate"; }
  function verdictBadge(v: string) {
    return v==="approved-workflow"
      ? <Badge variant="teal">APPROVED WORKFLOW</Badge>
      : <Badge variant="crimson">ADVISORY</Badge>;
  }

  async function joinAi(id: string) {
    setBusy(id);
    try { await cb.collabApi.joinAi(id); await meets.refresh(); toast.success("AI participant joined"); }
    catch(e:any){ toast.error(e?.message??"join failed"); }
    setBusy(null);
  }
  async function ackCam(pid: string, fid: string) {
    setBusy(fid);
    try { await cb.collabApi.acknowledgeFinding(pid, fid); await Promise.all([camFinds.refresh(), pipes.refresh()]); toast.success("finding acknowledged"); }
    catch(e:any){ toast.error(e?.message??"ack failed"); }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["meetings","Meetings",Mic],
          ["screen","Screen Intel",Monitor],
          ["camera","Camera Vision",Eye],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic=Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Connectors</div><div className="text-2xl font-bold text-azure">{d.connectors}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Live Meetings</div><div className="text-2xl font-bold text-emerald">{d.meetingsLive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Mins Transcribed</div><div className="text-2xl font-bold text-violet">{(d.minutesTranscribed24h/60).toFixed(0)}h</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Languages</div><div className="text-2xl font-bold text-fuchsia">{d.languagesActive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">AI Participants</div><div className="text-2xl font-bold text-teal">{d.aiParticipantsActive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Action Items Open</div><div className="text-2xl font-bold text-amber">{d.actionItemsOpen}</div></CardContent></Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Active Screen Sessions</div><div className="text-2xl font-bold text-azure">{d.screenSessionsActive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Guided Steps Done</div><div className="text-2xl font-bold text-teal">{d.guidedStepsCompleted24h}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Code Assists</div><div className="text-2xl font-bold text-violet">{d.codeAssists24h}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Camera Pipelines</div><div className="text-2xl font-bold text-fuchsia">{d.cameraPipelines}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Cameras Live</div><div className="text-2xl font-bold text-emerald">{d.camerasLive}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Open Findings</div><div className="text-2xl font-bold text-crimson">{d.openFindings}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Mic className="h-4 w-4 text-violet"/>Live Meeting Intel</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Meetings today</span><strong>{d.meetingsToday}</strong></div>
              <div className="flex justify-between"><span>Summaries (24h)</span><strong>{d.summariesGenerated24h}</strong></div>
              <div className="flex justify-between"><span>Decisions captured</span><strong>{d.decisionsCaptured}</strong></div>
              <div className="flex justify-between"><span>Risks flagged</span><strong className="text-crimson">{d.risksFlagged}</strong></div>
              <div className="flex justify-between"><span>Write-through pending</span><strong>{d.writeThroughPending}</strong></div>
              <div className="flex justify-between"><span>Write-through synced</span><strong className="text-emerald">{d.writeThroughSynced24h}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Monitor className="h-4 w-4 text-teal"/>Screen Intelligence</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Sessions today</span><strong>{d.screenSessionsToday}</strong></div>
              <div className="flex justify-between"><span>Active guided steps</span><strong>{d.guidedStepsActive}</strong></div>
              <div className="flex justify-between"><span>Docs generated</span><strong>{d.docsGenerated24h}</strong></div>
              <div className="flex justify-between"><span>Issues detected</span><strong className={d.issuesDetected24h>0?"text-amber":"text-emerald"}>{d.issuesDetected24h}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-fuchsia"/>Live Camera Vision</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Detections (24h)</span><strong>{d.detections24h.toLocaleString()}</strong></div>
              <div className="flex justify-between"><span>Safety alerts (24h)</span><strong className={d.safetyAlerts24h>0?"text-crimson":"text-emerald"}>{d.safetyAlerts24h}</strong></div>
              <div className="flex justify-between"><span>Advisory findings</span><strong>{d.advisoryFindingsPct}%</strong></div>
              <div className="flex justify-between"><span>Avg vision latency</span><strong>{d.avgCameraLatencyMs}ms</strong></div>
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="meetings" && (<>
        <div className="text-sm text-text-muted">Connectors ({(conns.data??[]).length}) · Meetings ({(meets.data??[]).length})</div>
        <div className="grid md:grid-cols-3 gap-3">
          {(conns.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{backgroundColor: platformColor(c.platform)}}/>
                {c.name}
              </CardTitle>
                <CardDescription className="text-xs font-mono">{c.platform}{c.tenantDomain?` · ${c.tenantDomain}`:""} · {c.owner}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={c.status==="connected"?"emerald":c.status==="error"?"crimson":c.status==="syncing"?"azure":"slate"}>{c.status}</Badge>
                  {c.capabilities.slice(0,3).map(ccap=><Badge key={ccap} variant="slate">{ccap}</Badge>)}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{c.meetingsToday}</div>today</div>
                  <div><div className="text-text-bright font-semibold">{Math.floor(c.minutesTranscribed24h/60)}h</div>24h tx</div>
                  <div><div className="text-text-bright font-semibold">{c.languagesActive.length}</div>langs</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-sm text-text-muted mt-4">Meetings</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(meets.data??[]).map(m=>(
            <Card key={m.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Mic className="h-4 w-4" style={{color:platformColor(m.platform)}}/>{m.title}
              </CardTitle>
                <CardDescription className="text-xs">{m.platform} · {m.organizer} · {m.attendees} attendees · {m.languages.join(", ")}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={meetStatusTone(m.status)}>{m.status}</Badge>
                  {m.aiParticipantJoined ? <Badge variant="teal">AI joined</Badge> : <Badge variant="slate">no AI</Badge>}
                  {m.summaryReady && <Badge variant="violet">summary</Badge>}
                  {m.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}
                </div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{m.durationMin}m</div>dur</div>
                  <div><div className="text-text-bright font-semibold">{m.actionItemsOpen}</div>open AIs</div>
                  <div><div className="text-text-bright font-semibold">{m.decisionsCount}</div>decisions</div>
                  <div><div className="text-text-bright font-semibold">{m.riskCount}</div>risks</div>
                </div>
                {m.status==="live" && !m.aiParticipantJoined && (
                  <Button size="sm" variant="primary" disabled={busy===m.id} onClick={()=>joinAi(m.id)}><Video className="h-3.5 w-3.5 mr-1"/>{busy===m.id?"Joining…":"Join AI"}</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {meetDetailId && (<>
          <div className="text-sm text-text-muted mt-4">Selected meeting · Transcript · Action items · Risks · Write-through</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm"><Mic className="h-4 w-4 mr-1 inline text-violet"/>Live transcript</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2 max-h-72 overflow-auto">
                {(meetSegs.data??[]).length===0 ? <div className="text-text-muted">No transcript segments yet.</div> :
                  (meetSegs.data??[]).map(s=>(
                    <div key={s.id} className="space-y-0.5">
                      <div className="flex justify-between text-text-muted"><span>{s.speakerLabel}</span><span>{Math.floor(s.startSec/60)}:{String(s.startSec%60).padStart(2,"0")}</span></div>
                      <div>{s.text}</div>
                      <div className="text-[10px] text-text-muted">conf {(s.confidence*100).toFixed(0)}% · {s.language}{s.translated?` · ${Object.keys(s.translated).join(",")}`:""}</div>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-sm"><ListChecks className="h-4 w-4 mr-1 inline text-amber"/>Action items</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  {(meetAis.data??[]).length===0 ? <div className="text-text-muted">No action items captured.</div> :
                    (meetAis.data??[]).map(a=>(
                      <div key={a.id} className="flex items-start gap-2">
                        <Badge variant={prioTone(a.priority)}>{a.priority}</Badge>
                        <div className="flex-1">
                          <div className="font-medium">{a.title}</div>
                          <div className="text-text-muted">{a.assignee ?? "unassigned"}{a.dueDate?` · due ${new Date(a.dueDate).toLocaleDateString()}`:""} · {a.status}</div>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm"><AlertCircle className="h-4 w-4 mr-1 inline text-crimson"/>Risks</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  {(meetRisks.data??[]).length===0 ? <div className="text-text-muted">No risks flagged.</div> :
                    (meetRisks.data??[]).map(r=>(
                      <div key={r.id} className="flex items-start gap-2">
                        <Badge variant={sevTone(r.severity)}>{r.severity}</Badge>
                        <div className="flex-1">
                          <div className="font-medium">{r.label}</div>
                          <div className="text-text-muted">{r.detail} · {r.category}{r.acknowledged?" · acked":""}</div>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm"><FileDown className="h-4 w-4 mr-1 inline text-teal"/>Write-through</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  {(meetFus.data??[]).length===0 ? <div className="text-text-muted">No sync tasks yet.</div> :
                    (meetFus.data??[]).map(f=>(
                      <div key={f.id} className="flex items-center gap-2">
                        <Badge variant={f.status==="synced"?"teal":f.status==="failed"?"crimson":"azure"}>{f.status}</Badge>
                        <span className="flex-1 truncate">{f.system} · {f.action}</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>)}
      </>)}

      {sub==="screen" && (<>
        <div className="text-sm text-text-muted">Screen sessions ({(scrSess.data??[]).length})</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(scrSess.data??[]).map(s=>(
            <Card key={s.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Monitor className="h-4 w-4 text-teal"/>{s.title}
              </CardTitle>
                <CardDescription className="text-xs">{s.user} · {s.level}{s.application?` · ${s.application}`:""}{s.url?` · ${s.url}`:""}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={sessTone(s.status)}>{s.status}</Badge>
                  {s.consentGranted && <Badge variant="emerald">consent</Badge>}
                  {s.piiRedaction && <Badge variant="violet">PII redact</Badge>}
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{s.framesCaptured}</div>frames</div>
                  <div><div className="text-text-bright font-semibold">{s.aiExplanations}</div>expl.</div>
                  <div><div className="text-text-bright font-semibold">{s.stepsGuided}</div>steps</div>
                  <div><div className="text-text-bright font-semibold">{s.codeAssists}</div>code</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {scrId && (<>
          <div className="text-sm text-text-muted mt-4">Selected session · Guided steps · Code assistance · Issues · Docs</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm"><ListChecks className="h-4 w-4 mr-1 inline text-azure"/>Guided troubleshooting</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                {(scrSteps.data??[]).length===0 ? <div className="text-text-muted">No guided steps.</div> :
                  (scrSteps.data??[]).map(st=>(
                    <div key={st.id} className="flex items-start gap-2">
                      <Badge variant={st.status==="done"?"emerald":st.status==="active"?"azure":st.status==="failed"?"crimson":st.status==="skipped"?"amber":"slate"}>{st.status}</Badge>
                      <div className="flex-1">
                        <div className="font-medium">Step {st.stepNumber} · {st.title}</div>
                        <div className="text-text-muted">{st.instruction}</div>
                        <div className="text-[10px] text-text-muted">expected: {st.expectedOutcome} · {st.elapsedSec}s</div>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-sm"><Code2 className="h-4 w-4 mr-1 inline text-violet"/>Code assistance</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-2">
                  {(scrCode.data??[]).length===0 ? <div className="text-text-muted">No assists yet.</div> :
                    (scrCode.data??[]).map(c=>(
                      <div key={c.id} className="space-y-0.5">
                        <div className="flex gap-1"><Badge variant={codeKindTone(c.kind)}>{c.kind}</Badge>{c.language && <Badge variant="slate">{c.language}</Badge>}{c.fileName && <span className="font-mono text-text-muted">{c.fileName}</span>}</div>
                        <div>{c.suggestion}</div>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm"><AlertTriangle className="h-4 w-4 mr-1 inline text-amber"/>Detected issues</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  {(scrIssues.data??[]).length===0 ? <div className="text-text-muted">No issues detected.</div> :
                    (scrIssues.data??[]).map(i=>(
                      <div key={i.id} className="flex items-start gap-2">
                        <Badge variant={i.severity==="critical"?"crimson":i.severity==="warn"?"amber":"slate"}>{i.severity}</Badge>
                        <div className="flex-1"><div className="font-medium">{i.label}</div><div className="text-text-muted">{i.detail}</div></div>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm"><FileText className="h-4 w-4 mr-1 inline text-teal"/>Auto-generated docs</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  {(scrDocs.data??[]).length===0 ? <div className="text-text-muted">No docs generated.</div> :
                    (scrDocs.data??[]).map(d=>(
                      <div key={d.id} className="flex items-center gap-2">
                        <Badge variant="teal">{d.format}</Badge>
                        <span className="flex-1">{d.title}</span>
                        <span className="text-text-muted">{d.wordCount} words</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>)}
      </>)}

      {sub==="camera" && (<>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <ShieldIcon className="h-3.5 w-3.5 text-crimson"/>Camera output is ADVISORY-ONLY by default unless wired to an approved enterprise workflow.
        </div>
        <div className="text-sm text-text-muted">Pipelines ({(pipes.data??[]).length}) · Open findings {(pipes.data??[]).reduce((a,p)=>a+p.findingsOpen,0)}</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(pipes.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-fuchsia"/>{p.name}
              </CardTitle>
                <CardDescription className="text-xs">{p.kind} · {p.site} · owner {p.owner}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={camStatusTone(p.status)}>{p.status}</Badge>
                  {verdictBadge(p.verdictDefault)}
                  {p.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}
                </div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{p.cameraCount}</div>cams</div>
                  <div><div className="text-text-bright font-semibold">{p.fps}</div>fps</div>
                  <div><div className="text-text-bright font-semibold">{p.detectionsToday}</div>dets</div>
                  <div><div className="text-text-bright font-semibold">{p.findingsOpen}</div>open</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{p.uptimePct != null ? `${p.uptimePct.toFixed(1)}%` : "—"}</div>uptime</div>
                  <div><div className="text-text-bright font-semibold">{p.latencyMs}ms</div>latency</div>
                  <div><div className="text-text-bright font-semibold">{p.safetyAlerts24h}</div>safety</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {camId && (<>
          <div className="text-sm text-text-muted mt-4">Selected pipeline · Findings · Detections</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-sm"><AlertTriangle className="h-4 w-4 mr-1 inline text-crimson"/>Findings (acknowledge required for advisory)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2 max-h-96 overflow-auto">
                {(camFinds.data??[]).length===0 ? <div className="text-text-muted">No findings.</div> :
                  (camFinds.data??[]).map(f=>(
                    <div key={f.id} className="border border-white/5 rounded-lg p-2 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={fndSevTone(f.severity)}>{f.severity}</Badge>
                        <Badge variant="slate">{f.kind}</Badge>
                        {verdictBadge(f.verdict)}
                        {f.acknowledged ? <Badge variant="emerald">acked</Badge> : null}
                      </div>
                      <div className="font-medium">{f.title}</div>
                      <div className="text-text-muted">{f.detail}</div>
                      <div className="text-[10px] text-text-muted">📍 {f.location} · {f.recommendation}</div>
                      {!f.acknowledged && (
                        <Button size="sm" variant="warning" disabled={busy===f.id} onClick={()=>ackCam(f.pipelineId, f.id)}><Check className="h-3.5 w-3.5 mr-1"/>{busy===f.id?"Acknowledging…":"Acknowledge"}</Button>
                      )}
                      {f.verdict==="advisory" && <div className="text-[10px] text-crimson">Advisory — operator review required before action.</div>}
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm"><Eye className="h-4 w-4 mr-1 inline text-fuchsia"/>Recent detections</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2 max-h-96 overflow-auto">
                {(camDets.data??[]).length===0 ? <div className="text-text-muted">No detections.</div> :
                  (camDets.data??[]).slice(0,12).map(d=>(
                    <div key={d.id} className="flex items-start gap-2">
                      <Badge variant={d.confidenceBand==="very-high"?"emerald":d.confidenceBand==="high"?"teal":d.confidenceBand==="medium"?"amber":"slate"}>{d.confidenceBand}</Badge>
                      <div className="flex-1">
                        <div className="font-medium">{d.label} <span className="text-text-muted">({d.kind})</span></div>
                        <div className="text-text-muted">{(d.confidence*100).toFixed(0)}% · {d.cameraId} · {new Date(d.timestamp).toLocaleTimeString()}</div>
                        <div className="text-[10px] text-text-muted">{d.advisoryNote}</div>
                      </div>
                      {verdictBadge(d.verdict)}
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </>)}
      </>)}
    </div>
  );
}

function AiEcosystemTab() {
  const [sub, setSub] = useState<"overview"|"providers"|"personalities"|"trust">("overview");
  const dash = useRefresh<aeco.AiEcosystemDashboard|null>(() => aeco.aiEcoApi.dashboard(), 30_000);
  const provs = useRefresh<aeco.AiProviderAdapter[]>(() => aeco.aiEcoApi.listProviders(), 60_000, [sub]);
  const models = useRefresh<aeco.AiModel[]>(() => aeco.aiEcoApi.listModels(), 60_000, [sub]);
  const pols = useRefresh<aeco.RoutingPolicy[]>(() => aeco.aiEcoApi.listPolicies(), 60_000, [sub]);
  const benches = useRefresh<aeco.BenchmarkRun[]>(() => aeco.aiEcoApi.listBenchmarks(), 60_000, [sub]);
  const profs = useRefresh<aeco.PersonalityProfile[]>(() => aeco.aiEcoApi.listPersonalities(), 60_000, [sub]);
  const voices = useRefresh<aeco.VoicePersona[]>(() => aeco.aiEcoApi.listVoicePersonas(), 60_000, [sub]);
  const avs = useRefresh<aeco.AvatarConfig[]>(() => aeco.aiEcoApi.listAvatars(), 60_000, [sub]);
  const deps = useRefresh<aeco.DepartmentPersonality[]>(() => aeco.aiEcoApi.listDepartments(), 60_000, [sub]);
  const reports = useRefresh<aeco.ExplainabilityReport[]>(() => aeco.aiEcoApi.listReports(), 30_000, [sub]);
  const scores = useRefresh<aeco.TrustScore[]>(() => aeco.aiEcoApi.listScores(), 30_000, [sub]);
  const [busy, setBusy] = useState<string|null>(null);
  const d = dash.data;

  function vendorColor(v: string): string {
    return v==="openai"?"#10B981":v==="anthropic"?"#D946EF":v==="google"?"#3B82F6":v==="mistral"?"#F59E0B":v==="azure"?"#0078D4":v==="bedrock"?"#FF9900":v==="ollama"?"#14B8A6":v==="windels"?"#8B5CF6":"#64748B";
  }
  function statusTone(s: string): any { return s==="healthy"?"emerald":s==="degraded"?"amber":s==="throttled"?"violet":s==="offline"?"crimson":"slate"; }
  function deployTone(d: string): any { return d==="self-hosted"?"teal":d==="cloud"?"azure":d==="edge"?"fuchsia":d==="hybrid"?"violet":"slate"; }
  function formalityLabel(f: number) { return ["","casual","relaxed","balanced","formal","boardroom"][f] ?? "balanced"; }
  function reviewTone(s: string): any { return s==="approved"?"emerald":s==="rejected"?"crimson":s==="queued"||s==="in-review"?"amber":"slate"; }
  function verifTone(v: string): any { return v==="verified"?"emerald":v==="partially-verified"?"azure":v==="disputed"?"crimson":"slate"; }
  function policyTone(s: string): any { return s==="pass"?"emerald":s==="warn"?"amber":s==="fail"?"crimson":"slate"; }
  function actionTone(a: string): any { return a==="auto-published"?"emerald":a==="show-with-disclaimer"?"azure":a==="requires-human-review"?"amber":"crimson"; }

  async function approveScore(id: string) {
    setBusy(id);
    try { await aeco.aiEcoApi.reviewScore(id, "approved", "admin"); await scores.refresh(); toast.success("score approved"); }
    catch(e:any){ toast.error(e?.message??"review failed"); }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Gauge],
          ["providers","Providers & Routing",Cpu],
          ["personalities","Personality Studio",Palette],
          ["trust","Trust & Explainability",ShieldCheckIcon],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic=Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
      </div>

      {sub==="overview" ? (d ? (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Providers</div><div className="text-2xl font-bold text-azure">{d.providers}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Healthy</div><div className="text-2xl font-bold text-emerald">{d.providersHealthy}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Self-hosted</div><div className="text-2xl font-bold text-teal">{d.providersSelfHosted}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Models (enabled)</div><div className="text-2xl font-bold text-violet">{d.modelsEnabled}/{d.models}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Routing Policies</div><div className="text-2xl font-bold text-fuchsia">{d.routingPolicies}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Avg Latency</div><div className="text-2xl font-bold text-amber">{d.avgLatencyMs}ms</div></CardContent></Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Requests 24h</div><div className="text-2xl font-bold text-azure">{(d.requests24h/1000).toFixed(0)}k</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Tokens 24h</div><div className="text-2xl font-bold text-violet">{(d.tokens24h/1_000_000).toFixed(1)}M</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Cost 24h</div><div className="text-2xl font-bold text-emerald">${d.cost24hUsd.toFixed(0)}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Fallbacks</div><div className="text-2xl font-bold text-fuchsia">{d.fallbackInvocations24h}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">Profiles</div><div className="text-2xl font-bold text-teal">{d.activePersonas}/{d.personalityProfiles}</div></CardContent></Card>
          <Card><CardContent className="py-4"><div className="text-xs text-text-muted">HR Queue</div><div className="text-2xl font-bold text-crimson">{d.humanReviewQueue}</div></CardContent></Card>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4 text-azure"/>Provider Fabric</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Healthy / total</span><strong className="text-emerald">{d.providersHealthy}/{d.providers}</strong></div>
              <div className="flex justify-between"><span>Models enabled</span><strong>{d.modelsEnabled}/{d.models}</strong></div>
              <div className="flex justify-between"><span>p95 latency</span><strong>{d.p95LatencyMs}ms</strong></div>
              <div className="flex justify-between"><span>Error rate</span><strong className={d.errorRatePct>1?"text-crimson":"text-emerald"}>{d.errorRatePct}%</strong></div>
              <div className="flex justify-between"><span>Active benchmarks</span><strong>{d.activeBenchmarks}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4 text-fuchsia"/>Personality Studio</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Profiles</span><strong>{d.personalityProfiles}</strong></div>
              <div className="flex justify-between"><span>Voice personas</span><strong>{d.voicePersonas}</strong></div>
              <div className="flex justify-between"><span>Avatars</span><strong>{d.avatars}</strong></div>
              <div className="flex justify-between"><span>Departments bound</span><strong>{d.departmentsCovered}</strong></div>
              <div className="flex justify-between"><span>Avg brand alignment</span><strong className="text-teal">{d.avgBrandAlignment}/100</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheckIcon className="h-4 w-4 text-emerald"/>Trust &amp; Explainability</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between"><span>Scored responses</span><strong>{d.trustScoredResponses24h}</strong></div>
              <div className="flex justify-between"><span>Verified</span><strong className="text-emerald">{d.verifiedResponses24h}</strong></div>
              <div className="flex justify-between"><span>Avg confidence</span><strong>{Math.round(d.avgConfidence*100)}%</strong></div>
              <div className="flex justify-between"><span>Blocked</span><strong className="text-crimson">{d.blockedResponses24h}</strong></div>
              <div className="flex justify-between"><span>Policy failures</span><strong className={d.policyFailures24h>0?"text-crimson":"text-emerald"}>{d.policyFailures24h}</strong></div>
            </CardContent>
          </Card>
        </div>
      </>) : <Skeleton/>) : null}

      {sub==="providers" && (<>
        <div className="text-sm text-text-muted">Providers ({(provs.data??[]).length}) · Models ({(models.data??[]).length}) · Policies ({(pols.data??[]).length}) · Benchmarks ({(benches.data??[]).length})</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(provs.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{backgroundColor: vendorColor(p.vendor)}}/>
                {p.name}
              </CardTitle>
                <CardDescription className="text-xs font-mono">{p.vendor} · {p.tier} · {p.residency.join(",")}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={statusTone(p.status)}>{p.status}</Badge>
                  <Badge variant={deployTone(p.tier)}>{p.tier}</Badge>
                  {p.apiKeyConfigured ? <Badge variant="emerald">key set</Badge> : <Badge variant="amber">no key</Badge>}
                  {p.labels.slice(0,3).map((c:string,i:number)=><Badge key={i} variant="slate">{c}</Badge>)}
                </div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{(models.data??[]).filter(m=>m.providerId===p.id).length}</div>models</div>
                  <div><div className="text-text-bright font-semibold">{p.avgLatencyMs ?? "—"}ms</div>avg</div>
                  <div><div className="text-text-bright font-semibold">{p.p95LatencyMs ?? "—"}ms</div>p95</div>
                  <div><div className="text-text-bright font-semibold">{p.supportsStreaming?"✓":"—"}</div>stream</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">${(p.costPer1kInputUsd ?? 0).toFixed(4)}</div>in/1k</div>
                  <div><div className="text-text-bright font-semibold">${(p.costPer1kOutputUsd ?? 0).toFixed(4)}</div>out/1k</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-4">Routing policies</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(pols.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-violet"/>{p.name}</CardTitle>
                <CardDescription className="text-xs">{p.strategy} · weights c{Math.round(p.costWeight*100)}/l{Math.round(p.latencyWeight*100)}/q{Math.round(p.qualityWeight*100)} · caps: {(p.requiredCapabilities??[]).join(",") || "any"}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex gap-1 flex-wrap">
                  {p.enabled?<Badge variant="emerald">enabled</Badge>:<Badge variant="slate">disabled</Badge>}
                  {p.requiredResidency && <Badge variant="fuchsia">{p.requiredResidency}</Badge>}
                  {p.fallbackProviderIds.slice(0,3).map((pid:string)=>{
                    const pv = (provs.data??[]).find(x=>x.id===pid);
                    return <Badge key={pid} variant="azure">fb:{pv?.name ?? pid.slice(0,8)}</Badge>;
                  })}
                  {p.allowedProviderTiers?.slice(0,2).map((t:string,i:number)=><Badge key={i} variant="teal">{t}</Badge>)}
                </div>
                <div className="text-text-muted">{p.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-4">Models (sample)</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(models.data??[]).slice(0,18).map(m=>{
            const mp = (provs.data??[]).find(p=>p.id===m.providerId);
            return (
            <Card key={m.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{backgroundColor: vendorColor(mp?.vendor ?? "windels")}}/>
                {m.displayName}
              </CardTitle>
                <CardDescription className="text-xs font-mono">{m.modelId} · ctx {(m.contextWindowTokens/1000).toFixed(0)}k</CardDescription>
              </CardHeader>
              <CardContent className="text-xs">
                <div className="flex gap-1 flex-wrap">
                  {m.enabled?<Badge variant="emerald">on</Badge>:<Badge variant="slate">off</Badge>}
                  <Badge variant="azure">ctx {(m.contextWindowTokens/1000).toFixed(0)}k</Badge>
                  {m.capabilities.slice(0,4).map(c=><Badge key={c} variant="slate">{c}</Badge>)}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-text-muted">
                  <div><div className="text-text-bright font-semibold">${m.costPer1kInputUsd.toFixed(4)}</div>in/1k</div>
                  <div><div className="text-text-bright font-semibold">{m.avgLatencyMs}ms</div>lat</div>
                  <div><div className="text-text-bright font-semibold">{m.modalities.length}</div>mod.</div>
                </div>
              </CardContent>
            </Card>
          );})}
        </div>
      </>)}

      {sub==="personalities" && (<>
        <div className="text-sm text-text-muted">Profiles ({(profs.data??[]).length}) · Voices ({(voices.data??[]).length}) · Avatars ({(avs.data??[]).length}) · Departments ({(deps.data??[]).length})</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(profs.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-fuchsia"/>{p.name}
              </CardTitle>
                <CardDescription className="text-xs">{p.tone} · formality {Math.round(p.formality*100)}% · use cases: {p.useCases.join(", ") || "*"}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="emerald">active</Badge>
                  <Badge variant="violet">brand {p.brandAlignment}</Badge>
                  {p.regionalOverrides.slice(0,3).map((o,i)=><Badge key={i} variant="slate">region:{o.region}</Badge>)}
                </div>
                <div className="text-text-muted line-clamp-2">{p.description}</div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{Math.round(p.empathy*100)}%</div>empathy</div>
                  <div><div className="text-text-bright font-semibold">{Math.round(p.humor*100)}%</div>humor</div>
                  <div><div className="text-text-bright font-semibold">{Math.round(p.verbosity*100)}%</div>verbose</div>
                  <div><div className="text-text-bright font-semibold">{Math.round(p.assertiveness*100)}%</div>assert</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-2">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Volume2 className="h-4 w-4 text-teal"/>Voice personas</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              {(voices.data??[]).length===0?<div className="text-text-muted">None.</div>:
                (voices.data??[]).map(v=>(
                  <div key={v.id} className="flex items-center gap-2">
                    <Badge variant="emerald">on</Badge>
                    <span className="flex-1">{v.name}</span>
                    <span className="text-text-muted">{v.gender} · pace {v.paceWpm}wpm · pitch {v.pitch > 0 ? "+" : ""}{v.pitch}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><UserCircle className="h-4 w-4 text-violet"/>Avatars</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              {(avs.data??[]).length===0?<div className="text-text-muted">None.</div>:
                (avs.data??[]).map(a=>(
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full grid place-items-center text-xs" style={{background: a.accentColor}}>·</span>
                    <span className="flex-1">{a.name}</span>
                    <Badge variant="slate">{a.style}</Badge>
                  </div>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-azure"/>Department bindings</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              {(deps.data??[]).length===0?<div className="text-text-muted">None.</div>:
                (deps.data??[]).map(d=>(
                  <div key={d.id} className="flex items-center gap-2">
                    <Badge variant={d.enabled?"azure":"slate"}>{d.department}</Badge>
                    <span className="flex-1 truncate text-text-muted">profile: {(profs.data??[]).find(p=>p.id===d.profileId)?.name ?? "—"}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </>)}

      {sub==="trust" && (<>
        <div className="text-sm text-text-muted">Explainability reports attached to trust scores ({(scores.data??[]).length} scored responses)</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(scores.data??[]).map(t=>(
            <Card key={t.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald"/>Score — {t.responseId}
              </CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={verifTone(t.verificationStatus)}>{t.verificationStatus}</Badge>
                  <Badge variant={reviewTone(t.humanReviewOutcome ?? (t.recommendedAction==="requires-human-review"?"queued":"auto"))}>
                    {t.humanReviewOutcome ?? (t.recommendedAction==="requires-human-review"?"queued":t.humanReviewedAt?"reviewed":"auto")}
                  </Badge>
                  <Badge variant={policyTone(t.policyCompliant?"pass":"fail")}>policy {t.policyCompliant?"pass":"fail"}</Badge>
                  <Badge variant={actionTone(t.recommendedAction)}>{t.recommendedAction}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{Math.round(t.confidence*100)}%</div>conf.</div>
                  <div><div className="text-text-bright font-semibold">{t.corroboratingEvidencePct}%</div>support</div>
                  <div><div className="text-text-bright font-semibold">{t.evidenceCount}</div>evid.</div>
                  <div><div className="text-text-bright font-semibold">{t.uncertaintySignals.length}</div>uncert.</div>
                </div>
                <div className="text-text-muted"><span className="text-text-bright">Reasoning:</span> {t.explainabilityReport.reasoningSummary}</div>
                <div className="flex gap-1 flex-wrap">
                  {t.explainabilityReport.keySteps.map((s:string,i:number)=><Badge key={i} variant="azure">{i+1}. {s}</Badge>)}
                </div>
                {t.uncertaintySignals.length>0 && <ul className="list-disc pl-4 text-amber">{t.uncertaintySignals.map((u,i)=><li key={i}>[{u.severity}] {u.description}</li>)}</ul>}
                {(t.recommendedAction==="requires-human-review" && !t.humanReviewOutcome) && (
                  <Button size="sm" variant="success" disabled={busy===t.id} onClick={()=>approveScore(t.id)}><Check className="h-3.5 w-3.5 mr-1"/>{busy===t.id?"Approving…":"Approve"}</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}
    </div>
  );
}

function MarketplaceTab() {
  const dash = useRefresh<mk.MarketplaceDashboard|null>(() => mk.marketplaceApi.dashboard(), 30_000);
  const [sub, setSub] = useState<"overview"|"skills"|"twins"|"sim"|"apps">("overview");
  const skills = useRefresh<mk.MarketplaceSkill[]>(() => mk.marketplaceApi.listSkills(), 60_000, [sub]);
  const installs = useRefresh<mk.SkillInstallation[]>(() => mk.marketplaceApi.listInstallations(), 30_000, [sub]);
  const twins = useRefresh<mk.DigitalTwin[]>(() => mk.marketplaceApi.listTwins(), 60_000, [sub]);
  const scenarios = useRefresh<mk.Scenario[]>(() => mk.marketplaceApi.listScenarios(), 60_000, [sub]);
  const sims = useRefresh<mk.SimulationRun[]>(() => mk.marketplaceApi.listSimulations(), 30_000, [sub]);
  const apps = useRefresh<mk.AiApplication[]>(() => mk.marketplaceApi.listApps({approved:true}), 60_000, [sub]);
  const appInstalls = useRefresh<mk.AppInstall[]>(() => mk.marketplaceApi.listAppInstalls(), 30_000, [sub]);
  const [busy, setBusy] = useState<string|null>(null);
  const d = dash.data;

  async function installSkill(id: string) {
    setBusy("sk-"+id);
    try { await mk.marketplaceApi.installSkill(id); await installs.refresh(); toast.success("skill installed"); }
    catch(e:any){ toast.error(e?.message??"install failed"); }
    setBusy(null);
  }
  async function installApp(id: string) {
    setBusy("app-"+id);
    try { await mk.marketplaceApi.installApp(id); await appInstalls.refresh(); toast.success("app installed"); }
    catch(e:any){ toast.error(e?.message??"install failed"); }
    setBusy(null);
  }
  async function runScenario(id: string) {
    setBusy("sc-"+id);
    try { await mk.marketplaceApi.runScenario(id); await sims.refresh(); await scenarios.refresh(); toast.success("simulation complete"); }
    catch(e:any){ toast.error(e?.message??"run failed"); }
    setBusy(null);
  }

  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["skills", Puzzle, "Skills"],
    ["twins", Building2, "Digital Twins"],
    ["sim", LineChart, "Simulation"],
    ["apps", Store, "App Store"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>

      {sub==="overview" && (<>
        {!d ? <Skeleton/> : (<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><Puzzle className="h-4 w-4" style={{color:"#8B5CF6"}}/>Skills available</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#8B5CF6"}}>{d.skillsAvailable}</div><div className="text-xs text-text-muted mt-1">{d.skillsInstalled} installed · {d.skillsAssigned} assigned</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><Building2 className="h-4 w-4" style={{color:"#14B8A6"}}/>Digital twins</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#14B8A6"}}>{d.twins}</div><div className="text-xs text-text-muted mt-1">{d.twinsLive} live · {d.twinSensorsLive} sensors</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><LineChart className="h-4 w-4" style={{color:"#3B82F6"}}/>Scenarios</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#3B82F6"}}>{d.scenarios}</div><div className="text-xs text-text-muted mt-1">{d.simulationsRun24h} runs/24h · {d.simulationsFeedingSuperInt}→super-int</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><Store className="h-4 w-4" style={{color:"#D946EF"}}/>AI Apps</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#D946EF"}}>{d.appsAvailable}</div><div className="text-xs text-text-muted mt-1">{d.appsInstalled} installed · {d.appsPendingApproval} pending</div></CardContent></Card>
        </div>)}
        <div className="grid md:grid-cols-2 gap-3 mt-2">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber"/>Twin alerts</CardTitle></CardHeader>
            <CardContent className="text-xs">{d ? <div><span className="text-text-bright font-semibold text-crimson">{d.twinAlerts}</span> active alerts across all twins</div>: <Skeleton/>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald"/>App updates</CardTitle></CardHeader>
            <CardContent className="text-xs">{d ? <div><span className="text-text-bright font-semibold">{d.appUpdatesAvailable}</span> apps with updates available</div>: <Skeleton/>}</CardContent>
          </Card>
        </div>
      </>)}

      {sub==="skills" && (<>
        <div className="text-sm text-text-muted">AI Skills Marketplace — reusable, role-assignable capabilities that complement the Agent Marketplace</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(skills.data??[]).map(s=>{
            const installed = (installs.data??[]).some(i=>i.skillId===s.id);
            return (<Card key={s.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className="text-lg">{s.iconEmoji ?? "🧩"}</span>
                {s.name}
              </CardTitle>
                <CardDescription className="text-xs">{s.publisher} · v{s.version} · {s.category} · {s.priceModel}{s.priceUsd?` $${s.priceUsd}/mo`:""}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted line-clamp-2">{s.summary}</div>
                <div className="flex gap-1 flex-wrap">{s.tags.map((t,i)=><Badge key={i} variant="slate">{t}</Badge>)}</div>
                <div className="flex gap-1 flex-wrap">{s.requiredCapabilities.slice(0,3).map((c,i)=><Badge key={i} variant="azure">{c}</Badge>)}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-text-muted">★ {s.rating.toFixed(1)} · {s.installs} installs</span>
                  {installed ? <Badge variant="emerald">installed</Badge> :
                    <Button size="sm" variant="primary" disabled={busy==="sk-"+s.id} onClick={()=>installSkill(s.id)}><Download className="h-3 w-3 mr-1"/>{busy==="sk-"+s.id?"Installing…":"Install"}</Button>}
                </div>
              </CardContent>
            </Card>);
          })}
        </div>
      </>)}

      {sub==="twins" && (<>
        <div className="text-sm text-text-muted">Enterprise Digital Twins — organizations, buildings, factories, supply chains, processes</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(twins.data??[]).map(t=>(
            <Card key={t.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{backgroundColor:t.iconColor}}/>
                {t.name}
              </CardTitle>
                <CardDescription className="text-xs">{t.kind} · {t.location ?? "—"} · owner: {t.owner}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant={t.status==="live"?"emerald":"amber"}>{t.status}</Badge>
                  <Badge variant="teal">{t.entitiesCount} entities</Badge>
                  <Badge variant="azure">{t.sensorsLive} sensors</Badge>
                  {t.alertsCount>0 && <Badge variant="crimson">{t.alertsCount} alerts</Badge>}
                </div>
                <div className="text-text-muted line-clamp-2">{t.description}</div>
                <div className="grid grid-cols-2 gap-2 text-text-muted">
                  <div><div className="text-text-bright font-semibold">{t.uptimePct.toFixed(2)}%</div>uptime</div>
                  <div><div className="text-text-bright font-semibold">{new Date(t.lastSyncAt).toLocaleTimeString()}</div>last sync</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="sim" && (<>
        <div className="text-sm text-text-muted">Simulation & Scenario Engine — what-if analysis that feeds the Enterprise Superintelligence Layer</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(scenarios.data??[]).map(s=>{
            const runs = (sims.data??[]).filter(r=>r.scenarioId===s.id);
            const last = runs[0];
            return (<Card key={s.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Play className="h-4 w-4" style={{color:s.iconColor}}/>{s.name}
              </CardTitle>
                <CardDescription className="text-xs">{s.kind} · owner: {s.owner} · {runs.length} runs</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-text-muted line-clamp-2">{s.description}</div>
                <div className="flex gap-1 flex-wrap">{s.assumptions.slice(0,3).map((a,i)=><Badge key={i} variant="slate">{a.label}: {String(a.value)}{a.unit?` ${a.unit}`:""}</Badge>)}</div>
                {last && (<div className="space-y-1">
                  <div className="text-text-bright pt-1">Latest run · conf {Math.round(last.confidence*100)}% · <span className={last.feedsSuperintelligence?"text-emerald":"text-text-muted"}>{last.feedsSuperintelligence?"→ super-int":"not feeding"}</span></div>
                  <div className="text-text-muted italic line-clamp-2">{last.narrative}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {last.kpiImpacts.slice(0,4).map(k=>(
                      <div key={k.metric} className="flex items-center justify-between">
                        <span className="text-text-muted">{k.metric}</span>
                        <span style={{color: k.sentiment==="positive"?"#10B981":k.sentiment==="negative"?"#DC2626":"#94a3b8"}}>{k.deltaPct>=0?"+":""}{k.deltaPct}%</span>
                      </div>
                    ))}
                  </div>
                  {last.recommendedActions.length>0 && <ul className="list-disc pl-4 text-emerald text-[11px]">{last.recommendedActions.slice(0,2).map((a,i)=><li key={i}>{a}</li>)}</ul>}
                </div>)}
                <Button size="sm" variant="primary" disabled={busy==="sc-"+s.id} onClick={()=>runScenario(s.id)}><Play className="h-3 w-3 mr-1"/>{busy==="sc-"+s.id?"Running…":"Run simulation"}</Button>
              </CardContent>
            </Card>);
          })}
        </div>
      </>)}

      {sub==="apps" && (<>
        <div className="text-sm text-text-muted">Enterprise AI Application Store — governed, versioned, centrally permissioned apps, plugins and packs</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(apps.data??[]).map(a=>{
            const installed = (appInstalls.data??[]).some(i=>i.appId===a.id);
            return (<Card key={a.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className="text-lg">{a.iconEmoji ?? "📦"}</span>{a.name}
              </CardTitle>
                <CardDescription className="text-xs">{a.publisher} · {a.kind} · {a.category} · v{a.latestVersion}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="emerald">governed</Badge>
                  <Badge variant="slate">{a.priceModel}{a.priceUsd?` $${a.priceUsd}`:""}</Badge>
                  <Badge variant="azure">★ {a.rating.toFixed(1)}</Badge>
                </div>
                <div className="text-text-muted line-clamp-2">{a.shortDescription}</div>
                <div className="flex gap-1 flex-wrap">{a.permissions.slice(0,3).map((p,i)=><Badge key={i} variant="violet">{p}</Badge>)}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-text-muted">{a.installs} installs</span>
                  {installed ? <Badge variant="emerald">installed</Badge> :
                    <Button size="sm" variant="primary" disabled={busy==="app-"+a.id} onClick={()=>installApp(a.id)}><Download className="h-3 w-3 mr-1"/>{busy==="app-"+a.id?"Installing…":"Install"}</Button>}
                </div>
              </CardContent>
            </Card>);
          })}
        </div>
      </>)}
    </div>
  );
}

function CryptoIntelTab() {
  const dash = useRefresh<ci.CiDashboard|null>(() => ci.ciApi.dashboard(), 30_000);
  const [sub, setSub] = useState<"overview"|"chains"|"defi"|"portfolio"|"trades"|"exchanges">("overview");
  const chains = useRefresh<ci.ChainMonitor[]>(() => ci.ciApi.listChains(), 60_000, [sub]);
  const markets = useRefresh<ci.MarketTicker[]>(() => ci.ciApi.listMarkets(), 30_000, [sub]);
  const protos = useRefresh<ci.DefiProtocol[]>(() => ci.ciApi.listDefiProtocols(), 60_000, [sub]);
  const yields = useRefresh<ci.YieldOpportunity[]>(() => ci.ciApi.listYields(), 60_000, [sub]);
  const wallets = useRefresh<ci.Wallet[]>(() => ci.ciApi.listWallets(), 60_000, [sub]);
  const positions = useRefresh<ci.PortfolioPosition[]>(() => ci.ciApi.listPortfolio(), 30_000, [sub]);
  const alerts = useRefresh<ci.SecurityAlert[]>(() => ci.ciApi.listAlerts(), 30_000, [sub]);
  const strategies = useRefresh<ci.Strategy[]>(() => ci.ciApi.listStrategies(), 60_000, [sub]);
  const trades = useRefresh<ci.TradeProposal[]>(() => ci.ciApi.listTrades(), 30_000, [sub]);
  const exchs = useRefresh<ci.ExchangeConnector[]>(() => ci.ciApi.listExchanges(), 60_000, [sub]);
  const d = dash.data;
  const [busy, setBusy] = useState<string|null>(null);

  async function enableModule(status: "enabled-readonly"|"enabled-paper"|"enabled-live") {
    setBusy("enable"); try { await ci.ciApi.enable(status); await dash.refresh(); toast.success("module status: "+status); }
    catch(e:any){ toast.error(e?.message??"failed"); } setBusy(null);
  }
  async function approveTrade(id: string) {
    setBusy(id); try { await ci.ciApi.approveTrade(id); await trades.refresh(); await dash.refresh(); toast.success("trade approved"); }
    catch(e:any){ toast.error(e?.message??"failed"); } setBusy(null);
  }

  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["chains", Globe, "Chains/Markets"],
    ["defi", Layers, "DeFi"],
    ["portfolio", Briefcase, "Portfolio"],
    ["trades", TrendingUp, "Trades"],
    ["exchanges", Server, "Exchanges"],
  ];

  return (
    <div className="space-y-4">
      <Card className={d?.moduleEnabled ? "border-amber/40" : "border-crimson/40"}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className={`h-5 w-5 mt-0.5 ${d?.moduleEnabled?"text-amber":"text-crimson"}`}/>
            <div className="flex-1">
              <div className="font-semibold text-text-bright">Opt-in module · Status: <span className={d?.moduleEnabled?"text-amber":"text-crimson"}>{d?.moduleStatus ?? "unknown"}</span></div>
              <div className="text-xs text-text-muted mt-1">{d?.note}</div>
              {!d?.moduleEnabled && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" disabled={busy==="enable"} onClick={()=>enableModule("enabled-readonly")}><Eye className="h-3 w-3 mr-1"/>Read-only</Button>
                  <Button size="sm" variant="warning" disabled={busy==="enable"} onClick={()=>enableModule("enabled-paper")}><FlaskConical className="h-3 w-3 mr-1"/>Paper trading</Button>
                  <Button size="sm" variant="danger" disabled={busy==="enable"} onClick={()=>enableModule("enabled-live")}><AlertTriangle className="h-3 w-3 mr-1"/>Live (governed)</Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>

      {sub==="overview" && (<>
        {!d ? <Skeleton/> : (<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><Coins className="h-4 w-4" style={{color:"#F59E0B"}}/>Markets</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#F59E0B"}}>{d.marketsTracked}</div><div className="text-xs text-text-muted mt-1">{d.chainsLive}/{d.chains} chains live</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><Layers className="h-4 w-4" style={{color:"#8B5CF6"}}/>DeFi protocols</div><div className="text-2xl font-semibold text-text-bright mt-1" style={{color:"#8B5CF6"}}>{d.defiProtocols}</div><div className="text-xs text-text-muted mt-1">{d.walletsTracked} wallets tracked</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><DollarSign className="h-4 w-4 text-emerald"/>Portfolio</div><div className="text-2xl font-semibold text-text-bright mt-1 text-emerald">${(d.portfolioValueUsd/1e6).toFixed(2)}M</div><div className="text-xs mt-1" style={{color:d.portfolioPnl24hUsd>=0?"#10B981":"#DC2626"}}>{d.portfolioPnl24hUsd>=0?"+":""}${d.portfolioPnl24hUsd.toLocaleString()} 24h</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-text-muted text-xs"><TrendingUp className="h-4 w-4 text-azure"/>Trades/Alerts</div><div className="text-2xl font-semibold text-text-bright mt-1 text-azure">{d.tradesExecuted24h}</div><div className="text-xs text-text-muted mt-1">{d.openOrders} open · {d.approvalsPending} approval · {d.riskAlerts} alerts</div></CardContent></Card>
        </div>)}
      </>)}

      {sub==="chains" && (<>
        <div className="text-sm text-text-muted">Chains ({(chains.data??[]).length}) · Markets ({(markets.data??[]).length})</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(chains.data??[]).map(c=>(
            <Card key={c.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${c.status==="online"?"bg-emerald":c.status==="degraded"?"bg-amber":"bg-crimson"}`}/>{c.chain}
              </CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-text-muted">Block</span><span className="font-mono">{c.blockHeight.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">TPS</span><span>{c.tps}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Gas</span><span>{c.gasPriceGwei.toFixed(2)} Gwei</span></div>
                {c.validators>0 && <div className="flex justify-between"><span className="text-text-muted">Validators</span><span>{c.validators.toLocaleString()} ({c.stakedPct}% staked)</span></div>}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Tickers</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(markets.data??[]).map(m=>(
            <Card key={m.id}>
              <CardContent className="p-3 text-xs">
                <div className="flex items-center justify-between"><span className="font-bold text-sm text-text-bright">{m.symbol}</span><Badge variant={m.sentiment==="bullish"?"emerald":m.sentiment==="bearish"?"crimson":"slate"}>{m.sentiment}</Badge></div>
                <div className="text-2xl font-semibold mt-1" style={{color:m.change24hPct>=0?"#10B981":"#DC2626"}}>${m.priceUsd.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
                <div className="flex justify-between text-text-muted mt-1"><span>{m.change24hPct>=0?"+":""}{m.change24hPct.toFixed(2)}%</span><span>vol ${(m.volume24hUsd/1e9).toFixed(2)}B</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>)}

      {sub==="defi" && (<>
        <div className="grid md:grid-cols-2 gap-3">
          {(protos.data??[]).map(p=>(
            <Card key={p.id}>
              <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-violet"/>{p.name}</CardTitle>
                <CardDescription className="text-xs">{p.chain} · {p.category} {p.audited && "· audited"} {p.hacked24m && "· ⚠ hacked 24m"}</CardDescription></CardHeader>
              <CardContent className="text-xs grid grid-cols-3 gap-2">
                <div><div className="text-text-bright font-semibold">${(p.tvlUsd/1e9).toFixed(2)}B</div>TVL</div>
                <div><div className="text-text-bright font-semibold text-emerald">{p.apy.toFixed(1)}%</div>APY</div>
                <div><div className="text-text-bright font-semibold" style={{color:p.riskScore>40?"#DC2626":p.riskScore>25?"#F59E0B":"#10B981"}}>{p.riskScore}</div>risk</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Yield opportunities</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(yields.data??[]).map(y=>(
            <Card key={y.id}><CardContent className="p-3 text-xs">
              <div className="font-semibold text-text-bright">{y.asset}</div>
              <div className="text-2xl font-semibold text-emerald mt-1">{y.apy.toFixed(2)}%</div>
              <div className="text-text-muted">TVL ${(y.tvlUsd/1e9).toFixed(2)}B · IL {y.impermanentLossRisk} · lock {y.lockupDays}d</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="portfolio" && (<>
        <div className="grid md:grid-cols-2 gap-3">
          {(wallets.data??[]).map(w=>(
            <Card key={w.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center justify-between"><span className="font-semibold text-text-bright">{w.label}</span><Badge variant={w.riskScore>30?"crimson":w.riskScore>15?"amber":"emerald"}>risk {w.riskScore}</Badge></div>
              <div className="text-text-muted font-mono text-[10px] truncate mt-1">{w.address}</div>
              <div className="text-lg text-text-bright mt-1">${w.balanceUsd.toLocaleString()}</div>
            </CardContent></Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Positions</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(positions.data??[]).map(p=>(
            <Card key={p.id}><CardContent className="p-3 text-xs">
              <div className="flex justify-between"><span className="font-semibold">{p.asset}</span><span>{p.allocationPct}%</span></div>
              <div className="text-lg text-text-bright">${(p.valueUsd/1000).toFixed(1)}k</div>
              <div style={{color:p.pnl24hUsd>=0?"#10B981":"#DC2626"}}>{p.pnl24hUsd>=0?"+":""}${p.pnl24hUsd.toLocaleString()} 24h</div>
            </CardContent></Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Security alerts ({(alerts.data??[]).length})</div>
        <div className="space-y-2">
          {(alerts.data??[]).slice(0,5).map(a=>(
            <Card key={a.id}><CardContent className="p-3 text-xs flex gap-2 items-start">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity==="high"||a.severity==="extreme"?"text-crimson":a.severity==="medium"?"text-amber":"text-text-muted"}`}/>
              <div><div className="text-text-bright font-semibold">{a.title}</div><div className="text-text-muted">{a.detail}</div></div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="trades" && (<>
        <div className="text-sm text-text-muted">Strategies</div>
        <div className="grid md:grid-cols-3 gap-3">
          {(strategies.data??[]).map(s=>(
            <Card key={s.id}><CardContent className="p-3 text-xs">
              <div className="flex justify-between"><span className="font-semibold">{s.name}</span><Badge variant={s.enabled?"emerald":"slate"}>{s.enabled?"on":"off"}</Badge></div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-text-muted">
                <div><div className="text-text-bright font-semibold">{s.winRate}%</div>win</div>
                <div><div className="text-text-bright font-semibold text-emerald">${s.pnl30dUsd.toLocaleString()}</div>30d</div>
              </div>
            </CardContent></Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Trade proposals ({(trades.data??[]).length})</div>
        <div className="space-y-2">
          {(trades.data??[]).map(t=>(
            <Card key={t.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={t.side==="buy"?"emerald":"crimson"}>{t.side.toUpperCase()}</Badge>
                  <span className="font-semibold text-text-bright">{t.symbol}</span>
                  <Badge variant="slate">{t.orderType}</Badge>
                  <Badge variant={t.state==="approved"||t.state==="filled"?"emerald":t.state==="rejected"?"crimson":t.state==="governance-review"?"amber":"slate"}>{t.state}</Badge>
                </div>
                {t.state==="governance-review" && <Button size="sm" variant="success" disabled={busy===t.id} onClick={()=>approveTrade(t.id)}><Check className="h-3 w-3 mr-1"/>{busy===t.id?"Approving…":"Approve"}</Button>}
              </div>
              <div className="text-text-muted mt-1">{t.reason}</div>
              <div className="flex gap-3 mt-1"><span>conf {Math.round(t.confidence*100)}%</span><span>risk {t.riskLevel}</span><span>approvals {t.approvalsReceived}/{t.approvalsRequired}</span></div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="exchanges" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(exchs.data??[]).map(e=>(
            <Card key={e.id}><CardContent className="p-3 text-xs flex items-center gap-3">
              <Server className="h-5 w-5 text-text-muted"/>
              <div className="flex-1">
                <div className="font-semibold text-text-bright">{e.name}</div>
                <div className="text-text-muted">{e.kind} · {e.authMethod}</div>
              </div>
              <Badge variant={e.status==="trade-enabled"?"emerald":e.status==="connected"||e.status==="readonly"?"azure":"crimson"}>{e.status}</Badge>
            </CardContent></Card>
          ))}
        </div>
        <div className="text-xs text-text-muted mt-3">Every live trading action routes through the Enterprise Governance Kernel, Portfolio/Risk/Compliance policies, Safety Governors, Audit Framework, and Human Approval before execution.</div>
      </>)}
    </div>
  );
}

function WakeIntelTab() {
  const dash = useRefresh<wi.WakeDashboard|null>(() => wi.wiApi.dashboard(), 30_000);
  const [sub, setSub] = useState<"overview"|"methods"|"clap"|"mfa"|"devices"|"emergency"|"workforce"|"audit">("overview");
  const cfg = useRefresh<wi.WakeConfig|null>(() => wi.wiApi.config(), 60_000, [sub]);
  const patterns = useRefresh<wi.ClapPattern[]>(() => wi.wiApi.clapPatterns(), 60_000, [sub]);
  const detections = useRefresh<wi.ClapDetection[]>(() => wi.wiApi.clapDetections(), 30_000, [sub]);
  const mfaPols = useRefresh<wi.MfaPolicy[]>(() => wi.wiApi.mfaPolicies(), 60_000, [sub]);
  const devices = useRefresh<wi.DeviceActivationState[]>(() => wi.wiApi.devices(), 30_000, [sub]);
  const emCfg = useRefresh<wi.EmergencyConfig|null>(() => wi.wiApi.emergencyConfig(), 60_000, [sub]);
  const emContacts = useRefresh<wi.EmergencyContact[]>(() => wi.wiApi.emergencyContacts(), 60_000, [sub]);
  const emEvents = useRefresh<wi.EmergencyEvent[]>(() => wi.wiApi.emergencyEvents(), 30_000, [sub]);
  const bindings = useRefresh<wi.WorkforceActivationBinding[]>(() => wi.wiApi.bindings(), 60_000, [sub]);
  const activations = useRefresh<wi.ActivationEvent[]>(() => wi.wiApi.activations(), 30_000, [sub]);
  const d = dash.data;

  const methodIcons: Record<string, any> = {
    "voice-wake-word": Mic2, "clap": HandIcon, "hotkey": Keyboard, "api": Server, "scheduled": Clock,
    "workflow": Workflow, "finger-snap": Zap, "smart-watch": Watch, "smart-button": Radio,
    nfc: CreditCard, "bluetooth-device": Wifi, "enterprise-hardware": ShieldIcon,
    "touch-gesture": HandIcon, "mouse-gesture": MousePointer2, "mobile-gesture": Smartphone,
    "automation-rule": Bot,
  };
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["methods", Zap, "Activation"],
    ["clap", HandIcon, "Clap"],
    ["mfa", ShieldCheck, "MFA"],
    ["devices", Smartphone, "Devices"],
    ["emergency", Siren, "Emergency"],
    ["workforce", Bot, "Workforces"],
    ["audit", FileText, "Audit"],
  ];

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald"/>
          <div className="flex-1">
            <div className="font-semibold">Governance applied</div>
            <div className="text-xs text-text-muted">Every activation path governed by WINDELS Constitution, Enterprise Governance Kernel, Identity Fabric, Security Framework, AI Governance Board, Privacy Policies, and Audit & Compliance Framework. Voice cloning requires consent (per session standing rule).</div>
          </div>
        </div>
      </CardContent></Card>

      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>

      {sub==="overview" && (<>
        {!d ? <Skeleton/> : (<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Zap className="h-4 w-4 text-crimson"/>Activations</div><div className="text-2xl font-semibold mt-1 text-crimson">{d.activations24h.toLocaleString()}</div><div className="text-xs text-text-muted mt-1">{d.avgLatencyMs}ms avg · {d.falsePositiveRatePct}% FP</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Radio className="h-4 w-4 text-amber"/>Methods</div><div className="text-2xl font-semibold mt-1 text-amber">{d.enabledMethods}</div><div className="text-xs text-text-muted mt-1">{d.activeDevices} active devices</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><HandIcon className="h-4 w-4 text-fuchsia"/>Clap/MFA</div><div className="text-2xl font-semibold mt-1" style={{color:"#D946EF"}}>{d.clapPatterns}/{d.mfaPolicies}</div><div className="text-xs text-text-muted mt-1">{d.mfaChallenges24h} MFA · {d.mfaFailures24h} fails</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Siren className="h-4 w-4 text-crimson"/>Emergency</div><div className="text-2xl font-semibold mt-1 text-crimson">{d.emergencyEvents24h}</div><div className="text-xs text-text-muted mt-1">{d.emergencyContacts} contacts · audit {d.auditRetentionDays}d</div></CardContent></Card>
        </div>)}
      </>)}

      {sub==="methods" && (<>
        <div className="text-sm text-text-muted">Default method: <span className="text-text-bright font-semibold">{cfg.data?.defaultMethod ?? "—"}</span> · Wake words: {(cfg.data?.wakeWords ?? []).join(", ")}</div>
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(cfg.data?.enabledMethods ?? []).map((m:any)=>{
            const Ic = methodIcons[m] ?? Zap;
            const needsMfa = (cfg.data?.requireMfaFor ?? []).includes(m);
            return (<Card key={m}><CardContent className="p-3 flex items-center gap-3">
              <Ic className="h-5 w-5 text-azure"/>
              <div className="flex-1">
                <div className="text-xs font-semibold text-text-bright">{m.replace(/-/g," ")}</div>
                <div className="text-[10px] text-text-muted">{needsMfa ? "MFA required" : "no MFA"}</div>
              </div>
              <Badge variant="emerald">on</Badge>
            </CardContent></Card>);
          })}
        </div>
      </>)}

      {sub==="clap" && (<>
        <div className="text-sm text-text-muted">ML-driven clap patterns ({(patterns.data??[]).length}) · detections ({(detections.data??[]).length})</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(patterns.data??[]).map(p=>(
            <Card key={p.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center justify-between"><span className="font-semibold">{p.name}</span><Badge variant={p.mfaRequired?"amber":"emerald"}>{p.mfaRequired?"MFA":"open"}</Badge></div>
              <div className="text-text-muted mt-1">{p.description}</div>
              <div className="text-text-muted mt-1">pattern: [{p.pattern.join(",")}]ms ±{p.toleranceMs}ms</div>
              <div className="mt-1"><Badge variant="slate">→ {p.action}</Badge></div>
            </CardContent></Card>
          ))}
        </div>
        <div className="text-sm text-text-muted mt-3">Recent detections</div>
        <div className="grid md:grid-cols-2 gap-2">
          {(detections.data??[]).slice(0,6).map(d=>(
            <Card key={d.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <HandIcon className="h-4 w-4 text-fuchsia"/>
              <div className="flex-1"><div className="font-semibold">pattern {d.patternId.slice(0,10)}…</div><div className="text-text-muted">conf {Math.round(d.confidence*100)}% · noise {d.environmentNoiseDb}dB · {d.falsePositiveRisk} FP risk</div></div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="mfa" && (<>
        <div className="grid md:grid-cols-2 gap-3">
          {(mfaPols.data??[]).map(p=>(
            <Card key={p.id}><CardContent className="p-3 text-xs">
              <div className="font-semibold text-text-bright">{p.name}</div>
              <div className="flex gap-1 flex-wrap mt-1">{p.requiredFactors.map((f,i)=><Badge key={i} variant="violet">{f}</Badge>)}</div>
              <div className="text-text-muted mt-1">
                applies to: {p.appliesTo.methods?.length?`methods: ${p.appliesTo.methods.join(",")}`:""} {p.appliesTo.emergency?" · emergency":""}
              </div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="devices" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(devices.data??[]).map(d=>(
            <Card key={d.deviceId}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                {d.online?<Wifi className="h-4 w-4 text-emerald"/>:<WifiOff className="h-4 w-4 text-crimson"/>}
                <span className="font-semibold flex-1">{d.deviceId}</span>
                <Badge variant={d.scope==="all-devices"?"azure":"slate"}>{d.scope}</Badge>
              </div>
              <div className="text-text-muted mt-1">{d.deviceKind} · user {d.user} · queue {d.offlineQueueDepth}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="emergency" && emCfg.data && (<>
        <Card className="border-crimson/50"><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><Siren className="h-5 w-5 text-crimson"/><div><div className="font-semibold">Emergency Mode</div><div className="text-text-muted">Triggers: {emCfg.data.triggerPhrases.join(", ")} · triple clap · {emCfg.data.shareLocation?"shares location":"no location"} · audio: {emCfg.data.recordAudio?"on":"off"} · reports: {emCfg.data.generateIncidentReport?"auto":"manual"}</div></div></div>
        </CardContent></Card>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-text-muted mb-2">Contacts ({(emContacts.data??[]).length})</div>
            {(emContacts.data??[]).map(c=>(
              <Card key={c.id} className="mb-2"><CardContent className="p-2 text-xs flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-azure"/><div className="flex-1"><span className="font-semibold">{c.label}</span> · <span className="text-text-muted">{c.type}</span> · {c.target}</div>
                <Badge variant={c.notifyOnEmergency?"crimson":"slate"}>{c.notifyOnEmergency?"notify":"silent"}</Badge>
              </CardContent></Card>
            ))}
          </div>
          <div>
            <div className="text-sm text-text-muted mb-2">Events ({(emEvents.data??[]).length})</div>
            {(emEvents.data??[]).length===0?<div className="text-text-muted text-xs">No emergency events.</div>:(emEvents.data??[]).slice(0,5).map(e=>(
              <Card key={e.id} className="mb-2 border-crimson/30"><CardContent className="p-2 text-xs">
                <div className="font-semibold text-crimson">Emergency — {e.triggerMethod}</div>
                <div className="text-text-muted">{new Date(e.timestamp).toLocaleString()} · {e.respondersNotified} notified · audio {e.audioRecorded?"recorded":"off"} · {e.incidentReportId?"report "+e.incidentReportId:"no report"}</div>
              </CardContent></Card>
            ))}
          </div>
        </div>
      </>)}

      {sub==="workforce" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(bindings.data??[]).map(b=>(
            <Card key={b.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet"/><span className="font-semibold flex-1">{b.workforceName}</span><Badge variant={b.requiresMfa?"amber":"emerald"}>{b.requiresMfa?"MFA":"direct"}</Badge></div>
              <div className="text-text-muted mt-1">Phrase: "{b.triggerPhrase}"</div>
              <div className="flex gap-1 flex-wrap mt-1">{b.triggerMethods.map((m,i)=><Badge key={i} variant="slate">{m}</Badge>)}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}

      {sub==="audit" && (<>
        <div className="text-sm text-text-muted">Tamper-evident activation audit log ({(activations.data??[]).length} recent events)</div>
        <div className="space-y-1">
          {(activations.data??[]).slice(0,40).map(a=>(
            <Card key={a.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <CircleDot className={`h-3 w-3 shrink-0 ${a.outcome==="accepted"?"text-emerald":a.outcome==="mfa-required"?"text-amber":a.outcome==="emergency"?"text-crimson":"text-text-muted"}`}/>
              <span className="font-mono text-text-muted w-36">{new Date(a.timestamp).toLocaleTimeString()}</span>
              <Badge variant="slate">{a.method}</Badge>
              <span className="flex-1 truncate text-text-muted">{a.deviceId} · {a.userId ?? "anon"} · conf {Math.round((a.confidence??0.8)*100)}% · {a.latencyMs}ms</span>
              <Badge variant={a.outcome==="accepted"?"emerald":a.outcome==="mfa-required"?"amber":a.outcome==="emergency"?"crimson":"slate"}>{a.outcome}</Badge>
              {a.emergency && <Badge variant="crimson">emergency</Badge>}
              {a.policyPassed && <Badge variant="emerald">policy ✓</Badge>}
            </CardContent></Card>
          ))}
        </div>
      </>)}
    </div>
  );
}

function ArchitectureTab() {
  const dash = useRefresh<arch.ArchitectureStatus|null>(() => arch.archApi.dashboard(), 30_000);
  const esi = useRefresh<arch.EsiFeed|null>(() => arch.archApi.esi(), 15_000);
  const d = dash.data;
  const [sub, setSub] = useState<"overview"|"modules"|"targets"|"esi">("overview");
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["modules", Layers, "Modules"],
    ["targets", Globe, "Deploy Targets"],
    ["esi", Brain, "ESI Feed"],
  ];
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-violet"/>
          <div className="flex-1">
            <div className="font-semibold">Enterprise Architecture Registry</div>
            <div className="text-xs text-text-muted">Declarative stubs for ESI, SI, Kernel, God-Node, Governance, Security, Memory, Knowledge Graph, Marketplace Ecosystem, Dev Portal, AI Workforce, and all deployment targets (desktop/mobile/web/cloud/edge/air-gapped/offline/federated).</div>
          </div>
        </div>
      </CardContent></Card>
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>
      {sub==="overview" && (<>
        {!d?<Skeleton/>:(<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Layers className="h-4 w-4" style={{color:"#6366F1"}}/>Modules</div><div className="text-2xl font-semibold mt-1" style={{color:"#6366F1"}}>{d.modules.length}</div><div className="text-xs text-text-muted mt-1">{d.modules.filter((m:any)=>m.status==="available").length} available · {d.modules.filter((m:any)=>m.status==="stub").length} stubs</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Globe className="h-4 w-4 text-teal"/>Deploy Targets</div><div className="text-2xl font-semibold mt-1 text-teal">{d.deploymentTargets.length}</div><div className="text-xs text-text-muted mt-1">{d.deploymentTargets.join(", ")}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Brain className="h-4 w-4 text-violet"/>ESI Signals</div><div className="text-2xl font-semibold mt-1 text-violet">{(esi.data?.signals.length)??0}</div><div className="text-xs text-text-muted mt-1">Superintelligence feed</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Package className="h-4 w-4 text-amber"/>Monorepo</div><div className="text-sm font-semibold mt-1 text-amber">{d.monorepo}</div><div className="text-xs text-text-muted mt-1">pnpm + turborepo</div></CardContent></Card>
        </div>)}
      </>)}
      {sub==="modules" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(d?.modules??[]).map((m:any)=>(
            <Card key={m.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Component className="h-4 w-4" style={{color:"#6366F1"}}/>
                <span className="font-semibold flex-1 text-text-bright">{m.name}</span>
                <Badge variant={m.status==="available"?"emerald":m.status==="stub"?"slate":"amber"}>{m.status}</Badge>
              </div>
              <div className="text-text-muted mt-1">{m.description}</div>
              <div className="mt-1 text-text-muted">Session {m.introducedInSession} · apis: {m.apis.length?m.apis.join(", "):"—"} · deps: {m.dependsOn.length?m.dependsOn.join(", "):"none"}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="targets" && (<>
        <div className="grid md:grid-cols-4 gap-3">
          {(d?.deploymentTargets??[]).map((t:any)=>(
            <Card key={t}><CardContent className="p-3 flex items-center gap-2">
              <Globe className="h-5 w-5 text-teal"/>
              <div><div className="font-semibold">{t}</div><div className="text-xs text-text-muted">deployment target</div></div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="esi" && (<>
        <div className="text-sm text-text-muted">Superintelligence Layer signal feed ({(esi.data?.signals.length)??0} signals)</div>
        <div className="space-y-1">
          {(esi.data?.signals??[]).slice(0,30).map((s:any)=>(
            <Card key={s.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet shrink-0"/>
              <span className="flex-1"><span className="font-semibold">{s.source}</span> · <span className="text-text-muted">{s.signal}</span></span>
              <Badge variant="violet">{Math.round(s.confidence*100)}%</Badge>
            </CardContent></Card>
          ))}
        </div>
      </>)}
    </div>
  );
}

function SelfHostedTab() {
  const dash = useRefresh<sh.SelfHostedDashboard|null>(() => sh.shApi.dashboard(), 10_000);
  const nodes = useRefresh<sh.GpuNode[]>(() => sh.shApi.nodes(), 15_000);
  const models = useRefresh<sh.RegisteredModel[]>(() => sh.shApi.models(), 15_000);
  const vectors = useRefresh<sh.VectorStore[]>(() => sh.shApi.vectorStores(), 30_000);
  const jobs = useRefresh<sh.InferenceJob[]>(() => sh.shApi.jobs(), 10_000);
  const d = dash.data;
  const [sub, setSub] = useState<"overview"|"nodes"|"models"|"inference"|"vectors">("overview");
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["nodes", Server, "GPU Nodes"],
    ["models", Package, "Models"],
    ["inference", Zap, "Inference"],
    ["vectors", Database, "Vector DBs"],
  ];
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-teal"/>
          <div className="flex-1">
            <div className="font-semibold">Self-Hosted AI Infrastructure</div>
            <div className="text-xs text-text-muted">Private GPU clusters, distributed inference, model registry & lifecycle, private vector DBs, local/edge/air-gapped processing, HA scheduling, intelligent compute allocation.</div>
          </div>
        </div>
      </CardContent></Card>
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>
      {sub==="overview" && (<>
        {!d?<Skeleton/>:(<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Server className="h-4 w-4 text-teal"/>Nodes</div><div className="text-2xl font-semibold mt-1 text-teal">{d.nodesOnline}/{d.nodes}</div><div className="text-xs text-text-muted mt-1">{d.edgeNodes} edge · {d.airgapMode?"airgap on":"no airgap"} · HA {d.haClusterHealthy?"✓":"✗"}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Package className="h-4 w-4 text-azure"/>VRAM</div><div className="text-2xl font-semibold mt-1 text-azure">{Math.round(d.aggregateVramUsedGb)}/{d.aggregateVramGb}GB</div><div className="text-xs text-text-muted mt-1">{d.gpuUtilizationPct}% util</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Cpu className="h-4 w-4 text-violet"/>Models</div><div className="text-2xl font-semibold mt-1 text-violet">{d.modelsLoaded}/{d.models}</div><div className="text-xs text-text-muted mt-1">{d.modelsReady} ready · {d.inferenceJobs24h} jobs 24h</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Zap className="h-4 w-4 text-amber"/>Latency</div><div className="text-2xl font-semibold mt-1 text-amber">{d.avgInferenceLatencyMs}ms</div><div className="text-xs text-text-muted mt-1">avg p95 inference · {d.vectorStores} vector DBs</div></CardContent></Card>
        </div>)}
      </>)}
      {sub==="nodes" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(nodes.data??[] as any[]).map((n:any)=>(
            <Card key={n.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                {n.status==="online"?<CheckCircle2 className="h-4 w-4 text-emerald"/>:<XCircle className="h-4 w-4 text-crimson"/>}
                <span className="font-semibold flex-1 text-text-bright">{n.name}</span>
                <Badge variant={n.status==="online"?"emerald":n.status==="maintenance"?"amber":"crimson"}>{n.status}</Badge>
              </div>
              <div className="text-text-muted mt-1">{n.hostname} · {n.region} · {n.kind}</div>
              <div className="text-text-muted mt-1">{n.gpuCount}×{n.gpuType} · VRAM {n.vramUsedGb}/{n.vramGb}GB · {n.cpuCores} cores · {n.ramGb}GB RAM</div>
              <div className="mt-1 flex gap-1 flex-wrap">{n.tags.map((t:any,i:any)=><Badge key={i} variant="slate">{t}</Badge>)}</div>
              <div className="text-text-muted mt-1">util {n.utilizationPct}% · {n.temperatureC}°C · {n.powerW}W</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="models" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(models.data??[] as any[]).map((m:any)=>(
            <Card key={m.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-azure"/>
                <span className="font-semibold flex-1 text-text-bright">{m.name} {m.version}</span>
                <Badge variant={m.state==="loaded"?"emerald":m.state==="ready"?"azure":"slate"}>{m.state}</Badge>
              </div>
              <div className="text-text-muted mt-1">{m.format} · {m.backend} · {m.quant} · {m.sizeGb}GB · ctx {m.contextWindow.toLocaleString()}</div>
              <div className="flex gap-1 flex-wrap mt-1">{m.capabilities.map((c:any,i:any)=><Badge key={i} variant="violet">{c}</Badge>)}</div>
              {m.loadedOnNodeId && <div className="text-text-muted mt-1">on node {m.loadedOnNodeId.slice(0,12)}</div>}
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="inference" && (<>
        <div className="text-sm text-text-muted">Recent inference jobs ({(jobs.data??[]).length})</div>
        <div className="space-y-1">
          {(jobs.data??[]).slice(0,30).map((j:any)=>(
            <Card key={j.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber shrink-0"/>
              <span className="font-mono text-text-muted w-20">{j.id.slice(0,10)}</span>
              <Badge variant="slate">{j.status}</Badge>
              <span className="flex-1 text-text-muted">{j.modelId.slice(0,28)} · node {j.nodeId.slice(0,10)} · in {j.inputTokens} / out {j.outputTokens}</span>
              <span className="text-text-muted">{j.latencyMs}ms</span>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="vectors" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(vectors.data??[] as any[]).map((v:any)=>(
            <Card key={v.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><Database className="h-4 w-4 text-teal"/><span className="font-semibold flex-1">{v.name}</span><Badge variant={v.status==="online"?"emerald":v.status==="provisioning"?"amber":"crimson"}>{v.status}</Badge></div>
              <div className="text-text-muted mt-1">{v.backend} · {v.dimensions}d · {v.vectorCount.toLocaleString()} vectors · {v.sizeGb}GB</div>
              {v.airgapped && <Badge variant="crimson" className="mt-1">airgapped</Badge>}
            </CardContent></Card>
          ))}
        </div>
      </>)}
    </div>
  );
}

function KernelTab() {
  const dash = useRefresh<kr.KernelDashboard|null>(() => kr.krApi.dashboard(), 5_000);
  const components = useRefresh<kr.KernelComponent[]>(() => kr.krApi.components(), 10_000);
  const events = useRefresh<kr.KernelEvent[]>(() => kr.krApi.events(), 5_000);
  const d = dash.data;
  const [sub, setSub] = useState<"overview"|"components"|"events"|"policy"|"diagnostics">("overview");
  const [diag, setDiag] = useState<{healthy:boolean;degraded:string[]}|null>(null);
  const [polRes, setPolRes] = useState<kr.KernelPolicyDecision|null>(null);
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["components", Cpu, "Components"],
    ["events", Activity, "Event Bus"],
    ["policy", ShieldCheck, "Policy"],
    ["diagnostics", HeartPulse, "Diagnostics"],
  ];
  const runDiag = async () => { try { setDiag(await kr.krApi.runDiagnostics()); } catch(e:any){ toast.error(e.message); } };
  const testPolicy = async () => {
    try { setPolRes(await kr.krApi.evaluatePolicy({ action: "deploy", risk: "high" })); } catch(e:any){ toast.error(e.message);}
  };
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-violet"/>
          <div className="flex-1">
            <div className="font-semibold">Enterprise AI Kernel</div>
            <div className="text-xs text-text-muted">Every module communicates through the Kernel: context, memory, reasoning, resource scheduling, agent scheduling, event bus, communication bus, KG sync, policy enforcement, security, compute, model selection, workflow/voice/media orchestration, self-optimization/diagnostics/healing/performance/health.</div>
          </div>
        </div>
      </CardContent></Card>
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>
      {sub==="overview" && (<>
        {!d?<Skeleton/>:(<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Cpu className="h-4 w-4 text-violet"/>Components</div><div className="text-2xl font-semibold mt-1 text-violet">{d.components.length}</div><div className="text-xs text-text-muted mt-1">{d.components.filter((c:any)=>c.status==="online").length} online · uptime {Math.floor(d.uptimeSeconds/60)}m</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Activity className="h-4 w-4 text-azure"/>Events 24h</div><div className="text-2xl font-semibold mt-1 text-azure">{d.events24h.toLocaleString()}</div><div className="text-xs text-text-muted mt-1">{d.avgDispatchLatencyMs}ms avg dispatch</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4 text-amber"/>Policy</div><div className="text-2xl font-semibold mt-1 text-amber">{d.policiesEvaluated24h}</div><div className="text-xs text-text-muted mt-1">{d.policiesBlocked24h} blocked · {d.selfHealed24h} self-healed</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Zap className="h-4 w-4 text-teal"/>Model Sel</div><div className="text-2xl font-semibold mt-1 text-teal">{d.modelSelections24h}</div><div className="text-xs text-text-muted mt-1">intelligent routing</div></CardContent></Card>
        </div>)}
      </>)}
      {sub==="components" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(components.data??[] as any[]).map((c:any)=>(
            <Card key={c.key}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-violet"/>
                <span className="font-semibold flex-1 text-text-bright">{c.name}</span>
                <Badge variant={c.status==="online"?"emerald":c.status==="stub"?"slate":c.status==="degraded"?"amber":"crimson"}>{c.status}</Badge>
              </div>
              <div className="text-text-muted mt-1">{c.key} · msg/s {c.messageRate} · err {Math.round(c.errorRate*100)}%</div>
              <div className="text-text-muted mt-1">hb {new Date(c.lastHeartbeat).toLocaleTimeString()}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="events" && (<>
        <div className="text-sm text-text-muted">Kernel event bus — recent events ({(events.data??[]).length})</div>
        <div className="space-y-1">
          {(events.data??[]).slice(0,40).map((e:any)=>(
            <Card key={e.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-violet shrink-0"/>
              <span className="font-mono text-text-muted w-20">{e.id}</span>
              <Badge variant="violet">{e.kind}</Badge>
              <span className="flex-1 text-text-muted"><b>{e.source}</b>{e.target?` → ${e.target}`:""} · {Object.keys(e.payload).length} keys</span>
              <span className="text-text-muted shrink-0">{new Date(e.at).toLocaleTimeString()}</span>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="policy" && (<>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={testPolicy}><ShieldCheck className="h-3.5 w-3.5 mr-1"/>Evaluate high-risk (block)</Button>
        </div>
        {polRes && (<Card className="mt-3"><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2">
            {polRes.allowed?<CheckCircle2 className="h-4 w-4 text-emerald"/>:<XCircle className="h-4 w-4 text-crimson"/>}
            <span className="font-semibold">{polRes.allowed?"Allowed":"Blocked"}</span>
          </div>
          {polRes.reason && <div className="text-text-muted mt-1">{polRes.reason}</div>}
          {polRes.requiredApprovals.length>0 && <div className="mt-1 flex gap-1 flex-wrap">{polRes.requiredApprovals.map((a:any,i:any)=><Badge key={i} variant="amber">{a}</Badge>)}</div>}
        </CardContent></Card>)}
      </>)}
      {sub==="diagnostics" && (<>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={runDiag}><HeartPulse className="h-3.5 w-3.5 mr-1"/>Run Diagnostics</Button>
        </div>
        {diag && (<Card className="mt-3"><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2">
            {diag.healthy?<CheckCircle2 className="h-4 w-4 text-emerald"/>:<AlertTriangle className="h-4 w-4 text-amber"/>}
            <span className="font-semibold">{diag.healthy?"Healthy":"Issues found (auto-healed)"}</span>
          </div>
          {diag.degraded.length>0 && <div className="text-text-muted mt-1">Degraded: {diag.degraded.join(", ")}</div>}
        </CardContent></Card>)}
      </>)}
    </div>
  );
}

function VoiceStudioTab() {
  const dash = useRefresh<vs.VoiceStudioDashboard|null>(() => vs.vsApi.dashboard(), 10_000);
  const builtin = useRefresh<vs.BuiltInVoice[]>(() => vs.vsApi.builtinVoices(), 30_000);
  const custom = useRefresh<vs.CustomVoice[]>(() => vs.vsApi.customVoices(), 15_000);
  const presets = useRefresh<vs.VoicePreset[]>(() => vs.vsApi.presets(), 15_000);
  const jobs = useRefresh<vs.TtsJob[]>(() => vs.vsApi.jobs(), 10_000);
  const d = dash.data;
  const [sub, setSub] = useState<"overview"|"library"|"custom"|"synth"|"presets"|"consent">("overview");
  const [synthText, setSynthText] = useState("Welcome to WINDELS Voice Studio.");
  const [synthVid, setSynthVid] = useState("");
  const [synthJob, setSynthJob] = useState<vs.TtsJob|null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloneErr, setCloneErr] = useState<string|null>(null);
  useEffect(()=>{const bv=(builtin.data??[])[0]; if(bv && !synthVid) setSynthVid(bv.id);},[builtin.data]);
  const doSynth = async () => {
    if (!synthVid || !synthText.trim()) return;
    try { const j = await vs.vsApi.synthesize({ voiceId: synthVid, text: synthText }); setSynthJob(j); toast.success(`TTS ready in ${j.durationMs}ms`); }
    catch(e:any){ toast.error(e.message); }
  };
  const doClone = async () => {
    setCloneErr(null);
    if (!cloneName.trim()) { setCloneErr("Name required"); return; }
    if (!cloneConsent) { setCloneErr("CONSENT_REQUIRED: consent must be recorded before cloning"); return; }
    try {
      await vs.vsApi.cloneVoice({ name: cloneName, gender:"feminine", age:"adult", language:"en", method:"fast-clone", consentGranted: true });
      toast.success("Voice cloned!"); setCloneName(""); setCloneConsent(false);
    } catch(e:any){ setCloneErr(e.message); }
  };
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["library", Mic2, "Voice Library"],
    ["custom", UserCircle, "My Voices"],
    ["synth", Volume2, "Synthesize"],
    ["presets", Palette, "Presets"],
    ["consent", BadgeCheck, "Consent"],
  ];
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-amber"/>
          <div className="flex-1">
            <div className="font-semibold">Enterprise Voice Studio</div>
            <div className="text-xs text-text-muted">14M + 14F + 3 children + 19 regional/multilingual voices (incl. Nigerian English, Pidgin, Igbo, Yoruba, Hausa, Edo). Consent-gated cloning, full customization (pitch/speed/volume/energy/warmth/emotion/formality/accent/pause/breathing), 13 emotions, cross-voice multilingual TTS.</div>
          </div>
        </div>
      </CardContent></Card>
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>
      {sub==="overview" && (<>
        {!d?<Skeleton/>:(<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Mic2 className="h-4 w-4 text-amber"/>Built-in</div><div className="text-2xl font-semibold mt-1 text-amber">{d.builtInVoices}</div><div className="text-xs text-text-muted mt-1">{d.customVoices} custom · {d.clonedVoices} cloned</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Languages className="h-4 w-4 text-azure"/>Languages</div><div className="text-2xl font-semibold mt-1 text-azure">{d.languages}</div><div className="text-xs text-text-muted mt-1">{d.emotions} emotions supported</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Volume2 className="h-4 w-4 text-teal"/>TTS 24h</div><div className="text-2xl font-semibold mt-1 text-teal">{d.ttsJobs24h}</div>{/* S162: null until a synthesis is actually measured — never "180ms". */}
          <div className="text-xs text-text-muted mt-1">{d.avgSynthLatencyMs == null ? "—" : `${d.avgSynthLatencyMs}ms`} avg · {d.presets} presets</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4 text-crimson"/>Consent</div><div className="text-2xl font-semibold mt-1 text-crimson">{d.consentViolations}</div><div className="text-xs text-text-muted mt-1">violations blocked</div></CardContent></Card>
        </div>)}
      </>)}
      {sub==="library" && (<>
        <div className="text-sm text-text-muted">Built-in voices ({(builtin.data??[]).length}) — Nigerian languages included</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
          {(builtin.data??[] as any[]).map((v:any)=>(
            <Card key={v.id} className="cursor-pointer hover:border-amber/40" onClick={()=>setSynthVid(v.id)}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Mic2 className={`h-4 w-4 ${synthVid===v.id?"text-amber":"text-text-muted"}`}/>
                <span className="font-semibold flex-1 text-text-bright">{v.name}</span>
                {v.premium && <Badge variant="amber">pro</Badge>}
              </div>
              <div className="text-text-muted mt-1">{v.gender} · {v.age} · {v.language}{v.region?` (${v.region})`:""} · {v.category}</div>
              <div className="flex gap-1 flex-wrap mt-1">{v.tags.map((t:any,i:any)=><Badge key={i} variant="slate">{t}</Badge>)}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="custom" && (<>
        <div className="text-sm text-text-muted">Your private voices ({(custom.data??[]).length}) — default visibility private</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(custom.data??[] as any[]).map((v:any)=>(
            <Card key={v.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><UserCircle className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{v.name}</span><Badge variant={v.visibility==="private"?"slate":v.visibility==="org"?"azure":"emerald"}>{v.visibility}</Badge></div>
              <div className="text-text-muted mt-1">{v.gender} · {v.age} · {v.language} · {v.cloneMethod??"base"}</div>
              <div className="flex gap-1 flex-wrap mt-1">{v.emotions.map((e:any,i:any)=><Badge key={i} variant="violet">{e}</Badge>)}</div>
              <div className="text-text-muted mt-1">consent: {v.consent} · created {new Date(v.createdAt).toLocaleDateString()}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="synth" && (<>
        <Card><CardContent className="p-4 space-y-3">
          <div className="text-xs text-text-muted">Selected voice: <span className="text-text-bright font-semibold">{synthVid||"—"}</span></div>
          <Input placeholder="Text to speak..." value={synthText} onChange={e=>setSynthText(e.target.value)}/>
          <Button size="sm" variant="primary" onClick={doSynth}><Volume2 className="h-3.5 w-3.5 mr-1"/>Synthesize</Button>
          {synthJob && (<div className="text-xs p-2 rounded bg-emerald/10 border border-emerald/30">
            ✓ {synthJob.id} ready in {synthJob.durationMs}ms · audio <code className="text-text-bright">{synthJob.audioUrl}</code>
          </div>)}
        </CardContent></Card>
        <div className="text-sm text-text-muted">Recent jobs ({(jobs.data??[]).length})</div>
        <div className="space-y-1">
          {(jobs.data??[]).slice(0,20).map((j:any)=>(
            <Card key={j.id}><CardContent className="p-2 text-xs flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-amber"/>
              <span className="font-mono text-text-muted w-20">{j.id}</span>
              <Badge variant="emerald">{j.status}</Badge>
              <span className="flex-1 text-text-muted">{j.voiceId.slice(0,24)}</span>
              <span className="text-text-muted">{j.durationMs}ms</span>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="presets" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(presets.data??[] as any[]).map((p:any)=>(
            <Card key={p.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{p.name}</span></div>
              <div className="text-text-muted mt-1">{p.description??""}</div>
              <div className="text-text-muted mt-1">voice {p.voiceId.slice(0,16)} · warmth {p.settings.warmth??"—"} · energy {p.settings.energy??"—"} · speed {p.settings.speed??"—"}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="consent" && (<>
        <Card className="border-crimson/40"><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-crimson"/><div><div className="font-semibold">Consent Gate</div><div className="text-xs text-text-muted">Voice cloning requires explicit consent recording before pipeline execution. All cloned voices default to private visibility. Consent violations are logged and blocked.</div></div></div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 rounded bg-emerald/10 border border-emerald/30"><b className="text-emerald">✓</b> Upload samples — consent dialog first</div>
            <div className="p-2 rounded bg-emerald/10 border border-emerald/30"><b className="text-emerald">✓</b> Record in-app — consent checkbox required</div>
            <div className="p-2 rounded bg-emerald/10 border border-emerald/30"><b className="text-emerald">✓</b> Import audio — signed authorization</div>
            <div className="p-2 rounded bg-emerald/10 border border-emerald/30"><b className="text-emerald">✓</b> Fast-clone / HF-clone / Pro — consent logged</div>
          </div>
          <div className="text-xs font-semibold pt-2 border-t border-white/5">Try cloning (will fail without consent):</div>
          <Input placeholder="Voice name" value={cloneName} onChange={e=>setCloneName(e.target.value)}/>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cloneConsent} onChange={e=>setCloneConsent(e.target.checked)}/>I confirm I have authorization/consent to clone this voice</label>
          <Button size="sm" variant="primary" onClick={doClone}><Mic2 className="h-3.5 w-3.5 mr-1"/>Clone Voice</Button>
          {cloneErr && <div className="text-xs p-2 rounded bg-crimson/10 border border-crimson/30 text-crimson">{cloneErr}</div>}
        </CardContent></Card>
      </>)}
    </div>
  );
}

function TradingIntelTab() {
  const dash = useRefresh<ti.TiDashboard|null>(() => ti.tiApi.dashboard(), 10_000);
  const agents = useRefresh<ti.TiAgent[]>(() => ti.tiApi.agents(), 15_000);
  const inds = useRefresh<ti.TiIndicatorPlugin[]>(() => ti.tiApi.indicators(), 60_000);
  const inst = useRefresh<ti.TiInstrument[]>(() => ti.tiApi.instruments(), 30_000);
  const pos = useRefresh<ti.TiPosition[]>(() => ti.tiApi.positions(), 10_000);
  const risk = useRefresh<ti.TiRiskProfile|null>(() => ti.tiApi.risk(), 15_000);
  const sent = useRefresh<ti.TiSentimentReading[]>(() => ti.tiApi.sentiment(30), 15_000);
  const econs = useRefresh<ti.TiEconomicEvent[]>(() => ti.tiApi.economicCalendar(7), 60_000);
  const insights = useRefresh<ti.TiLearningInsight[]>(() => ti.tiApi.insights(20), 30_000);
  const [sub, setSub] = useState<"overview"|"markets"|"agents"|"indicators"|"positions"|"risk"|"sentiment"|"calendar"|"sim"|"learn">("overview");
  const [simInst, setSimInst] = useState("BTC/USD");
  const [simRes, setSimRes] = useState<ti.TiSimulationResult[]|null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const d = dash.data;
  useEffect(()=>{const i=(inst.data??[])[0]; if(i && !simInst) setSimInst(i.id);},[inst.data]);
  const runSim = async () => { setSimBusy(true); try { setSimRes(await ti.tiApi.simulate({ instrumentId: simInst, horizon: "7d" })); } catch(e:any){ toast.error(e.message); } setSimBusy(false); };
  const subBtns: [string,any,string][] = [
    ["overview", LayoutDashboard, "Overview"],
    ["markets", Globe, "Markets"],
    ["agents", Bot, "AI Workforce"],
    ["indicators", LineChart, "Indicators"],
    ["positions", Briefcase, "Positions"],
    ["risk", ShieldAlert, "Risk"],
    ["sentiment", Speech, "Sentiment"],
    ["calendar", Calendar, "Econ Calendar"],
    ["sim", Activity, "Simulation"],
    ["learn", BookOpen, "Learning"],
  ];
  return (
    <div className="space-y-4">
      <Card className="border-emerald/30"><CardContent className="p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald"/>
          <div className="flex-1">
            <div className="font-semibold">Unified Global Financial Markets Intelligence & Trading Platform</div>
            <div className="text-xs text-text-muted">Session 81 — horizontal expansion of Session 35 Crypto Intelligence across 13 market classes, 18-agent AI workforce, 20 pluggable technical indicators, enhanced risk engine, multi-scenario predictive simulation, sentiment pipeline, continuous learning. Live execution gated by Governance Kernel + human approval.</div>
          </div>
        </div>
      </CardContent></Card>
      <div className="flex gap-2 flex-wrap">
        {subBtns.map(([k,Ic,lbl])=>(
          <Button key={k} size="sm" variant={sub===k?"primary":"ghost"} onClick={()=>setSub(k as any)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>
        ))}
      </div>
      {sub==="overview" && (<>
        {!d?<Skeleton/>:(<div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Globe className="h-4 w-4 text-emerald"/>Markets</div><div className="text-2xl font-semibold mt-1 text-emerald">{Object.keys(d.markets).length}</div><div className="text-xs text-text-muted mt-1">{d.agentsOnline}/{d.agentsTotal} agents online</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Bot className="h-4 w-4 text-violet"/>AI Workforce</div><div className="text-2xl font-semibold mt-1 text-violet">{d.indicators}</div><div className="text-xs text-text-muted mt-1">pluggable indicators</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Briefcase className="h-4 w-4 text-azure"/>Positions</div><div className="text-2xl font-semibold mt-1 text-azure">{d.positionsOpen}</div><div className="text-xs text-text-muted mt-1">PnL 24h <span className={d.pnl24hUsd>=0?"text-emerald":"text-crimson"}>{d.pnl24hUsd>=0?"+":""}${d.pnl24hUsd.toLocaleString()}</span></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Activity className="h-4 w-4 text-amber"/>Signals</div><div className="text-2xl font-semibold mt-1 text-amber">{d.simulationsRun24h}</div><div className="text-xs text-text-muted mt-1">sims · {d.learningInsights} insights · {d.riskAlerts} alerts</div></CardContent></Card>
        </div>)}
        {d && (<Card className="mt-3"><CardContent className="p-4 grid md:grid-cols-4 gap-3 text-xs">
          {Object.entries(d.markets).map(([k,v])=>(
            <div key={k} className="flex items-center gap-2">
              {v.open?<CheckCircle2 className="h-4 w-4 text-emerald"/>:<XCircle className="h-4 w-4 text-crimson"/>}
              <div className="flex-1"><span className="font-semibold">{k}</span><span className="text-text-muted"> · {v.instruments} instr</span></div>
            </div>
          ))}
        </CardContent></Card>)}
      </>)}
      {sub==="markets" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(inst.data??[]).map(i=>(
            <Card key={i.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-4 w-4 ${i.change24hPct>=0?"text-emerald":"text-crimson"}`}/>
                <span className="font-semibold flex-1 text-text-bright">{i.symbol}</span>
                <Badge variant="slate">{i.marketClass}</Badge>
              </div>
              <div className="text-text-muted mt-1">{i.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-text-bright font-semibold">{typeof i.price==="number"?i.price.toLocaleString(undefined,{maximumFractionDigits:4}):i.price}</span>
                <span className={i.change24hPct>=0?"text-emerald":"text-crimson"}>{i.change24hPct>=0?"+":""}{i.change24hPct.toFixed(2)}%</span>
                <Badge variant={i.signal==="buy"?"emerald":i.signal==="sell"?"crimson":"slate"}>{i.signal}</Badge>
                <span className="text-text-muted ml-auto">{i.confidence != null ? `${Math.round(i.confidence*100)}%` : "—"}</span>
              </div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="agents" && (<>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(agents.data??[]).map(a=>(
            <Card key={a.key}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet"/>
                <span className="font-semibold flex-1 text-text-bright">{a.name}</span>
                <Badge variant={a.status==="online"?"emerald":a.status==="stub"?"slate":"amber"}>{a.status}</Badge>
              </div>
              <div className="text-text-muted mt-1">{a.description}</div>
              <div className="text-text-muted mt-1">signals {a.signals24h} · approved {a.approvedTrades24h} · blocked {a.blockedTrades24h} · err {Math.round(a.errorRate*100)}%</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="indicators" && (<>
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(inds.data??[]).map(x=>(
            <Card key={x.id}><CardContent className="p-3 text-xs flex items-center gap-2">
              <LineChart className="h-4 w-4 text-azure"/>
              <div className="flex-1"><span className="font-semibold">{x.id}</span> <span className="text-text-muted">· {x.name}</span></div>
              <Badge variant={x.category==="trend"?"azure":x.category==="momentum"?"violet":x.category==="volatility"?"amber":x.category==="volume"?"teal":"fuchsia"}>{x.category}</Badge>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="positions" && (<>
        <div className="grid md:grid-cols-2 gap-3">
          {(pos.data??[]).map(p=>(
            <Card key={p.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2">
                <Briefcase className={`h-4 w-4 ${p.side==="long"?"text-emerald":"text-crimson"}`}/>
                <span className="font-semibold flex-1">{p.instrumentId}</span>
                <Badge variant={p.side==="long"?"emerald":"crimson"}>{p.side}</Badge>
              </div>
              <div className="text-text-muted mt-1">{p.marketClass} · size {p.size} · entry {p.entryPrice} → {p.currentPrice}</div>
              <div className={`mt-1 font-semibold ${p.pnlUsd>=0?"text-emerald":"text-crimson"}`}>{p.pnlUsd>=0?"+":""}${p.pnlUsd.toFixed(2)} ({p.pnlPct.toFixed(2)}%)</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="risk" && risk.data && (<>
        <div className="grid md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-text-muted">VaR 95 (24h)</div><div className="text-xl font-semibold mt-1 text-crimson">${Math.abs(risk.data.var95Usd).toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Drawdown</div><div className="text-xl font-semibold mt-1 text-amber">{risk.data.currentDrawdownPct}% / {risk.data.maxDrawdownPct}%</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Sharpe</div><div className="text-xl font-semibold mt-1 text-emerald">{risk.data.sharpeRatio}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-text-muted">β vs market</div><div className="text-xl font-semibold mt-1 text-azure">{risk.data.betaVsMarket}</div></CardContent></Card>
        </div>
        <Card className="mt-3"><CardContent className="p-3 text-xs">
          <div className="font-semibold mb-1">Position sizing: <Badge variant="azure">{risk.data.positionSizing}</Badge> · Stop loss: <Badge variant={risk.data.stopLoss.enabled?"emerald":"slate"}>{risk.data.stopLoss.enabled?`${risk.data.stopLoss.defaultPct}%${risk.data.stopLoss.trailing?" trailing":""}`:"off"}</Badge> · Take profit: <Badge variant={risk.data.takeProfit.enabled?"emerald":"slate"}>{risk.data.takeProfit.enabled?`${risk.data.takeProfit.defaultPct}%`:"off"}</Badge></div>
          <div className="text-text-muted mt-1">Volatility regime: <b className="text-text-bright">{risk.data.volatilityRegime}</b> · Stress tests passed <span className="text-emerald">{risk.data.stressTestsPassed}</span> / failed <span className="text-crimson">{risk.data.stressTestsFailed}</span></div>
          <div className="flex gap-1 flex-wrap mt-2">Correlation concerns: {risk.data.correlationConcerns.map((c:any,i:any)=><Badge key={i} variant="amber">{c}</Badge>)}</div>
        </CardContent></Card>
      </>)}
      {sub==="sentiment" && (<>
        <div className="text-sm text-text-muted">Sentiment readings — weights modify technical/fundamental signals (never standalone)</div>
        <div className="space-y-1">
          {(sent.data??[]).slice(0,30).map(r=>(
            <Card key={r.at+r.instrumentId+r.source}><CardContent className="p-2 text-xs flex items-center gap-2">
              <Speech className={`h-3.5 w-3.5 shrink-0 ${r.score>0.2?"text-emerald":r.score<-0.2?"text-crimson":"text-text-muted"}`}/>
              <Badge variant="slate">{r.source}</Badge>
              <span className="flex-1 text-text-bright">{r.instrumentId}</span>
              <span className={`font-semibold ${r.score>0?"text-emerald":"text-crimson"}`}>{(r.score*100).toFixed(0)}</span>
              <span className="text-text-muted">×{r.weight.toFixed(2)} · {r.volume.toLocaleString()}</span>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="calendar" && (<>
        <div className="grid md:grid-cols-2 gap-3">
          {(econs.data??[]).map(e=>(
            <Card key={e.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{e.title}</span><Badge variant={e.impact==="high"?"crimson":e.impact==="medium"?"amber":"slate"}>{e.impact}</Badge></div>
              <div className="text-text-muted mt-1">{e.country} · {new Date(e.scheduledAt).toLocaleString()}</div>
              {e.forecast && <div className="text-text-muted">forecast {e.forecast} · prev {e.previous}</div>}
              <div className="flex gap-1 flex-wrap mt-1">{e.affectedInstruments.map((x:any,i:any)=><Badge key={i} variant="violet">{x}</Badge>)}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
      {sub==="sim" && (<>
        <Card><CardContent className="p-4 space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-text-muted">Instrument:</span>
            <select value={simInst} onChange={e=>setSimInst(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-text-bright">
              {(inst.data??[]).map(i=><option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>)}
            </select>
            <Button size="sm" variant="primary" onClick={runSim} disabled={simBusy}><Activity className="h-3.5 w-3.5 mr-1"/>{simBusy?"Simulating...":"Run Multi-Scenario Simulation"}</Button>
          </div>
          <div className="text-xs text-text-muted">Bull/Bear/Sideways/High-Vol/Flash-Crash scenarios with expected/worst/best returns, probability, confidence. All recommendations require governance + human approval.</div>
        </CardContent></Card>
        {simRes && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {simRes.map(r=>(
            <Card key={r.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{r.scenario}</span><Badge variant="violet">{Math.round(r.probability*100)}%</Badge></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-text-muted">exp</div><div className={`font-semibold ${r.expectedReturnPct>=0?"text-emerald":"text-crimson"}`}>{r.expectedReturnPct>=0?"+":""}{r.expectedReturnPct.toFixed(1)}%</div></div>
                <div><div className="text-text-muted">worst</div><div className="font-semibold text-crimson">{r.worstCaseReturnPct.toFixed(1)}%</div></div>
                <div><div className="text-text-muted">best</div><div className="font-semibold text-emerald">+{r.bestCaseReturnPct.toFixed(1)}%</div></div>
              </div>
              <div className="text-text-muted mt-2">conf {Math.round(r.confidence*100)}% · horizon {r.horizon}</div>
            </CardContent></Card>
          ))}
        </div>)}
      </>)}
      {sub==="learn" && (<>
        <div className="text-sm text-text-muted">Continuous Learning Engine — insights fed back into Memory Fabric + Knowledge Graph for downstream agents</div>
        <div className="grid md:grid-cols-2 gap-3">
          {(insights.data??[]).map(i=>(
            <Card key={i.id}><CardContent className="p-3 text-xs">
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal"/><Badge variant="teal">{i.kind}</Badge><span className="flex-1 font-semibold">{i.title}</span><span className="text-text-muted">{Math.round(i.confidence*100)}%</span></div>
              <div className="text-text-muted mt-1">{i.detail}</div>
              <div className="text-text-muted mt-1">learned from {i.learnedFromTrades} trades · {new Date(i.recordedAt).toLocaleString()}</div>
            </CardContent></Card>
          ))}
        </div>
      </>)}
    </div>
  );
}

function VoiceFoundryTab() {
  const dash = useRefresh<vf.VfDashboard|null>(()=>vf.vfApi.dashboard(), 10_000);
  const voices = useRefresh<vf.VfGeneratedVoice[]>(()=>vf.vfApi.voices(), 15_000);
  const packs = useRefresh<vf.VfVoicePack[]>(()=>vf.vfApi.packs(), 30_000);
  const deps = useRefresh<vf.VfDeployment[]>(()=>vf.vfApi.deployments(), 15_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"voices"|"packs"|"deploy">("overview");
  const [name,setName] = useState("");
  const [msg,setMsg] = useState<string|null>(null);
  const doGenerate = async () => {
    if(!name.trim()) return;
    try { await vf.vfApi.generate({name, category:"original-female"}); setName(""); setMsg("Voice generated (consent-exempt; audit recorded)"); }
    catch(e:any){ setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Wand2 className="h-5 w-5 text-amber"/>
      <div className="flex-1"><div className="font-semibold">AI Voice Foundry</div>
      <div className="text-xs text-text-muted">Autonomous voice invention, evolution, and deployment. Foundry-generated voices are consent-exempt but carry immutable audit trails; deploy to 17+ targets. Reuses (does not fork) Session 40 voice library.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2">{[["overview","Overview",LayoutDashboard],["voices","Voices",Mic2],["packs","Packs",Package],["deploy","Deployments",Rocket]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Generated Voices" value={d?.generatedVoices??"…"} tone="amber" sub={`${d?.voicesReady??0} ready`}/>
      <Stat label="Categories" value={d?.categories??"…"} tone="violet"/>
      <Stat label="Voice Packs" value={d?.voicePacks??"…"} tone="teal" sub={`${d?.languagesSupported??0} languages`}/>
      <Stat label="Deploy Targets" value={d?.activeTargets??"…"} tone="azure" sub={`${d?.deployments??0} deployments`}/>
      <Card className="md:col-span-4"><CardHeader><CardTitle className="text-sm">Quick Generate</CardTitle></CardHeader>
      <CardContent className="flex gap-2 items-center"><Input placeholder="Voice name" value={name} onChange={e=>setName(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={doGenerate}><Sparkles className="h-3.5 w-3.5 mr-1"/>Generate</Button>
        {msg && <span className="text-xs text-text-muted">{msg}</span>}
      </CardContent></Card>
    </div>)}
    {sub==="voices" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(voices.data??[]).map(v=>(<Card key={v.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{v.name}</span><Badge variant="amber">{v.category}</Badge></div>
        <div className="text-text-muted mt-1">v{v.version} · {v.design.gender} · {v.languagesSpoken?.join(", ")}</div>
        <div className="text-text-muted">owner: {v.ownership} · {v.visibility}</div>
        <div className="text-text-muted mt-1">audit: {v.auditTrail.length} entries</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="packs" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(packs.data??[]).map(p=>(<Card key={p.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Package className="h-4 w-4 text-violet"/><span className="font-semibold flex-1">{p.name}</span>{p.premium && <Badge variant="amber">pro</Badge>}</div>
        <div className="text-text-muted mt-1">{p.description}</div>
        <div className="text-text-muted">languages: {p.languages.join(", ")}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="deploy" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(deps.data??[]).map(d=>(<Card key={d.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Rocket className="h-4 w-4 text-emerald"/><span className="font-mono">{d.voiceId.slice(0,12)}</span><Badge variant={d.active?"emerald":"slate"}>{d.target}</Badge></div>
        <div className="text-text-muted">{new Date(d.deployedAt).toLocaleString()}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function ExpertsTab() {
  const dash = useRefresh<ep.EpDashboard|null>(()=>ep.epApi.dashboard(), 10_000);
  const agents = useRefresh<ep.EpExpertAgent[]>(()=>ep.epApi.agents(), 15_000);
  const courses = useRefresh<ep.EpCourse[]>(()=>ep.epApi.courses(), 30_000);
  const packages = useRefresh<ep.EpExpertPackage[]>(()=>ep.epApi.packages(), 30_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"agents"|"courses"|"packages">("overview");
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <GraduationCap className="h-5 w-5 text-violet"/>
      <div className="flex-1"><div className="font-semibold">Professional Intelligence Platform</div>
      <div className="text-xs text-text-muted">Domain expert agents (gov/healthcare/pharmacy/engineering/legal/lecturer) with enforced disclaimers ("informational not official advice"). Courses, knowledge packs, multilingual + multimodal intake. All agents extend a common ExpertAgent contract.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2">{[["overview","Overview",LayoutDashboard],["agents","Agents",UsersIcon],["courses","Courses",BookOpen],["packages","Packages",Package]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Expert Agents" value={d?.experts??"…"} tone="violet" sub={`${d?.expertsOnline??0} online`}/>
      <Stat label="Courses" value={d?.courses??"…"} tone="teal"/>
      <Stat label="Packages" value={d?.packages??"…"} tone="azure"/>
      <Stat label="Disclaimer" value={d?.disclaimerEnforced?"enforced":"off"} tone="emerald"/>
    </div>)}
    {sub==="agents" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(agents.data??[]).map(a=>(<Card key={a.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><UsersIcon className="h-4 w-4 text-violet"/><span className="font-semibold flex-1">{a.name}</span><Badge variant="violet">{a.domain}</Badge></div>
        <div className="text-text-muted mt-1">{a.specialization}</div>
        <div className="flex gap-2 mt-1"><Badge variant={a.status==="online"?"emerald":"slate"}>{a.status}</Badge><span className="text-text-muted">acc {(a.accuracyScore*100).toFixed(0)}% · {a.queries24h} q/24h</span></div>
        <div className="text-crimson mt-1 text-[10px]">⚠ {a.disclaimer}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="courses" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(courses.data??[]).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal"/><span className="font-semibold flex-1">{c.title}</span></div>
        <div className="text-text-muted mt-1">by {c.author} · {c.language} · {c.level}</div>
        <div className="text-text-muted">{c.lessons} lessons · {c.enrolled} enrolled · ⭐ {c.rating}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="packages" && (<div className="grid md:grid-cols-2 gap-3">
      {(packages.data??[]).map(p=>(<Card key={p.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Package className="h-4 w-4 text-azure"/><span className="font-semibold flex-1">{p.name}</span>{p.premium && <Badge variant="amber">pro</Badge>}{p.installed && <Badge variant="emerald">installed</Badge>}</div>
        <div className="text-text-muted mt-1">{p.description}</div>
        <div className="text-text-muted">{p.domain} · {p.sizeMb} MB · by {p.author}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function MediaFactoryTab() {
  const dash = useRefresh<mf.MfDashboard|null>(()=>mf.mfApi.dashboard(), 10_000);
  const jobs = useRefresh<mf.MfContentJob[]>(()=>mf.mfApi.jobs(), 10_000);
  const chars = useRefresh<mf.MfCharacter[]>(()=>mf.mfApi.characters(), 30_000);
  const courses = useRefresh<mf.MfCourse[]>(()=>mf.mfApi.courses(), 30_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"jobs"|"characters"|"courses">("overview");
  const [prompt,setPrompt] = useState("");
  const [msg,setMsg] = useState<string|null>(null);
  const doGen = async () => {
    if(!prompt.trim()) return;
    try { const j = await mf.mfApi.generate({type:"image", channel:"web", prompt}); setPrompt(""); setMsg(`Job ${j.id} · ${j.safety}`); }
    catch(e:any){ setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Clapperboard className="h-5 w-5 text-fuchsia"/>
      <div className="flex-1"><div className="font-semibold">Autonomous AI Media / Content Factory</div>
      <div className="text-xs text-text-muted">Channels, character studio, educational content, animal content with species accuracy. Non-bypassable Child Safety Reviewer gate; CopyrightDetector; BrandSafetyReviewer; EducationalAccuracyChecker. Wires into existing Workflow Engine.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2">{[["overview","Overview",LayoutDashboard],["jobs","Jobs",CpuIcon],["characters","Characters",UsersIcon],["courses","Courses",BookOpen]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Content Jobs" value={d?.jobs?.total??"…"} tone="fuchsia" sub={`${d?.jobs?.ready??0} ready · ${d?.jobs?.rejected??0} rejected`}/>
      <Stat label="Characters" value={d?.characters??"…"} tone="violet"/>
      <Stat label="Courses" value={d?.courses??"…"} tone="teal"/>
      <Stat label="Safety Gate" value={d?.childSafetyGateActive?"ACTIVE":"off"} tone={d?.childSafetyGateActive?"crimson":"slate"} sub={`${d?.safetyReviews24h??0} reviews/24h`}/>
      <Card className="md:col-span-4"><CardHeader><CardTitle className="text-sm">Quick Generate (child-safety enforced)</CardTitle></CardHeader>
      <CardContent className="flex gap-2"><Input placeholder="Prompt (children targeting triggers extra review; unsafe patterns rejected)" value={prompt} onChange={e=>setPrompt(e.target.value)} className="flex-1"/>
        <Button size="sm" variant="primary" onClick={doGen}><Sparkles className="h-3.5 w-3.5 mr-1"/>Generate</Button>
        {msg && <span className="text-xs text-text-muted self-center">{msg}</span>}
      </CardContent></Card>
    </div>)}
    {sub==="jobs" && (<div className="grid md:grid-cols-2 gap-3">
      {(jobs.data??[]).slice(0,40).map(j=>(<Card key={j.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><CpuIcon className="h-4 w-4 text-fuchsia"/><span className="font-mono">{j.id.slice(0,12)}</span><Badge variant={j.status==="ready"?"emerald":j.status==="rejected"?"crimson":"amber"}>{j.status}</Badge><Badge variant={j.safety==="approved"?"emerald":j.safety==="rejected"?"crimson":"violet"}>{j.safety}</Badge></div>
        <div className="text-text-muted mt-1">{j.type} · {j.channel}</div>
        <div className="truncate">{j.prompt}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="characters" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(chars.data??[]).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><UsersIcon className="h-4 w-4 text-violet"/><span className="font-semibold flex-1">{c.name}</span><Badge variant="azure">{c.archetype}</Badge></div>
        <div className="text-text-muted mt-1">age: {c.ageTarget??"all"} · emotions: {c.emotionPalette.join(", ")}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="courses" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(courses.data??[]).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal"/><span className="font-semibold flex-1">{c.title}</span></div>
        <div className="text-text-muted mt-1">{c.subject} · {c.ageGroup} · {c.lessons} lessons · {c.language}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function UxIntelTab() {
  const dash = useRefresh<ux.UxDashboard|null>(()=>ux.uxApi.dashboard(), 10_000);
  const tokens = useRefresh<ux.UxToken[]>(()=>ux.uxApi.tokens(), 30_000);
  const comps = useRefresh<ux.UxComponent[]>(()=>ux.uxApi.components(), 30_000);
  const findings = useRefresh<ux.UxAccessibilityFinding[]>(()=>ux.uxApi.findings(), 15_000);
  const agents = useRefresh<ux.UxAgent[]>(()=>ux.uxApi.agents(), 15_000);
  const brands = useRefresh<ux.UxBrandProfile[]>(()=>ux.uxApi.brands(), 30_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"tokens"|"components"|"findings"|"agents"|"brands">("overview");
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Palette className="h-5 w-5 text-teal"/>
      <div className="flex-1"><div className="font-semibold">UX Intelligence &amp; Design System</div>
      <div className="text-xs text-text-muted">Central engine + non-bypassable Design Quality Gate. Canonical components registry (pointers not copies), tokens, themes, versioning, 3 AI agents (designer/researcher/QA), brand identity, 9 device classes, WCAG accessibility.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2 flex-wrap">{[["overview","Overview",LayoutDashboard],["tokens","Tokens",Palette],["components","Components",Component],["findings","A11y",Bug],["agents","AI Agents",Bot],["brands","Brands",BadgeCheck]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Components" value={d?.components??"…"} tone="azure"/>
      <Stat label="Tokens" value={d?.tokens??"…"} tone="violet"/>
      <Stat label="AI Agents" value={d?.agentsOnline??"…"} tone="fuchsia" sub={`${d?.accessibilityOpen??0} open a11y`}/>
      <Stat label="Design Gate" value={d?.designGateActive?"ACTIVE":"off"} tone="teal"/>
      <Stat label="Brands" value={d?.brands??"…"} tone="amber"/>
      <Stat label="Device Classes" value={d?.deviceClasses??"…"} tone="emerald"/>
    </div>)}
    {sub==="tokens" && (<div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
      {(tokens.data??[]).map((t,i)=>(<Card key={i}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-teal"/><span className="font-mono">{t.namespace}/{t.name}</span></div>
        <div className="text-text-muted mt-1 truncate">value: {t.value}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="components" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(comps.data??[]).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Component className="h-4 w-4 text-azure"/><span className="font-semibold flex-1">{c.name}</span><Badge variant="azure">{c.category}</Badge>{c.wcagAA && <Badge variant="emerald">WCAG AA</Badge>}</div>
        <div className="text-text-muted mt-1 font-mono truncate">{c.sourcePath}</div>
        <div className="text-text-muted">v{c.version}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="findings" && (<div className="grid md:grid-cols-2 gap-3">
      {(findings.data??[]).map(f=>(<Card key={f.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Bug className="h-4 w-4 text-crimson"/><span className="font-semibold flex-1">{f.component}</span><Badge variant={f.severity==="critical"?"crimson":f.severity==="serious"?"amber":"slate"}>{f.severity}</Badge>{f.fixed && <Badge variant="emerald">fixed</Badge>}</div>
        <div className="text-text-muted mt-1">{f.detail}</div>
        <div className="text-text-muted">WCAG {f.wcagRef}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="agents" && (<div className="grid md:grid-cols-3 gap-3">
      {(agents.data??[]).map(a=>(<Card key={a.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-fuchsia"/><span className="font-semibold flex-1">{a.name}</span><Badge variant="fuchsia">{a.role}</Badge></div>
        <div className="text-text-muted mt-1">status: {a.status} · reviews/24h: {a.reviews24h}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="brands" && (<div className="grid md:grid-cols-2 gap-3">
      {(brands.data??[]).map(b=>(<Card key={b.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{b.name}</span></div>
        <div className="flex gap-2 mt-1"><span className="inline-block w-4 h-4 rounded" style={{background:b.primaryColor}}/><span>{b.primaryColor}</span><span className="inline-block w-4 h-4 rounded" style={{background:b.secondaryColor}}/><span>{b.secondaryColor}</span></div>
        <div className="text-text-muted">font: {b.font}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function GiftCardsTab() {
  const dash = useRefresh<gc.WmpcGcDashboard|null>(()=>gc.gcApi.dashboard(), 10_000);
  const cards = useRefresh<gc.WmpcGiftCard[]>(()=>gc.gcApi.list(), 10_000);
  const txns = useRefresh<gc.GcTransaction[]>(()=>gc.gcApi.transactions(), 10_000);
  const fraud = useRefresh<gc.GcFraudFlag[]>(()=>gc.gcApi.fraud(), 15_000);
  const loyalty = useRefresh<gc.GcLoyaltyProgram[]>(()=>gc.gcApi.loyalty(), 30_000);
  const pm = useRefresh<any>(()=>gc.gcApi.paymentMethod(), 30_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"cards"|"transactions"|"fraud"|"loyalty">("overview");
  const [amt,setAmt] = useState(50);
  const [msg,setMsg] = useState<string|null>(null);
  const doIssue = async () => {
    try { const c = await gc.gcApi.issue({type:"digital",amount:amt,currency:"USD",pin:"0000",personalMessage:"Issued from admin console"}); setMsg(`Issued ${c.id} · code ${c.code}`); }
    catch(e:any){ setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Gift className="h-5 w-5 text-amber"/>
      <div className="flex-1"><div className="font-semibold">WMPC Gift Card Payment Platform</div>
      <div className="text-xs text-text-muted">Full lifecycle (issue→activate→reload→partial/full redeem→expire/freeze). PIN + fraud detection, QR/barcode, scheduled delivery, enterprise bulk, loyalty programs, 4 AI agents. Registered into existing Payment Gateway (not a parallel system).</div></div>
      {d?.registeredAsPaymentMethod && <Badge variant="emerald">payment method registered</Badge>}
    </div></CardContent></Card>
    <div className="flex gap-2 flex-wrap">{[["overview","Overview",LayoutDashboard],["cards","Cards",CreditCard],["transactions","Txns",ReceiptText],["fraud","Fraud",ShieldAlert],["loyalty","Loyalty",Award]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Issued" value={d?.issued??"…"} tone="amber" sub={`${d?.active??0} active`}/>
      <Stat label="Redeemed" value={d?.redeemed??"…"} tone="emerald"/>
      <Stat label="Outstanding" value={`$${d?.outstandingBalance?.toFixed(0)??"…"}`} tone="azure"/>
      <Stat label="Fraud Flags" value={d?.fraudFlags??"…"} tone="crimson"/>
      <Stat label="Loyalty Programs" value={d?.loyaltyPrograms??"…"} tone="violet"/>
      <Stat label="Revenue 24h" value={`$${d?.revenue24h?.toFixed(0)??"0"}`} tone="teal"/>
      <Card className="md:col-span-4"><CardHeader><CardTitle className="text-sm">Quick Issue Digital Card (USD)</CardTitle></CardHeader>
      <CardContent className="flex gap-2 items-center"><Input type="number" value={amt} onChange={e=>setAmt(Number(e.target.value))} className="w-24"/>
        <Button size="sm" variant="primary" onClick={doIssue}><Gift className="h-3.5 w-3.5 mr-1"/>Issue</Button>
        {msg && <span className="text-xs text-text-muted">{msg}</span>}
      </CardContent></Card>
    </div>)}
    {sub==="cards" && (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(cards.data??[]).slice(0,30).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-amber"/><span className="font-mono flex-1">{c.code}</span><Badge variant={c.status==="active"?"emerald":c.status==="redeemed"?"slate":c.status==="frozen"?"crimson":"amber"}>{c.status}</Badge></div>
        <div className="text-text-muted mt-1">{c.type} · {c.currency} {c.balance.toFixed(2)} / {c.initialBalance.toFixed(2)}</div>
        {c.personalMessage && <div className="text-text-muted italic truncate">"{c.personalMessage}"</div>}
      </CardContent></Card>))}
    </div>)}
    {sub==="transactions" && (<div className="grid md:grid-cols-2 gap-3">
      {(txns.data??[]).slice(0,30).map(t=>(<Card key={t.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Badge variant={t.kind==="redeem"?"emerald":t.kind==="issue"?"azure":"slate"}>{t.kind}</Badge><span className="font-mono">{t.cardId.slice(0,12)}</span><span className="flex-1 text-right font-semibold">{t.currency} {t.amount.toFixed(2)}</span></div>
        <div className="text-text-muted">{new Date(t.at).toLocaleString()}{t.orderId?` · ${t.orderId}`:""}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="fraud" && (<div className="grid md:grid-cols-2 gap-3">
      {(fraud.data??[]).map(f=>(<Card key={f.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-crimson"/><span className="font-mono flex-1">{f.cardId.slice(0,12)}</span><Badge variant={f.severity==="high"?"crimson":f.severity==="medium"?"amber":"slate"}>{f.severity}</Badge>{f.resolved && <Badge variant="emerald">resolved</Badge>}</div>
        <div className="text-text-muted mt-1">{f.reason}</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="loyalty" && (<div className="grid md:grid-cols-2 gap-3">
      {(loyalty.data??[]).map(l=>(<Card key={l.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Award className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{l.name}</span></div>
        <div className="text-text-muted mt-1">{l.multiplier}x multiplier · {l.pointsIssued.toLocaleString()} pts · {l.memberCount.toLocaleString()} members</div>
      </CardContent></Card>))}
      {pm.data && (<Card><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald"/><span className="font-semibold">{pm.data.name}</span></div>
        <div className="text-text-muted mt-1">capabilities: {pm.data.capabilities.join(", ")}</div>
        <div className="text-text-muted">currencies: {pm.data.currencies.join(", ")}</div>
      </CardContent></Card>)}
    </div>)}
  </div>);
}

function ReceiptText(props:any){return <FileText {...props}/>;}

function GlobalCurrencyTab() {
  const dash = useRefresh<gcu.GcuDashboard|null>(()=>gcu.gcuApi.dashboard(), 10_000);
  const ccys = useRefresh<string[]>(()=>gcu.gcuApi.currencies(), 30_000);
  const countries = useRefresh<string[]>(()=>gcu.gcuApi.countries(), 30_000);
  const agents = useRefresh<any[]>(()=>gcu.gcuApi.agents(), 30_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"convert"|"detect"|"regional"|"agents">("overview");
  const [from,setFrom] = useState("USD"); const [to,setTo] = useState("NGN"); const [amt,setAmt] = useState(100);
  const [conv,setConv] = useState<gcu.GcLocalizedPrice|null>(null);
  const [cc,setCc] = useState("NG"); const [det,setDet] = useState<gcu.Detection|null>(null);
  const [usd,setUsd] = useState(100); const [reg,setReg] = useState<any>(null);
  useEffect(()=>{(async()=>{ try{ setConv(await gcu.gcuApi.localizePrice(amt,from,to,cc)); }catch{} })();},[amt,from,to,cc]);
  useEffect(()=>{(async()=>{ try{ setDet(await gcu.gcuApi.detect({country:cc})); }catch{} })();},[cc]);
  useEffect(()=>{(async()=>{ try{ setReg(await gcu.gcuApi.regionalPrice(usd,cc)); }catch{} })();},[usd,cc]);
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Globe className="h-5 w-5 text-emerald"/>
      <div className="flex-1"><div className="font-semibold">Global Multi-Currency &amp; Localization</div>
      <div className="text-xs text-text-muted">Detection (country/language/tz/tax), multi-provider rates (live/cache/override/offline-fallback), payment-method localization incl. WMPC gift cards + local networks, regional pricing, multi-currency reporting, 3 AI agents + 2 fraud guards.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2 flex-wrap">{[["overview","Overview",LayoutDashboard],["convert","Convert",DollarSign],["detect","Detect",Globe],["regional","Regional",Languages],["agents","AI Agents",Bot]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Currencies" value={d?.currenciesSupported??"…"} tone="emerald"/>
      <Stat label="Languages" value={d?.languagesSupported??"…"} tone="violet"/>
      <Stat label="Countries" value={d?.countriesSupported??"…"} tone="azure" sub={`${d?.paymentMethodsLocalized??0} local PMs`}/>
      <Stat label="Rate Providers" value={d?.rateProviders??"…"} tone="teal" sub={d?.offlineFallbackHealthy?"offline healthy":"no fallback"}/>
      <Stat label="Fraud Guards" value={d?.fraudGuardsActive??"…"} tone="crimson"/>
      <Stat label="AI Agents" value={d?.agents??"…"} tone="fuchsia"/>
    </div>)}
    {sub==="convert" && (<Card><CardContent className="p-4 space-y-3">
      <div className="flex gap-2 items-center"><Input type="number" value={amt} onChange={e=>setAmt(Number(e.target.value))} className="w-28"/>
        <select value={from} onChange={e=>setFrom(e.target.value)} className="bg-input px-2 py-1 rounded text-sm">{(ccys.data??[]).map(c=><option key={c}>{c}</option>)}</select>
        <span>→</span>
        <select value={to} onChange={e=>setTo(e.target.value)} className="bg-input px-2 py-1 rounded text-sm">{(ccys.data??[]).map(c=><option key={c}>{c}</option>)}</select>
        <div className="text-2xl font-semibold text-emerald flex-1 text-right">{conv?.formatted??"…"}</div>
      </div>
      {conv && <div className="text-xs text-text-muted">rate {conv.exchangeRate} · source: {conv.sourceRate}</div>}
    </CardContent></Card>)}
    {sub==="detect" && (<Card><CardContent className="p-4 space-y-3">
      <div className="flex gap-2 items-center"><span>Country:</span>
        <select value={cc} onChange={e=>setCc(e.target.value)} className="bg-input px-2 py-1 rounded text-sm">{(countries.data??[]).map(c=><option key={c}>{c}</option>)}</select>
      </div>
      {det && (<div className="grid md:grid-cols-2 gap-3 text-xs">
        <div>Currency: <b>{det.currency}</b></div>
        <div>Language: <b>{det.language}</b></div>
        <div>Timezone: <b>{det.timezone}</b></div>
        <div>Date: <b>{det.dateFormat}</b></div>
        <div>Number: <b>{det.numberFormat}</b></div>
        <div>Tax: <b>{det.taxRegion??"n/a"}</b></div>
        <div className="md:col-span-2">Payment methods: {det.paymentMethods.join(", ")}</div>
      </div>)}
    </CardContent></Card>)}
    {sub==="regional" && (<Card><CardContent className="p-4 space-y-3">
      <div className="flex gap-2 items-center"><span>USD:</span><Input type="number" value={usd} onChange={e=>setUsd(Number(e.target.value))} className="w-28"/>
        <span>in</span>
        <select value={cc} onChange={e=>setCc(e.target.value)} className="bg-input px-2 py-1 rounded text-sm">{(countries.data??[]).map(c=><option key={c}>{c}</option>)}</select>
      </div>
      {reg && (<div className="text-xs space-y-1">
        <div className="text-2xl font-semibold text-emerald">{reg.formatted}</div>
        <div>Tax (incl.): {(reg.tax.rate*100).toFixed(1)}%</div>
      </div>)}
    </CardContent></Card>)}
    {sub==="agents" && (<div className="grid md:grid-cols-3 gap-3">
      {(agents.data??[]).map(a=>(<Card key={a.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-fuchsia"/><span className="font-semibold flex-1">{a.name}</span></div>
        <div className="text-text-muted mt-1">{a.role}</div>
        <div className="text-crimson mt-1 text-[10px]">⚠ {a.disclaimer}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function ValidationTab() {
  const rep = useRefresh<v76.V76ValidationReport|null>(()=>v76.v76Api.report(), 15_000);
  const r = rep.data;
  const [sub,setSub] = useState<"overview"|"checklist"|"systems">("overview");
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <ShieldCheckIcon className="h-5 w-5 text-crimson"/>
      <div className="flex-1"><div className="font-semibold">Session 76 — Enterprise Integration Validation</div>
      <div className="text-xs text-text-muted">Cross-system wiring report: verifies every module routes through the Kernel, consent/governance gates are enforced, no duplicate parallel payment systems exist. Reports to the Digital Operations Center.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2">{[["overview","Rollup",LayoutDashboard],["checklist","22-point Checklist",CheckCircle2],["systems","Systems",Server]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {!r && <div className="text-text-muted p-6 text-center">Running validation…</div>}
    {r && (<>
      {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
        <Stat label="Total Systems" value={r.totalSystems} tone="azure"/>
        <Stat label="Wired" value={r.wired} tone="emerald"/>
        <Stat label="Stubs" value={r.stubs} tone="amber"/>
        <Stat label="Missing" value={r.missing} tone={r.missing===0?"emerald":"crimson"}/>
        <Stat label="Duplicates" value={r.duplicatesDetected} tone={r.duplicatesDetected===0?"emerald":"crimson"}/>
        <Stat label="Consent Gate" value={r.consentGateEnforced?"OK":"FAIL"} tone={r.consentGateEnforced?"emerald":"crimson"}/>
        <Stat label="Governance Gate" value={r.governanceGateEnforced?"OK":"FAIL"} tone={r.governanceGateEnforced?"emerald":"crimson"}/>
        <Stat label="Checklist" value={`${r.checklist.filter(c=>c.passed).length}/${r.checklist.length}`} tone="violet"/>
        <div className="text-xs text-text-muted md:col-span-4">Generated {new Date(r.generatedAt).toLocaleString()}</div>
      </div>)}
      {sub==="checklist" && (<div className="space-y-2">
        {r.checklist.map((c,i)=>(<Card key={i}><CardContent className="p-3 text-xs flex items-start gap-2">
          {c.passed?<CheckCircle2 className="h-4 w-4 text-emerald mt-0.5"/>:<XCircle className="h-4 w-4 text-crimson mt-0.5"/>}
          <div className="flex-1"><div className="font-semibold">{c.item}</div><div className="text-text-muted">{c.detail}</div></div>
        </CardContent></Card>))}
      </div>)}
      {sub==="systems" && (<div className="grid md:grid-cols-2 gap-3">
        {r.systems.map((s,i)=>(<Card key={i}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2">
            {s.status==="wired"?<CheckCircle2 className="h-4 w-4 text-emerald"/>:s.status==="stub"?<AlertTriangle className="h-4 w-4 text-amber"/>:<XCircle className="h-4 w-4 text-crimson"/>}
            <span className="font-semibold flex-1">{s.name}</span>
            <Badge variant={s.status==="wired"?"emerald":s.status==="stub"?"amber":"crimson"}>{s.status}</Badge>
            {s.routesThroughKernel && <Badge variant="violet">kernel</Badge>}
          </div>
          <div className="text-text-muted mt-1">{s.notes}</div>
        </CardContent></Card>))}
      </div>)}
    </>)}
  </div>);
}

function MediaGenTab() {
  const dash = useRefresh<mg.MgDashboard|null>(()=>mg.mgApi.dashboard(), 10_000);
  const caps = useRefresh<mg.MgCapability[]>(()=>mg.mgApi.capabilities(), 30_000);
  const jobs = useRefresh<mg.MgJob[]>(()=>mg.mgApi.jobs(), 10_000);
  const d = dash.data;
  const [sub,setSub] = useState<"overview"|"capabilities"|"jobs">("overview");
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <ImageIcon className="h-5 w-5 text-fuchsia"/>
      <div className="flex-1"><div className="font-semibold">Universal Media Generation</div>
      <div className="text-xs text-text-muted">Image / audio / video generation on self-hosted GPU via Kernel compute allocation. 24 capabilities across 3 modalities; digital-human video stubbed for Session 62.</div></div>
    </div></CardContent></Card>
    <div className="flex gap-2">{[["overview","Overview",LayoutDashboard],["capabilities","Capabilities",Zap],["jobs","Jobs",CpuIcon]].map(([v,l,Ic]:any)=>(
      <Button key={v} size="sm" variant={sub===v?"primary":"ghost"} onClick={()=>setSub(v)}><Ic className="h-3.5 w-3.5 mr-1"/>{l}</Button>
    ))}</div>
    {sub==="overview" && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Jobs 24h" value={d?.jobs24h??"…"} tone="fuchsia" sub={`${d?.ready??0} ready · ${d?.failed??0} failed`}/>
      <Stat label="Avg Latency" value={`${d?.avgLatencyMs??"…"}ms`} tone="azure"/>
      <Stat label="Capabilities" value={d?.capabilities??"…"} tone="violet"/>
      <Stat label="GPU Util" value={`${d?.gpuUtilizationPct??"…"}%`} tone={(d?.gpuUtilizationPct ?? 0)>80?"amber":"emerald"}/>
      <Stat label="Video Stubs" value={d?.videoOpsStubbed?"S62 stub":"none"} tone="amber"/>
      <Stat label="Kernel Routed" value={d?.routedThroughKernel?"✓":"…"} tone="emerald"/>
    </div>)}
    {sub==="capabilities" && (<div className="grid md:grid-cols-3 gap-3">
      {(caps.data??[]).map((c,i)=>(<Card key={i}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2">
          {c.modality==="image"?<ImageIcon className="h-4 w-4 text-fuchsia"/>:c.modality==="audio"?<Music className="h-4 w-4 text-violet"/>:<Film className="h-4 w-4 text-amber"/>}
          <span className="font-mono">{c.op}</span>
          <Badge variant={c.status==="online"?"emerald":c.status==="stub"?"amber":"crimson"}>{c.status}</Badge>
        </div>
        <div className="text-text-muted mt-1">{c.gpuRequiredMb}MB VRAM · ~{c.avgMs}ms</div>
      </CardContent></Card>))}
    </div>)}
    {sub==="jobs" && (<div className="grid md:grid-cols-2 gap-3">
      {(jobs.data??[]).slice(0,30).map(j=>(<Card key={j.id}><CardContent className="p-3 text-xs">
        <div className="flex items-center gap-2"><Badge variant={j.modality==="image"?"fuchsia":j.modality==="audio"?"violet":"amber"}>{j.modality}/{j.op}</Badge><span className="font-mono">{j.id.slice(0,12)}</span><Badge variant={j.status==="ready"?"emerald":j.status==="failed"?"crimson":"slate"}>{j.status}</Badge></div>
        <div className="truncate mt-1">{j.prompt}</div>
      </CardContent></Card>))}
    </div>)}
  </div>);
}

function HybridExecTab() {
  const dash = useRefresh<hx.HxDashboard|null>(()=>hx.hxApi.dashboard(), 10_000);
  const models = useRefresh<hx.HxModel[]>(()=>hx.hxApi.models(), 15_000);
  const nodes = useRefresh<hx.HxGpuNode[]>(()=>hx.hxApi.nodes(), 10_000);
  const d = dash.data;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <ServerIcon className="h-5 w-5 text-violet"/>
      <div className="flex-1"><div className="font-semibold">Hybrid AI Execution &amp; Compute</div>
      <div className="text-xs text-text-muted">Three execution modes (self-hosted/hybrid/connected) with policy routing, GPU scheduling, canary deployments, rollback, cost optimization. Vendor-neutral — connected providers governed, never a dependency.</div></div>
    </div></CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Active Mode" value={d?.activeMode??"…"} tone="violet"/>
      <Stat label="Models" value={d?.modelsRegistered??"…"} tone="azure" sub={`${d?.modelsDeployed??0} deployed`}/>
      <Stat label="GPU Nodes" value={d?.gpuNodes??"…"} tone="emerald" sub={`${d?.gpuUtilizationPct??0}% util`}/>
      <Stat label="Canary" value={d?.canaryActive?"active":"off"} tone={d?.canaryActive?"amber":"slate"}/>
      <Stat label="Rollbacks 24h" value={d?.rollbacks24h??0} tone="crimson"/>
      <Stat label="Cost Opt" value={d?.costOptimization?"on":"off"} tone="teal"/>
      <Stat label="Vendor Neutral" value={d?.vendorNeutral?"✓":"…"} tone="emerald"/>
      <Stat label="Kernel Routed" value={d?.routedThroughKernel?"✓":"…"} tone="emerald"/>
    </div>
    <div>
      <div className="text-sm font-semibold mb-2">GPU Nodes</div>
      <div className="grid md:grid-cols-4 gap-3">
        {(nodes.data??[]).map(n=>(<Card key={n.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><ServerIcon className="h-4 w-4 text-violet"/><span className="font-semibold flex-1">{n.name}</span><Badge variant={n.online?"emerald":"crimson"}>{n.online?"online":"off"}</Badge></div>
          <div className="text-text-muted mt-1">VRAM {n.vramUsedMb}/{n.vramTotalMb} MB · {n.utilPct}% · {n.activeJobs} jobs</div>
        </CardContent></Card>))}
      </div>
    </div>
    <div>
      <div className="text-sm font-semibold mb-2">Models</div>
      <div className="grid md:grid-cols-3 gap-3">
        {(models.data??[]).map(m=>(<Card key={m.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><CpuIcon className="h-4 w-4 text-azure"/><span className="font-semibold flex-1">{m.name}</span><Badge variant={m.status==="deployed"?"emerald":m.status==="canary"?"amber":"slate"}>{m.status}</Badge></div>
          <div className="text-text-muted mt-1">{m.modality} · {m.size} · {m.quant} · {m.vramMb}MB · {m.provider}</div>
          {m.benchmarkScore!==undefined && <div className="text-text-muted">bench {m.benchmarkScore}</div>}
        </CardContent></Card>))}
      </div>
    </div>
  </div>);
}

function VoiceOwnershipTab() {
  const dash = useRefresh<vo.VoDashboard|null>(()=>vo.voApi.dashboard(), 10_000);
  const owners = useRefresh<vo.VoVoiceOwner[]>(()=>vo.voApi.owners(), 15_000);
  const policies = useRefresh<vo.VoPolicy[]>(()=>vo.voApi.policies(), 30_000);
  const audit = useRefresh<vo.VoAuditEntry[]>(()=>vo.voApi.audit(), 10_000);
  const d = dash.data;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <UserCheck className="h-5 w-5 text-azure"/>
      <div className="flex-1"><div className="font-semibold">Voice Ownership, Security &amp; Governance</div>
      <div className="text-xs text-text-muted">Identity verification, consent enforcement (real backing for S40/S41 gates), immutable audit, privacy controls, voice policies, compliance monitoring, e2e traceability for every voice.</div></div>
    </div></CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Voices Tracked" value={d?.voicesTracked??"…"} tone="azure"/>
      <Stat label="Owners Verified" value={d?.verifiedOwners??"…"} tone="emerald"/>
      <Stat label="Consent OK" value={d?.consentCompliant??"…"} tone="teal" sub={`${d?.consentMissing??0} missing`}/>
      <Stat label="Audit Entries" value={d?.auditEntries??"…"} tone="violet"/>
      <Stat label="Policies" value={d?.policiesActive??"…"} tone="amber"/>
      <Stat label="Pending Approvals" value={d?.pendingApprovals??"…"} tone={d?.pendingApprovals?"crimson":"emerald"}/>
      <Stat label="Governance" value={d?.governanceWired?"wired":"…"} tone="emerald"/>
      <Stat label="Immutable Audit" value={d?.immutableAudit?"✓":"…"} tone="emerald"/>
    </div>
    <div>
      <div className="text-sm font-semibold mb-2">Policies</div>
      <div className="grid md:grid-cols-2 gap-3">
        {(policies.data??[]).map(p=>(<Card key={p.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><ShieldCheckIcon className="h-4 w-4 text-azure"/><span className="font-semibold flex-1">{p.name}</span><Badge variant={p.enabled?"emerald":"slate"}>{p.enabled?"on":"off"}</Badge></div>
          <div className="text-text-muted mt-1">applies-to: {p.appliesTo} · threshold {p.requireApprovalAboveRiskScore} · human oversight {p.humanOversight?"required":"not required"}</div>
        </CardContent></Card>))}
      </div>
    </div>
    <div>
      <div className="text-sm font-semibold mb-2">Recent Audit Entries</div>
      <div className="grid md:grid-cols-2 gap-3">
        {(audit.data??[]).slice(0,20).map(a=>(<Card key={a.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><Badge variant="azure">{a.kind}</Badge><span className="font-mono">{a.voiceId.slice(0,10)}…</span><span className="text-text-muted">by {a.actorId.slice(0,10)}…</span></div>
          <div className="text-text-muted mt-1">{new Date(a.at).toLocaleString()}{a.detail?` · ${a.detail}`:""}</div>
          <div className="font-mono text-[10px] text-text-muted">hash {a.immutableHash}</div>
        </CardContent></Card>))}
      </div>
    </div>
  </div>);
}

function CoreIntegrationTab() {
  const rep = useRefresh<cei.CeilCheckpointReport|null>(()=>cei.ceiApi.checkpoint(), 15_000);
  const r = rep.data;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Link2 className="h-5 w-5 text-teal"/>
      <div className="flex-1"><div className="font-semibold">Core Enterprise Integration Checkpoint</div>
      <div className="text-xs text-text-muted">Session 45 — verifies S38–44 wiring to 18 platform systems. Session 46+ cannot proceed until all critical links are wired.</div></div>
      {r && <Badge variant={r.canProceedToSession46?"emerald":"crimson"}>{r.canProceedToSession46?"PROCEED TO S46":"BLOCKED"}</Badge>}
    </div></CardContent></Card>
    {r && (<>
      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Kernel Ping" value={`${r.kernelDispatchRoundtripMs}ms`} tone="violet"/>
        <Stat label="Wired" value={r.wired} tone="emerald"/>
        <Stat label="Stubs" value={r.stubs} tone="amber"/>
        <Stat label="Missing" value={r.missing} tone={r.missing?"crimson":"emerald"}/>
      </div>
      {r.blockers.length>0 && (<Card className="border-crimson"><CardContent className="p-3 text-xs text-crimson font-semibold">BLOCKERS: {r.blockers.join(", ")}</CardContent></Card>)}
      <div className="grid md:grid-cols-2 gap-3">
        {r.links.map(l=>(<Card key={l.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2">
            {l.status==="wired"?<CheckCircle2 className="h-4 w-4 text-emerald"/>:l.status==="stub"?<AlertTriangle className="h-4 w-4 text-amber"/>:<XCircle className="h-4 w-4 text-crimson"/>}
            <span className="font-semibold flex-1">{l.name}</span>
            <Badge variant={l.status==="wired"?"emerald":l.status==="stub"?"amber":"crimson"}>{l.status}</Badge>
            {l.notes==="critical" && <Badge variant="crimson">critical</Badge>}
          </div>
          <div className="text-text-muted mt-1">{l.evidence}</div>
        </CardContent></Card>))}
      </div>
    </>)}
  </div>);
}

function ModelFactoryTab() {
  const dash = useRefresh<mf2.Mf2Dashboard|null>(()=>mf2.mf2Api.dashboard(), 10_000);
  const models = useRefresh<mf2.Mf2Model[]>(()=>mf2.mf2Api.models(), 15_000);
  const tunes = useRefresh<mf2.Mf2FineTuneJob[]>(()=>mf2.mf2Api.fineTunes(), 15_000);
  const d = dash.data;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <FactoryIcon className="h-5 w-5 text-amber"/>
      <div className="flex-1"><div className="font-semibold">Enterprise AI Model Factory</div>
      <div className="text-xs text-text-muted">SLM/LLM/vision/speech/audio/multimodal/domain builders, fine-tuning (SFT/RLHF/DPO/LoRA/QLoRA), distillation, quantization, auto-benchmarks, safety eval, governance approval, canary → deploy → monitoring → retirement lifecycle. Extends S43 registry — no fork.</div></div>
    </div></CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Models" value={d?.totalModels??"…"} tone="amber"/>
      <Stat label="Fine-tunes" value={d?.activeFineTunes??"…"} tone="violet"/>
      <Stat label="Bench Pass" value={`${d?.benchmarksPassedPct??"…"}%`} tone="emerald"/>
      <Stat label="Canary" value={d?.canaryActive?"active":"off"} tone={d?.canaryActive?"azure":"slate"}/>
      <Stat label="Gov Blocked" value={d?.governanceBlocking??0} tone={d?.governanceBlocking?"crimson":"emerald"}/>
      <Stat label="Safety Evals" value={d?.safetyEvaluations??"…"} tone="teal"/>
      <Stat label="S43 Register" value={d?.extendsS43Registry?"shared":"fork!"} tone={d?.extendsS43Registry?"emerald":"crimson"}/>
    </div>
    <div className="grid md:grid-cols-8 gap-2">
      {d && Object.entries(d.byStage).map(([k,v])=>(<Card key={k}><CardContent className="p-2 text-center text-xs">
        <div className="font-mono text-text-muted">{k}</div>
        <div className="text-lg font-semibold text-amber">{v as any}</div>
      </CardContent></Card>))}
    </div>
    <div>
      <div className="text-sm font-semibold mb-2">Models</div>
      <div className="grid md:grid-cols-2 gap-3">
        {(models.data??[]).map(m=>(<Card key={m.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><FactoryIcon className="h-4 w-4 text-amber"/><span className="font-semibold flex-1">{m.name}</span><Badge variant={m.stage==="deployed"?"emerald":m.stage==="canary"?"azure":m.stage==="approval"?"crimson":"amber"}>{m.stage}</Badge></div>
          <div className="text-text-muted mt-1">{m.builder} · {m.size} · {m.quant} · {m.vramMb}MB v{m.versions??1}</div>
          <div className="flex gap-1 mt-1">
            {m.safetyPassed && <Badge variant="emerald">safety</Badge>}
            {m.governanceApproved && <Badge variant="violet">gov-approved</Badge>}
            {m.canaryPct!==undefined && <Badge variant="azure">canary {m.canaryPct}%</Badge>}
          </div>
        </CardContent></Card>))}
      </div>
    </div>
    {tunes.data && tunes.data.length>0 && (<div>
      <div className="text-sm font-semibold mb-2">Fine-Tune Jobs</div>
      <div className="grid md:grid-cols-2 gap-3">
        {tunes.data.map(t=>(<Card key={t.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><CpuIcon className="h-4 w-4 text-violet"/><span className="font-mono flex-1">{t.id.slice(0,12)}…</span><Badge variant={t.status==="complete"?"emerald":"amber"}>{t.status}</Badge></div>
          <div className="text-text-muted mt-1">{t.method} on {t.dataset} · {t.progressPct}% for {t.modelId.slice(0,12)}…</div>
        </CardContent></Card>))}
      </div>
    </div>)}
  </div>);
}

function MemoryEvolutionTab() {
  const dash = useRefresh<me.MeDashboard|null>(()=>me.meApi.dashboard(), 10_000);
  const mems = useRefresh<me.MeMemory[]>(()=>me.meApi.recall({limit:30}), 10_000);
  const consols = useRefresh<me.MeConsolidationJob[]>(()=>me.meApi.consolidations(), 15_000);
  const d = dash.data;
  const [content,setContent] = useState("");
  const [msg,setMsg] = useState<string|null>(null);
  const add = async () => { if(!content.trim()) return; try{ await me.meApi.add({type:"knowledge",content}); setContent(""); setMsg("stored"); }catch(e:any){setMsg(e.message);} };
  const runConsol = async (kind:any) => { try{ const j = await me.meApi.consolidate(kind); setMsg(`consolidation ${j.id} affected ${j.affected}`); }catch(e:any){setMsg(e.message);} };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <DbIcon className="h-5 w-5 text-emerald"/>
      <div className="flex-1"><div className="font-semibold">Enterprise Memory Evolution Engine</div>
      <div className="text-xs text-text-muted">9 memory types with consolidation, knowledge refinement, aging &amp; decay, confidence scoring, intelligent forgetting, deduplication, cross-agent sharing, historical recall, analytics. Builds on S37 Memory Fabric via S39 Kernel Global Memory Coordination.</div></div>
    </div></CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Total Memories" value={d?.total??"…"} tone="emerald"/>
      <Stat label="Avg Confidence" value={d?.avgConfidence??"…"} tone="azure"/>
      <Stat label="Consolidations" value={d?.consolidationJobs24h??"…"} tone="violet"/>
      <Stat label="Dups Merged" value={d?.duplicatesMerged??"…"} tone="teal"/>
      <Stat label="Forgotten" value={d?.memoriesForgotten??"…"} tone="crimson"/>
      <Stat label="Cross-Agent Shares" value={d?.crossAgentShares??"…"} tone="fuchsia"/>
      <Stat label="Aging" value={d?.agingActive?"on":"off"} tone="amber"/>
      <Stat label="S37 Fabric" value={d?.extendsS37Fabric?"✓":"…"} tone="emerald"/>
    </div>
    <div className="grid md:grid-cols-9 gap-2">
      {d && Object.entries(d.memoriesByType).map(([k,v])=>(<Card key={k}><CardContent className="p-2 text-center text-xs">
        <div className="font-mono text-text-muted">{k}</div>
        <div className="text-lg font-semibold text-emerald">{v as any}</div>
      </CardContent></Card>))}
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Add Memory</CardTitle></CardHeader>
    <CardContent className="flex gap-2 items-center"><Input placeholder="Memory content" value={content} onChange={e=>setContent(e.target.value)} className="flex-1"/>
      <Button size="sm" variant="primary" onClick={add}><Plus className="h-3.5 w-3.5 mr-1"/>Store</Button>
      <Button size="sm" variant="outline" onClick={()=>runConsol("deduplicate")}>Dedupe</Button>
      <Button size="sm" variant="outline" onClick={()=>runConsol("age")}>Age</Button>
      {msg && <span className="text-xs text-text-muted">{msg}</span>}
    </CardContent></Card>
    <div>
      <div className="text-sm font-semibold mb-2">Memories (top 30)</div>
      <div className="grid md:grid-cols-2 gap-3">
        {(mems.data??[]).map(m=>(<Card key={m.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><Badge variant="emerald">{m.type}</Badge><span className="font-mono text-text-muted">{m.scope}</span><span className="flex-1 text-right text-text-muted">c {(m.confidence*100).toFixed(0)}% · s {(m.decayedStrength*100).toFixed(0)}%</span></div>
          <div className="mt-1">{m.content}</div>
          <div className="text-text-muted mt-1 text-[10px]">accessed {m.accessCount}× · {m.tags.join(", ")}</div>
        </CardContent></Card>))}
      </div>
    </div>
    {consols.data && consols.data.length>0 && (<div>
      <div className="text-sm font-semibold mb-2">Consolidation History</div>
      <div className="grid md:grid-cols-2 gap-3">
        {consols.data.slice(0,10).map(c=>(<Card key={c.id}><CardContent className="p-3 text-xs">
          <div className="flex items-center gap-2"><Badge variant="violet">{c.kind}</Badge><span className="flex-1 text-text-muted">{new Date(c.processedAt).toLocaleString()}</span><span>affected {c.affected}</span></div>
        </CardContent></Card>))}
      </div>
    </div>)}
  </div>);
}

// ─── Session 48: AI Constitution Studio ──────────────────────────────
function ConstitutionTab() {
  const dash = useRefresh<cst.ConstitutionDashboard|null>(()=>cst.constitutionApi.dashboard(), 10_000);
  const policies = useRefresh<cst.ConstitutionPolicy[]>(()=>cst.constitutionApi.policies(), 15_000);
  const viols = useRefresh<cst.ConstitutionViolation[]>(()=>cst.constitutionApi.violations(), 10_000);
  const d = dash.data;
  const DOMAINS: Array<{k:cst.ConstitutionDomain;l:string}> = [
    {k:"corporate_ethics",l:"Corp Ethics"},{k:"decision_boundaries",l:"Decision Limits"},{k:"risk_appetite",l:"Risk Appetite"},
    {k:"brand_standards",l:"Brand"},{k:"communication_style",l:"Comms Style"},{k:"regulatory_compliance",l:"Reg Compliance"},
    {k:"industry_rules",l:"Industry Rules"},{k:"regional_policies",l:"Regional"},{k:"escalation_requirements",l:"Escalation"},
    {k:"human_approval_rules",l:"Human Approval"},{k:"ai_decision_limits",l:"AI Limits"},
  ];
  const [domain,setDomain] = useState<cst.ConstitutionDomain>("corporate_ethics");
  const [title,setTitle] = useState("");
  const [statement,setStatement] = useState("");
  const [enf,setEnf] = useState<"advisory"|"required"|"hard_block">("required");
  const [status,setStatus] = useState<cst.ConstitutionPolicy["status"]>("draft");
  const [prompt,setPrompt] = useState("");
  const [check,setCheck] = useState<cst.CheckResult|null>(null);
  const [msg,setMsg] = useState<string|null>(null);
  const addPolicy = async () => {
    if(!title || !statement) return;
    try { const p = await cst.constitutionApi.upsertPolicy({domain,title,statement,enforcementLevel:enf,status}); setMsg(`policy ${p.id} v${p.version} added`); setTitle(""); setStatement(""); policies.refresh(); dash.refresh(); }
    catch(e:any){ setMsg(e.message); }
  };
  const publish = async () => {
    const ids = (policies.data||[]).filter(p=>p.status==="approved").map(p=>p.id);
    if(!ids.length) return setMsg("Need approved policies");
    try { await cst.constitutionApi.publish({name:"Enterprise Constitution",policyIds:ids}); setMsg("published new active version"); dash.refresh(); }
    catch(e:any){ setMsg(e.message); }
  };
  const doCheck = async () => {
    if(!prompt) return;
    try { setCheck(await cst.constitutionApi.check({promptOrAction:prompt})); } catch(e:any){ setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <BookOpen className="h-5 w-5 text-azure"/><div className="flex-1"><div className="font-semibold">AI Constitution Studio</div>
      <div className="text-xs text-text-muted">11 configurable policy domains; every AI Employee/Workforce inherits the approved constitution. Hard-block enforcement routes through the Kernel.</div></div>
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Active Version" value={`v${d.activeVersion}`} tone="azure" sub={d.lastApprovedAt?new Date(d.lastApprovedAt).toLocaleDateString():""}/>
      <Stat label="Policies" value={`${d.approvedPolicies}/${d.totalPolicies}`} tone="violet" sub="approved"/>
      <Stat label="Violations 24h" value={d.violations24h} tone={d.blockedActions24h?"crimson":"emerald"} sub={`${d.blockedActions24h} blocked`}/>
      <Stat label="Workforces Covered" value={d.coveredWorkforces} tone="teal"/>
    </div>)}
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Policies by Domain</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {DOMAINS.map(d2=>(<div key={d2.k} className="flex items-center justify-between"><span>{d2.l}</span><span className="font-mono text-text-muted">{d?.policiesByDomain[d2.k]??0}</span></div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Constitution Gate Tester</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <Input placeholder="Prompt or action to check…" value={prompt} onChange={e=>setPrompt(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={doCheck}>Check</Button>
        {check && (<div className={cn("p-2 rounded text-xs",check.allowed?"bg-emerald/10 border border-emerald/30":"bg-crimson/10 border border-crimson/30")}>
          <div className="font-semibold mb-1">{check.allowed?"✓ ALLOWED":"✗ BLOCKED"} (v{check.constitutionVersion})</div>
          {check.violations.map((v,i)=>(<div key={i} className="flex items-center gap-1"><Badge variant={v.action==="blocked"?"crimson":v.action==="warned"?"amber":"slate"}>{v.action}</Badge><span>{v.domain}: {v.reason}</span></div>))}
        </div>)}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Add Policy</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <select value={domain} onChange={e=>setDomain(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
          {DOMAINS.map(x=><option key={x.k} value={x.k}>{x.l}</option>)}
        </select>
        <select value={enf} onChange={e=>setEnf(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
          <option value="advisory">advisory</option><option value="required">required</option><option value="hard_block">hard_block</option>
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
          <option value="draft">draft</option><option value="review">review</option><option value="approved">approved</option><option value="archived">archived</option>
        </select>
        <Input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} className="flex-1"/>
      </div>
      <textarea value={statement} onChange={e=>setStatement(e.target.value)} rows={3} placeholder="Policy statement…" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs"/>
      <div className="flex gap-2 items-center">
        <Button size="sm" variant="primary" onClick={addPolicy}>Add</Button>
        <Button size="sm" variant="success" onClick={publish}><BadgeCheck className="h-3 w-3 mr-1"/>Publish Approved</Button>
        {msg && <span className="text-xs text-text-muted">{msg}</span>}
      </div>
    </CardContent></Card>
    {viols.data && viols.data.length>0 && (<Card><CardHeader><CardTitle className="text-sm">Recent Violations</CardTitle></CardHeader>
    <CardContent className="space-y-1 text-xs">
      {viols.data.slice(0,15).map(v=>(<div key={v.id} className="flex items-center gap-2">
        <Badge variant={v.severity==="critical"?"crimson":v.severity==="high"?"amber":"slate"}>{v.severity}</Badge>
        <Badge variant={v.action==="blocked"?"crimson":"slate"}>{v.action}</Badge>
        <span className="flex-1">{v.summary}</span><span className="text-text-muted">{v.domain}</span>
      </div>))}
    </CardContent></Card>)}
  </div>);
}

// ─── Session 49: AI Capability Composer ──────────────────────────────
function ComposerTab() {
  const dash = useRefresh<cmp.ComposerDashboard|null>(()=>cmp.composerApi.dashboard(), 10_000);
  const wfs = useRefresh<cmp.ComposedWorkflow[]>(()=>cmp.composerApi.list(), 15_000);
  const runs = useRefresh<cmp.ComposerRunLog[]>(()=>cmp.composerApi.runs(), 10_000);
  const d = dash.data;
  const [sel,setSel] = useState<string|null>(null);
  const [selWf,setSelWf] = useState<cmp.ComposedWorkflow|null>(null);
  const [val,setVal] = useState<cmp.ComposerValidationResult|null>(null);
  const [runLog,setRunLog] = useState<cmp.ComposerRunLog|null>(null);
  const [msg,setMsg] = useState<string|null>(null);
  useEffect(()=>{ if(!sel && wfs.data?.length) setSel(wfs.data[0]!.id); },[wfs.data]);
  useEffect(()=>{(async()=>{ if(!sel) return setSelWf(null); const w = await cmp.composerApi.get(sel); setSelWf(w); if(w){ const v = await cmp.composerApi.validate(sel); setVal(v); } })();},[sel]);
  const deploy = async () => { if(!sel) return; try { await cmp.composerApi.deploy(sel); setMsg("deployed"); wfs.refresh(); } catch(e:any){ setMsg(e.message); } };
  const run = async () => { if(!sel) return; try { setRunLog(await cmp.composerApi.run(sel)); runs.refresh(); } catch(e:any){ setMsg(e.message); } };
  const ICONS: Record<string,any> = {OCR:Eye,Vision:Eye,Translation:Languages,Voice:Mic,Video:Film,Knowledge:BookOpen,Reasoning:Brain,CRM:Users,Workflow:WorkflowIcon,Notify:Bell,Analytics:BarChart3};
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Workflow className="h-5 w-5 text-fuchsia"/><div className="flex-1"><div className="font-semibold">AI Capability Composer</div>
      <div className="text-xs text-text-muted">Visual no-code composition over 11 primitives (OCR/vision/translation/voice/video/KR/reasoning/CRM/workflows/notifications/analytics) from prior sessions.</div></div>
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Workflows" value={d.totalWorkflows} tone="fuchsia" sub={`${d.deployedWorkflows} deployed`}/>
      <Stat label="Drafts" value={d.draftWorkflows} tone="violet"/>
      <Stat label="Total Runs" value={d.totalRuns} tone="azure"/>
      <Stat label="Success" value={`${Math.round((d.successRate||1)*100)}%`} tone="emerald"/>
    </div>)}
    <div className="grid md:grid-cols-3 gap-3">
      <Card>
        <CardHeader><CardTitle className="text-sm">Workflows</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs max-h-80 overflow-y-auto">
          {(wfs.data||[]).map(w=>(<button key={w.id} onClick={()=>setSel(w.id)} className={cn("w-full text-left rounded p-2 flex items-center gap-2",sel===w.id?"bg-fuchsia/10 border border-fuchsia/40":"hover:bg-white/5 border border-transparent")}>
            <span className="flex-1 font-medium truncate">{w.name}</span>
            <Badge variant={w.status==="deployed"?"emerald":"slate"}>{w.status}</Badge>
          </button>))}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader className="flex items-center justify-between flex-row">
          <CardTitle className="text-sm">{selWf?.name ?? "Select a workflow"}</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={!sel} onClick={()=>sel && cmp.composerApi.validate(sel).then(setVal)}><Activity className="h-3 w-3 mr-1"/>Validate</Button>
            <Button size="sm" variant="success" disabled={!val?.valid} onClick={deploy}><Rocket className="h-3 w-3 mr-1"/>Deploy</Button>
            <Button size="sm" variant="primary" disabled={selWf?.status!=="deployed"} onClick={run}><Play className="h-3 w-3 mr-1"/>Run</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {selWf && (<>
            <div className="text-text-muted">{selWf.description} · v{selWf.version} · runs {selWf.runs} · avg {selWf.avgDurationMs}ms</div>
            {val && (<div className={cn("p-2 rounded",val.valid?"bg-emerald/10 border border-emerald/30":"bg-crimson/10 border border-crimson/30")}>
              <div className="font-semibold">{val.valid?"✓ valid":"✗ invalid"} · {val.capabilityCount} caps · est ${val.estimatedCostPerRun.toFixed(4)}/run</div>
              {val.errors.map((e,i)=>(<div key={i} className="text-crimson">• {e.message}</div>))}
              {val.warnings.map((w,i)=>(<div key={i} className="text-amber">! {w}</div>))}
            </div>)}
            <div>
              <div className="text-[11px] uppercase text-text-muted mb-1">Canvas ({selWf.nodes.length} nodes · {selWf.edges.length} edges)</div>
              <div className="relative bg-black/20 rounded h-56 border border-white/5 overflow-hidden">
                {selWf.nodes.map(n=>(<div key={n.id} className="absolute rounded px-2 py-1 text-[10px] border"
                  style={{left:`${(n.x/1000)*100}%`, top:`${(n.y/300)*100}%`,
                    background: n.kind==="trigger"?"rgba(59,130,246,.15)":n.kind==="output"?"rgba(16,185,129,.15)":"rgba(217,70,239,.15)",
                    borderColor: n.kind==="trigger"?"#3B82F6":n.kind==="output"?"#10B981":"#D946EF"}}>
                  {n.label}
                </div>))}
              </div>
            </div>
            {runLog && (<div className="p-2 rounded bg-emerald/10 border border-emerald/30">
              <div className="font-semibold">Run {runLog.id.slice(0,8)} · {runLog.status} · {runLog.durationMs}ms · {runLog.stepCount} steps</div>
            </div>)}
          </>)}
          {msg && <div className="text-text-muted">{msg}</div>}
        </CardContent>
      </Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Capability Library</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
      {(d?.library||[]).map(c=>{
        const Ic = (c.icon==="Scan"?Eye:ICONS[c.label.split(" ")[0]||"Brain"])??Boxes;
        return (<div key={c.type} className="border border-white/5 rounded p-2 flex items-start gap-2">
          <Ic className="h-4 w-4 text-fuchsia mt-0.5"/>
          <div><div className="font-semibold">{c.label}</div><div className="text-text-muted text-[11px]">{c.description} <span className="text-violet">({c.sourceSession})</span></div></div>
        </div>);
      })}
    </CardContent></Card>
    {runs.data && runs.data.length>0 && (<Card><CardHeader><CardTitle className="text-sm">Recent Runs</CardTitle></CardHeader>
    <CardContent className="space-y-1 text-xs">
      {runs.data.slice(0,10).map(r=>(<div key={r.id} className="flex items-center gap-2">
        <Badge variant={r.status==="succeeded"?"emerald":"crimson"}>{r.status}</Badge>
        <span className="font-mono">{r.id.slice(0,10)}</span><span className="flex-1 text-text-muted">{r.stepCount} steps by {r.triggeredBy.slice(0,10)}</span>
        <span>{r.durationMs}ms</span>
      </div>))}
    </CardContent></Card>)}
  </div>);
}

// ─── Session 50: Enterprise AI Benchmark Center ──────────────────────
function BenchmarksTab() {
  const dash = useRefresh<bm.BmDashboard|null>(()=>bm.benchmarksApi.dashboard(), 10_000);
  const runs = useRefresh<bm.BmRun[]>(()=>bm.benchmarksApi.runs(), 10_000);
  const d = dash.data;
  const [area,setArea] = useState<bm.BmArea>("latency");
  const [notes,setNotes] = useState("");
  const [msg,setMsg] = useState<string|null>(null);
  const AREAS: bm.BmArea[] = ["ai_models","ai_employees","ai_workflows","voice_models","vision_models","translation_quality","coding_performance","response_accuracy","latency","resource_consumption","cost_efficiency","safety_metrics","reliability","user_satisfaction"];
  const runOne = async () => {
    try { const r = await bm.benchmarksApi.run({area,notes}); setMsg(`run ${r.id} score ${r.overallScore} ${r.passed?"✓":"✗"}`); runs.refresh(); dash.refresh(); } catch(e:any){ setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <BarChart3 className="h-5 w-5 text-amber"/><div className="flex-1"><div className="font-semibold">Enterprise AI Benchmark Center</div>
      <div className="text-xs text-text-muted">14 evaluation areas spanning models, voices, vision, translation, coding, accuracy, latency, cost, safety, reliability. Benchmark results feed the S46 Model Factory continuous-optimization loop.</div></div>
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Total Runs" value={d.totalRuns} tone="amber"/>
      <Stat label="Last 24h" value={d.completed24h} tone="azure"/>
      <Stat label="Avg Score" value={d.avgScore} tone="violet"/>
      <Stat label="Pass Rate" value={`${Math.round(d.passRate*100)}%`} tone="emerald"/>
      <Stat label="→ MF Opt" value={d.feedbackToModelFactory.optimizedModels} tone="teal" sub={`${d.feedbackToModelFactory.pendingRecommendations} pending recs`}/>
    </div>)}
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Area Scores</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {d && AREAS.map(a=>(<div key={a} className="flex items-center gap-2">
          <span className="w-40 truncate">{a.replace(/_/g," ")}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className={cn("h-full",d.areaScores[a]>=80?"bg-emerald":d.areaScores[a]>=60?"bg-amber":"bg-crimson")} style={{width:`${d.areaScores[a]}%`}}/></div>
          <span className="w-8 text-right font-mono">{d.areaScores[a]}</span>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Run Benchmark</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <select value={area} onChange={e=>setArea(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
          {AREAS.map(a=><option key={a} value={a}>{a.replace(/_/g," ")}</option>)}
        </select>
        <Input placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={runOne}><Play className="h-3 w-3 mr-1"/>Run</Button>
        {msg && <div className="text-xs text-text-muted">{msg}</div>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Leaderboard</CardTitle></CardHeader>
    <CardContent className="space-y-1 text-xs">
      {(d?.leaderboard||[]).map((l,i)=>(<div key={i} className="flex items-center gap-2">
        <Award className={cn("h-4 w-4",i===0?"text-amber":i===1?"text-slate-300":i===2?"text-amber-700":"text-text-muted")}/>
        <span className="flex-1">{l.targetName}</span><Badge variant="slate">{l.area.replace(/_/g," ")}</Badge><span className="font-mono">{l.overallScore}</span>
      </div>))}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">Recent Runs</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(runs.data||[]).slice(0,15).map(r=>(<div key={r.id} className="border border-white/5 rounded p-2">
        <div className="flex items-center gap-2"><Badge variant={r.passed?"emerald":"crimson"}>{r.passed?"PASS":"FAIL"}</Badge>
        <span className="font-semibold">{r.area.replace(/_/g," ")}</span><span className="text-text-muted">{r.targetName}</span>
        <span className="ml-auto font-mono">{r.overallScore} · {r.durationMs}ms</span></div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 51: Disaster Recovery & AI Continuity ───────────────────
function DisasterRecoveryTab() {
  const dash = useRefresh<dr.DrDashboard|null>(()=>dr.drApi.dashboard(), 10_000);
  const evts = useRefresh<dr.DrFailoverEvent[]>(()=>dr.drApi.events(), 15_000);
  const drills = useRefresh<dr.DrDrill[]>(()=>dr.drApi.drills(), 15_000);
  const d = dash.data;
  const [comp,setComp] = useState<dr.DrComponent>("ai_cluster");
  const [region,setRegion] = useState("eu-west-1");
  const [reason,setReason] = useState("");
  const [em,setEm] = useState(false);
  const [msg,setMsg] = useState<string|null>(null);
  const doFailover = async () => { if(!reason) return; try { await dr.drApi.failover({component:comp,toRegion:region,reason}); setMsg("failover completed"); dash.refresh(); evts.refresh(); setReason(""); } catch(e:any){ setMsg(e.message); } };
  const doDrill = async (id:string) => { try { await dr.drApi.runDrill(id); setMsg("drill completed"); drills.refresh(); dash.refresh(); } catch(e:any){ setMsg(e.message); } };
  const toggleEm = async () => { try { await dr.drApi.setEmergency(!em); setEm(!em); dash.refresh(); } catch(e:any){ setMsg(e.message); } };
  useEffect(()=>{ if(d) setEm(d.emergencyModeActive); },[d]);
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <HeartPulse className="h-5 w-5 text-crimson"/><div className="flex-1"><div className="font-semibold">Disaster Recovery &amp; AI Continuity</div>
      <div className="text-xs text-text-muted">AI cluster failover, multi-region deployment, memory/KG/model replication, backup inference, offline emergency mode, BCP, DR drills, auto-failback, infrastructure health monitoring.</div></div>
      {d && <Badge variant={d.overallHealthy?"emerald":"crimson"}>{d.overallHealthy?"healthy":"degraded"}</Badge>}
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Active Region" value={d.activeRegion} tone="azure"/>
      <Stat label="Standby" value={d.standbyRegions.length} tone="violet" sub={d.standbyRegions.join(", ")}/>
      <Stat label="Max Repl Lag" value={`${d.replicationLagMs}ms`} tone={d.replicationLagMs<2000?"emerald":"amber"}/>
      <Stat label="Failovers (30d)" value={d.failovers30d} tone="crimson"/>
      <Stat label="Last Drill" value={d.lastDrillStatus||"—"} tone={d.lastDrillStatus==="passed"?"emerald":"crimson"} sub={d.lastDrillAt?new Date(d.lastDrillAt).toLocaleDateString():""}/>
      <Stat label="Offline Mode" value={d.offlineModeAvailable?"ready":"—"} tone="teal"/>
      <Stat label="Emergency" value={d.emergencyModeActive?"ACTIVE":"off"} tone={d.emergencyModeActive?"crimson":"emerald"}/>
    </div>)}
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Component Status</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(d?.components||[]).map(c=>(<div key={c.component} className="flex items-center gap-2 p-2 rounded border border-white/5">
          <span className={cn("h-2 w-2 rounded-full",c.healthy?"bg-emerald":"bg-crimson")}/>
          <span className="flex-1 font-mono">{c.component.replace(/_/g," ")}</span>
          <span className="text-text-muted">{c.activeRegion}</span>
          <span className="text-text-muted">{c.replicationLagMs}ms</span>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Manual Failover</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex gap-2 flex-wrap">
          <select value={comp} onChange={e=>setComp(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1">
            {(d?.components||[]).map(c=><option key={c.component} value={c.component}>{c.component.replace(/_/g," ")}</option>)}
          </select>
          <select value={region} onChange={e=>setRegion(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1">
            {(d?.standbyRegions||["eu-west-1","ap-south-1","na-west-2"]).map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Input placeholder="Reason for failover" value={reason} onChange={e=>setReason(e.target.value)}/>
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="danger" onClick={doFailover}><Siren className="h-3 w-3 mr-1"/>Failover</Button>
          <Button size="sm" variant={em?"danger":"outline"} onClick={toggleEm}><AlertTriangle className="h-3 w-3 mr-1"/>{em?"Deactivate Emergency":"Emergency Mode"}</Button>
          {msg && <span className="text-text-muted">{msg}</span>}
        </div>
      </CardContent></Card>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">DR Drills</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(drills.data||[]).slice(0,10).map(x=>(<div key={x.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <Badge variant={x.status==="passed"?"emerald":x.status==="failed"?"crimson":"slate"}>{x.status}</Badge>
          <span className="flex-1">{x.component.replace(/_/g," ")}</span>
          {x.status==="scheduled" && <Button size="sm" variant="outline" onClick={()=>doDrill(x.id)}><Play className="h-3 w-3 mr-1"/>Run</Button>}
          {x.results && <span className="text-text-muted">RTO {x.results.rtoAchievedMs}ms</span>}
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Failover Events</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(evts.data||[]).slice(0,10).map(e=>(<div key={e.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><Badge variant="crimson">{e.component.replace(/_/g," ")}</Badge><span className="flex-1">{e.fromRegion} → {e.toRegion}</span><span>{e.rtoMs}ms RTO</span></div>
          <div className="text-text-muted">{e.reason} · {new Date(e.startedAt).toLocaleString()}</div>
        </div>))}
      </CardContent></Card>
    </div>
  </div>);
}

// ─── Session 52: AI Licensing & Monetization Platform ────────────────
function LicensingTab() {
  const dash = useRefresh<lic.LicensingDashboard|null>(()=>lic.licensingApi.dashboard(), 10_000);
  const assets = useRefresh<lic.LicensedAsset[]>(()=>lic.licensingApi.assets(), 15_000);
  const grants = useRefresh<lic.LicenseGrant[]>(()=>lic.licensingApi.grants(), 15_000);
  const d = dash.data;
  const [type,setType] = useState<lic.LicensableAssetType>("ai_skill");
  const [extId,setExtId] = useState("");
  const [name,setName] = useState("");
  const [bm,setBm] = useState<lic.BillingModel>("subscription");
  const [price,setPrice] = useState(0);
  const [msg,setMsg] = useState<string|null>(null);
  const register = async () => { if(!name||!extId) return; try { await lic.licensingApi.register({type,externalAssetId:extId,name,billingModel:bm,priceCents:price,description:name,currency:"USD"}); setMsg("registered"); assets.refresh(); dash.refresh(); setName(""); setExtId(""); } catch(e:any){ setMsg(e.message); } };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <DollarSign className="h-5 w-5 text-emerald"/><div className="flex-1"><div className="font-semibold">AI Licensing &amp; Monetization Platform</div>
      <div className="text-xs text-text-muted">Monetizable assets (models/employees/agents/skills/workflows/voices/prompts/knowledge/templates/connectors/plugins/digital-humans) with 5 billing models: subscription, usage, revenue-share, enterprise license, royalty.</div></div>
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Assets" value={d.totalAssets} tone="emerald" sub={`${d.listedAssets} listed`}/>
      <Stat label="Active Licenses" value={d.activeLicenses} tone="azure"/>
      <Stat label="30d Revenue" value={`$${(d.revenueCents30d/100).toFixed(2)}`} tone="teal"/>
      <Stat label="Pending Payouts" value={`$${(d.payoutsPendingCents/100).toFixed(2)}`} tone="amber"/>
      <Stat label="All-Time Rev" value={`$${(d.revenueCentsAllTime/100).toFixed(2)}`} tone="violet"/>
    </div>)}
    <div className="grid md:grid-cols-3 gap-3">
      <Card>
        <CardHeader><CardTitle className="text-sm">Register Asset</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <select value={type} onChange={e=>setType(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
            {["ai_model","ai_employee","ai_agent","ai_skill","ai_workflow","voice_pack","prompt_library","knowledge_pack","industry_template","connector","plugin","digital_human"].map(x=><option key={x} value={x}>{x.replace(/_/g," ")}</option>)}
          </select>
          <Input placeholder="External asset ID" value={extId} onChange={e=>setExtId(e.target.value)}/>
          <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
          <select value={bm} onChange={e=>setBm(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
            {["subscription","usage","revenue_share","enterprise_license","royalty"].map(x=><option key={x} value={x}>{x.replace(/_/g," ")}</option>)}
          </select>
          <Input type="number" placeholder="Price (cents)" value={price} onChange={e=>setPrice(Number(e.target.value))}/>
          <Button size="sm" variant="primary" onClick={register}>Register</Button>
          {msg && <div className="text-text-muted">{msg}</div>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-sm">Top Assets</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-xs">
          {(d?.topAssets||[]).map(a=>(<div key={a.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
            <Badge variant="violet">{a.type.replace(/_/g," ")}</Badge>
            <span className="flex-1 font-semibold">{a.name}</span>
            <span className="text-emerald font-mono">${(a.revenueCents30d/100).toFixed(2)}/30d</span>
          </div>))}
        </CardContent>
      </Card>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Assets ({(assets.data||[]).length})</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs max-h-80 overflow-y-auto">
        {(assets.data||[]).map(a=>(<div key={a.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <Badge variant="slate">{a.type.replace(/_/g," ")}</Badge>
          <span className="flex-1 truncate">{a.name}</span>
          <Badge variant={a.status==="listed"?"emerald":"slate"}>{a.status}</Badge>
          <span className="text-text-muted">{a.listings} subs</span>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">By Billing Model</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {d && Object.entries(d.byBillingModel).map(([k,v])=>(<div key={k} className="flex items-center justify-between"><span>{k.replace(/_/g," ")}</span><span className="font-mono">{v}</span></div>))}
      </CardContent></Card>
    </div>
  </div>);
}

// ─── Session 53: Enterprise Deployment Platform ──────────────────────
function DeploymentTab() {
  const dash = useRefresh<dep.DeploymentDashboard|null>(()=>dep.deploymentApi.dashboard(), 10_000);
  const targets = useRefresh<dep.DeploymentTarget[]>(()=>dep.deploymentApi.list(), 15_000);
  const d = dash.data;
  const [name,setName] = useState("");
  const [env,setEnv] = useState<dep.TargetEnvironment>("docker");
  const [region,setRegion] = useState("");
  const [selTgt,setSelTgt] = useState<string|null>(null);
  const [validation,setValidation] = useState<dep.DeploymentValidation|null>(null);
  const [msg,setMsg] = useState<string|null>(null);
  const ENVS: dep.TargetEnvironment[] = ["windows","linux","macos","docker","kubernetes","aws","azure","gcp","oracle","alibaba","private_cloud","on_prem","air_gapped","edge"];
  const create = async () => { if(!name) return; try { await dep.deploymentApi.create({name,environment:env,region:region||undefined}); setMsg("target created"); targets.refresh(); dash.refresh(); setName(""); } catch(e:any){ setMsg(e.message); } };
  const validate = async (id:string) => { setSelTgt(id); try { setValidation(await dep.deploymentApi.validate(id)); } catch(e:any){ setMsg(e.message); } };
  const destroy = async (id:string) => { if(!confirm("Destroy target?")) return; try { await dep.deploymentApi.destroy(id); setMsg("destroyed"); targets.refresh(); dash.refresh(); } catch(e:any){ setMsg(e.message); } };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4"><div className="flex items-center gap-2">
      <Cloud className="h-5 w-5 text-violet"/><div className="flex-1"><div className="font-semibold">Enterprise Deployment Platform</div>
      <div className="text-xs text-text-muted">Deploy WINDELS AI OS anywhere (14 environments: windows/linux/macOS/Docker/K8s/AWS/Azure/GCP/Oracle/Alibaba/private/on-prem/air-gapped/edge) with automated validation, configuration, and health checks.</div></div>
    </div></CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Targets" value={d.totalTargets} tone="violet"/>
      <Stat label="Healthy" value={d.healthyTargets} tone="emerald"/>
      <Stat label="Degraded" value={d.degradedTargets} tone="amber"/>
      <Stat label="Failed" value={d.failedTargets} tone={d.failedTargets?"crimson":"emerald"}/>
      <Stat label="Version" value={d.latestVersion} tone="azure" sub={`${d.outdatedTargets} outdated`}/>
      <Stat label="Health Score" value={d.avgHealthScore} tone={d.avgHealthScore>=90?"emerald":"amber"}/>
    </div>)}
    <div className="grid md:grid-cols-3 gap-3">
      <Card>
        <CardHeader><CardTitle className="text-sm">Provision Target</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
          <select value={env} onChange={e=>setEnv(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
            {ENVS.map(e=><option key={e} value={e}>{e.replace(/_/g," ")}</option>)}
          </select>
          <Input placeholder="Region (optional)" value={region} onChange={e=>setRegion(e.target.value)}/>
          <Button size="sm" variant="primary" onClick={create}><Plus className="h-3 w-3 mr-1"/>Provision</Button>
          {msg && <div className="text-text-muted">{msg}</div>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-sm">By Environment</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-1 text-xs">
          {d && ENVS.map(e=>(<div key={e} className="flex items-center justify-between p-1.5 border border-white/5 rounded">
            <span>{e.replace(/_/g," ")}</span><span className="font-mono">{d.byEnvironment[e]||0}</span>
          </div>))}
        </CardContent>
      </Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Deployment Targets</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(targets.data||[]).map(t=>(<div key={t.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full",t.status==="healthy"?"bg-emerald":t.status==="degraded"?"bg-amber":"bg-crimson")}/>
          <span className="font-semibold flex-1">{t.name}</span>
          <Badge variant="violet">{t.environment.replace(/_/g," ")}</Badge>
          {t.region && <Badge variant="slate">{t.region}</Badge>}
          <Badge variant="slate">v{t.version}</Badge>
          <Badge variant={t.validationPassed?"emerald":"crimson"}>{t.validationPassed?"validated":"not validated"}</Badge>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={()=>validate(t.id)}><Activity className="h-3 w-3 mr-1"/>Validate</Button>
            <Button size="sm" variant="danger" onClick={()=>destroy(t.id)}><X className="h-3 w-3 mr-1"/>Destroy</Button>
          </div>
        </div>
        <div className="text-text-muted mt-1 flex gap-3">cpu {t.cpuPct}% · mem {t.memPct}% · gpu {t.gpuPct}% · mods {t.modules.length}</div>
        {selTgt===t.id && validation && (<div className="mt-2 p-2 rounded bg-black/20 border border-white/5">
          <div className="flex items-center gap-2 mb-1"><Badge variant={validation.passed?"emerald":"crimson"}>{validation.passed?"PASSED":"FAILED"}</Badge><span className="text-text-muted">{validation.durationMs}ms</span></div>
          {validation.checks.map(c=>(<div key={c.id} className="flex items-center gap-2"><span className={c.passed?"text-emerald":"text-crimson"}>{c.passed?"✓":"✗"}</span><span className="flex-1">{c.label}</span><span className="text-text-muted">{c.durationMs}ms</span></div>))}
        </div>)}
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 54: Update & Lifecycle Management ────────────────────────
function UpdatesTab() {
  const dash = useRefresh<upd.UpdateDashboard|null>(()=>upd.updatesApi.dashboard(), 12_000);
  const pkgs = useRefresh<upd.UpdatePackage[]>(()=>upd.updatesApi.list(), 15_000);
  const d = dash.data;
  const [msg,setMsg] = useState<string|null>(null);
  const doAction = async (id:string, action:"validate"|"approve"|"deploy"|"rollback") => {
    try {
      if (action==="validate") await upd.updatesApi.validate(id);
      if (action==="approve") await upd.updatesApi.approve(id);
      if (action==="deploy") await upd.updatesApi.deploy(id);
      if (action==="rollback") await upd.updatesApi.rollback(id);
      setMsg(`package ${action}d`);
      dash.refresh(); pkgs.refresh();
    } catch(e:any) { setMsg(e.message); }
  };
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <RefreshCw className="h-5 w-5 text-teal"/><div className="flex-1"><div className="font-semibold">Update & Lifecycle Management</div>
      <div className="text-xs text-text-muted">Controlled upgrades across platform, modules, plugins, models, voice/language packs — with blue/green, canary, rollback, and dependency validation.</div></div>
      <Button size="sm" variant="outline" onClick={()=>upd.updatesApi.check().then(()=>{dash.refresh(); pkgs.refresh(); setMsg("checked upstream");})}><RefreshCw className="h-3 w-3 mr-1"/>Check for updates</Button>
    </CardContent></Card>
    {d && (<div className="grid md:grid-cols-4 gap-3">
      <Stat label="Current Version" value={d.currentVersion} tone="teal"/>
      <Stat label="Available" value={d.availableUpdates} tone="azure"/>
      <Stat label="Pending Approval" value={d.pendingApproval} tone="amber"/>
      <Stat label="Deploying" value={d.deploying} tone="violet"/>
      <Stat label="Deployed (7d)" value={d.deployedLast7d} tone="emerald"/>
      <Stat label="Rollbacks (30d)" value={d.rollbacksLast30d} tone={d.rollbacksLast30d?"crimson":"emerald"}/>
      <Stat label="Channel" value={d.channel} tone="fuchsia"/>
    </div>)}
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <Card><CardHeader><CardTitle className="text-sm">Update Packages</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(pkgs.data||[]).map(p=>(<div key={p.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold flex-1">{p.name}</span>
          <Badge variant="teal">v{p.version}</Badge>
          <Badge variant="slate">{p.category.replace(/_/g," ")}</Badge>
          <Badge variant="violet">{p.channel}</Badge>
          <Badge variant="fuchsia">{p.strategy.replace(/_/g," ")}</Badge>
          <Badge variant={p.status==="deployed"?"emerald":p.status==="failed"||p.status==="rolled_back"?"crimson":p.status==="pending"?"slate":"amber"}>{p.status}</Badge>
          <div className="flex gap-1">
            {p.status==="pending" && <Button size="sm" variant="outline" onClick={()=>doAction(p.id,"validate")}><CheckCircle2 className="h-3 w-3 mr-1"/>Validate</Button>}
            {(p.status==="staged"||p.status==="approved") && p.approvalsGiven.length < p.approvalsRequired && <Button size="sm" variant="outline" onClick={()=>doAction(p.id,"approve")}><ThumbsUp className="h-3 w-3 mr-1"/>Approve</Button>}
            {(p.status==="approved"||p.status==="staged") && <Button size="sm" variant="primary" onClick={()=>doAction(p.id,"deploy")}><Rocket className="h-3 w-3 mr-1"/>Deploy</Button>}
            {p.status==="deployed" && <Button size="sm" variant="danger" onClick={()=>doAction(p.id,"rollback")}><XCircle className="h-3 w-3 mr-1"/>Rollback</Button>}
          </div>
        </div>
        <div className="text-text-muted mt-1 flex gap-3">{(p.sizeBytes/1024/1024).toFixed(0)} MB · {p.changelog} · {p.approvalsGiven.length}/{p.approvalsRequired} approvals</div>
        {p.status==="deploying" && <div className="mt-2 h-1.5 bg-white/5 rounded overflow-hidden"><div className="h-full bg-teal" style={{width:`${p.progressPct}%`}}/></div>}
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 55: Usage Intelligence ───────────────────────────────────
function UsageTab() {
  const d = useRefresh<usg.UsageDashboard|null>(()=>usg.usageApi.dashboard(), 10_000);
  const data = d.data;
  if (!data) return <div/>;
  const fmt = (n:number) => n>=1_000_000 ? (n/1_000_000).toFixed(1)+"M" : n>=1000 ? (n/1000).toFixed(1)+"k" : String(Math.round(n));
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <PieChart className="h-5 w-5 text-amber"/><div className="flex-1"><div className="font-semibold">Enterprise Usage Intelligence</div>
      <div className="text-xs text-text-muted">Executive analytics: utilization, automation, productivity, cost savings, ROI, GPU/storage, carbon impact.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      {/* Session 123 — value/delta/trend are null-safe: an unmeasured metric
          prints "not recorded" and a missing baseline prints "no baseline"
          instead of a fabricated 0. */}
      {data.metrics.map(m=>(
        <Stat
          key={m.label}
          label={m.label}
          value={m.value === null ? "not recorded" : `${m.unit==="USD"?"$":""}${fmt(m.value)}${m.unit==="%"?"%":m.unit==="USD"?"":m.unit==="hrs"?"h":m.unit==="kg CO2e"?"kg":""}`}
          tone={m.trend==="up"?"emerald":m.trend==="down"?"crimson":"slate"}
          sub={m.deltaPct === null ? "no baseline" : `${m.deltaPct>=0?"+":""}${m.deltaPct}%`}
        />
      ))}
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Department Utilization</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.departments.map(de=>(<div key={de.department}>
          <div className="flex justify-between"><span>{de.department}</span><span className="font-mono">{fmt(de.requests)} · ${fmt(de.costUsd)} · {(de.automationRate*100).toFixed(0)}% auto</span></div>
          <div className="h-1.5 bg-white/5 rounded overflow-hidden"><div className="h-full bg-amber" style={{width:`${Math.min(100, de.requests/600)}%`}}/></div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Module Usage</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.modules.slice(0,10).map(m=>(<div key={m.module} className="flex justify-between">
          <span className="flex-1">{m.module}</span><span className="text-text-muted mr-2">{m.users} users</span><span className="font-mono w-20 text-right">{fmt(m.requests)}</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Resource Utilization</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-4 gap-2 text-xs">
      <div><div className="text-text-muted">CPU</div><div className="text-xl font-bold">{data.resources.cpuPct}%</div></div>
      <div><div className="text-text-muted">Memory</div><div className="text-xl font-bold">{data.resources.memPct}%</div></div>
      <div><div className="text-text-muted">GPU</div><div className="text-xl font-bold">{data.resources.gpuPct}%</div></div>
      <div><div className="text-text-muted">Storage</div><div className="text-xl font-bold">{data.resources.storageGb}/{data.resources.storageQuotaGb} GB</div></div>
      <div><div className="text-text-muted">Network</div><div className="text-xl font-bold">{data.resources.networkMbps} Mbps</div></div>
      <div><div className="text-text-muted">Cost/day</div><div className="text-xl font-bold">${data.resources.costPerDayUsd.toFixed(0)}</div></div>
      <div><div className="text-text-muted">30d CO2e</div><div className="text-xl font-bold">{data.carbonKgCO2e30d} kg</div></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">30-day Trend</CardTitle></CardHeader>
    <CardContent>
      <div className="flex items-end gap-0.5 h-24">
        {data.series.map((pt,i)=>(<div key={i} className="flex-1 bg-amber/70 rounded-t" style={{height:`${Math.min(100,(pt.requests/7000)*100)}%`}} title={`${pt.ts.slice(0,10)}: ${pt.requests}`}/>))}
      </div>
    </CardContent></Card>
  </div>);
}

// ─── Session 56: Intelligence Fabric / Trust / Mission Control ────────
function FabricTab() {
  const d = useRefresh<fab.FabricDashboard|null>(()=>fab.fabricApi.dashboard(), 7_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const ack = async (id:string) => { try { await fab.fabricApi.acknowledgeAlert(id); d.refresh(); } catch(e:any){setMsg(e.message);} };
  const sim = async (id:string) => { try { await fab.fabricApi.simulateTwin(id); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <CogIcon className="h-5 w-5 text-violet"/><div className="flex-1"><div className="font-semibold">Intelligence Fabric · Trust Center · Mission Control</div>
      <div className="text-xs text-text-muted">Enterprise nervous system: data fabric, time machine, trust scores, innovation lab, mission control, API gateway, evolution, digital twins, package manager, certification, AIO bus.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Connected Sources" value={data.dataFabric.connectedSources} tone="azure" sub={`${data.dataFabric.streamsActive} streams`}/>
      <Stat label="Data Quality" value={`${(data.dataFabric.dataQualityScore*100).toFixed(0)}%`} tone="emerald"/>
      <Stat label="Trust Score" value={data.trust.overallScore} tone={data.trust.overallScore>=85?"emerald":"amber"} sub={data.trust.level}/>
      <Stat label="Sandboxes" value={data.sandboxes} tone="fuchsia" sub={`${data.sandboxesRunning} running`}/>
      <Stat label="Workforce Active" value={data.mission.workforceActive} tone="violet"/>
      <Stat label="Workflows Running" value={data.mission.workflowsRunning} tone="teal"/>
      <Stat label="GPU Util" value={`${data.mission.gpuUtilPct}%`} tone="amber"/>
      <Stat label="Open Alerts" value={data.mission.globalAlerts} tone={data.mission.globalAlerts?"crimson":"emerald"}/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Trust Signals</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.trust.signals.map(s=>(<div key={s.id} className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", s.status==="good"?"bg-emerald":s.status==="warn"?"bg-amber":"bg-crimson")}/>
          <span className="flex-1">{s.label}</span><span className="font-mono">{Math.round(s.score*100)}%</span>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Global Alerts</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.alerts.map(a=>(<div key={a.id} className="flex items-center gap-2">
          <Badge variant={a.severity==="critical"?"crimson":a.severity==="warn"?"amber":"slate"}>{a.severity}</Badge>
          <span className="flex-1">{a.message}</span>
          {!a.acknowledged && <Button size="sm" variant="ghost" onClick={()=>ack(a.id)}>ack</Button>}
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Business KPIs (Mission)</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.mission.businessKpis.map(k=>(<div key={k.name} className="flex justify-between">
          <span>{k.name}</span><span className={cn("font-mono", k.value>=k.target?"text-emerald":"text-amber")}>{k.unit==="USD"?"$":""}{k.value}{k.unit==="%"?"%":k.unit==="USD"?"":""} / {k.unit==="USD"?"$":""}{k.target}{k.unit==="%"?"%":""}</span>
        </div>))}
        <div className="flex justify-between pt-2 border-t border-white/5"><span>Decisions/min</span><span className="font-mono">{data.mission.autonomousDecisionsPerMin}</span></div>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Digital Twins (run simulations)</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 gap-2 text-xs">
      {data.twins.map(t=>(<div key={t.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2"><Box className="h-3.5 w-3.5 text-violet"/><span className="font-semibold flex-1">{t.name}</span><Badge variant="slate">{t.kind.replace(/_/g," ")}</Badge></div>
        <div className="text-text-muted">health {t.healthPct}% · accuracy {t.predictionAccuracyPct}% · {t.simulationRuns} runs · {t.status}</div>
        <Button size="sm" variant="outline" className="mt-1" onClick={()=>sim(t.id)}><Play className="h-3 w-3 mr-1"/>Simulate</Button>
      </div>))}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">Installed Packages (AIO Package Manager)</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-2 gap-1 text-xs">
      {data.packages.map(p=>(<div key={p.id} className="flex items-center gap-2 p-1.5 border border-white/5 rounded">
        <Package className="h-3 w-3 text-violet"/><span className="flex-1 font-mono">{p.name}</span>
        <Badge variant="teal">{p.kind.replace(/_/g," ")}</Badge>
        <Badge variant="slate">v{p.version}</Badge>
      </div>))}
    </CardContent></Card>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Maturity by Department</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.maturity.map(m=>(<div key={m.department} className="flex justify-between"><span>{m.department}</span><span className="font-mono">{m.score} · {m.level}</span></div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">AIO Bus</CardTitle></CardHeader>
      <CardContent className="text-xs grid grid-cols-2 gap-2">
        <div><div className="text-text-muted">eps</div><div className="text-lg font-bold">{data.bus.eventsPerSec}</div></div>
        <div><div className="text-text-muted">topics</div><div className="text-lg font-bold">{data.bus.topics}</div></div>
        <div><div className="text-text-muted">subscribers</div><div className="text-lg font-bold">{data.bus.subscribers}</div></div>
        <div><div className="text-text-muted">avg latency</div><div className="text-lg font-bold">{data.bus.avgLatencyMs}ms</div></div>
      </CardContent></Card>
    </div>
  </div>);
}

// ─── Session 57: Robotics & Physical Automation ──────────────────────
function RoboticsTab() {
  const d = useRefresh<rob.RoboticsDashboard|null>(()=>rob.roboticsApi.dashboard(), 8_000);
  const rs = useRefresh<rob.Robot[]>(()=>rob.roboticsApi.list(), 10_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [name,setName] = useState(""); const [site,setSite] = useState(""); const [kind,setKind] = useState<rob.Robot["kind"]>("warehouse_amr");
  const cmd = async (id:string, action:any) => { try { await rob.roboticsApi.command(id,action); rs.refresh(); d.refresh(); } catch(e:any){setMsg(e.message);} };
  const create = async () => { if(!name||!site) return; try { await rob.roboticsApi.create({name,site,kind}); setName(""); setSite(""); rs.refresh(); d.refresh(); } catch(e:any){setMsg(e.message);} };
  const scan = async () => { try { await rob.roboticsApi.predictiveScan(); d.refresh(); setMsg("scan complete"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <BotIcon className="h-5 w-5 text-crimson"/><div className="flex-1"><div className="font-semibold">Robotics & Physical Automation</div>
      <div className="text-xs text-text-muted">Industrial/warehouse/delivery/security/agri/health robots, autonomous vehicles, drones, smart buildings, IoT/PLC/SCADA, edge AI, predictive maintenance, fleet monitoring.</div></div>
      <Button size="sm" variant="outline" onClick={scan}><Activity className="h-3 w-3 mr-1"/>Predictive Scan</Button>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Robots" value={data.totalRobots} tone="violet"/>
      <Stat label="Active" value={data.active} tone="emerald"/>
      <Stat label="Idle" value={data.idle} tone="slate"/>
      <Stat label="Errors" value={data.error} tone={data.error?"crimson":"emerald"}/>
      <Stat label="Maintenance" value={data.maintenance} tone="amber"/>
      <Stat label="Offline" value={data.offline} tone="crimson"/>
      <Stat label="Sites" value={data.sites} tone="azure"/>
      <Stat label="Tasks Today" value={data.tasksCompletedToday} tone="teal"/>
      <Stat label="Avg Battery" value={data.avgBatteryPct == null ? "—" : `${data.avgBatteryPct}%`} tone="emerald"/>
      <Stat label="Avg CPU" value={data.avgCpuPct == null ? "—" : `${data.avgCpuPct}%`} tone="amber"/>
      <Stat label="Predictive Alerts" value={data.predictiveAlerts} tone={data.predictiveAlerts?"amber":"emerald"}/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Add Robot / Device</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
        <Input placeholder="Site" value={site} onChange={e=>setSite(e.target.value)}/>
        <select value={kind} onChange={e=>setKind(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {(["industrial_arm","warehouse_amr","manufacturing_cell","delivery_bot","security_patrol","agricultural","healthcare","autonomous_vehicle","drone","smart_building","iot_gateway","plc","scada","edge_controller"] as rob.Robot["kind"][]).map(k=><option key={k} value={k}>{k.replace(/_/g," ")}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={create}><Plus className="h-3 w-3 mr-1"/>Provision</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">By Kind</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-1 text-xs">
        {data.byKind.map(b=>(<div key={b.kind} className="flex justify-between p-1.5 border border-white/5 rounded"><span>{b.kind.replace(/_/g," ")}</span><span className="font-mono">{b.count}</span></div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Predictive Maintenance Alerts</CardTitle></CardHeader>
    <CardContent className="space-y-1 text-xs">
      {data.alerts.map(a=>(<div key={a.id} className="flex items-center gap-2 p-1.5 border border-white/5 rounded">
        <AlertTriangle className={cn("h-3.5 w-3.5", a.riskPct>80?"text-crimson":"text-amber")}/>
        <span className="font-mono text-text-muted">{a.robotId.slice(0,10)}…</span><span className="flex-1">{a.component} — {a.recommendation}</span>
        <Badge variant={a.riskPct>80?"crimson":"amber"}>risk {a.riskPct}%</Badge>
      </div>))}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm">Fleet</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(rs.data||[]).map(r=>(<div key={r.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("h-2 w-2 rounded-full", r.status==="active"?"bg-emerald":r.status==="error"?"bg-crimson":r.status==="maintenance"?"bg-amber":"bg-slate")}/>
          <span className="font-semibold flex-1">{r.name}</span>
          <Badge variant="violet">{r.kind.replace(/_/g," ")}</Badge>
          <Badge variant="slate">{r.site}</Badge>
          <Badge variant={r.status==="active"?"emerald":r.status==="error"?"crimson":r.status==="maintenance"?"amber":"slate"}>{r.status}</Badge>
          {r.batteryPct!=null && <Badge variant="teal">bat {r.batteryPct}%</Badge>}
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={()=>cmd(r.id,"start")}><Play className="h-3 w-3"/></Button>
            <Button size="sm" variant="outline" onClick={()=>cmd(r.id,"pause")}><Pause className="h-3 w-3"/></Button>
            <Button size="sm" variant="outline" onClick={()=>cmd(r.id,"stop")}><StopCircle className="h-3 w-3"/></Button>
            <Button size="sm" variant="warning" onClick={()=>cmd(r.id,"maintenance")}><Wrench className="h-3 w-3"/></Button>
          </div>
        </div>
        <div className="text-text-muted mt-1 flex gap-3">cpu {r.cpuPct}% · mem {r.memPct}% · tasks {r.tasksCompleted} · errors {r.errorsToday} · fw {r.firmwareVersion}</div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 58: Spatial Computing ───────────────────────────────────
function SpatialTab() {
  const d = useRefresh<spa.SpatialDashboard|null>(()=>spa.spatialApi.dashboard(), 8_000);
  const ses = useRefresh<spa.SpatialSession[]>(()=>spa.spatialApi.listSessions(), 10_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [title,setTitle] = useState(""); const [mode,setMode] = useState<spa.SpatialMode>("ar"); const [device,setDevice] = useState<spa.SpatialSession["deviceTarget"]>("vision_pro");
  const create = async () => { if(!title) return; try { await spa.spatialApi.createSession({title,mode,deviceTarget:device}); setTitle(""); ses.refresh(); d.refresh(); setMsg("session launched"); } catch(e:any){setMsg(e.message);} };
  const end = async (id:string) => { try { await spa.spatialApi.endSession(id); ses.refresh(); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Box className="h-5 w-5 text-fuchsia"/><div className="flex-1"><div className="font-semibold">Spatial Computing (AR/VR/MR/XR)</div>
      <div className="text-xs text-text-muted">Holographic dashboards, indoor navigation, smart glasses, remote expert AR, VisionOS/HoloLens/Quest, spatial workflow automation. Synced with digital twins & mission control.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Active Sessions" value={data.activeSessions} tone="fuchsia"/>
      <Stat label="Total Sessions" value={data.totalSessions} tone="violet"/>
      <Stat label="Devices Online" value={data.devicesOnline} tone="azure"/>
      <Stat label="Holo Dashboards" value={data.holoDashboards} tone="teal"/>
      <Stat label="Indoor Maps" value={data.indoorMaps} tone="amber"/>
      <Stat label="Waypoints" value={data.waypoints} tone="emerald"/>
      <Stat label="Twins Visualized" value={data.twinsVisualized} tone="fuchsia"/>
      <Stat label="Remote Sessions Today" value={data.remoteSessionsToday} tone="crimson"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Launch Session</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Session title" value={title} onChange={e=>setTitle(e.target.value)}/>
        <select value={mode} onChange={e=>setMode(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {(["ar","vr","mr","xr"] as spa.SpatialMode[]).map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select>
        <select value={device} onChange={e=>setDevice(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {(["vision_pro","hololens","quest","desktop","mobile","smart_glasses"] as spa.SpatialSession["deviceTarget"][]).map(d=><option key={d} value={d}>{d.replace(/_/g," ")}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={create}><Play className="h-3 w-3 mr-1"/>Launch</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">By Mode</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-4 gap-2 text-xs">
        {data.byMode.map(b=>(<div key={b.mode} className="p-2 border border-white/5 rounded text-center">
          <div className="text-lg font-bold">{b.count}</div><div className="text-text-muted">{b.mode.toUpperCase()}</div>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Spatial Sessions</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(ses.data||[]).map(s=>(<div key={s.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("h-2 w-2 rounded-full", s.status==="streaming"?"bg-emerald":s.status==="recording"?"bg-fuchsia":"bg-slate")}/>
          <span className="font-semibold flex-1">{s.title}</span>
          <Badge variant="fuchsia">{s.mode.toUpperCase()}</Badge>
          <Badge variant="slate">{s.deviceTarget.replace(/_/g," ")}</Badge>
          <Badge variant={s.status==="streaming"?"emerald":s.status==="recording"?"fuchsia":"slate"}>{s.status}</Badge>
          <span className="text-text-muted">{s.participants.length} participants</span>
          {s.status!=="idle" && <Button size="sm" variant="outline" onClick={()=>end(s.id)}>End</Button>}
        </div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 59: Enterprise SDK ──────────────────────────────────────
function SdkTab() {
  const d = useRefresh<sdk.SdkDashboard|null>(()=>sdk.sdkApi.dashboard(), 10_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [emuName,setEmuName] = useState("my-agent-emu"); const [emuKind,setEmuKind] = useState<sdk.SdkKind>("agent"); const [target,setTarget] = useState("agent:support-1");
  const startEmu = async () => { try { await sdk.sdkApi.startEmulator({name:emuName, sdkKind:emuKind}); d.refresh(); setMsg("emulator starting"); } catch(e:any){setMsg(e.message);} };
  const profile = async () => { try { await sdk.sdkApi.profile(target); d.refresh(); setMsg("profiling complete"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <TerminalIcon className="h-5 w-5 text-azure"/><div className="flex-1"><div className="font-semibold">Enterprise AI OS SDK</div>
      <div className="text-xs text-text-muted">SDKs, CLI, local emulator, debugger, profiler, code generators, templates, docs. Reuses the Fabric Package Manager.</div></div>
      <Badge variant="azure">CLI v{data.latestCliVersion}</Badge>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="SDK Packages" value={data.packages.length} tone="azure"/>
      <Stat label="Downloads" value={data.totalDownloads.toLocaleString()} tone="teal"/>
      <Stat label="Emulators" value={data.emulatorsRunning} tone="violet"/>
      <Stat label="Debug Sessions" value={data.debugSessionsActive} tone="fuchsia"/>
      <Stat label="Profile Runs (30d)" value={data.profileRuns30d} tone="amber"/>
      <Stat label="Docs Coverage" value={`${data.docsCoveragePct}%`} tone="emerald"/>
      <Stat label="CLI Commands" value={data.commands.length} tone="azure"/>
      <Stat label="Templates" value={data.templates.length} tone="slate"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">CLI Reference</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
        {data.commands.map(c=>(<div key={c.name} className="p-1 border-b border-white/5">
          <div><span className="text-azure">windels</span> <span className="text-emerald">{c.name}</span> <span className="text-text-muted">— {c.description}</span></div>
        </div>))}
      </CardContent></Card>
      <div className="space-y-3">
        <Card><CardHeader><CardTitle className="text-sm">Start Emulator</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Input placeholder="Name" value={emuName} onChange={e=>setEmuName(e.target.value)}/>
          <select value={emuKind} onChange={e=>setEmuKind(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
            {data.packages.map(p=><option key={p.id} value={p.kind}>{p.kind} — {p.name}</option>)}
          </select>
          <Button size="sm" variant="primary" onClick={startEmu}><Play className="h-3 w-3 mr-1"/>Start</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Profiler</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Input placeholder="Target id" value={target} onChange={e=>setTarget(e.target.value)}/>
          <Button size="sm" variant="outline" onClick={profile}><Activity className="h-3 w-3 mr-1"/>Run profile</Button>
        </CardContent></Card>
      </div>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Code Templates</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 gap-2 text-xs">
      {data.templates.map(t=>(<div key={t.id} className="p-2 border border-white/5 rounded">
        <div className="font-semibold flex items-center gap-1"><Code2 className="h-3 w-3 text-azure"/>{t.name}</div>
        <div className="text-text-muted">{t.description}</div>
        <div className="flex gap-2 mt-1 text-text-muted"><span>{t.language}</span><span>{t.fileCount} files</span><span>★ {t.stars}</span></div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 60: Training & Fine-Tuning ──────────────────────────────
function TrainingTab() {
  const d = useRefresh<trn.TrainingDashboard|null>(()=>trn.trainingApi.dashboard(), 8_000);
  const ds = useRefresh<trn.TrainingDataset[]>(()=>trn.trainingApi.listDatasets(), 10_000);
  const jobs = useRefresh<trn.TrainingJob[]>(()=>trn.trainingApi.listJobs(), 8_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [dsName,setDsName] = useState(""); const [dsFmt,setDsFmt] = useState<trn.DatasetFormat>("jsonl");
  const [jName,setJName] = useState(""); const [jBase,setJBase] = useState("Aria-7B"); const [jDs,setJDs] = useState(""); const [jStrat,setJStrat] = useState<trn.TuningStrategy>("lora"); const [jLr,setJLr] = useState("2e-4"); const [jEpochs,setJEpochs] = useState("2"); const [jBatch,setJBatch] = useState("16");
  const createDs = async () => { if(!dsName) return; try { await trn.trainingApi.createDataset({name:dsName,format:dsFmt,cleaned:false,ragbuilderIncluded:false}); setDsName(""); ds.refresh(); d.refresh(); setMsg("dataset created"); } catch(e:any){setMsg(e.message);} };
  const startJob = async () => { if(!jName||!jDs) return; try { await trn.trainingApi.startJob({name:jName,baseModel:jBase,datasetId:jDs,strategy:jStrat,hyperparams:{lr:parseFloat(jLr),epochs:parseInt(jEpochs),batchSize:parseInt(jBatch)}}); setJName(""); jobs.refresh(); d.refresh(); setMsg("job queued"); } catch(e:any){setMsg(e.message);} };
  const canary = async (id:string) => { try { await trn.trainingApi.promoteCanary(id,5); jobs.refresh(); d.refresh(); } catch(e:any){setMsg(e.message);} };
  const rollback = async (id:string) => { try { await trn.trainingApi.rollback(id); jobs.refresh(); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <GradIcon className="h-5 w-5 text-emerald"/><div className="flex-1"><div className="font-semibold">Training & Fine-Tuning Platform</div>
      <div className="text-xs text-text-muted">Datasets, synthetic data, RAG builder, LoRA/QLoRA/DPO/RLHF, benchmark evaluation, safety testing, governance approval, canary rollout, continuous learning.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Datasets" value={data.datasets} tone="azure"/>
      <Stat label="Jobs Running" value={data.jobsRunning} tone="violet"/>
      <Stat label="Jobs Queued" value={data.jobsQueued} tone="amber"/>
      <Stat label="Completed (30d)" value={data.jobsCompleted30d} tone="emerald"/>
      <Stat label="Failed (30d)" value={data.jobsFailed30d} tone={data.jobsFailed30d?"crimson":"emerald"}/>
      <Stat label="Safety Pass" value={`${(data.safetyChecksPassRate*100).toFixed(0)}%`} tone="emerald"/>
      <Stat label="Canary Deploys" value={data.canaryDeployments} tone="fuchsia"/>
      <Stat label="CL Pipelines" value={data.clPipelines} tone="teal"/>
      <Stat label="GPU Hours (30d)" value={data.gpuHoursUsed30d.toFixed(0)} tone="amber"/>
      <Stat label="Cost (30d)" value={`$${data.costUsd30d.toFixed(0)}`} tone="violet"/>
      <Stat label="Avg Eval" value={(data.avgEvalScore*100).toFixed(1)+"%"} tone="emerald"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Create Dataset</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Name" value={dsName} onChange={e=>setDsName(e.target.value)}/>
        <select value={dsFmt} onChange={e=>setDsFmt(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {(["jsonl","csv","parquet","hf_dataset","custom"] as trn.DatasetFormat[]).map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={createDs}><Plus className="h-3 w-3 mr-1"/>Add</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">Launch Fine-Tuning Job</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Job name" value={jName} onChange={e=>setJName(e.target.value)}/>
          <Input placeholder="Base model" value={jBase} onChange={e=>setJBase(e.target.value)}/>
        </div>
        <select value={jDs} onChange={e=>setJDs(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          <option value="">-- dataset --</option>
          {(ds.data||[]).map(x=><option key={x.id} value={x.id}>{x.name} ({x.format})</option>)}
        </select>
        <select value={jStrat} onChange={e=>setJStrat(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {(["full","lora","qlora","dpo","rlhf","rag_only","prompt_only"] as trn.TuningStrategy[]).map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="lr" value={jLr} onChange={e=>setJLr(e.target.value)}/>
          <Input placeholder="epochs" value={jEpochs} onChange={e=>setJEpochs(e.target.value)}/>
          <Input placeholder="batch" value={jBatch} onChange={e=>setJBatch(e.target.value)}/>
        </div>
        <Button size="sm" variant="primary" onClick={startJob}><Play className="h-3 w-3 mr-1"/>Start Training</Button>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Recent Jobs</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(jobs.data||[]).slice(0,12).map(j=>(<div key={j.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold flex-1">{j.name}</span>
          <Badge variant="azure">{j.strategy}</Badge>
          <Badge variant="slate">{j.baseModel}</Badge>
          <Badge variant={j.status==="deployed"?"emerald":j.status==="failed"||j.status==="rolled_back"?"crimson":j.status==="canary"?"fuchsia":"amber"}>{j.status}</Badge>
          {j.safetyPassed===false && <Badge variant="crimson">safety fail</Badge>}
          {j.evalScore!=null && <span className="text-emerald">eval {(j.evalScore*100).toFixed(1)}%</span>}
          <span className="text-text-muted">{j.gpuHours}h · ${j.costEstimateUsd.toFixed(0)}</span>
          {["governance_review","evaluating"].includes(j.status) && <Button size="sm" variant="outline" onClick={()=>canary(j.id)}>Promote canary</Button>}
          {["canary","deployed"].includes(j.status) && <Button size="sm" variant="danger" onClick={()=>rollback(j.id)}>Rollback</Button>}
        </div>
        {j.status!=="deployed" && j.status!=="failed" && j.status!=="rolled_back" && j.status!=="queued" && (<div className="h-1.5 bg-white/5 rounded mt-1 overflow-hidden"><div className="h-full bg-emerald" style={{width:`${j.progressPct}%`}}/></div>)}
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 61: Data & Knowledge Marketplace ────────────────────────
function DataMarketplaceTab() {
  const d = useRefresh<dm.MarketplaceAsset extends any ? any : any>(()=>dm.dmApi.dashboard(), 8_000);
  const assets = useRefresh<any[]>(()=>dm.dmApi.list(), 10_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [name,setName] = useState(""); const [kind,setKind] = useState("dataset"); const [desc,setDesc] = useState(""); const [lic,setLic] = useState("mit");
  const publish = async () => { if(!name||!desc) return; try { await dm.dmApi.publish({name,kind:kind as any,description:desc,licenseModel:lic as any}); setName("");setDesc(""); assets.refresh(); d.refresh(); setMsg("asset published"); } catch(e:any){setMsg(e.message);} };
  const install = async (id:string) => { try { await dm.dmApi.install(id); d.refresh(); setMsg("installed"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <ShoppingBag className="h-5 w-5 text-fuchsia"/><div className="flex-1"><div className="font-semibold">Data & Knowledge Marketplace</div>
      <div className="text-xs text-text-muted">Datasets, models, knowledge packs, agents, skills, workflows, connectors, templates — with licensing, reviews, installs, and revenue tracking.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Total Assets" value={data.totalAssets} tone="fuchsia"/>
      <Stat label="Published" value={data.published} tone="emerald"/>
      <Stat label="Installs" value={data.installsTotal} tone="azure"/>
      <Stat label="Revenue (30d)" value={`$${(data.revenue30dUsd||0).toFixed(0)}`} tone="amber"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Publish Asset</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
        <Input placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)}/>
        <select value={kind} onChange={e=>setKind(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["dataset","model","knowledge_pack","agent","skill","workflow","connector","template","plugin","extension"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        <select value={lic} onChange={e=>setLic(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["mit","apache2","proprietary","commercial","open_core","cc_by","cc_by_nc","dual"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={publish}><Plus className="h-3 w-3 mr-1"/>Publish</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">By Kind</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {Object.entries(data.byKind||{}).map(([k,v]:any)=>(<div key={k} className="p-2 border border-white/5 rounded flex justify-between"><span className="text-text-muted">{k}</span><span className="font-semibold">{v}</span></div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Top Assets</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.topAssets||[]).slice(0,10).map((a:any)=>(<div key={a.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <ShoppingBag className="h-3 w-3 text-fuchsia"/>
        <span className="font-semibold flex-1">{a.name}</span>
        <Badge variant="slate">{a.kind}</Badge>
        <Badge variant="azure">{a.licenseModel}</Badge>
        <span className="text-text-muted">★{(a.ratingAvg||0).toFixed(1)}</span>
        <span className="text-text-muted">{a.installs||0} installs</span>
        <Button size="sm" variant="outline" onClick={()=>install(a.id)}>Install</Button>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 62: Digital Humans ──────────────────────────────────────
function DigitalHumansTab() {
  const d = useRefresh<any>(()=>dh.dhApi.dashboard(), 8_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [name,setName] = useState(""); const [role,setRole] = useState("assistant"); const [gender,setGender] = useState("feminine"); const [style,setStyle] = useState("professional");
  const create = async () => { if(!name) return; try { await dh.dhApi.create({name,role:role as any,gender:gender as any,style:style as any}); setName(""); d.refresh(); setMsg("avatar created"); } catch(e:any){setMsg(e.message);} };
  const startSess = async (id:string) => { try { const s = await dh.dhApi.startSession(id); setMsg(`session started: ${s.id}`); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <UserCircle className="h-5 w-5 text-violet"/><div className="flex-1"><div className="font-semibold">Digital Human Platform</div>
      <div className="text-xs text-text-muted">Photorealistic avatars, voice cloning, emotional intelligence, multilingual sessions, training simulations, customer service, healthcare coaching.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Total Avatars" value={data.total} tone="violet"/>
      <Stat label="Ready" value={data.ready} tone="emerald"/>
      <Stat label="Live Sessions" value={data.live} tone="azure"/>
      <Stat label="In Training" value={data.training} tone="amber"/>
      <Stat label="Satisfaction" value={`${(data.avgSatisfactionPct||0).toFixed(0)}%`} tone="emerald"/>
      <Stat label="Languages" value={data.languagesSupported} tone="fuchsia"/>
      <Stat label="Active Sessions" value={data.activeSessions} tone="crimson"/>
      <Stat label="Total Sessions" value={data.totalSessions} tone="teal"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Create Avatar</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
        <select value={role} onChange={e=>setRole(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["assistant","receptionist","coach","tutor","sales","support","interviewer","therapist","presenter","guide"].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <select value={gender} onChange={e=>setGender(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["feminine","masculine","nonbinary","androgynous"].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <select value={style} onChange={e=>setStyle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["professional","casual","warm","formal","empathetic","playful","authoritative"].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <Button size="sm" variant="primary" onClick={create}><Plus className="h-3 w-3 mr-1"/>Create</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">By Role</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {Object.entries(data.byRole||{}).map(([k,v]:any)=>(<div key={k} className="p-2 border border-white/5 rounded flex justify-between"><span className="text-text-muted">{k}</span><span className="font-semibold">{v}</span></div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Recent Avatars</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.recent||[]).slice(0,8).map((h:any)=>(<div key={h.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <UserCircle className="h-4 w-4 text-violet"/>
        <span className="font-semibold flex-1">{h.name}</span>
        <Badge variant="violet">{h.role}</Badge>
        <Badge variant="slate">{h.style}</Badge>
        <Badge variant={h.status==="ready"?"emerald":h.status==="live"?"azure":"amber"}>{h.status}</Badge>
        <span className="text-text-muted">{h.languages?.length||0} langs</span>
        <Button size="sm" variant="outline" onClick={()=>startSess(h.id)}><Play className="h-3 w-3 mr-1"/>Session</Button>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 63: Quantum Readiness ───────────────────────────────────
function QuantumTab() {
  const d = useRefresh<any>(()=>q.qApi.dashboard(), 10_000);
  const jobs = useRefresh<any[]>(()=>q.qApi.jobs(), 10_000);
  const conns = useRefresh<any[]>(()=>q.qApi.connectors(), 15_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [kind,setKind] = useState<"qaoa"|"vqe"|"annealer"|"hybrid_solver">("hybrid_solver"); const [problem,setProblem] = useState<"portfolio"|"routing"|"scheduling"|"chemistry"|"supply_chain"|string>("portfolio"); const [vendor,setVendor] = useState("ibm");
  const submit = async () => { if(!problem) return; try { await q.qApi.submitJob({kind,problem:problem as "portfolio"|"routing"|"scheduling"|"chemistry"|"supply_chain",vendor:vendor as any}); setProblem(""); jobs.refresh(); d.refresh(); setMsg("job submitted"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Atom className="h-5 w-5 text-azure"/><div className="flex-1"><div className="font-semibold">Quantum Readiness Framework</div>
      <div className="text-xs text-text-muted">Post-quantum crypto inventory, PQ algorithm migration tracking, vendor connectors (IBM/AWS/Azure/Google/D-Wave), hybrid quantum-classical job submission.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Readiness" value={data.readiness} tone="azure"/>
      <Stat label="Crypto Systems" value={data.cryptoInventory} tone="violet"/>
      <Stat label="Vulnerable" value={data.vulnerableCount} tone="crimson"/>
      <Stat label="Migrated" value={data.migrationPct == null ? "—" : `${data.migrationPct}%`} tone="emerald"/>
      <Stat label="Hybrid Jobs" value={data.hybridJobs} tone="fuchsia"/>
      <Stat label="Completed 30d" value={data.completedJobs30d} tone="teal"/>
      <Stat label="PQ Algorithms" value={(data.pqAlgorithmsSupported||[]).length} tone="amber"/>
      <Stat label="Connectors" value={(data.connectors||[]).length} tone="azure"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Submit Hybrid Job</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <select value={kind} onChange={e=>setKind(e.target.value as "qaoa"|"vqe"|"annealer"|"hybrid_solver")} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["qaoa","vqe","annealer","hybrid_solver"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        <select value={vendor} onChange={e=>setVendor(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["ibm","aws","azure","google","dwave","local"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        <Input placeholder="Problem description" value={problem} onChange={e=>setProblem(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={submit}><Play className="h-3 w-3 mr-1"/>Submit</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">PQ Algorithms Supported</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-xs">
        {(data.pqAlgorithmsSupported||[]).map((a:any)=>(<div key={a.name||a} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <ShieldCheck className="h-3 w-3 text-emerald"/><span>{a.name||a}</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Recent Jobs</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.recentJobs||(jobs.data||[])).slice(0,8).map((j:any)=>(<div key={j.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Atom className="h-3 w-3 text-azure"/><span className="font-semibold flex-1">{j.problem}</span>
        <Badge variant="slate">{j.kind}</Badge>
        <Badge variant="azure">{j.vendor}</Badge>
        <Badge variant={j.status==="completed"?"emerald":j.status==="failed"?"crimson":"amber"}>{j.status}</Badge>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 64: Sustainability & ESG ────────────────────────────────
function SustainabilityTab() {
  const d = useRefresh<any>(()=>esg.esgApi.dashboard(), 15_000);
  const data = d.data;
  if (!data) return <div/>;
  const s = data.scores||{};
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Leaf className="h-5 w-5 text-emerald"/><div className="flex-1"><div className="font-semibold">Sustainability & ESG Intelligence</div>
      <div className="text-xs text-text-muted">Emissions scopes 1/2/3, energy mix (renewables), water/waste metrics, supply-chain ESG, green AI workloads, reporting frameworks, net-zero roadmap.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Env Score" value={`${s.environmental||0}/100`} tone="emerald"/>
      <Stat label="Social Score" value={`${s.social||0}/100`} tone="azure"/>
      <Stat label="Governance" value={`${s.governance||0}/100`} tone="violet"/>
      <Stat label="Overall ESG" value={`${s.overall||0}/100`} tone="amber"/>
      <Stat label="Emissions (tCO2e)" value={(data.emissionsTotalTCO2e||0).toFixed(0)} tone="crimson"/>
      <Stat label="YTD Change" value={`${(data.emissionsYtdChangePct||0).toFixed(1)}%`} tone={data.emissionsYtdChangePct<0?"emerald":"crimson"}/>
      <Stat label="Renewables" value={`${(data.energyRenewablePct||0).toFixed(0)}%`} tone="emerald"/>
      <Stat label="Recycled" value={`${(data.wasteRecycledPct||0).toFixed(0)}%`} tone="teal"/>
      <Stat label="Net-Zero Target" value={data.netZeroTargetYear} tone="violet"/>
      <Stat label="Offsets (t)" value={data.offsetsPurchasedT} tone="azure"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Emissions by Source</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.emissionsBySource||[]).map((e:any)=>(<div key={e.id||e.name} className="flex items-center gap-2">
          <span className="w-32 text-text-muted">{e.name}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-emerald" style={{width:`${Math.min(100,(e.tCO2e/(data.emissionsTotalTCO2e||1))*100)}%`}}/></div>
          <span className="font-mono w-16 text-right">{(e.tCO2e||0).toFixed(1)} t</span>
          <Badge variant="slate">scope {e.scope}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Energy (12 mo)</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.energySeries||[]).map((e:any,i:number)=>(<div key={i} className="flex items-center gap-2">
          <span className="w-12 text-text-muted">{e.month}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-azure" style={{width:`${(e.kWh/1000)}%`}}/></div>
          <span className="font-mono w-16 text-right">{(e.kWh||0).toFixed(0)} kWh</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Green AI Workloads</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 gap-2 text-xs">
      {(data.greenAi||[]).map((g:any,i:number)=>(<div key={i} className="p-2 border border-white/5 rounded">
        <div className="font-semibold flex items-center gap-1"><Leaf className="h-3 w-3 text-emerald"/>{g.workload}</div>
        <div className="text-text-muted">CO₂ saved {g.co2SavedKg||0}kg · efficiency +{(g.efficiencyGainPct||0).toFixed(0)}%</div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 65: Biomedical & Healthcare ─────────────────────────────
function BiomedicalTab() {
  const d = useRefresh<any>(()=>bio.bioApi.dashboard(), 8_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [modality,setModality] = useState("xray"); const [bodyPart,setBodyPart] = useState("chest");
  const submit = async () => { try { await bio.bioApi.submitStudy({modality:modality as any,bodyPart}); setBodyPart(""); d.refresh(); setMsg("study submitted"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Stethoscope className="h-5 w-5 text-crimson"/><div className="flex-1"><div className="font-semibold">Biomedical & Healthcare Intelligence</div>
      <div className="text-xs text-text-muted">Multi-modal AI (imaging, EHR, genomics, pathology, telemetry, pharmacy) with HIPAA controls, hospital ops, telemedicine, and drug-safety alerts.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Studies (24h)" value={data.imaging?.studies24h||0} tone="crimson"/>
      <Stat label="AI-Assisted" value={data.imaging?.aiAssisted||0} tone="azure"/>
      <Stat label="Pending Review" value={data.imaging?.pendingReview||0} tone="amber"/>
      <Stat label="Avg TAT" value={`${(data.imaging?.avgTurnaroundMin||0).toFixed(0)}m`} tone="violet"/>
      <Stat label="Alerts 24h" value={data.alerts24h||0} tone="crimson"/>
      <Stat label="Telemetry" value={data.telemetryActive||0} tone="emerald"/>
      <Stat label="Pharmacy Alerts" value={(data.pharmacyAlerts||[]).length} tone="amber"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Submit Imaging Study</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <select value={modality} onChange={e=>setModality(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["xray","ct","mri","ultrasound","pathology","dermatology","ecg"].map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <Input placeholder="Body part" value={bodyPart} onChange={e=>setBodyPart(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={submit}><Play className="h-3 w-3 mr-1"/>Submit</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">Clinical Areas</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {Object.entries(data.areas||{}).map(([k,v]:any)=>(<div key={k} className="p-2 border border-white/5 rounded">
          <div className="flex justify-between items-center"><span className="font-semibold">{k}</span><Badge variant={v.enabled?"emerald":"slate"}>{v.enabled?"on":"off"}</Badge></div>
          <div className="text-text-muted">{v.models} models · {v.reviewed24h} reviewed · <span className={v.escalations24h?"text-crimson":"text-emerald"}>{v.escalations24h} esc</span></div>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Recent Studies</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {!(data.recentStudies||[]).length && (
        <div className="text-text-muted">
          No imaging studies recorded. Submitting a study queues it for reading —
          this platform performs no automated interpretation, so findings appear
          only once a configured inference provider or a radiologist records them.
        </div>
      )}
      {(data.recentStudies||[]).slice(0,8).map((s:any)=>(<div key={s.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Activity className="h-3 w-3 text-crimson"/><span className="font-semibold flex-1">{s.modality} · {s.bodyPart}</span>
        {s.radiologistReviewed && <Badge variant="emerald">radiologist read</Badge>}
        <Badge variant={s.status==="signed_off"?"emerald":s.status==="escalated"?"crimson":"amber"}>{s.status}</Badge>
        <span className="text-text-muted">
          {(s.aiFindings||[]).length ? `${s.aiFindings.length} finding${s.aiFindings.length===1?"":"s"}` : "awaiting read"}
        </span>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 66: Legal Intelligence ──────────────────────────────────
function LegalTab() {
  const d = useRefresh<any>(()=>leg.legalApi.dashboard(), 10_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [query,setQuery] = useState("");
  const research = async () => { if(!query) return; try { const r = await leg.legalApi.research(query); setMsg(`research returned: ${r.summary?.slice(0,80)||r.id}`); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Gavel className="h-5 w-5 text-slate-300"/><div className="flex-1"><div className="font-semibold">Legal Intelligence Suite</div>
      <div className="text-xs text-text-muted">Matter management, CLM/contract lifecycle, regulatory updates, legal research, compliance checks (GDPR/CCPA/HIPAA/SOC2/PCI/SOX), risk scoring.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Open Matters" value={data.mattersOpen} tone="azure"/>
      <Stat label="At-Risk" value={data.mattersAtRisk} tone="crimson"/>
      <Stat label="Contracts" value={data.contractsActive} tone="violet"/>
      <Stat label="Expiring 90d" value={data.contractsExpiring90d} tone="amber"/>
      <Stat label="Reg Updates 7d" value={data.regulatoryUpdates7d} tone="fuchsia"/>
      <Stat label="Compliance" value={data.compliancePassRate == null ? "—" : `${Math.round(data.compliancePassRate * 100)}%`} tone="emerald"/>
      <Stat label="Avg Risk" value={data.riskAvg == null ? "—" : data.riskAvg} tone={data.riskAvg != null && data.riskAvg > 50 ? "crimson" : "emerald"}/>
      <Stat label="Open Research" value={data.openResearchTasks} tone="teal"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Legal Research</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Query" value={query} onChange={e=>setQuery(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={research}><FileSearch className="h-3 w-3 mr-1"/>Research</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Top Risks</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.topRisks||[]).map((r:any,i:number)=>(<div key={i} className="flex items-center gap-2">
          <AlertTriangle className={`h-3 w-3 ${r.score>70?"text-crimson":r.score>40?"text-amber":"text-emerald"}`}/>
          <span className="flex-1">{r.topic}</span><span className="font-mono">{r.score}</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Recent Matters</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.recentMatters||[]).slice(0,8).map((m:any)=>(<div key={m.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Gavel className="h-3 w-3 text-slate-300"/><span className="font-semibold flex-1">{m.title}</span>
        <Badge variant="slate">{m.area}</Badge>
        <Badge variant={m.status==="closed"?"emerald":m.status==="at_risk"?"crimson":"azure"}>{m.status}</Badge>
        {m.riskScore!=null && <span className="text-text-muted">risk {m.riskScore}</span>}
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 67: Education & Learning ────────────────────────────────
function EducationTab() {
  const d = useRefresh<any>(()=>edu.eduApi.dashboard(), 8_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [topic,setTopic] = useState(""); const [pathTitle,setPathTitle] = useState(""); const [pathGoal,setPathGoal] = useState("");
  const startT = async () => { if(!topic) return; try { await edu.eduApi.startTutor(topic); setTopic(""); d.refresh(); setMsg("tutor started"); } catch(e:any){setMsg(e.message);} };
  const mkPath = async () => { if(!pathTitle||!pathGoal) return; try { await edu.eduApi.createPath({title:pathTitle,goal:pathGoal,contentIds:[]}); setPathTitle("");setPathGoal(""); d.refresh(); setMsg("path created"); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <School className="h-5 w-5 text-amber"/><div className="flex-1"><div className="font-semibold">Education & Learning Platform</div>
      <div className="text-xs text-text-muted">Courses/lessons/quizzes/paths/cert-prep/projects, AI tutor sessions, skills inventory, learning paths, assessments, mastery tracking, certifications.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Content" value={data.totalContent} tone="amber"/>
      <Stat label="Published" value={data.publishedContent} tone="emerald"/>
      <Stat label="Active Learners" value={data.activeLearners} tone="azure"/>
      <Stat label="Completions 30d" value={data.completions30d} tone="violet"/>
      <Stat label="Mastery" value={data.avgMasteryPct == null ? "—" : `${data.avgMasteryPct.toFixed(0)}%`} tone="emerald"/>
      <Stat label="Certs Issued" value={data.certificationsIssued} tone="fuchsia"/>
      <Stat label="Hours Learned" value={data.hoursLearned30d ?? 0} tone="teal"/>
      <Stat label="Active Tutors" value={data.activeTutorSessions} tone="crimson"/>
      <Stat label="Paths in Progress" value={data.pathsInProgress} tone="azure"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Start Tutor Session</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Topic" value={topic} onChange={e=>setTopic(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={startT}><Play className="h-3 w-3 mr-1"/>Start</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Create Learning Path</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Input placeholder="Title" value={pathTitle} onChange={e=>setPathTitle(e.target.value)}/>
        <Input placeholder="Goal" value={pathGoal} onChange={e=>setPathGoal(e.target.value)}/>
        <Button size="sm" variant="primary" onClick={mkPath}><Plus className="h-3 w-3 mr-1"/>Create</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Skill Categories</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.skillCategories||[]).slice(0,8).map((s:any,i:number)=>(<div key={i} className="flex items-center gap-2">
          <span className="flex-1 text-text-muted">{s.category}</span>
          <span className="font-mono">L{s.avgLevel}</span>
          <span className="text-text-muted">{s.count}</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Popular Content</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-2 gap-2 text-xs">
      {(data.popularContent||[]).slice(0,8).map((c:any)=>(<div key={c.id} className="p-2 border border-white/5 rounded">
        <div className="font-semibold flex items-center gap-1"><BookOpen className="h-3 w-3 text-amber"/>{c.title}</div>
        <div className="flex gap-2 text-text-muted"><Badge variant="slate">{c.kind}</Badge><span>{c.rating == null ? "unrated" : `★${c.rating.toFixed(1)}`}</span><span>{c.enrollments||0} enrolled</span></div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 68: Scientific Research ─────────────────────────────────
function ScientificTab() {
  const d = useRefresh<any>(()=>sci.sciApi.dashboard(), 10_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <FlaskConical className="h-5 w-5 text-teal"/><div className="flex-1"><div className="font-semibold">Scientific Research Platform</div>
      <div className="text-xs text-text-muted">Literature review, citation analysis, experiment planning, research knowledge graph, hypothesis generation, scientific simulations, publication assistance, cross-institutional collaboration.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Papers Indexed" value={data.papersIndexed} tone="teal"/>
      <Stat label="Active Experiments" value={data.experimentsActive} tone="azure"/>
      <Stat label="Hypotheses" value={data.hypothesesActive} tone="violet"/>
      <Stat label="Publications" value={data.publicationsInProgress} tone="amber"/>
      <Stat label="Simulations (30d)" value={data.simulationsRun30d == null ? "—" : data.simulationsRun30d} tone="fuchsia"/>
      <Stat label="Collaborators" value={data.collaborators == null ? "—" : data.collaborators} tone="emerald"/>
      <Stat label="KG Nodes" value={data.knowledgeGraphNodes == null ? "—" : data.knowledgeGraphNodes} tone="teal"/>
      <Stat label="KG Edges" value={data.knowledgeGraphEdges == null ? "—" : data.knowledgeGraphEdges} tone="crimson"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Recent Experiments</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.recentExperiments||[]).slice(0,6).map((e:any)=>(<div key={e.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><FlaskConical className="h-3 w-3 text-teal"/><span className="font-semibold flex-1">{e.title}</span><Badge variant="slate">{e.domain}</Badge><Badge variant={e.status==="completed"?"emerald":e.status==="failed"?"crimson":"azure"}>{e.status}</Badge></div>
          <div className="text-text-muted mt-1">{e.hypothesis}</div>
          <div className="h-1.5 bg-white/5 rounded mt-1 overflow-hidden"><div className="h-full bg-teal" style={{width:`${e.progressPct}%`}}/></div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Recent Literature</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.recentPapers||[]).slice(0,6).map((p:any)=>(<div key={p.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><BookOpen className="h-3 w-3 text-azure"/><span className="font-semibold flex-1">{p.title}</span><Badge variant="slate">{p.year}</Badge></div>
          <div className="text-text-muted">{p.authors.join(", ")} · <i>{p.venue}</i> · {p.citations == null ? "citations unrecorded" : `${p.citations} citations`}</div>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Active Hypotheses</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.recentHypotheses||[]).map((h:any)=>(<div key={h.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Target className="h-3 w-3 text-violet"/><span className="flex-1">{h.statement}</span>
        <Badge variant="slate">{h.domain}</Badge>
        <span className="text-text-muted">{h.confidence == null ? "unassessed" : `conf ${(h.confidence*100).toFixed(0)}%`}</span>
        <Badge variant={h.status==="supported"?"emerald":h.status==="refuted"?"crimson":"azure"}>{h.status}</Badge>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 69: Cognitive Evolution & World Intelligence (V9.0) ─────
function CognitiveTab() {
  const d = useRefresh<any>(()=>cog.cogApi.dashboard(), 10_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Brain className="h-5 w-5 text-violet"/><div className="flex-1"><div className="font-semibold">Cognitive Evolution & World Intelligence (V9.0)</div>
      <div className="text-xs text-text-muted">Self-evolution, AI DNA framework, unified marketplace network, federation, observatory, universal reasoning engine, autonomous research, global memory, innovation, AI civilization, world model.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Self-Evolution Health" value={`${data.selfEvolutionHealth}%`} tone="emerald"/>
      <Stat label="Auto-Fixes (30d)" value={data.autoFixes30d} tone="azure"/>
      <Stat label="Bottlenecks" value={data.activeBottlenecks} tone="crimson"/>
      <Stat label="DNA Complete" value={`${data.dnaCompleteness}%`} tone="violet"/>
      <Stat label="Marketplace Assets" value={data.marketplaceUnifiedAssets} tone="fuchsia"/>
      <Stat label="Federation Partners" value={data.federationPartners} tone="teal"/>
      <Stat label="Observatory" value={`${data.observatoryHealthyPct}%`} tone="emerald"/>
      {/* Session 110: the service already returns whole percents (AI success
          rate over 30d). Multiplying by 100 again rendered e.g. 7500%. */}
      <Stat label="AI success rate (30d)" value={`${data.reasoningAccuracyAvg}%`} tone="azure"/>
      {/* Raw entry count — dividing by 1e6 and labelling it "M" implied
          millions of memories on an organization that has a handful. */}
      <Stat label="Memory + knowledge entries" value={data.globalMemoryEntries} tone="amber"/>
      <Stat label="Innovation Pipeline" value={`$${(data.innovationPipelineValueUsd/1e6).toFixed(1)}M`} tone="fuchsia"/>
      <Stat label="Civilization Entities" value={data.civilizationEntities} tone="violet"/>
      <Stat label="Prediction Acc" value={`${data.predictionAccuracyPct}%`} tone="emerald"/>
    </div>
    {/* Session 110 — the world-model evidence register behind /app/cognitive. */}
    <Card><CardHeader><CardTitle className="text-sm">World Model register (Session 110)</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-4 gap-3">
      <Stat label="Entities" value={data.worldModel?.entityCount ?? 0} tone="violet"/>
      <Stat label="Observations" value={data.worldModel?.observationCount ?? 0} tone="azure"/>
      <Stat label="Open hypotheses" value={data.worldModel?.openHypotheses ?? 0} tone="amber"/>
      <Stat label="Evidence coverage" value={`${data.worldModel?.evidenceCoveragePct ?? 0}%`} tone="emerald"/>
      <div className="md:col-span-4 text-xs text-text-muted">
        {data.worldModel?.note ?? "Counts are computed from stored records only."}
        {data.worldModel?.aiAssistedObservations ? ` ${data.worldModel.aiAssistedObservations} AI-assisted observation(s) are labelled advisory.` : ""}
      </div>
    </CardContent></Card>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Self-Evolution Components</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.components||[]).map((c:any)=>(<div key={c.component} className="flex items-center gap-2">
          <span className="w-28 text-text-muted">{c.component}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className={`h-full ${c.health>0.95?"bg-emerald":c.health>0.85?"bg-amber":"bg-crimson"}`} style={{width:`${c.health*100}%`}}/></div>
          <span className="font-mono w-10 text-right">{Math.round(c.health*100)}%</span>
          {c.bottleneck && <AlertTriangle className="h-3 w-3 text-crimson"/>}
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Reasoning Capabilities</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.reasoning||[]).map((r:any)=>(<div key={r.domain} className="flex items-center gap-2">
          <span className="w-28 text-text-muted">{r.domain}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-azure" style={{width:`${r.accuracy*100}%`}}/></div>
          <span className="font-mono w-10 text-right">{Math.round(r.accuracy*100)}%</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Innovation Pipeline</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.innovations||[]).map((p:any)=>(<div key={p.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-fuchsia"/><span className="flex-1 font-semibold">{p.title}</span>
        <Badge variant="slate">{p.category}</Badge>
        <Badge variant={p.risk==="high"?"crimson":p.risk==="med"?"amber":"emerald"}>{p.risk}</Badge>
        <span className="text-text-muted">${(p.projectedValueUsd/1000).toFixed(0)}k</span>
        <Badge variant={p.status==="approved"||p.status==="executing"?"emerald":p.status==="rejected"?"crimson":"azure"}>{p.status}</Badge>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 70: Global Command Center ───────────────────────────────
function CommandCenterTab() {
  const d = useRefresh<any>(()=>gcc.gccApi.dashboard(), 5_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Globe2Icon className="h-5 w-5 text-crimson"/><div className="flex-1"><div className="font-semibold">Global Command Center</div>
      <div className="text-xs text-text-muted">Executive operations center sitting on Mission Control & Observatory — global KPIs, regional health, incident command, briefings, strategic initiatives.</div></div>
    </CardContent></Card>
    {/* Session 111: these were rendered as `value/1000 + "K"`, so every real
        count under a thousand displayed as "0K". They are raw counts now, and
        MTTR shows "—" when no incident has been resolved to measure it from. */}
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Enterprise Health" value={`${data.enterpriseHealth}%`} tone={data.enterpriseHealth>90?"emerald":"amber"}/>
      <Stat label="Revenue MTD" value={data.globalRevenueMtd?`$${data.globalRevenueMtd.toLocaleString()}`:"not tracked"} tone="emerald"/>
      <Stat label="Active Users" value={data.activeUsersGlobal} tone="azure"/>
      <Stat label="Open Incidents" value={data.incidentsOpen} tone={data.incidentsCritical?"crimson":"amber"}/>
      <Stat label="Critical" value={data.incidentsCritical} tone="crimson"/>
      <Stat label="MTTR" value={data.operations?.mttrKind==="measured"?`${data.operations.meanTimeToResolveMinutes}m`:"—"} tone="teal"/>
      <Stat label="AI Requests (24h)" value={data.aiDecisions24h} tone="violet"/>
      <Stat label="Unacknowledged" value={data.operations?.unacknowledgedIncidents ?? 0} tone="amber"/>
    </div>
    {data.operations ? <Card><CardContent className="p-3 text-[11px] text-text-muted">{data.operations.note}</CardContent></Card> : null}
    <div className="grid md:grid-cols-3 gap-3">
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">Regional Status</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {(data.regions||[]).map((r:any)=>(<div key={r.region} className="p-2 border border-white/5 rounded">
          <div className="flex items-center justify-between"><span className="font-semibold">{r.region}</span>
            <Badge variant={r.health==="healthy"?"emerald":r.health==="degraded"?"amber":r.health==="unreported"?"slate":"crimson"}>{r.health}</Badge></div>
          {/* Unreported fields stay unreported — never rendered as 0. */}
          <div className="text-text-muted mt-1">{r.servicesUp===null?`${r.servicesTotal} svcs declared · never reported`:`${r.servicesUp}/${r.servicesTotal} svcs`}{r.latencyMs===null?"":` · ${r.latencyMs}ms`}{r.activeUsers===null?"":` · ${r.activeUsers} users`}</div>
        </div>))}
        {(data.regions||[]).length===0?<div className="text-text-muted">No regions declared.</div>:null}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Executive Briefings</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.briefings||[]).map((b:any)=>(<div key={b.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-1"><Bell className="h-3 w-3" style={{color:b.priority==="critical"?"#DC2626":b.priority==="high"?"#F59E0B":"#3B82F6"}}/><span className="font-semibold flex-1">{b.title}</span><Badge variant="slate">{b.category}</Badge></div>
          <div className="text-text-muted mt-1">{b.summary}</div>
        </div>))}
        {(data.briefings||[]).length===0?<div className="text-text-muted">No briefings published.</div>:null}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Active Incidents</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.incidents||[]).filter((i:any)=>i.status!=="resolved").map((i:any)=>(<div key={i.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Siren className={`h-3 w-3 ${i.severity==="critical"?"text-crimson":i.severity==="warning"?"text-amber":"text-azure"}`}/>
        <span className="flex-1 font-semibold">{i.title}</span>
        <Badge variant="slate">{i.service}</Badge><Badge variant="slate">{i.region}</Badge>
        <Badge variant={i.severity==="critical"?"crimson":i.severity==="warning"?"amber":"azure"}>{i.severity}</Badge>
        <Badge variant={i.status==="resolved"?"emerald":i.status==="mitigating"?"azure":i.status==="acknowledged"?"amber":"crimson"}>{i.status}</Badge>
      </div>))}
      {(data.incidents||[]).filter((i:any)=>i.status!=="resolved").length===0?<div className="text-text-muted">No unresolved incidents in the command register.</div>:null}
      <div className="text-text-muted pt-1">Full incident command, regional status reports, briefings, initiatives and directives live at <span className="font-semibold">/app/command</span>.</div>
    </CardContent></Card>
  </div>);
}

// ─── Session 71: AI Economy Platform ─────────────────────────────────
function AiEconomyTab() {
  const d = useRefresh<any>(()=>eco.ecoApi.dashboard(), 8_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Wallet className="h-5 w-5 text-emerald"/><div className="flex-1"><div className="font-semibold">AI Economy Platform</div>
      <div className="text-xs text-text-muted">AI credits, compute & GPU marketplace, internal billing, resource allocation, cost optimization, usage forecasting — shares primitives with Licensing & Monetization.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Credits Circulating" value={(data.creditsInCirculation/1e6).toFixed(1)+"M"} tone="fuchsia"/>
      <Stat label="Revenue (30d)" value={`$${(data.computeRevenue30d/1000).toFixed(0)}k`} tone="emerald"/>
      <Stat label="Cost (30d)" value={`$${(data.computeCost30d/1000).toFixed(0)}k`} tone="crimson"/>
      <Stat label="Margin" value={`${data.marginPct}%`} tone={data.marginPct>40?"emerald":"amber"}/>
      <Stat label="GPU Util" value={`${data.gpuUtilizationPct}%`} tone="azure"/>
      <Stat label="GPUs Avail" value={`${data.gpusAvailable}/${data.gpusTotal}`} tone="violet"/>
      <Stat label="Allocations" value={data.activeAllocations} tone="amber"/>
      <Stat label="Mkt Volume (30d)" value={`$${(data.marketplaceVolume30d/1000).toFixed(0)}k`} tone="teal"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">GPU Offers</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.offers||[]).map((o:any)=>(<div key={o.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <Cpu className="h-3 w-3 text-azure"/><span className="font-semibold w-16">{o.gpuType}</span>
          <Badge variant="slate">{o.provider}</Badge>
          <span className="text-text-muted">{o.vramGb}GB</span>
          <span className="flex-1 text-text-muted">{o.region}</span>
          <span className="font-mono">${o.pricePerHour.toFixed(2)}/h</span>
          <div className="w-20 h-2 bg-white/5 rounded overflow-hidden"><div className={`h-full ${o.utilizationPct>85?"bg-crimson":o.utilizationPct>60?"bg-amber":"bg-emerald"}`} style={{width:`${o.utilizationPct}%`}}/></div>
          <Badge variant={o.available?"emerald":"crimson"}>{o.available?"up":"full"}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Top Departments</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(data.topDepartments||[]).map((t:any)=>(<div key={t.department} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <Building2 className="h-3 w-3 text-violet"/><span className="w-24">{t.department}</span>
          <span className="flex-1 text-text-muted">${(t.spend/1000).toFixed(1)}k</span>
          <span className="font-mono">{t.credits.toLocaleString()} credits</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Active Allocations</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.allocations||[]).map((a:any)=>(<div key={a.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
        <Cpu className="h-3 w-3 text-emerald"/><span className="font-semibold flex-1">{a.gpuType} on {a.cluster}</span>
        <Badge variant="slate">{a.job}</Badge>
        <span className="text-text-muted">{a.vramUsedGb}GB VRAM</span>
        <div className="w-20 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-azure" style={{width:`${a.utilizationPct}%`}}/></div>
        <span className="font-mono">${a.costPerHour.toFixed(2)}/h</span>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 72: Autonomous Organization ─────────────────────────────
function AutonomousTab() {
  const d = useRefresh<any>(()=>aut.autApi.dashboard(), 10_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Crown className="h-5 w-5 text-amber"/><div className="flex-1"><div className="font-semibold">Autonomous Organization Framework</div>
      <div className="text-xs text-text-muted">AI Executive Board, autonomous departments, strategic/budget/procurement/workforce planning, constitution enforcement, human approval governance — all actions governed by safety, audit, and authorization policies.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Autonomy Index" value={`${data.autonomyIndex}%`} tone={data.autonomyIndex>70?"emerald":"amber"}/>
      <Stat label="Decisions Today" value={data.decisionsToday} tone="azure"/>
      <Stat label="Human Override" value={`${data.humanOverrideRatePct}%`} tone="amber"/>
      <Stat label="Governance" value={`${data.governanceCompliancePct}%`} tone="emerald"/>
      <Stat label="Departments" value={data.departmentsCount} tone="violet"/>
      <Stat label="AI Executives" value={data.aiExecutives} tone="fuchsia"/>
      <Stat label="Open Approvals" value={data.openApprovals} tone="crimson"/>
      <Stat label="Savings (30d)" value={`$${(data.autonomousSavings30dUsd/1000).toFixed(0)}k`} tone="emerald"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Departments</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.departments||[]).map((dp:any)=>(<div key={dp.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><Building2 className="h-3 w-3 text-violet"/><span className="font-semibold flex-1">{dp.name}</span>
            <Badge variant="slate">{dp.autonomyLevel}</Badge>
            <Badge variant={dp.health>90?"emerald":dp.health>75?"amber":"crimson"}>{dp.health}%</Badge></div>
          <div className="grid grid-cols-4 gap-2 text-text-muted mt-1">
            <span>HC {dp.headcount}</span><span>Agents {dp.aiAgents}</span><span>Pending {dp.decisionsPending}</span><span>30d {dp.decisionsExecuted30d}dcs</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded mt-1 overflow-hidden"><div className="h-full bg-amber" style={{width:`${(dp.spendYtdUsd/dp.budgetUsd)*100}%`}}/></div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Governance Guardrails</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.guardrails||[]).map((g:any)=>(<div key={g.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <ShieldLucide className="h-3 w-3 text-emerald"/><span className="flex-1">{g.policy}</span>
          {g.violations30d>0 && <Badge variant="crimson">{g.violations30d} violations</Badge>}
          <span className="text-text-muted">{g.blockedActions30d} blocked</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Executive Board Decisions</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.decisions||[]).map((dc:any)=>(<div key={dc.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2">
          <Crown className="h-3 w-3 text-amber"/><span className="flex-1 font-semibold">{dc.title}</span>
          <Badge variant="slate">{dc.department}</Badge>
          <Badge variant={dc.riskLevel==="high"?"crimson":dc.riskLevel==="med"?"amber":"emerald"}>{dc.riskLevel}</Badge>
          <span className="text-text-muted">${(dc.estimatedImpactUsd/1000).toFixed(0)}k impact</span>
          <Badge variant={dc.status==="approved"||dc.status==="executing"||dc.status==="executed"?"emerald":dc.status==="rejected"?"crimson":"amber"}>{dc.status}</Badge>
        </div>
        <div className="text-text-muted mt-1">{dc.recommendation}</div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 82: Cybersecurity Academy & Multi-Cloud Security ────────
function CyberTab() {
  const d = useRefresh<any>(()=>cyb.cybApi.dashboard(), 8_000);
  const data = d.data; const [msg,setMsg] = useState<string|null>(null);
  const [domain,setDomain] = useState("ethical_hacking"); const [diff,setDiff] = useState("intermediate"); const [cloud,setCloud] = useState("aws");
  const startLab = async () => { try { const lab = await cyb.cybApi.startLab({domain,difficulty:diff,cloud:cloud||undefined} as any); setMsg(`lab ${lab.name} registered (local state only)`); d.refresh(); } catch(e:any){setMsg(e.message);} };
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <ShieldLucide className="h-5 w-5 text-azure"/><div className="flex-1"><div className="font-semibold">Cybersecurity Academy, Ethical Hacking & Multi-Cloud Security</div>
      <div className="text-xs text-text-muted">Beginner→expert learning paths across 25+ domains, live cyber ranges/labs/CTFs, certifications (OSCP/CISSP/AWS-Security), multi-cloud security posture (AWS/Azure/GCP), red/blue/purple team ops, bug bounty program.</div></div>
    </CardContent></Card>
    {msg && <div className="text-xs text-text-muted">{msg}</div>}
    <div className="grid md:grid-cols-4 gap-3">
      {/* S161: learners is a real count for this org — never scaled to "0.0K". */}
      <Stat label="Learners" value={data.learners ?? "—"} tone="azure"/>
      <Stat label="Courses" value={data.coursesAvailable} tone="violet"/>
      <Stat label="Enrolled" value={data.coursesEnrolled} tone="fuchsia"/>
      <Stat label="Active Labs" value={data.labsActive} tone="crimson"/>
      <Stat label="Challenges Solved" value={data.challengesSolved} tone="emerald"/>
      <Stat label="Certs Held" value={data.certificationsHeld} tone="amber"/>
      {/* S161: there is no leaderboard — null renders as "—", never "#0". */}
      <Stat label="Leaderboard" value={data.leaderboardRank==null?"—":"#"+data.leaderboardRank} tone="azure"/>
      <Stat label="CTF Wins" value={data.ctfWins} tone="fuchsia"/>
      <Stat label="Total Points" value={data.totalPoints.toLocaleString()} tone="teal"/>
      <Stat label="Bug Bounties" value={`$${data.bugBountiesEarnedUsd.toLocaleString()}`} tone="emerald"/>
      <Stat label="Open Findings" value={data.cloudFindingsOpen} tone={data.cloudFindingsCritical?"crimson":"amber"}/>
      <Stat label="Remediated 30d" value={data.cloudFindingsRemediated30d} tone="emerald"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Launch Lab</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {/* S161: skillScores only lists scored domains, so the picker reads the
            course catalogue instead — otherwise a fresh org has no options. */}
        <select value={domain} onChange={e=>setDomain(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {Array.from(new Set((data.courses||[]).map((c:any)=>c.domain))).map((k:any)=><option key={k} value={k}>{k}</option>)}
        </select>
        <select value={diff} onChange={e=>setDiff(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          {["beginner","intermediate","advanced","expert"].map(l=><option key={l} value={l}>{l}</option>)}
        </select>
        <select value={cloud} onChange={e=>setCloud(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1">
          <option value="">local</option><option value="aws">aws</option><option value="azure">azure</option><option value="gcp">gcp</option><option value="multi">multi</option>
        </select>
        <Button size="sm" variant="primary" onClick={startLab}><Play className="h-3 w-3 mr-1"/>Provision</Button>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-sm">Active Cyber Ranges</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.ranges||[]).map((r:any)=>(<div key={r.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <ShieldLucide className="h-3 w-3 text-crimson"/><span className="font-semibold flex-1">{r.name}</span>
          <Badge variant="slate">{r.kind}</Badge>
          <Badge variant="slate">{r.cloudTargets.join(",")}</Badge>
          <Badge variant={r.status==="live"?"crimson":r.status==="scheduled"?"amber":"emerald"}>{r.status}</Badge>
          {r.score!=null && <span className="text-text-muted">{r.score}pts · rank #{r.rank}</span>}
        </div>))}
      </CardContent></Card>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Multi-Cloud Findings</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {/* S161: WINDELS scans no cloud account. An empty register says so
            rather than showing ten fabricated findings. */}
        {!(data.findings||[]).length && <div className="text-text-muted">No findings recorded. WINDELS does not scan your cloud accounts — post findings to <code>/cyber/findings</code>.</div>}
        {(data.findings||[]).map((f:any)=>(<div key={f.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <AlertTriangle className={`h-3 w-3 ${f.severity==="critical"?"text-crimson":f.severity==="high"?"text-amber":"text-text-muted"}`}/>
          <span className="font-semibold w-16">{f.cloud}/{f.service}</span>
          <span className="flex-1 text-text-muted">{f.rule}</span>
          <Badge variant={f.severity==="critical"?"crimson":f.severity==="high"?"amber":f.severity==="medium"?"azure":"slate"}>{f.severity}</Badge>
          <Badge variant={f.status==="remediated"?"emerald":f.status==="accepted"?"slate":"crimson"}>{f.status}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Certifications</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {/* S161: held credentials are a register. When empty we show the
            available exam tracks — which are not achievements. */}
        {!(data.certifications||[]).length && <div className="text-text-muted">No credentials recorded. The exams below are available tracks, not achievements.</div>}
        {(data.certifications||[]).map((c:any)=>(<div key={c.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <Award className="h-3 w-3 text-amber"/><span className="flex-1 font-semibold">{c.name}</span>
          <Badge variant="slate">{c.vendor}</Badge>
          {c.passed ? <Badge variant="emerald">passed {c.scorePct!=null?`${c.scorePct}%`:""}</Badge> : c.preparationProgressPct==null ? <Badge variant="slate">not started</Badge> : (<div className="flex-1 flex items-center gap-2"><div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-amber" style={{width:`${c.preparationProgressPct}%`}}/></div><span className="text-text-muted">{c.preparationProgressPct}%</span></div>)}
        </div>))}
        {!(data.certifications||[]).length && (data.certificationTracks||[]).map((t:any)=>(<div key={t.id} className="p-2 border border-white/5 rounded flex items-center gap-2 opacity-70">
          <Award className="h-3 w-3 text-text-muted"/><span className="flex-1">{t.name}</span>
          <Badge variant="slate">{t.vendor}</Badge><Badge variant="slate">track</Badge>
        </div>))}
      </CardContent></Card>
    </div>
  </div>);
}

// ─── Session 73: Operational Excellence & Responsible AI ──────────────
function OpexTab() {
  const d = useRefresh<any>(()=>opex.opexApi.dashboard(), 8_000);
  const data = d.data;
  if (!data) return <div/>;
  const t=data.trust, s=data.safety, rg=data.regulations, pb=data.playbooks, g=data.governance;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <ShieldCheck className="h-5 w-5 text-emerald"/><div className="flex-1"><div className="font-semibold">Operational Excellence & Responsible AI (V9.2)</div>
      <div className="text-xs text-text-muted">Safety & assurance, regulatory intelligence, human+AI collaboration, operational playbooks, explainability, trust analytics, governance orchestration, continuous OpEx.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Trust" value={`${t.trust}%`} tone="emerald"/>
      <Stat label="Alignment" value={`${t.alignment}%`} tone="azure"/>
      <Stat label="Safety Pass" value={`${s.passRate}%`} tone="emerald"/>
      <Stat label="Compliance" value={`${t.compliance}%`} tone="violet"/>
      <Stat label="Hallucination Risk" value={`${t.hallucinationRisk}%`} tone={t.hallucinationRisk>5?"crimson":"amber"}/>
      <Stat label="Reliability" value={`${t.reliability}%`} tone="teal"/>
      <Stat label="Safety Alerts" value={s.alertsOpen} tone={s.alertsCritical?"crimson":"amber"}/>
      <Stat label="Open Gaps" value={rg.openGaps} tone="crimson"/>
      <Stat label="Playbooks" value={`${pb.active}/${pb.total}`} tone="azure"/>
      <Stat label="Pending Approvals" value={g.pendingTotal} tone="amber"/>
      <Stat label="Maturity" value={`${data.continuous.maturityScore}/100`} tone="fuchsia"/>
      <Stat label="Overrides (24h)" value={g.overrides24h} tone="slate"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Safety Benchmarks</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {Object.entries(s.benchmarks||{}).map(([k,v]:any)=>(<div key={k} className="flex items-center gap-2">
          <span className="w-40 text-text-muted">{k}</span>
          <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden"><div className={`h-full ${v.pass?"bg-emerald":"bg-crimson"}`} style={{width:`${v.score}%`}}/></div>
          <span className="font-mono w-10 text-right">{v.score}</span>
          <Badge variant={v.pass?"emerald":"crimson"}>{v.pass?"pass":"fail"}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Governance Gates</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {(g.gates||[]).map((g:any)=>(<div key={g.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <span className="flex-1 font-semibold">{g.name}</span>
          <Badge variant="slate">{g.level}</Badge>
          <span className="text-text-muted">{g.pending} pending</span>
          <span className="text-text-muted">~{g.avgDecisionMin}m</span>
        </div>))}
      </CardContent></Card>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Safety Alerts</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.recentAlerts||[]).map((a:any)=>(<div key={a.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <AlertTriangle className={`h-3 w-3 ${a.severity==="critical"?"text-crimson":a.severity==="warning"?"text-amber":"text-text-muted"}`}/>
          <span className="flex-1">{a.message}</span><Badge variant="slate">{a.category}</Badge><Badge variant={a.status==="mitigated"?"emerald":"crimson"}>{a.status}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Regulatory Watch</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        {(data.recentRegulations||[]).map((r:any)=>(<div key={r.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <Scale className="h-3 w-3 text-violet"/><span className="flex-1 font-semibold">{r.name}</span>
          <Badge variant="slate">{r.jurisdiction}</Badge>
          <span className="text-text-muted">{r.gapCount-r.gapResolved}/{r.gapCount} gaps</span>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">OpEx KPIs</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 gap-2 text-xs">
      {(data.continuous.kpis||[]).map((k:any)=>(<div key={k.label} className="p-2 border border-white/5 rounded">
          <div className="flex items-center justify-between"><span className="text-text-muted">{k.label}</span>
            {k.trend==="up"?<TrendingUp className="h-3 w-3 text-emerald"/>:k.trend==="down"?<TrendingDown className="h-3 w-3 text-crimson"/>:<Activity className="h-3 w-3 text-text-muted"/>}</div>
        <div className="text-lg font-semibold">{k.value}{k.unit||""} <span className="text-xs text-text-muted">/ {k.target}{k.unit||""}</span></div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 74: Industry Solutions & Digital Operations ─────────────
function IndustryTab() {
  const d = useRefresh<any>(()=>ind.indApi.dashboard(), 15_000);
  const data = d.data;
  if (!data) return <div/>;
  return (<div className="space-y-4">
    <Card><CardContent className="p-4 flex items-center gap-2">
      <Building2 className="h-5 w-5 text-violet"/><div className="flex-1"><div className="font-semibold">Semantic Intelligence, Industry Solutions & Digital Operations (V9.3)</div>
      <div className="text-xs text-text-muted">Ontology & semantic KG, 25 industry suites, governance lifecycle, 24/7 Digital Operations Center, four-platform layer architecture, maturity & adoption framework.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Ontology Terms" value={(data.ontology.terms/1000).toFixed(1)+"k"} tone="violet"/>
      <Stat label="Entities" value={(data.ontology.entities/1e6).toFixed(1)+"M"} tone="azure"/>
      <Stat label="Semantic Latency" value={`${data.semanticSearchLatencyMs}ms`} tone="teal"/>
      <Stat label="Active Twins" value={data.activeTwins} tone="fuchsia"/>
      <Stat label="Industry Packs" value={data.industries.length} tone="emerald"/>
      <Stat label="Active Policies" value={data.governance.activePolicies} tone="azure"/>
      <Stat label="Pending Reviews" value={data.governance.pendingReviews} tone="amber"/>
      <Stat label="Maturity" value={`${data.maturity.overall}/100`} tone="fuchsia"/>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm">Digital Operations Center — Regions</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-3 gap-2 text-xs">
        {(data.doc.regions||[]).map((r:any)=>(<div key={r.name} className="p-2 border border-white/5 rounded">
          <div className="flex items-center justify-between"><span className="font-semibold">{r.name}</span><Badge variant={r.health==="ok"?"emerald":r.health==="warn"?"amber":"crimson"}>{r.health}</Badge></div>
          <div className="text-text-muted">{r.incidents} incidents · {r.alerts} alerts</div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Platform Layers</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs">
        {Object.entries(data.layerMapping||{}).map(([k,v]:any)=>(<div key={k} className="p-2 border border-white/5 rounded">
          <div className="font-semibold">{k}</div>
          <div className="text-text-muted flex flex-wrap gap-1">{(v||[]).map((m:string)=><Badge key={m} variant="slate">{m}</Badge>)}</div>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm">Industry Suites</CardTitle></CardHeader>
    <CardContent className="grid md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
      {(data.industries||[]).map((i:any)=>(<div key={i.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center justify-between"><span className="font-semibold">{i.name}</span><Badge variant={i.readinessPct>75?"emerald":i.readinessPct>50?"amber":"crimson"}>{i.readinessPct}%</Badge></div>
        <div className="text-text-muted mt-1 flex flex-wrap gap-1"><span>{i.employees} agents</span><span>· {i.workflows} WF</span><span>· {i.compliancePacks} CP</span><span>· {i.kpis} KPIs</span></div>
      </div>))}
    </CardContent></Card>
  </div>);
}

// ─── Session 75: Health, Wellness & Digital Healthcare Ecosystem ─────
function labelBadgeVariant(lab: string): "slate"|"emerald"|"crimson" {
  return lab==="clinically_validated"?"emerald":lab==="medical_decision_support"?"crimson":"slate";
}
function HealthEcosystemTab() {
  const d = useRefresh<any>(()=>hec.hecApi.dashboard(), 10_000);
  const data = d.data;
  if (!data) return <div/>;
  const t=data.today, w=data.weeklyAvg, lb=data.labelBreakdown||{};
  const criticalAlerts = (data.emergencyAlerts30d||[]).filter((a:any)=>a.severity==="critical"||a.severity==="emergency");
  // Honest empty state: this module records real health data and derives
  // aggregates from it. With nothing recorded we say so rather than showing
  // zeroed gauges that read like real measurements.
  const noData = data.hasData === false;
  return (<div className="space-y-4">
    {noData && (
      <div className="p-3 rounded-md border border-azure/40 bg-azure/10 text-xs flex items-start gap-2">
        <Activity className="h-4 w-4 mt-0.5 text-azure shrink-0"/>
        <div className="flex-1">
          <div className="font-semibold text-azure">No health data recorded yet</div>
          <div className="opacity-90 mt-0.5">
            This module reports only measurements you record or that a connected device submits —
            it does not generate sample vitals. Add a metric, log a session, or connect a device
            via <span className="font-mono">/health-ecosystem/metrics</span>,
            <span className="font-mono"> /wearables</span> or <span className="font-mono">/medical-devices</span>.
            All scores below stay at zero until real data exists.
          </div>
        </div>
      </div>
    )}
    {/* Crimson disclaimer banner — Fifth Standing Rule */}
    <div className="p-3 rounded-md border border-crimson/40 bg-crimson/10 text-crimson-100 text-xs flex items-start gap-2">
      <ShieldAlert className="h-4 w-4 mt-0.5 text-crimson shrink-0"/>
      <div className="flex-1">
        <div className="font-semibold text-crimson">Fifth Standing Rule — Three-Bucket Health Labels Enforced</div>
        <div className="opacity-90 mt-0.5">{data.disclaimer || "For informational wellness use only — not medical advice."}</div>
        <div className="mt-1 flex gap-2 text-[11px]">
          <Badge variant="slate">wellness_estimate × {lb.wellness_estimate||0}</Badge>
          <Badge variant="emerald">clinically_validated × {lb.clinically_validated||0}</Badge>
          <Badge variant="crimson">medical_decision_support × {lb.medical_decision_support||0}</Badge>
          <Badge variant={data.consentStatus==="full"?"emerald":"crimson"}>consent: {data.consentStatus}</Badge>
          <Badge variant="azure">{data.privacyMode||"hipaa"}</Badge>
        </div>
      </div>
    </div>
    <Card><CardContent className="p-4 flex items-center gap-2">
      <HeartPulse className="h-5 w-5 text-crimson"/><div className="flex-1"><div className="font-semibold">Health, Wellness & Digital Healthcare Ecosystem (V10.0)</div>
      <div className="text-xs text-text-muted">Smartphone CV/voice/motion sensors · Wellness estimation engine (BP/HRV/temp/hydration/fatigue/recovery/AFib) · Medical/wearable integration (Apple/Samsung/Fitbit/Garmin/WearOS + BP/ECG/CGM/pulse-ox/thermometer/scales/spirometer) · 25 health modules · AI voice/digital-human coach · Consent-gated per S44, safety-routed per S73.</div></div>
    </CardContent></Card>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Today Score" value={t.score} tone={t.score>75?"emerald":"amber"}/>
      <Stat label="Readiness" value={`${t.readiness}%`} tone="azure"/>
      <Stat label="Recovery" value={`${t.recovery}%`} tone="teal"/>
      <Stat label="Sleep Quality" value={`${t.sleepQuality}%`} tone="violet"/>
      <Stat label="Fitness" value={`${t.fitness}%`} tone="emerald"/>
      <Stat label="Mental" value={`${t.mentalWellness}%`} tone="fuchsia"/>
      <Stat label="Nutrition" value={`${t.nutrition}%`} tone="teal"/>
      <Stat label="Hydration" value={`${t.hydration}%`} tone="azure"/>
      <Stat label="Fatigue" value={`${t.fatigue}%`} tone={t.fatigue>50?"amber":"emerald"}/>
      <Stat label="Weekly Avg" value={w.score} tone="amber"/>
      <Stat label="Active Alerts" value={(data.emergencyAlerts30d||[]).filter((a:any)=>!a.acknowledged).length} tone={criticalAlerts.length?"crimson":"emerald"}/>
      <Stat label="Coaching" value={data.activeCoaching?"voice on":"off"} tone="azure"/>
      <Stat label="Wearable" value={`${data.wearableBatteryPct}%`} tone={data.wearableBatteryPct>30?"emerald":"crimson"}/>
      <Stat label="Vacc Due" value={data.vaccinationUpcoming} tone="amber"/>
      <Stat label="Screenings Due" value={data.screeningsDue} tone="crimson"/>
      <Stat label="Modules" value={(data.modules||[]).filter((m:any)=>m.enabled).length} tone="violet"/>
    </div>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-crimson"/>Recent Metrics</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs max-h-80 overflow-y-auto">
        {(data.recentMetrics||[]).slice(0,18).map((m:any)=>(<div key={m.id} className="flex items-center gap-2 p-2 border border-white/5 rounded">
          <span className="flex-1 font-semibold">{m.kind.replace(/_/g," ")}</span>
          <span className="font-mono">{m.value} {m.unit}</span>
          <span className="text-[10px] text-text-muted">{m.source.replace(/_/g," ")}</span>
          <Badge variant={labelBadgeVariant(m.label)}>{m.label.replace(/_/g," ")}</Badge>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Dumbbell className="h-4 w-4 text-emerald"/>Fitness Sessions (AI coach integrated)</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs max-h-80 overflow-y-auto">
        {(data.recentSessions||[]).map((s:any)=>(<div key={s.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{s.kind.replace(/_/g," ")}</span>
            {s.coaching && <Badge variant="azure"><Mic2 className="h-2.5 w-2.5 mr-0.5"/>coach</Badge>}
            <Badge variant="slate">{s.avgHr}bpm</Badge>
          </div>
          <div className="text-text-muted mt-0.5 flex gap-2">
            <span>{s.durationMin}min</span><span>·</span><span>{s.calories}kcal</span>
            {s.distanceKm!=null && <><span>·</span><span>{s.distanceKm}km</span></>}
            <span>·</span><span className="opacity-70">{new Date(s.at).toLocaleDateString()}</span>
          </div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Pill className="h-4 w-4 text-violet"/>Medications & Adherence</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs max-h-80 overflow-y-auto">
        {(data.medications||[]).map((m:any)=>(<div key={m.id} className="p-2 border border-white/5 rounded">
          <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{m.name}</span>
            <Badge variant={m.adherencePct>90?"emerald":m.adherencePct>75?"amber":"crimson"}>{m.adherencePct}%</Badge>
            <Badge variant={labelBadgeVariant(m.label)}>{m.label.replace(/_/g," ")}</Badge>
          </div>
          <div className="text-text-muted mt-0.5">{m.dose} · {m.frequency}{m.prescriber?` · ${m.prescriber}`:""}{m.refillsLeft!=null?` · ${m.refillsLeft} refills`:""}</div>
          {m.interactionsWarning && m.interactionsWarning.length>0 && <div className="text-amber mt-0.5"><AlertTriangle className="h-3 w-3 inline mr-0.5"/>{m.interactionsWarning.join("; ")}</div>}
        </div>))}
      </CardContent></Card>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Siren className="h-4 w-4 text-crimson"/>Emergency & Preventive Alerts (30d)</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
        {(data.emergencyAlerts30d||[]).length===0 && <div className="text-text-muted p-2">No alerts in the last 30 days.</div>}
        {(data.emergencyAlerts30d||[]).map((a:any)=>(<div key={a.id} className="p-2 border border-white/5 rounded flex items-start gap-2">
          {a.severity==="critical"||a.severity==="emergency"
            ? <Siren className="h-3.5 w-3.5 text-crimson mt-0.5 shrink-0"/>
            : a.severity==="warn"
              ? <AlertTriangle className="h-3.5 w-3.5 text-amber mt-0.5 shrink-0"/>
              : <Bell className="h-3.5 w-3.5 text-azure mt-0.5 shrink-0"/>}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{a.kind.replace(/_/g," ")}</span>
              <Badge variant={a.severity==="critical"||a.severity==="emergency"?"crimson":a.severity==="warn"?"amber":"slate"}>{a.severity}</Badge>
              {a.acknowledged ? <Badge variant="emerald">ack</Badge> : <Badge variant="crimson">unack</Badge>}
              <Badge variant={labelBadgeVariant(a.label)}>{a.label.replace(/_/g," ")}</Badge>
            </div>
            <div className="text-text-muted mt-0.5">{a.message}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{new Date(a.at).toLocaleString()}</div>
          </div>
        </div>))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Watch className="h-4 w-4 text-azure"/>Devices & Wearables</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="font-semibold text-[11px] text-text-muted">Wearables</div>
        {(data.wearables||[]).map((w:any)=>(<div key={w.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <Watch className="h-3.5 w-3.5 text-azure"/>
          <span className="flex-1"><span className="font-semibold">{w.vendor}</span> <span className="text-text-muted">{w.model}</span></span>
          <Badge variant={w.connected?"emerald":"crimson"}>{w.connected?"connected":"offline"}</Badge>
          <Badge variant={w.batteryPct>30?"emerald":"crimson"}>{w.batteryPct}%</Badge>
          <Badge variant={labelBadgeVariant(w.label)}>{w.label.replace(/_/g," ")}</Badge>
        </div>))}
        <div className="font-semibold text-[11px] text-text-muted mt-2">Medical Devices</div>
        {(data.medicalDevices||[]).map((dv:any)=>(<div key={dv.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-crimson"/>
          <span className="flex-1"><span className="font-semibold">{dv.kind.replace(/_/g," ")}</span> <span className="text-text-muted">{dv.vendor} {dv.model}</span></span>
          <Badge variant={dv.connected?"emerald":"crimson"}>{dv.connected?"live":"offline"}</Badge>
          <Badge variant={dv.calibrationStatus==="ok"?"emerald":"amber"}>cal {dv.calibrationStatus}</Badge>
        </div>))}
        <div className="font-semibold text-[11px] text-text-muted mt-2">Vaccinations & Screenings</div>
        {(data.vaccinations||[]).map((v:any)=>(<div key={v.id} className="p-1.5 border border-white/5 rounded flex items-center gap-2 text-[11px]">
          <span className="flex-1">{v.name}</span>
          <Badge variant={v.status==="up_to_date"?"emerald":v.status==="overdue"?"crimson":"amber"}>{v.status.replace(/_/g," ")}</Badge>
        </div>))}
        {(data.screenings||[]).map((s:any)=>(<div key={s.id} className="p-1.5 border border-white/5 rounded flex items-center gap-2 text-[11px]">
          <span className="flex-1">{s.name}</span>
          <Badge variant={s.status==="up_to_date"?"emerald":s.status==="overdue"?"crimson":"amber"}>{s.status.replace(/_/g," ")}</Badge>
        </div>))}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-azure"/>AI Insights (labeled by evidence tier — Fifth Standing Rule)</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-xs">
      {(data.insights||[]).map((ins:any)=>(<div key={ins.id} className="p-2 border border-white/5 rounded">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-3 w-3 text-azure"/>
          <span className="flex-1 text-[11px] text-text-muted font-semibold uppercase tracking-wide">{ins.category} · {ins.kind}</span>
          <Badge variant={labelBadgeVariant(ins.label)}>{ins.label.replace(/_/g," ")}</Badge>
          <span className="text-text-muted">c {Math.round((ins.confidence||0)*100)}%</span>
          {ins.actionable && <Badge variant="amber">actionable</Badge>}
        </div>
        <div>{ins.text}</div>
        {ins.citedSource && <div className="text-[10px] text-text-muted mt-0.5">source: {ins.citedSource}</div>}
      </div>))}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-violet"/>Health OS Modules (25 sub-modules wired)</CardTitle></CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {(data.modules||[]).map((m:any)=>(<div key={m.id} className={`p-2 rounded border flex items-center gap-2 ${m.enabled?"border-emerald/30 bg-emerald/5":"border-white/5 bg-white/0 opacity-70"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.enabled?"bg-emerald":"bg-text-muted"}`}/>
          <span className="flex-1 font-semibold">{m.name}</span>
          {m.enabled ? <Check className="h-3 w-3 text-emerald"/> : <X className="h-3 w-3 text-text-muted"/>}
        </div>))}
      </div>
    </CardContent></Card>
  </div>);
}

// ─── Session 84: Project Import & Continuity Tab ────────────────────
function ProjectContinuityTab() {
  const list = useRefresh<pcon.ProjectIntakeRecord[]>(() => pcon.projectContinuityApi.list(), 10_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResults, setActiveResults] = useState<any>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("archive", file);
      const token = localStorage.getItem("windels:accessToken");
      const res = await fetch("/api/v1/projects/intake", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error?.message || "Upload failed");
      toast.success("Project archive successfully uploaded.");
      list.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(id: string, type: "extract" | "inventory" | "verify") {
    setLoading(true);
    setError(null);
    setActiveResults(null);
    try {
      let res;
      if (type === "extract") {
        res = await pcon.projectContinuityApi.extract(id);
        toast.success("Project archive extracted successfully.");
      } else if (type === "inventory") {
        res = await pcon.projectContinuityApi.inventory(id);
        toast.success("Codebase inventory generated successfully.");
      } else {
        res = await pcon.projectContinuityApi.verify(id);
        toast.success("Codebase verification scan complete.");
      }
      setActiveResults({ type, data: res });
      list.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const records = list.data || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-fuchsia" />
          <div className="flex-1">
            <div className="font-semibold">Project Continuity & Import Engine</div>
            <div className="text-xs text-text-muted">
              Securely ingest, scan, and map existing software codebases to continue construction in WINDELS AI OS.
            </div>
          </div>
          <div className="relative">
            <input type="file" onChange={handleFileUpload} accept=".zip,.tar,.gz" className="hidden" id="pcon-file" disabled={loading} />
            <label htmlFor="pcon-file">
              <span className={`inline-flex items-center justify-center rounded-lg bg-azure px-3 py-1.5 text-xs font-medium text-white cursor-pointer ${loading ? "opacity-50 pointer-events-none" : "hover:bg-azure-dark"}`}>
                <CloudUpload className="h-3 w-3 mr-1" />
                Upload Codebase Archive
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-xs px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Uploaded Projects Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {records.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-6">No codebase archives uploaded yet.</div>
            ) : (
              records.map((r) => (
                <div key={r.id} className="p-3 border border-white/5 rounded flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-bright">{r.originalname}</span>
                    <Badge variant={r.status === "accepted" ? "emerald" : r.status === "scanning" ? "azure" : "crimson"}>
                      {r.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    Size: {(r.size / 1024 / 1024).toFixed(2)} MB | Hash: {r.hash.slice(0, 8)}...
                  </div>
                  {r.findings && r.findings.length > 0 && (
                    <div className="text-[11px] bg-white/5 p-1.5 rounded text-amber">
                      <strong>Findings:</strong> {r.findings.join(", ")}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-1">
                    <Button size="sm" variant="outline" onClick={() => runAction(r.id, "extract")} disabled={loading}>Extract</Button>
                    <Button size="sm" variant="outline" onClick={() => runAction(r.id, "inventory")} disabled={loading}>Inventory</Button>
                    <Button size="sm" variant="outline" onClick={() => runAction(r.id, "verify")} disabled={loading}>Verify</Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scan & Continuity Logs</CardTitle>
          </CardHeader>
          <CardContent className="text-xs min-h-[200px] flex flex-col justify-between">
            {activeResults ? (
              <div className="space-y-2">
                <div className="font-semibold text-text-bright uppercase tracking-wider text-[10px] text-azure">
                  Result: {activeResults.type} Scan
                </div>
                <pre className="bg-black/40 p-3 rounded border border-white/5 font-mono text-[10px] overflow-auto max-h-[300px]">
                  {JSON.stringify(activeResults.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-xs text-text-muted text-center py-12">
                Select a project action to display scan results or directory mapping trees.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Session 85: AI Lead Discovery Tab ────────────────────
function LeadDiscoveryTab() {
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<ldis.LeadRecord[]>([]);
  const [collections, setCollections] = useState<ldis.CollectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [colName, setColName] = useState("");

  async function fetchCollections() {
    try {
      const res = await ldis.leadDiscoveryApi.listCollections();
      setCollections(res);
    } catch {}
  }

  useEffect(() => {
    fetchCollections();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await ldis.leadDiscoveryApi.search(query);
      setLeads(res);
    } catch (err: any) {
      toast.error(err.message || "Lead discovery failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createCollection() {
    if (!colName.trim()) return;
    try {
      await ldis.leadDiscoveryApi.createCollection(colName);
      setColName("");
      toast.success("Collection created successfully.");
      fetchCollections();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function addToCollection(collectionId: string, leadId: string) {
    try {
      await ldis.leadDiscoveryApi.addLead(collectionId, leadId);
      toast.success("Lead successfully cataloged.");
      fetchCollections();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleExport() {
    if (leads.length === 0) return;
    try {
      const ids = leads.map((l) => l.id);
      const token = localStorage.getItem("windels:accessToken");
      const response = await fetch("/api/v1/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ leadIds: ids, format: "csv" }),
      });
      if (!response.ok) throw new Error("CSV Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "windels-discovered-leads.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-2">
          <Search className="h-5 w-5 text-emerald" />
          <div className="flex-1">
            <div className="font-semibold">AI Lead Discovery & Business Intelligence</div>
            <div className="text-xs text-text-muted">
              Natural-language non-custodial searching to discover and verify target B2B organizations and public listings.
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input placeholder="Enter B2B query, e.g., 'Find clinics in Enugu' or 'Gyms in Lagos'" value={query} onChange={e=>setQuery(e.target.value)} required disabled={loading} className="flex-1" />
        <Button type="submit" variant="primary" loading={loading}>
          <Search className="h-3 w-3 mr-1" /> Search Leads
        </Button>
      </form>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Discovered Business Profiles</CardTitle>
            {leads.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleExport}>
                <FileDown className="h-3 w-3 mr-1" /> Export CSV
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {leads.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-12">Submit a search query to pull business leads.</div>
            ) : (
              leads.map((l) => (
                <div key={l.id} className="p-3 border border-white/5 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-text-bright">{l.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">{l.category} | {l.address}</div>
                    {l.website && <div className="text-[11px] text-azure mt-0.5"><a href={l.website} target="_blank" rel="noopener noreferrer">{l.website}</a></div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={l.verificationStatus === "verified" ? "emerald" : "amber"}>{l.verificationStatus}</Badge>
                    <select
                      onChange={(e) => addToCollection(e.target.value, l.id)}
                      defaultValue=""
                      className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[11px]"
                    >
                      <option value="" disabled>Add to collection...</option>
                      {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lead Collections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Collection Name" value={colName} onChange={e=>setColName(e.target.value)} className="h-8 text-xs" />
              <Button size="sm" onClick={createCollection}>Create</Button>
            </div>
            <div className="space-y-1.5 text-xs">
              {collections.length === 0 ? (
                <div className="text-text-muted text-center py-6">No collections created.</div>
              ) : (
                collections.map((c) => (
                  <div key={c.id} className="p-2 border border-white/5 rounded flex items-center justify-between">
                    <span>{c.name}</span>
                    <Badge variant="violet">{c.leadsCount} Leads</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Session 83: ETL Pipelines Tab ────────────────────
function EtlTab() {
  const list = useRefresh<etl.EtlPipelineRecord[]>(() => etl.etlApi.listPipelines(), 10_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<etl.EtlPipelineRecord["sourceFormat"]>("CSV");
  const [cron, setCron] = useState("0 12 * * *");
  const [activeRuns, setActiveRuns] = useState<etl.EtlRunRecord[]>([]);
  const [viewingPipeId, setViewingPipeId] = useState<string | null>(null);

  async function handleCreatePipeline() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await etl.etlApi.createPipeline({
        name,
        sourceFormat: format,
        sourceConfig: { sftpHost: "sftp.windels.ai", s3Bucket: "windels-etl-bucket" },
        mappingSchema: [
          { sourceColumn: "first_name", targetColumn: "displayName", type: "string" },
          { sourceColumn: "email_address", targetColumn: "email", type: "string" }
        ],
        cronSchedule: cron,
      });
      setName("");
      toast.success("ETL Pipeline created successfully.");
      list.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function triggerEtl(id: string) {
    setLoading(true);
    try {
      await etl.etlApi.triggerRun(id);
      toast.success("ETL execution run triggered.");
      if (viewingPipeId === id) fetchRuns(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRuns(id: string) {
    setViewingPipeId(id);
    try {
      const runs = await etl.etlApi.listRuns(id);
      setActiveRuns(runs);
    } catch {}
  }

  const pipelines = list.data || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-2">
          <DbIcon className="h-5 w-5 text-amber" />
          <div className="flex-1">
            <div className="font-semibold">ETL & Custom Data Pipelines</div>
            <div className="text-xs text-text-muted">
              Ingest, cleanse, transform, and load structured corporate data streams with automated mapping and validation rules.
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-xs px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Create New Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block text-text-muted">Pipeline Name</label>
              <Input placeholder="User Ingestion Feed" value={name} onChange={e=>setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-text-muted">Source Format</label>
              <select value={format} onChange={e=>setFormat(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs">
                <option value="CSV">CSV file</option>
                <option value="JSON">JSON file</option>
                <option value="XML">XML file</option>
                <option value="SQL">SQL DB Dump</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-text-muted">Cron Schedule</label>
              <Input placeholder="0 12 * * *" value={cron} onChange={e=>setCron(e.target.value)} />
            </div>
            <Button size="sm" variant="primary" onClick={handleCreatePipeline} loading={loading} className="w-full">
              Create Pipeline
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Configured Pipelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pipelines.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-12">No data pipelines configured yet.</div>
            ) : (
              pipelines.map((p) => (
                <div key={p.id} className="p-3 border border-white/5 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-text-bright">{p.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">Format: {p.sourceFormat} | Schedule: {p.cronSchedule || "manual"}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => triggerEtl(p.id)} disabled={loading}>Trigger Run</Button>
                    <Button size="sm" variant="outline" onClick={() => fetchRuns(p.id)}>View History</Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {viewingPipeId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Execution Run History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {activeRuns.length === 0 ? (
              <div className="text-text-muted py-4 text-center">No runs executed yet. Click "Trigger Run" to execute.</div>
            ) : (
              activeRuns.map((r) => (
                <div key={r.id} className="p-2 border border-white/5 rounded flex items-center justify-between gap-4 text-xs">
                  <span className="font-mono text-[11px]">{r.id}</span>
                  <Badge variant={r.status === "succeeded" ? "emerald" : r.status === "running" ? "azure" : "crimson"}>
                    {r.status}
                  </Badge>
                  <span className="text-text-muted">Processed: {r.rowsProcessed} | OK: {r.rowsSucceeded} | Failed: {r.rowsFailed}</span>
                  {r.startedAt && <span className="text-text-muted text-[10px]">{new Date(r.startedAt).toLocaleTimeString()}</span>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Session 87: Live Camera Intelligence Tab ────────────────────
function CameraTab() {
  const list = useRefresh<cam.CameraFeedRecord[]>(() => cam.cameraApi.listFeeds(), 10_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("rtsp://admin:W1ndels!@192.168.1.50:554/h264");
  const [location, setLocation] = useState("");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeAlerts, setActiveAlerts] = useState<cam.CameraAlertRecord[]>([]);
  const [viewingCamId, setViewingCamId] = useState<string | null>(null);

  async function handleRegisterFeed() {
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    try {
      await cam.cameraApi.createFeed({
        name,
        streamUrl: url,
        locationName: location,
        resolution: "1920x1080",
      });
      setName("");
      setLocation("");
      toast.success("Camera feed registered successfully.");
      list.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStream(id: string) {
    setLoading(true);
    try {
      const res = await cam.cameraApi.getStream(id);
      setActiveSession(res);
      toast.success("WebRTC stream session established.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts(id: string) {
    setViewingCamId(id);
    try {
      const alerts = await cam.cameraApi.listAlerts(id);
      setActiveAlerts(alerts);
    } catch {}
  }

  const feeds = list.data || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-2">
          <Video className="h-5 w-5 text-crimson" />
          <div className="flex-1">
            <div className="font-semibold">Live Camera Intelligence & Surveillance</div>
            <div className="text-xs text-text-muted">
              RTSP/RTMP video stream ingestion, automated face/PII privacy redactor, and YOLO physical object detection triggers.
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-xs px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Register Camera Stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block text-text-muted">Camera Name</label>
              <Input placeholder="Warehouse Gate 1" value={name} onChange={e=>setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-text-muted">Stream URL</label>
              <Input placeholder="rtsp://username:password@ip:port/h264" value={url} onChange={e=>setUrl(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-text-muted">Location Name</label>
              <Input placeholder="Warehouse-NE-Sector" value={location} onChange={e=>setLocation(e.target.value)} />
            </div>
            <Button size="sm" variant="primary" onClick={handleRegisterFeed} loading={loading} className="w-full">
              Register Feed
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Surveillance Feeds Matrix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {feeds.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-12">No camera feeds registered yet.</div>
            ) : (
              feeds.map((f) => (
                <div key={f.id} className="p-3 border border-white/5 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-text-bright">{f.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">URL: {f.streamUrl.slice(0, 30)}... | Loc: {f.locationName || "unspecified"}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => fetchStream(f.id)} disabled={loading}>Live Stream</Button>
                    <Button size="sm" variant="outline" onClick={() => fetchAlerts(f.id)}>View Alerts</Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {activeSession && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" /> Live WebRTC Feed Stream session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="font-semibold text-azure text-[11px]">Ice Servers configured:</div>
            <pre className="bg-black/40 p-3 rounded border border-white/5 font-mono text-[10px] overflow-auto">
              {JSON.stringify(activeSession, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {viewingCamId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Safety Violations & Detections Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {activeAlerts.length === 0 ? (
              <div className="text-text-muted py-4 text-center">No safety alerts triggered yet. Feeds are operating within standard parameters.</div>
            ) : (
              activeAlerts.map((a) => (
                <div key={a.id} className="p-2 border border-white/5 rounded flex items-center justify-between gap-4 text-xs">
                  <span className="font-mono text-[11px]">{a.id}</span>
                  <Badge variant={a.severity === "critical" ? "crimson" : a.severity === "warning" ? "amber" : "slate"}>
                    {a.severity}
                  </Badge>
                  <span className="text-text-bright font-semibold">{a.triggerClass.replace(/_/g, " ")}</span>
                  {a.createdAt && <span className="text-text-muted text-[10px]">{new Date(a.createdAt).toLocaleTimeString()}</span>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
