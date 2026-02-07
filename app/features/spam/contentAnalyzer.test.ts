import { analyzeContent } from "./contentAnalyzer";
import { computeVerdict } from "./spamScorer";

/** Helper: run content through the full scoring pipeline */
const getVerdict = (content: string) => computeVerdict(analyzeContent(content));

test("content analysis produces correct tiers for known spam patterns", () => {
  // @everyone alone = +5, which is "none" (threshold is 6 for low)
  // but the old isSpam had threshold 4, so "Hello @everyone" was spam.
  // With new system: "Hello @everyone" = mass_ping(+5) = 5 = none
  // This is intentional — behavioral signals would push it higher for real spammers

  // Bare invite in short message = +5 (bare_invite) + 2 (has_link) = 7 => low
  expect(
    getVerdict("@everyone https://discord.gg/garbage join now").tier,
  ).not.toBe("none");

  // Bare discord.gg invite = +5 (bare_invite) + 2 (has_link) = 7 => low
  expect(getVerdict("https://discord.gg/garbage join now").tier).not.toBe(
    "none",
  );

  // Multiple spam keywords + link = high signals
  expect(
    getVerdict(
      "<https://example.net/1234/poki-private-stream poki deepfakes lol",
    ).tier,
  ).not.toBe("none");
});

test("content analysis does not flag legitimate messages", () => {
  expect(getVerdict("Hello").tier).toBe("none");
  expect(getVerdict("Hello https://google.com").tier).toBe("none");
  expect(getVerdict("Hello https://google.com discord").tier).toBe("none");

  // Gift card discussion with safe context
  expect(
    getVerdict(
      "Hey guys, I have a project where a user can purchase gift and use gift cards, so how do I store a decrypted gift url`",
    ).tier,
  ).toBe("none");

  // Repeated harmless word
  expect(getVerdict("free free free free free").tier).toBe("none");

  // URL with no spam keywords
  expect(
    getVerdict("https://example.com//w1280$%7Btrend.backdrop_path").tier,
  ).toBe("none");
});

test("content signals are correctly identified", () => {
  const signals = analyzeContent("Check out https://example.com nitro free");
  const names = signals.map((s) => s.name);

  expect(names).toContain("has_link");
  expect(names).toContain("spam_keyword:scam"); // nitro, free
});

test("safe keywords reduce score", () => {
  const signals = analyzeContent(
    "We are hiring! Check https://jobs.example.com for details",
  );
  const safeSignal = signals.find((s) => s.name === "safe_keyword");
  expect(safeSignal).toBeDefined();
  expect(safeSignal!.score).toBe(-10);
});

test("zalgo detection works", () => {
  // Normal text: no zalgo
  expect(
    analyzeContent("Hello world").find((s) => s.name === "zalgo_abuse"),
  ).toBeUndefined();

  // Zalgo text: lots of combining characters
  const zalgo = "H̵̢̧̛̗̘̙̜̝̞̟̠̣̤̥̦̩e̵̢̧̛̗̘̙̜l̵̢̧̛̗̘̙l̵o̵";
  expect(
    analyzeContent(zalgo).find((s) => s.name === "zalgo_abuse"),
  ).toBeDefined();
});

test("mass ping detection", () => {
  const signals = analyzeContent("@everyone @here check this out");
  const pingSignal = signals.find((s) => s.name === "mass_ping");
  expect(pingSignal).toBeDefined();
  expect(pingSignal!.score).toBe(10); // 2 pings * 5
});

test("high link ratio detection", () => {
  // Message that is >50% links
  const signals = analyzeContent(
    "https://spam1.com https://spam2.com https://spam3.com hi",
  );
  const linkRatioSignal = signals.find((s) => s.name === "high_link_ratio");
  expect(linkRatioSignal).toBeDefined();
});
