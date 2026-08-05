import { PrismaClient } from "@prisma/client/wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { startSpan, getCtx } from "../observability/tracer.js";

// Import FakePrisma and bcryptjs for seeding
import { FakePrisma } from "../testUtils/fakePrisma.js";
import bcrypt from "bcryptjs";

// Seed standard data into FakePrisma so authentication and contexts work out of the box
function seedFakeDb(fake: FakePrisma) {
  const adminId = "user-admin";
  const orgId = "org-windels";
  const wsId = "ws-default";

  const passwordHash = bcrypt.hashSync("W1ndels!Admin#2026", 10);

  // 1. Seed user
  fake.seed("User", [
    {
      id: adminId,
      email: "admin@windels.ai",
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      isSuspended: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);

  fake.seed("UserProfile", [
    {
      id: "profile-admin",
      userId: adminId,
      displayName: "Super Admin",
      theme: "dark",
      locale: "en-US",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);

  // 2. Seed organization
  fake.seed("Organization", [
    {
      id: orgId,
      name: "Windels AI",
      slug: "windels-ai",
      settings: {},
      whiteLabel: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);

  // 3. Seed workspace
  fake.seed("Workspace", [
    {
      id: wsId,
      organizationId: orgId,
      name: "Default Workspace",
      slug: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);

  // 4. Seed membership
  fake.seed("Membership", [
    {
      id: "membership-admin",
      userId: adminId,
      organizationId: orgId,
      workspaceId: wsId,
      role: "OWNER",
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);

  // 5. Seed agents
  const starterAgents = [
    { name: "Executor", role: "Task Executor", color: "azure", emoji: "⚡" },
    { name: "Researcher", role: "Researcher", color: "violet", emoji: "🔬" },
    { name: "Analyst", role: "Analyst", color: "teal", emoji: "📊" },
    { name: "Creative", role: "Creative", color: "fuchsia", emoji: "✨" },
    { name: "Coordinator", role: "Coordinator", color: "amber", emoji: "🧭" },
  ];

  fake.seed("Agent", starterAgents.map((a, i) => ({
    id: `agent-seed-${i}`,
    organizationId: orgId,
    name: a.name,
    role: a.role,
    color: a.color,
    emoji: a.emoji,
    description: `Seeded ${a.name} agent`,
    isBuiltIn: true,
    status: "ONLINE",
    modelId: "windels-assistant",
    createdAt: new Date(),
    updatedAt: new Date(),
  })));
}

// Check if we should use Mock database fallback
let useMock = env.NODE_ENV === "test";

function createPrismaClient() {
  if (useMock) {
    logger.info("Initializing in-memory FakePrisma client for testing");
    const fake = new FakePrisma();
    seedFakeDb(fake);
    return fake.client();
  }

  try {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const adapter = new PrismaPg(pool, { schema: "public" });
    const p = new PrismaClient({
      adapter,
      log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    return withObservability(p);
  } catch (err) {
    // FAIL CLOSED: a database init failure must never silently swap to an
    // in-memory demo database (seeded with demo admin/org/agents) — that would
    // let production run on fake data that looks real. The in-memory FakePrisma
    // fallback is available ONLY when explicitly enabled and NOT in production.
    const allowMock = env.WINDELS_ALLOW_MOCK_DB_FALLBACK === true;
    if (env.NODE_ENV === "production" || !allowMock) {
      logger.error("Prisma initialization failed — refusing to fall back to the in-memory demo DB. Set WINDELS_ALLOW_MOCK_DB_FALLBACK=true in a non-production environment to permit it.", { err });
      throw err;
    }
    logger.warn("Prisma initialization failed; falling back to FakePrisma (dev/test only)", { err });
    useMock = true;
    const fake = new FakePrisma();
    seedFakeDb(fake);
    return fake.client();
  }
}

function withObservability(p: PrismaClient) {
  p.$use(async (params: any, next: any) => {
    const t0 = performance.now();
    const model = params.model ?? "raw";
    const action = params.action;
    let status: "ok" | "error" = "ok";
    let err: any;
    try {
      return await next(params);
    } catch (e) {
      status = "error";
      err = e;
      throw e;
    } finally {
      const ms = performance.now() - t0;
      Metrics.timing("db.query.duration_ms", ms, { model, action, status });
      Metrics.increment("db.query.count", 1, { model, action, status });
      if (status === "error") {
        logger.warn(`db ${model}.${action} failed`, { model, action, ms: Math.round(ms), err: err?.message });
      } else if (ms > 500) {
        logger.debug(`db slow query ${model}.${action} ${Math.round(ms)}ms`, { model, action, ms: Math.round(ms) });
      }
      const ctx = getCtx();
      if (ctx && ms > 50) {
        const sp = startSpan(`db ${model}.${action}`, { kind: "client", attrs: { "db.model": model, "db.operation": action, "db.duration_ms": Math.round(ms), "db.status": status } });
        sp.end(status, err?.message);
      }
    }
  });
  return p;
}

export const prisma = (globalThis as any).__windels_prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production" && !useMock) {
  (globalThis as any).__windels_prisma = prisma;
}

if (!useMock) {
  prisma.$on("error" as never, (e: Error) => {
    logger.error("Prisma client error", { err: e });
  });
}
