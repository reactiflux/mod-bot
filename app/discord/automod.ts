import {
  AutoModerationActionType,
  Events,
  type AutoModerationActionExecution,
  type Client,
} from "discord.js";

import { isStaff } from "#~/helpers/discord";
import { isSpam } from "#~/helpers/isSpam";
import { featureStats } from "#~/helpers/metrics";
import { reportAutomod, reportUser } from "#~/helpers/modLog";
import { log } from "#~/helpers/observability";
import {
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.server";

import { client } from "./client.server";

const AUTO_SPAM_THRESHOLD = 3;

async function handleAutomodAction(execution: AutoModerationActionExecution) {
  const {
    guild,
    userId,
    channelId,
    messageId,
    content,
    action,
    matchedContent,
    matchedKeyword,
    autoModerationRule,
  } = execution;

  // Only log actions that actually affected a message (BlockMessage, SendAlertMessage)
  // Skip Timeout actions as they don't have associated message content
  if (action.type === AutoModerationActionType.Timeout) {
    log("debug", "Automod", "Skipping timeout action (no message to log)", {
      userId,
      guildId: guild.id,
      ruleId: autoModerationRule?.name,
    });
    return;
  }

  log("info", "Automod", "Automod action executed", {
    userId,
    guildId: guild.id,
    channelId,
    messageId,
    actionType: action.type,
    ruleName: autoModerationRule?.name,
    matchedKeyword,
  });

  // Try to fetch the message if we have a messageId
  // The message may have been deleted by automod before we can fetch it
  if (messageId && channelId) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (channel?.isTextBased() && "messages" in channel) {
        const message = await channel.messages.fetch(messageId);
        // We have the full message, use reportUser
        await reportUser({
          reason: ReportReasons.automod,
          message,
          staff: client.user ?? false,
          extra: `Rule: ${autoModerationRule?.name ?? "Unknown"}\nMatched: ${matchedKeyword ?? matchedContent ?? "Unknown"}`,
        });
        return;
      }
    } catch (e) {
      log(
        "debug",
        "Automod",
        "Could not fetch message, using fallback logging",
        {
          messageId,
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  // Fallback: message was blocked/deleted or we couldn't fetch it
  // Use reportAutomod which doesn't require a Message object
  const user = await guild.client.users.fetch(userId);
  await reportAutomod({
    guild,
    user,
    content: content ?? matchedContent ?? "[Content not available]",
    channelId: channelId ?? undefined,
    messageId: messageId ?? undefined,
    ruleName: autoModerationRule?.name ?? "Unknown rule",
    matchedKeyword: matchedKeyword ?? matchedContent ?? undefined,
    actionType: action.type,
  });
}

export default async (bot: Client) => {
  // Handle Discord's built-in automod actions
  bot.on(Events.AutoModerationActionExecution, async (execution) => {
    try {
      await handleAutomodAction(execution);
    } catch (e) {
      log("error", "Automod", "Failed to handle automod action", {
        error: e instanceof Error ? e.message : String(e),
        userId: execution.userId,
        guildId: execution.guild.id,
      });
    }
  });

  // Handle our custom spam detection
  bot.on(Events.MessageCreate, async (msg) => {
    if (msg.author.id === bot.user?.id || !msg.guild) return;

    const [member, message] = await Promise.all([
      msg.guild.members.fetch(msg.author.id).catch((_) => undefined),
      msg.fetch().catch((_) => undefined),
    ]);
    if (!message?.guild || !member || isStaff(member)) {
      return;
    }

    if (isSpam(message.content)) {
      const { warnings, message: logMessage } = await reportUser({
        reason: ReportReasons.spam,
        message: message,
        staff: client.user ?? false,
      });
      await message
        .delete()
        .then(() => markMessageAsDeleted(message.id, message.guild!.id));

      featureStats.spamDetected(
        message.guild.id,
        message.author.id,
        message.channelId,
      );

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        await Promise.all([
          member.kick("Autokicked for spamming"),
          logMessage.reply({
            content: `Automatically kicked <@${message.author.id}> for spam`,
            allowedMentions: {},
          }),
        ]);
        featureStats.spamKicked(message.guild.id, message.author.id, warnings);
      }
    }
  });
};
