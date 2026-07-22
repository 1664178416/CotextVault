import type { VaultIntegrityIssue, VaultIntegrityReport } from "@contextvault/shared";
import { formatCount } from "./count-state";

export type VaultIntegrityLevel = "ok" | "warning";

const ISSUE_LABELS: Record<VaultIntegrityIssue["code"], string> = {
  malformed_source_archive: "Malformed archive",
  malformed_source_turn: "Malformed turn",
  malformed_memory_card: "Malformed card",
  malformed_source_anchor: "Malformed anchor",
  orphan_source_turn: "Orphan turn",
  empty_source_archive: "Empty archive",
  memory_card_without_source_anchor: "Ungrounded card",
  source_anchor_missing_archive: "Missing archive",
  source_anchor_missing_turn: "Missing turn",
  source_anchor_turn_archive_mismatch: "Archive mismatch",
  source_anchor_invalid_span: "Invalid span",
  source_anchor_quote_mismatch: "Quote mismatch",
  source_anchor_quote_missing: "Missing quote"
};

export function getVaultIntegrityLevel(report: VaultIntegrityReport): VaultIntegrityLevel {
  return report.issueCount === 0 ? "ok" : "warning";
}

export function formatVaultIntegritySummary(report: VaultIntegrityReport): string {
  const checkedCounts = `${formatCount(report.archiveCount, "archive")}, ${formatCount(report.sourceTurnCount, "turn")}, ${formatCount(report.memoryCardCount, "card")}`;

  if (report.issueCount === 0) {
    return `Vault healthy. Checked ${checkedCounts}.`;
  }

  return `Found ${formatCount(report.issueCount, "source-grounding issue")} across ${checkedCounts}.`;
}

export function formatVaultIntegrityResultMessage(report: VaultIntegrityReport): string {
  if (report.issueCount === 0) {
    return "Vault integrity check passed.";
  }

  const suffix = report.omittedIssueCount > 0 ? ` ${formatCount(report.omittedIssueCount, "detail")} omitted.` : "";

  return `Vault integrity check found ${formatCount(report.issueCount, "issue")}.${suffix}`;
}

export function formatVaultIntegrityIssue(issue: VaultIntegrityIssue): string {
  return `${ISSUE_LABELS[issue.code]}: ${issue.message}`;
}
