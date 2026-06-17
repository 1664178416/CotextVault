import {
  classifySensitivity,
  getEffectiveMemorySensitivity,
  getSafeMemoryCardForRead,
  normalizeMemoryCardForType,
  redactProtectedText,
  type CaptureWarning,
  type MemoryCard,
  type Sensitivity,
  type SourceAnchor,
  type SourceTurn
} from "@contextvault/shared";

export interface MemoryCardPreview {
  title: string;
  body: string;
  tags: string[];
  metadata: string[];
  isProtected: boolean;
  protectionLabel?: string;
}

export interface SourceTurnPreview {
  text: string;
  isProtected: boolean;
  protectionLabel?: string;
}

export type TextSpan = {
  start: number;
  end: number;
};

export function getMemoryCardPreview(card: MemoryCard, options: { revealSensitive?: boolean } = {}): MemoryCardPreview {
  const normalizedCard = normalizeMemoryCardForType(getSafeMemoryCardForRead(card));
  const effectiveSensitivity = getEffectiveMemorySensitivity(normalizedCard);
  const isProtected = effectiveSensitivity === "sensitive" || effectiveSensitivity === "secret";

  if (!isProtected || options.revealSensitive) {
    return {
      title: normalizedCard.title,
      body: normalizedCard.body,
      tags: normalizedCard.tags,
      metadata: formatMemoryCardMetadata(normalizedCard),
      isProtected
    };
  }

  return {
    title: redactProtectedText(normalizedCard.title, effectiveSensitivity),
    body: redactProtectedText(normalizedCard.body, effectiveSensitivity),
    tags: normalizedCard.tags.map((tag) => redactProtectedText(tag, effectiveSensitivity)),
    metadata: formatMemoryCardMetadata(normalizedCard, effectiveSensitivity),
    isProtected,
    protectionLabel: effectiveSensitivity === "secret" ? "Redacted preview. Secret content requires manual reveal." : "Redacted preview."
  };
}

function formatMemoryCardMetadata(card: MemoryCard, redactionSensitivity?: Sensitivity): string[] {
  return [
    `scope:${card.scope}`,
    card.owner
      ? `owner:${redactionSensitivity ? redactProtectedText(card.owner, redactionSensitivity) : card.owner}`
      : "",
    card.dueAt ? `due:${card.dueAt.slice(0, 10)}` : ""
  ].filter(Boolean);
}

export function getSourceTurnPreview(
  turn: SourceTurn,
  archiveWarnings: CaptureWarning[],
  options: { revealSensitive?: boolean } = {}
): SourceTurnPreview {
  const sourceSensitivity = classifySensitivity(turn.text);
  const archiveSensitivity = getArchiveWarningSensitivity(archiveWarnings);
  const effectiveSensitivity = maxSensitivity(sourceSensitivity, archiveSensitivity);
  const isProtected = effectiveSensitivity === "sensitive" || effectiveSensitivity === "secret";

  if (!isProtected || options.revealSensitive) {
    return {
      text: turn.text,
      isProtected
    };
  }

  return {
    text: redactProtectedText(turn.text, effectiveSensitivity),
    isProtected,
    protectionLabel: effectiveSensitivity === "secret" ? "Source redacted by default. Secret content requires manual reveal." : "Source redacted by default."
  };
}

function getArchiveWarningSensitivity(warnings: CaptureWarning[]) {
  if (warnings.some((warning) => warning.code === "secret_content_detected")) {
    return "secret";
  }

  if (warnings.some((warning) => warning.code === "sensitive_content_detected")) {
    return "sensitive";
  }

  return "normal";
}

function maxSensitivity(left: ReturnType<typeof classifySensitivity>, right: ReturnType<typeof classifySensitivity>) {
  if (left === "secret" || right === "secret") {
    return "secret";
  }

  if (left === "sensitive" || right === "sensitive") {
    return "sensitive";
  }

  return "normal";
}

export function resolveVisibleAnchorSpan(
  text: string,
  anchor: SourceAnchor | undefined,
  options: { isProtected: boolean; revealSensitive: boolean }
): TextSpan | undefined {
  if (!anchor || (options.isProtected && !options.revealSensitive)) {
    return undefined;
  }

  return resolveAnchorSpan(text, anchor);
}

function resolveAnchorSpan(text: string, anchor: SourceAnchor): TextSpan | undefined {
  if (
    typeof anchor.charStart === "number" &&
    typeof anchor.charEnd === "number" &&
    anchor.charStart >= 0 &&
    anchor.charEnd > anchor.charStart &&
    anchor.charEnd <= text.length
  ) {
    return {
      start: anchor.charStart,
      end: anchor.charEnd
    };
  }

  if (anchor.quote) {
    const quoteStart = text.indexOf(anchor.quote);

    if (quoteStart >= 0) {
      return {
        start: quoteStart,
        end: quoteStart + anchor.quote.length
      };
    }
  }

  return undefined;
}
