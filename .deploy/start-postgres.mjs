// WINDELS AI OS — start an embedded PostgreSQL 18 server (real, persistent).
// Runs on 127.0.0.1:5432, superuser "windels"/"windels", ensures a "windels" db.
// Keeps the process alive so Postgres stays up while this script runs.
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_PORT = Number(process.env.PG_PORT || 5432);
const PG_USER = process.env.PG_USER || "windels";
const PG_PASS = process.env.PG_PASSWORD || "windels";
const PG_DB = process.env.PG_DB || "windels";
const dataDir = process.env.PG_DATA || path.join(__dirname, "pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: PG_USER,
  password: PG_PASS,
  port: PG_PORT,
  persistent: true,
});

await pg.initialise();
await pg.start();

// Locate the bundled psql to create the app database if absent.
const bins = [
  path.join(__dirname, "node_modules/@embedded-postgres/linux-x64/native/bin/psql"),
];
let psql = bins.find((b) => fs.existsSync(b));
if (!psql) {
  // search native dir
  const nativeDir = path.join(__dirname, "node_modules/@embedded-postgres/linux-x64/native/bin");
  psql = path.join(nativeDir, "psql");
}
const conn = `postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${PG_PORT}/postgres`;
const chk = spawnSync(psql, [conn, "-tAc", `SELECT 1 FROM pg_database WHERE datname='${PG_DB}'`]);
const exists = chk.stdout && String(chk.stdout).trim() === "1";
if (!exists) {
  const r = spawnSync(psql, [conn, "-c", `CREATE DATABASE "${PG_DB}"`]);
  console.log("[postgres] created db", PG_DB, "rc=", r.status, String(r.stdout || r.stderr).trim().slice(0, 200));
} else {
  console.log("[postgres] db", PG_DB, "already exists");
}
console.log(`[postgres] READY postgresql://${PG_USER}:***@127.0.0.1:${PG_PORT}/${PG_DB} (pgdata=${dataDir})`);

// Keep alive
const keep = setInterval(() => {}, 1 << 30);
process.on("SIGTERM", async () => {
  clearInterval(keep);
  try { await pg.stop(); } catch {}
  process.exit(0);
});
process.on("SIGINT", async () => {
  clearInterval(keep);
  try { await pg.stop(); } catch {}
  process.exit(0);
});
