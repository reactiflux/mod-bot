import "react-router";
import { verifyKey } from "discord-interactions";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import bodyParser from "body-parser";

import { applicationKey } from "~/helpers/env.server";

import discordBot from "~/discord/gateway";
import { registerCommand } from "~/discord/deployCommands.server";

import * as convene from "~/commands/convene";
import * as setup from "~/commands/setup";
import * as report from "~/commands/report";
import * as track from "~/commands/track";
import setupTicket from "~/commands/setupTickets";

export const app = express();
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
registerCommand(convene);
registerCommand(setup);
registerCommand(report);
registerCommand(track);
registerCommand(setupTicket);
