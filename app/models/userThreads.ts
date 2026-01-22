import {
  ChannelType,
  type Guild,
  type TextChannel,
  type User,
} from "discord.js";
import { Effect } from "effect";
import type { Selectable } from "kysely";

import { DatabaseService } from "#~/Database";
import type { DB } from "#~/db";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { escalationControls } from "#~/helpers/escalate";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

// Use Selectable to get the type that Kysely returns from queries
export type UserThread = Selectable<DB["user_threads"]>;

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
 * Create a new user thread record.
 */
export const createUserThread = (
  userId: string,
  guildId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    yield* db.insertInto("user_threads").values({
      user_id: userId,
      guild_id: guildId,
      thread_id: threadId,
    });

    yield* logEffect("debug", "UserThread", "Created user thread", {
      userId,
      guildId,
      threadId,
    });
  }).pipe(
    Effect.withSpan("createUserThread", {
      attributes: { userId, guildId, threadId },
    }),
  );

/**
 * Update an existing user thread record.
 */
export const updateUserThread = (
  userId: string,
  guildId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    yield* db
      .updateTable("user_threads")
      .set({ thread_id: threadId })
      .where("user_id", "=", userId)
      .where("guild_id", "=", guildId);

    yield* logEffect("debug", "UserThread", "Updated user thread", {
      userId,
      guildId,
      threadId,
    });
  }).pipe(
    Effect.withSpan("updateUserThread", {
      attributes: { userId, guildId, threadId },
    }),
  );

const makeUserThread = (channel: TextChannel, user: User) =>
  Effect.tryPromise({
    try: () => channel.threads.create({ name: `${user.username} logs` }),
    catch: (error) =>
      new DiscordApiError({ operation: "createThread", discordError: error }),
  });

export const getOrCreateUserThread = (guild: Guild, user: User) =>
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
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    const modLog = yield* Effect.tryPromise({
      try: () => guild.channels.fetch(modLogId),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchModLogChannel",
          discordError: error,
        }),
    });

    if (!modLog || modLog.type !== ChannelType.GuildText) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "getOrCreateUserThread",
          discordError: new Error("Invalid mod log channel"),
        }),
      );
    }

    // Create freestanding private thread
    const thread = yield* makeUserThread(modLog, user);

    yield* Effect.tryPromise({
      try: () => escalationControls(user.id, thread),
      catch: (error) =>
        new DiscordApiError({
          operation: "escalationControls",
          discordError: error,
        }),
    });

    // Store or update the thread reference
    if (existingThread) {
      yield* updateUserThread(user.id, guild.id, thread.id);
    } else {
      yield* createUserThread(user.id, guild.id, thread.id);
    }

    return thread;
  }).pipe(
    Effect.withSpan("getOrCreateUserThread", {
      attributes: { userId: user.id, guildId: guild.id },
    }),
  );
