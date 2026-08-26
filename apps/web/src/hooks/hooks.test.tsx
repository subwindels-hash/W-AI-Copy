// @vitest-environment happy-dom
/**
 * Session 202 — shared React hooks tests.
 *
 * These hooks are reused across many pages, so their edge behaviour matters:
 *   - useDebounce: only emits the trailing value after the delay, resets timer
 *     on rapid changes
 *   - useClickOutside: fires only for clicks outside the ref, respects `enabled`
 *   - useKeyboardShortcut: modifier matching, and ignoring input/editable focus
 *   - useMediaQuery: initial match + reacting to change events
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef } from "react";
import { renderHook, act, render, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDebounce } from "./useDebounce";
import { useClickOutside } from "./useClickOutside";
import { useKeyboardShortcut } from "./useKeyboardShortcut";
import { useMediaQuery } from "./useMediaQuery";

beforeEach(() => cleanup());
afterEach(() => vi.useRealTimers());

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("a", 200));
    expect(result.current).toBe("a");
  });

  it("emits the latest value only after the delay elapses", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    expect(result.current).toBe("a"); // not yet
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("b");
  });

  it("resets the timer when the value changes again before firing", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ v: "c" });
    act(() => { vi.advanceTimersByTime(200); }); // 400ms since "b" but only 200 since "c"
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe("c");
  });
});

describe("useClickOutside", () => {
  function Fixture({ onOutside, enabled }: { onOutside: () => void; enabled?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useClickOutside(ref, onOutside, enabled);
    return (
      <div>
        <div ref={ref} data-testid="inside">inside</div>
        <button data-testid="outside">outside</button>
      </div>
    );
  }

  it("fires when clicking outside the ref element", async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    render(<Fixture onOutside={onOutside} />);
    await user.click(document.querySelector('[data-testid="outside"]')!);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it("does not fire when clicking inside the ref element", async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    render(<Fixture onOutside={onOutside} />);
    await user.click(document.querySelector('[data-testid="inside"]')!);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it("is inert when disabled", async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    render(<Fixture onOutside={onOutside} enabled={false} />);
    await user.click(document.querySelector('[data-testid="outside"]')!);
    expect(onOutside).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcut", () => {
  it("invokes the handler on a matching plain key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k" }, handler));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("requires the meta/ctrl modifier when combo.meta is set", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k", meta: true }, handler));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    });
    expect(handler).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores the shortcut when focus is in an input", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut({ key: "k" }, handler));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    });
    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });
});

describe("useMediaQuery", () => {
  function stubMatchMedia(matches: boolean) {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mql = {
      matches,
      media: "",
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
      dispatch: (m: boolean) => listeners.forEach((cb) => cb({ matches: m } as MediaQueryListEvent)),
    };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
    return mql;
  }

  it("returns the initial match value", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });

  it("updates when the media query change event fires", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
    act(() => { mql.dispatch(true); });
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });
});
