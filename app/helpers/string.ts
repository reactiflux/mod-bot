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

// Discord's limit for message length
const maxMessageLength = 2000;
export const truncateMessage = (
  content: string,
  maxLength = maxMessageLength - 300,
) => {
  if (content.length > maxLength) return `${content.slice(0, maxLength)}…`;

  return content;
};
