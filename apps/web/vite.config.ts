import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    host: true,
    // Sandboxed/remote dev previews are served through a proxied hostname.
    // Vite 5.4 rejects unknown Hosts by default, which breaks those previews.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      "/v1": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
