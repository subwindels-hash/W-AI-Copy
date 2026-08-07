import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import voiceModule from "../../voice/voice.module.js";
import { voiceRoutesSchema } from "@windels/shared/voice";

export function registerVoiceRoutes(router: Router) {
  router.use(authenticate);

  /**
   * GET /api/v1/voice/dashboard
   * Get combined voice dashboard (Studio + Foundry)
   */
  router.get("/dashboard", async (req, res, next) => {
    try {
      const dashboard = await voiceModule.getDashboard();
      res.json({
        ok: true,
        data: dashboard,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  // ─── Voice Studio Endpoints ────────────────────────────────────────────────

  /**
   * GET /api/v1/voice/builtin
   * Get built-in voices (from Voice Studio)
   */
  router.get("/builtin", async (req, res, next) => {
    try {
      const voices = await voiceModule.getBuiltinVoices();
      res.json({
        ok: true,
        data: voices,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/voice/custom
   * Get custom voices (from Voice Studio)
   */
  router.get("/custom", async (req, res, next) => {
    try {
      const voices = await voiceModule.getCustomVoices();
      res.json({
        ok: true,
        data: voices,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/voice/presets
   * Get voice presets
   */
  router.get("/presets", async (req, res, next) => {
    try {
      const presets = await voiceModule.getPresets();
      res.json({
        ok: true,
        data: presets,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/v1/voice/synthesize
   * Synthesize speech (from Voice Studio)
   */
  router.post(
    "/synthesize",
    voiceModule.ensureBootstrapped,
    async (req, res, next) => {
      try {
        const { text, voiceId, settings } = req.body;
        const job = await voiceModule.synthesize(text, voiceId, settings);
        res.json({
          ok: true,
          data: job,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  // ─── Voice Foundry Endpoints ───────────────────────────────────────────────

  /**
   * GET /api/v1/voice/generated
   * Get generated voices (from Voice Foundry)
   */
  router.get("/generated", async (req, res, next) => {
    try {
      const voices = await voiceModule.getGeneratedVoices();
      res.json({
        ok: true,
        data: voices,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/v1/voice/design
   * Create a voice design (from Voice Foundry)
   */
  router.post(
    "/design",
    validate({ body: voiceRoutesSchema.voiceDesign }),
    async (req, res, next) => {
      try {
        const design = await voiceModule.createVoiceDesign(req.body);
        res.json({
          ok: true,
          data: design,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * POST /api/v1/voice/:voiceId/evolve
   * Evolve a voice (from Voice Foundry)
   */
  router.post(
    "/:voiceId/evolve",
    validate({ params: voiceRoutesSchema.voiceId, body: voiceRoutesSchema.evolveOps }),
    async (req, res, next) => {
      try {
        const voice = await voiceModule.evolveVoice(req.params.voiceId, req.body.operations);
        if (!voice) {
          return res.status(404).json({
            ok: false,
            error: { code: "NOT_FOUND", message: "Voice not found" },
          });
        }
        res.json({
          ok: true,
          data: voice,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * GET /api/v1/voice/deployments
   * Get deployments (from Voice Foundry)
   */
  router.get("/deployments", async (req, res, next) => {
    try {
      const { voiceId } = req.query;
      const deployments = await voiceModule.getDeployments(voiceId as string | undefined);
      res.json({
        ok: true,
        data: deployments,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/v1/voice/:voiceId/deploy
   * Deploy a voice (from Voice Foundry)
   */
  router.post(
    "/:voiceId/deploy",
    validate({ params: voiceRoutesSchema.voiceId, body: voiceRoutesSchema.deployTarget }),
    async (req, res, next) => {
      try {
        const deployment = await voiceModule.deployVoice(req.params.voiceId, req.body.target);
        res.json({
          ok: true,
          data: deployment,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * GET /api/v1/voice/packs
   * Get voice packs (from Voice Foundry)
   */
  router.get("/packs", async (req, res, next) => {
    try {
      const packs = await voiceModule.getVoicePacks();
      res.json({
        ok: true,
        data: packs,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  // ─── Notes (shared pattern) ────────────────────────────────────────────────

  /**
   * GET /api/v1/voice/notes
   */
  router.get("/notes", async (_req, res) => {
    res.json({ ok: true, data: [], meta: { requestId: _req.requestId } });
  });

  /**
   * POST /api/v1/voice/notes
   */
  router.post("/notes", validate({ body: voiceRoutesSchema.note }), async (req, res) => {
    res.json({ ok: true, data: req.body, meta: { requestId: req.requestId } });
  });

  /**
   * PATCH /api/v1/voice/notes/:id
   */
  router.patch(
    "/notes/:id",
    validate({ params: voiceRoutesSchema.noteId, body: voiceRoutesSchema.note }),
    async (req, res) => {
      res.json({ ok: true, data: { ...req.body, id: req.params.id }, meta: { requestId: req.requestId } });
    },
  );

  /**
   * DELETE /api/v1/voice/notes/:id
   */
  router.delete(
    "/notes/:id",
    validate({ params: voiceRoutesSchema.noteId }),
    async (_req, res) => {
      res.json({ ok: true, data: { deleted: true }, meta: { requestId: _req.requestId } });
    },
  );
}
