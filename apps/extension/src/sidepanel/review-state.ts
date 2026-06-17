import {
  applyMemoryCardStatus,
  applyMemoryCardType,
  formatSensitivitySummary,
  getEffectiveMemorySensitivity,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  normalizeTag,
  parseTagInput,
  type MemoryCard,
  type MemoryCardStatus,
  type MemoryCardType,
  type Sensitivity
} from "@contextvault/shared";

export type ReviewStatus = Extract<MemoryCardStatus, "accepted" | "rejected">;

export type MemoryTagDraftStatus = {
  tags: string[];
  tagCount: number;
  hasTooManyTags: boolean;
  hasOversizedTag: boolean;
  message?: string;
};

export type TodoOwnerDraftStatus = {
  owner: string;
  ownerLength: number;
  isTooLong: boolean;
  message?: string;
};

const TAG_SPLIT_PATTERN = /[,;\n\uFF0C\uFF1B]+/u;

export function applyReviewStatus(card: MemoryCard, status: ReviewStatus, updatedAt: string): MemoryCard {
  return applyMemoryCardStatus(card, status, updatedAt);
}

export function classifyMemoryCardDraftSensitivity(card: MemoryCard): Sensitivity {
  return getEffectiveMemorySensitivity(card);
}

export function applyMemoryCardTypeDraft(card: MemoryCard, type: MemoryCardType): MemoryCard {
  return applyMemoryCardType(card, type);
}

export function parseMemoryTagInput(value: string): string[] {
  return parseTagInput(value);
}

export function getMemoryTagDraftStatus(value: string): MemoryTagDraftStatus {
  return getMemoryTagListStatus(parseMemoryTagInput(value), splitTagDraftInput(value));
}

export function getMemoryTagListStatus(tags: string[], rawTags: string[] = tags): MemoryTagDraftStatus {
  const hasTooManyTags = tags.length > MAX_MEMORY_CARD_TAG_COUNT;
  const hasOversizedTag = rawTags.some((tag) => normalizeTag(tag).length > MAX_MEMORY_CARD_TAG_LENGTH);
  const message = hasTooManyTags
    ? `Use ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`
    : hasOversizedTag
      ? `Tags must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`
      : undefined;

  return {
    tags,
    tagCount: tags.length,
    hasTooManyTags,
    hasOversizedTag,
    ...(message ? { message } : {})
  };
}

export function getTodoOwnerDraftStatus(value: string | undefined): TodoOwnerDraftStatus {
  const owner = value?.trim() ?? "";
  const isTooLong = owner.length > MAX_MEMORY_CARD_OWNER_LENGTH;

  return {
    owner,
    ownerLength: owner.length,
    isTooLong,
    ...(isTooLong ? { message: `Owner must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer.` } : {})
  };
}

export function dateInputToIsoDate(value: string): string | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return `${normalized}T00:00:00.000Z`;
}

export function isoDateToDateInput(value: string | undefined): string {
  return value?.slice(0, 10) ?? "";
}

export function getReviewConfirmationMessage(cards: MemoryCard[], status: ReviewStatus): string | undefined {
  if (cards.length === 0) {
    return undefined;
  }

  if (status === "accepted") {
    const summary = summarizeDraftSensitivity(cards);

    if (summary.secret > 0 || summary.sensitive > 0) {
      return `Accept ${cards.length} proposed memory card(s), including ${formatSensitivitySummary(summary)}. Accepted cards are stored as long-term memory. Continue?`;
    }

    return undefined;
  }

  if (cards.length > 1) {
    return `Reject ${cards.length} proposed memory card(s)?`;
  }

  return undefined;
}

function splitTagDraftInput(value: string): string[] {
  return value.split(TAG_SPLIT_PATTERN).map((tag) => tag.trim()).filter(Boolean);
}

function summarizeDraftSensitivity(cards: MemoryCard[]): Record<Sensitivity, number> {
  return cards.reduce<Record<Sensitivity, number>>(
    (summary, card) => {
      summary[classifyMemoryCardDraftSensitivity(card)] += 1;
      return summary;
    },
    {
      normal: 0,
      sensitive: 0,
      secret: 0
    }
  );
}
