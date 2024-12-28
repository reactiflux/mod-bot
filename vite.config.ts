import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild ? { input: "./app/server.ts" } : undefined,
  },
  server: { port: 3000, origin: "localhost:3000" },
  plugins: [reactRouter()],
}));
