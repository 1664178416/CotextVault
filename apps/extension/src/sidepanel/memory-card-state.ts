import {
  getEffectiveMemorySensitivity,
  getSafeMemoryCardForRead,
  getSafeSourceAnchors,
  getMemoryTypeLabel,
  redactProtectedText,
  type MemoryCard,
  type MemoryCardStatus,
  type Sensitivity
} from "@contextvault/shared";
import { formatCount } from "./count-state";

export function formatMemoryCardDeleteConfirmation(card: MemoryCard): string {
  const safeCard = getSafeMemoryCardForRead(card);
  const effectiveSensitivity = getEffectiveMemorySensitivity(safeCard);
  const title = effectiveSensitivity !== "normal" ? redactProtectedText(safeCard.title, effectiveSensitivity) : safeCard.title;
  const sourceAnchors = getSafeSourceAnchors(safeCard);
  const sourceArchiveCount = new Set(sourceAnchors.map((anchor) => anchor.archiveId)).size;
  const parts = [
    "Delete this memory card?",
    `Title: ${title}`,
    `Type: ${getMemoryTypeLabel(safeCard.type)}`,
    `Status: ${memoryStatusLabel(safeCard.status)}`,
    `Sensitivity: ${sensitivityLabel(effectiveSensitivity)}`,
    `Sources: ${formatCount(sourceAnchors.length, "anchor")} across ${formatCount(sourceArchiveCount, "archive")}`
  ];

  if (safeCard.status === "accepted") {
    parts.push("This is an accepted long-term memory. After deletion it will no longer appear in search or recall context.");
  }

  parts.push("This deletes only the memory card. Raw source archives and source turns remain unless deleted separately.");

  if (effectiveSensitivity === "sensitive" || effectiveSensitivity === "secret") {
    parts.push("This card contains protected content. The confirmation has redacted the title when needed.");
  }

  parts.push("Continue deleting?");

  return parts.join("\n");
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

function sensitivityLabel(sensitivity: Sensitivity): string {
  switch (sensitivity) {
    case "normal":
      return "normal";
    case "sensitive":
      return "sensitive";
    case "secret":
      return "secret";
  }
}
