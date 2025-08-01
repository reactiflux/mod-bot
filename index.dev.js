import "dotenv/config";
import * as vite from "vite";
import express from "express";

const retry = async (count, func) => {
  let lastError;
  for (let i = 0; i < count; i++) {
    try {
      return await func(i, count);
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }
      lastError = e;
    }
  }
  throw lastError;
};

const app = express();

/**
Route handlers and static hosting
*/

console.log("Starting development server");
const viteDevServer = await vite.createServer({
  server: { middlewareMode: true },
});
app.use(viteDevServer.middlewares);
viteDevServer
  .ssrLoadModule("./app/server.ts")
  .then((source) => {
    app.use(source.app);
  })
  .catch((error) => {
    if (typeof error === "object" && error instanceof Error) {
      viteDevServer.ssrFixStacktrace(error);
    }
    console.log({ error });
  });

const preferredPort = parseInt(process.env.PORT || "3000", 10);

try {
  const actualPort = await retry(5, async (attempt) => {
    const port = preferredPort + attempt;
    return new Promise((resolve, reject) => {
      const server = app.listen(port, "0.0.0.0", () => {
        console.log(`Server started on port ${port}`);
        resolve(port);
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.log(`Port ${port} is busy, trying next port...`);
          reject(error);
        } else {
          reject(error);
        }
      });
    });
  });
  // Set the actual port in environment for child processes and export for tests
  process.env.PORT = actualPort.toString();
  process.env.BASE_URL = `http://localhost:${actualPort}`;

  // Output the URL in a format that Playwright can detect
  console.log(`Server running at http://localhost:${actualPort}`);
} catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
}
