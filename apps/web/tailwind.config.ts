// Tailwind v4 uses CSS-first configuration; this file exists for tooling compatibility.
// See src/styles/globals.css for the @theme block that defines all tokens.
import type { Config } from "tailwindcss";
export default { content: ["./index.html", "./src/**/*.{ts,tsx}"] } satisfies Config;
