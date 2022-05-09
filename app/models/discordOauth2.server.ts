import { AuthorizationCode, ClientCredentials } from "simple-oauth2";
import type { AccessToken } from "simple-oauth2";

const config = {
  client: {
    id: process.env.DISCORD_APP_ID || "",
    secret: process.env.DISCORD_SECRET || "",
  },
  auth: {
    tokenHost: "https://discord.com",
    tokenPath: "/api/oauth2/token",
    authorizePath: "/api/oauth2/authorize",
    revokePath: "/api/oauth2/revoke",
  },
};

const authorization = new AuthorizationCode(config);
const credentials = new ClientCredentials(config);

const SCOPE = "identify email";

export function authUrl({
  redirect,
  state,
}: {
  redirect: string;
  state: string;
}) {
  return authorization.authorizeURL({
    redirect_uri: redirect,
    scope: SCOPE,
    state,
  });
}

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

export function fetchToken() {
  return credentials.getToken({ scope: SCOPE });
}
export function parseToken(stored: string) {
  return credentials.createToken(JSON.parse(stored));
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
