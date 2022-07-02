import { isSpam } from "./automod";

test("isSpam has a reasonable threshold", () => {
  expect(isSpam("Hello @everyone")).toBe(true);
  expect(isSpam("free nitro 3 month https://discord-example.ru/accept")).toBe(
    true,
  );
  expect(isSpam("free nitro https://example.ru")).toBe(true);
  expect(isSpam("@everyone https://discord.gg/garbage join now")).toBe(true);
  expect(isSpam("Hello")).toBe(false);
  expect(isSpam("Hello https://google.com")).toBe(false);
  expect(isSpam("Hello https://google.com discord")).toBe(false);
  expect(
    isSpam(
      "Hey guys, I have a project where a user can purchase gift and use gift cards, so how do I store a decrypted gift url`",
    ),
  ).toBe(false);
});
