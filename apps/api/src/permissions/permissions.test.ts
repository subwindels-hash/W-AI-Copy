import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_CATEGORIES, permissionsRoutesSchema } from "@windels/shared/permissions";
describe("permissions shared", ()=>{
  it("all permissions grouped", ()=>{
    const cats = Object.values(PERMISSION_CATEGORIES).flat();
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(new Set(cats)).toEqual(new Set(ALL_PERMISSIONS));
    expect(PERMISSION_CATEGORIES.nfc).toEqual(["NFC_READ", "NFC_WRITE", "NFC_DESTRUCTIVE", "NFC_ADMIN"]);
  });
  it("routes schemas", ()=>{
    expect(()=> permissionsRoutesSchema.grant.parse({ targetUserId:"u1", permission:"ORG_READ" })).not.toThrow();
    expect(()=> permissionsRoutesSchema.grant.parse({ targetUserId:"u1", permission:"INVALID" as any })).toThrow();
  });
});
