export type MarkdownBlock =
  | { type: "fenced"; lang: undefined | string; content: string[] }
  | { type: "inline"; content: string }
  | { type: "text"; content: string };

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // track string position
  let idx = 0;

  // replaceAll gives easy access to the position of the match
  content.replaceAll(/```[\s\S]+?\n^```|`.+?`/gm, (match, position) => {
    // code blocks may be preceded by text, add those first
    const prev = content.slice(idx, position);
    idx = position;
    if (prev) blocks.push({ type: "text", content: prev });

    // split the code block into lines for easier processing
    const codeText = content.slice(idx, idx + match.length).split("\n");
    // if first line starts with triple backticks, it's a fenced code block
    if (codeText[0].startsWith("```")) {
      // everything after backticks is language specifier
      const lang = codeText[0].slice(3) || undefined;
      const content = codeText.slice(1, -1); // strip fenced backticks
      blocks.push({ type: "fenced", lang, content });
    } else {
      // must be inline code, return a single string without backticks
      const content = codeText.join("\n").slice(1, -1);
      blocks.push({ type: "inline", content });
    }

    // update our index to the end of the match
    idx += match.length;

    // this is only here to appease TS, value is unused
    return "";
  });

  // after processing all code blocks, there may be text left
  if (idx < content.length) {
    blocks.push({ type: "text", content: content.slice(idx) });
  }

  return blocks;
}

// this is better than string.split(/\s+/) because it counts emojis as 1 word
// and we can easily filter them, works much better in other languages too
export function getWords(content: string) {
  return Array.from(
    new Intl.Segmenter("en-us", { granularity: "word" }).segment(content),
  ).filter((seg) => seg.isWordLike);
}

// string.split(/\s+/) will count most emojis as 2+ chars
// this will count them as 1
export function getChars(content: string) {
  return Array.from(
    new Intl.Segmenter("en-us", { granularity: "grapheme" }).segment(content),
  );
}
