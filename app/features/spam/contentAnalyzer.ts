/**
 * Content-based spam analysis — pure functions, no Effect.
 * Evolved from app/helpers/isSpam.ts with additional signals.
 */

import type { SpamSignal } from "./spamScorer.ts";

// ── Static keyword lists for content-based spam detection ──

const spamKeywordsByCategory = {
  scam: ["nitro", "steam", "gift", "free", "claim", "reward"],
  nsfw: ["18+", "nudes", "onlyfans", "deepfake", "poki"],
  crypto: ["airdrop", "whitelist", "nft", "mint", "dex"],
  phishing: ["verify", "billing", "suspended", "expired"],
} as const;

type SpamCategory = keyof typeof spamKeywordsByCategory;

const spamKeywords: { pattern: RegExp; category: SpamCategory }[] =
  Object.entries(spamKeywordsByCategory).flatMap(([category, keywords]) =>
    keywords.map((kw) => ({
      pattern: new RegExp(kw, "i"),
      category: category as SpamCategory,
    })),
  );

const safeKeywords = ["forhire", "hiring", "remote", "onsite"];

const spamPings = ["@everyone", "@here"] as const;

/** Count how many spam pings (@everyone, @here) appear in the content */
function getPingCount(content: string): number {
  return spamPings.reduce(
    (sum, ping) => (content.includes(ping) ? sum + 1 : sum),
    0,
  );
}

/** Check if any safe keywords appear (word-boundary matching) */
function hasSafeKeywords(content: string): boolean {
  const words = content.split(/\b/);
  return words.some((w) => safeKeywords.includes(w.toLowerCase()));
}

/**
 * Detect excessive combining diacriticals (zalgo text).
 * Returns true if the message has an abnormal density of combining characters.
 */
function hasZalgoAbuse(content: string): boolean {
  // Match Unicode combining marks using property escape
  const combiningChars = content.match(/\p{M}/gu);
  if (!combiningChars) return false;
  // If combining chars are >20% of content length, it's zalgo
  return combiningChars.length > content.length * 0.2;
}

/** Count unique user mentions (not role or channel mentions) */
function getUserMentionCount(content: string): number {
  const mentions = content.match(/<@!?\d+>/g);
  return mentions ? new Set(mentions).size : 0;
}

/** Calculate what fraction of the message is links */
function getLinkRatio(content: string): number {
  const linkMatches = content.match(/https?:\/\/\S+/g);
  if (!linkMatches) return 0;
  const linkChars = linkMatches.join("").length;
  return content.length > 0 ? linkChars / content.length : 0;
}

/** Analyze message content and return scored signals */
export function analyzeContent(content: string): SpamSignal[] {
  const signals: SpamSignal[] = [];

  // Link presence
  const hasLink = content.includes("http");
  if (hasLink) {
    signals.push({ name: "has_link", score: 2, description: "Contains link" });
  }

  // Spam keyword matches
  for (const { pattern, category } of spamKeywords) {
    if (pattern.test(content)) {
      signals.push({
        name: `spam_keyword:${category}`,
        score: 1,
        description: `Spam keyword match (${category})`,
      });
    }
  }

  // @everyone / @here pings
  const pingCount = getPingCount(content);
  if (pingCount > 0) {
    signals.push({
      name: "mass_ping",
      score: pingCount * 5,
      description: `@everyone/@here ping (x${pingCount})`,
    });
  }

  // Bare discord.gg invite in short message
  if (content.includes("discord.gg") && content.length < 50) {
    signals.push({
      name: "bare_invite",
      score: 5,
      description: "Bare discord.gg invite link",
    });
  }

  // High link-to-text ratio
  if (getLinkRatio(content) > 0.5) {
    signals.push({
      name: "high_link_ratio",
      score: 3,
      description: "Message is mostly links (>50%)",
    });
  }

  // High mention density
  const mentionCount = getUserMentionCount(content);
  if (mentionCount > 3) {
    signals.push({
      name: "high_mention_density",
      score: 2,
      description: `Mass-mention pattern (${mentionCount} users)`,
    });
  }

  // Zalgo/unicode abuse
  if (hasZalgoAbuse(content)) {
    signals.push({
      name: "zalgo_abuse",
      score: 3,
      description: "Excessive combining diacriticals (zalgo text)",
    });
  }

  // Safe keywords reduce score
  if (hasSafeKeywords(content)) {
    signals.push({
      name: "safe_keyword",
      score: -10,
      description: "Contains safe keyword (hiring etc)",
    });
  }

  return signals;
}
