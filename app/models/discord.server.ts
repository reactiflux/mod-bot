import type { GuildMember } from "discord.js";
import type { AccessToken } from "simple-oauth2";
import { fetchSettings, SETTINGS } from "~/models/guilds.server";

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

export const applyRestriction = async (member: GuildMember) => {
  const { restricted } = await fetchSettings(member.guild!, [
    SETTINGS.restricted,
  ]);
  if (!restricted) {
    throw new Error(
      "Tried to restrict with no restricted role configured. This is likely a development error.",
    );
  }
  return member.roles.add((await member.guild!.roles.fetch(restricted))!);
};

export const kick = async (member: GuildMember) => {
  return member.kick();
};

export const ban = async (member: GuildMember) => {
  return member.ban();
};

const OVERNIGHT = 1000 * 60 * 60 * 20;
export const timeout = async (member: GuildMember) => {
  return member.timeout(OVERNIGHT);
};
