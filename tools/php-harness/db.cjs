// Long-running MySQL 5.7 server for the PHP/cPanel harness.
const startMysql = require('mysql-server-5.7-lin-x64');
const mysqld = startMysql();
mysqld.stdout.on('data', d => process.stdout.write('[mysqld] ' + d));
mysqld.stderr.on('data', d => process.stdout.write('[mysqld!] ' + d));
mysqld.on('close', c => console.log('mysqld exited', c));
if (mysqld.ready) mysqld.ready.then(() => console.log('READY')).catch(e => console.log('ready-error', e.message));
setInterval(() => {}, 1 << 30);
