/** Session 61 — Data & Knowledge Marketplace */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { DataMarketplaceService } from "../../dataMarketplace/dataMarketplace.service.js";
import { MKT_ASSET_KINDS, MKT_LICENSE_MODELS } from "@windels/shared";

const PublishSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(MKT_ASSET_KINDS),
  description: z.string().min(5),
  licenseModel: z.enum(MKT_LICENSE_MODELS),
  priceUsd: z.number().nonnegative().optional(),
  subscriptionMonthlyUsd: z.number().nonnegative().optional(),
  royaltyPct: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  complianceTags: z.array(z.string()).optional(),
  rows: z.number().int().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  publisher: z.string().optional(),
});
const ReviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().optional() });

export function registerDataMarketplaceRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ok:true,data:await DataMarketplaceService.dashboard((req.user as any).organizationId)}); } catch(e){next(e);} });
  router.get("/assets", async (req, res, next) => { try {
    const kind = (req.query.kind as any) || undefined;
    res.json({ok:true,data:await DataMarketplaceService.list((req.user as any).organizationId, kind)});
  } catch(e){next(e);} });
  router.get("/assets/:id", async (req, res, next) => { try {
    const a = await DataMarketplaceService.get(req.params.id, (req.user as any).organizationId);
    if (!a) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"asset not found"}});
    res.json({ok:true,data:a});
  } catch(e){next(e);} });
  router.post("/assets", validate({body:PublishSchema}), async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.publish({...req.body, organizationId:(req.user as any).organizationId, createdBy:(req.user as any).id})});
  } catch(e){next(e);} });
  router.post("/assets/:id/install", async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.install(req.params.id, (req.user as any).id, (req.user as any).organizationId)});
  } catch(e){next(e);} });
  router.post("/assets/:id/review", validate({body:ReviewSchema}), async (req,res,next) => { try {
    res.json({ok:true,data:await DataMarketplaceService.review(req.params.id, (req.user as any).id, req.body.rating, req.body.comment, (req.user as any).organizationId)});
  } catch(e){next(e);} });
}
