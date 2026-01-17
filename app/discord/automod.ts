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
import { registerListener } from "./listenerRegistry";

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

  // Only log actions that actually affected a message
  if (action.type === AutoModerationActionType.Timeout) {
    log("info", "Automod", "Skipping timeout action (no message to log)", {
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
  registerListener(
    bot,
    Events.AutoModerationActionExecution,
    async (execution) => {
      try {
        log("info", "automod.logging", "handling automod event", { execution });
        await handleAutomodAction(execution);
      } catch (e) {
        log("error", "Automod", "Failed to handle automod action", {
          error: e,
          userId: execution.userId,
          guildId: execution.guild.id,
        });
      }
    },
  );

  // Handle our custom spam detection
  registerListener(bot, Events.MessageCreate, async (msg) => {
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
