import type { AccessToken } from "simple-oauth2";

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
