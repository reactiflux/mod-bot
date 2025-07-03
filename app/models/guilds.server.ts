import db, { SqliteError } from "#~/db.server";
import type { DB } from "#~/db.server";

export type Guild = DB["guilds"];

export const SETTINGS = {
  modLog: "modLog",
  moderator: "moderator",
  restricted: "restricted",
} as const;

// These types are not enforced by the database, they need to be carefully
// managed by setup guarantees
interface SettingsRecord {
  [SETTINGS.modLog]: string;
  [SETTINGS.moderator]: string;
  [SETTINGS.restricted]?: string;
}

export const fetchGuild = async (guildId: string) => {
  return await db
    .selectFrom("guilds")
    .where("id", "=", guildId)
    .executeTakeFirst();
};

export const registerGuild = async (guildId: string) => {
  try {
    await db
      .insertInto("guilds")
      .values({
        id: guildId,
        settings: JSON.stringify({}),
      })
      .execute();
  } catch (e) {
    if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      // do nothing
    } else {
      throw e;
    }
  }
};

export const setSettings = async (
  guildId: string,
  settings: SettingsRecord,
) => {
  await db
    .updateTable("guilds")
    .set("settings", (eb) =>
      eb.fn("json_patch", ["settings", eb.val(JSON.stringify(settings))]),
    )
    .where("id", "=", guildId)
    .execute();
};

export const fetchSettings = async <T extends keyof typeof SETTINGS>(
  guildId: string,
  keys: T[],
) => {
  const result = Object.entries(
    await db
      .selectFrom("guilds")
      // @ts-expect-error This is broken because of a migration from knex and
      // old/bad use of jsonb for storing settings. The type is guaranteed here
      // not by the codegen
      .select<DB, "guilds", SettingsRecord>((eb) =>
        keys.map((k) => eb.ref("settings", "->").key(k).as(k)),
      )
      .where("id", "=", guildId)
      // This cast is also evidence of the pattern being broken
      .executeTakeFirstOrThrow(),
  ) as [T, string][];
  return Object.fromEntries(result.map(([k, v]) => [k, JSON.parse(v)])) as Pick<
    SettingsRecord,
    T
  >;
};
