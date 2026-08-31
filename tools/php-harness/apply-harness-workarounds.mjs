/**
 * Apply the harness-only workarounds a php-wasm deployment needs.
 *
 *   node apply-harness-workarounds.mjs <docroot>
 *
 * These are limitations of the WASM PHP build used to exercise the app in this
 * sandbox — NOT changes the cPanel package needs. On a real host (mod_php /
 * PHP-FPM with the MySQL extension) none of them apply, so they must never be
 * written into the repository copy.
 *
 *   1. mysqli + MYSQLI_INIT_COMMAND traps the WASM runtime
 *      ("null function or function signature mismatch" in
 *      mysqlnd_execute_init_commands). CodeIgniter sets that option whenever
 *      `stricton` is set in database.php, in both the TRUE and the FALSE
 *      branch, so the key has to be removed entirely.

 *   2. mysqli::autocommit() traps the asyncify build ("RuntimeError:
 *      unreachable"). The JSPI build that would avoid it is not available in
 *      this Node version, so the three transaction methods are neutralised and
 *      autocommit stays on: data is still written, but an explicit rollback
 *      would not undo anything.
 */
import fs from 'node:fs';
import path from 'node:path';

const docroot = (process.argv[2] || '').replace(/\/$/, '');
if (!docroot || !fs.existsSync(docroot)) {
  console.error('usage: node apply-harness-workarounds.mjs <docroot>');
  process.exit(1);
}

const dbConfig = path.join(docroot, 'application/config/database.php');
const before = fs.readFileSync(dbConfig, 'utf8');
const after = before.replace(/'stricton'\s*=>\s*TRUE/i, "'stricton' => NULL");
if (before === after) {
  console.log(`  ${dbConfig}: stricton already neutralised`);
} else {
  fs.writeFileSync(dbConfig, after);
  console.log(`  ${dbConfig}: stricton disabled (php-wasm crashes on MYSQLI_INIT_COMMAND)`);
}
// 2. autocommit() traps the WASM runtime.
const driverPath = path.join(docroot, 'system/database/drivers/mysqli/mysqli_driver.php');
let driver = fs.readFileSync(driverPath, 'utf8');
const patched = driver
  .replace(/protected function _trans_begin\(\)\s*\{[\s\S]*?\n\t\}/,
    "protected function _trans_begin()\n\t{\n\t\t// php-wasm: autocommit() traps here; autocommit stays on.\n\t\treturn $this->simple_query('START TRANSACTION');\n\t}")
  .replace(/protected function _trans_commit\(\)\s*\{[\s\S]*?\n\t\}/,
    "protected function _trans_commit()\n\t{\n\t\t// php-wasm: autocommit() traps here; autocommit stays on.\n\t\treturn $this->simple_query('COMMIT');\n\t}")
  .replace(/protected function _trans_rollback\(\)\s*\{[\s\S]*?\n\t\}/,
    "protected function _trans_rollback()\n\t{\n\t\t// php-wasm: autocommit() traps here; autocommit stays on.\n\t\treturn $this->simple_query('ROLLBACK');\n\t}");
if (driver === patched) {
  console.log(`  ${driverPath}: transactions already neutralised`);
} else {
  fs.writeFileSync(driverPath, patched);
  console.log(`  ${driverPath}: autocommit() calls removed (php-wasm traps on them)`);
}

console.log(`workarounds applied to ${docroot}`);
