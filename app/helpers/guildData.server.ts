import { Routes } from "discord-api-types/v10";
import { ssrDiscordSdk } from "#~/discord/api.js";
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
  parent_id?: string | null;
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
    const [guildRoles, guildChannels] = await trackPerformance(
      "discord.fetchGuildData",
      () =>
        Promise.all([
          ssrDiscordSdk.get(Routes.guildRoles(guildId)) as Promise<GuildRole[]>,
          ssrDiscordSdk.get(Routes.guildChannels(guildId)) as Promise<
            GuildChannel[]
          >,
        ]),
    );

    const roles = guildRoles
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position);

    const categories = guildChannels
      .filter((channel) => channel.type === 4)
      .sort((a, b) => a.position - b.position);

    const allChannels = guildChannels
      .filter((channel) => channel.type === 0)
      .sort((a, b) => a.position - b.position);

    log("info", "guildData", "Guild data fetched successfully", {
      guildId,
      rolesCount: roles.length,
      channelsCount: allChannels.length,
      categoriesCount: categories.length,
    });

    const channelsByCategory = new Map<string, GuildChannel[]>();

    allChannels.forEach((channel) => {
      if (channel.parent_id) {
        if (!channelsByCategory.has(channel.parent_id)) {
          channelsByCategory.set(channel.parent_id, []);
        }
        channelsByCategory.get(channel.parent_id)!.push(channel);
      }
    });

    const channels: ProcessedChannel[] = [
      ...allChannels
        .filter((channel) => !channel.parent_id)
        .map((channel) => ({ type: "channel", data: channel }) as const),
      ...categories.map((category) => {
        const categoryChannels = channelsByCategory.get(category.id) || [];
        return {
          type: "category",
          data: category,
          children: categoryChannels.sort((a, b) => a.position - b.position),
        } as const;
      }),
    ];

    return { roles, channels };
  } catch (error) {
    log("error", "guildData", "Failed to fetch guild data", {
      guildId,
      error,
    });
    return { roles: [], channels: [] };
  }
}
