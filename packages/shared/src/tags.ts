const TAG_SPLIT_PATTERN = /[,;\n\uFF0C\uFF1B]+/u;

export function parseTagInput(value: string): string[] {
  return normalizeTagList(value.split(TAG_SPLIT_PATTERN));
}

export function normalizeTagList(tags: string[]): string[] {
  const normalizedTags: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    if (typeof rawTag !== "string") {
      continue;
    }

    const tag = normalizeTag(rawTag);
    const key = tag.toLowerCase();

    if (!tag || seen.has(key)) {
      continue;
    }

    normalizedTags.push(tag);
    seen.add(key);
  }

  return normalizedTags;
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").trim();
}
