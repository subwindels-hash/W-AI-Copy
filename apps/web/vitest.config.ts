import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vitest config for @windels/web.
 *
 * Kept separate from vite.config.ts (the app build) so test-only concerns —
 * the DOM environment and jest-dom-free setup — never leak into the production
 * bundle. The tailwind vite plugin is intentionally omitted here: component
 * tests assert behavior/roles/text, not compiled CSS, and loading Tailwind's
 * PostCSS pipeline per test file only slows collection.
 *
 * Environment strategy: the default is Node (fast) for the many pure-logic
 * suites. A component/render suite opts into a DOM by adding the file-level
 * docblock comment `@vitest-environment happy-dom`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
