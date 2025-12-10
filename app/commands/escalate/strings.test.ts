import { tallyVotes, type VoteTally } from "#~/commands/escalate/voting";
import { resolutions } from "#~/helpers/modResponse";

import {
  buildConfirmedMessageContent,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./strings";

const emptyTally: VoteTally = tallyVotes([]);

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
  const reportedUserId = "123456789";
  const initiatorId = "987654321";
  const modRoleId = "564738291";
  const createdAt = new Date("2024-01-01T12:00:00Z").toISOString();

  it("shows vote count toward quorum", () => {
    const result = buildVoteMessageContent(
      modRoleId,

      initiatorId,
      reportedUserId,
      emptyTally,
      3,
      createdAt,
    );

    expect(result).toMatch(/0 vote.*quorum at 3/);
    expect(result).not.toMatch("null");
  });

  it("mentions the reported user", () => {
    const result = buildVoteMessageContent(
      modRoleId,

      initiatorId,
      reportedUserId,
      emptyTally,
      3,
      createdAt,
    );

    expect(result).toContain(`<@${reportedUserId}>`);
  });

  it("shows quorum reached status when votes >= quorum", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const result = buildVoteMessageContent(
      modRoleId,
      initiatorId,
      reportedUserId,
      tally,
      3,
      createdAt,
    );

    expect(result).toContain("Quorum reached");
    expect(result).toContain("Ban");
  });

  it("shows tied status when quorum reached but tied", () => {
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
      initiatorId,
      reportedUserId,
      tally,
      3,
      createdAt,
    );

    expect(result).toContain("Tied between");
    expect(result).toContain("tiebreaker");
  });

  it("includes Discord timestamp", () => {
    const result = buildVoteMessageContent(
      modRoleId,

      initiatorId,
      reportedUserId,
      emptyTally,
      3,
      createdAt,
    );

    expect(result).toMatch(/<t:\d+:R>/);
  });
});

describe("buildConfirmedMessageContent", () => {
  const reportedUserId = "123456789";
  const createdAt = new Date("2024-01-01T12:00:00Z").toISOString();

  it("shows the confirmed resolution", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      reportedUserId,
      resolutions.ban,
      tally,
      createdAt,
    );

    expect(result).toContain("Ban");
    expect(result).toContain("✅");
  });

  it("mentions the reported user", () => {
    const tally = tallyVotes([
      { vote: resolutions.kick, voter_id: "u1" },
      { vote: resolutions.kick, voter_id: "u2" },
      { vote: resolutions.kick, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      reportedUserId,
      resolutions.kick,
      tally,
      createdAt,
    );

    expect(result).toContain(`<@${reportedUserId}>`);
  });

  it("shows execution timestamp", () => {
    const tally = tallyVotes([
      { vote: resolutions.track, voter_id: "u1" },
      { vote: resolutions.track, voter_id: "u2" },
      { vote: resolutions.track, voter_id: "u3" },
    ]);
    const result = buildConfirmedMessageContent(
      reportedUserId,
      resolutions.track,
      tally,
      createdAt,
    );

    expect(result).toContain("Executes");
    expect(result).toMatch(/<t:\d+:R>/);
  });

  it("includes vote record", () => {
    const tally = tallyVotes([
      { vote: resolutions.restrict, voter_id: "mod1" },
      { vote: resolutions.restrict, voter_id: "mod2" },
      { vote: resolutions.kick, voter_id: "mod3" },
    ]);
    const result = buildConfirmedMessageContent(
      reportedUserId,
      resolutions.restrict,
      tally,
      createdAt,
    );

    expect(result).toContain("<@mod1>");
    expect(result).toContain("<@mod2>");
    expect(result).toContain("<@mod3>");
  });
});
