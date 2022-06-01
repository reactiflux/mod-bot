import type { Client, TextChannel } from "discord.js";

import { SETTINGS, fetchSettings } from "~/models/guilds.server";

import { isStaff } from "~/helpers/discord";
import { sleep } from "~/helpers/misc";
import { reportUser, ReportReasons } from "~/helpers/modLog";
import { simplifyString } from "~/helpers/string";

const AUTO_SPAM_THRESHOLD = 3;

const spamKeywords = ["nitro", "steam", "free", "gift", "airdrop"];
const spamPings = ["@everyone", "@here"];
const safeKeywords = ["forhire", "hiring", "remote", "onsite"];

const safeDomains = [
  "https://discord.com",
  "https://www.reactiflux.com",
  "https://github.com",
  "https://developer.mozilla.org",
  "https://reactjs.org",
  "https://beta.reactjs.org",
  "https://nextjs.org",
];

const checkWords = (message: string, wordList: string[]) =>
  message.split(/\b/).some((word) => wordList.includes(word.toLowerCase()));

const getPingCount = (content: string) => {
  return spamPings.reduce(
    (sum, pingKeyword) => (content.includes(pingKeyword) ? sum + 1 : sum),
    0,
  );
};

const getSpamScore = (content: string) => {
  const pingCount = getPingCount(content);

  const words = content.split(" ");
  const includedSpamKeywords = words
    .map((word) => spamKeywords.includes(word))
    .filter(Boolean);

  const hasSafeKeywords = checkWords(content, safeKeywords);

  const hasLink =
    content.includes("http") &&
    !safeDomains.some((domain) => content.includes(domain));

  return (
    Number(hasLink) +
    includedSpamKeywords.length +
    // Pinging everyone is always treated as spam
    Number(pingCount) * 5 -
    // If it's a job post, then it's probably  not spam
    Number(hasSafeKeywords) * 10
  );
};

export default async (bot: Client) => {
  bot.on("messageCreate", async (msg) => {
    if (msg.author?.id === bot.user?.id) return;
    if (!msg.guild) return;

    const [author] = await Promise.all([
      msg.guild.members.fetch(msg.author.id),
    ]);
    if (isStaff(author)) {
      return;
    }

    const content = simplifyString(msg.content);

    if (getPingCount(content) > 0) {
      msg
        .reply({
          embeds: [
            {
              title: "Tsk tsk.",
              description: `Please do **not** try to use \`@here\` or \`@everyone\` - there are ${msg.guild.memberCount} members in ${msg.guild.name}.`,
              color: "#BA0C2F",
            },
          ],
        })
        .then(async (tsk) => {
          await sleep(15);
          tsk.delete();
        });
    }
    const spamScore = getSpamScore(content);

    if (spamScore >= 3) {
      // Skip if the post is from someone from the staff or reactor is not staff

      msg.delete();
      const warnings = await reportUser({
        reason: ReportReasons.spam,
        message: msg,
      });

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        const { modLog: modLogId } = await fetchSettings(msg.guild, [
          SETTINGS.modLog,
        ]);
        const [member, modLog] = await Promise.all([
          msg.guild.members.fetch(msg.author.id),
          msg.guild.channels.fetch(modLogId) as unknown as TextChannel,
        ]);
        if (!modLog) throw new Error("Failed to load mod log when automodding");
        member.kick("Autokicked for spamming");
        modLog.send(`Automatically kicked <@${msg.author.id}> for spam`);
      }
    }
  });
};
