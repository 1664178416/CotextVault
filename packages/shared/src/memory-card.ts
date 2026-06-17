import type { MemoryCard, MemoryCardStatus, MemoryCardType, MemoryScope, Sensitivity, SourceAnchor } from "./types";
import { normalizeTagList } from "./tags";

const MEMORY_CARD_TYPES = new Set<MemoryCardType>([
  "project_fact",
  "decision",
  "todo",
  "preference",
  "method",
  "citation_anchor"
]);
const MEMORY_CARD_STATUSES = new Set<MemoryCardStatus>([
  "proposed",
  "accepted",
  "rejected",
  "archived",
  "superseded"
]);
const MEMORY_SCOPES = new Set<MemoryScope>(["global", "project", "conversation"]);
const SENSITIVITIES = new Set<Sensitivity>(["normal", "sensitive", "secret"]);

export function normalizeMemoryCard(card: MemoryCard): MemoryCard {
  return normalizeMemoryCardForStatus(normalizeMemoryCardForType(normalizeMemoryCardTags(card)));
}

export function compareMemoryCardsForRecall(a: MemoryCard, b: MemoryCard): number {
  return (
    compareDesc(recallTimestamp(a), recallTimestamp(b)) ||
    compareDesc(a.updatedAt, b.updatedAt) ||
    compareDesc(a.createdAt, b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function sortMemoryCardsForRecall(cards: MemoryCard[]): MemoryCard[] {
  return cards.map(getSafeMemoryCardForRead).sort(compareMemoryCardsForRecall);
}

export function getSafeMemoryCardForRead(card: unknown): MemoryCard {
  const value: Record<string, unknown> = isRecord(card) ? card : {};
  const safeCard: MemoryCard = {
    id: getStringOr(value.id, "unknown-card"),
    type: isSupportedValue(value.type, MEMORY_CARD_TYPES) ? value.type : "project_fact",
    title: getStringOr(value.title, "Untitled memory"),
    body: getStringOr(value.body, ""),
    status: isSupportedValue(value.status, MEMORY_CARD_STATUSES) ? value.status : "proposed",
    scope: isSupportedValue(value.scope, MEMORY_SCOPES) ? value.scope : "conversation",
    sensitivity: isSupportedValue(value.sensitivity, SENSITIVITIES) ? value.sensitivity : "normal",
    tags: Array.isArray(value.tags) ? normalizeTagList(value.tags.filter(isString)) : [],
    createdAt: getStringOr(value.createdAt, ""),
    updatedAt: getStringOr(value.updatedAt, ""),
    sourceAnchors: getSafeSourceAnchors({ sourceAnchors: value.sourceAnchors })
  };

  return {
    ...safeCard,
    ...(typeof value.batchId === "string" ? { batchId: value.batchId } : {}),
    ...(typeof value.projectId === "string" ? { projectId: value.projectId } : {}),
    ...(typeof value.acceptedAt === "string" ? { acceptedAt: value.acceptedAt } : {}),
    ...(typeof value.dueAt === "string" ? { dueAt: value.dueAt } : {}),
    ...(typeof value.owner === "string" ? { owner: value.owner } : {}),
    ...(typeof value.confidence === "number" && Number.isFinite(value.confidence) ? { confidence: value.confidence } : {})
  };
}

export function getSafeSourceAnchors(card: { sourceAnchors?: unknown }): SourceAnchor[] {
  if (!Array.isArray(card.sourceAnchors)) {
    return [];
  }

  return card.sourceAnchors.flatMap((anchor) => {
    if (!isRecord(anchor) || !isRequiredAnchorString(anchor.id) || !isRequiredAnchorString(anchor.archiveId) || !isRequiredAnchorString(anchor.turnId)) {
      return [];
    }

    const charSpan = getSafeSourceAnchorSpan(anchor);
    const quote = typeof anchor.quote === "string" && anchor.quote.length > 0 ? { quote: anchor.quote } : {};

    return [
      {
        id: anchor.id,
        archiveId: anchor.archiveId,
        turnId: anchor.turnId,
        ...charSpan,
        ...quote
      }
    ];
  });
}

export function normalizeMemoryCardForType(card: MemoryCard): MemoryCard {
  if (card.type === "todo") {
    return card;
  }

  const { dueAt, owner, ...rest } = card;
  return rest;
}

export function normalizeMemoryCardForStatus(card: MemoryCard): MemoryCard {
  if (card.status === "accepted") {
    return card.acceptedAt ? card : { ...card, acceptedAt: card.updatedAt };
  }

  const { acceptedAt, ...rest } = card;
  return rest;
}

export function applyMemoryCardType(card: MemoryCard, type: MemoryCardType): MemoryCard {
  return normalizeMemoryCard({
    ...card,
    type
  });
}

export function applyMemoryCardStatus(
  card: MemoryCard,
  status: MemoryCardStatus,
  updatedAt: string
): MemoryCard {
  return normalizeMemoryCard({
    ...card,
    status,
    acceptedAt: status === "accepted" ? card.acceptedAt ?? updatedAt : card.acceptedAt,
    updatedAt
  });
}

function normalizeMemoryCardTags(card: MemoryCard): MemoryCard {
  return {
    ...card,
    tags: normalizeTagList(card.tags)
  };
}

function recallTimestamp(card: MemoryCard): string {
  if (card.status === "accepted") {
    return card.acceptedAt ?? card.updatedAt;
  }

  return card.updatedAt;
}

function compareDesc(a: string, b: string): number {
  if (a > b) {
    return -1;
  }

  if (a < b) {
    return 1;
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function getStringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function isSupportedValue<T extends string>(value: unknown, supportedValues: Set<T>): value is T {
  return typeof value === "string" && supportedValues.has(value as T);
}

function isRequiredAnchorString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getSafeSourceAnchorSpan(anchor: Record<string, unknown>): Pick<SourceAnchor, "charStart" | "charEnd"> {
  const { charStart, charEnd } = anchor;

  return isSourceAnchorBoundary(charStart) && isSourceAnchorBoundary(charEnd) && charEnd > charStart
    ? { charStart, charEnd }
    : {};
}

function isSourceAnchorBoundary(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
