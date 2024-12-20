import "dotenv/config";
// started with https://developers.cloudflare.com/workers/get-started/quickstarts/
import express from "express";
import { createRequestHandler } from "@remix-run/express";
import { broadcastDevReady } from "@remix-run/node";
import path from "path";
import { verifyKey } from "discord-interactions";
import bodyParser from "body-parser";

import Sentry from "~/helpers/sentry.server";
import { applicationKey, isProd } from "~/helpers/env.server";
import discordBot from "~/discord/gateway";
import { registerCommand } from "~/discord/deployCommands.server";

import * as convene from "~/commands/convene";
import * as setup from "~/commands/setup";
import * as report from "~/commands/report";
import * as track from "~/commands/track";
import setupTicket from "~/commands/setupTickets";

console.log("shenanigans!!!!");

const BUILD_DIR = path.join(process.cwd(), "build");
const viteDevServer = isProd()
  ? undefined
  : await import("vite").then((vite) =>
      vite.createServer({
        server: { origin: "localhost:3000", middlewareMode: true },
      }),
    );

console.log("test butts");

const app = express();

// RequestHandler creates a separate execution context using domains, so that
// every transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
// app.use(Sentry.Handlers.tracingHandler());

/**
Route handlers and static hosting
*/

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  app.use(express.static(path.join(process.cwd(), "public")));
}

// Discord signature verification
app.post("/webhooks/discord", bodyParser.json(), async (req, res, next) => {
  const isValidRequest = await verifyKey(
    JSON.stringify(req.body),
    req.header("X-Signature-Ed25519") || "bum signature",
    req.header("X-Signature-Timestamp") || "bum timestamp",
    applicationKey,
  );
  console.log("WEBHOOK", "isValidRequest:", isValidRequest);
  if (!isValidRequest) {
    console.log("[REQ] Invalid request signature");
    res.status(401).send({ message: "Bad request signature" });
    return;
  }
  if (req.body.type === 1) {
    res.json({ type: 1, data: {} });
    return;
  }

  next();
});

/**
 * Initialize Discord gateway.
 */
discordBot();
/**
 * Register Discord commands. These may add arbitrary express routes, because
 * abstracting Discord interaction handling is weird and complex.
 */
registerCommand(convene);
registerCommand(setup);
registerCommand(report);
registerCommand(track);
registerCommand(setupTicket);

const build = viteDevServer
  ? () => viteDevServer.ssrLoadModule("virtual:remix/server-build")
  : await import("../build/server/index.js");

// needs to handle all verbs (GET, POST, etc.)
app.all(
  "*",
  createRequestHandler({
    // `remix build` and `remix dev` output files to a build directory, you need
    // to pass that build to the request handler
    // @ts-expect-error Seems to work fine 🤷
    build,
  }),
);

/** ERROR TRACKING
  Must go after route handlers
*/
app.use(Sentry.Handlers.errorHandler());

/** Init app */
app.listen(process.env.PORT || "3000", async () => {
  const build = await import(path.resolve(BUILD_DIR, "server", "index.js"));
  if (build && build.assets) broadcastDevReady(build);
});

const errorHandler = (error: unknown) => {
  Sentry.captureException(error);
  if (error instanceof Error) {
    console.log("ERROR", error.message, error.stack);
  } else if (typeof error === "string") {
    console.log("ERROR", error);
  }
};

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
