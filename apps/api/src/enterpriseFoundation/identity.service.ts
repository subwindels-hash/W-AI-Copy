/**
 * IdentityService — Slices 272-274:
 * Identity Fabric, Identity Federation, AI Identity.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  IdentityPrincipal, IdentityProviderRec, ServiceAccount,
  PrincipalKind, IdpProvider, IdentityStatus, AiAgentIdentityClass,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('enterpriseFoundation:identity');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const PRINCS = "ef:principals";
const PRINC  = (id: string) => `ef:princ:${id}`;
const IDPS   = "ef:idps";
const IDP    = (id: string) => `ef:idp:${id}`;
const SAS    = "ef:sas";
const SA     = (id: string) => `ef:sa:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const IdentityService = {
  // principals
  async listPrincipals(filter?: { kind?: PrincipalKind; status?: IdentityStatus; provider?: IdpProvider }): Promise<IdentityPrincipal[]> {
    const ids = await redis.smembers(PRINCS);
    const out: IdentityPrincipal[] = [];
    for (const id of ids) {
      const raw = await redis.get(PRINC(id));
      if (!raw) continue;
      const p = JSON.parse(raw) as IdentityPrincipal;
      if (filter?.kind && p.kind !== filter.kind) continue;
      if (filter?.status && p.status !== filter.status) continue;
      if (filter?.provider && p.provider !== filter.provider) continue;
      out.push(p);
    }
    return out.sort((a,b)=>(b.lastLoginAt??"").localeCompare(a.lastLoginAt??""));
  },
  async getPrincipal(id: string): Promise<IdentityPrincipal | null> {
    const raw = await redis.get(PRINC(id));
    return raw ? (JSON.parse(raw) as IdentityPrincipal) : null;
  },
  async createPrincipal(input: Omit<IdentityPrincipal,"id"|"createdAt"|"riskScore"> & { riskScore?: number }): Promise<IdentityPrincipal> {
    _rng.reseed(`createPrincipal:${input}`);
    const id = randomUUID();
    const p: IdentityPrincipal = { id, createdAt: iso(), riskScore: input.riskScore ?? Math.floor(_rng.next()*30), ...input };
    await redis.set(PRINC(id), SER(p));
    await redis.sadd(PRINCS, id);
    return p;
  },
  async setStatus(id: string, status: IdentityStatus): Promise<IdentityPrincipal | null> {
    const p = await this.getPrincipal(id);
    if (!p) return null;
    p.status = status;
    await redis.set(PRINC(id), SER(p));
    return p;
  },
  // IDPs
  async listIdps(): Promise<IdentityProviderRec[]> {
    const ids = await redis.smembers(IDPS);
    const out: IdentityProviderRec[] = [];
    for (const id of ids) {
      const raw = await redis.get(IDP(id));
      if (raw) out.push(JSON.parse(raw) as IdentityProviderRec);
    }
    return out;
  },
  async registerIdp(input: Omit<IdentityProviderRec,"id"|"usersSynced"|"groupsSynced"|"createdAt">): Promise<IdentityProviderRec> {
    const id = randomUUID();
    const i: IdentityProviderRec = { id, usersSynced: 0, groupsSynced: 0, createdAt: iso(), ...input };
    await redis.set(IDP(id), SER(i));
    await redis.sadd(IDPS, id);
    return i;
  },
  // service accounts
  async listServiceAccounts(): Promise<ServiceAccount[]> {
    const ids = await redis.smembers(SAS);
    const out: ServiceAccount[] = [];
    for (const id of ids) {
      const raw = await redis.get(SA(id));
      if (raw) out.push(JSON.parse(raw) as ServiceAccount);
    }
    return out;
  },
  async createSa(name: string, scopes: string[], createdBy = "admin", daysValid = 90): Promise<ServiceAccount> {
    const id = randomUUID();
    const pid = randomUUID();
    const sa: ServiceAccount = {
      id, name, principalId: pid, scopes,
      expiresAt: iso0(daysValid), rotatedAt: iso(), createdBy,
    };
    await redis.set(SA(id), SER(sa));
    await redis.sadd(SAS, id);
    // linked principal
    await this.createPrincipal({
      principalId: `sa:${pid.slice(0,8)}`, kind:"service", displayName:name, provider:"local",
      tenantId:"windels", status:"active", mfaEnabled:false, scopes, groups:[],
    });
    return sa;
  },
  async rotate(id: string): Promise<ServiceAccount | null> {
    const raw = await redis.get(SA(id));
    if (!raw) return null;
    const sa = JSON.parse(raw) as ServiceAccount;
    sa.rotatedAt = iso();
    await redis.set(SA(id), SER(sa));
    return sa;
  },
  async summary() {
    const ps = await this.listPrincipals();
    const idps = await this.listIdps();
    return {
      principals: ps.length,
      activePrincipals: ps.filter(p=>p.status==="active").length,
      aiAgents: ps.filter(p=>p.kind==="ai-agent").length,
      humans: ps.filter(p=>p.kind==="human").length,
      services: ps.filter(p=>p.kind==="service"||p.kind==="api-key").length,
      idps: idps.length,
      mfaCoveragePct: ps.length ? Math.round(100*ps.filter(p=>p.mfaEnabled).length/ps.length) : 0,
      highRisk: ps.filter(p=>p.riskScore>=70).length,
    };
  },
};

function iso0(days: number): string { return new Date(Date.now()+days*86400_000).toISOString(); }
