/**
 * Static keyword lists for content-based spam detection.
 * Organized by category for signal explainability.
 */

export const spamKeywordsByCategory = {
  scam: ["nitro", "steam", "gift", "free", "claim", "reward"],
  nsfw: ["18+", "nudes", "onlyfans", "deepfake", "poki"],
  crypto: ["airdrop", "whitelist", "nft", "mint", "dex"],
  phishing: ["verify", "billing", "suspended", "expired"],
} as const;

export type SpamCategory = keyof typeof spamKeywordsByCategory;

/** Flat list of all spam keywords as RegExp for matching */
export const spamKeywords: { pattern: RegExp; category: SpamCategory }[] =
  Object.entries(spamKeywordsByCategory).flatMap(([category, keywords]) =>
    keywords.map((kw) => ({
      pattern: new RegExp(kw, "i"),
      category: category as SpamCategory,
    })),
  );

/** Keywords that indicate legitimate content (e.g. job posts) */
export const safeKeywords = ["forhire", "hiring", "remote", "onsite"];

/** Ping patterns that are always suspicious */
export const spamPings = ["@everyone", "@here"] as const;
