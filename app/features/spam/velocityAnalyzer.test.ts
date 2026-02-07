import type { RecentMessage } from "./recentActivityTracker";
import { analyzeVelocity } from "./velocityAnalyzer";

const makeMessage = (
  overrides: Partial<RecentMessage> = {},
): RecentMessage => ({
  messageId: `msg-${Math.random()}`,
  channelId: "channel-1",
  contentHash: "hello world",
  timestamp: Date.now(),
  hasLink: false,
  ...overrides,
});

test("detects channel hopping (3+ channels in 60 seconds)", () => {
  const now = Date.now();
  const messages: RecentMessage[] = [
    makeMessage({ channelId: "ch-1", timestamp: now - 10000 }),
    makeMessage({ channelId: "ch-2", timestamp: now - 5000 }),
    makeMessage({ channelId: "ch-3", timestamp: now - 1000 }),
  ];

  const signals = analyzeVelocity(messages, "new content");
  const hopSignal = signals.find((s) => s.name === "channel_hop_fast");
  expect(hopSignal).toBeDefined();
  expect(hopSignal!.score).toBe(4);
});

test("does not flag normal channel usage", () => {
  const now = Date.now();
  const messages: RecentMessage[] = [
    makeMessage({ channelId: "ch-1", timestamp: now - 10000 }),
    makeMessage({ channelId: "ch-2", timestamp: now - 5000 }),
  ];

  const signals = analyzeVelocity(messages, "new content");
  expect(signals.find((s) => s.name === "channel_hop_fast")).toBeUndefined();
});

test("detects duplicate messages", () => {
  const now = Date.now();
  const hash = "same content hash";
  const messages: RecentMessage[] = [
    makeMessage({ contentHash: hash, timestamp: now - 30000 }),
    makeMessage({ contentHash: hash, timestamp: now - 15000 }),
  ];

  const signals = analyzeVelocity(messages, hash);
  const dupSignal = signals.find((s) => s.name === "duplicate_messages");
  expect(dupSignal).toBeDefined();
  expect(dupSignal!.score).toBe(5);
});

test("detects rapid-fire messaging", () => {
  const now = Date.now();
  const messages: RecentMessage[] = Array.from({ length: 5 }, (_, i) =>
    makeMessage({ timestamp: now - i * 5000, contentHash: `msg-${i}` }),
  );

  const signals = analyzeVelocity(messages, "new content");
  const rapidSignal = signals.find((s) => s.name === "rapid_fire");
  expect(rapidSignal).toBeDefined();
  expect(rapidSignal!.score).toBe(3);
});

test("does not flag normal messaging pace", () => {
  const now = Date.now();
  const messages: RecentMessage[] = [
    makeMessage({ timestamp: now - 60000, contentHash: "a" }),
    makeMessage({ timestamp: now - 45000, contentHash: "b" }),
  ];

  const signals = analyzeVelocity(messages, "new content");
  expect(signals.find((s) => s.name === "rapid_fire")).toBeUndefined();
  expect(signals.find((s) => s.name === "duplicate_messages")).toBeUndefined();
});
