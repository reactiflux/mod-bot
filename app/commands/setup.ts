import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Effect } from "effect";

import { interactionReply } from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import type { SlashCommand } from "#~/helpers/discord";
import { webBaseUrl } from "#~/helpers/env.server";
import { commandStats } from "#~/helpers/metrics";

export const Command = {
  command: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up Euno for your server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  handler: (interaction) =>
    Effect.gen(function* () {
      if (!interaction.guild || !interaction.guildId) {
        yield* Effect.fail(new Error("Interaction has no guild"));
        return;
      }

      yield* logEffect("info", "Commands", "Setup command executed", {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
      });

      const guildId = interaction.guildId;

      const buttons: {
        type: ComponentType.Button;
        label: string;
        style: ButtonStyle;
        custom_id?: string;
        url?: string;
      }[] = [];

      if (webBaseUrl) {
        buttons.push({
          type: ComponentType.Button,
          label: "Web Setup Wizard",
          style: ButtonStyle.Link,
          url: `${webBaseUrl}/app/${guildId}/onboard`,
        });
      }

      buttons.push({
        type: ComponentType.Button,
        label: "Set up in Discord",
        style: ButtonStyle.Primary,
        custom_id: `setup-discord|${guildId}`,
      });

      yield* interactionReply(interaction, {
        embeds: [
          {
            title: "Set up Euno",
            description:
              "Choose how you'd like to configure Euno. The in-Discord flow will auto-create all necessary channels.",
            color: 0x5865f2,
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: buttons,
          },
        ],
        flags: [MessageFlags.Ephemeral],
      });

      commandStats.commandExecuted(interaction, "setup", true);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const err = error instanceof Error ? error : new Error(String(error));

          yield* logEffect("error", "Commands", "Setup command failed", {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            error: err,
          });

          commandStats.commandFailed(interaction, "setup", err.message);

          yield* interactionReply(
            interaction,
            `Something broke:
\`\`\`
${err.toString()}
\`\`\`
`,
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
} satisfies SlashCommand;
