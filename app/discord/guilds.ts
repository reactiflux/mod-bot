import type { Guild, Role, TextChannel } from "discord.js";

export enum CHANNELS {
  modLog = "modLog",
}

const guilds: Record<string, Record<string, string>> = {
  "614601782152265748": {
    [CHANNELS.modLog]: "925847644318879754",
  },
};
const fetchChannelByGuildId = (id: string, channel: CHANNELS) => {
  return Promise.resolve(guilds[id][channel]);
};

export const fetchChannel = async (channel: CHANNELS, guild: Guild) => {
  const id = await fetchChannelByGuildId(guild.id, channel);
  return (await guild.channels.fetch(id)) as TextChannel;
};

export enum ROLES {
  moderator = "moderator",
}

const guildRoles: Record<string, Record<ROLES, string>> = {
  "614601782152265748": {
    [ROLES.moderator]: "916797467918471190",
  },
};
const fetchRolesByGuildId = (id: string, role: ROLES) => {
  return Promise.resolve(guildRoles[id][role]);
};

export const fetchRole = async (role: ROLES, guild: Guild) => {
  const id = await fetchRolesByGuildId(guild.id, role);
  return (await guild.roles.fetch(id)) as Role;
};
