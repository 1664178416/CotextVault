import { describe, expect, it } from "vitest";
import type { VaultIntegrityReport } from "@contextvault/shared";
import {
  formatVaultIntegrityIssue,
  formatVaultIntegrityResultMessage,
  formatVaultIntegritySummary,
  getVaultIntegrityLevel
} from "../vault-integrity-state";

describe("side panel vault integrity state", () => {
  it("summarizes healthy vault audits", () => {
    const report = vaultIntegrityReport();

    expect(getVaultIntegrityLevel(report)).toBe("ok");
    expect(formatVaultIntegritySummary(report)).toBe("Vault healthy. Checked 1 archive(s), 2 turn(s), 3 card(s).");
    expect(formatVaultIntegrityResultMessage(report)).toBe("Vault integrity check passed.");
  });

  it("summarizes broken source grounding without leaking source text", () => {
    const report = vaultIntegrityReport({
      issueCount: 2,
      omittedIssueCount: 1,
      issues: [
        {
          code: "source_anchor_missing_turn",
          archiveId: "archive-1",
          turnId: "turn-missing",
          memoryCardId: "card-1",
          sourceAnchorId: "anchor-1",
          message: 'Source anchor references missing turn "turn-missing".'
        }
      ]
    });

    expect(getVaultIntegrityLevel(report)).toBe("warning");
    expect(formatVaultIntegritySummary(report)).toBe(
      "Found 2 source-grounding issue(s) across 1 archive(s), 2 turn(s), 3 card(s)."
    );
    expect(formatVaultIntegrityResultMessage(report)).toBe(
      "Vault integrity check found 2 issue(s). 1 detail(s) omitted."
    );
    expect(formatVaultIntegrityIssue(report.issues[0]!)).toBe(
      'Missing turn: Source anchor references missing turn "turn-missing".'
    );
  });

  it("labels source evidence integrity issues", () => {
    expect(
      formatVaultIntegrityIssue({
        code: "malformed_source_archive",
        archiveId: "archive-1",
        message: "Source archive provider must be supported."
      })
    ).toBe("Malformed archive: Source archive provider must be supported.");
    expect(
      formatVaultIntegrityIssue({
        code: "malformed_source_turn",
        archiveId: "archive-1",
        turnId: "turn-1",
        message: "Source turn text must be a non-empty string."
      })
    ).toBe("Malformed turn: Source turn text must be a non-empty string.");
    expect(
      formatVaultIntegrityIssue({
        code: "malformed_source_anchor",
        memoryCardId: "card-1",
        message: "Source anchor id, archiveId, and turnId are required strings."
      })
    ).toBe("Malformed anchor: Source anchor id, archiveId, and turnId are required strings.");
    expect(
      formatVaultIntegrityIssue({
        code: "source_anchor_quote_mismatch",
        archiveId: "archive-1",
        turnId: "turn-1",
        memoryCardId: "card-1",
        sourceAnchorId: "anchor-1",
        message: "Source anchor quote does not match the referenced character span."
      })
    ).toBe("Quote mismatch: Source anchor quote does not match the referenced character span.");
  });
});

function vaultIntegrityReport(overrides: Partial<VaultIntegrityReport> = {}): VaultIntegrityReport {
  return {
    checkedAt: "2026-06-10T00:00:00.000Z",
    archiveCount: 1,
    sourceTurnCount: 2,
    memoryCardCount: 3,
    issueCount: 0,
    omittedIssueCount: 0,
    issues: [],
    ...overrides
  };
}
