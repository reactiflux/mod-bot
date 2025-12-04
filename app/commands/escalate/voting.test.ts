import { resolutions } from "#~/helpers/modResponse";

import { tallyVotes } from "./voting";

describe("tallyVotes", () => {
  it("returns empty tally for no votes", () => {
    const result = tallyVotes([]);
    expect(result).toEqual({
      totalVotes: 0,
      byResolution: new Map(),
      leader: null,
      leaderCount: 0,
      isTied: false,
      tiedResolutions: [],
    });
  });

  it("identifies clear leader with single vote", () => {
    const votes = [{ vote: resolutions.ban, voter_id: "user1" }];
    const result = tallyVotes(votes);

    expect(result.totalVotes).toBe(1);
    expect(result.leader).toBe(resolutions.ban);
    expect(result.leaderCount).toBe(1);
    expect(result.isTied).toBe(false);
    expect(result.byResolution.get(resolutions.ban)).toEqual(["user1"]);
  });

  it("identifies clear leader with multiple votes", () => {
    const votes = [
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.ban, voter_id: "user2" },
      { vote: resolutions.kick, voter_id: "user3" },
    ];
    const result = tallyVotes(votes);

    expect(result.totalVotes).toBe(3);
    expect(result.leader).toBe(resolutions.ban);
    expect(result.leaderCount).toBe(2);
    expect(result.isTied).toBe(false);
  });

  it("detects two-way tie", () => {
    const votes = [
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.kick, voter_id: "user2" },
    ];
    const result = tallyVotes(votes);

    expect(result.totalVotes).toBe(2);
    expect(result.leader).toBeNull();
    expect(result.leaderCount).toBe(1);
    expect(result.isTied).toBe(true);
    expect(result.tiedResolutions).toContain(resolutions.ban);
    expect(result.tiedResolutions).toContain(resolutions.kick);
    expect(result.tiedResolutions).toHaveLength(2);
  });

  it("detects three-way tie", () => {
    const votes = [
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.kick, voter_id: "user2" },
      { vote: resolutions.restrict, voter_id: "user3" },
    ];
    const result = tallyVotes(votes);

    expect(result.isTied).toBe(true);
    expect(result.tiedResolutions).toHaveLength(3);
  });

  it("breaks tie when one option gets more votes", () => {
    const votes = [
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.ban, voter_id: "user2" },
      { vote: resolutions.kick, voter_id: "user3" },
      { vote: resolutions.restrict, voter_id: "user4" },
    ];
    const result = tallyVotes(votes);

    expect(result.leader).toBe(resolutions.ban);
    expect(result.isTied).toBe(false);
    expect(result.tiedResolutions).toEqual([resolutions.ban]);
  });

  it("tracks all voters per resolution", () => {
    const votes = [
      { vote: resolutions.track, voter_id: "mod1" },
      { vote: resolutions.track, voter_id: "mod2" },
      { vote: resolutions.ban, voter_id: "mod3" },
    ];
    const result = tallyVotes(votes);

    expect(result.byResolution.get(resolutions.track)).toEqual([
      "mod1",
      "mod2",
    ]);
    expect(result.byResolution.get(resolutions.ban)).toEqual(["mod3"]);
  });
});
