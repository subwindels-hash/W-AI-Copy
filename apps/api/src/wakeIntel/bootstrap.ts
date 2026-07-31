/**
 * Wake Intelligence bootstrap (Slices 300-309) — 11000ms slot
 */
import { redisCmd as redis } from "../db/redis.js";
import { WakeIntelligenceService as Wi } from "./wakeIntelligence.service.js";

const K = { patterns: "wi:clap-patterns", mfa: "wi:mfa-policies", bindings: "wi:bindings", emergency: { contacts: "wi:emergency:contacts" }, devices: "wi:devices" };

export async function bootstrapWakeIntelligence(logger?: any): Promise<void> {
  const existing = await redis.zrange(K.patterns, 0, -1);
  if (existing.length > 0) {
    logger?.info("[wake-intel] bootstrap skipped", { patterns: existing.length });
    return;
  }

  // Ensure base config
  await Wi.getConfig();
  await Wi.getEmergencyConfig();

  // 301-302 — Clap patterns (MVP set)
  const patterns = [
    { name: "Single clap", pat: [0], tol: 250, action: "wake-assistant", desc: "Single clap — wake/show assistant" },
    { name: "Double clap", pat: [280], tol: 120, action: "start-listening", desc: "Double clap — start voice conversation" },
    { name: "Triple clap (emergency)", pat: [260, 260], tol: 120, action: "emergency-mode", desc: "Triple clap — trigger Emergency Mode", mfa: false },
  ] as const;
  for (const p of patterns as any) {
    await Wi.addPattern({ name: p.name, pattern: p.pat, toleranceMs: p.tol, action: p.action, mfaRequired: !!p.mfa, enabled: true, description: p.desc });
  }
  // 303 — MFA
  await Wi.addMfaPolicy({ name: "High-risk activation MFA", requiredFactors: ["voice-print","device-presence"], appliesTo: { methods: ["enterprise-hardware","nfc","bluetooth-device"] } });
  await Wi.addMfaPolicy({ name: "Emergency multi-factor", requiredFactors: ["voice-print","clap-biometric"], appliesTo: { emergency: true } });

  // 304 — Sample devices
  const devices = [
    { id: "dev-laptop-01", kind: "laptop", user: "admin", online: true, scope: "single-device" as const },
    { id: "dev-mobile-01", kind: "mobile", user: "admin", online: true, scope: "all-devices" as const },
    { id: "dev-watch-01", kind: "smart-watch", user: "admin", online: false, scope: "all-devices" as const },
    { id: "dev-desktop-01", kind: "desktop", user: "admin", online: true, scope: "single-device" as const },
    { id: "dev-office-button", kind: "smart-button", user: "reception", online: true, scope: "single-device" as const },
  ] as const;
  for (const d of devices as any) {
    await Wi.registerDevice({ deviceId: d.id, deviceKind: d.kind, user: d.user, online: d.online, scope: d.scope });
  }

  // 306 — Emergency contacts
  const contacts = [
    { label: "Internal Security", type: "internal-security" as const, target: "security@windels.ai", notify: true },
    { label: "Facilities Emergency", type: "designated-responder" as const, target: "+1-555-0199", notify: true },
    { label: "Local Emergency Services", type: "emergency-services" as const, target: "911", notify: false },
  ] as const;
  for (const c of contacts as any) {
    await Wi.addEmergencyContact({ label: c.label, type: c.type, target: c.target, notifyOnEmergency: c.notify });
  }
  const emCfg = await Wi.getEmergencyConfig();
  emCfg.notifyContacts = (await Wi.listEmergencyContacts()).slice(0,2).map(c=>c.id);
  await Wi.setEmergencyConfig(emCfg);

  // 307 — Workforce activation bindings
  const binds = [
    { wf: "exec-assistant", wfName: "Executive Assistant", phrase: "Briefing, WINDELS", methods: ["voice-wake-word","hotkey"] as any[] },
    { wf: "support", wfName: "Customer Support", phrase: "Support mode", methods: ["hotkey","voice-wake-word"] as any[] },
    { wf: "cyber", wfName: "Cybersecurity Workforce", phrase: "Security WINDELS", methods: ["hotkey","clap","voice-wake-word"] as any[] },
    { wf: "trading", wfName: "Trading Workforce", phrase: "Trade desk WINDELS", methods: ["hotkey"] as any[], mfa: true },
  ] as const;
  for (const b of binds as any) {
    await Wi.addBinding({ workforceId: b.wf, workforceName: b.wfName, triggerPhrase: b.phrase, triggerMethods: b.methods, requiresMfa: !!b.mfa, enabled: true });
  }

  // Seed a few demo activations
  const now = Date.now();
  const seedActs: any[] = [];
  for (let i = 0; i < 24; i++) {
    seedActs.push({
      id: "act-seed-"+i, method: (["voice-wake-word","hotkey","clap","scheduled","api"] as const)[i%5],
      deviceId: devices[i%devices.length].id, deviceKind: devices[i%devices.length].kind,
      userId: "admin", timestamp: new Date(now - i*3600*1000).toISOString(),
      confidence: 0.85 + Math.random()*0.12, outcome: "accepted",
      mfaUsed: i%7===0?["device-presence"]:[], workforceId: i%4===0? binds[i%binds.length].wf : undefined,
      emergency: false, offline: i%11===0, contextSnapshot: {}, policyPassed: true, latencyMs: 80+Math.floor(Math.random()*150),
    });
  }
  for (const a of seedActs) await redis.zadd("wi:events", Date.parse(a.timestamp), JSON.stringify(a));
  await redis.set(K_BIND, seedActs.filter(a=>!a.offline).length);
  await redis.set(K_OFF, seedActs.filter(a=>a.offline).length);
  await redis.set(K_MFAC, 3); await redis.set(K_MFAF, 0); await redis.set(K_EM, 0);

  logger?.info("[wake-intel] bootstrap complete", { patterns: patterns.length, devices: devices.length });
}
const K_BIND = "wi:act24h", K_OFF = "wi:offline24h", K_MFAC = "wi:mfa-ch", K_MFAF = "wi:mfa-fail", K_EM = "wi:em24h";
