import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Effect } from "effect";

import { logEffect } from "#~/effects/observability.ts";
import type { EffectSlashCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { registerGuild, setSettings, SETTINGS } from "#~/models/guilds.server";

export const Command = {
  type: "effect",
  command: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up necessities for using the bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((x) =>
      x
        .setName("moderator")
        .setDescription("The role that grants moderator permissions for a user")
        .setRequired(true),
    )
    .addChannelOption((x) =>
      x
        .setName("mod-log-channel")
        .setDescription("The channel where moderation reports will be sent")
        .setRequired(true),
    )
    .addRoleOption((x) =>
      x
        .setName("restricted")
        .setDescription(
          "The role that prevents a member from accessing some channels",
        ),
    ) as SlashCommandBuilder,

  handler: (interaction) =>
    Effect.gen(function* () {
      yield* logEffect("info", "Commands", "Setup command executed", {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
      });

      if (!interaction.guild) {
        yield* Effect.fail(new Error("Interaction has no guild"));
        return;
      }

      yield* Effect.tryPromise(() => registerGuild(interaction.guildId!));

      const role = interaction.options.getRole("moderator");
      const channel = interaction.options.getChannel("mod-log-channel");
      const restricted = interaction.options.getRole("restricted");

      if (!role) {
        yield* Effect.fail(new Error("Interaction has no role"));
        return;
      }
      if (!channel) {
        yield* Effect.fail(new Error("Interaction has no channel"));
        return;
      }

      const settings = {
        [SETTINGS.modLog]: channel.id,
        [SETTINGS.moderator]: role.id,
        [SETTINGS.restricted]: restricted?.id,
      };

      yield* Effect.tryPromise(() =>
        setSettings(interaction.guildId!, settings),
      );

      yield* logEffect("info", "Commands", "Setup completed successfully", {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        moderatorRoleId: role.id,
        modLogChannelId: channel.id,
        restrictedRoleId: restricted?.id,
        hasRestrictedRole: !!restricted,
      });

      commandStats.setupCompleted(interaction, {
        moderator: role.id,
        modLog: channel.id,
        restricted: restricted?.id,
      });

      commandStats.commandExecuted(interaction, "setup", true);

      yield* Effect.tryPromise(() => interaction.reply("Setup completed!"));
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const err = error instanceof Error ? error : new Error(String(error));

          yield* logEffect("error", "Commands", "Setup command failed", {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            error: err.message,
            stack: err.stack,
          });

          commandStats.commandFailed(interaction, "setup", err.message);

          yield* Effect.tryPromise(() =>
            interaction.reply(`Something broke:
\`\`\`
${err.toString()}
\`\`\`
`),
          ).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("setupCommand", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
} satisfies EffectSlashCommand;
