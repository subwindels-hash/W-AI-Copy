/**
 * In-memory stand-in for the Prisma client.
 *
 * The core CRUD services (agents, conversations, attachments, prompt
 * templates, public API keys) are pure Prisma consumers, so they could only be
 * exercised against a live Postgres — which meant they shipped with no tests at
 * all. This fake implements the subset of the Prisma surface those services
 * actually use, so their access-control and tenancy rules can be verified
 * without infrastructure.
 *
 * Supported per model: create, createMany, findUnique, findFirst, findMany,
 * update, updateMany, delete, deleteMany, count — with `where` (including
 * nested `OR`, `some`, `contains`, `not`, `in`, `gte`/`lt`), `orderBy`, `skip`,
 * `take`, `select`, `include`, and `_count`. Relations are resolved by
 * convention (`<model>Id` -> `<model>`), which covers every include these
 * services perform.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Row = Record<string, any>;

/**
 * Scalar `@default(...)` values parsed straight out of schema.prisma.
 *
 * Real Prisma fills these in on create; without them a service that reads e.g.
 * `agent.status` gets undefined and crashes in a way it never would against a
 * real database. Parsing the schema keeps the fake honest as the schema evolves
 * instead of hard-coding a list that silently drifts.
 */
function loadSchemaDefaults(): Map<string, Row> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, "../../prisma/schema.prisma");
  const out = new Map<string, Row>();
  let text = "";
  try { text = fs.readFileSync(schemaPath, "utf8"); } catch { return out; }

  for (const m of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = m;
    const defaults: Row = {};
    for (const line of body.split("\n")) {
      const f = line.match(/^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s+.*@default\(([^)]*)\)/);
      if (!f) continue;
      const [, field, type, isList, , raw] = f;
      if (/autoincrement|cuid|uuid|dbgenerated/.test(raw)) continue;
      let value: any;
      if (isList) value = [];
      else if (raw === "now()") value = undefined;         // set by create()
      else if (raw === "true" || raw === "false") value = raw === "true";
      else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
      else value = raw.replace(/^"|"$/g, "");              // string or enum member
      if (value !== undefined) defaults[field] = value;
      void type;
    }
    if (Object.keys(defaults).length) out.set(model, defaults);
  }
  return out;
}

const SCHEMA_DEFAULTS = loadSchemaDefaults();

let seq = 0;
/** Prisma cuids are opaque; tests only need uniqueness and the cuid shape. */
export function cuid(): string {
  seq += 1;
  return `c${Date.now().toString(36)}${seq.toString(36).padStart(6, "0")}`;
}

function matchScalar(value: any, cond: any): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && +value === +cond;
  if (typeof cond !== "object" || Array.isArray(cond)) return value === cond;

  for (const [op, operand] of Object.entries(cond as Row)) {
    switch (op) {
      case "equals": if (value !== operand) return false; break;
      case "not": if (matchScalar(value, operand)) return false; break;
      case "in": if (!(operand as any[]).includes(value)) return false; break;
      case "notIn": if ((operand as any[]).includes(value)) return false; break;
      case "contains": {
        const hay = String(value ?? "");
        const needle = String(operand);
        const ci = (cond as Row).mode === "insensitive";
        if (!(ci ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle))) return false;
        break;
      }
      case "startsWith": if (!String(value ?? "").startsWith(String(operand))) return false; break;
      case "gte": if (!(value >= operand)) return false; break;
      case "gt": if (!(value > operand)) return false; break;
      case "lte": if (!(value <= operand)) return false; break;
      case "lt": if (!(value < operand)) return false; break;
      case "mode": break; // handled alongside `contains`
      default: return false;
    }
  }
  return true;
}

export class FakePrisma {
  /** model name -> rows */
  tables = new Map<string, Row[]>();

  private rows(model: string): Row[] {
    if (!this.tables.has(model)) this.tables.set(model, []);
    return this.tables.get(model)!;
  }

  reset() { this.tables.clear(); }

  /** Seed rows directly, bypassing service logic. */
  seed(model: string, rows: Row[]) {
    this.rows(model).push(...rows.map((r) => ({ ...r })));
  }

  private matches(model: string, row: Row, where?: Row): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (key === "AND") {
        if (!(cond as Row[]).every((c) => this.matches(model, row, c))) return false;
        continue;
      }
      if (key === "OR") {
        if (!(cond as Row[]).some((c) => this.matches(model, row, c))) return false;
        continue;
      }
      if (key === "NOT") {
        if (this.matches(model, row, cond as Row)) return false;
        continue;
      }
      // Relation filter: { participants: { some: {...} } }
      if (cond && typeof cond === "object" && ("some" in cond || "every" in cond || "none" in cond)) {
        const related = this.relatedRows(model, row, key);
        const inner = (cond as Row).some ?? (cond as Row).every ?? (cond as Row).none;
        const hits = related.filter((r) => this.matches(this.relatedModel(key), r, inner));
        if ("some" in cond && hits.length === 0) return false;
        if ("every" in cond && hits.length !== related.length) return false;
        if ("none" in cond && hits.length > 0) return false;
        continue;
      }
      if (!matchScalar(row[key], cond)) return false;
    }
    return true;
  }

  /** `participants` -> `ConversationParticipant`, `messages` -> `Message`. */
  relatedModel(field: string, parentModel?: string): string {
    const singular = field.endsWith("s") ? field.slice(0, -1) : field;
    const known: Record<string, string> = {
      participant: "ConversationParticipant",
      message: "Message",
      event: "AgentEvent",
      attachment: "MessageAttachment",
      // User.profile points at UserProfile, not a "Profile" model — without
      // this, a `profile: { create: {...} }` write was persisted to a phantom
      // "Profile" table and never read back via userProfile.findUnique.
      profile: "UserProfile",
      // Named relation `createdById -> User` used by Canvas (and others); the
      // model name "CreatedBy" does not exist, so map it explicitly.
      createdBy: "User",
    };
    // Relations whose target is prefixed by the owning model rather than named
    // after the field — e.g. TalkChannel.members holds TalkMember rows, not
    // "Member" rows. Without this, `include: { members: true }` silently
    // resolved to an empty list and every private-channel membership check
    // looked like a non-member.
    const prefixed: Record<string, Record<string, string>> = {
      TalkChannel: { member: "TalkMember", message: "TalkMessage" },
      TalkMessage: { attachment: "MessageAttachment" },
      // Meeting.participants -> MeetingParticipant (not the shared
      // ConversationParticipant that `participant` otherwise maps to).
      Meeting: { participant: "MeetingParticipant" },
    };
    if (parentModel && prefixed[parentModel]?.[singular]) {
      return prefixed[parentModel]![singular]!;
    }
    return known[singular] ?? singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  private relatedRows(model: string, row: Row, field: string): Row[] {
    const target = this.relatedModel(field, model);
    const rows = this.rows(target);
    // Prisma names the back-reference after the *relation*, which is not always
    // the full model name: TalkMember points at TalkChannel via `channelId`,
    // not `talkChannelId`. Try the model-derived key first, then the same name
    // with a known prefix stripped, so both conventions resolve.
    const candidates = [`${model.charAt(0).toLowerCase()}${model.slice(1)}Id`];
    for (const prefix of ["Talk", "Canvas", "Agent", "Project"]) {
      if (model.startsWith(prefix) && model.length > prefix.length) {
        const bare = model.slice(prefix.length);
        candidates.push(`${bare.charAt(0).toLowerCase()}${bare.slice(1)}Id`);
      }
    }
    for (const fk of candidates) {
      if (rows.some((r) => fk in r)) return rows.filter((r) => r[fk] === row.id);
    }
    return [];
  }

  private hydrate(model: string, row: Row, opts: Row = {}): Row {
    const out: Row = { ...row };
    const inc = opts.include ?? {};
    for (const [field, spec] of Object.entries(inc)) {
      if (!spec) continue;
      if (field === "_count") {
        const counts: Row = {};
        for (const c of Object.keys((spec as Row).select ?? {})) {
          counts[c] = this.relatedRows(model, row, c).length;
        }
        out._count = counts;
        continue;
      }
      // to-one by convention: <field>Id on this row
      const fkOnSelf = `${field}Id`;
      if (fkOnSelf in row) {
        const target = this.relatedModel(field, model);
        const found = this.rows(target).find((r) => r.id === row[fkOnSelf]) ?? null;
        out[field] = found ? this.hydrate(target, found, typeof spec === "object" ? spec as Row : {}) : null;
        continue;
      }
      // to-many
      const target = this.relatedModel(field, model);
      out[field] = this.relatedRows(model, row, field)
        .map((r) => this.hydrate(target, r, typeof spec === "object" ? spec as Row : {}));
    }
    if (opts.select) {
      const sel: Row = {};
      for (const k of Object.keys(opts.select)) if (opts.select[k]) sel[k] = out[k];
      return sel;
    }
    return out;
  }

  /** Exposed to delegates (groupBy) as well as findMany. */
  sort(rows: Row[], orderBy?: Row | Row[]): Row[] {
    if (!orderBy) return rows;
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        for (const [field, dir] of Object.entries(spec)) {
          const av = a[field], bv = b[field];
          if (av === bv) continue;
          const less = av === null || av === undefined ? true
            : bv === null || bv === undefined ? false
            : av < bv;
          return (less ? -1 : 1) * (dir === "desc" ? -1 : 1);
        }
      }
      return 0;
    });
  }

  /** Build the `prisma.<model>` delegate object. */
  private delegate(model: string) {
    const self = this;
    return {
      async create({ data, include, select }: Row) {
        // Split scalar fields from nested relation writes (`{ create: … }`).
        // Previously the whole `data` object was stored verbatim, so a nested
        // create was persisted as a literal `{ create: {...} }` value and the
        // related row was never inserted. Any service doing
        //   organization.create({ data: { workspaces: { create: {...} } },
        //                         include: { workspaces: true } })
        // then read `org.workspaces[0].id` as undefined and crashed — which is
        // what hid the Google OAuth provisioning path from its own tests.
        const scalars: Row = {};
        const nested: Array<[string, Row[]]> = [];
        for (const [key, value] of Object.entries(data ?? {})) {
          if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
              && "create" in (value as Row)) {
            const payload = (value as Row).create;
            nested.push([key, Array.isArray(payload) ? payload as Row[] : [payload as Row]]);
          } else {
            scalars[key] = value;
          }
        }

        const row: Row = {
          id: scalars.id ?? cuid(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(SCHEMA_DEFAULTS.get(model) ?? {}),
          ...scalars,
        };
        self.rows(model).push(row);

        // Insert each related row with the back-reference Prisma would set.
        const fk = `${model.charAt(0).toLowerCase()}${model.slice(1)}Id`;
        for (const [field, payloads] of nested) {
          const target = self.relatedModel(field, model);
          for (const p of payloads) {
            self.rows(target).push({
              id: p.id ?? cuid(),
              createdAt: new Date(),
              updatedAt: new Date(),
              ...(SCHEMA_DEFAULTS.get(target) ?? {}),
              [fk]: row.id,
              ...p,
            });
          }
        }

        return self.hydrate(model, row, { include, select });
      },
      async createMany({ data }: Row) {
        const items = Array.isArray(data) ? data : [data];
        for (const d of items) {
          self.rows(model).push({
            id: d.id ?? cuid(), createdAt: new Date(), updatedAt: new Date(),
            ...(SCHEMA_DEFAULTS.get(model) ?? {}), ...d,
          });
        }
        return { count: items.length };
      },
      async findUnique({ where, include, select }: Row) {
        const row = self.rows(model).find((r) => self.matches(model, r, where));
        return row ? self.hydrate(model, row, { include, select }) : null;
      },
      async findFirst({ where, include, select, orderBy }: Row = {}) {
        const rows = self.sort(self.rows(model).filter((r) => self.matches(model, r, where)), orderBy);
        return rows[0] ? self.hydrate(model, rows[0], { include, select }) : null;
      },
      async findMany({ where, include, select, orderBy, skip, take, distinct }: Row = {}) {
        let rows = self.sort(self.rows(model).filter((r) => self.matches(model, r, where)), orderBy);
        if (distinct) {
          const fields: string[] = Array.isArray(distinct) ? distinct : [distinct];
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            const key = JSON.stringify(fields.map((f) => r[f]));
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
        }
        if (skip) rows = rows.slice(skip);
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map((r) => self.hydrate(model, r, { include, select }));
      },
      async update({ where, data, include, select }: Row) {
        const row = self.rows(model).find((r) => self.matches(model, r, where));
        if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        for (const [k, v] of Object.entries(data as Row)) {
          if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + (v as Row).increment;
          else if (v && typeof v === "object" && "decrement" in v) row[k] = (row[k] ?? 0) - (v as Row).decrement;
          else row[k] = v;
        }
        row.updatedAt = new Date();
        return self.hydrate(model, row, { include, select });
      },
      /**
       * UPSERT — update when `where` matches, otherwise create.
       *
       * Added for the mobile device registry, which upserts on a device id that
       * may not exist yet. Mirrors Prisma's semantics: the `create` payload is
       * merged with the `where` clause so the identifying field is present on
       * the new row.
       */
      async upsert({ where, create, update, include, select }: Row) {
        const row = self.rows(model).find((r) => self.matches(model, r, where));
        if (row) {
          for (const [k, v] of Object.entries((update ?? {}) as Row)) {
            if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + (v as Row).increment;
            else if (v && typeof v === "object" && "decrement" in v) row[k] = (row[k] ?? 0) - (v as Row).decrement;
            else if (v !== undefined) row[k] = v;
          }
          row.updatedAt = new Date();
          return self.hydrate(model, row, { include, select });
        }
        return this.create({ data: { ...(create ?? {}) }, include, select });
      },
      async updateMany({ where, data }: Row) {
        const rows = self.rows(model).filter((r) => self.matches(model, r, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
        return { count: rows.length };
      },
      async delete({ where }: Row) {
        const list = self.rows(model);
        const i = list.findIndex((r) => self.matches(model, r, where));
        if (i < 0) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        return list.splice(i, 1)[0];
      },
      async deleteMany({ where }: Row = {}) {
        const list = self.rows(model);
        const keep = list.filter((r) => !self.matches(model, r, where));
        const n = list.length - keep.length;
        self.tables.set(model, keep);
        return { count: n };
      },
      /** Supports _count / _sum / _avg / _min / _max over a filtered set. */
      async aggregate({ where, _count, _sum, _avg, _min, _max }: Row = {}) {
        const rows = self.rows(model).filter((r) => self.matches(model, r, where));
        const nums = (f: string) => rows.map((r) => Number(r[f] ?? 0));
        const out: Row = {};
        if (_count) out._count = typeof _count === "object"
          ? Object.fromEntries(Object.keys(_count).map((f) => [f, rows.length]))
          : rows.length;
        for (const [key, spec, fn] of [
          ["_sum", _sum, (v: number[]) => v.reduce((a, b) => a + b, 0)],
          ["_avg", _avg, (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)],
          ["_min", _min, (v: number[]) => (v.length ? Math.min(...v) : null)],
          ["_max", _max, (v: number[]) => (v.length ? Math.max(...v) : null)],
        ] as Array<[string, Row | undefined, (v: number[]) => number | null]>) {
          if (!spec) continue;
          out[key] = Object.fromEntries(Object.keys(spec).map((f) => [f, fn(nums(f))]));
        }
        return out;
      },

      /** groupBy with _count/_sum aggregates, as used by the rollup services. */
      async groupBy({ by, where, _count, _sum, orderBy }: Row) {
        const fields: string[] = Array.isArray(by) ? by : [by];
        const rows = self.rows(model).filter((r) => self.matches(model, r, where));
        const groups = new Map<string, Row[]>();
        for (const r of rows) {
          const key = JSON.stringify(fields.map((f) => r[f]));
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        }
        let out = [...groups.entries()].map(([key, members]) => {
          const g: Row = {};
          const values = JSON.parse(key) as any[];
          fields.forEach((f, i) => { g[f] = values[i]; });
          if (_count) g._count = typeof _count === "object"
            ? Object.fromEntries(Object.keys(_count).map((f) => [f, members.length]))
            : members.length;
          if (_sum) g._sum = Object.fromEntries(
            Object.keys(_sum).map((f) => [f, members.reduce((a, m) => a + Number(m[f] ?? 0), 0)]),
          );
          return g;
        });
        if (orderBy) out = self.sort(out, orderBy);
        return out;
      },

      async count({ where }: Row = {}) {
        return self.rows(model).filter((r) => self.matches(model, r, where)).length;
      },
    };
  }

  /** Proxy so `prisma.anyModel` resolves lazily, like the real client. */
  client() {
    const cache = new Map<string, any>();
    return new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          // Prisma accepts either an array of promises or an interactive
          // callback receiving a transactional client. Support both.
          return async (arg: any) =>
            typeof arg === "function" ? arg(this.client()) : Promise.all(arg);
        }
        if (prop === "$queryRaw" || prop === "$executeRaw") return async () => [];
        if (prop === "$connect" || prop === "$disconnect") return async () => undefined;
        if (typeof prop !== "string" || prop.startsWith("$")) return undefined;
        const model = prop.charAt(0).toUpperCase() + prop.slice(1);
        if (!cache.has(model)) cache.set(model, this.delegate(model));
        return cache.get(model);
      },
    }) as any;
  }
}
