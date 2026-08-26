// @vitest-environment happy-dom
/**
 * Session 202 — toast store tests.
 *
 * toast() is the app-wide notification entry point. Its logic:
 *   - default kind "info" and 3500ms duration
 *   - convenience helpers set the right kind (error uses a longer 6000ms)
 *   - auto-dismiss after the duration; duration<=0 means sticky
 *   - manual dismiss removes only the targeted toast
 *   - each push returns a unique id
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast, useToastStore } from "./toast";

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe("toast defaults", () => {
  it("pushes an info toast with the default 3500ms duration", () => {
    toast("Hello");
    const list = useToastStore.getState().toasts;
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("info");
    expect(list[0]!.message).toBe("Hello");
    expect(list[0]!.duration).toBe(3500);
  });

  it("returns a unique id per push", () => {
    const a = toast("a");
    const b = toast("b");
    expect(a).not.toBe(b);
    expect(useToastStore.getState().toasts.map((t) => t.id)).toContain(a);
  });
});

describe("convenience helpers", () => {
  it("success sets kind and optional title", () => {
    toast.success("Saved", "Done");
    const t = useToastStore.getState().toasts[0]!;
    expect(t.kind).toBe("success");
    expect(t.title).toBe("Done");
  });

  it("error uses a longer 6000ms duration", () => {
    toast.error("Failed");
    expect(useToastStore.getState().toasts[0]!.duration).toBe(6000);
  });

  it("warn and info set their kinds", () => {
    toast.warn("careful");
    toast.info("fyi");
    const kinds = useToastStore.getState().toasts.map((t) => t.kind);
    expect(kinds).toEqual(["warning", "info"]);
  });
});

describe("auto-dismiss", () => {
  it("removes the toast after its duration elapses", () => {
    vi.useFakeTimers();
    toast("bye", { duration: 1000 });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("keeps a sticky toast when duration is 0", () => {
    vi.useFakeTimers();
    toast("sticky", { duration: 0 });
    vi.advanceTimersByTime(100000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe("manual dismiss", () => {
  it("removes only the targeted toast", () => {
    const a = toast("a", { duration: 0 });
    const b = toast("b", { duration: 0 });
    useToastStore.getState().dismiss(a);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(b);
  });
});
