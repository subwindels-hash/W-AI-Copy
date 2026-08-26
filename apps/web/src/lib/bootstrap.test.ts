// @vitest-environment happy-dom
/**
 * Session 202 — auth bootstrap tests.
 *
 * bootstrapAuth() runs once at startup to hydrate/validate the session:
 *   - no-ops when there is no stored token
 *   - on success, normalizes /me into the auth store user (org id flattened,
 *     null displayName coerced to undefined)
 *   - on failure (invalid/expired token), clears the session
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("./api", () => ({ api: (...a: unknown[]) => apiMock(...a) }));

import { bootstrapAuth } from "./bootstrap";
import { useAuthStore } from "@/store/auth";

beforeEach(() => {
  apiMock.mockReset();
  useAuthStore.getState().clear();
});

const me = {
  id: "u1",
  email: "a@b.c",
  role: "admin" as const,
  displayName: null,
  organization: { id: "org1", slug: "org", name: "Org" },
  workspace: null,
};

it("does nothing when there is no stored access token", async () => {
  await bootstrapAuth();
  expect(apiMock).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user).toBeNull();
});

it("hydrates the store user from /me on success", async () => {
  useAuthStore.getState().setAuth("tok", "ref", { id: "x", email: "x@x", role: "user" }, 900);
  apiMock.mockResolvedValueOnce(me);
  await bootstrapAuth();
  expect(apiMock).toHaveBeenCalledWith("/me");
  const u = useAuthStore.getState().user!;
  expect(u.id).toBe("u1");
  expect(u.role).toBe("admin");
  expect(u.displayName).toBeUndefined(); // null coerced
  expect(u.organizationId).toBe("org1"); // flattened
});

it("clears the session when /me rejects (bad token)", async () => {
  useAuthStore.getState().setAuth("tok", "ref", { id: "x", email: "x@x", role: "user" }, 900);
  apiMock.mockRejectedValueOnce(new Error("401"));
  await bootstrapAuth();
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});
