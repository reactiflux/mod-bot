import type {
  APIInteraction,
  APIInteractionResponseChannelMessageWithSource,
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

const rest = new REST({ version: "10" }).setToken(discordToken);

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
  if (body.data.component_type !== 2 || body.data.custom_id !== "open-ticket") {
    return;
  }
  if (
    !body.channel ||
    !body.message ||
    !body.message.interaction_metadata?.user
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
    // @ts-ignore
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
      content: `<@${body.message.interaction_metadata.user.id}>, this is a private space only visible to the <@&${mod}> role. Please describe what you need the moderators.`,
    } as RESTPostAPIChannelMessageJSONBody,
  });

  res.send({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `A private thread with the moderation team has been opened for you: <#${thread.id}>`,
      flags: MessageFlags.Ephemeral,
    },
  } as APIInteractionResponseChannelMessageWithSource);
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
