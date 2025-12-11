import {
  calculateTimeoutHours,
  parseFlags,
  shouldAutoResolve,
} from "./escalationVotes";

describe("calculateTimeoutHours", () => {
  it("returns 24 hours with 0 votes", () => {
    expect(calculateTimeoutHours(0)).toBe(24);
  });

  it("returns 16 hours with 1 vote", () => {
    expect(calculateTimeoutHours(1)).toBe(16);
  });

  it("returns 8 hours with 2 votes", () => {
    expect(calculateTimeoutHours(2)).toBe(8);
  });

  it("returns 0 hours with 3+ votes (quorum)", () => {
    expect(calculateTimeoutHours(3)).toBe(0);
    expect(calculateTimeoutHours(4)).toBe(0);
    expect(calculateTimeoutHours(10)).toBe(0);
  });

  it("never returns negative", () => {
    expect(calculateTimeoutHours(100)).toBe(0);
  });
});

describe("shouldAutoResolve", () => {
  it("resolves immediately with 3+ votes (0 hour timeout)", () => {
    const now = new Date().toISOString();
    expect(shouldAutoResolve(now, 3)).toBe(true);
  });

  it("does not resolve immediately with 0 votes", () => {
    const now = new Date().toISOString();
    expect(shouldAutoResolve(now, 0)).toBe(false);
  });

  it("resolves after 24 hours with 0 votes", () => {
    const over24hAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over24hAgo, 0)).toBe(true);
  });

  it("does not resolve at 23 hours with 0 votes", () => {
    const under24hAgo = new Date(
      Date.now() - 23 * 60 * 60 * 1000,
    ).toISOString();
    expect(shouldAutoResolve(under24hAgo, 0)).toBe(false);
  });

  it("resolves after 16 hours with 1 vote", () => {
    const over16hAgo = new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over16hAgo, 1)).toBe(true);
  });

  it("does not resolve at 15 hours with 1 vote", () => {
    const under16hAgo = new Date(
      Date.now() - 15 * 60 * 60 * 1000,
    ).toISOString();
    expect(shouldAutoResolve(under16hAgo, 1)).toBe(false);
  });

  it("resolves after 8 hours with 2 votes", () => {
    const over8hAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoResolve(over8hAgo, 2)).toBe(true);
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
