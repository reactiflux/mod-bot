import type {
  APIInteraction,
  APIInteractionResponseChannelMessageWithSource,
  APIModalSubmitInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import {
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionResponseType,
  MessageFlags,
} from "discord.js";
import type { RequestHandler } from "express";
import { REST } from "@discordjs/rest";
import type {
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelThreadsJSONBody,
  RESTPostAPIChannelThreadsResult,
} from "discord-api-types/v10";
import { ChannelType, Routes } from "discord-api-types/v10";

import { discordToken } from "~/helpers/env";
import { SETTINGS, fetchSettings } from "~/models/guilds.server";
import { format } from "date-fns";
import { MessageComponentTypes, TextStyleTypes } from "discord-interactions";
import { quoteMessageContent } from "~/helpers/discord";

const rest = new REST({ version: "10" }).setToken(discordToken);

const isModalInteraction = (body: any): body is APIModalSubmitInteraction => {
  return (
    body.message.interaction_metadata.type === 2 &&
    body.data.custom_id === "modal-open-ticket"
  );
};

export const command = new SlashCommandBuilder()
  .setName("tickets-channel")
  .setDescription(
    "Set up a new button for creating private tickets with moderators",
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator,
  ) as SlashCommandBuilder;

export const webserver: RequestHandler = async (req, res, next) => {
  const body = req.body as APIInteraction;
  // @ts-expect-error because apparently custom_id types are broken
  console.log("hook:", body.data.component_type, body.data.custom_id);
  // @ts-expect-error because apparently custom_id types are broken
  if (body.data.component_type === 2 && body.data.custom_id === "open-ticket") {
    res.send({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: "modal-open-ticket",
        title: "What do you need from the moderators?",
        components: [
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: MessageComponentTypes.INPUT_TEXT,
                custom_id: "concern",
                label: "Concern",
                style: TextStyleTypes.PARAGRAPH,
                min_length: 30,
                max_length: 500,
                required: true,
              },
            ],
          },
        ],
      },
    });
    return;
  }
  if (isModalInteraction(body)) {
    if (
      !body.channel ||
      !body.message ||
      !body.message.interaction_metadata?.user ||
      !body.data?.components[0].components[0].value
    ) {
      console.error("ticket creation error", JSON.stringify(req.body));
      res.send({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Something went wrong while creating a ticket",
          flags: MessageFlags.Ephemeral,
        },
      } as APIInteractionResponseChannelMessageWithSource);
      return;
    }

    const { [SETTINGS.moderator]: mod } = await fetchSettings(
      // @ts-expect-error because this shouldn't have used a Guild instance but
      // it's a lot to refactor
      { id: body.guild_id },
      [SETTINGS.moderator],
    );
    const thread = (await rest.post(Routes.threads(body.channel.id), {
      body: {
        name: `${body.message.interaction_metadata.user.username} – ${format(
          new Date(),
          "PP kk:mmX",
        )}`,
        auto_archive_duration: 60 * 24 * 7,
        type: ChannelType.PrivateThread,
      } as RESTPostAPIChannelThreadsJSONBody,
    })) as RESTPostAPIChannelThreadsResult;
    await rest.post(Routes.channelMessages(thread.id), {
      body: {
        content: `<@${body.message.interaction_metadata.user.id}>, this is a private space only visible to the <@&${mod}> role.`,
      } as RESTPostAPIChannelMessageJSONBody,
    });
    await rest.post(Routes.channelMessages(thread.id), {
      body: {
        content: `${quoteMessageContent(
          body.data?.components[0].components[0].value,
        )}`,
      },
    });

    res.send({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `A private thread with the moderation team has been opened for you: <#${thread.id}>`,
        flags: MessageFlags.Ephemeral,
      },
    } as APIInteractionResponseChannelMessageWithSource);
    return;
  }
};

export const handler = async (interaction: ChatInputCommandInteraction) => {
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
};
