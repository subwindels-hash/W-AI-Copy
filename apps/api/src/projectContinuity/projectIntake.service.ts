/**
 * Session 84 — Project Continuity Engine (main service).
 *
 * Full gate: streaming archive inspection (bomb/path/symlink) → optional ClamAV
 * scan → encrypted quarantine with retention → safe extraction → inventory →
 * static verification → sandboxed build/typecheck/test gate → snapshots/diffs/
 * rollback + change log → aggregate health report + inferred architecture map.
 * Untrusted code is never executed in the API process (PC_SANDBOX_MODE=none by
 * default reports not_configured honestly).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, readdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { inspectArchive } from "./inspection.service.js";
import { quarantineArchive, readQuarantinedArchive, deleteQuarantinedArchive, sweepExpiredQuarantine } from "./quarantine.service.js";
import { scanBufferWithClamav, clamavConfigured } from "./clamav.service.js";
import { runSandboxValidation, sandboxMode } from "./sandbox.service.js";
import { createSnapshot, listSnapshots, diffSnapshots, rollbackToSnapshot, listChangelog, appendChangelog } from "./snapshots.service.js";
import type {
  PcArchitectureMap, PcArchiveInspection, PcHealthReport, PcInventory, PcProject, PcSandboxResult, PcVerification,
} from "@windels/shared";

const execFile = promisify(execFileCb);
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 10_000;
const ROOT = path.resolve(process.cwd(), "project-intake");
const K = {
  project: (org: string, id: string) => `project84:${org}:project:${id}`,
  projects: (org: string) => `project84:${org}:projects`,
  change: (org: string, id: string) => `project84:${org}:changelog:${id}`,
};

type IntakeFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

function archiveKind(buffer: Buffer, filename: string): string {
  const lower = filename.toLowerCase();
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || lower.endsWith(".zip")) return "zip";
  if (buffer.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) || lower.endsWith(".7z")) return "7z";
  if (buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) || lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar") || lower.endsWith(".tar.bz2") || lower.endsWith(".tar.xz")) return "tar";
  return "file";
}

function scanText(buffer: Buffer): Array<{ kind: string; severity: "high" | "medium"; message: string }> {
  const text = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("latin1");
  const findings: Array<{ kind: string; severity: "high" | "medium"; message: string }> = [];
  const secretPatterns = [/(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:password|secret|token|api[_-]?key)\s*[:=]\s*[^\s"']{8,}/i];
  if (secretPatterns.some((pattern) => pattern.test(text))) findings.push({ kind: "secret", severity: "high", message: "Potential credential detected; content quarantined and value redacted." });
  if (/\.\.(?:\\|\/)|\x00/.test(text)) findings.push({ kind: "archive_path", severity: "high", message: "Potential path traversal or null-byte archive entry detected." });
  if (/powershell\s+-enc|curl\s+[^\n]+\|\s*(?:sh|bash)|rm\s+-rf\s+\//i.test(text)) findings.push({ kind: "script", severity: "medium", message: "Potentially dangerous script pattern detected; manual review required." });
  return findings;
}

function safeEntry(entry: string) { return Boolean(entry) && !entry.includes("\0") && !path.isAbsolute(entry) && !entry.split(/[\\/]+/).includes(".."); }

async function archiveEntries(kind: string, archive: string): Promise<string[]> {
  if (kind === "zip") return (await execFile("unzip", ["-Z1", archive], { maxBuffer: 8 * 1024 * 1024 })).stdout.split(/\r?\n/).filter(Boolean);
  if (kind === "tar" || kind === "tar.gz") return (await execFile("tar", ["-tf", archive], { maxBuffer: 8 * 1024 * 1024 })).stdout.split(/\r?\n/).filter(Boolean);
  throw AppError.badRequest("Safe extraction currently supports ZIP and TAR archives only; 7Z remains quarantined pending a configured extractor");
}

async function treeStats(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  async function visit(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      const full = path.join(dir, name);
      const s = await lstat(full);
      if (s.isSymbolicLink()) throw AppError.badRequest("Archive contains a symlink");
      if (s.isDirectory()) await visit(full);
      else { files++; bytes += s.size; if (files > MAX_FILES || bytes > MAX_EXTRACTED_BYTES) throw AppError.badRequest("Archive exceeds safe extraction limits"); }
    }
  }
  await visit(root);
  return { files, bytes };
}

async function verificationWorkspace(root: string): Promise<PcVerification> {
  const findings: Array<{ category: string; severity: "high" | "medium" | "low"; file: string; message: string }> = [];
  const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "target", "vendor"]);
  const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".json", ".yml", ".yaml", ".md", ".sql"]);
  async function walk(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      if (ignored.has(name)) continue;
      const full = path.join(dir, name);
      const stat = await lstat(full);
      if (stat.isDirectory()) await walk(full);
      else if (textExt.has(path.extname(name).toLowerCase()) && stat.size <= 1_000_000) {
        const text = await readFile(full, "utf8").catch(() => "");
        const file = path.relative(root, full);
        const todoCount = (text.match(/\b(?:TODO|FIXME|XXX)\b/g) ?? []).length;
        if (todoCount) findings.push({ category: "incomplete", severity: "low", file, message: `${todoCount} TODO/FIXME marker(s)` });
        if (/Math\.random\s*\(/.test(text)) findings.push({ category: "demo_data", severity: "medium", file, message: "Math.random() detected; verify this is not synthetic production data" });
        if (/not implemented|placeholder|mock data|fake data/i.test(text)) findings.push({ category: "placeholder", severity: "medium", file, message: "Placeholder/demo language detected" });
        if (/api[_-]?key\s*[:=]|password\s*[:=]|private key/i.test(text)) findings.push({ category: "secret_review", severity: "high", file, message: "Potential hard-coded credential pattern; value intentionally omitted" });
      }
    }
  }
  await walk(root);
  const summary = {
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  return {
    verifiedAt: new Date().toISOString(),
    status: summary.high ? "needs_security_review" : summary.medium ? "partial" : "static_checks_passed",
    summary,
    findings: findings.slice(0, 1000),
    execution: { build: "not_run_requires_sandbox", typecheck: "not_run_requires_sandbox", tests: "not_run_requires_sandbox" },
  };
}

async function inventoryWorkspace(root: string): Promise<PcInventory> {
  const files: string[] = []; const languages: Record<string, number> = {}; const manifests: string[] = []; const routes: string[] = []; const services: string[] = []; const tests: string[] = [];
  const extLanguage: Record<string, string> = { ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".py": "Python", ".go": "Go", ".java": "Java", ".rb": "Ruby", ".php": "PHP", ".rs": "Rust", ".cs": "C#", ".swift": "Swift", ".kt": "Kotlin", ".sql": "SQL" };
  const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "target", "vendor"]);
  async function walk(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      if (ignored.has(name)) continue;
      const full = path.join(dir, name);
      const stat = await lstat(full);
      if (stat.isDirectory()) await walk(full);
      else {
        const relative = path.relative(root, full);
        files.push(relative);
        const lang = extLanguage[path.extname(name).toLowerCase()];
        if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
        if (["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "docker-compose.yml", "Dockerfile", "prisma/schema.prisma"].some((m) => relative.endsWith(m))) manifests.push(relative);
        if (/route|routes|controller/i.test(relative)) routes.push(relative);
        if (/service|handler|worker|job/i.test(relative)) services.push(relative);
        if (/(^|\/)(__tests__\/|.*\.(test|spec)\.[^.]+$)/i.test(relative)) tests.push(relative);
      }
    }
  }
  await walk(root);
  const packageFiles = files.filter((f) => path.basename(f) === "package.json").slice(0, 20);
  const packages: PcInventory["packages"] = [];
  for (const file of packageFiles) {
    try {
      const parsed = JSON.parse(await readFile(path.join(root, file), "utf8"));
      packages.push({ file, name: parsed.name, scripts: Object.keys(parsed.scripts ?? {}), dependencies: [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})].slice(0, 100) });
    } catch { /* malformed manifest is reported by presence only */ }
  }
  return { scannedAt: new Date().toISOString(), totalFiles: files.length, languages, manifests, packages, routeCandidates: routes.slice(0, 300), serviceCandidates: services.slice(0, 300), testFiles: tests.slice(0, 300) };
}

/* ── Inferred architecture map (S84.3/84.4) — always labeled "inferred". ── */

function architectureMap(projectId: string, inventory: PcInventory): PcArchitectureMap {
  const nodes: PcArchitectureMap["nodes"] = [];
  const edges: PcArchitectureMap["edges"] = [];
  const deps = inventory.packages.flatMap((p) => p.dependencies);
  const all = deps.join(" ").toLowerCase();
  const add = (id: string, label: string, kind: PcArchitectureMap["nodes"][number]["kind"], evidence: string[]) => nodes.push({ id, label, kind, evidence });

  if (/react|next|vue|svelte|angular|vite/.test(all) || inventory.manifests.some((m) => /web|frontend|client/.test(m))) add("frontend", "Frontend", "frontend", ["react/next/vite deps or web/frontend manifests"]);
  if (/express|fastify|nestjs|koa|django|flask|spring|rails|laravel/.test(all) || inventory.serviceCandidates.length > 0) add("backend", "Backend", "backend", ["server framework deps", `${inventory.serviceCandidates.length} service candidate file(s)`]);
  if (/prisma|typeorm|sequelize|mongoose|sqlalchemy/.test(all) || inventory.manifests.some((m) => /prisma|migration|schema\.sql/.test(m))) add("database", "Database", "database", ["ORM deps or schema/migration files"]);
  if (/openai|anthropic|langchain|cohere|huggingface/.test(all)) add("ai", "AI", "ai", ["AI provider deps"]);
  if (/redis|bullmq|bull|kafka|rabbitmq/.test(all)) add("queue", "Queue", "queue", ["queue deps"]);
  if (inventory.packages.some((p) => p.scripts.some((s) => s.startsWith("typecheck"))) || deps.includes("typescript")) add("cli", "CLI / Tooling", "cli", ["typescript/typecheck tooling"]);
  if (nodes.length === 0) add("root", "Project root", "unknown", ["no framework markers detected"]);
  const has = (id: string) => nodes.some((n) => n.id === id);
  if (has("frontend") && has("backend")) edges.push({ from: "frontend", to: "backend", label: "http/api" });
  if (has("backend") && has("database")) edges.push({ from: "backend", to: "database", label: "orm/queries" });
  if (has("ai") && has("backend")) edges.push({ from: "ai", to: "backend", label: "provider" });
  if (has("queue") && has("backend")) edges.push({ from: "backend", to: "queue", label: "jobs/events" });
  return { projectId, inferredAt: new Date().toISOString(), method: "inferred_from_inventory", nodes, edges };
}

/* ── Aggregate health report (S84.6). ── */

function healthReport(record: PcProject): PcHealthReport {
  const inv = record.inventory;
  const ver = record.verification;
  const sand = record.sandboxValidation;
  const langs = inv ? Object.entries(inv.languages).sort((a, b) => b[1] - a[1]).map(([l]) => l) : [];
  const deps = inv?.packages.flatMap((p) => p.dependencies).join(" ").toLowerCase() ?? "";
  const framework = /next/.test(deps) ? "Next.js" : /react/.test(deps) ? "React" : /express/.test(deps) ? "Express" : /fastify/.test(deps) ? "Fastify" : /django/.test(deps) ? "Django" : undefined;

  const build = sand?.stages.find((s) => s.command.includes("build"));
  const typecheck = sand?.stages.find((s) => s.command.includes("typecheck"));
  const tests = sand?.stages.find((s) => s.command.includes("test"));
  const dbPresent = !!inv?.manifests.some((m) => /prisma|schema\.sql|migration/.test(m));
  const deployKinds = inv?.manifests.filter((m) => /Dockerfile|docker-compose|k8s|\.github\/workflows/.test(m)) ?? [];

  const high = ver?.summary.high ?? 0;
  const technicalDebt: PcHealthReport["technicalDebt"] = high > 0 || build?.status === "failed" ? "high" : (ver?.summary.medium ?? 0) > 0 ? "medium" : "low";
  const completion: PcHealthReport["completion"] = (() => {
    if (ver?.status === "needs_security_review") return { status: "incomplete", verified: false, explanation: "Security review required before building on this project." };
    if (sand?.overall === "failed") return { status: "broken", verified: true, explanation: "Sandboxed build/typecheck/tests failed — the project does not currently compile." };
    if (sand?.overall === "passed") return { status: "completed", verified: true, explanation: "Build, typecheck and tests pass in the sandbox." };
    if (ver?.status === "partial") return { status: "partial", verified: false, explanation: "Static checks pass with warnings; sandbox gate not configured (PC_SANDBOX_MODE)." };
    return { status: "unknown", verified: false, explanation: "Verify the project to generate the completion report." };
  })();

  const recommendedBuildOrder: string[] = [];
  if (inv) {
    if (inv.packages.some((p) => p.scripts.some((s) => s === "build"))) recommendedBuildOrder.push("install dependencies", "build");
    recommendedBuildOrder.push("typecheck", "run tests");
    if (dbPresent) recommendedBuildOrder.push("apply database schema/migrations");
    if (high > 0) recommendedBuildOrder.push("remediate security findings");
    if (inv.testFiles.length === 0) recommendedBuildOrder.push("add test coverage");
    if (inv.routeCandidates.length === 0) recommendedBuildOrder.push("wire API routes");
  }

  return {
    reportedAt: new Date().toISOString(),
    projectStatus: {
      type: inv?.packages.find((p) => p.name)?.name ?? "unidentified project",
      languages: langs.slice(0, 5),
      ...(framework ? { framework } : {}),
      architecture: `${nodesLabel(record)}`,
    },
    completion,
    technicalDebt,
    build: build?.status ?? "not_configured",
    typecheck: typecheck?.status ?? "not_configured",
    tests: tests?.status ?? "not_configured",
    database: { present: dbPresent, ...(dbPresent ? { kind: /prisma/.test(deps) ? "prisma" : /schema\.sql|migration/.test(inv?.manifests.join(" ") ?? "") ? "sql" : "orm" } : {}) },
    security: { highSeverityFindings: high, quarantined: record.status === "quarantined", clamav: clamavConfigured() ? "configured" : "not_configured" },
    deployment: { present: deployKinds.length > 0, kinds: deployKinds.map((k) => k.split("/").pop() ?? k) },
    recommendedBuildOrder,
  };
}

function nodesLabel(record: PcProject): string {
  const map = record.architecture;
  if (!map) return "not mapped yet";
  return map.nodes.map((n) => n.label).join(" → ") || "unknown";
}

/* ── Main service ─────────────────────────────────────────────────── */

export const ProjectIntakeService = {
  async intake(organizationId: string, userId: string, file: IntakeFile) {
    if (!file.size) throw AppError.badRequest("Project archive is empty");
    if (file.size > MAX_ARCHIVE_BYTES) throw AppError.badRequest("Project archive exceeds the 25 MB intake limit");
    const kind = archiveKind(file.buffer, file.originalname);

    // Streaming metadata inspection BEFORE any extraction (S84 gate).
    const inspection: PcArchiveInspection = inspectArchive(file.buffer, kind);
    if (inspection.verdict === "bomb") throw AppError.badRequest(`Archive rejected: ${inspection.entries} entries / ${Math.round(inspection.totalUncompressedBytes / 1024 / 1024)} MB uncompressed exceeds the inspection limits.`, { code: "ARCHIVE_BOMB" });
    if (inspection.verdict === "unsafe") throw AppError.badRequest(`Archive rejected: unsafe entry "${inspection.unsafeEntries[0]?.name}" (${inspection.unsafeEntries[0]?.reason}).`, { code: "UNSAFE_ENTRY" });
    if (inspection.verdict === "invalid") throw AppError.badRequest("Archive could not be inspected (invalid or truncated).", { code: "INVALID_ARCHIVE" });

    const findings = scanText(file.buffer);
    const clam = await scanBufferWithClamav(file.buffer);
    if (clam.status === "infected") findings.push({ kind: "malware", severity: "high", message: `ClamAV signature: ${clam.signature ?? "unknown"}` });

    const needsQuarantine = findings.some((f) => f.severity === "high");
    const status = needsQuarantine ? "quarantined" : "accepted";
    const id = `project-${randomUUID()}`;
    const base = path.join(ROOT, organizationId, id);
    await mkdir(base, { recursive: true });
    const archivePath = path.join(base, "archive.bin");
    await writeFile(archivePath, file.buffer, { flag: "wx", mode: 0o600 });

    const record: PcProject = {
      id, organizationId, uploadedById: userId,
      filename: file.originalname.replace(/[^\w.()-]+/g, "_").slice(0, 180),
      archiveKind: kind, sizeBytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      status, findings, inspection, archivePath,
      createdAt: new Date().toISOString(),
      nextStep: status === "accepted" ? "safe_extraction_pending" : "security_review_required",
    };

    if (needsQuarantine) {
      record.quarantine = await quarantineArchive(organizationId, id, archivePath, findings.filter((f) => f.severity === "high").map((f) => f.kind).join(", "));
    }

    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    await redis.lpush(K.projects(organizationId), id);
    await redis.ltrim(K.projects(organizationId), 0, 99);
    await appendChangelog(organizationId, id, userId, "intake", `intake ${record.filename} (${kind}, ${Math.round(record.sizeBytes / 1024)} KB) — ${status}`);
    return record;
  },

  async extract(organizationId: string, id: string) {
    const record = await this.get(organizationId, id);
    if (record.status === "quarantined") throw AppError.forbidden("Quarantined project requires security review before extraction");
    const entries = await archiveEntries(record.archiveKind, record.archivePath!);
    if (entries.length > MAX_FILES || entries.some((entry) => !safeEntry(entry))) throw AppError.badRequest("Archive contains unsafe paths or too many entries");
    const dest = path.join(path.dirname(record.archivePath!), "workspace");
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    try {
      if (record.archiveKind === "zip") await execFile("unzip", ["-qq", record.archivePath!, "-d", dest]);
      else await execFile("tar", ["-xf", record.archivePath!, "-C", dest]);
      const stats = await treeStats(dest);
      record.status = "extracted";
      record.extraction = { entries: entries.length, files: stats.files, bytes: stats.bytes, workspacePath: dest, extractedAt: new Date().toISOString() };
      record.nextStep = "inventory_pending";
      await redis.set(K.project(organizationId, id), JSON.stringify(record));
      await appendChangelog(organizationId, id, record.uploadedById, "extract", `extracted ${stats.files} files (${Math.round(stats.bytes / 1024)} KB)`);
      return record;
    } catch (error) {
      await rm(dest, { recursive: true, force: true });
      throw error;
    }
  },

  async verify(organizationId: string, id: string, actorId?: string) {
    const record = await this.get(organizationId, id);
    if (record.status !== "extracted" || !record.extraction?.workspacePath) throw AppError.badRequest("Project must be safely extracted before verification");
    record.verification = await verificationWorkspace(record.extraction.workspacePath);
    record.nextStep = "sandbox_validation_required";
    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    if (actorId) await appendChangelog(organizationId, id, actorId, "verify", `static verification: ${record.verification.status} (${record.verification.summary.high}h/${record.verification.summary.medium}m/${record.verification.summary.low}l)`);
    return record.verification;
  },

  async inventory(organizationId: string, id: string, actorId?: string) {
    const record = await this.get(organizationId, id);
    if (record.status !== "extracted" || !record.extraction?.workspacePath) throw AppError.badRequest("Project must be safely extracted before inventory");
    record.inventory = await inventoryWorkspace(record.extraction.workspacePath);
    record.architecture = architectureMap(id, record.inventory);
    record.nextStep = "verification_pending";
    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    if (actorId) await appendChangelog(organizationId, id, actorId, "inventory", `inventory: ${record.inventory.totalFiles} files, ${Object.keys(record.inventory.languages).length} languages, ${record.inventory.packages.length} manifests`);
    return record.inventory;
  },

  /** Runs the sandboxed build/typecheck/test gate (S84.11). */
  async sandboxValidate(organizationId: string, id: string, actorId?: string): Promise<PcSandboxResult> {
    const record = await this.get(organizationId, id);
    if (record.status !== "extracted" || !record.extraction?.workspacePath) throw AppError.badRequest("Project must be safely extracted before sandbox validation");
    const result = await runSandboxValidation(record.extraction.workspacePath, record.inventory?.packages ?? []);
    record.sandboxValidation = result;
    record.health = healthReport(record);
    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    if (actorId) await appendChangelog(organizationId, id, actorId, "sandbox", `sandbox gate (${result.mode}): ${result.overall}`);
    return result;
  },

  /** Aggregate health report (S84.6). */
  async health(organizationId: string, id: string): Promise<PcHealthReport> {
    const record = await this.get(organizationId, id);
    record.health = healthReport(record);
    return record.health;
  },

  /** Inferred architecture map (S84.3/84.4). */
  async architecture(organizationId: string, id: string): Promise<PcArchitectureMap> {
    const record = await this.get(organizationId, id);
    if (!record.architecture) {
      if (!record.inventory) throw AppError.badRequest("Run inventory first to map the project architecture.");
      record.architecture = architectureMap(id, record.inventory);
      await redis.set(K.project(organizationId, id), JSON.stringify(record));
    }
    return record.architecture;
  },

  /* ── Change control (S84.10) ── */

  snapshot(organizationId: string, id: string, actorId: string, note?: string) {
    return createSnapshot(organizationId, id, actorId, { workspacePath: this._workspace(organizationId, id), archivePath: this._archive(organizationId, id), note });
  },
  snapshots(organizationId: string, id: string) { return listSnapshots(organizationId, id); },
  diff(organizationId: string, id: string, from: string, to: string) { return diffSnapshots(organizationId, id, from, to); },
  async rollback(organizationId: string, id: string, snapshotId: string, actorId: string) {
    const record = await this.get(organizationId, id);
    const out = await rollbackToSnapshot(organizationId, id, snapshotId, actorId, record.archivePath!, path.join(path.dirname(record.archivePath!), "workspace"));
    record.status = "accepted";
    delete record.extraction; delete record.inventory; delete record.verification; delete record.sandboxValidation; delete record.architecture; delete record.health;
    record.nextStep = "safe_extraction_pending";
    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    return out;
  },
  changelog(organizationId: string, id: string) { return listChangelog(organizationId, id); },

  /* ── Quarantine controls ── */

  async quarantineList(organizationId: string) {
    const projects = await this.list(organizationId);
    return projects.filter((p) => p.status === "quarantined");
  },
  async quarantineRelease(organizationId: string, id: string, actorId: string) {
    const record = await this.get(organizationId, id);
    if (record.status !== "quarantined") throw AppError.badRequest("Project is not quarantined");
    await deleteQuarantinedArchive(organizationId, id);
    delete record.quarantine;
    record.status = "accepted";
    record.nextStep = "safe_extraction_pending";
    await redis.set(K.project(organizationId, id), JSON.stringify(record));
    await appendChangelog(organizationId, id, actorId, "intake", "quarantine released after security review");
    return record;
  },
  async quarantineDelete(organizationId: string, id: string, actorId: string) {
    const record = await this.get(organizationId, id);
    if (record.status === "quarantined") await deleteQuarantinedArchive(organizationId, id);
    await this._deleteRecord(organizationId, id);
    await appendChangelog(organizationId, id, actorId, "delete", "quarantined project deleted");
  },
  async quarantineSweep(organizationId: string) {
    const projects = await this.list(organizationId);
    const swept = await sweepExpiredQuarantine(organizationId, projects);
    if (swept.length) {
      for (const id of swept) {
        const rec = await redis.get(K.project(organizationId, id));
        if (rec) {
          const parsed = JSON.parse(rec);
          parsed.quarantine = undefined;
          parsed.status = "rejected";
          parsed.nextStep = "retention_expired";
          await redis.set(K.project(organizationId, id), JSON.stringify(parsed));
        }
      }
    }
    return { swept };
  },
  async quarantineInspect(organizationId: string, id: string) {
    const record = await this.get(organizationId, id);
    if (record.status !== "quarantined") throw AppError.badRequest("Project is not quarantined");
    const buf = await readQuarantinedArchive(organizationId, id);
    return {
      id,
      sha256: createHash("sha256").update(buf).digest("hex"),
      sizeBytes: buf.byteLength,
      findings: record.findings,
      note: "Content is returned to the caller only through this explicit security-review endpoint.",
    };
  },

  /* ── Project lifecycle ── */

  async delete(organizationId: string, id: string, actorId: string) {
    const record = await this.get(organizationId, id);
    await rm(path.join(ROOT, organizationId, id), { recursive: true, force: true });
    await redis.del(K.project(organizationId, id));
    await redis.lrem(K.projects(organizationId), 0, id);
    await appendChangelog(organizationId, id, actorId, "delete", `project ${record.filename} deleted`);
  },

  async list(organizationId: string): Promise<PcProject[]> {
    const ids = await redis.lrange(K.projects(organizationId), 0, 99);
    const projects: PcProject[] = [];
    for (const id of ids) {
      const raw = await redis.get(K.project(organizationId, id));
      if (raw) projects.push(JSON.parse(raw) as PcProject);
    }
    return projects;
  },

  async get(organizationId: string, id: string): Promise<PcProject> {
    const raw = await redis.get(K.project(organizationId, id));
    if (!raw) throw AppError.notFound("Project intake not found");
    return JSON.parse(raw) as PcProject;
  },

  _workspace(organizationId: string, id: string): string {
    return path.join(ROOT, organizationId, id, "workspace");
  },
  _archive(organizationId: string, id: string): string {
    return path.join(ROOT, organizationId, id, "archive.bin");
  },
  async _deleteRecord(organizationId: string, id: string) {
    await redis.del(K.project(organizationId, id));
    await redis.lrem(K.projects(organizationId), 0, id);
  },
};
