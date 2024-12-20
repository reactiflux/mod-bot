import type { ChatInputCommandInteraction } from "discord.js";
import {
  ChannelType,
  ComponentType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
  InteractionType,
  ModalBuilder,
  TextInputBuilder,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes, TextInputStyle } from "discord-api-types/v10";

import { discordToken } from "~/helpers/env.server";
import { SETTINGS, fetchSettings } from "~/models/guilds.server";
import { format } from "date-fns";
import type {
  AnyCommand,
  MessageComponentCommand,
  ModalCommand,
  SlashCommand,
} from "~/helpers/discord";
import { quoteMessageContent } from "~/helpers/discord";

const rest = new REST({ version: "10" }).setToken(discordToken);

export default [
  {
    command: new SlashCommandBuilder()
      .setName("tickets-channel")
      .setDescription(
        "Set up a new button for creating private tickets with moderators",
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator,
      ) as SlashCommandBuilder,

    handler: async (interaction: ChatInputCommandInteraction) => {
      if (!interaction.guild) throw new Error("Interaction has no guild");

      await interaction.reply({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                label: "Open a private ticket with the moderators",
                style: ButtonStyle.Primary,
                customId: "open-ticket",
              },
            ],
          },
        ],
      });
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
        !interaction.user ||
        !interaction.guild
      ) {
        await interaction.reply({
          content: "Something went wrong while creating a ticket",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const { channel, fields, user } = interaction;
      const concern = fields.getField("concern").value;

      const { [SETTINGS.moderator]: mod } = await fetchSettings(
        interaction.guild,
        [SETTINGS.moderator, SETTINGS.modLog],
      );
      const thread = await channel.threads.create({
        name: `${user.username} – ${format(new Date(), "PP kk:mmX")}`,
        autoArchiveDuration: 60 * 24 * 7,
        type: ChannelType.PrivateThread,
      });
      await thread.send({
        content: `<@${user.id}>, this is a private space only visible to you and the <@&${mod}> role.`,
      });
      await thread.send(quoteMessageContent(concern));
      await thread.send({
        content: "When you’ve finished, please close the ticket.",
        components: [
          // @ts-ignore
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`close-ticket||${user.id}`)
              .setLabel("Close ticket")
              .setStyle(ButtonStyle.Danger),
          ),
        ],
      });

      interaction.reply({
        content: `A private thread with the moderation team has been opened for you: <#${thread.id}>`,
        ephemeral: true,
      });
      return;
    },
  } as ModalCommand,
  {
    command: { type: InteractionType.MessageComponent, name: "close-ticket" },
    handler: async (interaction) => {
      const [, ticketOpenerUserId] = interaction.customId.split("||");
      const threadId = interaction.channelId;
      if (!interaction.member || !interaction.guild) {
        console.error(
          "[err]: no member in ticket interaction",
          JSON.stringify(interaction),
        );
        await interaction.reply({
          content: "Something went wrong",
          ephemeral: true,
        });
        return;
      }

      const { [SETTINGS.modLog]: modLog } = await fetchSettings(
        interaction.guild,
        [SETTINGS.modLog],
      );

      const { user } = interaction.member;
      const interactionUserId = user.id;

      await Promise.all([
        rest.delete(Routes.threadMembers(threadId, ticketOpenerUserId)),
        rest.post(Routes.channelMessages(modLog), {
          body: {
            content: `<@${ticketOpenerUserId}>’s ticket <#${threadId}> closed by <@${interactionUserId}> `,
            allowedMentions: { users: [], roles: [] },
          },
        }),
        interaction.reply({
          content: `The ticket was closed by <@${ticketOpenerUserId}>`,
          allowedMentions: { users: [], roles: [] },
        }),
      ]);

      return;
    },
  } as MessageComponentCommand,
] as Array<AnyCommand>;
