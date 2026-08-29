// @vitest-environment happy-dom
/**
 * Session 201 — reusable UI primitive tests (Button, Switch, Tabs, Modal).
 *
 * These primitives are used across the entire app, so their behavior is high
 * leverage: a regression here affects every page. Verified on the happy-dom +
 * Testing Library harness.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
import { Modal } from "./Modal";

beforeEach(() => cleanup());

describe("Button", () => {
  it("fires onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled and non-clickable while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveProperty("disabled", true);
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("respects the disabled prop", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Switch", () => {
  it("exposes role=switch with aria-checked reflecting state", () => {
    render(<Switch checked={true} onChange={() => {}} label="Notifications" />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Notifications")).toBeTruthy();
  });

  it("toggles the value on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} disabled />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  function Fixture({ onValueChange }: { onValueChange?: (v: string) => void }) {
    return (
      <Tabs defaultValue="a" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>
    );
  }

  it("shows only the active panel and marks the active trigger", () => {
    render(<Fixture />);
    expect(screen.getByText("Panel A")).toBeTruthy();
    expect(screen.queryByText("Panel B")).toBeNull();
    expect(screen.getByRole("tab", { name: "Tab A" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Tab B" }).getAttribute("aria-selected")).toBe("false");
  });

  it("switches panels on trigger click and notifies onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Fixture onValueChange={onValueChange} />);
    await user.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(screen.getByText("Panel B")).toBeTruthy();
    expect(screen.queryByText("Panel A")).toBeNull();
  });

  it("wires aria-controls to the rendered panel", () => {
    render(<Fixture />);
    const trigger = screen.getByRole("tab", { name: "Tab A" });
    const panel = screen.getByRole("tabpanel");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Settings">body</Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog with content when open", () => {
    render(<Modal open onClose={() => {}} title="Settings">Body text</Modal>);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Settings");
    expect(within(dialog).getByText("Body text")).toBeTruthy();
  });

  it("closes via the close button and Escape key", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Settings">x</Modal>);
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close on Escape when closeOnEsc is false", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} closeOnEsc={false} title="Settings">x</Modal>);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
