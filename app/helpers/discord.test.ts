import { escapeDisruptiveContent } from "./discord";

test("escapeDisruptiveContent", () => {
  expect(escapeDisruptiveContent("https://example.com")).toBe(
    "<https://example.com>",
  );
  expect(escapeDisruptiveContent("discord.gg/butts")).toBe(
    "<discord.gg/butts>",
  );
  expect(
    escapeDisruptiveContent("test stuff discord.gg/butts wrapped around"),
  ).toBe("test stuff <discord.gg/butts> wrapped around");
  expect(
    escapeDisruptiveContent(
      "some dumb text https://example.com with a link and text",
    ),
  ).toBe("some dumb text <https://example.com> with a link and text");
  expect(escapeDisruptiveContent("some dumb text https://example.com")).toBe(
    "some dumb text <https://example.com>",
  );
});
