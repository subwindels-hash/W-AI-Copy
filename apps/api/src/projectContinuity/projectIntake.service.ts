import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, readdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('projectContinuity:projectIntake');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


const execFile = promisify(execFileCb);
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 10_000;
const ROOT = path.resolve(process.cwd(), "project-intake");
const K = { project: (org: string, id: string) => `project84:${org}:project:${id}`, projects: (org: string) => `project84:${org}:projects` };
type IntakeFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };
type IntakeStatus = "accepted" | "quarantined" | "rejected" | "extracted";

function archiveKind(buffer: Buffer, filename: string) {
  const lower = filename.toLowerCase();
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || lower.endsWith(".zip")) return "zip";
  if (buffer.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) || lower.endsWith(".7z")) return "7z";
  if (buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) || lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar") || lower.endsWith(".tar.bz2") || lower.endsWith(".tar.xz")) return "tar";
  return "file";
}
function scanText(buffer: Buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("latin1");
  const findings: Array<{ kind: string; severity: "high" | "medium"; message: string }> = [];
  const secretPatterns = [/(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:password|secret|token|api[_-]?key)\s*[:=]\s*[^\s"']{8,}/i];
  if (secretPatterns.some((pattern) => pattern.test(text))) findings.push({ kind: "secret", severity: "high", message: "Potential credential detected; content quarantined and value redacted." });
  if (/\.\.(?:\\|\/)|\x00/.test(text)) findings.push({ kind: "archive_path", severity: "high", message: "Potential path traversal or null-byte archive entry detected." });
  if (/powershell\s+-enc|curl\s+[^\n]+\|\s*(?:sh|bash)|rm\s+-rf\s+\//i.test(text)) findings.push({ kind: "script", severity: "medium", message: "Potentially dangerous script pattern detected; manual review required." });
  return findings;
}
function safeEntry(entry: string) { return Boolean(entry) && !entry.includes("\0") && !path.isAbsolute(entry) && !entry.split(/[\\/]+/).includes(".."); }
async function archiveEntries(kind: string, archive: string) {
  if (kind === "zip") return (await execFile("unzip", ["-Z1", archive], { maxBuffer: 8 * 1024 * 1024 })).stdout.split(/\r?\n/).filter(Boolean);
  if (kind === "tar" || kind === "tar.gz") return (await execFile("tar", ["-tf", archive], { maxBuffer: 8 * 1024 * 1024 })).stdout.split(/\r?\n/).filter(Boolean);
  throw AppError.badRequest("Safe extraction currently supports ZIP and TAR archives only; 7Z remains quarantined pending a configured extractor");
}
async function treeStats(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  async function visit(dir: string): Promise<void> { for (const name of await readdir(dir)) { const full = path.join(dir, name); const s = await lstat(full); if (s.isSymbolicLink()) throw AppError.badRequest("Archive contains a symlink"); if (s.isDirectory()) await visit(full); else { files++; bytes += s.size; if (files > MAX_FILES || bytes > MAX_EXTRACTED_BYTES) throw AppError.badRequest("Archive exceeds safe extraction limits"); } } }
  await visit(root); return { files, bytes };
}
async function verificationWorkspace(root: string) {
  const findings: Array<{ category: string; severity: "high" | "medium" | "low"; file: string; message: string }> = []; const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "target", "vendor"]);
  const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".json", ".yml", ".yaml", ".md", ".sql"]);
  async function walk(dir: string): Promise<void> { for (const name of await readdir(dir)) { if (ignored.has(name)) continue; const full = path.join(dir, name); const stat = await lstat(full); if (stat.isDirectory()) await walk(full); else if (textExt.has(path.extname(name).toLowerCase()) && stat.size <= 1_000_000) { const text = await readFile(full, "utf8").catch(() => ""); const file = path.relative(root, full); const todoCount = (text.match(/\b(?:TODO|FIXME|XXX)\b/g) ?? []).length; if (todoCount) findings.push({ category: "incomplete", severity: "low", file, message: `${todoCount} TODO/FIXME marker(s)` }); if (/Math\.random\s*\(/.test(text)) findings.push({ category: "demo_data", severity: "medium", file, message: "_rng.next() detected; verify this is not synthetic production data" }); if (/not implemented|placeholder|mock data|fake data/i.test(text)) findings.push({ category: "placeholder", severity: "medium", file, message: "Placeholder/demo language detected" }); if (/api[_-]?key\s*[:=]|password\s*[:=]|private key/i.test(text)) findings.push({ category: "secret_review", severity: "high", file, message: "Potential hard-coded credential pattern; value intentionally omitted" }); } } }
  await walk(root); const summary = { high: findings.filter((f) => f.severity === "high").length, medium: findings.filter((f) => f.severity === "medium").length, low: findings.filter((f) => f.severity === "low").length };
  return { verifiedAt: new Date().toISOString(), status: summary.high ? "needs_security_review" : summary.medium ? "partial" : "static_checks_passed", summary, findings: findings.slice(0, 1000), execution: { build: "not_run_requires_sandbox", typecheck: "not_run_requires_sandbox", tests: "not_run_requires_sandbox" } };
}

async function inventoryWorkspace(root: string) {
  const files: string[] = []; const languages: Record<string, number> = {}; const manifests: string[] = []; const routes: string[] = []; const services: string[] = []; const tests: string[] = [];
  const extLanguage: Record<string, string> = { ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".py": "Python", ".go": "Go", ".java": "Java", ".rb": "Ruby", ".php": "PHP", ".rs": "Rust", ".cs": "C#", ".swift": "Swift", ".kt": "Kotlin", ".sql": "SQL" };
  const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "target", "vendor"]);
  async function walk(dir: string): Promise<void> { for (const name of await readdir(dir)) { if (ignored.has(name)) continue; const full = path.join(dir, name); const stat = await lstat(full); if (stat.isDirectory()) await walk(full); else { const relative = path.relative(root, full); files.push(relative); const lang = extLanguage[path.extname(name).toLowerCase()]; if (lang) languages[lang] = (languages[lang] ?? 0) + 1; if (["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "docker-compose.yml", "Dockerfile", "prisma/schema.prisma"].some((m) => relative.endsWith(m))) manifests.push(relative); if (/route|routes|controller/i.test(relative)) routes.push(relative); if (/service|handler|worker|job/i.test(relative)) services.push(relative); if (/(^|\/)(__tests__\/|.*\.(test|spec)\.[^.]+$)/i.test(relative)) tests.push(relative); } } }
  await walk(root);
  const packageFiles = files.filter((f) => path.basename(f) === "package.json").slice(0, 20); const packages: Array<{ file: string; name?: string; scripts: string[]; dependencies: string[] }> = [];
  for (const file of packageFiles) { try { const parsed = JSON.parse(await readFile(path.join(root, file), "utf8")); packages.push({ file, name: parsed.name, scripts: Object.keys(parsed.scripts ?? {}), dependencies: [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})].slice(0, 100) }); } catch { /* malformed manifest is reported by presence only */ } }
  return { scannedAt: new Date().toISOString(), totalFiles: files.length, languages, manifests, packages, routeCandidates: routes.slice(0, 300), serviceCandidates: services.slice(0, 300), testFiles: tests.slice(0, 300) };
}

export const ProjectIntakeService = {
  async intake(organizationId: string, userId: string, file: IntakeFile) {
    if (!file.size) throw AppError.badRequest("Project archive is empty");
    if (file.size > MAX_ARCHIVE_BYTES) throw AppError.badRequest("Project archive exceeds the 25 MB intake limit");
    const kind = archiveKind(file.buffer, file.originalname); const findings = scanText(file.buffer);
    const status: IntakeStatus = findings.some((f) => f.severity === "high") ? "quarantined" : "accepted";
    const id = `project-${randomUUID()}`; const base = path.join(ROOT, organizationId, id); await mkdir(base, { recursive: true });
    const archivePath = path.join(base, "archive.bin"); await writeFile(archivePath, file.buffer, { flag: "wx", mode: 0o600 });
    const record = { id, organizationId, uploadedById: userId, filename: file.originalname.replace(/[^\w.()-]+/g, "_").slice(0, 180), archiveKind: kind, sizeBytes: file.size, sha256: createHash("sha256").update(file.buffer).digest("hex"), status, findings, archivePath, createdAt: new Date().toISOString(), nextStep: status === "accepted" ? "safe_extraction_pending" : "security_review_required" };
    await redis.set(K.project(organizationId, id), JSON.stringify(record)); await redis.lpush(K.projects(organizationId), id); await redis.ltrim(K.projects(organizationId), 0, 99); return record;
  },
  async extract(organizationId: string, id: string) {
    const raw = await redis.get(K.project(organizationId, id)); if (!raw) throw AppError.notFound("Project intake not found"); const record = JSON.parse(raw);
    if (record.status === "quarantined") throw AppError.forbidden("Quarantined project requires security review before extraction");
    const entries = await archiveEntries(record.archiveKind, record.archivePath);
    if (entries.length > MAX_FILES || entries.some((entry) => !safeEntry(entry))) throw AppError.badRequest("Archive contains unsafe paths or too many entries");
    const dest = path.join(path.dirname(record.archivePath), "workspace"); await rm(dest, { recursive: true, force: true }); await mkdir(dest, { recursive: true });
    try { if (record.archiveKind === "zip") await execFile("unzip", ["-qq", record.archivePath, "-d", dest]); else await execFile("tar", ["-xf", record.archivePath, "-C", dest]); const stats = await treeStats(dest); record.status = "extracted"; record.extraction = { entries: entries.length, files: stats.files, bytes: stats.bytes, workspacePath: dest, extractedAt: new Date().toISOString() }; record.nextStep = "inventory_pending"; await redis.set(K.project(organizationId, id), JSON.stringify(record)); return record; } catch (error) { await rm(dest, { recursive: true, force: true }); throw error; }
  },
  async verify(organizationId: string, id: string) {
    const raw = await redis.get(K.project(organizationId, id)); if (!raw) throw AppError.notFound("Project intake not found"); const record = JSON.parse(raw);
    if (record.status !== "extracted" || !record.extraction?.workspacePath) throw AppError.badRequest("Project must be safely extracted before verification");
    record.verification = await verificationWorkspace(record.extraction.workspacePath); record.nextStep = "sandbox_validation_required";
    await redis.set(K.project(organizationId, id), JSON.stringify(record)); return record.verification;
  },
  async inventory(organizationId: string, id: string) {
    const raw = await redis.get(K.project(organizationId, id)); if (!raw) throw AppError.notFound("Project intake not found"); const record = JSON.parse(raw);
    if (record.status !== "extracted" || !record.extraction?.workspacePath) throw AppError.badRequest("Project must be safely extracted before inventory");
    record.inventory = await inventoryWorkspace(record.extraction.workspacePath); record.nextStep = "verification_pending";
    await redis.set(K.project(organizationId, id), JSON.stringify(record)); return record.inventory;
  },
  async list(organizationId: string) { const ids = await redis.lrange(K.projects(organizationId), 0, 99); const projects = []; for (const id of ids) { const raw = await redis.get(K.project(organizationId, id)); if (raw) projects.push(JSON.parse(raw)); } return projects; },
};
