import { ChannelType } from "discord.js";

import { client } from "#~/discord/client.server.js";
import { log, trackPerformance } from "#~/helpers/observability";

export interface GuildRole {
  id: string;
  name: string;
  position: number;
  color: number;
}

export interface GuildChannel {
  id: string;
  name: string;
  position: number;
  type: number;
  parentId?: string | null;
}

export interface ProcessedChannel {
  type: "channel" | "category";
  data: GuildChannel;
  children?: GuildChannel[];
}

export interface GuildData {
  roles: GuildRole[];
  channels: ProcessedChannel[];
}

export async function fetchGuildData(guildId: string): Promise<GuildData> {
  try {
    const guild = await client.guilds.fetch(guildId);

    const [guildRoles, rawGuildChannels] = await trackPerformance(
      "discord.fetchGuildData",
      () => Promise.all([guild.roles.fetch(), guild.channels.fetch()]),
    );

    const guildChannels = rawGuildChannels.filter((x) => x !== null);

    const roles = guildRoles
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position);

    const categories = guildChannels
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    const allChannels = guildChannels
      .filter((channel) => channel.type === ChannelType.GuildText)
      .sort((a, b) => a.position - b.position);

    log("info", "guildData", "Guild data fetched successfully", {
      guildId,
      rolesCount: roles.size,
      channelsCount: allChannels.size,
      categoriesCount: categories.size,
    });

    const channelsByCategory = new Map<string, GuildChannel[]>();

    allChannels.forEach((channel) => {
      if (channel.parentId) {
        if (!channelsByCategory.has(channel.parentId)) {
          channelsByCategory.set(channel.parentId, []);
        }
        channelsByCategory.get(channel.parentId)!.push(channel);
      }
    });

    const channels: ProcessedChannel[] = [
      ...allChannels
        .filter((channel) => !channel.parentId)
        .map((channel) => ({ type: "channel", data: channel }) as const),
      ...categories.map((category) => {
        const categoryChannels = channelsByCategory.get(category.id) ?? [];
        return {
          type: "category",
          data: category,
          children: categoryChannels.sort((a, b) => a.position - b.position),
        } as const;
      }),
    ];

    return { roles: [...roles.values()], channels };
  } catch (error) {
    log("error", "guildData", "Failed to fetch guild data", {
      guildId,
      error,
    });
    return { roles: [], channels: [] };
  }
}
