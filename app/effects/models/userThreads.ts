import { Effect } from "effect";
import type { Selectable } from "kysely";

import db, { type DB } from "#~/db.server.js";

import { logEffect } from "../observability.js";
import { runEffect } from "../runtime.js";
// Legacy wrappers for backward compatibility
// These allow existing code to use the Effect-based functions without changes.
import { DatabaseService, DatabaseServiceLive } from "../services/Database.js";

// Use Selectable to get the type that Kysely returns from queries
export type UserThread = Selectable<DB["user_threads"]>;

/**
 * Get a user's thread for a specific guild.
 * Returns undefined if no thread exists.
 */
export const getUserThread = (userId: string, guildId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    const thread = yield* dbService.query(
      () =>
        db
          .selectFrom("user_threads")
          .selectAll()
          .where("user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .executeTakeFirst(),
      "getUserThread",
    );

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
    const dbService = yield* DatabaseService;

    yield* dbService.query(
      () =>
        db
          .insertInto("user_threads")
          .values({
            user_id: userId,
            guild_id: guildId,
            thread_id: threadId,
          })
          .execute(),
      "createUserThread",
    );

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
    const dbService = yield* DatabaseService;

    yield* dbService.query(
      () =>
        db
          .updateTable("user_threads")
          .set({ thread_id: threadId })
          .where("user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .execute(),
      "updateUserThread",
    );

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

/**
 * Provide the database service layer to an effect and run it.
 */
const runWithDb = <A, E>(effect: Effect.Effect<A, E, DatabaseService>) =>
  runEffect(Effect.provide(effect, DatabaseServiceLive));

/**
 * Legacy wrapper for getUserThread.
 * @deprecated Use the Effect-based version directly when possible.
 */
export const getUserThreadLegacy = (
  userId: string,
  guildId: string,
): Promise<UserThread | undefined> => runWithDb(getUserThread(userId, guildId));

/**
 * Legacy wrapper for createUserThread.
 * @deprecated Use the Effect-based version directly when possible.
 */
export const createUserThreadLegacy = (
  userId: string,
  guildId: string,
  threadId: string,
): Promise<void> => runWithDb(createUserThread(userId, guildId, threadId));

/**
 * Legacy wrapper for updateUserThread.
 * @deprecated Use the Effect-based version directly when possible.
 */
export const updateUserThreadLegacy = (
  userId: string,
  guildId: string,
  threadId: string,
): Promise<void> => runWithDb(updateUserThread(userId, guildId, threadId));
