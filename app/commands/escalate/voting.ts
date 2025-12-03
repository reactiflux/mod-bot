import type { Resolution } from "#~/helpers/modResponse";

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

  let leader: Resolution | null = null;
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
    leader: isTied ? null : leader,
    leaderCount,
    isTied,
    tiedResolutions,
  };
}
