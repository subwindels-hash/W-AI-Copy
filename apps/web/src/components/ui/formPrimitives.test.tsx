// @vitest-environment happy-dom
/**
 * Session 202 — remaining reusable UI primitives (Input, Textarea, Select,
 * Badge, Avatar, Card family, Skeleton/Spinner, DataBanner, Tooltip).
 *
 * These leaf components render across every page. The goal is to lock in their
 * public contract: ref forwarding, prop pass-through, controlled-input
 * behaviour, variant selection, and accessible fallbacks. Verified green on the
 * happy-dom + Testing Library harness.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Select } from "./Select";
import { Badge } from "./Badge";
import { Avatar } from "./Avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card";
import { Skeleton, Spinner } from "./Skeleton";
import { DataBanner } from "./DataBanner";
import { Tooltip } from "./Tooltip";

beforeEach(() => cleanup());

describe("Input", () => {
  it("forwards its ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="Email" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.placeholder).toBe("Email");
  });

  it("passes native attributes through and accepts typed input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input type="text" aria-label="username" onChange={onChange} />);
    const el = screen.getByLabelText("username") as HTMLInputElement;
    await user.type(el, "abc");
    expect(el.value).toBe("abc");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("merges a custom className with the base classes", () => {
    render(<Input aria-label="q" className="custom-x" />);
    const el = screen.getByLabelText("q");
    expect(el.className).toContain("custom-x");
    expect(el.className).toContain("rounded-lg");
  });
});

describe("Textarea", () => {
  it("forwards its ref and honours disabled", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} disabled aria-label="notes" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect((screen.getByLabelText("notes") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("is editable and reports changes", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="notes" />);
    const el = screen.getByLabelText("notes") as HTMLTextAreaElement;
    await user.type(el, "hello");
    expect(el.value).toBe("hello");
  });
});

describe("Select", () => {
  it("renders its option children and reflects the chosen value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select aria-label="lang" defaultValue="en" onChange={onChange}>
        <option value="en">English</option>
        <option value="fr">French</option>
      </Select>
    );
    const el = screen.getByLabelText("lang") as HTMLSelectElement;
    expect(el.value).toBe("en");
    await user.selectOptions(el, "fr");
    expect(el.value).toBe("fr");
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards its ref to the select element", () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="s">
        <option value="a">A</option>
      </Select>
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});

describe("Badge", () => {
  it("renders content and applies the default variant styling", () => {
    render(<Badge>New</Badge>);
    const el = screen.getByText("New");
    expect(el.className).toContain("bg-white/10");
    expect(el.className).toContain("rounded-full");
  });

  it("applies variant-specific classes", () => {
    render(<Badge variant="danger">Alert</Badge>);
    expect(screen.getByText("Alert").className).toContain("text-crimson");
  });

  it("forwards its ref and extra props", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Badge ref={ref} data-testid="b" title="hint">x</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(screen.getByTestId("b").getAttribute("title")).toBe("hint");
  });
});

describe("Avatar", () => {
  it("renders an img with alt text when a url is supplied", () => {
    render(<Avatar name="Ada Lovelace" url="https://example.com/a.png" />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/a.png");
    expect(img.getAttribute("alt")).toBe("Ada Lovelace");
  });

  it("derives up-to-two uppercase initials when no url is given", () => {
    render(<Avatar name="ada lovelace" />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("falls back to 'W' when no name is provided", () => {
    render(<Avatar />);
    expect(screen.getByText("W")).toBeTruthy();
  });

  it("respects a custom pixel size", () => {
    render(<Avatar name="Sam" size={64} />);
    const el = screen.getByText("S");
    expect(el.style.width).toBe("64px");
    expect(el.style.height).toBe("64px");
  });
});

describe("Card family", () => {
  it("composes header/title/description/content/footer with forwarded refs", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Card ref={ref} data-testid="card">
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Manage your plan</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>
          <button>Save</button>
        </CardFooter>
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(ref.current).toBe(card);
    expect(within(card).getByText("Billing").tagName).toBe("H3");
    expect(within(card).getByText("Manage your plan")).toBeTruthy();
    expect(within(card).getByText("Body")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Save" })).toBeTruthy();
  });
});

describe("Skeleton / Spinner", () => {
  it("renders a pulsing skeleton block with merged classes", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("h-4");
  });

  it("renders a decorative spinner hidden from the a11y tree", () => {
    const { container } = render(<Spinner size={24} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("class")).toContain("animate-spin");
  });
});

describe("DataBanner", () => {
  it("renders the default simulation label and message", () => {
    render(<DataBanner />);
    expect(screen.getByText("SIMULATION")).toBeTruthy();
    expect(screen.getByText(/simulated\/demo data/i)).toBeTruthy();
  });

  it("uses the variant's label and default copy", () => {
    render(<DataBanner variant="demo-ai" />);
    expect(screen.getByText("DEMO AI")).toBeTruthy();
    expect(screen.getByText(/No real AI model is configured/i)).toBeTruthy();
  });

  it("allows overriding title and message", () => {
    render(<DataBanner variant="no-data" title="CUSTOM" message="override text" />);
    expect(screen.getByText("CUSTOM")).toBeTruthy();
    expect(screen.getByText("override text")).toBeTruthy();
    expect(screen.queryByText("MARKET DATA SOURCE REQUIRED")).toBeNull();
  });
});

describe("Tooltip", () => {
  it("shows content on hover after the delay and hides on leave", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Help text" delay={0}>
        <button>Info</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.hover(screen.getByRole("button", { name: "Info" }));
    expect(await screen.findByRole("tooltip")).toHaveProperty("textContent", "Help text");
    await user.unhover(screen.getByRole("button", { name: "Info" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
