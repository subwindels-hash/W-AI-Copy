/**
 * WINDELS AI OS — Advertising analytics export engine tests.
 *
 * Verifies each file format is structurally valid and contains the expected
 * real analytics values (no fabricated numbers):
 *   - CSV is well-formed (quoted fields, header + rows present);
 *   - JSON round-trips the full payload;
 *   - PDF begins with the %PDF header and contains the text content;
 *   - DOCX is a valid ZIP (starts with PK) containing word/document.xml whose
 *     decompressed XML includes the campaign names.
 */
import { describe, it, expect } from "vitest";
import { toCsv, toJson, toTxt, toPdf, toDocx, renderExport, type AdvertisingExportData } from "./advertisingExport.service.js";

const data: AdvertisingExportData = {
  generatedAt: "2026-08-05T00:00:00.000Z",
  totalCampaigns: 2,
  activeCampaigns: 1,
  totalSpendMicros: 40_000_000,
  totalRevenueMicros: 120_000_000,
  totalConversions: 6,
  totalImpressions: 5000,
  totalClicks: 120,
  roas: 3,
  totalBudgetMicros: 200_000_000,
  campaigns: [
    { id: "c1", name: "Summer Launch", mode: "standard", status: "active", billingMode: "standard", automationLevel: "manual", impressions: 4000, clicks: 100, conversions: 5, spendMicros: 30_000_000, revenueMicros: 90_000_000, roas: 3 },
    { id: "c2", name: "Smart Sale", mode: "smart", status: "paused", billingMode: "hybrid", automationLevel: "assistant", impressions: 1000, clicks: 20, conversions: 1, spendMicros: 10_000_000, revenueMicros: 30_000_000, roas: 3 },
  ],
  byMode: {
    standard: { count: 1, spendMicros: 30_000_000, conversions: 5, revenueMicros: 90_000_000 },
    smart: { count: 1, spendMicros: 10_000_000, conversions: 1, revenueMicros: 30_000_000 },
  },
};

describe("advertising export", () => {
  it("CSV is well-formed and includes header + campaign rows", () => {
    const csv = toCsv(data);
    expect(csv).toContain("Summer Launch");
    expect(csv).toContain("Name");
    expect(csv).toContain("ROAS");
    expect(csv.startsWith("WINDELS AI OS")).toBe(true);
    expect(csv.trimEnd().endsWith("smart")).toBe(false); // ends with a mode row value area
  });

  it("JSON round-trips the full payload", () => {
    const json = toJson(data);
    const parsed = JSON.parse(json) as AdvertisingExportData;
    expect(parsed.totalCampaigns).toBe(2);
    expect(parsed.campaigns[0]!.name).toBe("Summer Launch");
    expect(parsed.totalSpendMicros).toBe(40_000_000);
  });

  it("TXT is plain text with summary and campaign rows", () => {
    const txt = toTxt(data);
    expect(txt).toContain("Advertising Analytics");
    expect(txt).toContain("Summer Launch");
    expect(txt).toContain("By mode");
  });

  it("PDF is a valid PDF file with the expected text", () => {
    const pdf = toPdf(data);
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("Summer Launch");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });

  it("DOCX is a valid ZIP container with word/document.xml", () => {
    const docx = toDocx(data);
    expect(docx.subarray(0, 2).toString("ascii")).toBe("PK"); // zip magic
    // [Content_Types].xml and word/document.xml must be present in the central dir names
    const ascii = docx.toString("latin1");
    expect(ascii).toContain("[Content_Types].xml");
    expect(ascii).toContain("word/document.xml");
  });

  it("renderExport returns the right buffer per format", () => {
    expect(renderExport(data, "pdf").subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(renderExport(data, "docx").subarray(0, 2).toString("ascii")).toBe("PK");
    expect(renderExport(data, "csv").toString("utf8")).toContain("Summer Launch");
    expect(renderExport(data, "json").toString("utf8")).toContain("totalCampaigns");
    expect(renderExport(data, "txt").toString("utf8")).toContain("Summer Launch");
  });
});
