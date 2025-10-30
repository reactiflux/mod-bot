export type MarkdownBlock =
  | { type: "text"; content: string }
  | { type: "link"; url: string; label?: string }
  | { type: "fencedcode"; lang: undefined | string; code: string[] }
  | { type: "inlinecode"; code: string };

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // track string position
  let idx = 0;

  const matchers = {
    fencedCode: /```[\s\S]+?\n^```/,
    inlineCode: /`.+?`/,
    mdlink: /\[([^\]]+)\]\(([^)]+)\)/,
    link: /https?:\/\/[^\s>)]+/,
  };

  // replaceAll gives easy access to the position of the match
  markdown.replaceAll(
    RegExp_or(Object.values(matchers), "gm"),
    (match, ...captured) => {
      // but it's quirky, capture groups are spread and the position and entire
      // string are at the end of the args, we pop them off to get their values
      // which leaves an array of capture groups
      const orig = captured.pop() as string;
      const position = captured.pop() as number;
      // code blocks may be preceded by text, add those first
      const prev = orig.slice(idx, position);
      idx = position;
      if (prev) blocks.push({ type: "text", content: prev });

      // if first line starts with triple backticks, it's a fenced code block
      if (match.startsWith("```")) {
        // match is fenced code, strip backticks and split by line
        const code = match.slice(3, -4).split("\n");
        const lang = code.shift();
        blocks.push({ type: "fencedcode", lang, code });
      } else if (match.startsWith("`")) {
        // match is inline code, return a string without backticks
        const code = match.slice(1, -1);
        blocks.push({ type: "inlinecode", code });
      } else if (match.startsWith("[") || match.startsWith("http")) {
        // match is a link
        const label = (captured[0] as string) || undefined;
        let url = (captured[1] as string) || match;
        // links in discord may have angle brackets around them to suppress previews
        if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
        blocks.push({ type: "link", url, label });
      } else {
        console.error("unknown match", match);
        throw new Error("Unexpected match in markdown parsing");
      }

      // update our index to the end of the match
      idx += match.length;

      // this is only here to appease TS, value is unused
      return "";
    },
  );

  // after processing all known blocks, there may be text left
  if (idx < markdown.length) {
    blocks.push({ type: "text", content: markdown.slice(idx) });
  }

  return blocks;
}

// this is better than string.split(/\s+/) because it counts emojis as 1 word
// and we can easily filter them, works much better in other languages too
const wordSegmenter = new Intl.Segmenter("en-us", { granularity: "word" });
export function getWords(content: string) {
  return Array.from(wordSegmenter.segment(content)).filter(
    (seg) => seg.isWordLike,
  );
}

// string.split(/\s+/) will count most emojis as 2+ chars
// this will count them as 1
const characterSegmenter = new Intl.Segmenter("en-us", {
  granularity: "grapheme",
});
export function getChars(content: string) {
  return Array.from(characterSegmenter.segment(content));
}

function RegExp_or(res: RegExp[], flags?: string): RegExp {
  const re = res.map((r) => r.source).join("|");
  return new RegExp(re, flags);
}
