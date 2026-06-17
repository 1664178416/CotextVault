import {
  classifySensitivity,
  getSafeMemoryCardForRead,
  getSafeSourceAnchors,
  redactProtectedText,
  type DeleteArchiveResult,
  type MemoryCard,
  type MemoryCardStatus,
  type Sensitivity,
  type SourceArchive
} from "@contextvault/shared";

type MemoryStatusCounts = Record<MemoryCardStatus, number>;

const MEMORY_STATUSES: MemoryCardStatus[] = ["accepted", "proposed", "rejected", "archived", "superseded"];

export function getArchiveReferencedCards(cards: MemoryCard[], archiveId: string): MemoryCard[] {
  return cards.filter((card) =>
    getSafeSourceAnchors(getSafeMemoryCardForRead(card)).some((anchor) => anchor.archiveId === archiveId)
  );
}

export function formatArchiveDeleteResultMessage(result: DeleteArchiveResult): string {
  const parts = [
    `Deleted 1 archive and ${result.deletedTurnCount} source turn(s).`,
    `Deleted ${result.deletedMemoryCardCount} memory card(s).`
  ];

  if (result.updatedMemoryCardCount > 0) {
    parts.push(`Updated ${result.updatedMemoryCardCount} multi-source memory card(s) by removing stale anchors.`);
  }

  return parts.join(" ");
}

export function formatArchiveTitleForDisplay(archive: SourceArchive): string {
  const title = archive.title ?? "Untitled conversation";
  const sensitivity = archiveWarningSensitivity(archive) ?? classifySensitivity(title);

  return sensitivity === "normal" ? title : redactProtectedText(title, sensitivity);
}

export function formatArchiveDeleteConfirmation(archive: SourceArchive, referencedCards: MemoryCard[]): string {
  const safeReferencedCards = referencedCards.filter((card) =>
    getSafeSourceAnchors(getSafeMemoryCardForRead(card)).some((anchor) => anchor.archiveId === archive.id)
  );
  const singleSourceCardCount = safeReferencedCards.filter((card) =>
    isSingleSourceArchiveCard(card, archive.id)
  ).length;
  const multiSourceCardCount = safeReferencedCards.length - singleSourceCardCount;
  const parts = ["Delete this source archive and its source turns?"];

  if (safeReferencedCards.length > 0) {
    const counts = countMemoryStatuses(safeReferencedCards);
    const countSummary = MEMORY_STATUSES.filter((status) => counts[status] > 0)
      .map((status) => `${memoryStatusLabel(status)} ${counts[status]}`)
      .join(", ");

    parts.push(`This affects ${safeReferencedCards.length} memory card(s): ${countSummary}.`);
  }

  if (singleSourceCardCount > 0) {
    parts.push(`${singleSourceCardCount} memory card(s) only reference this archive and will be deleted.`);
  }

  if (multiSourceCardCount > 0) {
    parts.push(
      `${multiSourceCardCount} memory card(s) also reference other archives and will be kept with this archive's anchors removed.`
    );
  }

  if (safeReferencedCards.some((card) => card.status === "accepted")) {
    parts.push("Accepted long-term memories are affected. Deleted cards require re-import or re-capture to restore.");
  }

  if (archive.title) {
    parts.push(`Archive: ${formatArchiveTitleForDisplay(archive)}`);
  }

  parts.push("Continue deleting?");

  return parts.join("\n");
}

function isSingleSourceArchiveCard(card: MemoryCard, archiveId: string): boolean {
  const anchors = getSafeSourceAnchors(getSafeMemoryCardForRead(card));

  return anchors.length > 0 && anchors.every((anchor) => anchor.archiveId === archiveId);
}

function countMemoryStatuses(cards: MemoryCard[]): MemoryStatusCounts {
  return cards.reduce<MemoryStatusCounts>(
    (counts, card) => {
      counts[getSafeMemoryCardForRead(card).status] += 1;
      return counts;
    },
    {
      accepted: 0,
      proposed: 0,
      rejected: 0,
      archived: 0,
      superseded: 0
    }
  );
}

function archiveWarningSensitivity(archive: SourceArchive): Sensitivity | undefined {
  if (archive.warnings.some((warning) => warning.code === "secret_content_detected")) {
    return "secret";
  }

  if (archive.warnings.some((warning) => warning.code === "sensitive_content_detected")) {
    return "sensitive";
  }

  return undefined;
}

function memoryStatusLabel(status: MemoryCardStatus): string {
  switch (status) {
    case "accepted":
      return "accepted";
    case "proposed":
      return "proposed";
    case "rejected":
      return "rejected";
    case "archived":
      return "archived";
    case "superseded":
      return "superseded";
  }
}
