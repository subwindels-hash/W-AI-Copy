import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_CATEGORIES, permissionsRoutesSchema } from "@windels/shared/permissions";
describe("permissions shared", ()=>{
  it("all permissions grouped", ()=>{
    expect(ALL_PERMISSIONS.length).toBe(18);
    const cats = Object.values(PERMISSION_CATEGORIES).flat();
    expect(cats.length).toBeGreaterThan(10);
  });
  it("routes schemas", ()=>{
    expect(()=> permissionsRoutesSchema.grant.parse({ targetUserId:"u1", permission:"ORG_READ" })).not.toThrow();
    expect(()=> permissionsRoutesSchema.grant.parse({ targetUserId:"u1", permission:"INVALID" as any })).toThrow();
  });
});
