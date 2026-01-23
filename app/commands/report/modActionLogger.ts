import { formatDistanceToNowStrict } from "date-fns";
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
import { Effect } from "effect";

import { logAutomod } from "#~/commands/report/automodLog.ts";
import { DatabaseLayer } from "#~/Database.ts";
import { logEffect } from "#~/effects/observability.ts";
import { runEffect } from "#~/effects/runtime.ts";

import { logModAction } from "./modActionLog";

// Time window to check audit log for matching entries (5 seconds)
const AUDIT_LOG_WINDOW_MS = 5000;

interface AuditLogEntryResult {
  executor: User | PartialUser | null;
  reason: string | null;
}

/**
 * Fetches audit log entries with retry logic to handle propagation delay.
 * Returns the executor and reason if found.
 */
const fetchAuditLogEntry = (
  guild: Guild,
  userId: string,
  auditLogType: AuditLogEvent,
  findEntry: (
    entries: Awaited<ReturnType<typeof guild.fetchAuditLogs>>["entries"],
  ) => AuditLogEntryResult | undefined,
) =>
  Effect.gen(function* () {
    yield* Effect.sleep("100 millis");
    for (let attempt = 0; attempt < 3; attempt++) {
      yield* Effect.sleep("500 millis");

      const auditLogs = yield* Effect.promise(() =>
        guild.fetchAuditLogs({ type: auditLogType, limit: 5 }),
      );

      const entry = findEntry(auditLogs.entries);
      if (entry?.executor) {
        yield* logEffect("debug", "ModActionLogger", `record found`, {
          attempt: attempt + 1,
        });
        return entry;
      }
    }
    return undefined;
  }).pipe(
    Effect.withSpan("fetchAuditLogEntry", {
      attributes: { userId, guildId: guild.id },
    }),
  );

const banAddEffect = (ban: GuildBan) =>
  Effect.gen(function* () {
    const { guild, user } = ban;
    let { reason } = ban;

    yield* logEffect("info", "ModActionLogger", "Ban detected", {
      userId: user.id,
      guildId: guild.id,
      reason,
    });

    const entry = yield* fetchAuditLogEntry(
      guild,
      user.id,
      AuditLogEvent.MemberBanAdd,
      (entries) =>
        entries.find(
          (e) =>
            e.targetId === user.id &&
            Date.now() - e.createdTimestamp < AUDIT_LOG_WINDOW_MS,
        ),
    );

    const executor = entry?.executor ?? null;
    reason = entry?.reason ?? reason;

    // Skip if the bot performed this action (it's already logged elsewhere)
    if (executor?.id === guild.client.user?.id) {
      yield* logEffect("debug", "ModActionLogger", "Skipping self-ban", {
        userId: user.id,
        guildId: guild.id,
      });
      return;
    }

    yield* logModAction({
      guild,
      user,
      actionType: "ban",
      executor,
      reason: reason ?? "",
    });
  }).pipe(Effect.withSpan("handleBanAdd"));

const banRemoveEffect = (ban: GuildBan) =>
  Effect.gen(function* () {
    const { guild, user } = ban;

    yield* logEffect("info", "ModActionLogger", "Unban detected", {
      userId: user.id,
      guildId: guild.id,
    });

    const entry = yield* fetchAuditLogEntry(
      guild,
      user.id,
      AuditLogEvent.MemberBanRemove,
      (entries) =>
        entries.find(
          (e) =>
            e.targetId === user.id &&
            Date.now() - e.createdTimestamp < AUDIT_LOG_WINDOW_MS,
        ),
    );

    const executor = entry?.executor ?? null;
    const reason = entry?.reason ?? "";

    // Skip if the bot performed this action (it's already logged elsewhere)
    if (executor?.id === guild.client.user?.id) {
      yield* logEffect("debug", "ModActionLogger", "Skipping self-unban", {
        userId: user.id,
        guildId: guild.id,
      });
      return;
    }

    yield* logModAction({
      guild,
      user,
      actionType: "unban",
      executor,
      reason,
    });
  }).pipe(Effect.withSpan("handleBanRemove"));

const fetchKickAuditLog = (guild: Guild, user: User) =>
  Effect.gen(function* () {
    const entry = yield* fetchAuditLogEntry(
      guild,
      user.id,
      AuditLogEvent.MemberKick,
      (entries) =>
        entries.find(
          (e) =>
            e.targetId === user.id &&
            Date.now() - e.createdTimestamp < AUDIT_LOG_WINDOW_MS,
        ),
    );

    // If no kick entry found after retries, user left voluntarily
    if (!entry) {
      yield* logEffect(
        "debug",
        "ModActionLogger",
        "No kick entry found after retries, user left voluntarily",
        { userId: user.id, guildId: guild.id },
      );
      return {
        actionType: "left" as const,
        user,
        guild,
        executor: undefined,
        reason: undefined,
      };
    }

    const { executor, reason } = entry;

    if (!executor) {
      yield* logEffect(
        "warn",
        "ModActionLogger",
        `No executor found for audit log entry`,
        { userId: user.id, guildId: guild.id },
      );
    }

    // Skip if the bot performed this action
    if (executor?.id === guild.client.user?.id) {
      yield* logEffect("debug", "ModActionLogger", "Skipping self-kick", {
        userId: user.id,
        guildId: guild.id,
      });
      return undefined;
    }

    return {
      actionType: "kick" as const,
      user,
      guild,
      executor,
      reason: reason ?? "",
    };
  });

const memberRemoveEffect = (member: GuildMember | PartialGuildMember) =>
  Effect.gen(function* () {
    const { guild, user } = member;

    yield* logEffect("info", "ModActionLogger", "Member removal detected", {
      userId: user.id,
      guildId: guild.id,
    });

    const auditLogs = yield* fetchKickAuditLog(guild, user);
    if (!auditLogs || auditLogs.actionType === "left") {
      return;
    }

    const { executor = null, reason = "" } = auditLogs;
    yield* logModAction({
      guild,
      user,
      actionType: "kick",
      executor,
      reason,
    });
  }).pipe(Effect.withSpan("handleMemberRemove"));

const automodActionEffect = (execution: AutoModerationActionExecution) =>
  Effect.gen(function* () {
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
      yield* logEffect(
        "info",
        "Automod",
        "Skipping timeout action (no message to log)",
        {
          userId,
          guildId: guild.id,
          ruleId: autoModerationRule?.name,
        },
      );
      return;
    }

    yield* logEffect("info", "Automod", "Automod action executed", {
      userId,
      guildId: guild.id,
      channelId,
      messageId,
      actionType: action.type,
      ruleName: autoModerationRule?.name,
      matchedKeyword,
    });

    const user = yield* Effect.tryPromise({
      try: () => guild.client.users.fetch(userId),
      catch: (error) => error,
    });

    yield* logAutomod({
      guild,
      user,
      content: content ?? matchedContent ?? "[Content not available]",
      channelId: channelId ?? undefined,
      messageId: messageId ?? undefined,
      ruleName: autoModerationRule?.name ?? "Unknown rule",
      matchedKeyword: matchedKeyword ?? matchedContent ?? undefined,
      actionType: action.type,
    });
  }).pipe(Effect.withSpan("handleAutomodAction"));

const memberUpdateEffect = (
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember | PartialGuildMember,
) =>
  Effect.gen(function* () {
    const { guild, user } = newMember;
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    // Determine if this is a timeout applied or removed
    const isTimeoutApplied = newTimeout !== null && newTimeout > Date.now();
    const isTimeoutRemoved =
      oldTimeout !== null && oldTimeout > Date.now() && newTimeout === null;

    // No timeout change relevant to us
    if (!isTimeoutApplied && !isTimeoutRemoved) {
      return;
    }

    // Capture duration immediately before audit log lookup
    const duration = isTimeoutApplied
      ? formatDistanceToNowStrict(new Date(newTimeout))
      : undefined;

    yield* logEffect(
      "info",
      "ModActionLogger",
      isTimeoutApplied ? "Timeout detected" : "Timeout removal detected",
      {
        userId: user.id,
        guildId: guild.id,
        duration,
      },
    );

    const entry = yield* fetchAuditLogEntry(
      guild,
      user.id,
      AuditLogEvent.MemberUpdate,
      (entries) =>
        entries.find((e) => {
          if (e.targetId !== user.id) return false;
          if (Date.now() - e.createdTimestamp >= AUDIT_LOG_WINDOW_MS)
            return false;
          const timeoutChange = e.changes?.find(
            (change) => change.key === "communication_disabled_until",
          );
          return timeoutChange !== undefined;
        }),
    );

    const executor = entry?.executor ?? null;
    const reason = entry?.reason ?? "";

    // Skip if the bot performed this action (it's already logged elsewhere)
    if (executor?.id === guild.client.user?.id) {
      yield* logEffect("debug", "ModActionLogger", "Skipping self-timeout", {
        userId: user.id,
        guildId: guild.id,
      });
      return;
    }

    if (isTimeoutApplied) {
      yield* logModAction({
        guild,
        user,
        actionType: "timeout",
        executor,
        reason,
        duration: duration!,
      });
    } else {
      yield* logModAction({
        guild,
        user,
        actionType: "timeout_removed",
        executor,
        reason,
      });
    }
  }).pipe(Effect.withSpan("handleMemberUpdate"));

// Thin async wrappers that execute the Effects
const handleBanAdd = (ban: GuildBan) =>
  runEffect(banAddEffect(ban).pipe(Effect.provide(DatabaseLayer)));
const handleBanRemove = (ban: GuildBan) =>
  runEffect(banRemoveEffect(ban).pipe(Effect.provide(DatabaseLayer)));
const handleMemberRemove = (member: GuildMember | PartialGuildMember) =>
  runEffect(memberRemoveEffect(member).pipe(Effect.provide(DatabaseLayer)));
const handleAutomodAction = (execution: AutoModerationActionExecution) =>
  runEffect(automodActionEffect(execution).pipe(Effect.provide(DatabaseLayer)));
const handleMemberUpdate = (
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember | PartialGuildMember,
) =>
  runEffect(
    memberUpdateEffect(oldMember, newMember).pipe(
      Effect.provide(DatabaseLayer),
    ),
  );

export default async (bot: Client) => {
  bot.on(Events.GuildBanAdd, handleBanAdd);
  bot.on(Events.GuildBanRemove, handleBanRemove);
  bot.on(Events.GuildMemberRemove, handleMemberRemove);
  bot.on(Events.GuildMemberUpdate, handleMemberUpdate);
  bot.on(Events.AutoModerationActionExecution, handleAutomodAction);
};
