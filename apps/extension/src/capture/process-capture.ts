import {
  classifySensitivity,
  formatValidationIssues,
  normalizeText,
  validateConversationCapture,
  type CaptureResult,
  type CaptureWarning,
  type ConversationCapture,
  type Sensitivity,
  type SourceArchive,
  type SourceTurn
} from "@contextvault/shared";
import { proposeMemoryCards } from "../extraction/heuristic";
import { sha256 } from "../storage/hash";

export type HashFunction = (text: string) => Promise<string>;
export type IdFactory = () => string;

export interface ProcessCaptureOptions {
  archiveId?: string;
  tabTitle?: string;
  hash?: HashFunction;
  createId?: IdFactory;
}

export async function processConversationCapture(
  capture: ConversationCapture,
  options: ProcessCaptureOptions = {}
): Promise<CaptureResult> {
  const validation = validateConversationCapture(capture);

  if (!validation.ok) {
    throw new Error(`Invalid conversation capture (${formatValidationIssues(validation.issues)}).`);
  }

  if (capture.turns.length === 0) {
    throw new Error("No conversation turns were captured from the current page.");
  }

  const hash = options.hash ?? sha256;
  const createId = options.createId ?? crypto.randomUUID.bind(crypto);
  const archiveId = options.archiveId ?? createId();
  const turns = await normalizeTurns(capture, archiveId, hash, createId);
  const contentHash = await hash(`${capture.provider}\n${capture.url}\n${formatTurnsForHash(turns)}`);
  const archive: SourceArchive = {
    id: archiveId,
    provider: capture.provider,
    providerConversationId: capture.providerConversationId,
    title: capture.title ?? options.tabTitle,
    url: capture.url,
    captureMethod: capture.captureMethod,
    capturedAt: capture.capturedAt,
    contentHash,
    schemaVersion: 1,
    warnings: withSensitivityWarnings(capture.warnings, turns)
  };
  const proposedCards = proposeMemoryCards(capture, turns);

  return {
    archive,
    turns,
    proposedCards
  };
}

async function normalizeTurns(
  capture: ConversationCapture,
  archiveId: string,
  hash: HashFunction,
  createId: IdFactory
): Promise<SourceTurn[]> {
  const turns: SourceTurn[] = [];

  for (let index = 0; index < capture.turns.length; index += 1) {
    const turn = capture.turns[index];
    const text = normalizeText(turn.text);

    turns.push({
      id: createId(),
      archiveId,
      providerTurnId: turn.providerTurnId,
      role: turn.role,
      text,
      createdAt: turn.createdAt,
      orderIndex: index,
      contentHash: await hash(`${turn.role}\n${text}`),
      sourceSelector: turn.sourceSelector
    });
  }

  return turns;
}

function formatTurnsForHash(turns: SourceTurn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n\n");
}

function withSensitivityWarnings(warnings: CaptureWarning[], turns: SourceTurn[]): CaptureWarning[] {
  const capturedText = formatTurnsForHash(turns);
  const detectedSensitivity = classifySensitivity(capturedText);
  const strongestWarningSensitivity = getStrongestSensitivityWarning(warnings);
  const sensitivity = maxSensitivity(detectedSensitivity, strongestWarningSensitivity);

  if (sensitivity === "normal" || hasSensitivityWarning(warnings, sensitivity)) {
    return [...warnings];
  }

  return [
    ...warnings,
    {
      code: `${sensitivity}_content_detected`,
      message:
        sensitivity === "secret"
          ? "Captured archive appears to contain secrets. Automatic memory extraction will skip obvious secret snippets."
          : "Captured archive appears to contain sensitive content."
    }
  ];
}

function getStrongestSensitivityWarning(warnings: CaptureWarning[]): Sensitivity {
  if (warnings.some((warning) => warning.code === "secret_content_detected")) {
    return "secret";
  }

  if (warnings.some((warning) => warning.code === "sensitive_content_detected")) {
    return "sensitive";
  }

  return "normal";
}

function hasSensitivityWarning(warnings: CaptureWarning[], sensitivity: Sensitivity): boolean {
  if (sensitivity === "normal") {
    return false;
  }

  return warnings.some((warning) => warning.code === `${sensitivity}_content_detected`);
}

function maxSensitivity(left: Sensitivity, right: Sensitivity): Sensitivity {
  if (left === "secret" || right === "secret") {
    return "secret";
  }

  if (left === "sensitive" || right === "sensitive") {
    return "sensitive";
  }

  return "normal";
}
