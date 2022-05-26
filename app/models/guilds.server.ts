import type { Guild, Role, TextChannel } from "discord.js";

export enum CHANNELS {
  modLog = "modLog",
}

// TODO replace this with a dynamic setup per-guild, kept in sqlite
const guilds: Record<string, Record<string, string>> = {
  "614601782152265748": {
    [CHANNELS.modLog]: "925847644318879754",
  },
};

export const fetchChannel = async (channel: CHANNELS, guild: Guild) => {
  const id = await Promise.resolve(guilds[guild.id][channel]);
  return (await guild.channels.fetch(id)) as TextChannel;
};

export enum ROLES {
  moderator = "moderator",
}

// TODO replace this with a dynamic setup per-guild, kept in sqlite
const guildRoles: Record<string, Record<ROLES, string>> = {
  "614601782152265748": {
    [ROLES.moderator]: "916797467918471190",
  },
};

export const fetchRole = async (role: ROLES, guild: Guild) => {
  const id = await Promise.resolve(guildRoles[guild.id][role]);
  return (await guild.roles.fetch(id)) as Role;
};
