// This file gets manually copied into build/ as part of deployment. Doing it
// this way avoids a ton of weird compat hacks with react-router v7.

import "dotenv/config";
import express from "express";

// import Sentry from "#~/helpers/sentry.server";

// This only exists after a production build, when this file is copied into Docker
import { app as rrApp } from "./build/server/index.js";

const app = express();

console.log("Starting production server");
app.use(rrApp);

app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
);
app.use(express.static("build/client", { maxAge: "1h" }));

/** ERROR TRACKING
  Must go after route handlers
*/
// app.use(Sentry.Handlers.errorHandler());

const errorHandler = (error) => {
  // Sentry.captureException(error);
  if (error instanceof Error) {
    console.log("ERROR", error.message, error.stack);
  } else if (typeof error === "string") {
    console.log("ERROR", error);
  }
};

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

const PORT = process.env.PORT || "3000";
app.listen(PORT, "0.0.0.0", async () => {
  console.log("INI", "Now listening on port", PORT);
});
