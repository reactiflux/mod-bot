import db, { SqliteError, type DB } from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

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
  return trackPerformance(
    "fetchGuild",
    async () => {
      log("debug", "Guild", "Fetching guild", { guildId });

      const guild = await db
        .selectFrom("guilds")
        .selectAll()
        .where("id", "=", guildId)
        .executeTakeFirst();

      log("debug", "Guild", guild ? "Guild found" : "Guild not found", {
        guildId,
        guildExists: !!guild,
        hasSettings: !!guild?.settings,
      });

      return guild;
    },
    { guildId },
  );
};

export const registerGuild = async (guildId: string) => {
  return trackPerformance(
    "registerGuild",
    async () => {
      log("info", "Guild", "Registering guild", { guildId });

      try {
        await db
          .insertInto("guilds")
          .values({
            id: guildId,
            settings: JSON.stringify({}),
          })
          .execute();

        log("info", "Guild", "Guild registered successfully", { guildId });
      } catch (e) {
        if (
          e instanceof SqliteError &&
          e.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
        ) {
          log("debug", "Guild", "Guild already exists", { guildId });
          // do nothing
        } else {
          log("error", "Guild", "Failed to register guild", {
            guildId,
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          });
          throw e;
        }
      }
    },
    { guildId },
  );
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
