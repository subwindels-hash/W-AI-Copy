/**
 * Session 19 — Enterprise Data Platform routes.
 *
 * Mounted at /api/v1/data (see server.ts). Covers:
 *  - /data/catalog        Schema Governance data asset catalog (Slice 166)
 *  - /data/catalog/:id    Asset detail + validation
 *  - /kg/entities         Knowledge Graph entity CRUD + search (Slices 167 + 169)
 *  - /kg/entities/:id     Entity detail + relations + traverse
 *  - /kg/relations        Relation creation/list
 *  - /kg/stats            Graph stats
 *  - /memory              Memory recall + write (Slice 168)
 *  - /memory/:id          Memory detail/revise/forget
 *  - /memory/context      Assemble bounded LLM context
 *  - /sync/jobs           Sync job list/toggle/run/recent-runs (Slice 170)
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { SchemaGovernanceService } from "../../enterprise/dataArchitecture/schemaGovernance.service.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import { MemoryService } from "../../enterprise/memory/memory.service.js";
import { SyncService } from "../../enterprise/sync/sync.service.js";

const AssetKindEnum = z.enum(["table","view","topic","bucket","index","api","file","document","graph","vector_index"]);
const ClassificationEnum = z.enum(["public","internal","confidential","restricted","pii"]);
const EntityKindEnum = z.enum(["user","agent","organization","workspace","project","document","conversation","message","task","workflow","service","event","topic","concept","memory","file","custom"]);
const RelationKindEnum = z.enum(["owns","member_of","authored","mentions","references","depends_on","part_of","related_to","produced_by","triggered_by","assigned_to","knows_about","used_in","preceded_by","custom"]);
const MemoryNamespaceEnum = z.enum(["user","agent","workspace","org","global","session"]);
const MemoryTypeEnum = z.enum(["fact","preference","episode","procedure","semantic","summary","feedback"]);

export function registerDataPlatformRoutes(router: Router) {
  router.use(authenticate);

  // ── Schema Governance (Slice 166) ──────────────────────────────────
  router.get("/catalog", (req, res, next) => {
    try {
      res.json({ ok: true, data: { assets: SchemaGovernanceService.list({
        kind: req.query.kind as any, classification: req.query.classification as any,
        namespace: req.query.namespace as string, tag: req.query.tag as string,
      }), stats: SchemaGovernanceService.stats() } });
    } catch (e) { next(e); }
  });
  router.get("/catalog/:id", (req, res) => {
    const a = SchemaGovernanceService.get(req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: { message: "asset not found" } });
    res.json({ ok: true, data: a });
  });
  router.post("/catalog", validate({ body: z.object({
    id: z.string().optional(),
    name: z.string().min(1), kind: AssetKindEnum, namespace: z.string().min(1),
    description: z.string().default(""), classification: ClassificationEnum,
    schema: z.record(z.any()).default({}),
    tags: z.array(z.string()).default([]),
    indexes: z.array(z.object({ name: z.string(), columns: z.array(z.string()), unique: z.boolean().optional() })).default([]),
    validationRules: z.array(z.object({ id: z.string(), rule: z.string(), severity: z.enum(["error","warn"]) })).default([]),
    owners: z.array(z.object({ userId: z.string(), role: z.enum(["owner","steward","consumer"]) })).default([]),
    lineage: z.object({ sources: z.array(z.string()).default([]), targets: z.array(z.string()).default([]) }).optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await SchemaGovernanceService.register(req.body) }); }
    catch (e) { next(e); }
  });
  router.patch("/catalog/:id", validate({ body: z.object({
    name: z.string().optional(), description: z.string().optional(),
    classification: ClassificationEnum.optional(), schema: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
  }) }), async (req, res, next) => {
    try {
      const a = await SchemaGovernanceService.update(req.params.id, req.body);
      if (!a) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.delete("/catalog/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await SchemaGovernanceService.remove(req.params.id) } }); }
    catch (e) { next(e); }
  });
  router.post("/catalog/:id/validate", validate({ body: z.object({ sample: z.record(z.any()).optional() }).default({}) }), (req, res) => {
    res.json({ ok: true, data: SchemaGovernanceService.validate(req.params.id, req.body.sample) });
  });

  // ── Knowledge Graph (Slices 167 + 169) ────────────────────────────
  router.get("/kg/entities", (req, res) => {
    const data = KnowledgeGraphService.query({
      kind: req.query.kind as any, tags: req.query.tag ? String(req.query.tag).split(",").filter(Boolean) : undefined,
      search: req.query.search as string,
      limit: Math.min(500, Number(req.query.limit ?? 100)), offset: Number(req.query.offset ?? 0),
    });
    res.json({ ok: true, data });
  });
  router.get("/kg/entities/:id", (req, res) => {
    const e = KnowledgeGraphService.get(req.params.id);
    if (!e) return res.status(404).json({ ok: false, error: { message: "entity not found" } });
    res.json({ ok: true, data: { entity: e, relations: KnowledgeGraphService.listRelations(e.id) } });
  });
  router.post("/kg/entities", validate({ body: z.object({
    id: z.string().optional(), kind: EntityKindEnum, name: z.string().min(1),
    attributes: z.record(z.any()).default({}), tags: z.array(z.string()).default([]),
    provenance: z.object({ source: z.string(), sourceId: z.string().optional() }).optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await KnowledgeGraphService.upsertEntity(req.body) }); }
    catch (e) { next(e); }
  });
  router.delete("/kg/entities/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await KnowledgeGraphService.removeEntity(req.params.id, req.query.cascade !== "false") } }); }
    catch (e) { next(e); }
  });
  router.get("/kg/entities/:id/traverse", (req, res) => {
    const triples = KnowledgeGraphService.traverse({
      rootId: req.params.id, depth: Math.min(5, Number(req.query.depth ?? 1)),
      relKinds: req.query.kind ? (Array.isArray(req.query.kind) ? req.query.kind : [req.query.kind]) as any : undefined,
      direction: (req.query.direction as any) ?? "both",
    });
    res.json({ ok: true, data: triples });
  });
  router.get("/kg/relations", (req, res) => {
    res.json({ ok: true, data: KnowledgeGraphService.listRelations(req.query.entity as string | undefined) });
  });
  router.post("/kg/relations", validate({ body: z.object({
    from: z.string().min(2), to: z.string().min(2), kind: RelationKindEnum,
    weight: z.number().min(0).max(1).optional(), attributes: z.record(z.any()).default({}),
  }) }), async (req, res, next) => {
    try {
      const r = await KnowledgeGraphService.addRelation(req.body);
      if (!r) return res.status(400).json({ ok: false, error: { message: "from/to entity must exist" } });
      res.status(201).json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.delete("/kg/relations/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await KnowledgeGraphService.removeRelation(req.params.id) } }); }
    catch (e) { next(e); }
  });
  router.get("/kg/stats", (_req, res) => res.json({ ok: true, data: KnowledgeGraphService.stats() }));

  // ── Memory Platform (Slice 168) ───────────────────────────────────
  router.get("/memory", (req, res) => {
    if (!req.query.namespace || !req.query.scopeId) {
      return res.status(400).json({ ok: false, error: { message: "namespace and scopeId required" } });
    }
    res.json({ ok: true, data: MemoryService.recall({
      namespace: req.query.namespace as any, scopeId: String(req.query.scopeId),
      type: req.query.type as any,
      tags: req.query.tag ? String(req.query.tag).split(",").filter(Boolean) : undefined,
      search: req.query.search as string,
      since: req.query.since as string, until: req.query.until as string,
      minImportance: req.query.minImportance != null ? Number(req.query.minImportance) : undefined,
      limit: Math.min(500, Number(req.query.limit ?? 100)),
    }) });
  });
  router.get("/memory/stats", (req, res) => {
    res.json({ ok: true, data: MemoryService.stats(req.query.namespace as any, req.query.scopeId as string) });
  });
  router.get("/memory/context", (req, res) => {
    if (!req.query.namespace || !req.query.scopeId) {
      return res.status(400).json({ ok: false, error: { message: "namespace and scopeId required" } });
    }
    res.json({ ok: true, data: MemoryService.buildContext(
      { namespace: req.query.namespace as any, scopeId: String(req.query.scopeId), type: req.query.type as any, tags: req.query.tag ? String(req.query.tag).split(",") : undefined, limit: 200 },
      { maxChars: Math.min(20_000, Number(req.query.maxChars ?? 12_000)) },
    ) });
  });
  router.get("/memory/:id", (req, res) => {
    const m = MemoryService.get(req.params.id);
    if (!m) return res.status(404).json({ ok: false });
    res.json({ ok: true, data: m });
  });
  router.post("/memory", validate({ body: z.object({
    namespace: MemoryNamespaceEnum, scopeId: z.string().min(1),
    type: MemoryTypeEnum, content: z.string().min(1),
    tags: z.array(z.string()).default([]),
    importance: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    source: z.string().optional(),
    metadata: z.record(z.any()).default({}),
    expiresAt: z.string().datetime().optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await MemoryService.remember(req.body) }); }
    catch (e) { next(e); }
  });
  router.post("/memory/:id/revise", validate({ body: z.object({
    content: z.string().optional(), tags: z.array(z.string()).optional(),
    importance: z.number().min(0).max(1).optional(), metadata: z.record(z.any()).optional(),
  }) }), async (req, res, next) => {
    try {
      const r = await MemoryService.revise(req.params.id, req.body);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.delete("/memory/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { forgotten: await MemoryService.forget(req.params.id) } }); }
    catch (e) { next(e); }
  });

  // ── Sync (Slice 170) ──────────────────────────────────────────────
  router.get("/sync/jobs", (_req, res) => res.json({ ok: true, data: SyncService.listJobs() }));
  router.get("/sync/jobs/:id", (req, res) => {
    const j = SyncService.getJob(req.params.id);
    if (!j) return res.status(404).json({ ok: false });
    res.json({ ok: true, data: j });
  });
  router.post("/sync/jobs/:id/toggle", validate({ body: z.object({ enabled: z.boolean() }) }), async (req, res, next) => {
    try {
      const j = await SyncService.toggle(req.params.id, req.body.enabled);
      if (!j) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: j });
    } catch (e) { next(e); }
  });
  router.post("/sync/jobs/:id/run", async (req, res, next) => {
    try {
      const r = await SyncService.runNow(req.params.id, { trigger: "manual" });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.get("/sync/runs", (req, res) => res.json({ ok: true, data: SyncService.recentRuns(Number(req.query.limit ?? 20)) }));
}
