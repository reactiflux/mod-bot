import { escapeDisruptiveContent } from "./discord";

test("escapeDisruptiveContent", () => {
  expect(escapeDisruptiveContent("@everyone")).toBe("@ everyone");
  expect(escapeDisruptiveContent("@everyone ")).toBe("@ everyone ");
  expect(escapeDisruptiveContent(" @everyone")).toBe(" @ everyone");
  expect(escapeDisruptiveContent(" @everyonebutts")).toBe(" @ everyonebutts");
  expect(escapeDisruptiveContent("butts@everyone")).toBe("butts@ everyone");
  expect(escapeDisruptiveContent("butts@everyonebutts")).toBe(
    "butts@ everyonebutts",
  );

  expect(escapeDisruptiveContent("https://example.com")).toBe(
    "<https://example.com>",
  );
  expect(escapeDisruptiveContent("discord.gg/butts")).toBe(
    "<discord.gg/butts>",
  );
  expect(
    escapeDisruptiveContent(
      "some dumb text https://example.com with a link and text",
    ),
  ).toBe("some dumb text <https://example.com> with a link and text");
  expect(escapeDisruptiveContent("some dumb text https://example.com")).toBe(
    "some dumb text <https://example.com>",
  );
});
