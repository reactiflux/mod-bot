import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type ThreadChannel,
} from "discord.js";

export async function escalationControls(
  reportedMessageOrUserId: Message | string,
  thread: ThreadChannel,
) {
  const reportedUserId =
    typeof reportedMessageOrUserId === "string"
      ? reportedMessageOrUserId
      : reportedMessageOrUserId.author.id;

  await thread.send({
    content: "Moderator controls",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-delete|${reportedUserId}`)
          .setLabel("Delete all reported messages")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`escalate-kick|${reportedUserId}`)
          .setLabel("Kick")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-ban|${reportedUserId}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Secondary),
      ),

      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-restrict|${reportedUserId}`)
          .setLabel("Restrict")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-timeout|${reportedUserId}`)
          .setLabel("Timeout")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });

  await thread.send({
    content:
      "Anyone can escalate, which will notify moderators and call for a vote on how to respond.",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-escalate|${reportedUserId}|0`)
          .setLabel("Escalate")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  });
}
