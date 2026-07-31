/** Session 63 — Quantum Readiness */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { QuantumService } from "../../quantum/quantum.service.js";

const JobSchema = z.object({
  kind: z.enum(["qaoa","vqe","annealer","hybrid_solver"]),
  problem: z.enum(["portfolio","routing","scheduling","chemistry","supply_chain"]),
  vendor: z.enum(["ibm","aws_braket","azure_quantum","google_cirq","dwave","local_simulator"]).optional(),
});

export function registerQuantumRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req,res,next)=>{try{res.json({ok:true,data:await QuantumService.dashboard((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/inventory", async (req,res,next)=>{try{res.json({ok:true,data:await QuantumService.inventory((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/connectors", async (req,res,next)=>{try{res.json({ok:true,data:await QuantumService.connectors((req.user as any).organizationId)});}catch(e){next(e);}});
  router.get("/jobs", async (req,res,next)=>{try{res.json({ok:true,data:await QuantumService.jobs((req.user as any).organizationId)});}catch(e){next(e);}});
  router.post("/jobs", validate({body:JobSchema}), async (req,res,next)=>{try{
    res.json({ok:true,data:await QuantumService.submitJob({...req.body, organizationId:(req.user as any).organizationId})});
  }catch(e){next(e);}});
}
