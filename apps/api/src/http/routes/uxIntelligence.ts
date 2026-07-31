import { Router } from "express";
import { UxIntelligenceService } from "../../uxIntelligence/uxIntelligence.service.js";

export function registerUxIntelligenceRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.dashboard() }); } catch(e){next(e);} });
  router.get("/tokens", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.listTokens() }); } catch(e){next(e);} });
  router.get("/components", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.listComponents() }); } catch(e){next(e);} });
  router.get("/findings", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.listFindings() }); } catch(e){next(e);} });
  router.get("/agents", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.listAgents() }); } catch(e){next(e);} });
  router.get("/brands", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.listBrands() }); } catch(e){next(e);} });
  router.get("/devices", (_req, res) => res.json({ ok:true, data: UxIntelligenceService.deviceClasses() }));
  router.post("/qa/run", async (_req, res, next) => { try { res.json({ ok:true, data: await UxIntelligenceService.runDesignQa() }); } catch(e){next(e);} });
}
