import {
  createCookieSessionStorage,
  createSessionStorage,
  redirect,
  data,
} from "react-router";

import { randomUUID } from "crypto";
import { AuthorizationCode } from "simple-oauth2";

import db from "#~/db.server";
import type { DB } from "#~/db.server";
import {
  createUser,
  getUserByExternalId,
  getUserById,
} from "#~/models/user.server";
import { fetchUser } from "#~/models/discord.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import {
  applicationId,
  discordSecret,
  sessionSecret,
} from "#~/helpers/env.server";

export type Sessions = DB["sessions"];

const config = {
  client: {
    id: applicationId,
    secret: discordSecret,
  },
  auth: {
    tokenHost: "https://discord.com",
    tokenPath: "/api/oauth2/token",
    authorizePath: "/api/oauth2/authorize",
    revokePath: "/api/oauth2/revoke",
  },
};

const authorization = new AuthorizationCode(config);

const USER_SCOPE = "identify email guilds guilds.members.read";
const BOT_SCOPE =
  "identify email guilds guilds.members.read bot applications.commands";

const {
  commitSession: commitCookieSession,
  destroySession: destroyCookieSession,
  getSession: getCookieSession,
} = createCookieSessionStorage({
  cookie: {
    name: "__client-session",
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});
export type CookieSession = Awaited<ReturnType<typeof getCookieSession>>;

const {
  commitSession: commitDbSession,
  destroySession: destroyDbSession,
  getSession: getDbSession,
} = createSessionStorage({
  cookie: {
    name: "__session",
    sameSite: "lax",
  },
  async createData(data, expires) {
    const result = await db
      .insertInto("sessions")
      .values({
        id: randomUUID(),
        data: JSON.stringify(data),
        expires: expires?.toString(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (!result.id) {
      console.error({ result, data, expires });
      throw new Error("Failed to create session data");
    }
    return result.id;
  },
  async readData(id) {
    const result = await db
      .selectFrom("sessions")
      .where("id", "=", id)
      .selectAll()
      .executeTakeFirst();

    return (result?.data as unknown) ?? null;
  },
  async updateData(id, data, expires) {
    await db
      .updateTable("sessions")
      .set("data", JSON.stringify(data))
      .set("expires", expires?.toString() || null)
      .where("id", "=", id)
      .execute();
  },
  async deleteData(id) {
    await db.deleteFrom("sessions").where("id", "=", id).execute();
  },
});
export type DbSession = Awaited<ReturnType<typeof getDbSession>>;

export const CookieSessionKeys = {
  userId: "userId",
  discordToken: "discordToken",
} as const;

export const DbSessionKeys = {
  authState: "state",
  authRedirect: "redirectTo",
  authFlow: "flow",
  authGuildId: "guildId",
} as const;

async function getUserId(request: Request): Promise<string | undefined> {
  const session = await getDbSession(request.headers.get("Cookie"));
  const userId = session.get(CookieSessionKeys.userId);
  return userId;
}

export async function getUser(request: Request) {
  const userId = await getUserId(request);
  if (userId === undefined) return null;

  const user = await getUserById(userId);
  if (!user) throw await logout(request);
  return user;
}

export async function requireUserId(
  request: Request,
  redirectTo: string = new URL(request.url).pathname,
): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }
  return userId;
}

export async function requireUser(request: Request) {
  const userId = await requireUserId(request);

  const user = await getUserById(userId);
  if (user) return user;

  throw await logout(request);
}

const OAUTH_REDIRECT_ROUTE = "discord-oauth";

export async function initOauthLogin({
  request,
  redirectTo,
  flow = "user",
  guildId,
}: {
  request: Request;
  redirectTo?: string;
  flow?: "user" | "signup" | "add-bot";
  guildId?: string;
}) {
  const { origin } = new URL(request.url);
  const cookieSession = await getCookieSession(request.headers.get("Cookie"));

  const state = randomUUID();
  cookieSession.set(DbSessionKeys.authState, state);
  cookieSession.set(DbSessionKeys.authFlow, flow);
  if (redirectTo) {
    cookieSession.set(DbSessionKeys.authRedirect, redirectTo);
  }
  if (guildId) {
    cookieSession.set(DbSessionKeys.authGuildId, guildId);
  }

  // Choose scope based on flow type
  const scope = flow === "user" ? USER_SCOPE : BOT_SCOPE;

  // Build authorization URL
  const authParams: Record<string, string> = {
    redirect_uri: `${origin}/${OAUTH_REDIRECT_ROUTE}`,
    state,
    scope,
  };

  // Add bot-specific parameters
  if (flow !== "user") {
    // Core permissions: ManageRoles + SendMessages + ManageMessages + ReadMessageHistory + ModerateMembers
    authParams.permissions = "1099512100352";
    if (guildId) {
      authParams.guild_id = guildId;
    }
  }

  const cookie = await commitCookieSession(cookieSession, {
    maxAge: 60 * 60 * 1, // 1 hour
  });

  return redirect(authorization.authorizeURL(authParams), {
    headers: { "Set-Cookie": cookie },
  });
}

export async function completeOauthLogin(
  origin: string,
  code: string,
  reqCookie: string,
  state?: string,
) {
  const [cookieSession, dbSession] = await Promise.all([
    getCookieSession(reqCookie),
    getDbSession(reqCookie),
  ]);

  const cookieState = cookieSession.get(DbSessionKeys.authState);
  const flow = cookieSession.get(DbSessionKeys.authFlow) ?? "user";
  const guildId = cookieSession.get(DbSessionKeys.authGuildId);

  // Choose scope based on flow type
  const scope = flow === "user" ? USER_SCOPE : BOT_SCOPE;

  const token = await authorization.getToken({
    scope,
    code,
    redirect_uri: `${origin}/${OAUTH_REDIRECT_ROUTE}`,
  });
  const discordUser = await fetchUser(token);

  // Retrieve our user from Discord ID
  let userId;
  try {
    const user = await getUserByExternalId(discordUser.id);
    if (user) {
      userId = user.id;
    }
  } catch (e) {
    // Do nothing
    // TODO: bail out if there's a network/etc error
  }
  if (!userId) {
    userId = await createUser(discordUser.email, discordUser.id);
  }
  if (!userId) {
    throw data(
      { message: `Couldn't find a user or create a new user` },
      { status: 500 },
    );
  }

  // Handle bot installation flows
  if (flow !== "user" && guildId) {
    // Initialize free subscription for the guild
    await SubscriptionService.initializeFreeSubscription(guildId);
  }

  // dbState already checked earlier
  // Redirect to login if the state arg doesn't match
  if (cookieState !== state) {
    console.error("DB state didn’t match cookie state");
    throw redirect("/login");
  }

  dbSession.set(CookieSessionKeys.userId, userId);
  // @ts-expect-error token.toJSON() isn't in the types but it works
  dbSession.set(CookieSessionKeys.discordToken, token.toJSON());
  // Clean up session data
  cookieSession.unset(DbSessionKeys.authState);
  cookieSession.unset(DbSessionKeys.authFlow);
  cookieSession.unset(DbSessionKeys.authGuildId);

  // Determine redirect based on flow
  let redirectTo = dbSession.get(DbSessionKeys.authRedirect) ?? "/guilds";
  if (flow !== "user" && guildId) {
    redirectTo = `/onboard?guild_id=${guildId}`;
  }

  const [cookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }),
    commitDbSession(dbSession),
  ]);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", dbCookie);

  return redirect(redirectTo, { headers });
}

export async function retrieveDiscordToken(request: Request) {
  const dbSession = await getDbSession(request.headers.get("Cookie"));
  const storedToken = dbSession.get(CookieSessionKeys.discordToken);
  const token = authorization.createToken(storedToken);
  return token;
}
export async function refreshDiscordSession(request: Request) {
  const dbSession = await getDbSession(request.headers.get("Cookie"));
  const token = await retrieveDiscordToken(request);
  const newToken = await token.refresh();
  dbSession.set(CookieSessionKeys.discordToken, JSON.stringify(newToken));

  return dbSession;
}

export async function logout(request: Request) {
  const [cookieSession, dbSession] = await Promise.all([
    getCookieSession(request.headers.get("Cookie")),
    getDbSession(request.headers.get("Cookie")),
  ]);
  const [cookie, dbCookie] = await Promise.all([
    destroyCookieSession(cookieSession),
    destroyDbSession(dbSession),
  ]);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", dbCookie);

  return redirect("/", { headers });
}
