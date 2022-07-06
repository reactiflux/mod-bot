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
});
