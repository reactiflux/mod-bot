import { REST } from "discord.js";
import { discordToken } from "~/helpers/env";

export const rest = new REST({ version: "10" }).setToken(discordToken);
