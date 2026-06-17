const CAPTURABLE_CONTENT_TYPE_PATTERN = /\b(json|text\/event-stream|x-ndjson|event-stream)\b/i;
const CAPTURABLE_PATH_PATTERN = /(conversation|completion|stream|generate)/i;

export function isLikelyCapturableNetworkResponse(url: string, contentType: string): boolean {
  if (!CAPTURABLE_CONTENT_TYPE_PATTERN.test(contentType)) {
    return false;
  }

  const path = readUrlPath(url);

  return path ? CAPTURABLE_PATH_PATTERN.test(path) : false;
}

function readUrlPath(url: string): string | undefined {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return undefined;
  }
}
