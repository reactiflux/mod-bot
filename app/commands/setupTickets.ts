import { format } from "date-fns";
import { Routes, TextInputStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import db from "#~/db.server.js";
import { ssrDiscordSdk as rest } from "#~/discord/api";
import {
  quoteMessageContent,
  type AnyCommand,
  type MessageComponentCommand,
  type ModalCommand,
  type SlashCommand,
} from "#~/helpers/discord";
import { featureStats } from "#~/helpers/metrics";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

const DEFAULT_BUTTON_TEXT = "Open a private ticket with the moderators";

export const Command = [
  {
    command: new SlashCommandBuilder()
      .setName("tickets-channel")
      .addRoleOption((o) => {
        o.setName("role");
        o.setDescription(
          "Which role (if any) should be pinged when a ticket is created?",
        );
        o.setRequired(false);
        return o;
      })
      .addStringOption((o) => {
        o.setName("button-text");
        o.setDescription(
          `What should the button say? If left blank, it will say "${DEFAULT_BUTTON_TEXT}"`,
        );
        return o;
      })
      .addChannelOption((o) => {
        o.setName("channel");
        o.setDescription(
          "Which channel (if not this one) should tickets be created in?",
        );
        return o;
      })
      .setDescription(
        "Set up a new button for creating private tickets with moderators",
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator,
      ) as SlashCommandBuilder,

    handler: async (interaction: ChatInputCommandInteraction) => {
      if (!interaction.guild) throw new Error("Interaction has no guild");

      const pingableRole = interaction.options.getRole("role");
      const ticketChannel = interaction.options.getChannel("channel");
      const buttonText =
        interaction.options.getString("button-text") ?? DEFAULT_BUTTON_TEXT;

      if (ticketChannel && ticketChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: `The channel configured must be a text channel! Tickets will be created as private threads.`,
        });
        return;
      }

      try {
        const interactionResponse = await interaction.reply({
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: buttonText,
                  style: ButtonStyle.Primary,
                  customId: "open-ticket",
                },
              ],
            },
          ],
        });
        const producedMessage = await interactionResponse.fetch();

        let roleId = pingableRole?.id;
        if (!roleId) {
          const { [SETTINGS.moderator]: mod } = await fetchSettings(
            interaction.guild.id,
            [SETTINGS.moderator, SETTINGS.modLog],
          );
          roleId = mod;
        }

        await db
          .insertInto("tickets_config")
          .values({
            message_id: producedMessage.id,
            channel_id: ticketChannel?.id,
            role_id: roleId,
          })
          .execute();

        featureStats.ticketChannelSetup(
          interaction.guild.id,
          interaction.user.id,
          ticketChannel?.id ?? interaction.channelId,
        );
      } catch (e) {
        console.error(`error:`, e);
      }
    },
  } as SlashCommand,
  {
    command: { type: InteractionType.MessageComponent, name: "open-ticket" },
    handler: async (interaction) => {
      const modal = new ModalBuilder()
        .setCustomId("modal-open-ticket")
        .setTitle("What do you need from the moderators?");
      const actionRow = new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setLabel("Concern")
          .setCustomId("concern")
          .setMinLength(30)
          .setMaxLength(500)
          .setRequired(true)
          .setStyle(TextInputStyle.Paragraph),
      );
      // @ts-expect-error busted types
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    },
  } as MessageComponentCommand,
  {
    command: { type: InteractionType.ModalSubmit, name: "modal-open-ticket" },
    handler: async (interaction) => {
      if (
        !interaction.channel ||
        interaction.channel.type !== ChannelType.GuildText ||
        !interaction.guild ||
        !interaction.message
      ) {
        await interaction.reply({
          content: "Something went wrong while creating a ticket",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const { channel, fields, user } = interaction;
      const concern = fields.getTextInputValue("concern");

      let config = await db
        .selectFrom("tickets_config")
        .selectAll()
        .where("message_id", "=", interaction.message.id)
        .executeTakeFirst();
      // If there's no config, that means that the button was set up before the db was set up. Add one with default values
      if (!config) {
        const { [SETTINGS.moderator]: mod } = await fetchSettings(
          interaction.guild.id,
          [SETTINGS.moderator, SETTINGS.modLog],
        );
        config = await db
          .insertInto("tickets_config")
          .returningAll()
          .values({ message_id: interaction.message.id, role_id: mod })
          .executeTakeFirst();
        if (!config) {
          throw new Error("Something went wrong while fixing tickets config");
        }
      }

      // If channel_id is configured but fetch returns null (channel deleted),
      // this will error, which is intended - the configured channel is invalid
      const ticketsChannel = config.channel_id
        ? await interaction.guild.channels.fetch(config.channel_id)
        : channel;

      if (
        !ticketsChannel?.isTextBased() ||
        ticketsChannel.type !== ChannelType.GuildText
      ) {
        void interaction.reply(
          "Couldn’t make a ticket! Tell the admins that their ticket channel is misconfigured.",
        );
        return;
      }

      const thread = await ticketsChannel.threads.create({
        name: `${user.username} – ${format(new Date(), "PP kk:mmX")}`,
        autoArchiveDuration: 60 * 24 * 7,
        type: ChannelType.PrivateThread,
        invitable: false,
      });
      await thread.send({
        content: `<@${user.id}>, this is a private space only visible to you and the <@&${config.role_id}> role.`,
      });
      await thread.send(`${user.displayName} said:
${quoteMessageContent(concern)}`);
      await thread.send({
        content: "When you've finished, please close the ticket.",
        components: [
          // @ts-expect-error Types for this are super busted
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`close-ticket||${user.id}|| `)
              .setLabel("Close ticket")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`close-ticket||${user.id}||👍`)
              .setLabel("Close (👍)")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`close-ticket||${user.id}||👎`)
              .setLabel("Close (👎)")
              .setStyle(ButtonStyle.Danger),
          ),
        ],
      });

      featureStats.ticketCreated(interaction.guild.id, user.id, thread.id);

      void interaction.reply({
        content: `A private thread with the moderation team has been opened for you: <#${thread.id}>`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    },
  } as ModalCommand,
  {
    command: { type: InteractionType.MessageComponent, name: "close-ticket" },
    handler: async (interaction) => {
      const [, ticketOpenerUserId, feedback] = interaction.customId.split("||");
      const threadId = interaction.channelId;
      if (!interaction.member || !interaction.guild) {
        console.error(
          "[err]: no member in ticket interaction",
          JSON.stringify(interaction),
        );
        await interaction.reply({
          content: "Something went wrong",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const { [SETTINGS.modLog]: modLog } = await fetchSettings(
        interaction.guild.id,
        [SETTINGS.modLog],
      );

      const { user } = interaction.member;
      const interactionUserId = user.id;

      await Promise.all([
        rest.delete(Routes.threadMembers(threadId, ticketOpenerUserId)),
        rest.post(Routes.channelMessages(modLog), {
          body: {
            content: `<@${ticketOpenerUserId}>'s ticket <#${threadId}> closed by <@${interactionUserId}>${feedback ? `. feedback: ${feedback}` : ""}`,
            allowedMentions: {},
          },
        }),
        interaction.reply({
          content: `The ticket was closed by <@${interactionUserId}>`,
          allowedMentions: {},
        }),
      ]);

      featureStats.ticketClosed(
        interaction.guild.id,
        interactionUserId,
        ticketOpenerUserId,
        !!feedback?.trim(),
      );

      return;
    },
  } as MessageComponentCommand,
] as AnyCommand[];
