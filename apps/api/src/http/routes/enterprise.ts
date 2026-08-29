import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import * as models from "../../services/modelRegistry.service.js";
import * as mon from "../../services/aiMonitoring.service.js";
import * as plugins from "../../services/plugin.service.js";
import * as integ from "../../services/integration.service.js";
import * as sso from "../../services/sso.service.js";
import * as org from "../../services/organization.service.js";
import { GovernanceService } from "../../enterprise/governance/governance.service.js";
import { DiscoveryService } from "../../enterprise/discovery/discovery.service.js";
import { EventBusService } from "../../enterprise/events/eventBus.service.js";
import { ApiGovernanceService } from "../../enterprise/apiGovernance/apiGovernance.service.js";
import { jsonToYaml } from "../../utils/jsonToYaml.js";

export function registerEnterpriseRoutes(router: Router) {
  router.use(authenticate);

  // ─── Model Registry ────────────────────────────────────────
  router.get("/models", async (req, res, next) => {
    try { res.json({ ok: true, data: await models.listModels(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/models", validate({ body: models.RegisterModelSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await models.registerModel(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/models/:id", validate({ body: models.UpdateModelSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await models.updateModel(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/models/:id", async (req, res, next) => {
    try { await models.deleteModel(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  router.post("/models/:id/default", async (req, res, next) => {
    try { await models.setDefaultModel(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ─── AI Monitoring ─────────────────────────────────────────
  router.get("/ai-monitoring", async (req, res, next) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
      res.json({ ok: true, data: await mon.getAiMetrics(req.user!.id, days), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Plugins ───────────────────────────────────────────────
  router.get("/plugins", async (req, res, next) => {
    try { res.json({ ok: true, data: await plugins.listPlugins(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/plugins", validate({ body: plugins.CreatePluginSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await plugins.installPlugin(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/plugins/:id/toggle", validate({ body: z.object({ enabled: z.boolean().default(true) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await plugins.togglePlugin(req.user!.id, req.params.id, req.body.enabled !== false), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/plugins/:id/config", validate({ body: z.object({ config: z.record(z.any()).default({}) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await plugins.configurePlugin(req.user!.id, req.params.id, req.body.config ?? {}), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/plugins/:id", async (req, res, next) => {
    try { await plugins.uninstallPlugin(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ─── Integrations ──────────────────────────────────────────
  router.get("/integrations", async (req, res, next) => {
    try { res.json({ ok: true, data: await integ.listIntegrations(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/integrations", validate({ body: integ.CreateIntegrationSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await integ.connectIntegration(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/integrations/:id", validate({ body: integ.UpdateIntegrationSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await integ.updateIntegration(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/integrations/:id", async (req, res, next) => {
    try { await integ.disconnectIntegration(req.user!.id, req.params.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });

  // ─── SSO ───────────────────────────────────────────────────
  router.get("/sso", async (req, res, next) => {
    try { res.json({ ok: true, data: await sso.getSsoConfig(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.put("/sso", validate({ body: sso.SsoConfigSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await sso.upsertSsoConfig(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/sso/disable", async (req, res, next) => {
    try { await sso.disableSso(req.user!.id); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  router.get("/sso/lookup", async (req, res, next) => {
    try {
      const email = String(req.query.email ?? "");
      res.json({ ok: true, data: await sso.lookupSsoByDomain(email) });
    } catch (e) { next(e); }
  });

  // ─── Organization / White Label ───────────────────────────
  router.get("/organization", async (req, res, next) => {
    try { res.json({ ok: true, data: await org.getOrganization(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/organization", validate({ body: org.UpdateOrgSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await org.updateOrganization(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // ─── Enterprise Engineering Framework (Session 18) ──────────────
  // Routes are gated by authenticate() above. Super_admin / admin RBAC
  // should additionally guard writes in production.

  // ── Architecture Governance (Slice 161) ────────────────────────
  const adrStatusEnum = z.enum(["proposed", "accepted", "superseded", "deprecated", "rejected"]);

  router.get("/governance/adrs", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await GovernanceService.listADRs({
          status: req.query.status as any,
          tag: req.query.tag as string | undefined,
        }),
      });
    } catch (e) { next(e); }
  });
  router.get("/governance/adrs/:id", async (req, res, next) => {
    try {
      const a = await GovernanceService.getADR(req.params.id);
      if (!a) return res.status(404).json({ ok: false, error: { message: "ADR not found" } });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.post("/governance/adrs", validate({ body: z.object({
    title: z.string().min(3), context: z.string().min(10), decision: z.string().min(10),
    consequences: z.string().min(5), authors: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
    status: adrStatusEnum.optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await GovernanceService.createADR(req.body, req.user!.id) }); }
    catch (e) { next(e); }
  });
  router.patch("/governance/adrs/:id", validate({ body: z.object({
    title: z.string().optional(), context: z.string().optional(), decision: z.string().optional(),
    consequences: z.string().optional(), status: adrStatusEnum.optional(),
    tags: z.array(z.string()).optional(), supersededBy: z.string().optional(),
  }) }), async (req, res, next) => {
    try {
      const a = await GovernanceService.updateADR(req.params.id, req.body);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.get("/governance/standards", async (req, res, next) => {
    try { res.json({ ok: true, data: GovernanceService.listStandards(req.query.category as any) }); }
    catch (e) { next(e); }
  });
  router.post("/governance/standards", validate({ body: z.object({
    code: z.string().min(3), category: z.enum(["api","security","data","ui","infra","naming","testing"]),
    title: z.string().min(3), description: z.string(), severity: z.enum(["must","should","may"]),
    enforcement: z.enum(["manual","automated","advisory"]), link: z.string().url().optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await GovernanceService.addStandard(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/governance/reviews", async (req, res, next) => {
    try { res.json({ ok: true, data: GovernanceService.listReviews({ status: req.query.status as any, kind: req.query.kind as any }) }); }
    catch (e) { next(e); }
  });
  router.post("/governance/reviews", validate({ body: z.object({
    kind: z.enum(["adr","service","event","api","deployment"]), targetId: z.string(),
    reviewers: z.array(z.string()).default([]),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await GovernanceService.requestReview(req.body, req.user!.id) }); }
    catch (e) { next(e); }
  });
  router.post("/governance/reviews/:id/comment", validate({ body: z.object({ body: z.string().min(1) }) }), async (req, res, next) => {
    try {
      const r = await GovernanceService.addReviewComment(req.params.id, req.user!.id, req.body.body);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/governance/reviews/:id/decide", validate({ body: z.object({ decision: z.enum(["approved","changes_requested","rejected"]) }) }), async (req, res, next) => {
    try {
      const r = await GovernanceService.decideReview(req.params.id, req.body.decision);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ── Service Discovery (Slices 162–163) ─────────────────────────
  const svcStatusEnum = z.enum(["starting","healthy","degraded","unhealthy","offline"]);

  router.get("/discovery/services", async (_req, res, next) => {
    try { res.json({ ok: true, data: DiscoveryService.list() }); }
    catch (e) { next(e); }
  });
  router.get("/discovery/services/query", async (req, res, next) => {
    try {
      res.json({ ok: true, data: DiscoveryService.query({
        name: req.query.name as string | undefined,
        capability: req.query.capability as string | undefined,
        status: req.query.status as any,
        region: req.query.region as string | undefined,
        minVersion: req.query.minVersion as string | undefined,
      }) });
    } catch (e) { next(e); }
  });
  router.get("/discovery/services/resolve/:name", async (req, res, next) => {
    try {
      const s = DiscoveryService.resolve(req.params.name);
      if (!s) return res.status(404).json({ ok: false, error: { message: "service not found" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.post("/discovery/services", validate({ body: z.object({
    id: z.string().min(2), name: z.string().min(2), version: z.string().regex(/^\d+\.\d+\.\d+/),
    baseUrl: z.string().url().or(z.string().regex(/^http/)), healthUrl: z.string().optional(),
    capabilities: z.array(z.string()).default([]), region: z.string().optional(),
    metadata: z.record(z.any()).default({}), status: svcStatusEnum.optional(),
    instanceId: z.string().optional(),
  }) }), async (req, res, next) => {
    try { const s = await DiscoveryService.register(req.body); res.status(201).json({ ok: true, data: s }); }
    catch (e) { next(e); }
  });
  router.post("/discovery/services/:instanceId/heartbeat", validate({ body: z.object({
    serviceId: z.string().optional(),
    status: svcStatusEnum.optional(),
    version: z.string().optional(),
    checks: z.record(z.string()).default({}),
    metrics: z.record(z.number()).optional(),
    uptimeSeconds: z.number().int().nonnegative().optional(),
  }).default({}) }), async (req, res, next) => {
    try {
      // heartbeat() only consumes status/version today; pass a clean report
      // (serviceId, checks, metrics, uptimeSeconds are accepted for forward-compat).
      const report = {
        serviceId: req.body.serviceId ?? "unknown",
        status: req.body.status,
        version: req.body.version,
        checks: req.body.checks ?? {},
        metrics: req.body.metrics,
        uptimeSeconds: req.body.uptimeSeconds ?? Math.round(process.uptime()),
      };
      const s = await DiscoveryService.heartbeat(req.params.instanceId, report);
      if (!s) return res.status(404).json({ ok: false, error: { message: "instance not found" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.delete("/discovery/services/:id", async (req, res, next) => {
    try { await DiscoveryService.deregister(req.params.id, req.query.instanceId as string | undefined); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
  router.get("/discovery/dependencies", async (req, res, next) => {
    try { res.json({ ok: true, data: DiscoveryService.getDependencies(req.query.service as string | undefined) }); }
    catch (e) { next(e); }
  });
  router.post("/discovery/dependencies", validate({ body: z.object({
    from: z.string(), to: z.string(),
    kind: z.enum(["http","event","grpc","internal"]).default("http"),
    criticality: z.enum(["required","optional"]).default("required"),
  }) }), async (req, res) => {
    DiscoveryService.addDependency(req.body); res.json({ ok: true });
  });
  router.get("/discovery/validate", (_req, res) => res.json({ ok: true, data: DiscoveryService.validateDependencies() }));

  // ── Event Bus (Slice 164) ──────────────────────────────────────
  router.get("/events/schemas", (_req, res) => res.json({ ok: true, data: EventBusService.listSchemas() }));
  router.post("/events/schemas", validate({ body: z.object({
    type: z.string().min(2), version: z.string().default("1.0.0"), producer: z.string(),
    description: z.string().default(""), consumers: z.array(z.string()).default([]),
    schema: z.record(z.any()).default({}), examples: z.array(z.any()).optional(), deprecated: z.boolean().optional(),
  }) }), (req, res) => res.status(201).json({ ok: true, data: EventBusService.registerSchema(req.body) }));
  router.get("/events/recent", (req, res) => {
    res.json({ ok: true, data: EventBusService.replay({
      eventType: req.query.type as string | undefined,
      since: req.query.since as string | undefined,
      correlationId: req.query.correlationId as string | undefined,
    }) });
  });
  router.post("/events/publish", validate({ body: z.object({
    type: z.string().min(2), payload: z.any(),
    schemaVersion: z.string().optional(), metadata: z.record(z.any()).optional(),
  }) }), async (req, res, next) => {
    try {
      const e = await EventBusService.publish(req.body.type, req.body.payload, {
        producer: req.user!.id,
        schemaVersion: req.body.schemaVersion,
        metadata: req.body.metadata,
      });
      res.status(202).json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.get("/events/dlq", (req, res) => res.json({ ok: true, data: EventBusService.listDLQ(req.query.status as any) }));
  router.post("/events/dlq/:id/replay", async (req, res) => res.json({ ok: true, data: { replayed: await EventBusService.replayDLQ(req.params.id) } }));
  router.post("/events/dlq/:id/discard", (req, res) => res.json({ ok: true, data: { discarded: EventBusService.discardDLQ(req.params.id) } }));

  // ── API Governance (Slice 165) ─────────────────────────────────
  router.get("/api-governance/endpoints", (req, res) => res.json({ ok: true, data: ApiGovernanceService.listEndpoints({
    method: req.query.method as any, version: req.query.version as string | undefined, serviceId: req.query.serviceId as string | undefined,
  }) }));
  router.get("/api-governance/versions", (_req, res) => res.json({ ok: true, data: ApiGovernanceService.getVersions() }));
  router.get("/api-governance/openapi", (_req, res) => {
    res.setHeader("Content-Type", "application/vnd.oai.openapi+json; charset=utf-8");
    res.json(ApiGovernanceService.getOpenApi());
  });
  router.get("/api-governance/openapi.yaml", (_req, res) => {
    res.setHeader("Content-Type", "application/yaml; charset=utf-8");
    const spec = ApiGovernanceService.getOpenApi();
    res.send(jsonToYaml(spec));
  });
}
