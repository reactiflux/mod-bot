export const spamKeywords = [
  "nitro",
  "steam",
  "airdrop",
  "deepfake",
  "poki",
  "gift",
  "18+",
  "nudes",
].map((x) => new RegExp(x));
const spamPings = ["@everyone", "@here"];
export const safeKeywords = ["forhire", "hiring", "remote", "onsite"];

export const checkWords = (message: string, wordList: string[]) =>
  message.split(/\b/).some((word) => wordList.includes(word.toLowerCase()));

export const getPingCount = (content: string) => {
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
