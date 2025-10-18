import {
  Routes,
  type APIGuild,
  PermissionFlagsBits,
} from "discord-api-types/v10";

import type { REST } from "@discordjs/rest";
import { type GuildMember } from "discord.js";

import { complement, intersection } from "#~/helpers/sets.js";

import type { AccessToken } from "simple-oauth2";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { trackPerformance } from "#~/helpers/observability.js";

export interface DiscordUserInfo {
  id: string;
  username: string;
  discriminator: string;
  uniqueUsername: string;
  email: string;
  verified: string;
  locale: string;
  has2FA: boolean;
  avatar: string;
}

export async function fetchUser(access: AccessToken): Promise<DiscordUserInfo> {
  const { token_type: tokenType, access_token: accessToken } = access.token;
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `${tokenType} ${accessToken}` },
  });
  const {
    id,
    username,
    discriminator,
    email,
    verified,
    locale,
    mfa_enabled: has2FA,
    avatar,
  } = await res.json();

  return {
    id,
    username,
    uniqueUsername: `${username}#${discriminator}`,
    discriminator,
    email,
    verified,
    locale,
    has2FA,
    avatar,
  };
}

export const applyRestriction = async (member: GuildMember | null) => {
  if (!member) {
    console.log("Tried to apply restriction to a null member");
    return;
  }

  const { restricted } = await fetchSettings(member.guild.id, [
    SETTINGS.restricted,
  ]);
  if (!restricted) {
    throw new Error(
      "Tried to restrict with no restricted role configured. This is likely a development error.",
    );
  }
  const restrictedRole = await member.guild.roles.fetch(restricted);
  if (!restrictedRole) {
    throw new Error("Couldn’t find restricted role");
  }
  return member.roles.add(restrictedRole);
};

export const kick = async (member: GuildMember | null) => {
  if (!member) {
    console.log("Tried to kick a null member");
    return;
  }
  return member.kick();
};

export const ban = async (member: GuildMember | null) => {
  if (!member) {
    console.log("Tried to ban a null member");
    return;
  }
  return member.ban();
};

const OVERNIGHT = 1000 * 60 * 60 * 20;
export const timeout = async (member: GuildMember | null) => {
  if (!member) {
    console.log("Tried to timeout a null member");
    return;
  }
  return member.timeout(OVERNIGHT);
};

const authzRoles = {
  mod: "MOD",
  admin: "ADMIN",
  manager: "MANAGER",
  manageChannels: "MANAGE_CHANNELS",
  manageGuild: "MANAGE_GUILD",
  manageRoles: "MANAGE_ROLES",
} as const;

const isUndefined = (x: unknown): x is undefined => typeof x === "undefined";

const processGuild = (g: APIGuild) => {
  const perms = BigInt(g.permissions || 0);
  const authz = new Set<(typeof authzRoles)[keyof typeof authzRoles]>();

  if (perms & PermissionFlagsBits.Administrator) {
    authz.add(authzRoles.admin);
  }
  if (perms & PermissionFlagsBits.ModerateMembers) {
    authz.add(authzRoles.mod);
  }
  if (perms & PermissionFlagsBits.ManageChannels) {
    authz.add(authzRoles.manageChannels);
    authz.add(authzRoles.manager);
  }
  if (perms & PermissionFlagsBits.ManageGuild) {
    authz.add(authzRoles.manageGuild);
    authz.add(authzRoles.manager);
  }
  if (perms & PermissionFlagsBits.ManageRoles) {
    authz.add(authzRoles.manageRoles);
    authz.add(authzRoles.manager);
  }

  return {
    id: g.id as string,
    icon: g.icon ?? undefined,
    name: g.name as string,
    authz: [...authz.values()],
  };
};

export interface Guild extends ReturnType<typeof processGuild> {
  hasBot: boolean;
}

export const fetchGuilds = async (
  userRest: REST,
  botRest: REST,
): Promise<Guild[]> => {
  const [rawUserGuilds, rawBotGuilds] = (await trackPerformance(
    "discord.fetchGuilds",
    () =>
      Promise.all([
        userRest.get(Routes.userGuilds()),
        botRest.get(Routes.userGuilds()),
      ]),
  )) as [APIGuild[], APIGuild[]];

  const botGuilds = new Map(
    rawBotGuilds.reduce(
      (accum, val) => {
        const guild = processGuild(val);
        if (guild.authz.length > 0) {
          accum.push([val.id, guild]);
        }
        return accum;
      },
      [] as [string, Omit<Guild, "hasBot">][],
    ),
  );
  const userGuilds = new Map(
    rawUserGuilds.reduce(
      (accum, val) => {
        const guild = processGuild(val);
        if (guild.authz.includes("MANAGER")) {
          accum.push([val.id, guild]);
        }
        return accum;
      },
      [] as [string, Omit<Guild, "hasBot">][],
    ),
  );

  const botGuildIds = new Set(botGuilds.keys());
  const userGuildIds = new Set(userGuilds.keys());

  const manageableGuilds = intersection(userGuildIds, botGuildIds);
  const invitableGuilds = complement(userGuildIds, botGuildIds);

  return [
    ...[...manageableGuilds].map((gId) => {
      const guild = botGuilds.get(gId);
      return guild ? { ...guild, hasBot: true } : undefined;
    }),
    ...[...invitableGuilds].map((gId) => {
      const guild = botGuilds.get(gId);
      return guild ? { ...guild, hasBot: false } : undefined;
    }),
  ].filter((g) => !isUndefined(g));
};
