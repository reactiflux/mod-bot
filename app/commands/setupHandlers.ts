import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionType,
  PermissionFlagsBits,
  type Guild,
  type OverwriteResolvable,
} from "discord.js";
import { Effect } from "effect";

import { DatabaseService } from "#~/Database.ts";
import {
  createChannel,
  fetchChannel,
  interactionDeferUpdate,
  interactionEditReply,
  interactionUpdate,
  sendMessage,
} from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import type { MessageComponentCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { registerGuild, setSettings, SETTINGS } from "#~/models/guilds.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

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

const button = (name: string) => ({
  type: InteractionType.MessageComponent as const,
  name,
});

export const SetupComponentCommands: MessageComponentCommand[] = [
  {
    command: button("setup-discord"),
    handler: (interaction) =>
      Effect.gen(function* () {
        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
        }

        yield* interactionUpdate(interaction, {
          embeds: [
            {
              title: "Select Moderator Role",
              description:
                "Choose the role that grants moderator permissions. Euno will use this role to control access to log channels and other mod-only features.",
              color: 0x5865f2,
            },
          ],
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.RoleSelect,
                  customId: `setup-role|${guildId}`,
                  placeholder: "Select a moderator role…",
                },
              ],
            },
          ],
        });
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));
            yield* logEffect(
              "error",
              "Commands",
              "setup-discord handler failed",
              { error: err },
            );
          }),
        ),
        Effect.withSpan("setupDiscordHandler"),
      ),
  },

  {
    command: button("setup-role"),
    handler: (interaction) =>
      Effect.gen(function* () {
        if (!interaction.guild || !interaction.isRoleSelectMenu()) {
          yield* Effect.fail(new Error("Invalid interaction"));
          return;
        }

        yield* interactionDeferUpdate(interaction);

        const guildId = interaction.customId.split("|")[1];
        if (!guildId) {
          yield* Effect.fail(new Error("Missing guildId in customId"));
          return;
        }

        const modRoleId = interaction.values[0];
        if (!modRoleId) {
          yield* Effect.fail(new Error("No role selected"));
          return;
        }

        const guild = interaction.guild;
        const botUserId = guild.client.user.id;

        yield* logEffect("info", "Commands", "Setup-role handler started", {
          guildId,
          userId: interaction.user.id,
          modRoleId,
        });

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
              modRoleId,
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
              modRoleId,
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
            [SETTINGS.moderator]: modRoleId,
            [SETTINGS.deletionLog]: deletionLogChannelId,
          }),
        );

        status.push({
          name: "Moderator Role",
          value: `<@&${modRoleId}>`,
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
            role_id: modRoleId,
          });

          status.push({
            name: "Tickets",
            value: `<#${ticketChannel.id}> (created)`,
            inline: true,
          });
        }

        // --- Initialize free subscription ---
        yield* Effect.tryPromise(() =>
          SubscriptionService.initializeFreeSubscription(guildId),
        );

        yield* logEffect(
          "info",
          "Commands",
          "Setup completed successfully via Discord",
          {
            guildId,
            userId: interaction.user.id,
            moderatorRoleId: modRoleId,
          },
        );

        commandStats.setupCompleted(interaction, {
          moderator: modRoleId,
          modLog: modLogChannelId,
        });

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
          components: [],
        });
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const err =
              error instanceof Error ? error : new Error(String(error));

            yield* logEffect("error", "Commands", "Setup-role handler failed", {
              guildId: interaction.guildId,
              userId: interaction.user.id,
              error: err,
            });

            yield* interactionEditReply(interaction, {
              content: `Setup failed partway through. Run \`/check-requirements\` to see what was configured.\n\`\`\`\n${err.toString()}\n\`\`\``,
              embeds: [],
              components: [],
            }).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("setupRoleHandler", {
          attributes: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
        }),
      ),
  },
];
