import {
  AuditLogEvent,
  AutoModerationActionType,
  Events,
  type AutoModerationActionExecution,
  type Client,
  type Guild,
  type GuildBan,
  type GuildMember,
  type PartialGuildMember,
  type PartialUser,
  type User,
} from "discord.js";

import { logAutomodLegacy } from "#~/commands/report/automodLog.ts";
import { sleep } from "#~/helpers/misc.ts";
import { log } from "#~/helpers/observability";

import { logModActionLegacy, type ModActionReport } from "./modActionLog";

// Time window to check audit log for matching entries (5 seconds)
const AUDIT_LOG_WINDOW_MS = 5000;

async function handleBanAdd(ban: GuildBan) {
  const { guild, user } = ban;
  let { reason } = ban;
  let executor: User | PartialUser | null = null;

  log("info", "ModActionLogger", "Ban detected", {
    userId: user.id,
    guildId: guild.id,
    reason,
  });

  // Retry loop with delay - audit log has propagation delay
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(0.5); // Wait for audit log to be written

    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanAdd,
      limit: 5,
    });

    const banEntry = auditLogs.entries.find(
      (entry) =>
        entry.target?.id === user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS,
    );

    if (banEntry?.executor) {
      executor = banEntry.executor;
      reason = banEntry.reason ?? reason;
      break;
    }

    log("debug", "ModActionLogger", "Audit log entry not found, retrying", {
      userId: user.id,
      guildId: guild.id,
      attempt: attempt + 1,
    });
  }

  // Skip if the bot performed this action (it's already logged elsewhere)
  if (executor?.id === guild.client.user?.id) {
    log("debug", "ModActionLogger", "Skipping self-ban", {
      userId: user.id,
      guildId: guild.id,
    });
    return;
  }

  await logModActionLegacy({
    guild,
    user,
    actionType: "ban",
    executor,
    reason: reason ?? "",
  });
}

async function fetchAuditLogs(
  guild: Guild,
  user: User,
): Promise<ModActionReport | undefined> {
  // Retry loop with delay - audit log has propagation delay
  let kickEntry;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(0.5); // Wait for audit log to be written

    // Check audit log to distinguish kick from voluntary leave
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberKick,
      limit: 5,
    });

    kickEntry = auditLogs.entries.find(
      (entry) =>
        entry.target?.id === user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS,
    );

    if (kickEntry?.executor) {
      break;
    }

    // Only log retry if we're not on the last attempt
    if (attempt < 2) {
      log(
        "debug",
        "ModActionLogger",
        "Kick audit log entry not found, retrying",
        {
          userId: user.id,
          guildId: guild.id,
          attempt: attempt + 1,
        },
      );
    }
  }

  // If no kick entry found after retries, user left voluntarily
  if (!kickEntry) {
    log(
      "debug",
      "ModActionLogger",
      "No kick entry found after retries, user left voluntarily",
      { userId: user.id, guildId: guild.id },
    );
    return {
      actionType: "left",
      user,
      guild,
      executor: undefined,
      reason: undefined,
    };
  }
  const { executor, reason } = kickEntry;

  if (!executor) {
    log(
      "warn",
      "ModActionLogger",
      `No executor found for audit log entry ${kickEntry.id}`,
    );
  }

  // Skip if the bot performed this action
  // TODO: maybe best to invert — remove manual kick logs in favor of this
  if (kickEntry.executor?.id === guild.client.user?.id) {
    log("debug", "ModActionLogger", "Skipping self-kick", {
      userId: user.id,
      guildId: guild.id,
    });
    return;
  }

  return { actionType: "kick", user, guild, executor, reason: reason ?? "" };
}

async function handleMemberRemove(member: GuildMember | PartialGuildMember) {
  const { guild, user } = member;

  log("info", "ModActionLogger", "Member removal detected", {
    userId: user.id,
    guildId: guild.id,
  });

  const auditLogs = await fetchAuditLogs(guild, user);
  if (!auditLogs || auditLogs?.actionType === "left") {
    return;
  }

  const { executor = null, reason = "" } = auditLogs;
  await logModActionLegacy({
    guild,
    user,
    actionType: "kick",
    executor,
    reason,
  });
}

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
  await logAutomodLegacy({
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
  bot.on(Events.GuildBanAdd, handleBanAdd);
  bot.on(Events.GuildMemberRemove, handleMemberRemove);
  bot.on(Events.AutoModerationActionExecution, handleAutomodAction);
};
