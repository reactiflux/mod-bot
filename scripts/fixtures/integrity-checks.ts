/**
 * Data consistency validation for non-production environments.
 * Identifies orphaned records, invalid values, and other data issues.
 */

import db from "./db.ts";

interface IntegrityIssue {
  table: string;
  issue: string;
  count: number;
  details?: string;
}

export async function runIntegrityChecks(): Promise<void> {
  const issues: IntegrityIssue[] = [];

  // 1. Check for orphaned guild_subscriptions (no parent guild)
  const orphanedSubscriptions = await db
    .selectFrom("guild_subscriptions")
    .leftJoin("guilds", "guilds.id", "guild_subscriptions.guild_id")
    .where("guilds.id", "is", null)
    .select("guild_subscriptions.guild_id")
    .execute();

  if (orphanedSubscriptions.length > 0) {
    issues.push({
      table: "guild_subscriptions",
      issue: "Orphaned subscriptions (no parent guild)",
      count: orphanedSubscriptions.length,
      details: orphanedSubscriptions.map((s) => s.guild_id).join(", "),
    });
  }

  // 2. Check for invalid product_tier values
  const invalidTiers = await db
    .selectFrom("guild_subscriptions")
    .where("product_tier", "not in", ["free", "paid"])
    .select(["guild_id", "product_tier"])
    .execute();

  if (invalidTiers.length > 0) {
    issues.push({
      table: "guild_subscriptions",
      issue: "Invalid product_tier values",
      count: invalidTiers.length,
      details: invalidTiers
        .map((t) => `${t.guild_id}: ${t.product_tier}`)
        .join(", "),
    });
  }

  // 3. Check for orphaned escalation_records (no parent escalation)
  const orphanedVotes = await db
    .selectFrom("escalation_records")
    .leftJoin(
      "escalations",
      "escalations.id",
      "escalation_records.escalation_id",
    )
    .where("escalations.id", "is", null)
    .select("escalation_records.escalation_id")
    .execute();

  if (orphanedVotes.length > 0) {
    issues.push({
      table: "escalation_records",
      issue: "Orphaned votes (no parent escalation)",
      count: orphanedVotes.length,
    });
  }

  // 4. Check for expired sessions that should be cleaned
  const expiredSessions = await db
    .selectFrom("sessions")
    .where("expires", "<", new Date().toISOString())
    .select(db.fn.count("id").as("count"))
    .executeTakeFirst();

  if (expiredSessions && Number(expiredSessions.count) > 0) {
    issues.push({
      table: "sessions",
      issue: "Expired sessions (should be cleaned)",
      count: Number(expiredSessions.count),
    });
  }

  // 5. Check for invalid reported_messages reason values
  const validReasons = ["anonReport", "track", "modResolution", "spam"];
  const invalidReasons = await db
    .selectFrom("reported_messages")
    .where("reason", "not in", validReasons)
    .select(["id", "reason"])
    .execute();

  if (invalidReasons.length > 0) {
    issues.push({
      table: "reported_messages",
      issue: "Invalid reason values",
      count: invalidReasons.length,
      details: [...new Set(invalidReasons.map((r) => r.reason))].join(", "),
    });
  }

  // 6. Check for message_stats with future timestamps
  const futureMessages = await db
    .selectFrom("message_stats")
    .where("sent_at", ">", Date.now())
    .select(db.fn.count("message_id").as("count"))
    .executeTakeFirst();

  if (futureMessages && Number(futureMessages.count) > 0) {
    issues.push({
      table: "message_stats",
      issue: "Messages with future timestamps",
      count: Number(futureMessages.count),
    });
  }

  // Log results
  if (issues.length === 0) {
    console.log("  Integrity checks passed - no issues found");
  } else {
    console.warn(`  Found ${issues.length} integrity issues:`);
    for (const issue of issues) {
      console.warn(
        `    - ${issue.table}: ${issue.issue} (${issue.count} records)`,
      );
      if (issue.details) {
        console.warn(`      Details: ${issue.details}`);
      }
    }
  }
}
