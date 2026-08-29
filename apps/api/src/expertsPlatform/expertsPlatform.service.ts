/**
 * Enterprise Professional Intelligence Platform singleton (Session 77, Part A).
 * Domain expert agents (gov/healthcare/pharmacy/engineering/legal), lecturer AI with
 * course library, and expert marketplace packages. Agents extend ExpertAgent contract.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { aiRegistry } from "../services/ai/registry.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import type { EpExpertAgent, EpCourse, EpExpertPackage, EpDashboard, EpExpertDomain, EpExpertQueryResult } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
const K = { agents:"ep:agents", agent:(id:string)=>`ep:agent:${id}`, courses:"ep:courses", course:(id:string)=>`ep:course:${id}`, packs:"ep:packs", pack:(id:string)=>`ep:pack:${id}`, q24:"ep:q24" };
const j=(s:string)=>JSON.parse(s); const s=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);

const EXPERT_SEEDS: Array<Omit<EpExpertAgent,"id"|"lastHeartbeat"|"queries24h">> = [
  { name:"Government Intelligence", domain:"government", specialization:"Policy, regulation, public administration", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.89 },
  { name:"Healthcare Intelligence", domain:"healthcare", specialization:"Symptoms, triage, wellness guidance", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.86 },
  { name:"Pharmacy Intelligence", domain:"pharmacy", specialization:"Drug interactions, dosage guidance, OTC info", status:"online", disclaimer:"consult-professional", accuracyScore:0.91 },
  { name:"Engineering Intelligence", domain:"engineering", specialization:"Civil/mechanical/electrical/structural reference", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.88 },
  { name:"Legal Intelligence", domain:"legal", specialization:"Contract review, compliance, jurisdictional reference", status:"online", disclaimer:"consult-professional", accuracyScore:0.84 },
  { name:"Lecturer AI", domain:"lecturer", specialization:"Personalized multilingual course delivery", status:"online", disclaimer:"educational-only", accuracyScore:0.9 },
];

const COURSE_SEEDS: Array<Omit<EpCourse,"id">> = [
  { title:"Introduction to AI for Enterprise", author:"WINDELS", language:"en", level:"beginner", lessons:12, enrolled:4280, rating:4.7 },
  { title:"Prompt Engineering Masterclass", author:"WINDELS", language:"en", level:"intermediate", lessons:18, enrolled:3102, rating:4.8 },
  { title:"AI Safety & Governance", author:"WINDELS", language:"en", level:"advanced", lessons:22, enrolled:1540, rating:4.6 },
  { title:"Multilingual Business Communication", author:"WINDELS", language:"multi", level:"intermediate", lessons:14, enrolled:980, rating:4.5 },
];

export const ExpertsPlatformService = {
  async ensureBootstrapped() {
    if (await redis.zcard(K.agents) > 0) return;
    if (!demoDataEnabled()) return skipDemoSeed("experts-platform");
    for (const seed of EXPERT_SEEDS) {
      const id = uid("ep-");
      const a: EpExpertAgent = { ...seed, id, lastHeartbeat: new Date().toISOString(), queries24h: 0 };
      await redis.zadd(K.agents, 0, id);
      await redis.hset(K.agent(id), "_doc", s(a));
    }
    for (const sc of COURSE_SEEDS) {
      const id = uid("c-");
      await redis.zadd(K.courses, 0, id);
      await redis.hset(K.course(id), "_doc", s({ ...sc, id }));
    }
    const packs = [
      { id: uid("epk-"), name:"Medical Specialist Pack", domain:"healthcare" as EpExpertDomain, description:"Cardiology, neurology, pediatric sub-specialists", sizeMb:240, premium:true, installed:true, author:"windels" },
      { id: uid("epk-"), name:"Engineering Disciplines Bundle", domain:"engineering" as EpExpertDomain, description:"Civil/mechanical/electrical/chemical", sizeMb:180, premium:false, installed:true, author:"windels" },
      { id: uid("epk-"), name:"Legal Jursidictions Pack", domain:"legal" as EpExpertDomain, description:"Multi-jurisdiction legal reference", sizeMb:120, premium:true, installed:false, author:"windels" },
    ];
    for (const p of packs) { await redis.zadd(K.packs, 0, p.id); await redis.hset(K.pack(p.id), "_doc", s(p)); }
  },
  async dashboard(): Promise<EpDashboard> {
    const ids = await redis.zrange(K.agents, 0, -1);
    let online=0; for (const id of ids) { const r=await redis.hgetall(K.agent(id)); if(r._doc && j(r._doc).status==="online") online++; }
    return { experts: ids.length, expertsOnline: online, courses: await redis.zcard(K.courses), packages: await redis.zcard(K.packs), queries24h: Number(await redis.get(K.q24)??0), disclaimerEnforced: true };
  },
  async listAgents(domain?: EpExpertDomain): Promise<EpExpertAgent[]> {
    const ids = await redis.zrange(K.agents, 0, -1);
    const out: EpExpertAgent[]=[]; for(const id of ids){const r=await redis.hgetall(K.agent(id)); if(r._doc){const a=j(r._doc); if(!domain||a.domain===domain) out.push(a);}} return out;
  },
  /**
   * Answer a question addressed to a domain expert agent.
   *
   * This previously discarded the question and returned a hardcoded string
   * ("[expert response placeholder — ...]") while incrementing the served-query
   * counter. The declared domains include healthcare, pharmacy and legal, so a
   * placeholder rendered in the answer slot is the most consequential form of
   * fake completion in this codebase: it reads like professional guidance.
   *
   * The rule now matches the rest of the platform (see education/lecturer):
   * answer with a real model, or say plainly that no answer was produced.
   * Nothing is invented, and a refusal is never counted as a served query.
   */
  async query(id: string, question: string): Promise<EpExpertQueryResult> {
    const raw = await redis.hgetall(K.agent(id));
    if (!raw?._doc) throw AppError.notFound("Expert not found");
    const expert = j(raw._doc) as EpExpertAgent;

    const base = { expertId: id, disclaimer: expert.disclaimer };

    if (expert.status !== "online") {
      return {
        ...base, available: false, reason: "EXPERT_UNAVAILABLE",
        message: `${expert.name} is currently ${expert.status}. No response was generated.`,
      };
    }

    if (!aiRegistry.hasRealModelConfigured()) {
      return {
        ...base, available: false, reason: "AI_PROVIDER_NOT_CONFIGURED",
        message:
          "AI PROVIDER CONFIGURATION REQUIRED — no expert response was generated. " +
          "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL to enable this expert. " +
          "This platform does not generate substitute professional advice.",
      };
    }

    const system =
      `You are a ${expert.domain} information assistant specialising in ${expert.specialization}. ` +
      `Provide factual, cited-where-possible information. You are NOT a licensed professional: ` +
      `never present output as ${expert.domain === "legal" ? "legal advice" : expert.domain === "healthcare" || expert.domain === "pharmacy" ? "a diagnosis, prescription or treatment plan" : "official advice"}, ` +
      `and direct the user to a qualified professional for decisions. If you are not confident, say so.`;

    let text = "";
    let modelSource: "real" | "demo-ai" = "demo-ai";
    try {
      for await (const chunk of aiRegistry.guardedStream(
        {
          model: "default",
          messages: [
            { role: "system", content: system },
            { role: "user", content: question },
          ],
          temperature: 0.2,
          maxTokens: 700,
        },
        { feature: "experts-platform", channel: "api" },
      )) {
        if (chunk.type === "token" && chunk.text) {
          text += chunk.text;
          if (chunk.modelSource) modelSource = chunk.modelSource === "real" ? "real" : "demo-ai";
        } else if (chunk.type === "error") {
          throw new Error(chunk.error ?? "AI provider error");
        }
      }
    } catch (e: any) {
      logger.warn("[expertsPlatform] expert query failed", { expertId: id, err: e?.message });
      return {
        ...base, available: false, reason: "AI_PROVIDER_ERROR",
        message: "The expert model could not be reached. No response was generated.",
      };
    }

    const answer = text.trim();
    if (!answer) {
      return {
        ...base, available: false, reason: "AI_EMPTY_RESPONSE",
        message: "The expert model returned no content. No response was generated.",
      };
    }

    // Only a genuinely served answer counts towards the dashboard.
    await redis.incr(K.q24);
    return { ...base, available: true, answer, modelSource };
  },
  async listCourses(): Promise<EpCourse[]> {
    const ids = await redis.zrange(K.courses,0,-1); const out:EpCourse[]=[]; for(const id of ids){const r=await redis.hgetall(K.course(id)); if(r._doc) out.push(j(r._doc));} return out;
  },
  async listPackages(): Promise<EpExpertPackage[]> {
    const ids = await redis.zrange(K.packs,0,-1); const out:EpExpertPackage[]=[]; for(const id of ids){const r=await redis.hgetall(K.pack(id)); if(r._doc) out.push(j(r._doc));} return out;
  },
};
