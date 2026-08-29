/**
 * FakePrisma adapter for the WhatsApp schema.
 *
 * FakePrisma is a generic in-memory store. Two behaviours the WhatsApp code
 * genuinely depends on are outside its scope, and faking them loosely would
 * make the tests pass while production stayed broken:
 *
 *  1. COMPOUND UNIQUE KEYS. Prisma addresses them as a single nested field
 *     (`where: { channelId_contactId: { channelId, contactId } }`). FakePrisma
 *     compares that key against a column of the same name, which no row has,
 *     so every lookup missed and every upsert inserted a new row.
 *
 *  2. UNIQUE CONSTRAINTS. The gateway's idempotency is built on catching P2002
 *     from `WhatsAppMessage.whatsappMessageId` and `WhatsAppWebhookEvent.eventId`.
 *     Without enforcement a duplicate is silently accepted and the
 *     de-duplication branch is never exercised.
 *
 * This adapter adds exactly those two, leaving everything else to FakePrisma.
 */
import { FakePrisma } from "../../../testUtils/fakePrisma.js";

/** Unique indexes this adapter enforces, mirroring schema.prisma. */
const UNIQUE: Record<string, string[][]> = {
  WhatsAppChannel: [["phoneNumberId"]],
  WhatsAppContact: [["whatsappChannelId", "whatsappUserId"]],
  WhatsAppConversation: [["channelId", "contactId"]],
  WhatsAppMessage: [["whatsappMessageId"]],
  WhatsAppWebhookEvent: [["eventId"]],
};

/** Rewrites `{ a_b: { a, b } }` into `{ a, b }` so FakePrisma can match it. */
function flattenWhere(model: string, where: any): any {
  if (!where || typeof where !== "object") return where;
  const indexes = UNIQUE[model];
  if (!indexes) return where;

  const out: any = { ...where };
  for (const fields of indexes) {
    if (fields.length < 2) continue;
    const key = fields.join("_");
    const nested = out[key];
    if (nested && typeof nested === "object") {
      delete out[key];
      Object.assign(out, nested);
    }
  }
  return out;
}

function uniqueViolation(fields: string[]) {
  const err: any = new Error(`Unique constraint failed on the fields: (\`${fields.join("`,`")}\`)`);
  err.code = "P2002";
  err.meta = { target: fields };
  return err;
}

export interface WaPrismaHandle {
  db: FakePrisma;
  prisma: any;
  reset(): void;
}

/**
 * Returns a Prisma-shaped client backed by FakePrisma, with WhatsApp compound
 * keys and unique constraints honoured.
 */
export function createWaPrisma(): WaPrismaHandle {
  const db = new FakePrisma();
  const base = db.client() as any;

  const wrapModel = (modelKey: string, model: any) => {
    // FakePrisma keys its tables by PascalCase model name.
    const modelName = modelKey.charAt(0).toUpperCase() + modelKey.slice(1);
    const indexes = UNIQUE[modelName];

    const assertUnique = (data: any, ignoreId?: string) => {
      if (!indexes || !data) return;
      const rows = db.tables.get(modelName) ?? [];
      for (const fields of indexes) {
        if (fields.some((f) => data[f] === undefined || data[f] === null)) continue;
        const clash = rows.some(
          (r) => r.id !== ignoreId && fields.every((f) => r[f] === data[f]),
        );
        if (clash) throw uniqueViolation(fields);
      }
    };

    return new Proxy(model, {
      get(target, prop: string) {
        const original = target[prop];
        if (typeof original !== "function") return original;

        switch (prop) {
          case "create":
            return async (args: any = {}) => {
              assertUnique(args.data);
              return original.call(target, args);
            };
          case "createMany":
            return async (args: any = {}) => {
              const items = Array.isArray(args.data) ? args.data : [args.data];
              for (const d of items) assertUnique(d);
              return original.call(target, args);
            };
          case "upsert":
            return async (args: any = {}) => {
              const where = flattenWhere(modelName, args.where);
              // Prisma merges the identifying fields into the create payload.
              const create = { ...(args.create ?? {}), ...where };
              return original.call(target, { ...args, where, create });
            };
          case "findUnique":
          case "findFirst":
          case "findMany":
          case "update":
          case "updateMany":
          case "delete":
          case "deleteMany":
          case "count":
            return async (args: any = {}) =>
              original.call(target, { ...args, where: flattenWhere(modelName, args.where) });
          default:
            return original.bind(target);
        }
      },
    });
  };

  const prisma = new Proxy(base, {
    get(target, prop: string) {
      const value = target[prop];
      if (typeof prop !== "string" || !prop.startsWith("whatsApp") || !value) return value;
      return wrapModel(prop, value);
    },
  });

  return {
    db,
    prisma,
    reset: () => db.reset(),
  };
}
