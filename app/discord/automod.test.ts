import { isSpam } from "./automod";

vi.mock("#~/helpers/env.server");

test("isSpam has a reasonable threshold", () => {
  expect(isSpam("Hello @everyone")).toBe(true);
  expect(isSpam("@everyone https://discord.gg/garbage join now")).toBe(true);
  expect(isSpam("https://discord.gg/garbage join now")).toBe(true);
  expect(
    isSpam("<https://example.net/1234/poki-private-stream poki deepfakes lol"),
  ).toBe(true);
  expect(isSpam("Hello")).toBe(false);
  expect(isSpam("Hello https://google.com")).toBe(false);
  expect(isSpam("Hello https://google.com discord")).toBe(false);
  expect(
    isSpam(
      "Hey guys, I have a project where a user can purchase gift and use gift cards, so how do I store a decrypted gift url`",
    ),
  ).toBe(false);
  expect(isSpam("free free free free free")).toBe(false);
});
