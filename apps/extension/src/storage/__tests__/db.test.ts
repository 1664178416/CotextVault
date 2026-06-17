import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { MemoryCard, SourceArchive, SourceTurn, VaultExport } from "@contextvault/shared";
import {
  MAX_CAPTURE_WARNING_MESSAGE_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_VAULT_INTEGRITY_ISSUE_DETAILS
} from "@contextvault/shared";
import {
  auditVaultIntegrity,
  deleteArchiveCascade,
  exportVault,
  findArchiveByContentHash,
  getArchiveWithTurns,
  importVault,
  listArchives,
  listMemoryCards,
  resetDatabaseConnectionForTests,
  saveArchiveWithTurns,
  saveArchiveWithTurnsAndCards,
  saveMemoryCards
} from "../db";

const DB_NAME = "contextvault";

beforeEach(async () => {
  resetDatabaseConnectionForTests();
  await deleteDatabase(DB_NAME);
  resetDatabaseConnectionForTests();
});

describe("IndexedDB vault storage", () => {
  it("stores archives, ordered turns, memory cards, and contentHash lookups", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1" }), [
      turn({ id: "turn-2", archiveId: "archive-1", orderIndex: 1, text: "Second turn." }),
      turn({ id: "turn-1", archiveId: "archive-1", orderIndex: 0, text: "First turn." })
    ]);
    await saveMemoryCards([
      card({
        id: "card-1",
        sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "First turn." }]
      })
    ]);

    await expect(findArchiveByContentHash("hash-1")).resolves.toMatchObject({ id: "archive-1" });
    await expect(getArchiveWithTurns("archive-1")).resolves.toMatchObject({
      turns: [{ id: "turn-1" }, { id: "turn-2" }]
    });
    await expect(listArchives()).resolves.toHaveLength(1);
    await expect(listMemoryCards("accepted")).resolves.toHaveLength(1);
  });

  it("replaces existing source turns when saving an archive with the same id", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1" }), [
      turn({ id: "turn-old", archiveId: "archive-1", text: "Old source turn." })
    ]);

    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1-replacement" }), [
      turn({ id: "turn-new", archiveId: "archive-1", text: "Replacement source turn." })
    ]);

    await expect(getArchiveWithTurns("archive-1")).resolves.toMatchObject({
      archive: { contentHash: "hash-1-replacement" },
      turns: [{ id: "turn-new", text: "Replacement source turn." }]
    });
  });

  it("stores captured archives, turns, and proposed cards in one repository call", async () => {
    await saveArchiveWithTurnsAndCards(
      archive({ id: "archive-1", contentHash: "hash-1" }),
      [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })],
      [
        card({
          id: "card-1",
          sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "Use source anchors." }]
        })
      ]
    );

    await expect(getArchiveWithTurns("archive-1")).resolves.toMatchObject({
      archive: { id: "archive-1", contentHash: "hash-1" },
      turns: [{ id: "turn-1", text: "Use source anchors." }]
    });
    await expect(listMemoryCards("accepted")).resolves.toMatchObject([{ id: "card-1" }]);
  });

  it("exports and imports complete vault data through real object stores", async () => {
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: archive({ id: "archive-1", contentHash: "hash-1" }),
          turns: [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })]
        }
      ],
      memoryCards: [
        card({
          id: "card-1",
          sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "Use source anchors." }]
        })
      ]
    };

    await expect(importVault(vault)).resolves.toEqual({
      archiveCount: 1,
      turnCount: 1,
      memoryCardCount: 1
    });

    const exported = await exportVault();

    expect(exported.archives).toHaveLength(1);
    expect(exported.archives[0]?.turns).toHaveLength(1);
    expect(exported.memoryCards).toHaveLength(1);
  });

  it("rejects vault imports that would overwrite existing archive ids", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-existing" }), [
      turn({ id: "turn-existing", archiveId: "archive-1", text: "Existing turn." })
    ]);

    await expect(
      importVault({
        schemaVersion: 1,
        exportedAt: "2026-06-08T00:00:00.000Z",
        archives: [
          {
            archive: archive({ id: "archive-1", contentHash: "hash-imported" }),
            turns: [turn({ id: "turn-imported", archiveId: "archive-1", text: "Imported turn." })]
          }
        ],
        memoryCards: []
      })
    ).rejects.toThrow("Import would overwrite existing ContextVault data");

    const exported = await exportVault();

    expect(exported.archives).toHaveLength(1);
    expect(exported.archives[0]?.archive.contentHash).toBe("hash-existing");
    expect(exported.archives[0]?.turns.map((item) => item.id)).toEqual(["turn-existing"]);
  });

  it("rejects vault imports that would overwrite existing turn or memory card ids", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-existing", contentHash: "hash-existing" }), [
      turn({ id: "turn-1", archiveId: "archive-existing", text: "Existing turn." })
    ]);
    await saveMemoryCards([
      card({
        id: "card-1",
        sourceAnchors: [{ id: "anchor-1", archiveId: "archive-existing", turnId: "turn-1", quote: "Existing turn." }]
      })
    ]);

    await expect(
      importVault({
        schemaVersion: 1,
        exportedAt: "2026-06-08T00:00:00.000Z",
        archives: [
          {
            archive: archive({ id: "archive-new-turn-conflict", contentHash: "hash-new-turn-conflict" }),
            turns: [turn({ id: "turn-1", archiveId: "archive-new-turn-conflict", text: "Conflicting turn." })]
          }
        ],
        memoryCards: []
      })
    ).rejects.toThrow("Import would overwrite existing ContextVault data");
    await expect(
      importVault({
        schemaVersion: 1,
        exportedAt: "2026-06-08T00:00:00.000Z",
        archives: [
          {
            archive: archive({ id: "archive-new-card-conflict", contentHash: "hash-new-card-conflict" }),
            turns: [turn({ id: "turn-new-card-conflict", archiveId: "archive-new-card-conflict" })]
          }
        ],
        memoryCards: [
          card({
            id: "card-1",
            sourceAnchors: [
              {
                id: "anchor-new-card-conflict",
                archiveId: "archive-new-card-conflict",
                turnId: "turn-new-card-conflict"
              }
            ]
          })
        ]
      })
    ).rejects.toThrow("Import would overwrite existing ContextVault data");

    const exported = await exportVault();

    expect(exported.archives.map((item) => item.archive.id)).toEqual(["archive-existing"]);
    expect(exported.archives[0]?.turns.map((item) => item.id)).toEqual(["turn-1"]);
    expect(exported.memoryCards.map((item) => item.id)).toEqual(["card-1"]);
  });

  it("exports vault snapshots with stable archive, turn, and memory ordering", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-old", capturedAt: "2026-06-08T00:00:00.000Z" }), [
      turn({ id: "turn-old-2", archiveId: "archive-old", orderIndex: 1 }),
      turn({ id: "turn-old-1", archiveId: "archive-old", orderIndex: 0 })
    ]);
    await saveArchiveWithTurns(archive({ id: "archive-new", capturedAt: "2026-06-08T01:00:00.000Z" }), [
      turn({ id: "turn-new-1", archiveId: "archive-new", orderIndex: 0 })
    ]);
    await saveMemoryCards([
      card({ id: "card-old", updatedAt: "2026-06-08T00:00:00.000Z" }),
      card({ id: "card-new", updatedAt: "2026-06-08T01:00:00.000Z" })
    ]);

    const exported = await exportVault();

    expect(exported.archives.map((item) => item.archive.id)).toEqual(["archive-new", "archive-old"]);
    expect(exported.archives.find((item) => item.archive.id === "archive-old")?.turns.map((item) => item.id)).toEqual([
      "turn-old-1",
      "turn-old-2"
    ]);
    expect(exported.memoryCards.map((item) => item.id)).toEqual(["card-new", "card-old"]);
  });

  it("audits a healthy vault snapshot without reporting integrity issues", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1" }), [
      turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })
    ]);
    await saveMemoryCards([
      card({
        id: "card-1",
        sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "Use source anchors." }]
      })
    ]);

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 1,
      issueCount: 0,
      omittedIssueCount: 0,
      issues: []
    });
    expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt);
  });

  it("audits orphan turns and broken source anchors without mutating vault data", async () => {
    const veryLongArchiveId = `missing-${"x".repeat(700)}`;

    await seedRawVaultData({
      archives: [
        archive({ id: "archive-empty", contentHash: "hash-empty" }),
        archive({ id: "archive-1", contentHash: "hash-1" }),
        archive({ id: "archive-2", contentHash: "hash-2" })
      ],
      turns: [
        turn({ id: "turn-1", archiveId: "archive-1", text: "First source." }),
        turn({ id: "turn-2", archiveId: "archive-2", text: "Second source." }),
        turn({ id: "turn-orphan", archiveId: "archive-missing", text: "Orphan source." })
      ],
      memoryCards: [
        card({ id: "card-empty", sourceAnchors: [] }),
        card({
          id: "card-missing-archive",
          sourceAnchors: [{ id: "anchor-missing-archive", archiveId: veryLongArchiveId, turnId: "turn-1" }]
        }),
        card({
          id: "card-missing-turn",
          sourceAnchors: [{ id: "anchor-missing-turn", archiveId: "archive-1", turnId: "turn-missing" }]
        }),
        card({
          id: "card-mismatch",
          sourceAnchors: [{ id: "anchor-mismatch", archiveId: "archive-1", turnId: "turn-2" }]
        })
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 3,
      sourceTurnCount: 3,
      memoryCardCount: 4,
      issueCount: 6,
      omittedIssueCount: 0
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "orphan_source_turn",
        "empty_source_archive",
        "memory_card_without_source_anchor",
        "source_anchor_missing_archive",
        "source_anchor_missing_turn",
        "source_anchor_turn_archive_mismatch"
      ])
    );
    expect(report.issues.find((issue) => issue.code === "source_anchor_missing_archive")?.archiveId).toHaveLength(512);
    expect(await listArchives()).toHaveLength(3);
    expect(await listMemoryCards()).toHaveLength(4);
  });

  it("audits source anchor spans and quotes against referenced source turns", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-1", contentHash: "hash-1" })],
      turns: [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors for recall." })],
      memoryCards: [
        card({
          id: "card-invalid-span",
          sourceAnchors: [{ id: "anchor-invalid-span", archiveId: "archive-1", turnId: "turn-1", charStart: 4 }]
        }),
        card({
          id: "card-out-of-range-span",
          sourceAnchors: [
            { id: "anchor-out-of-range-span", archiveId: "archive-1", turnId: "turn-1", charStart: 4, charEnd: 1000 }
          ]
        }),
        card({
          id: "card-quote-mismatch",
          sourceAnchors: [
            {
              id: "anchor-quote-mismatch",
              archiveId: "archive-1",
              turnId: "turn-1",
              charStart: 4,
              charEnd: 10,
              quote: "memory"
            }
          ]
        }),
        card({
          id: "card-quote-missing",
          sourceAnchors: [{ id: "anchor-quote-missing", archiveId: "archive-1", turnId: "turn-1", quote: "not present" }]
        })
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 4,
      issueCount: 4,
      omittedIssueCount: 0
    });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "source_anchor_invalid_span",
      "source_anchor_invalid_span",
      "source_anchor_quote_mismatch",
      "source_anchor_quote_missing"
    ]);
    expect(await listMemoryCards()).toHaveLength(4);
  });

  it("audits malformed source anchor optional fields before evidence matching", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-1", contentHash: "hash-1" })],
      turns: [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })],
      memoryCards: [
        card({
          id: "card-bad-start",
          sourceAnchors: [
            { id: "anchor-bad-start", archiveId: "archive-1", turnId: "turn-1", charStart: 1.5, charEnd: 4 }
          ]
        } as unknown as Partial<MemoryCard>),
        card({
          id: "card-bad-end",
          sourceAnchors: [
            { id: "anchor-bad-end", archiveId: "archive-1", turnId: "turn-1", charStart: 1, charEnd: "4" }
          ]
        } as unknown as Partial<MemoryCard>),
        card({
          id: "card-empty-quote",
          sourceAnchors: [{ id: "anchor-empty-quote", archiveId: "archive-1", turnId: "turn-1", quote: "" }]
        }),
        card({
          id: "card-non-string-quote",
          sourceAnchors: [
            { id: "anchor-non-string-quote", archiveId: "archive-1", turnId: "turn-1", quote: 42 }
          ]
        } as unknown as Partial<MemoryCard>),
        card({
          id: "card-long-quote",
          sourceAnchors: [
            {
              id: "anchor-long-quote",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "x".repeat(MAX_SOURCE_ANCHOR_QUOTE_LENGTH + 1)
            }
          ]
        })
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 5,
      issueCount: 5,
      omittedIssueCount: 0
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "malformed_source_anchor", message: "Source anchor charStart must be a non-negative integer." }),
        expect.objectContaining({ code: "malformed_source_anchor", message: "Source anchor charEnd must be a non-negative integer." }),
        expect.objectContaining({ code: "malformed_source_anchor", message: "Source anchor quote must be non-empty when present." }),
        expect.objectContaining({ code: "malformed_source_anchor", message: "Source anchor quote must be a string when present." }),
        expect.objectContaining({
          code: "malformed_source_anchor",
          message: `Source anchor quote must be ${MAX_SOURCE_ANCHOR_QUOTE_LENGTH} characters or fewer.`
        })
      ])
    );
    expect(report.issues.map((issue) => issue.code)).not.toContain("source_anchor_quote_missing");
  });

  it("audits malformed source archive scalar fields without mutating vault data", async () => {
    await seedRawVaultData({
      archives: [
        {
          ...archive({ id: "archive-bad-fields" }),
          provider: "unsupported-provider",
          providerConversationId: 42,
          title: 99,
          url: 7,
          captureMethod: "unsupported-method",
          capturedAt: "2026-06-08",
          contentHash: "",
          schemaVersion: 2,
          warnings: [
            "not-a-warning",
            {
              code: "",
              message: "x".repeat(MAX_CAPTURE_WARNING_MESSAGE_LENGTH + 1)
            }
          ]
        } as unknown as SourceArchive
      ],
      turns: [turn({ id: "turn-1", archiveId: "archive-bad-fields" })],
      memoryCards: []
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 0,
      issueCount: 11,
      omittedIssueCount: 0
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive provider must be supported." }),
        expect.objectContaining({
          code: "malformed_source_archive",
          message: "Source archive providerConversationId must be a string when present."
        }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive title must be a string when present." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive url must be a string when present." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive captureMethod must be supported." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive capturedAt must be an ISO date string." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive contentHash must be a non-empty string." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive schemaVersion must be 1." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive warnings must be objects." }),
        expect.objectContaining({ code: "malformed_source_archive", message: "Source archive warning code must be a non-empty string." }),
        expect.objectContaining({
          code: "malformed_source_archive",
          message: `Source archive warning message must be ${MAX_CAPTURE_WARNING_MESSAGE_LENGTH} characters or fewer.`
        })
      ])
    );
    expect(await listArchives()).toHaveLength(1);
  });

  it("audits malformed source turn scalar fields before source-anchor evidence matching", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-1", contentHash: "hash-1" })],
      turns: [
        {
          ...turn({ id: "turn-bad-fields", archiveId: "archive-1", text: "Use source anchors." }),
          providerTurnId: 42,
          role: "critic",
          text: "",
          createdAt: "not-a-date",
          orderIndex: -1,
          contentHash: "",
          sourceSelector: 7
        } as unknown as SourceTurn,
        {
          ...turn({ id: "turn-long-text", archiveId: "archive-1" }),
          text: "x".repeat(MAX_SOURCE_TURN_TEXT_LENGTH + 1)
        }
      ],
      memoryCards: [
        card({
          id: "card-anchored-to-bad-turn",
          sourceAnchors: [{ id: "anchor-bad-turn", archiveId: "archive-1", turnId: "turn-bad-fields", quote: "missing" }]
        })
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 2,
      memoryCardCount: 1,
      issueCount: 8,
      omittedIssueCount: 0
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn providerTurnId must be a string when present." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn role must be supported." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn text must be a non-empty string." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn createdAt must be an ISO date string when present." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn orderIndex must be a non-negative integer." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn contentHash must be a non-empty string." }),
        expect.objectContaining({ code: "malformed_source_turn", message: "Source turn sourceSelector must be a string when present." }),
        expect.objectContaining({
          code: "malformed_source_turn",
          message: `Source turn text must be ${MAX_SOURCE_TURN_TEXT_LENGTH} characters or fewer.`
        })
      ])
    );
    expect(report.issues.map((issue) => issue.code)).not.toContain("source_anchor_quote_missing");
    expect(await listMemoryCards()).toHaveLength(1);
  });

  it("audits malformed memory card and source anchor shapes without throwing", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-1", contentHash: "hash-1" })],
      turns: [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })],
      memoryCards: [
        { ...card({ id: "card-bad-anchors" }), sourceAnchors: "not-an-array" } as unknown as MemoryCard,
        { ...card({ id: "card-bad-anchor-object" }), sourceAnchors: ["not-an-anchor"] } as unknown as MemoryCard,
        {
          ...card({ id: "card-bad-anchor-fields" }),
          sourceAnchors: [{ id: "", archiveId: "archive-1", turnId: 42 }]
        } as unknown as MemoryCard
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 3,
      issueCount: 3,
      omittedIssueCount: 0
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["malformed_memory_card", "malformed_source_anchor", "malformed_source_anchor"])
    );
    expect(report.issues.find((issue) => issue.sourceAnchorId === "unknown-anchor")).toMatchObject({
      archiveId: "archive-1",
      memoryCardId: "card-bad-anchor-fields",
      sourceAnchorId: "unknown-anchor",
      turnId: "unknown-turn"
    });
  });

  it("audits malformed memory card scalar fields without mutating vault data", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-1", contentHash: "hash-1" })],
      turns: [turn({ id: "turn-1", archiveId: "archive-1", text: "Use source anchors." })],
      memoryCards: [
        {
          ...card({ id: "card-bad-fields" }),
          type: "unknown-type",
          title: 42,
          body: "",
          status: "unknown-status",
          scope: "unknown-scope",
          sensitivity: "unknown-sensitivity",
          tags: "not-tags",
          createdAt: "2026-06-08",
          updatedAt: "not-a-date",
          confidence: 2,
          sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" }]
        } as unknown as MemoryCard
      ]
    });

    const report = await auditVaultIntegrity();

    expect(report).toMatchObject({
      archiveCount: 1,
      sourceTurnCount: 1,
      memoryCardCount: 1,
      issueCount: 10,
      omittedIssueCount: 0
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card type must be supported." }),
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card title must be a non-empty string." }),
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card body must be a non-empty string." }),
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card tags must be an array." }),
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card createdAt must be an ISO date string." }),
        expect.objectContaining({ code: "malformed_memory_card", message: "Memory card confidence must be a number between 0 and 1." })
      ])
    );
    expect(await listMemoryCards()).toHaveLength(1);
  });

  it("caps integrity issue details while preserving total issue counts", async () => {
    await seedRawVaultData({
      archives: [archive({ id: "archive-empty", contentHash: "hash-empty" })],
      turns: Array.from({ length: MAX_VAULT_INTEGRITY_ISSUE_DETAILS + 5 }, (_, index) =>
        turn({ id: `turn-orphan-${index}`, archiveId: `archive-missing-${index}` })
      ),
      memoryCards: []
    });

    const report = await auditVaultIntegrity();

    expect(report.issueCount).toBe(MAX_VAULT_INTEGRITY_ISSUE_DETAILS + 6);
    expect(report.issues).toHaveLength(MAX_VAULT_INTEGRITY_ISSUE_DETAILS);
    expect(report.omittedIssueCount).toBe(6);
  });

  it("cascades archive deletes to source turns and anchored memory cards only", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1" }), [
      turn({ id: "turn-1", archiveId: "archive-1" })
    ]);
    await saveArchiveWithTurns(archive({ id: "archive-2", contentHash: "hash-2" }), [
      turn({ id: "turn-2", archiveId: "archive-2" })
    ]);
    await saveMemoryCards([
      card({
        id: "card-1",
        sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" }]
      }),
      card({
        id: "card-2",
        sourceAnchors: [{ id: "anchor-2", archiveId: "archive-2", turnId: "turn-2" }]
      })
    ]);

    await expect(deleteArchiveCascade("archive-1")).resolves.toEqual({
      archiveId: "archive-1",
      deletedTurnCount: 1,
      deletedMemoryCardCount: 1,
      updatedMemoryCardCount: 0
    });
    await expect(listArchives()).resolves.toEqual([expect.objectContaining({ id: "archive-2" })]);
    await expect(listMemoryCards()).resolves.toEqual([expect.objectContaining({ id: "card-2" })]);
    await expect(getArchiveWithTurns("archive-1")).rejects.toThrow("Archive not found: archive-1");
  });

  it("preserves multi-source memory cards by removing only deleted archive anchors", async () => {
    await saveArchiveWithTurns(archive({ id: "archive-1", contentHash: "hash-1" }), [
      turn({ id: "turn-1", archiveId: "archive-1", text: "First source." })
    ]);
    await saveArchiveWithTurns(archive({ id: "archive-2", contentHash: "hash-2" }), [
      turn({ id: "turn-2", archiveId: "archive-2", text: "Second source." })
    ]);
    await saveMemoryCards([
      card({
        id: "card-1",
        sourceAnchors: [
          { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "First source." },
          { id: "anchor-2", archiveId: "archive-2", turnId: "turn-2", quote: "Second source." }
        ]
      })
    ]);

    await expect(deleteArchiveCascade("archive-1")).resolves.toEqual({
      archiveId: "archive-1",
      deletedTurnCount: 1,
      deletedMemoryCardCount: 0,
      updatedMemoryCardCount: 1
    });

    const [remainingCard] = await listMemoryCards();

    expect(remainingCard?.id).toBe("card-1");
    expect(remainingCard?.sourceAnchors).toEqual([
      { id: "anchor-2", archiveId: "archive-2", turnId: "turn-2", quote: "Second source." }
    ]);
    await expect(getArchiveWithTurns("archive-2")).resolves.toMatchObject({ archive: { id: "archive-2" } });
  });

  it("cascades archive deletes without crashing on malformed memory card anchors", async () => {
    await seedRawVaultData({
      archives: [
        archive({ id: "archive-1", contentHash: "hash-1" }),
        archive({ id: "archive-2", contentHash: "hash-2" })
      ],
      turns: [
        turn({ id: "turn-1", archiveId: "archive-1", text: "First source." }),
        turn({ id: "turn-2", archiveId: "archive-2", text: "Second source." })
      ],
      memoryCards: [
        card({
          id: "delete-me",
          sourceAnchors: [{ id: "anchor-delete", archiveId: "archive-1", turnId: "turn-1" }]
        }),
        card({
          id: "keep-me",
          sourceAnchors: [{ id: "anchor-keep", archiveId: "archive-2", turnId: "turn-2" }]
        }),
        { ...card({ id: "malformed-array" }), sourceAnchors: "not-an-array" } as unknown as MemoryCard,
        {
          ...card({ id: "malformed-anchor" }),
          sourceAnchors: [
            { id: "anchor-target", archiveId: "archive-1", turnId: "turn-1" },
            "not-an-anchor",
            { id: "anchor-keep", archiveId: "archive-2", turnId: "turn-2" }
          ]
        } as unknown as MemoryCard
      ]
    });

    await expect(deleteArchiveCascade("archive-1")).resolves.toEqual({
      archiveId: "archive-1",
      deletedTurnCount: 1,
      deletedMemoryCardCount: 1,
      updatedMemoryCardCount: 1
    });

    const remainingCards = await listMemoryCards();

    expect(remainingCards.map((item) => item.id).sort()).toEqual(["keep-me", "malformed-anchor", "malformed-array"]);
    expect(remainingCards.find((item) => item.id === "malformed-array")?.sourceAnchors).toBe("not-an-array");
    expect(remainingCards.find((item) => item.id === "malformed-anchor")?.sourceAnchors).toEqual([
      { id: "anchor-keep", archiveId: "archive-2", turnId: "turn-2" }
    ]);
  });

  it("migrates older archive stores by adding the contentHash index", async () => {
    await createVersionOneDatabase();
    resetDatabaseConnectionForTests();

    await expect(findArchiveByContentHash("legacy-hash")).resolves.toMatchObject({ id: "legacy-archive" });
  });
});

function archive(overrides: Partial<SourceArchive> = {}): SourceArchive {
  return {
    id: overrides.id ?? "archive-1",
    provider: overrides.provider ?? "chatgpt",
    title: overrides.title ?? "Fixture archive",
    url: overrides.url ?? "https://chatgpt.com/c/fixture",
    captureMethod: overrides.captureMethod ?? "dom",
    capturedAt: overrides.capturedAt ?? "2026-06-08T00:00:00.000Z",
    contentHash: overrides.contentHash ?? "hash-archive",
    schemaVersion: overrides.schemaVersion ?? 1,
    warnings: overrides.warnings ?? []
  };
}

function turn(overrides: Partial<SourceTurn> = {}): SourceTurn {
  return {
    id: overrides.id ?? "turn-1",
    archiveId: overrides.archiveId ?? "archive-1",
    role: overrides.role ?? "assistant",
    text: overrides.text ?? "Use local-first storage.",
    orderIndex: overrides.orderIndex ?? 0,
    contentHash: overrides.contentHash ?? "hash-turn",
    sourceSelector: overrides.sourceSelector
  };
}

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "Source grounded card",
    body: overrides.body ?? "Use local-first storage.",
    status: overrides.status ?? "accepted",
    scope: overrides.scope ?? "conversation",
    sensitivity: overrides.sensitivity ?? "normal",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-06-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-08T00:00:00.000Z",
    sourceAnchors: overrides.sourceAnchors ?? [
      {
        id: "anchor-1",
        archiveId: "archive-1",
        turnId: "turn-1"
      }
    ]
  };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${name}`));
    request.onsuccess = () => resolve();
    request.onblocked = () => reject(new Error(`Delete database blocked: ${name}`));
  });
}

function seedRawVaultData(data: {
  archives: SourceArchive[];
  turns: SourceTurn[];
  memoryCards: MemoryCard[];
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("source_archives")) {
        const archives = db.createObjectStore("source_archives", { keyPath: "id" });

        archives.createIndex("capturedAt", "capturedAt", { unique: false });
        archives.createIndex("provider", "provider", { unique: false });
        archives.createIndex("contentHash", "contentHash", { unique: false });
      }

      if (!db.objectStoreNames.contains("source_turns")) {
        db.createObjectStore("source_turns", { keyPath: "id" }).createIndex("archiveId", "archiveId", {
          unique: false
        });
      }

      if (!db.objectStoreNames.contains("memory_cards")) {
        const cards = db.createObjectStore("memory_cards", { keyPath: "id" });

        cards.createIndex("status", "status", { unique: false });
        cards.createIndex("type", "type", { unique: false });
        cards.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open raw test database"));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["source_archives", "source_turns", "memory_cards"], "readwrite");
      const archiveStore = transaction.objectStore("source_archives");
      const turnStore = transaction.objectStore("source_turns");
      const cardStore = transaction.objectStore("memory_cards");

      for (const archive of data.archives) {
        archiveStore.put(archive);
      }

      for (const sourceTurn of data.turns) {
        turnStore.put(sourceTurn);
      }

      for (const memoryCard of data.memoryCards) {
        cardStore.put(memoryCard);
      }

      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to seed raw test database"));
      transaction.oncomplete = () => {
        db.close();
        resetDatabaseConnectionForTests();
        resolve();
      };
    };
  });
}

async function createVersionOneDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const archives = db.createObjectStore("source_archives", { keyPath: "id" });

      archives.createIndex("capturedAt", "capturedAt", { unique: false });
      archives.createIndex("provider", "provider", { unique: false });
      db.createObjectStore("source_turns", { keyPath: "id" }).createIndex("archiveId", "archiveId", {
        unique: false
      });
      const cards = db.createObjectStore("memory_cards", { keyPath: "id" });

      cards.createIndex("status", "status", { unique: false });
      cards.createIndex("type", "type", { unique: false });
      cards.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open v1 database"));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("source_archives", "readwrite");

      transaction.objectStore("source_archives").put(archive({ id: "legacy-archive", contentHash: "legacy-hash" }));
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to seed v1 database"));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}
