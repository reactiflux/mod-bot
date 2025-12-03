import type { Selectable } from "kysely";

import db, { type DB } from "#~/db.server";
import type { Resolution } from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";

export type Escalation = Selectable<DB["escalations"]>;
export type EscalationRecord = Selectable<DB["escalation_records"]>;

export interface EscalationFlags {
  quorum: number;
}

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
  odId: string;
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
          voter_id: data.odId,
          vote: data.vote,
        })
        .execute();

      log("info", "EscalationVotes", "Recorded new vote", {
        escalationId: data.escalationId,
        odId: data.odId,
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
          .where("voter_id", "=", data.odId)
          .execute();

        log("info", "EscalationVotes", "Updated existing vote", {
          escalationId: data.escalationId,
          odId: data.odId,
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

export interface VoteTally {
  totalVotes: number;
  byResolution: Map<Resolution, string[]>; // resolution -> voter IDs
  leader: Resolution | null;
  leaderCount: number;
  isTied: boolean;
  tiedResolutions: Resolution[];
}

interface VoteRecord {
  vote: Resolution;
  voter_id: string;
}

export function tallyVotes(votes: VoteRecord[]): VoteTally {
  const byResolution = new Map<Resolution, string[]>();

  for (const vote of votes) {
    const voters = byResolution.get(vote.vote) ?? [];
    voters.push(vote.voter_id);
    byResolution.set(vote.vote, voters);
  }

  let leader: string | null = null;
  let leaderCount = 0;
  const tiedResolutions: Resolution[] = [];

  for (const [resolution, voters] of byResolution) {
    if (voters.length > leaderCount) {
      leader = resolution;
      leaderCount = voters.length;
      tiedResolutions.length = 0;
      tiedResolutions.push(resolution);
    } else if (voters.length === leaderCount && leaderCount > 0) {
      tiedResolutions.push(resolution);
    }
  }

  const isTied = tiedResolutions.length > 1;

  return {
    totalVotes: votes.length,
    byResolution,
    leader: isTied ? null : (leader as Resolution),
    leaderCount,
    isTied,
    tiedResolutions,
  };
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

export function parseFlags(flagsJson: string): EscalationFlags {
  try {
    return JSON.parse(flagsJson) as EscalationFlags;
  } catch {
    return { quorum: 3 }; // Default
  }
}

/**
 * Calculate hours until auto-resolution based on vote count.
 * Formula: 24 - (8 * voteCount), minimum 0
 */
export function calculateTimeoutHours(voteCount: number): number {
  return Math.max(0, 24 - 8 * voteCount);
}

/**
 * Check if an escalation should auto-resolve based on time elapsed.
 */
export function shouldAutoResolve(
  createdAt: string,
  voteCount: number,
): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const hoursElapsed = (now - created) / (1000 * 60 * 60);
  const timeoutHours = calculateTimeoutHours(voteCount);

  return hoursElapsed >= timeoutHours;
}
