import { REST } from "discord.js";
import { redirect } from "react-router";

import { discordToken } from "#~/helpers/env.server";
import { log } from "#~/helpers/observability";
import { retrieveDiscordToken } from "#~/models/session.server.js";

export const ssrDiscordSdk = new REST({ version: "10" }).setToken(discordToken);

export async function userDiscordSdkFromRequest(request: Request) {
  let userToken = await retrieveDiscordToken(request);

  if (userToken.expired()) {
    log("info", "api", "Discord OAuth token expired, attempting refresh");
    try {
      userToken = await userToken.refresh();
    } catch (refreshError) {
      log(
        "warn",
        "api",
        "Discord OAuth token refresh failed, redirecting to login",
        {
          error:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
        },
      );
      throw redirect("/login");
    }
  }

  return new REST({ version: "10", authPrefix: "Bearer" }).setToken(
    userToken.token.access_token as string,
  );
}
