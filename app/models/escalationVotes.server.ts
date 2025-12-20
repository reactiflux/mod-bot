import type { Insertable, Selectable } from "kysely";

import db, { type DB } from "#~/db.server";
import { calculateTimeoutHours } from "#~/helpers/escalationVotes.js";
import type { Resolution, VotingStrategy } from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";

/**
 * Calculate the scheduled resolution time based on creation time and vote count.
 */
export function calculateScheduledFor(
  createdAt: string,
  voteCount: number,
): string {
  const timeoutHours = calculateTimeoutHours(voteCount);
  const scheduledFor = new Date(
    new Date(createdAt).getTime() + timeoutHours * 60 * 60 * 1000,
  );
  return scheduledFor.toISOString();
}

export type Escalation = Selectable<DB["escalations"]>;
export type EscalationRecord = Selectable<DB["escalation_records"]>;
type EscalationInsert = Insertable<DB["escalations"]>;

export async function createEscalation(
  data: EscalationInsert,
): Promise<EscalationInsert> {
  return trackPerformance("createEscalation", async () => {
    const createdAt = new Date().toISOString();
    const newEscalation = {
      ...data,
      // Initial scheduled_for is 36 hours from creation (0 votes)
      scheduled_for: calculateScheduledFor(createdAt, 0),
    };

    await db.insertInto("escalations").values(newEscalation).execute();

    log("info", "EscalationVotes", "Created escalation", data);
    return newEscalation;
  });
}

export async function getEscalation(id: string) {
  return trackPerformance("getEscalation", async () => {
    const escalation = await db
      .selectFrom("escalations")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return escalation;
  });
}

export async function getPendingEscalations() {
  return trackPerformance("getPendingEscalations", async () => {
    const escalations = await db
      .selectFrom("escalations")
      .selectAll()
      .where("resolved_at", "is", null)
      .execute();

    return escalations;
  });
}

export async function recordVote(data: {
  escalationId: string;
  voterId: string;
  vote: Resolution;
}): Promise<{ isNew: boolean }> {
  return trackPerformance("recordVote", async () => {
    const existingVote = await db
      .selectFrom("escalation_records")
      .selectAll()
      .where("escalation_id", "=", data.escalationId)
      .where("voter_id", "=", data.voterId)
      .execute();

    if (existingVote?.some((v) => v.vote === data.vote)) {
      log("info", "EscalationVotes", "Deleted existing vote", data);
      await db
        .deleteFrom("escalation_records")
        .where("escalation_id", "=", data.escalationId)
        .where("voter_id", "=", data.voterId)
        .where("vote", "=", data.vote)
        .execute();
      return { isNew: false };
    }

    await db
      .insertInto("escalation_records")
      .values({
        id: crypto.randomUUID(),
        escalation_id: data.escalationId,
        voter_id: data.voterId,
        vote: data.vote,
      })
      .execute();

    log("info", "EscalationVotes", "Recorded new vote", data);

    return { isNew: true };
  });
}

export async function getVotesForEscalation(escalationId: string) {
  return trackPerformance("getVotesForEscalation", async () => {
    const votes = await db
      .selectFrom("escalation_records")
      .selectAll()
      .where("escalation_id", "=", escalationId)
      .execute();

    return votes.map((v) => ({ ...v, vote: v.vote as Resolution }));
  });
}

export async function resolveEscalation(id: string, resolution: Resolution) {
  return trackPerformance("resolveEscalation", async () => {
    await db
      .updateTable("escalations")
      .set({
        resolved_at: new Date().toISOString(),
        resolution,
      })
      .where("id", "=", id)
      .execute();

    log("info", "EscalationVotes", "Resolved escalation", { id, resolution });
  });
}

export async function updateEscalationStrategy(
  id: string,
  votingStrategy: VotingStrategy,
) {
  return trackPerformance("updateEscalationStrategy", async () => {
    await db
      .updateTable("escalations")
      .set({ voting_strategy: votingStrategy })
      .where("id", "=", id)
      .execute();

    log("info", "EscalationVotes", "Updated escalation strategy", {
      id,
      votingStrategy,
    });
  });
}

export async function updateScheduledFor(
  id: string,
  scheduledFor: string,
): Promise<void> {
  return trackPerformance("updateScheduledFor", async () => {
    await db
      .updateTable("escalations")
      .set({ scheduled_for: scheduledFor })
      .where("id", "=", id)
      .execute();

    log("info", "EscalationVotes", "Updated escalation scheduled_for", {
      id,
      scheduledFor,
    });
  });
}

export async function getDueEscalations() {
  return trackPerformance("getDueEscalations", async () => {
    const escalations = await db
      .selectFrom("escalations")
      .selectAll()
      .where("resolved_at", "is", null)
      .where("scheduled_for", "<=", new Date().toISOString())
      .execute();

    return escalations;
  });
}
