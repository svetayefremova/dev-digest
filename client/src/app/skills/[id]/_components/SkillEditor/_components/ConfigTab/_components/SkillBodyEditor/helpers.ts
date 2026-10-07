import { CHARS_PER_TOKEN } from "./constants";

/** Client-side token estimate for an unsaved body (the server's tokenizer gives
    the exact count once it is saved). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const HEADING = /^#{1,2}\s/;
const FENCE = /^\s*(```|~~~)/;

/** Per line: is it a markdown `#` / `##` heading? Lines inside a fenced code
    block are never headings (a `# comment` in a shell snippet is not one). */
export function markHeadingLines(lines: readonly string[]): boolean[] {
  let fenced = false;
  return lines.map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced && HEADING.test(line);
  });
}
