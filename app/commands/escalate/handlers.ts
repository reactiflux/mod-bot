import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type MessageComponentInteraction,
} from "discord.js";
import { Effect, Layer } from "effect";

import { DatabaseLayer } from "#~/Database.ts";
import { logEffect } from "#~/effects/observability.ts";
import {
  humanReadableResolutions,
  type Resolution,
} from "#~/helpers/modResponse";

import {
  banUserEffect,
  deleteMessagesEffect,
  kickUserEffect,
  restrictUserEffect,
  timeoutUserEffect,
} from "./directActions";
import { createEscalationEffect, upgradeToMajorityEffect } from "./escalate";
import { expediteEffect } from "./expedite";
import { EscalationServiceLive } from "./service";
import {
  buildConfirmedMessageContent,
  buildVoteButtons,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./strings";
import { voteEffect } from "./vote";

const deleteMessages = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => interaction.deferReply());

    const result = yield* deleteMessagesEffect(interaction);

    yield* Effect.tryPromise(() =>
      interaction.editReply(
        `Messages deleted by ${result.deletedBy} (${result.deleted}/${result.total} successful)`,
      ),
    );
  }).pipe(
    Effect.provide(DatabaseLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect(
          "error",
          "EscalationHandlers",
          "Error deleting messages",
          {
            error:
              error instanceof Error ? error.message : JSON.stringify(error),
          },
        );
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.editReply({ content: "Insufficient permissions" }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.editReply({ content: "Failed to delete messages" }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-deleteMessages", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const kickUser = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    const reportedUserId = interaction.customId.split("|")[1];

    const result = yield* kickUserEffect(interaction);

    yield* Effect.tryPromise(() =>
      interaction.reply(`<@${reportedUserId}> kicked by ${result.actionBy}`),
    );
  }).pipe(
    Effect.provide(DatabaseLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect("error", "EscalationHandlers", "Error kicking user", {
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: "Insufficient permissions",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Failed to kick user",
            flags: [MessageFlags.Ephemeral],
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-kickUser", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const banUser = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    const reportedUserId = interaction.customId.split("|")[1];

    const result = yield* banUserEffect(interaction);

    yield* Effect.tryPromise(() =>
      interaction.reply(`<@${reportedUserId}> banned by ${result.actionBy}`),
    );
  }).pipe(
    Effect.provide(DatabaseLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect("error", "EscalationHandlers", "Error banning user", {
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: "Insufficient permissions",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Failed to ban user",
            flags: [MessageFlags.Ephemeral],
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-banUser", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const restrictUser = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    const reportedUserId = interaction.customId.split("|")[1];

    const result = yield* restrictUserEffect(interaction);

    yield* Effect.tryPromise(() =>
      interaction.reply(
        `<@${reportedUserId}> restricted by ${result.actionBy}`,
      ),
    );
  }).pipe(
    Effect.provide(DatabaseLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect(
          "error",
          "EscalationHandlers",
          "Error restricting user",
          {
            error:
              error instanceof Error ? error.message : JSON.stringify(error),
          },
        );
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: "Insufficient permissions",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Failed to restrict user",
            flags: [MessageFlags.Ephemeral],
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-restrictUser", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const timeoutUser = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    const reportedUserId = interaction.customId.split("|")[1];

    const result = yield* timeoutUserEffect(interaction);

    yield* Effect.tryPromise(() =>
      interaction.reply(`<@${reportedUserId}> timed out by ${result.actionBy}`),
    );
  }).pipe(
    Effect.provide(DatabaseLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect(
          "error",
          "EscalationHandlers",
          "Error timing out user",
          {
            error:
              error instanceof Error ? error.message : JSON.stringify(error),
          },
        );
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: "Insufficient permissions",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Failed to timeout user",
            flags: [MessageFlags.Ephemeral],
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-timeoutUser", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const vote =
  (resolution: Resolution) => (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const result = yield* voteEffect(resolution)(interaction);

      const {
        escalation,
        tally,
        modRoleId,
        features,
        votingStrategy,
        earlyResolution,
      } = result;

      // Check if early resolution triggered with clear winner - show confirmed state
      if (earlyResolution && !tally.isTied && tally.leader) {
        yield* Effect.tryPromise(() =>
          interaction.update({
            content: buildConfirmedMessageContent(
              escalation,
              tally.leader!,
              tally,
            ),
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`expedite|${escalation.id}`)
                  .setLabel("Expedite")
                  .setStyle(ButtonStyle.Primary),
              ),
            ],
          }),
        );
        return;
      }

      // Update the message with new vote state
      yield* Effect.tryPromise(() =>
        interaction.update({
          content: buildVoteMessageContent(
            modRoleId ?? "",
            votingStrategy,
            escalation,
            tally,
          ),
          components: buildVoteButtons(
            features,
            votingStrategy,
            escalation,
            tally,
            earlyResolution,
          ),
        }),
      );
    }).pipe(
      Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const errorObj = error as { _tag?: string };
          yield* logEffect("error", "EscalationHandlers", "Error voting", {
            error:
              error instanceof Error ? error.message : JSON.stringify(error),
            resolution,
          });
          if (errorObj._tag === "NotAuthorizedError") {
            yield* Effect.tryPromise(() =>
              interaction.reply({
                content: "Only moderators can vote on escalations.",
                flags: [MessageFlags.Ephemeral],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
            return;
          }
          if (errorObj._tag === "NotFoundError") {
            yield* Effect.tryPromise(() =>
              interaction.reply({
                content: "Escalation not found.",
                flags: [MessageFlags.Ephemeral],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
            return;
          }
          if (errorObj._tag === "AlreadyResolvedError") {
            yield* Effect.tryPromise(() =>
              interaction.reply({
                content: "This escalation has already been resolved.",
                flags: [MessageFlags.Ephemeral],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
            return;
          }

          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: "Something went wrong while recording your vote.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("escalation-vote", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          resolution,
        },
      }),
    );

const expedite = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => interaction.deferUpdate());

    const result = yield* expediteEffect(interaction);

    const expediteNote = `\nResolved early by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:f>`;

    yield* Effect.tryPromise(() =>
      interaction.message.edit({
        content: `**${humanReadableResolutions[result.resolution]}** ✅ <@${result.escalation.reported_user_id}>${expediteNote}
${buildVotesListContent(result.tally)}`,
        components: [], // Remove buttons
      }),
    );
  }).pipe(
    Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect("error", "EscalationHandlers", "Expedite failed", {
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
        if (errorObj._tag === "NotAuthorizedError") {
          yield* Effect.tryPromise(() =>
            interaction.followUp({
              content: "Only moderators can expedite resolutions.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }
        if (errorObj._tag === "NotFoundError") {
          yield* Effect.tryPromise(() =>
            interaction.followUp({
              content: "Escalation not found.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }
        if (errorObj._tag === "AlreadyResolvedError") {
          yield* Effect.tryPromise(() =>
            interaction.followUp({
              content: "This escalation has already been resolved.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }
        if (errorObj._tag === "NoLeaderError") {
          yield* Effect.tryPromise(() =>
            interaction.followUp({
              content: "Cannot expedite: no clear leading resolution.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.followUp({
            content: "Something went wrong while executing the resolution.",
            flags: [MessageFlags.Ephemeral],
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-expedite", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const escalate = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() =>
      interaction.deferReply({ flags: ["Ephemeral"] }),
    );

    const [_, reportedUserId, level = "0", previousEscalationId = ""] =
      interaction.customId.split("|");

    const escalationId = previousEscalationId || crypto.randomUUID();
    yield* logEffect("info", "EscalationHandlers", "Handling escalation", {
      reportedUserId,
      escalationId,
      level,
    });

    if (Number(level) === 0) {
      // Create new escalation
      yield* createEscalationEffect(interaction, reportedUserId, escalationId);
      yield* Effect.tryPromise(() =>
        interaction.editReply("Escalation started"),
      );
    } else {
      // Upgrade to majority voting
      yield* upgradeToMajorityEffect(interaction, escalationId);
      yield* Effect.tryPromise(() =>
        interaction.editReply("Escalation upgraded to majority voting"),
      );
    }
  }).pipe(
    Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const errorObj = error as { _tag?: string };
        yield* logEffect(
          "error",
          "EscalationHandlers",
          "Error handling escalation",
          {
            error:
              error instanceof Error ? error.message : JSON.stringify(error),
          },
        );
        if (errorObj._tag === "NotFoundError") {
          yield* Effect.tryPromise(() =>
            interaction.editReply({
              content: "Failed to re-escalate, couldn't find escalation",
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* Effect.tryPromise(() =>
          interaction.editReply({ content: "Failed to process escalation" }),
        ).pipe(Effect.catchAll(() => Effect.void));
      }),
    ),
    Effect.withSpan("escalation-escalate", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

export const EscalationHandlers = {
  // Direct action commands (no voting)
  delete: deleteMessages,
  kick: kickUser,
  ban: banUser,
  restrict: restrictUser,
  timeout: timeoutUser,

  // Voting handlers
  expedite,
  vote,

  // Escalate button - creates a new vote or upgrades to majority
  escalate,
};
