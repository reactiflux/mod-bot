import "react-router";

import bodyParser from "body-parser";
import { verifyKey } from "discord-interactions";
import { Effect } from "effect";
import express from "express";
import pinoHttp from "pino-http";

import { createRequestHandler } from "@react-router/express";

import { EscalationCommands } from "#~/commands/escalationControls";
import { Command as forceBan } from "#~/commands/force-ban";
import { Command as report } from "#~/commands/report";
import { Command as setup } from "#~/commands/setup";
import { Command as setupHoneypot } from "#~/commands/setupHoneypot";
import { Command as setupReactjiChannel } from "#~/commands/setupReactjiChannel";
import { Command as setupTicket } from "#~/commands/setupTickets";
import { Command as track } from "#~/commands/track";
import { registerCommand } from "#~/discord/deployCommands.server";
import { initDiscordBot } from "#~/discord/gateway";
import { applicationKey } from "#~/helpers/env.server";

import { runtime } from "./AppRuntime";
import { checkpointWal, runIntegrityCheck } from "./Database";
import { logEffect } from "./effects/observability";

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

const startup = Effect.gen(function* () {
  yield* initDiscordBot;
  yield* Effect.forkDaemon(runIntegrityCheck);

  yield* registerCommand(setup);
  yield* registerCommand(report);
  yield* registerCommand(forceBan);
  yield* registerCommand(track);
  yield* registerCommand(setupTicket);
  yield* registerCommand(setupReactjiChannel);
  yield* registerCommand(EscalationCommands);
  yield* registerCommand(setupHoneypot);

  // Graceful shutdown handler to checkpoint WAL and dispose the runtime
  // (tears down PostHog finalizer, feature flag interval, and SQLite connection)
  const handleShutdown = (signal: string) =>
    runtime
      .runPromise(
        Effect.gen(function* () {
          yield* logEffect("info", "Server", `Received ${signal}`);
          try {
            yield* checkpointWal();
            yield* logEffect("info", "Server", "Database WAL checkpointed");
          } catch (e) {
            yield* logEffect("error", "Server", "Error checkpointing WAL", {
              error: String(e),
            });
          }
          process.exit(0);
        }),
      )
      .then(() => runtime.dispose().then(() => console.log("ok")));

  process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
  process.on("SIGINT", () => void handleShutdown("SIGINT"));
});

void Effect.runPromise(startup);
