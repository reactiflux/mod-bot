import type { Selectable } from "kysely";

import db, { type DB } from "#~/db.server";
import type { EscalationFlags } from "#~/helpers/escalationVotes.js";
import type { Resolution, VotingStrategy } from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";

export type Escalation = Selectable<DB["escalations"]>;
export type EscalationRecord = Selectable<DB["escalation_records"]>;

export async function createEscalation(data: {
  id: `${string}-${string}-${string}-${string}-${string}`;
  guildId: Escalation["guild_id"];
  threadId: Escalation["thread_id"];
  voteMessageId: Escalation["vote_message_id"];
  reportedUserId: Escalation["reported_user_id"];
  initiatorId: Escalation["initiator_id"];
  quorum: number;
  votingStrategy?: VotingStrategy | null;
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
        initiator_id: data.initiatorId,
        flags: JSON.stringify(flags),
        voting_strategy: data.votingStrategy ?? null,
      })
      .execute();

    log("info", "EscalationVotes", "Created escalation", {
      id,
      guildId: data.guildId,
      reportedUserId: data.reportedUserId,
      votingStrategy: data.votingStrategy,
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
