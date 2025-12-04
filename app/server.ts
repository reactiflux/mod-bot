import "react-router";

import bodyParser from "body-parser";
import { verifyKey } from "discord-interactions";
import express from "express";
import pinoHttp from "pino-http";

import { createRequestHandler } from "@react-router/express";

import { EscalationCommands } from "#~/commands/escalationControls";
import { Command as forceBan } from "#~/commands/force-ban";
import { Command as report } from "#~/commands/report";
import { Command as setup } from "#~/commands/setup";
import { Command as setupReactjiChannel } from "#~/commands/setupReactjiChannel";
import { Command as setupTicket } from "#~/commands/setupTickets";
import { Command as track } from "#~/commands/track";
import { registerCommand } from "#~/discord/deployCommands.server";
import discordBot from "#~/discord/gateway";
import { applicationKey } from "#~/helpers/env.server";

export const app = express();

const logger = pinoHttp();
app.use(logger);

// Suppress Chrome DevTools 404 warnings
app.get("/.well-known/appspecific/*", (_req, res) => {
  res.status(204).end();
});

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
  }),
);

// Discord signature verification
app.post("/webhooks/discord", bodyParser.json(), async (req, res, next) => {
  const isValidRequest = await verifyKey(
    JSON.stringify(req.body),
    req.header("X-Signature-Ed25519") ?? "bum signature",
    req.header("X-Signature-Timestamp") ?? "bum timestamp",
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
 * Register Discord commands.
 */
registerCommand(setup);
registerCommand(report);
registerCommand(forceBan);
registerCommand(track);
registerCommand(setupTicket);
registerCommand(setupReactjiChannel);
registerCommand(EscalationCommands);
