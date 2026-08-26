// @vitest-environment happy-dom
/**
 * Session 201 — Dropdown, OfflineBanner, and AnnouncementBar path logic.
 *
 * More app-wide primitives on the happy-dom harness: the Dropdown menu
 * (open/close, outside-click, Escape, item select, disabled items), the
 * OfflineBanner (reacts to online/offline events), and the isPublicPath helper
 * that gates where the marketing announcement bar shows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dropdown } from "./Dropdown";
import { OfflineBanner } from "./OfflineBanner";
import { isPublicPath } from "./AnnouncementBar";

beforeEach(() => cleanup());

describe("Dropdown", () => {
  it("opens on trigger click and closes after selecting an item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Dropdown trigger={<button>Menu</button>} items={[{ label: "Edit", onSelect }, { label: "Delete", danger: true }]} />);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByText("Menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull(); // closes after select
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    render(<div><Dropdown trigger={<button>Menu</button>} items={[{ label: "Edit" }]} /><button>outside</button></div>);
    await user.click(screen.getByText("Menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Dropdown trigger={<button>Menu</button>} items={[{ label: "Edit" }]} />);
    await user.click(screen.getByText("Menu"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders separators and does not fire disabled items", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Dropdown trigger={<button>Menu</button>} items={[{ label: "One" }, { label: "", separator: true }, { label: "Off", onSelect, disabled: true }]} />);
    await user.click(screen.getByText("Menu"));
    const disabled = screen.getByRole("menuitem", { name: "Off" });
    expect(disabled).toHaveProperty("disabled", true);
    await user.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("OfflineBanner", () => {
  it("is hidden while online and appears on an offline event", async () => {
    // happy-dom's navigator.onLine can default falsy; pin it online for the
    // initial render so we assert the event-driven transitions deterministically.
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByRole("status").textContent).toMatch(/offline/i);
    // Going back online triggers AnimatePresence's exit; the node unmounts after
    // the transition rather than synchronously, so wait for its removal.
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});

describe("isPublicPath", () => {
  it("treats marketing/site paths as public", () => {
    for (const p of ["/", "/pricing", "/about", "/blog/post-1", "/contact"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });
  it("treats authed app prefixes as non-public", () => {
    for (const p of ["/app", "/app/languages", "/admin", "/admin/users", "/platform/x", "/m/mobile", "/d/dash"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
  it("does not treat a lookalike prefix as an app path", () => {
    // "/application" is NOT under "/app/"
    expect(isPublicPath("/application")).toBe(true);
    expect(isPublicPath("/apps")).toBe(true);
  });
});
