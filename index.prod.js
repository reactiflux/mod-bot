// This file gets manually copied into build/ as part of deployment. Doing it
// this way avoids a ton of weird compat hacks with react-router v7.

import "dotenv/config";
import express from "express";

// This only exists after a production build, when this file is copied into Docker
import { app as rrApp } from "./build/server/index.js";

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

console.log("Starting production webserver");

app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
);
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(rrApp);

/** ERROR TRACKING
  Must go after route handlers
*/
const errorHandler = (error) => {
  if (error instanceof Error) {
    console.log("[UNCAUGHT ERROR]", error.message, error.stack);
  } else if (typeof error === "string") {
    console.log("[UNCAUGHT ERROR]", error);
  }
};

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

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
