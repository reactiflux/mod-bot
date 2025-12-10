import {
  calculateTimeoutHours,
  parseFlags,
  shouldAutoResolve,
} from "./escalationVotes";

describe("calculateTimeoutHours", () => {
  // Formula: max(0, 36 - 4 * (voteCount - 1))
  it("returns 40 hours with 0 votes", () => {
    expect(calculateTimeoutHours(0)).toBe(40);
  });

  it("returns 36 hours with 1 vote", () => {
    expect(calculateTimeoutHours(1)).toBe(36);
  });

  it("returns 32 hours with 2 votes", () => {
    expect(calculateTimeoutHours(2)).toBe(32);
  });

  it("returns 28 hours with 3 votes", () => {
    expect(calculateTimeoutHours(3)).toBe(28);
  });

  it("returns 0 hours with 10+ votes", () => {
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

  it("resolves after 40 hours with 0 votes", () => {
    const over40hAgo = new Date(Date.now() - 41 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over40hAgo, 0)).toBe(true);
  });

  it("does not resolve at 39 hours with 0 votes", () => {
    const under40hAgo = new Date(
      Date.now() - 39 * 60 * 60 * 1000,
    ).toISOString();
    expect(shouldAutoResolve(under40hAgo, 0)).toBe(false);
  });

  it("resolves after 36 hours with 1 vote", () => {
    const over36hAgo = new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over36hAgo, 1)).toBe(true);
  });

  it("does not resolve at 35 hours with 1 vote", () => {
    const under36hAgo = new Date(
      Date.now() - 35 * 60 * 60 * 1000,
    ).toISOString();
    expect(shouldAutoResolve(under36hAgo, 1)).toBe(false);
  });

  it("resolves after 32 hours with 2 votes", () => {
    const over32hAgo = new Date(Date.now() - 33 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over32hAgo, 2)).toBe(true);
  });

  it("does not resolve at 31 hours with 2 votes", () => {
    const under32hAgo = new Date(
      Date.now() - 31 * 60 * 60 * 1000,
    ).toISOString();
    expect(shouldAutoResolve(under32hAgo, 2)).toBe(false);
  });

  it("resolves after 28 hours with 3 votes", () => {
    const over28hAgo = new Date(Date.now() - 29 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over28hAgo, 3)).toBe(true);
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
