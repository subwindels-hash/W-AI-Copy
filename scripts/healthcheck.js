#!/usr/bin/env node

/**
 * Health Check Script
 * WINDELS AI OS
 * 
 * This script checks the health of the application and its dependencies.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';
const TIMEOUT = 5000;

const options = {
  hostname: HOST,
  port: PORT,
  path: '/health',
  method: 'GET',
  timeout: TIMEOUT,
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const health = JSON.parse(data);
        
        if (health.status === 'healthy') {
          console.log('✅ Health check passed');
          console.log(`   Status: ${health.status}`);
          console.log(`   Uptime: ${health.uptime}s`);
          console.log(`   Database: ${health.database}`);
          console.log(`   Redis: ${health.redis}`);
          process.exit(0);
        } else {
          console.error('❌ Health check failed: unhealthy status');
          console.error(`   Status: ${health.status}`);
          process.exit(1);
        }
      } catch (error) {
        console.error('❌ Health check failed: invalid JSON response');
        process.exit(1);
      }
    } else {
      console.error(`❌ Health check failed: HTTP ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Health check failed:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Health check failed: timeout');
  req.destroy();
  process.exit(1);
});

req.end();
