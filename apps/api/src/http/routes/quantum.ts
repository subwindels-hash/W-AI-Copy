/** Session 63 — Quantum Readiness. Session 157 — inventory CRUD + honest connectors. */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { QuantumService } from "../../quantum/quantum.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import {
  CreateCryptoEntrySchema, UpdateCryptoEntrySchema, SubmitQuantumJobSchema,
} from "@windels/shared";

function oid(req: { user?: { organizationId?: string } }) {
  return (req.user as { organizationId?: string } | undefined)?.organizationId;
}

export function registerQuantumRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try { res.json({ ok: true, data: await QuantumService.dashboard(oid(req)) }); } catch (e) { next(e); }
  });
  router.get("/inventory", async (req, res, next) => {
    try { res.json({ ok: true, data: await QuantumService.inventory(oid(req)) }); } catch (e) { next(e); }
  });
  router.get("/inventory/:id", async (req, res, next) => {
    try {
      const e = await QuantumService.getInventory(req.params.id, oid(req));
      if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "inventory entry not found" } });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.post("/inventory", validate({ body: CreateCryptoEntrySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await QuantumService.createInventory(req.body, oid(req)) }); } catch (e) { next(e); }
  });
  router.patch("/inventory/:id", validate({ body: UpdateCryptoEntrySchema }), async (req, res, next) => {
    try {
      const e = await QuantumService.updateInventory(req.params.id, req.body, oid(req));
      if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "inventory entry not found" } });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.delete("/inventory/:id", async (req, res, next) => {
    try {
      const ok = await QuantumService.removeInventory(req.params.id, oid(req));
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "inventory entry not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id } });
    } catch (e) { next(e); }
  });
  router.get("/connectors", async (req, res, next) => {
    try { res.json({ ok: true, data: await QuantumService.connectors(oid(req)) }); } catch (e) { next(e); }
  });
  router.get("/jobs", async (req, res, next) => {
    try { res.json({ ok: true, data: await QuantumService.jobs(oid(req)) }); } catch (e) { next(e); }
  });
  router.post("/jobs", validate({ body: SubmitQuantumJobSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await QuantumService.submitJob({ ...req.body, organizationId: oid(req) }) });
    } catch (e) { next(e); }
  });

  const _notes = tenantStore<{ title: string; body: string; tags: string[] }>({ prefix: "qtm:notes", idPrefix: "qtm-" });
  const _NoteSchema = z.object({
    title: z.string().min(2).max(200),
    body: z.string().min(2).max(4000),
    tags: z.array(z.string().max(40)).max(20).default([]),
  });
  const _NoteId = z.object({ id: z.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const org = oid(req);
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(org, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const org = oid(req);
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(org, req.body, (req.user as { id: string }).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const org = oid(req);
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(org, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });
  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const org = oid(req);
      if (!org) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(org, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
