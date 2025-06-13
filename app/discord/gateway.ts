import Sentry from "#~/helpers/sentry.server";

import { client, login } from "#~/discord/client.server";
import { deployCommands } from "#~/discord/deployCommands.server";

import automod from "#~/discord/automod";
import onboardGuild from "#~/discord/onboardGuild";
import { startActivityTracking } from "#~/discord/activityTracker";

export default function init() {
  login();

  client.on("ready", async () => {
    await Promise.all([
      onboardGuild(client),
      automod(client),
      deployCommands(client),
      startActivityTracking(client),
    ]);
  });

  // client.on("messageReactionAdd", () => {});

  client.on("threadCreate", (thread) => {
    thread.join();
  });

  // client.on("messageCreate", async (msg) => {
  //   if (msg.author?.id === client.user?.id) return;

  //   //
  // });

  const errorHandler = (error: unknown) => {
    Sentry.captureException(error);
    if (error instanceof Error) {
      console.log("[GATEWAY ERROR]", error.message, error.stack);
    } else if (typeof error === "string") {
      console.log("[GATEWAY ERROR]", error);
    }
  };

  client.on("error", errorHandler);
}
