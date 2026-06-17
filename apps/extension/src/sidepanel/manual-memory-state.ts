import {
  classifySensitivity,
  formatSensitivitySummary,
  getEffectiveMemorySensitivity,
  getSafeMemoryCardForRead,
  redactProtectedText,
  type ManualMemoryCardInput,
  type MemoryCard,
  type Sensitivity
} from "@contextvault/shared";

type ManualMemoryDraft = ManualMemoryCardInput;

export function classifyManualMemoryDraftSensitivity(input: ManualMemoryDraft): Sensitivity {
  return classifySensitivity([input.title, input.body, input.owner ?? "", ...(input.tags ?? [])].join("\n"));
}

export function getManualMemoryConfirmationMessage(input: ManualMemoryDraft): string | undefined {
  const sensitivity = classifyManualMemoryDraftSensitivity(input);

  if (sensitivity === "normal") {
    return undefined;
  }

  return `Create this manual memory as accepted long-term memory? It appears to contain ${formatSensitivitySummary(
    summaryForSensitivity(sensitivity)
  )}. Continue?`;
}

export function formatManualMemoryCreatedMessage(card: MemoryCard): string {
  const safeCard = getSafeMemoryCardForRead(card);
  const effectiveSensitivity = getEffectiveMemorySensitivity(safeCard);
  const title =
    effectiveSensitivity === "normal" ? safeCard.title : redactProtectedText(safeCard.title, effectiveSensitivity);

  return `Created manual memory: ${title}`;
}

function summaryForSensitivity(sensitivity: Sensitivity): Record<Sensitivity, number> {
  return {
    normal: sensitivity === "normal" ? 1 : 0,
    sensitive: sensitivity === "sensitive" ? 1 : 0,
    secret: sensitivity === "secret" ? 1 : 0
  };
}

export type ManualMemoryCreateResult =
  | {
      ok: true;
      card: MemoryCard;
    }
  | {
      ok: false;
      error: string;
    };
