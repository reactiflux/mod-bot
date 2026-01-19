import { tallyVotes, type VoteTally } from "#~/commands/escalate/voting";
import type { Escalation } from "#~/effects/services/Escalation";
import { resolutions } from "#~/helpers/modResponse";

import {
  buildConfirmedMessageContent,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./strings";

const emptyTally: VoteTally = tallyVotes([]);

// Helper to create mock escalation objects for testing
function createMockEscalation(overrides: Partial<Escalation> = {}): Escalation {
  const createdAt = new Date("2024-01-01T12:00:00Z").toISOString();
  const scheduledFor = new Date("2024-01-02T12:00:00Z").toISOString(); // 24h later
  return {
    id: "test-escalation-id",
    guild_id: "test-guild",
    thread_id: "test-thread",
    vote_message_id: "test-message",
    reported_user_id: "123456789",
    initiator_id: "987654321",
    flags: JSON.stringify({ quorum: 3 }),
    created_at: createdAt,
    resolved_at: null,
    resolution: null,
    voting_strategy: null,
    scheduled_for: scheduledFor,
    ...overrides,
  };
}

describe("buildVotesListContent", () => {
  it("returns empty string for no votes", () => {
    const result = buildVotesListContent(emptyTally);
    expect(result).toBe("");
  });

  it("lists votes with voter mentions", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.ban, voter_id: "user2" },
    ]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("Ban");
    expect(result).toContain("<@user1>");
    expect(result).toContain("<@user2>");
  });

  it("lists multiple resolutions", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.kick, voter_id: "user2" },
    ]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("Ban");
    expect(result).toContain("Kick");
  });

  it("uses small text formatting", () => {
    const tally = tallyVotes([{ vote: resolutions.track, voter_id: "mod1" }]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("-#");
  });
});

describe("buildVoteMessageContent", () => {
  const modRoleId = "564738291";

  it("shows vote count toward quorum", () => {
    const escalation = createMockEscalation();
    const result = buildVoteMessageContent(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
    );

    expect(result).toMatch(/0 vote.*quorum at 3/);
    expect(result).not.toMatch("null");
  });

  it("mentions the reported user", () => {
    const escalation = createMockEscalation();
    const result = buildVoteMessageContent(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
    );

    expect(result).toContain(`<@${escalation.reported_user_id}>`);
  });

  it("shows quorum reached status when votes >= quorum", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const result = buildVoteMessageContent(
      modRoleId,
      "simple",
      escalation,
      tally,
    );

    expect(result).toContain("Quorum reached");
    expect(result).toContain("Ban");
  });

  it("shows tied status when quorum reached but tied", () => {
    const escalation = createMockEscalation();
    // Need 3+ votes for each option to reach quorum while tied
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
      { vote: resolutions.kick, voter_id: "u4" },
      { vote: resolutions.kick, voter_id: "u5" },
      { vote: resolutions.kick, voter_id: "u6" },
    ]);
    const result = buildVoteMessageContent(
      modRoleId,
      "simple",
      escalation,
      tally,
    );

    expect(result).toContain("Tied between");
    expect(result).toContain("tiebreaker");
  });

  it("includes Discord timestamp", () => {
    const escalation = createMockEscalation();
    const result = buildVoteMessageContent(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
    );

    expect(result).toMatch(/<t:\d+:R>/);
  });
});

describe("buildConfirmedMessageContent", () => {
  it("shows the confirmed resolution", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      escalation,
      resolutions.ban,
      tally,
    );

    expect(result).toContain("Ban");
    expect(result).toContain("✅");
  });

  it("mentions the reported user", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.kick, voter_id: "u1" },
      { vote: resolutions.kick, voter_id: "u2" },
      { vote: resolutions.kick, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      escalation,
      resolutions.kick,
      tally,
    );

    expect(result).toContain(`<@${escalation.reported_user_id}>`);
  });

  it("shows execution timestamp", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.track, voter_id: "u1" },
      { vote: resolutions.track, voter_id: "u2" },
      { vote: resolutions.track, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      escalation,
      resolutions.track,
      tally,
    );

    expect(result).toContain("Executes");
    expect(result).toMatch(/<t:\d+:R>/);
  });

  it("includes vote record", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.restrict, voter_id: "mod1" },
      { vote: resolutions.restrict, voter_id: "mod2" },
      { vote: resolutions.kick, voter_id: "mod3" },
    ]);
    const result = buildConfirmedMessageContent(
      escalation,
      resolutions.restrict,
      tally,
    );

    expect(result).toContain("<@mod1>");
    expect(result).toContain("<@mod2>");
    expect(result).toContain("<@mod3>");
  });
});
