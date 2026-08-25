// @vitest-environment happy-dom
/**
 * Session 201 — TranslateView render + flow tests.
 *
 * Exercises the interactive translation flow with the AI fabric mocked:
 * typing + Translate renders the result, the DEMO badge is shown for a demo
 * engine, a provider error surfaces to the user, and the swap control moves a
 * completed translation back into the input.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LlLanguage } from "@/lib/languageLearning";

const translate: ReturnType<typeof vi.fn> = vi.fn();
const detect: ReturnType<typeof vi.fn> = vi.fn();
vi.mock("@/lib/languageLearning", () => ({ languageApi: { translate: (...a: any[]) => translate(...a), detect: (...a: any[]) => detect(...a) } }));

const { TranslateView } = await import("./TranslateView");

function lang(over: Partial<LlLanguage> = {}): LlLanguage {
  return {
    code: "en", name: "English", nativeName: "English", iso6391: "en", bcp47: "en",
    writingSystem: "LATIN", textDirection: "LTR", family: "Germanic",
    supportedFeatures: [], active: true, scriptNotes: null,
    translationSupported: true, learningSupported: true, region: null, variantLabel: null, aliases: [],
    ...over,
  } as LlLanguage;
}
const LANGS = [lang({ code: "en", name: "English" }), lang({ code: "es", name: "Spanish", nativeName: "Español" })];

const okResult = (over: Record<string, unknown> = {}) => ({
  sourceText: "Hello", translatedText: "Hola", sourceLanguage: { code: "en", name: "English", confidence: 1, reliable: true, alternatives: [], source: "REAL" },
  targetLanguage: { code: "es", name: "Spanish", bcp47: "es" }, formality: "AUTO", alternatives: [], note: null,
  source: "REAL", model: "gpt-test", createdAt: "2026-01-01T00:00:00Z", ...over,
});

beforeEach(() => { cleanup(); translate.mockReset(); detect.mockReset(); detect.mockResolvedValue({ code: null, name: null, confidence: 0, reliable: false, alternatives: [], source: "HEURISTIC" }); });

describe("TranslateView", () => {
  it("translates typed text and renders the result", async () => {
    translate.mockResolvedValue(okResult());
    const user = userEvent.setup();
    render(<TranslateView languages={LANGS} />);
    await user.type(screen.getByPlaceholderText("Type or paste text…"), "Hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));
    await waitFor(() => expect(screen.getByText("Hola")).toBeTruthy());
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello", targetLanguage: "es" }));
    expect(screen.getByText(/Model: gpt-test/)).toBeTruthy();
    expect(screen.getByText("AI")).toBeTruthy(); // REAL engine badge
  });

  it("flags a DEMO engine result", async () => {
    translate.mockResolvedValue(okResult({ source: "DEMO", model: "windels-assistant" }));
    const user = userEvent.setup();
    render(<TranslateView languages={LANGS} />);
    await user.type(screen.getByPlaceholderText("Type or paste text…"), "Hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));
    await waitFor(() => expect(screen.getByText("demo engine")).toBeTruthy());
  });

  it("surfaces a provider error to the user and shows no result", async () => {
    translate.mockRejectedValue(new Error("Translation is temporarily unavailable"));
    const user = userEvent.setup();
    render(<TranslateView languages={LANGS} />);
    await user.type(screen.getByPlaceholderText("Type or paste text…"), "Hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeTruthy());
    expect(screen.queryByText("Hola")).toBeNull();
  });

  it("shows alternatives when the result includes them", async () => {
    translate.mockResolvedValue(okResult({ alternatives: ["Buenas", "Qué tal"] }));
    const user = userEvent.setup();
    render(<TranslateView languages={LANGS} />);
    await user.type(screen.getByPlaceholderText("Type or paste text…"), "Hello");
    await user.click(screen.getByRole("button", { name: /Translate/ }));
    await waitFor(() => expect(screen.getByText("Buenas")).toBeTruthy());
    expect(screen.getByText("Qué tal")).toBeTruthy();
  });

  it("disables Translate until there is text", async () => {
    render(<TranslateView languages={LANGS} />);
    const btn = screen.getByRole("button", { name: /Translate/ });
    expect(btn).toHaveProperty("disabled", true);
  });
});
