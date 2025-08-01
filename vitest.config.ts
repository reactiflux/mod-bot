/// <reference types="vitest" />
/// <reference types="vite/client" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["node_modules", "tests/e2e/**"],
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup-test-env.ts"],
  },
});
