import type { Guild as DiscordGuild } from "discord.js";
import knex, { SqliteError } from "~/db.server";

type jsonString = string;
export interface Guild {
  id: string;
  settings: jsonString;
}

export const SETTINGS = {
  modLog: "modLog",
  moderator: "moderator",
} as const;

// These types are not enforced by the database, they need to be carefully
// managed by setup guarantees
interface SettingsRecord {
  [SETTINGS.modLog]: string;
  [SETTINGS.moderator]: string;
}

export const fetchGuild = async (guild: DiscordGuild) => {
  return await knex<Guild>("guilds").where({ id: guild.id }).first();
};
export const registerGuild = async (guild: DiscordGuild) => {
  try {
    await knex("guilds").insert({
      id: guild.id,
      settings: {},
    });
  } catch (e) {
    if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      // do nothing
    } else {
      throw e;
    }
  }
};

export const setSettings = async (
  guild: DiscordGuild,
  settings: SettingsRecord,
) => {
  await Promise.all(
    Object.entries(settings).map(([key, value]) =>
      knex("guilds")
        .update({ settings: knex.jsonSet("settings", `$.${key}`, value) })
        .where({ id: guild.id }),
    ),
  );
};

export const fetchSettings = async <T extends keyof typeof SETTINGS>(
  guild: DiscordGuild,
  keys: T[],
): Promise<Pick<SettingsRecord, typeof keys[number]>> => {
  return await knex("guilds")
    .where({ id: guild.id })
    .select(knex.jsonExtract(keys.map((k) => ["settings", `$.${k}`, k])))
    .first();
};
