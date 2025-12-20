import {
  calculateTimeoutHours,
  parseFlags,
  shouldAutoResolve,
} from "./escalationVotes";

describe("calculateTimeoutHours", () => {
  // Formula: max(0, 36 - 4 * (voteCount - 1))
  it("returns the expected number of hours based on votes", () => {
    expect(calculateTimeoutHours(0)).toBe(36);
    expect(calculateTimeoutHours(1)).toBe(32);
    expect(calculateTimeoutHours(2)).toBe(28);
    expect(calculateTimeoutHours(3)).toBe(24);
    expect(calculateTimeoutHours(10)).toBe(0);
    expect(calculateTimeoutHours(11)).toBe(0);
  });

  it("never returns negative", () => {
    expect(calculateTimeoutHours(100)).toBe(0);
  });
});

describe("shouldAutoResolve", () => {
  // Formula: timeout = max(0, 36 - 4 * (voteCount - 1))
  // 0 votes = 40h, 1 vote = 36h, 2 votes = 32h, 3 votes = 28h

  it("does not resolve immediately with 0 votes", () => {
    const now = new Date().toISOString();
    expect(shouldAutoResolve(now, 0)).toBe(false);
  });

  it("resolves after a long time with 0 votes", () => {
    const aLongTime = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(aLongTime, 0)).toBe(true);
  });

  it("does not resolve early with 0 votes", () => {
    const notLong = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(notLong, 0)).toBe(false);
  });
});

describe("parseFlags", () => {
  it("parses valid JSON flags", () => {
    const flags = parseFlags(JSON.stringify({ quorum: 5 }));
    expect(flags).toEqual({ quorum: 5 });
  });

  it("returns default quorum of 3 for invalid JSON", () => {
    const flags = parseFlags("not valid json");
    expect(flags).toEqual({ quorum: 3 });
  });

  it("returns default quorum of 3 for empty string", () => {
    const flags = parseFlags("");
    expect(flags).toEqual({ quorum: 3 });
  });
});
