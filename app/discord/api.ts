import { REST } from "discord.js";
import { discordToken } from "#~/helpers/env.server";

export const ssrDiscordSdk = new REST({ version: "10" }).setToken(discordToken);
