// started with https://developers.cloudflare.com/workers/get-started/quickstarts/
import express from "express";
import { createRequestHandler } from "@remix-run/express";
import path from "path";
import * as build from "@remix-run/dev/server-build";
import { verifyKey } from "discord-interactions";

import Sentry from "~/helpers/sentry.server";
import discordBot from "~/discord/gateway";
import { applicationKey } from "./helpers/env";
import bodyParser from "body-parser";

import * as convene from "~/commands/convene";
import * as setup from "~/commands/setup";
import * as report from "~/commands/report";
import * as track from "~/commands/track";
import * as setupTicket from "~/commands/setupTickets";
import { registerCommand } from "./discord/deployCommands.server";

const app = express();

// RequestHandler creates a separate execution context using domains, so that
// every transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
// app.use(Sentry.Handlers.tracingHandler());

/**
Route handlers and static hosting
*/

app.use(express.static(path.join(__dirname, "..", "public")));

// Discord signature verification
app.post("/webhooks/discord", bodyParser.json(), async (req, res, next) => {
  const isValidRequest = await verifyKey(
    JSON.stringify(req.body),
    req.header("X-Signature-Ed25519")!,
    req.header("X-Signature-Timestamp")!,
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
registerCommand(convene, app);
registerCommand(setup, app);
registerCommand(report, app);
registerCommand(track, app);
registerCommand(setupTicket, app);

// needs to handle all verbs (GET, POST, etc.)
app.all(
  "*",
  createRequestHandler({
    // `remix build` and `remix dev` output files to a build directory, you need
    // to pass that build to the request handler
    build,

    // return anything you want here to be available as `context` in your
    // loaders and actions. This is where you can bridge the gap between Remix
    // and your server
    getLoadContext(req, res) {
      return {};
    },
  }),
);

/** ERROR TRACKING
  Must go after route handlers
*/
app.use(Sentry.Handlers.errorHandler());

/** Init app */
app.listen(process.env.PORT || "3000");

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
