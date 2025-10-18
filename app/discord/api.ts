import { REST } from "discord.js";
import { discordToken } from "#~/helpers/env.server";
import { retrieveDiscordToken } from "#~/models/session.server.js";

export const ssrDiscordSdk = new REST({ version: "10" }).setToken(discordToken);

export async function userDiscordSdkFromRequest(request: Request) {
  const userToken = await retrieveDiscordToken(request);
  return new REST({ version: "10", authPrefix: "Bearer" }).setToken(
    userToken.token.access_token as string,
  );
}
