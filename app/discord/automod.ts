import type { Client, TextChannel } from "discord.js";

import { SETTINGS, fetchSettings } from "~/models/guilds.server";

import { isStaff } from "~/helpers/discord";
import { sleep } from "~/helpers/misc";
import { reportUser, ReportReasons } from "~/helpers/modLog";

const AUTO_SPAM_THRESHOLD = 3;

const spamKeywords = [
  "nitro",
  "steam",
  "free",
  "airdrop",
  "deepfake",
  "poki",
].map((x) => new RegExp(x));
const spamPings = ["@everyone", "@here"];
const safeKeywords = ["forhire", "hiring", "remote", "onsite"];

const checkWords = (message: string, wordList: string[]) =>
  message.split(/\b/).some((word) => wordList.includes(word.toLowerCase()));

const getPingCount = (content: string) => {
  return spamPings.reduce(
    (sum, pingKeyword) => (content.includes(pingKeyword) ? sum + 1 : sum),
    0,
  );
};

export const isSpam = (content: string, threshold = 4) => {
  const pingCount = getPingCount(content);

  const numberOfSpamKeywords = spamKeywords.reduce(
    (accum, spamTrigger) => (spamTrigger.test(content) ? accum + 1 : accum),
    0,
  );

  const hasSafeKeywords = checkWords(content, safeKeywords);
  const hasBareInvite = content.includes("discord.gg") && content.length < 50;
  const hasLink = content.includes("http");

  const score =
    Number(hasLink) * 2 +
    numberOfSpamKeywords +
    // Pinging everyone is always treated as spam
    pingCount * 5 +
    Number(hasBareInvite) * 5 -
    // If it's a job post, then it's probably not spam
    Number(hasSafeKeywords) * 10;

  return threshold <= score;
};

export default async (bot: Client) => {
  bot.on("messageCreate", async (msg) => {
    if (msg.author?.id === bot.user?.id || !msg.guild) return;

    const [author, message] = await Promise.all([
      msg.guild.members.fetch(msg.author.id),
      msg.fetch(),
    ]);
    if (!message.guild || isStaff(author)) {
      return;
    }

    if (isSpam(message.content)) {
      const [{ warnings }] = await Promise.all([
        reportUser({
          reason: ReportReasons.spam,
          message: message,
        }),
        message.delete(),
      ]);

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        const { modLog: modLogId } = await fetchSettings(message.guild, [
          SETTINGS.modLog,
        ]);
        const [member, modLog] = await Promise.all([
          message.guild.members.fetch(message.author.id),
          message.guild.channels.fetch(modLogId) as unknown as TextChannel,
        ]);
        if (!modLog) throw new Error("Failed to load mod log when automodding");
        member.kick("Autokicked for spamming");
        modLog.send(`Automatically kicked <@${message.author.id}> for spam`);
      }
    } else if (getPingCount(message.content) > 0) {
      await reportUser({
        reason: ReportReasons.ping,
        message: message,
      });
      const tsk = await message.reply({
        embeds: [
          {
            title: "Tsk tsk.",
            description: `Please do **not** try to use \`@here\` or \`@everyone\` - there are ${message.guild.memberCount} members in ${message.guild.name}.`,
            color: 0xba0c2f,
          },
        ],
      });
      await Promise.all([message.delete(), sleep(15)]);
      await tsk.delete();
    }
  });
};
