const NORMALIZED_CODEPOINTS = /[\u0300-\u036f]/g;
const EMOJI_RANGE =
  /[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g;
const SPECIAL_CHARACTERS =
  /[≤≥¯˘÷¿…“”‘’«»–—≠±ºª•¶§∞¢£™¡`~`∑´®†¨ˆØ∏\-=_<>,;'"[\]\\{}|!@#$%^*()]/g;
export const simplifyString = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(NORMALIZED_CODEPOINTS, "")
    .replace(EMOJI_RANGE, "")
    .replace(SPECIAL_CHARACTERS, "");

export const truncateMessage = (
  content: string,
  // Discord's limit for message length
  maxLength = 2000,
) => {
  if (content.length > maxLength)
    return `${content.trim().slice(0, maxLength - 1)}…`;

  return content;
};
