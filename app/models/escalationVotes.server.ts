import type { Selectable } from "kysely";

import db, { type DB } from "#~/db.server";
import type { EscalationFlags } from "#~/helpers/escalationVotes.js";
import type { Resolution } from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";

export type Escalation = Selectable<DB["escalations"]>;
export type EscalationRecord = Selectable<DB["escalation_records"]>;

export async function createEscalation(data: {
  id: `${string}-${string}-${string}-${string}-${string}`;
  guildId: string;
  threadId: string;
  voteMessageId: string;
  reportedUserId: string;
  quorum: number;
}): Promise<string> {
  return trackPerformance("createEscalation", async () => {
    const id = data.id;
    const flags: EscalationFlags = { quorum: data.quorum };

    await db
      .insertInto("escalations")
      .values({
        id,
        guild_id: data.guildId,
        thread_id: data.threadId,
        vote_message_id: data.voteMessageId,
        reported_user_id: data.reportedUserId,
        flags: JSON.stringify(flags),
      })
      .execute();

    log("info", "EscalationVotes", "Created escalation", {
      id,
      guildId: data.guildId,
      reportedUserId: data.reportedUserId,
    });

    return id;
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
    const id = crypto.randomUUID();

    try {
      // Try to insert new vote
      await db
        .insertInto("escalation_records")
        .values({
          id,
          escalation_id: data.escalationId,
          voter_id: data.voterId,
          vote: data.vote,
        })
        .execute();

      log("info", "EscalationVotes", "Recorded new vote", {
        escalationId: data.escalationId,
        odId: data.voterId,
        vote: data.vote,
      });

      return { isNew: true };
    } catch (error) {
      // Unique constraint violation - update existing vote
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        await db
          .updateTable("escalation_records")
          .set({ vote: data.vote, voted_at: new Date().toISOString() })
          .where("escalation_id", "=", data.escalationId)
          .where("voter_id", "=", data.voterId)
          .execute();

        log("info", "EscalationVotes", "Updated existing vote", {
          escalationId: data.escalationId,
          odId: data.voterId,
          vote: data.vote,
        });

        return { isNew: false };
      }
      throw error;
    }
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
