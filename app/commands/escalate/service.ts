import type { Guild } from "discord.js";
import { Context, Effect, Layer } from "effect";
import type { Selectable } from "kysely";

import { DatabaseLayer, DatabaseService, type SqlError } from "#~/Database";
import type { DB } from "#~/db";
import {
  AlreadyResolvedError,
  NotFoundError,
  ResolutionExecutionError,
} from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { calculateScheduledFor } from "#~/helpers/escalationVotes";
import type { Resolution, VotingStrategy } from "#~/helpers/modResponse";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";

export type Escalation = Selectable<DB["escalations"]>;
export type EscalationRecord = Selectable<DB["escalation_records"]>;

export interface CreateEscalationData {
  id: string;
  guildId: string;
  threadId: string;
  voteMessageId: string;
  reportedUserId: string;
  initiatorId: string;
  quorum: number;
  votingStrategy: VotingStrategy;
}

export interface RecordVoteData {
  escalationId: string;
  voterId: string;
  vote: Resolution;
}

export interface IEscalationService {
  /**
   * Create a new escalation record.
   */
  readonly createEscalation: (
    data: CreateEscalationData,
  ) => Effect.Effect<Escalation, SqlError>;

  /**
   * Get an escalation by ID.
   */
  readonly getEscalation: (
    id: string,
  ) => Effect.Effect<Escalation, NotFoundError | SqlError>;

  /**
   * Record a vote for an escalation.
   * Toggle behavior: voting the same resolution twice removes the vote.
   */
  readonly recordVote: (
    data: RecordVoteData,
  ) => Effect.Effect<{ isNew: boolean }, SqlError>;

  /**
   * Get all votes for an escalation.
   */
  readonly getVotesForEscalation: (
    escalationId: string,
  ) => Effect.Effect<EscalationRecord[], SqlError>;

  /**
   * Mark an escalation as resolved.
   */
  readonly resolveEscalation: (
    id: string,
    resolution: Resolution,
  ) => Effect.Effect<void, NotFoundError | AlreadyResolvedError | SqlError>;

  /**
   * Update the voting strategy for an escalation.
   */
  readonly updateEscalationStrategy: (
    id: string,
    strategy: VotingStrategy,
  ) => Effect.Effect<void, SqlError>;

  /**
   * Update the scheduled resolution time for an escalation.
   */
  readonly updateScheduledFor: (
    id: string,
    timestamp: string,
  ) => Effect.Effect<void, SqlError>;

  /**
   * Get all escalations that are due for auto-resolution.
   */
  readonly getDueEscalations: () => Effect.Effect<Escalation[], SqlError>;

  /**
   * Execute the resolution action for an escalation.
   */
  readonly executeResolution: (
    resolution: Resolution,
    escalation: Escalation,
    guild: Guild,
  ) => Effect.Effect<void, ResolutionExecutionError>;
}

export class EscalationService extends Context.Tag("EscalationService")<
  EscalationService,
  IEscalationService
>() {}

export const EscalationServiceLive = Layer.effect(
  EscalationService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    return {
      createEscalation: (data) =>
        Effect.gen(function* () {
          const createdAt = new Date().toISOString();
          const scheduledFor = calculateScheduledFor(createdAt, 0);

          const escalation = {
            id: data.id,
            guild_id: data.guildId,
            thread_id: data.threadId,
            vote_message_id: data.voteMessageId,
            reported_user_id: data.reportedUserId,
            initiator_id: data.initiatorId,
            flags: JSON.stringify({ quorum: data.quorum }),
            voting_strategy: data.votingStrategy,
            created_at: createdAt,
            scheduled_for: scheduledFor,
          };

          yield* db.insertInto("escalations").values(escalation);

          yield* logEffect("info", "EscalationService", "Created escalation", {
            escalationId: data.id,
            reportedUserId: data.reportedUserId,
            guildId: data.guildId,
          });

          // Fetch the created record to get all DB-generated fields
          const [created] = yield* db
            .selectFrom("escalations")
            .selectAll()
            .where("id", "=", data.id);

          return created;
        }).pipe(
          Effect.withSpan("createEscalation", {
            attributes: {
              escalationId: data.id,
              reportedUserId: data.reportedUserId,
            },
          }),
        ),

      getEscalation: (id) =>
        Effect.gen(function* () {
          const [escalation] = yield* db
            .selectFrom("escalations")
            .selectAll()
            .where("id", "=", id);

          if (!escalation) {
            return yield* Effect.fail(
              new NotFoundError({ id, resource: "escalation" }),
            );
          }

          return escalation;
        }).pipe(
          Effect.withSpan("getEscalation", {
            attributes: { escalationId: id },
          }),
        ),

      recordVote: (data) =>
        Effect.gen(function* () {
          // Check for existing vote to implement toggle behavior
          const existingVotes = yield* db
            .selectFrom("escalation_records")
            .selectAll()
            .where("escalation_id", "=", data.escalationId)
            .where("voter_id", "=", data.voterId);

          // If same vote exists, delete it (toggle off)
          if (existingVotes.some((v) => v.vote === data.vote)) {
            yield* db
              .deleteFrom("escalation_records")
              .where("escalation_id", "=", data.escalationId)
              .where("voter_id", "=", data.voterId)
              .where("vote", "=", data.vote);

            yield* logEffect(
              "info",
              "EscalationService",
              "Deleted existing vote",
              {
                escalationId: data.escalationId,
                voterId: data.voterId,
                vote: data.vote,
              },
            );

            return { isNew: false };
          }

          // Otherwise, insert new vote
          yield* db.insertInto("escalation_records").values({
            id: crypto.randomUUID(),
            escalation_id: data.escalationId,
            voter_id: data.voterId,
            vote: data.vote,
          });

          yield* logEffect("info", "EscalationService", "Recorded new vote", {
            escalationId: data.escalationId,
            voterId: data.voterId,
            vote: data.vote,
          });

          return { isNew: true };
        }).pipe(
          Effect.withSpan("recordVote", {
            attributes: {
              escalationId: data.escalationId,
              voterId: data.voterId,
            },
          }),
        ),

      getVotesForEscalation: (escalationId) =>
        Effect.gen(function* () {
          const votes = yield* db
            .selectFrom("escalation_records")
            .selectAll()
            .where("escalation_id", "=", escalationId);

          return votes;
        }).pipe(
          Effect.withSpan("getVotesForEscalation", {
            attributes: { escalationId },
          }),
        ),

      resolveEscalation: (id, resolution) =>
        Effect.gen(function* () {
          // First check if escalation exists and is not already resolved
          const [escalation] = yield* db
            .selectFrom("escalations")
            .selectAll()
            .where("id", "=", id);

          if (!escalation) {
            return yield* Effect.fail(
              new NotFoundError({ id, resource: "escalation" }),
            );
          }

          if (escalation.resolved_at) {
            return yield* Effect.fail(
              new AlreadyResolvedError({
                escalationId: id,
                resolvedAt: escalation.resolved_at,
              }),
            );
          }

          yield* db
            .updateTable("escalations")
            .set({
              resolved_at: new Date().toISOString(),
              resolution,
            })
            .where("id", "=", id);

          yield* logEffect("info", "EscalationService", "Resolved escalation", {
            escalationId: id,
            resolution,
          });
        }).pipe(
          Effect.withSpan("resolveEscalation", {
            attributes: { escalationId: id, resolution },
          }),
        ),

      updateEscalationStrategy: (id, strategy) =>
        Effect.gen(function* () {
          yield* db
            .updateTable("escalations")
            .set({ voting_strategy: strategy })
            .where("id", "=", id);

          yield* logEffect(
            "info",
            "EscalationService",
            "Updated voting strategy",
            {
              escalationId: id,
              strategy,
            },
          );
        }).pipe(
          Effect.withSpan("updateEscalationStrategy", {
            attributes: { escalationId: id, strategy },
          }),
        ),

      updateScheduledFor: (id, timestamp) =>
        Effect.gen(function* () {
          yield* db
            .updateTable("escalations")
            .set({ scheduled_for: timestamp })
            .where("id", "=", id);

          yield* logEffect(
            "debug",
            "EscalationService",
            "Updated scheduled_for",
            {
              escalationId: id,
              scheduledFor: timestamp,
            },
          );
        }).pipe(
          Effect.withSpan("updateScheduledFor", {
            attributes: { escalationId: id },
          }),
        ),

      getDueEscalations: () =>
        Effect.gen(function* () {
          const escalations = yield* db
            .selectFrom("escalations")
            .selectAll()
            .where("resolved_at", "is", null)
            .where("scheduled_for", "<=", new Date().toISOString());

          yield* logEffect(
            "debug",
            "EscalationService",
            "Found due escalations",
            {
              count: escalations.length,
            },
          );

          return escalations;
        }).pipe(Effect.withSpan("getDueEscalations")),

      executeResolution: (resolution, escalation, guild) =>
        Effect.gen(function* () {
          yield* logEffect(
            "info",
            "EscalationService",
            "Executing resolution",
            {
              resolution,
              escalationId: escalation.id,
              reportedUserId: escalation.reported_user_id,
            },
          );

          // Try to fetch the member - they may have left
          const reportedMember = yield* Effect.tryPromise({
            try: () => guild.members.fetch(escalation.reported_user_id),
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)));

          if (!reportedMember) {
            yield* logEffect(
              "debug",
              "EscalationService",
              "Member not found, skipping action",
              {
                escalationId: escalation.id,
                reportedUserId: escalation.reported_user_id,
              },
            );
            return;
          }

          yield* Effect.tryPromise({
            try: async () => {
              switch (resolution) {
                case "track":
                  // No action needed
                  break;
                case "timeout":
                  await timeout(reportedMember, "voted resolution");
                  break;
                case "restrict":
                  await applyRestriction(reportedMember);
                  break;
                case "kick":
                  await kick(reportedMember, "voted resolution");
                  break;
                case "ban":
                  await ban(reportedMember, "voted resolution");
                  break;
              }
            },
            catch: (error) =>
              new ResolutionExecutionError({
                escalationId: escalation.id,
                resolution,
                cause: error,
              }),
          });

          yield* logEffect("info", "EscalationService", "Resolution executed", {
            resolution,
            escalationId: escalation.id,
            reportedUserId: escalation.reported_user_id,
          });
        }).pipe(
          Effect.withSpan("executeResolution", {
            attributes: {
              escalationId: escalation.id,
              resolution,
              reportedUserId: escalation.reported_user_id,
            },
          }),
        ),
    };
  }),
).pipe(Layer.provide(DatabaseLayer));
