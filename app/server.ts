import "react-router";
import { verifyKey } from "discord-interactions";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import bodyParser from "body-parser";
import pinoHttp from "pino-http";

import { applicationKey } from "#~/helpers/env.server";

import discordBot from "#~/discord/gateway";
import { registerCommand } from "#~/discord/deployCommands.server";

import { Command as forceBan } from "#~/commands/force-ban";
import { Command as setup } from "#~/commands/setup";
import { Command as report } from "#~/commands/report";
import { Command as track } from "#~/commands/track";
import { Command as setupTicket } from "#~/commands/setupTickets";
import { EscalationCommands } from "#~/commands/escalationControls";

export const app = express();

const logger = pinoHttp();
app.use(logger);

// Suppress Chrome DevTools 404 warnings
app.get("/.well-known/appspecific/*", (_req, res) => {
  res.status(204).end();
});

app.use(
  createRequestHandler({
    // @ts-expect-error - virtual module provided by React Router at build time
    build: () => import("virtual:react-router/server-build"),
  }),
);

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
 * Register Discord commands.
 */
registerCommand(setup);
registerCommand(report);
registerCommand(forceBan);
registerCommand(track);
registerCommand(setupTicket);
registerCommand(EscalationCommands);
