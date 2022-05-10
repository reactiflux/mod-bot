import {
  createCookieSessionStorage,
  createSessionStorage,
  redirect,
  Response,
  json,
} from "@remix-run/node";
import invariant from "tiny-invariant";
import { randomUUID } from "crypto";
import { AuthorizationCode } from "simple-oauth2";

import knex from "~/db.server";
import type { User } from "~/models/user.server";
import {
  createUser,
  getUserByExternalId,
  getUserById,
} from "~/models/user.server";
import { fetchUser } from "~/models/discord.server";

invariant(process.env.SESSION_SECRET, "SESSION_SECRET must be set");

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

const SCOPE = "identify email";

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
    secrets: [process.env.SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
  },
});

interface Session {
  id: string;
  data?: string;
  expires?: string;
}

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
    console.log({ data, expires });
    const result = await knex<Session>("sessions").insert(
      {
        id: randomUUID(),
        data: JSON.stringify(data),
        expires: expires?.toString(),
      },
      ["id"],
    );
    return result[0].id;
  },
  async readData(id) {
    const result = await knex<Session>("sessions")
      .select()
      .where({ id })
      .first();
    return result?.data ? JSON.parse(result.data) : null;
  },
  async updateData(id, data, expires) {
    console.log("update", { id, data, expires });
    await knex<Session>("sessions")
      .update({ data: JSON.stringify(data), expires: expires?.toString() })
      .where({ id });
  },
  async deleteData(id) {
    await knex<Session>("sessions").delete().where({ id });
  },
});

const USER_SESSION_KEY = "userId";

async function getUserId(request: Request): Promise<string | undefined> {
  const session = await getCookieSession(request.headers.get("Cookie"));
  const userId = session.get(USER_SESSION_KEY);
  return userId;
}

export async function getUser(request: Request): Promise<null | User> {
  const userId = await getUserId(request);
  if (userId === undefined) return null;

  const user = await getUserById(userId);
  if (user) return user;

  throw await logout(request);
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

const OAUTH_REDIRECT = "http://localhost:3000/discord-oauth";

export async function initOauthLogin({
  request,
}: {
  request: Request;
  redirectTo: string;
}) {
  const dbSession = await getDbSession(request.headers.get("Cookie"));

  const state = randomUUID();
  dbSession.set("state", state);
  return redirect(
    authorization.authorizeURL({
      redirect_uri: OAUTH_REDIRECT,
      state,
      scope: SCOPE,
    }),
    {
      headers: {
        "Set-Cookie": await commitDbSession(dbSession, {
          maxAge: 60 * 60 * 1, // 1 hour
        }),
      },
    },
  );
}

export async function completeOauthLogin(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    throw json({ message: `Discord didn't send an auth code` }, 500);
  }

  const token = await authorization.getToken({
    scope: SCOPE,
    code,
    redirect_uri: OAUTH_REDIRECT,
  });
  const discordUser = await fetchUser(token);

  // Retrieve our user from Discord ID
  let userId;
  try {
    const user = await getUserByExternalId(discordUser.id);
    if (user) {
      userId = user.id;
    }
  } catch (e: any) {
    // Do nothing
    // TODO: bail out if there's a network/etc error
  }
  if (!userId) {
    userId = await createUser(discordUser.email, discordUser.id);
  }
  if (!userId) {
    throw json({ message: `Couldn't find a user or create a new user` }, 500);
  }

  const [cookieSession, dbSession] = await Promise.all([
    getCookieSession(request.headers.get("Cookie")),
    getDbSession(request.headers.get("Cookie")),
  ]);

  // 401 if the state arg doesn't match
  const state = url.searchParams.get("state");
  console.log({ state, dbState: dbSession.get("state") });
  if (dbSession.get("state") !== state) {
    throw redirect("/login", 401);
  }

  cookieSession.set(USER_SESSION_KEY, userId);
  dbSession.unset("state");
  dbSession.set("discordToken", JSON.stringify(token));
  const [cookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }),
    commitDbSession(dbSession),
  ]);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", dbCookie);

  return redirect("/", { headers });
}

export async function refreshSession(request: Request) {
  const dbSession = await getDbSession(request.headers.get("Cookie"));

  const storedToken = await dbSession.get("discordToken");
  const token = authorization.createToken(JSON.parse(storedToken));
  const newToken = await token.refresh();
  dbSession.set("discordToken", JSON.stringify(newToken));
  return new Response("OK", {
    headers: { "Set-Cookie": await commitDbSession(dbSession) },
  });
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
