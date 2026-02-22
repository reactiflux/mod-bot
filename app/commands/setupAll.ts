import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Guild,
  type OverwriteResolvable,
} from "discord.js";
import { Effect } from "effect";

import { DatabaseService } from "#~/Database.ts";
import {
  createChannel,
  fetchChannel,
  interactionDeferReply,
  interactionEditReply,
  sendMessage,
} from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import type { SlashCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { registerGuild, setSettings, SETTINGS } from "#~/models/guilds.server";

import { DEFAULT_MESSAGE_TEXT } from "./setupHoneypot";
import { DEFAULT_BUTTON_TEXT } from "./setupTickets";

/**
 * Try to fetch a channel by ID from the guild. Returns the channel if it exists,
 * null if the channel is missing or inaccessible.
 */
const verifyChannelExists = (
  guild: Guild,
  channelId: string | undefined | null,
) => {
  if (!channelId) return Effect.succeed(null);
  return fetchChannel(guild, channelId).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  );
};

/** Permission overwrites for the logs category: hidden from @everyone, visible to mods + bot. */
const logsCategoryOverwrites = (
  guild: Guild,
  modRoleId: string,
  botUserId: string,
): OverwriteResolvable[] => [
  { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
  { id: modRoleId, allow: [PermissionFlagsBits.ViewChannel] },
  { id: botUserId, allow: [PermissionFlagsBits.ViewChannel] },
];

export const Command = {
  command: new SlashCommandBuilder()
    .setName("setup-all")
    .setDescription(
      "One-click setup: creates all channels and configures all features",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((x) =>
      x
        .setName("moderator")
        .setDescription("The role that grants moderator permissions for a user")
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
      if (!interaction.guild || !interaction.guildId) {
        yield* Effect.fail(new Error("Interaction has no guild"));
        return;
      }

      yield* interactionDeferReply(interaction);

      yield* logEffect("info", "Commands", "Setup-all command executed", {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
      });

      const guild = interaction.guild;
      const guildId = interaction.guildId;
      const modRole = interaction.options.getRole("moderator", true);
      const restrictedRole = interaction.options.getRole("restricted");
      const botUserId = guild.client.user.id;

      // Register guild in DB (idempotent)
      yield* Effect.tryPromise(() => registerGuild(guildId));

      // Fetch existing settings to check what's already configured
      const db = yield* DatabaseService;
      const existingGuild = yield* db
        .selectFrom("guilds")
        .selectAll()
        .where("id", "=", guildId);
      const existingSettings = existingGuild[0]?.settings
        ? JSON.parse(existingGuild[0].settings)
        : {};

      const status: { name: string; value: string; inline: boolean }[] = [];

      // --- Mod-log channel ---
      const existingModLog = yield* verifyChannelExists(
        guild,
        existingSettings.modLog,
      );

      let modLogChannelId: string;
      let logsCategory: Awaited<
        ReturnType<typeof guild.channels.create>
      > | null = null;

      if (existingModLog) {
        modLogChannelId = existingModLog.id;
        status.push({
          name: "Mod Log",
          value: `<#${modLogChannelId}> (existing)`,
          inline: true,
        });
      } else {
        // Create logs category (private to mods + bot)
        logsCategory = yield* createChannel(guild, {
          name: "Euno Logs",
          type: ChannelType.GuildCategory,
          permissionOverwrites: logsCategoryOverwrites(
            guild,
            modRole.id,
            botUserId,
          ),
        });

        const modLogChannel = yield* createChannel(guild, {
          name: "mod-log",
          type: ChannelType.GuildText,
          parent: logsCategory.id,
        });
        modLogChannelId = modLogChannel.id;
        status.push({
          name: "Mod Log",
          value: `<#${modLogChannelId}> (created)`,
          inline: true,
        });
      }

      // --- Deletion-log channel ---
      const existingDeletionLog = yield* verifyChannelExists(
        guild,
        existingSettings.deletionLog,
      );

      let deletionLogChannelId: string;
      if (existingDeletionLog) {
        deletionLogChannelId = existingDeletionLog.id;
        status.push({
          name: "Deletion Log",
          value: `<#${deletionLogChannelId}> (existing)`,
          inline: true,
        });
      } else {
        // Create the logs category if we didn't already (mod-log existed but deletion-log didn't)
        logsCategory ??= yield* createChannel(guild, {
          name: "Euno Logs",
          type: ChannelType.GuildCategory,
          permissionOverwrites: logsCategoryOverwrites(
            guild,
            modRole.id,
            botUserId,
          ),
        });

        const deletionLogChannel = yield* createChannel(guild, {
          name: "deletion-log",
          type: ChannelType.GuildText,
          parent: logsCategory.id,
        });
        deletionLogChannelId = deletionLogChannel.id;
        status.push({
          name: "Deletion Log",
          value: `<#${deletionLogChannelId}> (created)`,
          inline: true,
        });
      }

      // --- Save guild settings ---
      yield* Effect.tryPromise(() =>
        setSettings(guildId, {
          [SETTINGS.modLog]: modLogChannelId,
          [SETTINGS.moderator]: modRole.id,
          [SETTINGS.restricted]: restrictedRole?.id,
          [SETTINGS.deletionLog]: deletionLogChannelId,
        }),
      );

      status.push({
        name: "Moderator Role",
        value: `<@&${modRole.id}>`,
        inline: true,
      });

      // --- Honeypot channel ---
      const honeypotRows = yield* db
        .selectFrom("honeypot_config")
        .selectAll()
        .where("guild_id", "=", guildId);

      let honeypotExists = false;
      for (const row of honeypotRows) {
        const ch = yield* verifyChannelExists(guild, row.channel_id);
        if (ch) {
          honeypotExists = true;
          status.push({
            name: "Honeypot",
            value: `<#${ch.id}> (existing)`,
            inline: true,
          });
          break;
        }
      }

      if (!honeypotExists) {
        const honeypotChannel = yield* createChannel(guild, {
          name: "honeypot",
          type: ChannelType.GuildText,
          position: 0,
        });

        yield* sendMessage(honeypotChannel, DEFAULT_MESSAGE_TEXT);

        yield* db
          .insertInto("honeypot_config")
          .values({
            guild_id: guildId,
            channel_id: honeypotChannel.id,
          })
          .onConflict((c) => c.doNothing());

        status.push({
          name: "Honeypot",
          value: `<#${honeypotChannel.id}> (created)`,
          inline: true,
        });
      }

      // --- Ticket channel ---
      // tickets_config lacks guild_id, so check each configured channel
      const ticketRows = yield* db.selectFrom("tickets_config").selectAll();

      let ticketExists = false;
      for (const row of ticketRows) {
        if (!row.channel_id) continue;
        const ch = yield* verifyChannelExists(guild, row.channel_id);
        if (ch) {
          ticketExists = true;
          status.push({
            name: "Tickets",
            value: `<#${ch.id}> (existing)`,
            inline: true,
          });
          break;
        }
      }

      if (!ticketExists) {
        const ticketChannel = yield* createChannel(guild, {
          name: "contact-mods",
          type: ChannelType.GuildText,
        });

        const ticketMessage = yield* sendMessage(ticketChannel, {
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: DEFAULT_BUTTON_TEXT,
                  style: ButtonStyle.Primary,
                  customId: "open-ticket",
                },
              ],
            },
          ],
        });

        yield* db.insertInto("tickets_config").values({
          message_id: ticketMessage.id,
          channel_id: ticketChannel.id,
          role_id: modRole.id,
        });

        status.push({
          name: "Tickets",
          value: `<#${ticketChannel.id}> (created)`,
          inline: true,
        });
      }

      yield* logEffect("info", "Commands", "Setup-all completed successfully", {
        guildId,
        userId: interaction.user.id,
        moderatorRoleId: modRole.id,
      });

      commandStats.setupCompleted(interaction, {
        moderator: modRole.id,
        modLog: modLogChannelId,
        restricted: restrictedRole?.id,
      });
      commandStats.commandExecuted(interaction, "setup-all", true);

      yield* interactionEditReply(interaction, {
        embeds: [
          {
            title: "Setup Complete",
            description:
              "All channels and features have been configured. Run `/check-requirements` to verify everything is working.",
            fields: status,
            color: 0x00cc00,
          },
        ],
      });
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const err = error instanceof Error ? error : new Error(String(error));

          yield* logEffect("error", "Commands", "Setup-all command failed", {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            error: err,
          });

          commandStats.commandFailed(interaction, "setup-all", err.message);

          yield* interactionEditReply(interaction, {
            content: `Setup failed partway through. Run \`/check-requirements\` to see what was configured.\n\`\`\`\n${err.toString()}\n\`\`\``,
          }).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("setupAllCommand", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
} satisfies SlashCommand;
