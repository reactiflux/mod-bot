/**
 * Behavioral spam analysis — pure functions, no Effect.
 * Analyzes account age, server tenure, and role state.
 */

import type { GuildMember, Message } from "discord.js";

import type { SpamSignal } from "./spamScorer.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Analyze behavioral signals from the message author and member.
 * Handles cases where member data may be incomplete.
 */
export function analyzeBehavior(
  message: Message,
  member: GuildMember,
): SpamSignal[] {
  const signals: SpamSignal[] = [];
  const now = Date.now();

  // Account age signals
  const accountAge = now - message.author.createdTimestamp;
  if (accountAge < ONE_DAY_MS) {
    signals.push({
      name: "account_age_lt_1d",
      score: 3,
      description: "Acct <1 day",
    });
  } else if (accountAge < 7 * ONE_DAY_MS) {
    signals.push({
      name: "account_age_lt_7d",
      score: 2,
      description: "Acct <7 days",
    });
  } else if (accountAge < 30 * ONE_DAY_MS) {
    signals.push({
      name: "account_age_lt_30d",
      score: 1,
      description: "Acct <30 days",
    });
  }

  // Server tenure signals
  const joinedAt = member.joinedTimestamp;
  if (joinedAt) {
    const serverTenure = now - joinedAt;
    if (serverTenure < ONE_HOUR_MS) {
      signals.push({
        name: "server_tenure_lt_1h",
        score: 3,
        description: "Joined < 1hr ago",
      });
    } else if (serverTenure < ONE_DAY_MS) {
      signals.push({
        name: "server_tenure_lt_24h",
        score: 2,
        description: "Joined < 24hrs ago",
      });
    } else if (serverTenure < 7 * ONE_DAY_MS) {
      signals.push({
        name: "server_tenure_lt_7d",
        score: 1,
        description: "Joined < 7d ago",
      });
    }
  }

  return signals;
}
