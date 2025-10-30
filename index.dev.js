import "dotenv/config";

import express from "express";
import * as vite from "vite";

const app = express();

/**
Route handlers and static hosting
*/

console.log("Starting development server");
const viteDevServer = await vite.createServer({
  server: { middlewareMode: true },
});

// Track the current server module to enable hot reloading
let currentServerApp = null;

// Function to load/reload the server module
async function loadServerModule() {
  try {
    const source = await viteDevServer.ssrLoadModule("./app/server.ts");
    currentServerApp = source.app;
    console.log("Server module (re)loaded");
  } catch (error) {
    if (typeof error === "object" && error instanceof Error) {
      viteDevServer.ssrFixStacktrace(error);
    }
    console.error("Error loading server module:", error);
  }
}

// Initial load
await loadServerModule();

// Add Vite middleware first
app.use(viteDevServer.middlewares);

// Proxy all requests to the current server app
// This allows us to hot-swap the server without restarting Express
app.use((req, res, next) => {
  if (currentServerApp) {
    currentServerApp(req, res, next);
  } else {
    res.status(503).send("Server module not loaded");
  }
});

// Listen for file changes and reload server module
viteDevServer.watcher.on("change", async (file) => {
  // Only reload for server-side files (not client components)
  if (
    file.includes("/app/server.ts") ||
    file.includes("/app/discord/") ||
    file.includes("/app/commands/") ||
    file.includes("/app/helpers/") ||
    file.includes("/app/models/")
  ) {
    console.log(`Server file changed: ${file}, reloading...`);
    // Invalidate Vite's module cache
    const modules = viteDevServer.moduleGraph.getModulesByFile(file);
    if (modules) {
      for (const mod of modules) {
        viteDevServer.moduleGraph.invalidateModule(mod);
      }
    }
    // Reload the server module
    await loadServerModule();
  }
});

const PORT = process.env.PORT ?? "3000";
app.listen(PORT, async () => {
  console.log("INI", "Now listening on port", PORT);
});
