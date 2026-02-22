import {
  ChannelType,
  PermissionFlagsBits,
  Routes,
  type APIChannel,
  type APIGuildMember,
  type APIRole,
} from "discord-api-types/v10";

import { ssrDiscordSdk } from "#~/discord/api";
import { applicationId } from "#~/helpers/env.server";
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

function toGuildChannel(ch: APIChannel): GuildChannel {
  return {
    id: ch.id,
    name: ch.name ?? "",
    position: "position" in ch ? (ch.position ?? 0) : 0,
    type: ch.type,
    parentId: "parent_id" in ch ? (ch.parent_id ?? null) : null,
  };
}

/** Permissions the bot requires to operate — matches /check-requirements */
const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.ManageChannels, name: "Manage Channels" },
  { flag: PermissionFlagsBits.ManageRoles, name: "Manage Roles" },
  { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages" },
  {
    flag: PermissionFlagsBits.ReadMessageHistory,
    name: "Read Message History",
  },
  { flag: PermissionFlagsBits.SendMessages, name: "Send Messages" },
  {
    flag: PermissionFlagsBits.SendMessagesInThreads,
    name: "Send Messages in Threads",
  },
  { flag: PermissionFlagsBits.ViewChannel, name: "View Channels" },
  { flag: PermissionFlagsBits.KickMembers, name: "Kick Members" },
  { flag: PermissionFlagsBits.ModerateMembers, name: "Moderate Members" },
  {
    flag: PermissionFlagsBits.CreatePrivateThreads,
    name: "Create Private Threads",
  },
  { flag: PermissionFlagsBits.ViewAuditLog, name: "View Audit Log" },
];

/**
 * Fetch the bot's guild member and guild roles, then compute which required
 * permissions are missing. Returns an empty array when all permissions are granted.
 */
export async function fetchMissingBotPermissions(
  guildId: string,
): Promise<string[]> {
  try {
    const [botMember, allRoles] = await trackPerformance(
      "discord.fetchBotPermissions",
      () =>
        Promise.all([
          ssrDiscordSdk.get(
            Routes.guildMember(guildId, applicationId),
          ) as Promise<APIGuildMember>,
          ssrDiscordSdk.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>,
        ]),
    );

    // Start with @everyone role permissions (role ID === guild ID)
    const everyoneRole = allRoles.find((r) => r.id === guildId);
    let permissions = BigInt(everyoneRole?.permissions ?? "0");

    // OR in permissions from each role the bot has
    for (const roleId of botMember.roles) {
      const role = allRoles.find((r) => r.id === roleId);
      if (role) {
        permissions |= BigInt(role.permissions);
      }
    }

    // Administrator grants everything
    if (permissions & PermissionFlagsBits.Administrator) {
      return [];
    }

    const missing = REQUIRED_PERMISSIONS.filter(
      ({ flag }) => !(permissions & flag),
    ).map((p) => p.name);

    if (missing.length > 0) {
      log("warn", "guildData", "Bot is missing permissions", {
        guildId,
        missing,
      });
    }

    return missing;
  } catch (error) {
    log("error", "guildData", "Failed to fetch bot permissions", {
      guildId,
      error,
    });
    return ["Unable to verify permissions"];
  }
}

export async function fetchGuildData(guildId: string): Promise<GuildData> {
  try {
    const [apiRoles, apiChannels] = await trackPerformance(
      "discord.fetchGuildData",
      () =>
        Promise.all([
          ssrDiscordSdk.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>,
          ssrDiscordSdk.get(Routes.guildChannels(guildId)) as Promise<
            APIChannel[]
          >,
        ]),
    );

    const roles = apiRoles
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        color: r.color,
      }));

    const categories = apiChannels
      .filter((ch) => ch.type === ChannelType.GuildCategory)
      .sort(
        (a, b) =>
          ("position" in a ? (a.position ?? 0) : 0) -
          ("position" in b ? (b.position ?? 0) : 0),
      );

    const textChannels = apiChannels
      .filter((ch) => ch.type === ChannelType.GuildText)
      .sort(
        (a, b) =>
          ("position" in a ? (a.position ?? 0) : 0) -
          ("position" in b ? (b.position ?? 0) : 0),
      );

    log("info", "guildData", "Guild data fetched successfully", {
      guildId,
      rolesCount: roles.length,
      channelsCount: textChannels.length,
      categoriesCount: categories.length,
    });

    const channelsByCategory = new Map<string, GuildChannel[]>();
    for (const ch of textChannels) {
      const parentId = "parent_id" in ch ? ch.parent_id : null;
      if (parentId) {
        if (!channelsByCategory.has(parentId)) {
          channelsByCategory.set(parentId, []);
        }
        channelsByCategory.get(parentId)!.push(toGuildChannel(ch));
      }
    }

    const channels: ProcessedChannel[] = [
      ...textChannels
        .filter((ch) => !("parent_id" in ch) || !ch.parent_id)
        .map((ch) => ({ type: "channel" as const, data: toGuildChannel(ch) })),
      ...categories.map((cat) => ({
        type: "category" as const,
        data: toGuildChannel(cat),
        children: (channelsByCategory.get(cat.id) ?? []).sort(
          (a, b) => a.position - b.position,
        ),
      })),
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
