import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { retry } from "#~/helpers/misc";

import { fetchGuild } from "#~/models/guilds.server";

export default async (bot: Client) => {
  // This is called any time the bot comes online, when a server becomes
  // available after downtime, or when actually added to a new guild
  bot.on("guildCreate", async (guild) => {
    const appGuild = await fetchGuild(guild.id);
    if (!appGuild) {
      const welcomeMessage = `You've added automoderation! Configure the bot with the /onboard command or go to http://localhost:3000/onboard`;

      const channels = await guild.channels.fetch();
      const likelyChannels = channels.filter((c): c is TextChannel =>
        Boolean(
          c &&
            c.type === ChannelType.GuildText &&
            (c.name.includes("mod") || c.name.includes("intro")),
        ),
      );

      await retry(5, async (n) => {
        switch (n) {
          case 0:
            guild.systemChannel!.send(welcomeMessage);
            return;
          case 1:
            guild.publicUpdatesChannel!.send(welcomeMessage);
            return;
          default: {
            if (likelyChannels.size < n - 2) return;
            likelyChannels.at(n - 2)!.send(welcomeMessage);
            return;
          }
        }
      });
    }
  });
};
