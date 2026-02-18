import { computeVerdict, type SpamSignal } from "./spamScorer";

const signal = (name: string, score: number): SpamSignal => ({
  name,
  score,
  description: `test signal ${name}`,
});

test("scores below 6 are tier none", () => {
  const verdict = computeVerdict([signal("a", 2), signal("b", 3)]);
  expect(verdict.tier).toBe("none");
  expect(verdict.totalScore).toBe(5);
});

test("scores 6-9 are tier low", () => {
  const verdict = computeVerdict([signal("a", 3), signal("b", 3)]);
  expect(verdict.tier).toBe("low");
  expect(verdict.totalScore).toBe(6);
});

test("scores 10-14 are tier medium", () => {
  const verdict = computeVerdict([signal("a", 5), signal("b", 5)]);
  expect(verdict.tier).toBe("medium");
  expect(verdict.totalScore).toBe(10);
});

test("scores 15+ are tier high", () => {
  const verdict = computeVerdict([signal("a", 8), signal("b", 8)]);
  expect(verdict.tier).toBe("high");
  expect(verdict.totalScore).toBe(16);
});

test("scores 100+ are tier honeypot", () => {
  const verdict = computeVerdict([signal("honeypot", 100)]);
  expect(verdict.tier).toBe("honeypot");
});

test("negative scores reduce total", () => {
  const verdict = computeVerdict([signal("spam", 5), signal("safe", -10)]);
  expect(verdict.totalScore).toBe(-5);
  expect(verdict.tier).toBe("none");
});

test("zero-score signals are excluded from verdict signals", () => {
  const verdict = computeVerdict([signal("a", 5), signal("b", 0)]);
  expect(verdict.signals).toHaveLength(1);
  expect(verdict.signals[0].name).toBe("a");
});

test("summary includes signal names with scores", () => {
  const verdict = computeVerdict([
    signal("has_link", 2),
    signal("spam_keyword", 1),
  ]);
  expect(verdict.summary).toContain("has_link (+2)");
  expect(verdict.summary).toContain("spam_keyword (+1)");
});

test("typical spam scenario: link + keyword + new account + just joined = medium", () => {
  // This validates the plan's threshold reasoning:
  // link(+2) + keyword(+1) + keyword(+1) = 4 => none (intentional)
  // But add new account(+3) + just joined(+3) = 10 => medium
  const verdict = computeVerdict([
    signal("has_link", 2),
    signal("spam_keyword:scam", 1),
    signal("spam_keyword:crypto", 1),
    signal("account_age_lt_1d", 3),
    signal("server_tenure_lt_1h", 3),
  ]);
  expect(verdict.tier).toBe("medium");
  expect(verdict.totalScore).toBe(10);
});
