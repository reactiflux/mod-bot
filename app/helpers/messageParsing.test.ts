import { parseMarkdownBlocks } from "./messageParsing";

describe("markdown parser", () => {
  test("matches bare link", () => {
    const message = `bold claim (source https://trustme.bro)`;
    const result = parseMarkdownBlocks(message);
    expect(result[1]).toEqual({ type: "link", url: "https://trustme.bro" });
  });

  test("matches link with label", () => {
    const message = `check out this [link](<https://example.com>)`;
    const result = parseMarkdownBlocks(message);
    expect(result[1]).toEqual({
      type: "link",
      url: "https://example.com",
      label: "link",
    });
  });

  test("matches many links", () => {
    const message = `bare link https://asdf.com
(see also https://links.com)
* [*bold*](<https://foo.xyz>)
* [*bold*](<https://bar.xyz>)
words and things [\`foo()\`](<https://links.xom>) asdfasdf`;
    const result = parseMarkdownBlocks(message);
    const links = result.filter((x) => x.type === "link").map((x) => x.url);
    expect(links).toEqual([
      "https://asdf.com",
      "https://links.com",
      "https://foo.xyz",
      "https://bar.xyz",
      "https://links.xom",
    ]);
  });

  test("matches fenced code blocks and inline text", () => {
    const message = `here is some text

This is inline code \`foo bar\`.

ideal fenced code:

\`\`\`js
const x = 42;
for (let i = 0; i < x; i++) {
  console.log(i);
}
\`\`\``;
    const result = parseMarkdownBlocks(message);
    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({ type: "inlinecode", code: "foo bar" });
    expect(result[3].type).toEqual("fencedcode");
  });

  test("matches fenced blocks starting inside a paragraph", () => {
    const message = `sometimes i write \`\`\`sql
select 1
\`\`\` things like this`;
    const result = parseMarkdownBlocks(message);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "text", content: "sometimes i write " });
    expect(result[2]).toEqual({ type: "text", content: " things like this" });
    const block = result.find((b) => b.type === "fencedcode");
    expect(block?.lang).toEqual("sql");
    expect(block?.code).toEqual(["select 1"]);
  });

  test("handles multiple fenced blocks", () => {
    const message = `some text

sometimes i write \`\`\`sql
select 1
\`\`\` code like this

another example \`\`\`sql
select 2
\`\`\` like this`;
    const result = parseMarkdownBlocks(message);
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual({
      type: "fencedcode",
      lang: "sql",
      code: ["select 1"],
    });
    expect(result[3]).toEqual({
      type: "fencedcode",
      lang: "sql",
      code: ["select 2"],
    });
    expect(result[4]).toEqual({ type: "text", content: " like this" });
  });
});
