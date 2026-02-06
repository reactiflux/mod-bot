import { ChannelType, Events, type Client } from "discord.js";

import TTLCache from "@isaacs/ttlcache";

import { db, run } from "#~/AppRuntime";
import { logUserMessageLegacy } from "#~/commands/report/userLog.ts";
import { featureStats } from "#~/helpers/metrics";
import { log } from "#~/helpers/observability";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server.js";
import { ReportReasons } from "#~/models/reportedMessages.ts";

interface HoneypotConfig {
  guild_id: string;
  channel_id: string;
}

export async function startHoneypotTracking(client: Client) {
  // TTL cache for honeypot configs - 10 minute TTL, max 1000 guilds
  const configCache = new TTLCache<string, HoneypotConfig[]>({
    ttl: 10 * 60 * 1000, // 10 minutes
    max: 1000, // max 1000 guilds cached
  });
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.system) return;
    if (msg.channel.type !== ChannelType.GuildText || msg.author.bot) {
      return;
    }
    if (!msg.guildId || !msg.guild) {
      log(
        "error",
        "HoneypotTracker",
        "Missing guild info when tracking honeypot messages",
        {
          messageId: msg.id,
          hasAuthor: !!msg.author,
          hasGuild: !!msg.guildId,
        },
      );
      throw Error("Missing guild info when tracking honeypot messages");
    }
    const { guild } = msg;
    let config = configCache.get(msg.guildId);
    if (!config) {
      config = await run(
        db
          .selectFrom("honeypot_config")
          .selectAll()
          .where("guild_id", "=", msg.guildId),
      );

      configCache.set(msg.guildId, config);
      log(
        "debug",
        "HoneypotTracking",
        `Added config to in-memory cache for guildId ${msg.guildId}`,
      );
    }

    if (!config.some((c) => c.channel_id === msg.channelId)) {
      return;
    }
    const [member, message] = await Promise.all([
      guild.members.fetch(msg.author.id).catch((_) => undefined),
      msg.fetch().catch((_) => undefined),
    ]);
    if (!member || !message) {
      log(
        "debug",
        "HoneypotTracker",
        "unable to resolve member or message for honeypot",
      );
      throw Error("unable to resolve member or message for honeypot");
    }
    // Get moderator role for permission check
    const { moderator: modRoleId } = await fetchSettings(msg.guildId, [
      SETTINGS.moderator,
    ]);
    if (
      (Array.isArray(member.roles)
        ? member.roles.includes(modRoleId)
        : member.roles.cache.has(modRoleId)) ||
      member.permissions.has("Administrator")
    ) {
      log(
        "debug",
        "HoneypotTracker",
        "Mod posted in Honeypot channel, no action taken",
      );
      return;
    }
    try {
      // softban user (ban/unban) to clear all recent messages
      await Promise.all([
        member
          .ban({
            reason: "honeypot spam detected",
            deleteMessageSeconds: 604800, // 7 days
          })
          .then(() => guild.members.unban(member)),
        logUserMessageLegacy({
          reason: ReportReasons.spam,
          message: message,
          staff: client.user ?? false,
        }),
      ]);
      featureStats.honeypotTriggered(msg.guildId, member.id, msg.channelId);
    } catch (e) {
      log(
        "error",
        "HoneypotTracker",
        "Failed to softban user in honeypot channel",
        {
          guildId: msg.guildId,
          userId: member.id,
          channelId: msg.channelId,
          error: e,
        },
      );
      await logUserMessageLegacy({
        reason: ReportReasons.spam,
        message: message,
        staff: client.user ?? false,
        extra: `Failed to softban user in honeypot channel: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });
}
