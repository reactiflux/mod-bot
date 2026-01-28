import {
  ChannelType,
  type AnyThreadChannel,
  type Guild,
  type TextChannel,
  type User,
} from "discord.js";
import { Deferred, Effect, Ref } from "effect";
import type { Selectable } from "kysely";

import { DatabaseService, type SqlError } from "#~/Database";
import type { DB } from "#~/db";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { escalationControls } from "#~/helpers/escalate";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

type ThreadError = DiscordApiError | SqlError;

// Use Selectable to get the type that Kysely returns from queries
export type UserThread = Selectable<DB["user_threads"]>;

// Module-level ref for tracking in-flight getOrCreateUserThread requests
// Deferred is Effect's equivalent of a resolvable promise
const inflightRef = Ref.unsafeMake(
  new Map<string, Deferred.Deferred<AnyThreadChannel, ThreadError>>(),
);

/**
 * Get a user's thread for a specific guild.
 * Returns undefined if no thread exists.
 */
export const getUserThread = (userId: string, guildId: string) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    const [thread] = yield* db
      .selectFrom("user_threads")
      .selectAll()
      .where("user_id", "=", userId)
      .where("guild_id", "=", guildId);

    yield* logEffect(
      "debug",
      "UserThread",
      thread ? "Found user thread" : "No user thread found",
      { userId, guildId, threadId: thread?.thread_id },
    );

    return thread;
  }).pipe(
    Effect.withSpan("getUserThread", { attributes: { userId, guildId } }),
  );

/**
 * Create or update a user thread record.
 */
export const upsertUserThread = (
  userId: string,
  guildId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    yield* db
      .insertInto("user_threads")
      .values({
        user_id: userId,
        guild_id: guildId,
        thread_id: threadId,
      })
      .onConflict((oc) =>
        oc
          .columns(["user_id", "guild_id"])
          .doUpdateSet({ thread_id: threadId }),
      );

    yield* logEffect("debug", "UserThread", "Upserted user thread", {
      userId,
      guildId,
      threadId,
    });
  }).pipe(
    Effect.withSpan("upsertUserThread", {
      attributes: { userId, guildId, threadId },
    }),
  );

const makeUserThread = (channel: TextChannel, user: User) =>
  Effect.tryPromise({
    try: () => channel.threads.create({ name: `${user.username} logs` }),
    catch: (error) =>
      new DiscordApiError({ operation: "createThread", cause: error }),
  });

/**
 * Get or create a user thread with singleflight deduplication.
 * If multiple concurrent requests come in for the same user/guild,
 * only one will do the actual work and others will wait for its result.
 */
type InflightResult =
  | {
      type: "existing";
      deferred: Deferred.Deferred<AnyThreadChannel, ThreadError>;
    }
  | { type: "new"; deferred: Deferred.Deferred<AnyThreadChannel, ThreadError> };

export const getOrCreateUserThread = (guild: Guild, user: User) => {
  const key = `${guild.id}:${user.id}`;

  return Effect.gen(function* () {
    // Create a deferred speculatively - may not be used if another request is in flight
    const myDeferred = yield* Deferred.make<AnyThreadChannel, ThreadError>();

    // Atomically check-and-set: either find existing deferred or register ours
    const result: InflightResult = yield* Ref.modify(inflightRef, (map) => {
      const existing = map.get(key);
      if (existing) {
        return [
          { type: "existing", deferred: existing } as InflightResult,
          map,
        ] as const;
      }
      // We're first - register our deferred
      const newMap = new Map(map);
      newMap.set(key, myDeferred);
      return [
        { type: "new", deferred: myDeferred } as InflightResult,
        newMap,
      ] as const;
    });

    if (result.type === "existing") {
      yield* logEffect("debug", "UserThread", "Waiting for in-flight request", {
        userId: user.id,
        guildId: guild.id,
      });
      // Wait for the existing request to complete
      return yield* Deferred.await(result.deferred);
    }

    // We're the primary caller - do the actual work
    return yield* doGetOrCreateUserThread(guild, user).pipe(
      Effect.tap((thread) => Deferred.succeed(myDeferred, thread)),
      Effect.tapError((error) => Deferred.fail(myDeferred, error)),
      Effect.ensuring(
        Ref.update(inflightRef, (map) => {
          const newMap = new Map(map);
          newMap.delete(key);
          return newMap;
        }),
      ),
    );
  }).pipe(
    Effect.withSpan("getOrCreateUserThread", {
      attributes: { userId: user.id, guildId: guild.id },
    }),
  );
};

/**
 * Internal implementation of getOrCreateUserThread.
 * Called by the singleflight wrapper above.
 */
const doGetOrCreateUserThread = (guild: Guild, user: User) =>
  Effect.gen(function* () {
    // Check if we already have a thread for this user
    const existingThread = yield* getUserThread(user.id, guild.id);

    if (existingThread) {
      // Verify the thread still exists and is accessible
      const thread = yield* Effect.tryPromise({
        try: () => guild.channels.fetch(existingThread.thread_id),
        catch: (error) => error,
      }).pipe(
        Effect.map((channel) => (channel?.isThread() ? channel : null)),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* logEffect(
              "warn",
              "getOrCreateUserThread",
              "Existing thread not accessible, will create new one",
              { error: String(error) },
            );
            return null;
          }),
        ),
      );

      if (thread) {
        return thread;
      }
    }

    // Create new thread and store in database
    const { modLog: modLogId } = yield* Effect.tryPromise({
      try: () => fetchSettings(guild.id, [SETTINGS.modLog]),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchSettings", cause: error }),
    });

    const modLog = yield* Effect.tryPromise({
      try: () => guild.channels.fetch(modLogId),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchModLogChannel", cause: error }),
    });

    if (!modLog || modLog.type !== ChannelType.GuildText) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "getOrCreateUserThread",
          cause: new Error("Invalid mod log channel"),
        }),
      );
    }

    // Create freestanding private thread
    const thread = yield* makeUserThread(modLog, user);

    yield* Effect.tryPromise({
      try: () => escalationControls(user.id, thread),
      catch: (error) =>
        new DiscordApiError({ operation: "escalationControls", cause: error }),
    });

    // Store or update the thread reference
    yield* upsertUserThread(user.id, guild.id, thread.id);

    return thread;
  }).pipe(
    Effect.withSpan("doGetOrCreateUserThread", {
      attributes: { userId: user.id, guildId: guild.id },
    }),
  );
