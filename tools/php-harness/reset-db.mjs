/**
 * Reset a harness database: drop it, recreate it, and import the given SQL
 * files in order. Equivalent to phpMyAdmin → Import on cPanel.
 *
 *   node reset-db.mjs <dbname> <file.sql> [file2.sql ...]
 */
import fs from 'node:fs';
import mysql from 'mysql2/promise';

const [db, ...files] = process.argv.slice(2);
if (!db || !files.length) {
  console.error('usage: node reset-db.mjs <dbname> <file.sql> [more.sql ...]');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  multipleStatements: true,
});

await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
await conn.query(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
console.log(`created ${db}`);
await conn.query(`USE \`${db}\``);

for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  try {
    await conn.query(sql);
    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [db]);
    console.log(`imported ${file} — ${rows[0].n} tables`);
  } catch (e) {
    console.error(`FAILED importing ${file}: ${e.message}`);
    process.exit(1);
  }
}
await conn.end();
