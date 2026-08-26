/**
 * Global test setup for @windels/web.
 *
 * Runs before every test file. Registers an automatic Testing Library cleanup
 * after each test so mounted components (in the happy-dom suites) do not leak
 * between tests. In the Node-environment (pure-logic) suites `document` is
 * undefined, so cleanup is a no-op there.
 */
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
