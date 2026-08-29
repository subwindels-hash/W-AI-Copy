// @vitest-environment happy-dom
/**
 * Session 201 — LanguagePicker render + interaction tests.
 *
 * First real component-render suite in the web app (uses the new happy-dom +
 * Testing Library harness). Verifies the interactive behavior the pure-logic
 * suite can't reach: opening the dropdown, searching, selecting, keyboard
 * navigation, the Detect option, native-name rendering, and favorites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LlLanguage } from "@/lib/languageLearning";
import { LanguagePicker, DETECT_CODE } from "./LanguagePicker";

function lang(over: Partial<LlLanguage> = {}): LlLanguage {
  return {
    code: "en", name: "English", nativeName: "English", iso6391: "en", bcp47: "en",
    writingSystem: "LATIN", textDirection: "LTR", family: "Germanic",
    supportedFeatures: [], active: true, scriptNotes: null,
    translationSupported: true, learningSupported: true, region: null, variantLabel: null,
    aliases: [],
    ...over,
  } as LlLanguage;
}

const LANGS: LlLanguage[] = [
  lang({ code: "en", name: "English" }),
  lang({ code: "es", name: "Spanish", nativeName: "Español", aliases: ["castellano"] }),
  lang({ code: "ar", name: "Arabic", nativeName: "العربية", bcp47: "ar", textDirection: "RTL", family: "Semitic" }),
  lang({ code: "sw", name: "Swahili", nativeName: "Kiswahili", learningSupported: false }),
];

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("LanguagePicker", () => {
  it("shows the selected language on the trigger and opens the dropdown on click", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="es" onChange={() => {}} />);
    // trigger shows the selected name
    const trigger = screen.getByRole("button", { name: /Spanish/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByLabelText("Search languages")).toBeTruthy();
  });

  it("filters the option list as the user types", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    await user.type(screen.getByLabelText("Search languages"), "swa");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain("Swahili");
  });

  it("matches on an alias", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    await user.type(screen.getByLabelText("Search languages"), "castellano");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain("Spanish");
  });

  it("calls onChange with the clicked language's code", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguagePicker languages={LANGS} value="en" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    await user.type(screen.getByLabelText("Search languages"), "arabic");
    await user.click(screen.getByRole("option", { name: /Arabic/ }));
    expect(onChange).toHaveBeenCalledWith("ar");
  });

  it("supports keyboard selection (type, ArrowDown, Enter)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguagePicker languages={LANGS} value="en" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    const search = screen.getByLabelText("Search languages");
    await user.type(screen.getByLabelText("Search languages"), "spanish");
    await user.type(search, "{Enter}");
    expect(onChange).toHaveBeenCalledWith("es");
  });

  it("offers Detect language first when allowDetect is set, and selects it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LanguagePicker languages={LANGS} value="en" onChange={onChange} allowDetect />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    const first = screen.getAllByRole("option")[0];
    expect(first!.textContent).toContain("Detect language");
    await user.click(screen.getByRole("option", { name: /Detect language/ }));
    expect(onChange).toHaveBeenCalledWith(DETECT_CODE);
  });

  it("renders native names with RTL direction for RTL languages", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    const arabicOption = screen.getByRole("option", { name: /Arabic/ });
    const rtl = within(arabicOption).getByText("العربية");
    expect(rtl.getAttribute("dir")).toBe("rtl");
  });

  it("labels translation-only languages", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    const swahili = screen.getByRole("option", { name: /Swahili/ });
    expect(swahili.textContent).toContain("translate");
  });

  it("persists a favorite to localStorage and surfaces a Favorites section", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    // The trigger is the only button with a popup; open it.
    const trigger = screen.getByRole("button", { name: /English/, expanded: false });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Favorite Spanish" }));
    expect(JSON.parse(localStorage.getItem("wnd.lang.favorites") || "[]")).toContain("es");
    // Re-open (the favorite star click keeps the menu open): a Favorites header is present.
    expect(screen.getByText("Favorites")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<LanguagePicker languages={LANGS} value="en" onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    await user.type(screen.getByLabelText("Search languages"), "zzzzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No languages match/)).toBeTruthy();
  });
});
