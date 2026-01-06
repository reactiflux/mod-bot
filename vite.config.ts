import { defineConfig } from "vite";

import { reactRouter } from "@react-router/dev/vite";

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    sourcemap: true,
    rollupOptions: isSsrBuild ? { input: "./app/server.ts" } : undefined,
  },
  server: { port: 3000, origin: "localhost:3000" },
  plugins: [reactRouter()],
}));
