/**
 * WINDELS AI OS — Advertising analytics export engine (pure Node, no deps).
 *
 * Renders advertising analytics as downloadable files in several formats:
 *
 *   - CSV   (RFC-4180-ish, quoted)          text/csv
 *   - JSON  (pretty-printed)                application/json
 *   - TXT   (plain table for logs/email)    text/plain
 *   - PDF   (minimal single/multi-page text PDF written by hand)
 *   - DOCX  (Word Open XML inside a stored ZIP written by hand)
 *
 * No third-party PDF/DOCX libraries are required — the PDF and ZIP/DOCX writers
 * below emit standards-compliant output so the files open in Acrobat, Preview,
 * Word, LibreOffice, Google Docs, etc. All numbers come from the caller (real
 * advertising analytics), never fabricated.
 */

/* ── Number/format helpers ─────────────────────────────────────── */

const usd = (micros: number) =>
  `$${(micros / 1_000_000).toFixed(2)}`;

interface ExportCampaignRow {
  id: string;
  name: string;
  mode: string;
  status: string;
  billingMode: string;
  automationLevel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
  revenueMicros: number;
  roas: number | null;
}

export interface AdvertisingExportData {
  generatedAt: string;
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpendMicros: number;
  totalRevenueMicros: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  roas: number | null;
  totalBudgetMicros: number;
  campaigns: ExportCampaignRow[];
  byMode: Record<string, { count: number; spendMicros: number; conversions: number; revenueMicros: number }>;
}

/* ── Shared row/table builders ─────────────────────────────────── */

function summaryLines(d: AdvertisingExportData): string[][] {
  return [
    ["Generated", d.generatedAt],
    ["Campaigns", `${d.totalCampaigns} (${d.activeCampaigns} active)`],
    ["Total spend", usd(d.totalSpendMicros)],
    ["Total revenue", usd(d.totalRevenueMicros)],
    ["ROAS", d.roas === null ? "—" : String(d.roas)],
    ["Conversions", String(d.totalConversions)],
    ["Impressions", String(d.totalImpressions)],
    ["Clicks", String(d.totalClicks)],
    ["Total budget", usd(d.totalBudgetMicros)],
  ];
}

const CAMP_HEADERS = ["Name", "Mode", "Status", "Billing", "Automation", "Impressions", "Clicks", "Conversions", "Spend", "Revenue", "ROAS"];

function campRow(r: ExportCampaignRow): (string | number)[] {
  return [
    r.name, r.mode, r.status, r.billingMode, r.automationLevel,
    r.impressions, r.clicks, r.conversions,
    usd(r.spendMicros), usd(r.revenueMicros), r.roas === null ? "—" : r.roas,
  ];
}

/* ── CSV ───────────────────────────────────────────────────────── */

function quoteCsv(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(d: AdvertisingExportData): string {
  const lines: string[] = [];
  lines.push(`WINDELS AI OS — Advertising Analytics,${quoteCsv(d.generatedAt)}`);
  lines.push("");
  for (const [k, v] of summaryLines(d)) lines.push(`${quoteCsv(k)},${quoteCsv(v)}`);
  lines.push("");
  lines.push(CAMP_HEADERS.map(quoteCsv).join(","));
  for (const r of d.campaigns) lines.push(campRow(r).map(quoteCsv).join(","));
  lines.push("");
  lines.push("By mode".split(",")[0] + "");
  lines.push(`${quoteCsv("Mode")},${quoteCsv("Count")},${quoteCsv("Spend")},${quoteCsv("Conversions")},${quoteCsv("Revenue")}`);
  for (const [mode, b] of Object.entries(d.byMode)) {
    lines.push(`${quoteCsv(mode)},${b.count},${quoteCsv(usd(b.spendMicros))},${b.conversions},${quoteCsv(usd(b.revenueMicros))}`);
  }
  return lines.join("\n") + "\n";
}

/* ── JSON ──────────────────────────────────────────────────────── */

export function toJson(d: AdvertisingExportData): string {
  return JSON.stringify(d, null, 2);
}

/* ── TXT ───────────────────────────────────────────────────────── */

function pad(s: string | number, width: number): string {
  const str = String(s);
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

export function toTxt(d: AdvertisingExportData): string {
  const out: string[] = [];
  out.push("WINDELS AI OS — Advertising Analytics Report");
  out.push("=".repeat(72));
  out.push("");
  for (const [k, v] of summaryLines(d)) out.push(`${pad(k + ":", 18)} ${v}`);
  out.push("");
  out.push("Campaigns");
  out.push("-".repeat(72));
  for (const r of d.campaigns) {
    out.push(`${pad(r.name, 26)} ${pad(r.mode, 12)} ${pad(r.status, 10)} ${pad(usd(r.spendMicros), 12)} ${pad(usd(r.revenueMicros), 12)} ${pad(r.conversions, 6)} conv`);
  }
  out.push("");
  out.push("By mode");
  out.push("-".repeat(72));
  for (const [mode, b] of Object.entries(d.byMode)) {
    out.push(`${pad(mode, 14)} ${b.count} campaign(s) · ${usd(b.spendMicros)} · ${b.conversions} conv · ${usd(b.revenueMicros)} rev`);
  }
  return out.join("\n") + "\n";
}

/* ── PDF (minimal, written by hand) ────────────────────────────── */

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

/**
 * Build a one-page-per-batch PDF. Text is laid out at 12pt Helvetica with a
 * 50pt left margin and 720pt top margin, ~22 lines per page.
 */
export function toPdf(d: AdvertisingExportData): Buffer {
  const pageW = 612, pageH = 792;
  const margin = 50, top = 720, lineH = 24;

  const lines: string[] = [];
  lines.push("WINDELS AI OS - Advertising Analytics");
  lines.push("");
  for (const [k, v] of summaryLines(d)) lines.push(`${k}: ${v}`);
  lines.push("");
  lines.push("Campaigns");
  for (const r of d.campaigns) {
    lines.push(`${r.name}  [${r.mode}/${r.status}]  ${usd(r.spendMicros)} spend  ${usd(r.revenueMicros)} rev  ${r.conversions} conv  ROAS ${r.roas ?? "-"}`);
  }
  lines.push("");
  lines.push("By mode");
  for (const [mode, b] of Object.entries(d.byMode)) {
    lines.push(`${mode}: ${b.count} campaign(s), ${usd(b.spendMicros)}, ${b.conversions} conv, ${usd(b.revenueMicros)} rev`);
  }

  const perPage = 26;
  const pages = Math.max(1, Math.ceil(lines.length / perPage));

  // Build PDF objects.
  const objects: Buffer[] = [];
  const offsets: number[] = [];
  let contentAcc = "";
  const contentStreams: Buffer[] = [];

  for (let p = 0; p < pages; p++) {
    const pageLines = lines.slice(p * perPage, (p + 1) * perPage);
    const content: string[] = [];
    content.push("BT");
    content.push("/F1 12 Tf");
    content.push(`${margin} ${top} Td`);
    content.push("14 TL");
    pageLines.forEach((ln, i) => {
      if (i === 0) {
        content.push(`/${p === 0 ? "F2" : "F1"} 14 Tf`);
      } else {
        content.push("/F1 12 Tf");
      }
      const y = top - i * lineH;
      if (y < 40) return; // skip off-page
      content.push(`1 0 0 1 ${margin} ${y} Tm`);
      content.push(`(${escapePdf(ln)}) Tj`);
    });
    content.push("ET");
    const stream = Buffer.from(content.join("\n"), "utf8");
    contentStreams.push(stream);
  }

  // Catalog
  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "utf8"));
  // Pages
  const kids = pages === 1 ? "3 0 R" : Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`, "utf8"));
  // Each page + its content stream + font objects
  for (let p = 0; p < pages; p++) {
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${objects.length + 2} 0 R /Resources << /Font << /F1 ${objects.length + 3} 0 R /F2 ${objects.length + 3} 0 R >> >> >>`, "utf8"));
    const len = contentStreams[p]!.length;
    objects.push(Buffer.from(`<< /Length ${len} >>\nstream\n`, "utf8"));
    objects.push(contentStreams[p]!);
    objects.push(Buffer.from("\nendstream", "utf8"));
    objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "utf8"));
  }

  // Assemble with xref
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i + 1} 0 obj\n`;
    pdf += objects[i]!.toString("utf8");
    pdf += "\nendobj\n";
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 0; i < objects.length; i++) {
    pdf += `${String(offsets[i]!).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

/* ── DOCX (Word Open XML in a stored ZIP) ──────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a valid (stored, uncompressed) ZIP buffer with local + central dirs. */
function zipEntries(entries: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags (UTF-8)
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, e.data);
    // central
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4); // version made by
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(0, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(e.data.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + e.data.length;
  }
  const centralDir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralDir, end]);
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toDocx(d: AdvertisingExportData): Buffer {
  const rows: string[] = [];
  const addHeading = (t: string) => rows.push(`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlEsc(t)}</w:t></w:r></w:p>`);
  const addPara = (t: string) => rows.push(`<w:p><w:r><w:t>${xmlEsc(t)}</w:t></w:r></w:p>`);
  const addTable = (headers: string[], data: (string | number)[][]) => {
    const trs = [headers, ...data].map((row) =>
      `<w:tr>${row.map((c) => `<w:tc><w:p><w:r><w:t>${xmlEsc(String(c))}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`,
    ).join("");
    rows.push(`<w:tbl>${trs}</w:tbl>`);
  };

  addHeading("WINDELS AI OS - Advertising Analytics");
  addPara(`Generated: ${d.generatedAt}`);
  addPara("");
  addHeading("Summary");
  addTable(
    ["Metric", "Value"],
    summaryLines(d).map(([k, v]) => [k, v]),
  );
  addPara("");
  addHeading("Campaigns");
  addTable(CAMP_HEADERS, d.campaigns.map(campRow));
  addPara("");
  addHeading("By mode");
  addTable(
    ["Mode", "Count", "Spend", "Conversions", "Revenue"],
    Object.entries(d.byMode).map(([m, b]) => [m, b.count, usd(b.spendMicros), b.conversions, usd(b.revenueMicros)]),
  );

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${rows.join("")}</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return zipEntries([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") },
  ]);
}

/* ── Format registry ───────────────────────────────────────────── */

export type ExportFormat = "csv" | "json" | "txt" | "pdf" | "docx";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string; mime: string }[] = [
  { value: "csv", label: "CSV", ext: ".csv", mime: "text/csv; charset=utf-8" },
  { value: "json", label: "JSON", ext: ".json", mime: "application/json" },
  { value: "txt", label: "TXT", ext: ".txt", mime: "text/plain; charset=utf-8" },
  { value: "pdf", label: "PDF", ext: ".pdf", mime: "application/pdf" },
  { value: "docx", label: "Word (DOCX)", ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
];

export function renderExport(d: AdvertisingExportData, format: ExportFormat): Buffer {
  switch (format) {
    case "csv": return Buffer.from(toCsv(d), "utf8");
    case "json": return Buffer.from(toJson(d), "utf8");
    case "txt": return Buffer.from(toTxt(d), "utf8");
    case "pdf": return toPdf(d);
    case "docx": return toDocx(d);
  }
}
