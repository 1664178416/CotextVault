import type { ArchiveWithTurns, CaptureWarning, MemoryCard, Sensitivity, VaultExport } from "@contextvault/shared";
import { classifySensitivity, formatSensitivitySummary, summarizeMemorySensitivity } from "@contextvault/shared";
import { formatBytes } from "./storage-state";

export type MarkdownExportScope = "accepted" | "proposed" | "all";
export const LARGE_VAULT_EXPORT_BYTES = 25 * 1024 * 1024;

export interface VaultExportDownload {
  text: string;
  byteLength: number;
  largeExportWarning?: string;
}

type ArchiveWarningSensitivity = "normal" | "sensitive" | "secret";
type SourceTurnSensitivitySummary = Record<Sensitivity, number>;

export function canExportMarkdownForScope(
  scope: MarkdownExportScope,
  cards: {
    accepted: MemoryCard[];
    proposed: MemoryCard[];
    all: MemoryCard[];
  }
): boolean {
  switch (scope) {
    case "accepted":
      return cards.accepted.length > 0;
    case "proposed":
      return cards.proposed.length > 0;
    case "all":
      return cards.all.length > 0;
  }
}

export function shouldConfirmMemoryDisclosure(
  cards: MemoryCard[],
  options: { redactSensitive?: boolean } = {}
): boolean {
  if (options.redactSensitive) {
    return false;
  }

  const summary = summarizeMemorySensitivity(cards);

  return summary.secret > 0 || summary.sensitive > 0;
}

export function prepareVaultExportDownload(
  vault: VaultExport,
  options: { largeExportBytes?: number } = {}
): VaultExportDownload {
  const text = JSON.stringify(vault, null, 2);
  const byteLength = byteLengthUtf8(text);
  const largeExportBytes = options.largeExportBytes ?? LARGE_VAULT_EXPORT_BYTES;

  return {
    text,
    byteLength,
    largeExportWarning:
      byteLength >= largeExportBytes
        ? formatLargeVaultExportWarning(vault, byteLength, largeExportBytes)
        : undefined
  };
}

export function formatVaultExportDisclosureMessage(vault: VaultExport): string {
  const memorySummary = summarizeMemorySensitivity(vault.memoryCards);
  const archiveWarningSummary = summarizeArchiveWarningSensitivity(vault.archives);
  const sourceTurnSummary = summarizeSourceTurnSensitivity(vault.archives);
  const parts = [
    `Export full ContextVault JSON with ${vault.archives.length} archive(s) and ${vault.memoryCards.length} memory card(s).`,
    "Raw archives can contain complete captured conversation text."
  ];

  if (memorySummary.secret > 0 || memorySummary.sensitive > 0) {
    parts.push(`Memory cards include ${formatSensitivitySummary(memorySummary)}.`);
  }

  if (archiveWarningSummary.secret > 0 || archiveWarningSummary.sensitive > 0) {
    parts.push(
      `Archive warnings mark ${archiveWarningSummary.secret} secret and ${archiveWarningSummary.sensitive} sensitive archive(s).`
    );
  }

  if (sourceTurnSummary.secret > 0 || sourceTurnSummary.sensitive > 0) {
    parts.push(
      `Source turns currently include ${sourceTurnSummary.secret} secret and ${sourceTurnSummary.sensitive} sensitive turn(s).`
    );
  }

  parts.push("Continue exporting?");

  return parts.join(" ");
}

export function formatArchiveExportDisclosureMessage(archiveWithTurns: ArchiveWithTurns): string {
  const archiveWarningSensitivity = getArchiveWarningSensitivity(archiveWithTurns.archive.warnings);
  const sourceTurnSummary = summarizeSourceTurnSensitivity([archiveWithTurns]);
  const parts = [
    `Export raw ContextVault archive JSON with ${archiveWithTurns.turns.length} source turn(s).`,
    "Raw archives can contain complete captured conversation text."
  ];

  if (archiveWithTurns.archive.warnings.length > 0) {
    parts.push(`Archive has ${archiveWithTurns.archive.warnings.length} capture warning(s).`);
  }

  if (archiveWarningSensitivity === "secret" || archiveWarningSensitivity === "sensitive") {
    parts.push(`Archive warnings mark this archive as ${archiveWarningSensitivity}.`);
  }

  if (sourceTurnSummary.secret > 0 || sourceTurnSummary.sensitive > 0) {
    parts.push(
      `Source turns currently include ${sourceTurnSummary.secret} secret and ${sourceTurnSummary.sensitive} sensitive turn(s).`
    );
  }

  parts.push("Continue exporting?");

  return parts.join(" ");
}

function formatLargeVaultExportWarning(
  vault: VaultExport,
  byteLength: number,
  largeExportBytes: number
): string {
  return [
    `ContextVault export is large (${formatBytes(byteLength)}).`,
    `It contains ${vault.archives.length} archive(s) and ${vault.memoryCards.length} memory card(s).`,
    `Files above ${formatBytes(largeExportBytes)} may take longer to download, sync, or import later.`,
    "Continue?"
  ].join(" ");
}

function byteLengthUtf8(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function summarizeArchiveWarningSensitivity(archives: ArchiveWithTurns[]): Record<ArchiveWarningSensitivity, number> {
  return archives.reduce<Record<ArchiveWarningSensitivity, number>>(
    (summary, archiveWithTurns) => {
      summary[getArchiveWarningSensitivity(archiveWithTurns.archive.warnings)] += 1;
      return summary;
    },
    {
      normal: 0,
      sensitive: 0,
      secret: 0
    }
  );
}

function getArchiveWarningSensitivity(warnings: CaptureWarning[]): ArchiveWarningSensitivity {
  if (warnings.some((warning) => warning.code === "secret_content_detected")) {
    return "secret";
  }

  if (warnings.some((warning) => warning.code === "sensitive_content_detected")) {
    return "sensitive";
  }

  return "normal";
}

function summarizeSourceTurnSensitivity(archives: ArchiveWithTurns[]): SourceTurnSensitivitySummary {
  return archives.reduce<SourceTurnSensitivitySummary>(
    (summary, archiveWithTurns) => {
      for (const turn of archiveWithTurns.turns) {
        summary[classifySensitivity(turn.text)] += 1;
      }

      return summary;
    },
    {
      normal: 0,
      sensitive: 0,
      secret: 0
    }
  );
}
