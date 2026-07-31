#!/usr/bin/env bash
# After `prisma generate`, the wasm-worker-loader.mjs uses cloudflare-style
# `import('./query_engine_bg.wasm')` that Node returns as {} instead of { default: Module }.
# Overwrite it with a Node-compatible loader that reads + compiles the wasm.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOADER="$ROOT/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/wasm-worker-loader.mjs"
if [ -f "$LOADER" ]; then
  cat > "$LOADER" <<'JS'
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmBuf = await fs.readFile(path.join(__dirname, 'query_engine_bg.wasm'));
const mod = await WebAssembly.compile(wasmBuf);
export default Promise.resolve({ default: mod });
JS
  echo "✓ patched $LOADER"
fi
