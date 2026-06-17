export function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateToCodePointBoundary(text: string, maxLength: number): string {
  if (maxLength === Infinity) {
    return text;
  }

  if (!Number.isFinite(maxLength)) {
    return "";
  }

  const limit = Math.max(0, Math.floor(maxLength));

  if (text.length <= limit) {
    return text;
  }

  let end = limit;

  if (endsInsideSurrogatePair(text, end)) {
    end -= 1;
  }

  return text.slice(0, end);
}

export function splitIntoSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[\u3002\uFF01\uFF1F!?])\s*|(?<=\.)\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function endsInsideSurrogatePair(text: string, end: number): boolean {
  if (end <= 0 || end >= text.length) {
    return false;
  }

  const previous = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);

  return isHighSurrogate(previous) && isLowSurrogate(next);
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}
