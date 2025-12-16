/**
 * Generates historical records for non-production environments.
 * Creates realistic-looking message_stats, reported_messages, and escalations.
 */

import { randomUUID } from "crypto";

import { FIXTURE_IDS } from "./constants.ts";
import db from "./db.ts";

const DAYS_OF_DATA = 7;
const MESSAGES_PER_DAY = 50;
const REPORTS_TOTAL = 5;
const ESCALATIONS_TOTAL = 2;

// Simple seeded random for reproducibility
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export async function generateHistoricalData(): Promise<void> {
  const random = seededRandom(42); // Fixed seed for reproducibility
  const now = Date.now();
  const guildId = FIXTURE_IDS.guilds.free.id;
  const channels = Object.values(FIXTURE_IDS.channels);

  // Generate fake user IDs for variety
  const fakeUserIds = Array.from(
    { length: 20 },
    (_, i) => `${200000000000000000 + i}`,
  );

  // 1. Generate message_stats (7 days, ~50/day)
  console.log("    Generating message_stats...");
  const messageStats: {
    message_id: string;
    author_id: string;
    guild_id: string;
    channel_id: string;
    channel_category: string;
    recipient_id: string | null;
    char_count: number;
    word_count: number;
    react_count: number;
    sent_at: number;
    code_stats: string;
    link_stats: string;
  }[] = [];

  for (let day = 0; day < DAYS_OF_DATA; day++) {
    const dayStart = now - (day + 1) * 24 * 60 * 60 * 1000;

    for (let i = 0; i < MESSAGES_PER_DAY; i++) {
      const sentAt = dayStart + Math.floor(random() * 24 * 60 * 60 * 1000);
      const authorId = fakeUserIds[Math.floor(random() * fakeUserIds.length)];
      const channelId = channels[Math.floor(random() * channels.length)];
      const wordCount = Math.floor(random() * 100) + 1;

      messageStats.push({
        message_id: `${1000000000000000000 + day * 1000 + i}`,
        author_id: authorId,
        guild_id: guildId,
        channel_id: channelId,
        channel_category: channelId.includes("0002") ? "Help" : "General",
        recipient_id: null,
        char_count: wordCount * 5,
        word_count: wordCount,
        react_count: Math.floor(random() * 5),
        sent_at: sentAt,
        code_stats: "[]",
        link_stats: "[]",
      });
    }
  }

  // Batch insert
  for (let i = 0; i < messageStats.length; i += 100) {
    await db
      .insertInto("message_stats")
      .values(messageStats.slice(i, i + 100))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  console.log(`      ${messageStats.length} message records`);

  // 2. Generate reported_messages
  console.log("    Generating reported_messages...");
  const reasons = ["anonReport", "track", "spam"] as const;

  for (let i = 0; i < REPORTS_TOTAL; i++) {
    const reportedUserId =
      fakeUserIds[Math.floor(random() * fakeUserIds.length)];
    const daysAgo = Math.floor(random() * DAYS_OF_DATA);

    await db
      .insertInto("reported_messages")
      .values({
        id: randomUUID(),
        reported_message_id: `${1100000000000000000 + i}`,
        reported_channel_id: channels[Math.floor(random() * channels.length)],
        reported_user_id: reportedUserId,
        guild_id: guildId,
        log_message_id: `${1200000000000000000 + i}`,
        log_channel_id: FIXTURE_IDS.channels.testing,
        reason: reasons[Math.floor(random() * reasons.length)],
        staff_id: null,
        staff_username: null,
        extra: null,
        created_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        deleted_at: null,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  console.log(`      ${REPORTS_TOTAL} report records`);

  // 3. Generate escalations with votes
  console.log("    Generating escalations...");

  for (let i = 0; i < ESCALATIONS_TOTAL; i++) {
    const escalationId = randomUUID();
    const reportedUserId =
      fakeUserIds[Math.floor(random() * fakeUserIds.length)];
    const initiatorId = fakeUserIds[Math.floor(random() * fakeUserIds.length)];
    const daysAgo = Math.floor(random() * DAYS_OF_DATA);
    const isResolved = random() > 0.5;

    await db
      .insertInto("escalations")
      .values({
        id: escalationId,
        guild_id: guildId,
        thread_id: `${1300000000000000000 + i}`,
        vote_message_id: `${1400000000000000000 + i}`,
        reported_user_id: reportedUserId,
        initiator_id: initiatorId,
        flags: JSON.stringify({ quorum: 3 }),
        created_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        resolved_at: isResolved
          ? new Date(now - (daysAgo - 1) * 24 * 60 * 60 * 1000).toISOString()
          : null,
        resolution: isResolved ? "ban" : null,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();

    // Add 2-4 votes per escalation
    const voteCount = 2 + Math.floor(random() * 3);
    for (let v = 0; v < voteCount; v++) {
      const voterId = fakeUserIds[Math.floor(random() * fakeUserIds.length)];
      await db
        .insertInto("escalation_records")
        .values({
          id: randomUUID(),
          escalation_id: escalationId,
          voter_id: voterId,
          vote: ["ban", "kick", "warn"][Math.floor(random() * 3)],
          voted_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
  console.log(`      ${ESCALATIONS_TOTAL} escalations with votes`);
}
