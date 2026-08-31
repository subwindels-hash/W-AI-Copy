// Long-running MySQL 5.7 server for the PHP/cPanel harness.
//
// innodb_use_native_aio is turned OFF deliberately. This sandbox has no libaio
// package and no mirror to install one, so the harness links mysqld against a
// hand-built stub (libaio_stub.c). The stub forwards straight to the real
// syscalls, which the sandbox filters: io_getevents() returns -1 under load and
// InnoDB treats that as fatal —
//
//   [ERROR] [FATAL] InnoDB: Unexpected ret_code[-1] from io_getevents()!
//   InnoDB: Assertion failure in thread ... in file ut0ut.cc line 918
//
// — which aborts the server mid-session. With native AIO off, InnoDB falls
// back to its simulated-AIO thread pool and never touches io_getevents at all,
// so the stub becomes irrelevant and the server stays up.
const fs = require("fs");
const path = require("path");

// cosmiconfig searches upward from process.cwd(), so anchor both to this file.
process.chdir(__dirname);
const rcPath = path.join(__dirname, ".mysql-serverrc");
const rc = { mycnf: { innodb_use_native_aio: 0 } };
if (fs.existsSync(rcPath)) {
  let current = {};
  try { current = JSON.parse(fs.readFileSync(rcPath, "utf8")); } catch { current = {}; }
  if (!(current.mycnf && current.mycnf.innodb_use_native_aio === 0)) {
    fs.writeFileSync(rcPath, JSON.stringify({ ...current, ...rc, mycnf: { ...(current.mycnf || {}), ...rc.mycnf } }, null, 2));
  }
} else {
  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2));
}

const startMysql = require("mysql-server-5.7-lin-x64");
const mysqld = startMysql();
mysqld.stdout.on("data", d => process.stdout.write("[mysqld] " + d));
mysqld.stderr.on("data", d => process.stdout.write("[mysqld!] " + d));
mysqld.on("close", c => console.log("mysqld exited", c));
if (mysqld.ready) mysqld.ready.then(() => console.log("READY")).catch(e => console.log("ready-error", e.message));
setInterval(() => {}, 1 << 30);
