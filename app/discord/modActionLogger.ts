import {
  AuditLogEvent,
  Events,
  type Client,
  type Guild,
  type GuildBan,
  type GuildMember,
  type PartialGuildMember,
  type PartialUser,
  type User,
} from "discord.js";

import { reportModAction, type ModActionReport } from "#~/helpers/modLog";
import { log } from "#~/helpers/observability";

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

  try {
    // Check audit log for who performed the ban
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanAdd,
      limit: 5,
    });

    const banEntry = auditLogs.entries.find(
      (entry) =>
        entry.target?.id === user.id &&
        Date.now() - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS,
    );

    executor = banEntry?.executor ?? null;
    reason = banEntry?.reason;

    // Skip if the bot performed this action (it's already logged elsewhere)
    if (executor?.id === guild.client.user?.id) {
      log("debug", "ModActionLogger", "Skipping self-ban", {
        userId: user.id,
        guildId: guild.id,
      });
      return;
    }
  } catch (error) {
    // If we can't access audit log, still log the ban but without executor info
    if (
      error instanceof Error &&
      error.message.includes("Missing Permissions")
    ) {
      log(
        "warn",
        "ModActionLogger",
        "Cannot access audit log for ban details",
        { userId: user.id, guildId: guild.id },
      );
    } else {
      log("error", "ModActionLogger", "Failed to fetch audit log for ban", {
        userId: user.id,
        guildId: guild.id,
        error,
      });
    }
  }

  try {
    await reportModAction({
      guild,
      user,
      actionType: "ban",
      executor,
      reason: reason ?? "",
    });
  } catch (error) {
    log("error", "ModActionLogger", "Failed to report ban", {
      userId: user.id,
      guildId: guild.id,
      error,
    });
  }
}

async function fetchAuditLogs(
  guild: Guild,
  user: User,
): Promise<ModActionReport | undefined> {
  // Check audit log to distinguish kick from voluntary leave
  const auditLogs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberKick,
    limit: 5,
  });

  const kickEntry = auditLogs.entries.find(
    (entry) =>
      entry.target?.id === user.id &&
      Date.now() - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS,
  );

  // If no kick entry found, user left voluntarily
  if (!kickEntry) {
    log(
      "debug",
      "ModActionLogger",
      "No kick entry found, user left voluntarily",
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

  try {
    const auditLogs = await fetchAuditLogs(guild, user);

    if (auditLogs) {
      const { executor = null, reason = "" } = auditLogs;
      await reportModAction({
        guild,
        user,
        actionType: "kick",
        executor,
        reason,
      });
      return;
    }
    await reportModAction({
      guild,
      user,
      actionType: "left",
      executor: undefined,
      reason: undefined,
    });
  } catch (error) {
    log("error", "ModActionLogger", "Failed to handle member removal", {
      userId: user.id,
      guildId: guild.id,
      error,
    });
  }
}

export default async (bot: Client) => {
  bot.on(Events.GuildBanAdd, async (ban) => {
    try {
      await handleBanAdd(ban);
    } catch (error) {
      log("error", "ModActionLogger", "Unhandled error in ban handler", {
        userId: ban.user.id,
        guildId: ban.guild.id,
        error,
      });
    }
  });

  bot.on(Events.GuildMemberRemove, async (member) => {
    try {
      await handleMemberRemove(member);
    } catch (error) {
      log(
        "error",
        "ModActionLogger",
        "Unhandled error in member remove handler",
        {
          userId: member.user?.id,
          guildId: member.guild.id,
          error,
        },
      );
    }
  });
};
