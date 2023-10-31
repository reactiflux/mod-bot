import Sentry from "~/helpers/sentry.server";

import { client, login } from "~/discord/client.server";
import {
  deployCommands,
  registerCommand,
} from "~/discord/deployCommands.server";

import automod from "~/discord/automod";
import onboardGuild from "~/discord/onboardGuild";

import * as convene from "~/commands/convene";
import * as setup from "~/commands/setup";
import * as report from "~/commands/report";
import * as track from "~/commands/track";
import { auditLogs } from "./auditLog";

registerCommand(convene);
registerCommand(setup);
registerCommand(report);
registerCommand(track);

export default function init() {
  login();

  client.on("ready", async () => {
    await Promise.all([
      onboardGuild(client),
      automod(client),
      auditLogs(client),
      deployCommands(client),
    ]);
  });

  client.on("threadCreate", (thread) => {
    thread.join();
  });

  const errorHandler = (error: unknown) => {
    Sentry.captureException(error);
    if (error instanceof Error) {
      console.log("ERROR", error.message);
    } else if (typeof error === "string") {
      console.log("ERROR", error);
    }
  };

  client.on("error", errorHandler);
}
