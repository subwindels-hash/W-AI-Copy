/**
 * Stand-in for `@prisma/client` in unit tests that run on FakePrisma.
 *
 * WHY THIS EXISTS
 * ---------------
 * Many service files import runtime enum *values* from `@prisma/client`
 * (e.g. `Role.SUPER_ADMIN`, `TalkMessageType.DM`). In the real Prisma package
 * those exports only exist after `prisma generate` has produced the generated
 * client — which requires a native engine binary downloaded from
 * `binaries.prisma.sh`. In environments where that host is unreachable,
 * `import ... from "@prisma/client"` throws `Cannot find module
 * '.prisma/client/default'` (or `/wasm`) and the whole test file fails to
 * *collect*, even though the tests themselves run entirely on the in-memory
 * FakePrisma.
 *
 * This module provides those enum values for tests. Every enum in the schema is
 * parsed at load time (the same technique FakePrisma uses for `@default`
 * values), so the mock never drifts from `schema.prisma`. Prisma string enums
 * store member name == value, so each member maps to its own name string, which
 * is exactly what the generated client produces.
 *
 * Usage in a test file, before its service `await import(...)`:
 *
 *   vi.mock("@prisma/client", async () => ({
 *     ...(await import("../testUtils/prismaClientMock.js")),
 *   }));
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, "../../prisma/schema.prisma");

/** Parse `enum Name { A, B }` blocks out of schema.prisma into {A:"A",B:"B"}. */
function loadEnums(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let text = "";
  try { text = fs.readFileSync(schemaPath, "utf8"); } catch { return out; }
  for (const m of text.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const members: Record<string, string> = {};
    for (const line of body.split("\n")) {
      const member = line.match(/^\s*(\w+)\s*$/);
      if (member) members[member[1]!] = member[1]!;
    }
    out[name] = members;
  }
  return out;
}

const enums = loadEnums();

/** Minimal class stub in case a service constructs a client directly. */
export class PrismaClient {
  constructor() {
    throw new Error(
      "PrismaClient is stubbed in tests — mock '../db/client.js' to FakePrisma instead of constructing a real client."
    );
  }
}

/** Common runtime namespace members; `Prisma.*` types are erased at runtime. */
export const Prisma = {
  JsonNull: "JsonNull",
  DbNull: "DbNull",
  AnyNull: "AnyNull",
  validator: (x: unknown) => x,
  empty: undefined,
  join: (x: unknown) => x,
  sql: (x: unknown) => x,
};

// Export every schema enum. Some enums (e.g. `Role`) are also imported under
// aliases, and code may reference the enum object directly, so export both the
// object and, for convenience, make every member an exact string.
export const Role = enums.Role ?? {};
export const MembershipRole = enums.MembershipRole ?? {};
export const InvitationStatus = enums.InvitationStatus ?? {};
export const TaskStatus = enums.TaskStatus ?? {};
export const TaskPriority = enums.TaskPriority ?? {};
export const ActivityType = enums.ActivityType ?? {};
export const MessageRole = enums.MessageRole ?? {};
export const MessageStatus = enums.MessageStatus ?? {};
export const AgentStatus = enums.AgentStatus ?? {};
export const TalkChannelType = enums.TalkChannelType ?? {};
export const TalkChannelAccess = enums.TalkChannelAccess ?? {};
export const TalkMessageType = enums.TalkMessageType ?? {};
export const ActionItemStatus = enums.ActionItemStatus ?? {};
export const ActionItemPriority = enums.ActionItemPriority ?? {};
export const ApiKeyScope = enums.ApiKeyScope ?? {};
export const MeetingStatus = enums.MeetingStatus ?? {};
export const NotetakerStatus = enums.NotetakerStatus ?? {};
export const AlertSeverity = enums.AlertSeverity ?? {};
export const Permission = enums.Permission ?? {};
// Workflow engine enums (Session 120 tests drive runWorkflow end to end).
export const WorkflowStatus = enums.WorkflowStatus ?? {};
export const WorkflowRunStatus = enums.WorkflowRunStatus ?? {};
export const WorkflowNodeType = enums.WorkflowNodeType ?? {};
export const NodeRunStatus = enums.NodeRunStatus ?? {};

// Catch-all for any enum imported that isn't named above: this is only a
// convenience; services import the named constants, which are covered above.
const allEnums = enums;
export { allEnums as PrismaEnums };
