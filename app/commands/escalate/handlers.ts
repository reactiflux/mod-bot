import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type MessageComponentInteraction,
} from "discord.js";
import { Effect, Layer } from "effect";

import { DatabaseLayer } from "#~/Database.ts";
import {
  editMessage,
  interactionDeferReply,
  interactionEditReply,
  interactionFollowUp,
  interactionReply,
  interactionUpdate,
} from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import {
  humanReadableResolutions,
  type Resolution,
} from "#~/helpers/modResponse";

import {
  banUser,
  deleteMessages,
  kickUser,
  restrictUser,
  timeoutUser,
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

const vote =
  (resolution: Resolution) => (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const {
        escalation,
        tally,
        modRoleId,
        features,
        votingStrategy,
        earlyResolution,
      } = yield* voteEffect(resolution)(interaction);

      // Check if early resolution triggered with clear winner
      if (earlyResolution && !tally.isTied && tally.leader) {
        yield* interactionUpdate(interaction, {
          content: buildConfirmedMessageContent(
            escalation,
            tally.leader,
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
        });
        return;
      }

      // Update the message with new vote state
      yield* interactionUpdate(interaction, {
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
      });
    }).pipe(
      Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionReply(interaction, {
          content: "Only moderators can vote on escalations.",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchTag("NotFoundError", () =>
        interactionReply(interaction, {
          content: "Escalation not found.",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchTag("AlreadyResolvedError", () =>
        interactionReply(interaction, {
          content: "This escalation has already been resolved.",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error voting", {
          error,
          resolution,
        })
          .pipe(() =>
            interactionReply(interaction, {
              content: "Something went wrong while recording your vote.",
              flags: [MessageFlags.Ephemeral],
            }),
          )
          .pipe(Effect.catchAll(() => Effect.void)),
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
    yield* interactionDeferReply(interaction);

    const result = yield* expediteEffect(interaction);

    const expediteNote = `\nResolved early by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:f>`;

    yield* editMessage(interaction.message, {
      content: `**${humanReadableResolutions[result.resolution]}** ✅ <@${result.escalation.reported_user_id}>${expediteNote}
${buildVotesListContent(result.tally)}`,
      components: [], // Remove buttons
    });
  }).pipe(
    Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
    Effect.catchTag("NotAuthorizedError", () =>
      interactionFollowUp(interaction, {
        content: "Only moderators can expedite resolutions.",
        flags: [MessageFlags.Ephemeral],
      }).pipe(Effect.catchAll(() => Effect.void)),
    ),
    Effect.catchTag("NotFoundError", () =>
      interactionFollowUp(interaction, {
        content: "Escalation not found.",
        flags: [MessageFlags.Ephemeral],
      }).pipe(Effect.catchAll(() => Effect.void)),
    ),
    Effect.catchTag("AlreadyResolvedError", () =>
      interactionFollowUp(interaction, {
        content: "This escalation has already been resolved.",
        flags: [MessageFlags.Ephemeral],
      }).pipe(Effect.catchAll(() => Effect.void)),
    ),
    Effect.catchTag("NoLeaderError", () =>
      interactionFollowUp(interaction, {
        content: "Cannot expedite: no clear leading resolution.",
        flags: [MessageFlags.Ephemeral],
      }).pipe(Effect.catchAll(() => Effect.void)),
    ),
    Effect.catchAll((error) =>
      logEffect("error", "EscalationHandlers", "Expedite failed", {
        error,
      }).pipe(() =>
        interactionFollowUp(interaction, {
          content: "Something went wrong while executing the resolution.",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
    ),
    Effect.withSpan("escalation-expedite", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

const escalate = (interaction: MessageComponentInteraction) =>
  Effect.gen(function* () {
    yield* interactionDeferReply(interaction, { flags: ["Ephemeral"] });

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
      yield* interactionEditReply(interaction, "Escalation started");
    } else {
      // Upgrade to majority voting
      yield* upgradeToMajorityEffect(interaction, escalationId);
      yield* interactionEditReply(
        interaction,
        "Escalation upgraded to majority voting",
      );
    }
  }).pipe(
    Effect.provide(Layer.mergeAll(DatabaseLayer, EscalationServiceLive)),
    Effect.catchTag("NotFoundError", () =>
      interactionEditReply(interaction, {
        content: "Failed to re-escalate, couldn't find escalation",
      }).pipe(Effect.catchAll(() => Effect.void)),
    ),
    Effect.catchAll((error) =>
      logEffect("error", "EscalationHandlers", "Error handling escalation", {
        error,
      }).pipe(() =>
        interactionEditReply(interaction, {
          content: "Failed to process escalation",
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
    ),
    Effect.withSpan("escalation-escalate", {
      attributes: { guildId: interaction.guildId, userId: interaction.user.id },
    }),
  );

export const EscalationHandlers = {
  // Direct action commands (no voting)
  delete: (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      yield* interactionDeferReply(interaction);

      const result = yield* deleteMessages(interaction);

      yield* interactionEditReply(
        interaction,
        `Messages deleted by ${result.deletedBy} (${result.deleted}/${result.total} successful)`,
      );
    }).pipe(
      Effect.provide(DatabaseLayer),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionEditReply(interaction, {
          content: "Insufficient permissions",
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error deleting messages", {
          error,
        }).pipe(() =>
          interactionEditReply(interaction, {
            content: "Failed to delete messages",
          }).pipe(Effect.catchAll(() => Effect.void)),
        ),
      ),
      Effect.withSpan("escalation-deleteMessages", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
  kick: (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const reportedUserId = interaction.customId.split("|")[1];
      const result = yield* kickUser(interaction);

      yield* interactionReply(
        interaction,
        `<@${reportedUserId}> kicked by ${result.actionBy}`,
      );
    }).pipe(
      Effect.provide(DatabaseLayer),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionReply(interaction, {
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error kicking user", {
          error,
        }).pipe(() =>
          interactionReply(interaction, {
            content: "Failed to kick user",
            flags: [MessageFlags.Ephemeral],
          }).pipe(Effect.catchAll(() => Effect.void)),
        ),
      ),
      Effect.withSpan("escalation-kickUser", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
  ban: (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const reportedUserId = interaction.customId.split("|")[1];

      const result = yield* banUser(interaction);

      yield* interactionReply(
        interaction,
        `<@${reportedUserId}> banned by ${result.actionBy}`,
      );
    }).pipe(
      Effect.provide(DatabaseLayer),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionReply(interaction, {
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error banning user", {
          error,
        }).pipe(() =>
          interactionReply(interaction, {
            content: "Failed to ban user",
            flags: [MessageFlags.Ephemeral],
          }).pipe(Effect.catchAll(() => Effect.void)),
        ),
      ),
      Effect.withSpan("escalation-banUser", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
  restrict: (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const reportedUserId = interaction.customId.split("|")[1];

      const result = yield* restrictUser(interaction);

      yield* interactionReply(
        interaction,
        `<@${reportedUserId}> restricted by ${result.actionBy}`,
      );
    }).pipe(
      Effect.provide(DatabaseLayer),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionReply(interaction, {
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error restricting user", {
          error,
        }).pipe(() =>
          interactionReply(interaction, {
            content: "Failed to restrict user",
            flags: [MessageFlags.Ephemeral],
          }).pipe(Effect.catchAll(() => Effect.void)),
        ),
      ),
      Effect.withSpan("escalation-restrictUser", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
  timeout: (interaction: MessageComponentInteraction) =>
    Effect.gen(function* () {
      const reportedUserId = interaction.customId.split("|")[1];

      const result = yield* timeoutUser(interaction);

      yield* interactionReply(
        interaction,
        `<@${reportedUserId}> timed out by ${result.actionBy}`,
      );
    }).pipe(
      Effect.provide(DatabaseLayer),
      Effect.catchTag("NotAuthorizedError", () =>
        interactionReply(interaction, {
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        }).pipe(Effect.catchAll(() => Effect.void)),
      ),
      Effect.catchAll((error) =>
        logEffect("error", "EscalationHandlers", "Error timing out user", {
          error,
        }).pipe(() =>
          interactionReply(interaction, {
            content: "Failed to timeout user",
            flags: [MessageFlags.Ephemeral],
          }).pipe(Effect.catchAll(() => Effect.void)),
        ),
      ),
      Effect.withSpan("escalation-timeoutUser", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),

  // Voting handlers
  expedite,
  vote,

  // Escalate button - creates a new vote or upgrades to majority
  escalate,
};
