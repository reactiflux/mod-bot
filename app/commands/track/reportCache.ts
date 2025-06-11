import { simplifyString } from "#~/helpers/string.js";
import TTLCache from "@isaacs/ttlcache";
import type { Message, User } from "discord.js";

export interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff: User | false;
}

export const enum ReportReasons {
  anonReport = "anonReport",
  track = "track",
  modResolution = "modResolution",
  spam = "spam",
}

const HOUR = 60 * 60 * 1000;
type UserID = string;
type GuildID = string;
const cache = new TTLCache<
  `${UserID}${GuildID}`,
  Map<
    string,
    {
      logMessage: Message;
      logs: Report[];
    }
  >
>({
  ttl: 20 * HOUR,
  max: 1000,
});

export const queryCacheMetadata = (message: Message) => {
  const cacheKey = `${message.guildId}${message.author.id}`;

  const user = cache.get(cacheKey);
  if (!user) {
    return {
      uniqueMessages: 0,
      uniqueChannels: 0,
      reportCount: 0,
      allReports: [],
    };
  }

  const uniqueMessages = new Set();
  const uniqueChannels = new Set();
  let reportCount = 0;
  user?.forEach((u) => {
    reportCount += u.logs.length;
    u.logs.forEach(({ message }) => {
      uniqueChannels.add(message.channelId);
      uniqueMessages.add(message.id);
    });
  });

  return {
    uniqueMessages: uniqueMessages.size,
    uniqueChannels: uniqueChannels.size,
    reportCount,
    allReports: [...user.values()].flatMap(({ logs }) => logs),
  };
};

export const queryReportCache = (message: Message) => {
  const cacheKey = `${message.guildId}${message.author.id}`;
  const simplifiedContent = simplifyString(message.content);

  const cachedWarnings = cache.get(cacheKey);
  return cachedWarnings?.get(simplifiedContent);
};

export const trackReport = (logMessage: Message, newReport: Report) => {
  const cacheKey = `${newReport.message.guildId}${newReport.message.author.id}`;
  const simplifiedContent = simplifyString(newReport.message.content);

  let cachedWarnings = cache.get(cacheKey);
  if (!cachedWarnings) {
    console.log("[trackReport]", "no cached warnings found for guild+author");
    cachedWarnings = new Map<string, { logMessage: Message; logs: Report[] }>();
  }

  let existingReports = cachedWarnings.get(simplifiedContent);
  if (!existingReports) {
    console.log("[trackReport]", "tracking a new reported message");
    // This is busted cuz it would need to create a new log thread
    existingReports = { logMessage, logs: [] };
  }

  const newLogs = existingReports.logs.concat([newReport]);
  cachedWarnings.set(simplifiedContent, {
    logMessage,
    logs: newLogs,
  });
};

export const deleteAllReported = async (message: Message) => {
  const allReports = queryReportCache(message);
  if (!allReports) return;

  await Promise.allSettled(allReports?.logs.map((l) => l.message.delete()));
};
