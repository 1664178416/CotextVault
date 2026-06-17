import { describe, expect, it } from "vitest";
import {
  isContentRequest,
  isConversationCapture,
  isMainWorldNetworkMessage,
  isRuntimeRequest,
  isVaultExport,
  formatValidationIssues,
  MAX_CAPTURE_WARNING_COUNT,
  MAX_CONTENT_HASH_LENGTH,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  MAX_MEMORY_CARD_TITLE_LENGTH,
  MAX_MANUAL_MEMORY_BODY_LENGTH,
  MAX_METADATA_ID_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  MAX_SOURCE_SELECTOR_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  MAX_URL_LENGTH,
  MAX_VAULT_IMPORT_ARCHIVE_COUNT,
  MAX_VAULT_IMPORT_MEMORY_CARD_COUNT,
  MAX_VAULT_IMPORT_SOURCE_TURN_COUNT,
  validateConversationCapture,
  validateVaultExport,
  type VaultExport
} from "@contextvault/shared";

const vault: VaultExport = {
  schemaVersion: 1,
  exportedAt: "2026-06-07T00:00:00.000Z",
  archives: [
    {
      archive: {
        id: "archive-1",
        provider: "chatgpt",
        captureMethod: "dom",
        capturedAt: "2026-06-07T00:00:00.000Z",
        contentHash: "hash",
        schemaVersion: 1,
        warnings: []
      },
      turns: [
        {
          id: "turn-1",
          archiveId: "archive-1",
          role: "assistant",
          text: "Use the side panel.",
          orderIndex: 0,
          contentHash: "turn-hash",
          sourceSelector: "[data-message-author-role]"
        }
      ]
    }
  ],
  memoryCards: [
    {
      id: "card-1",
      type: "decision",
      title: "Use side panel",
      body: "Use the side panel for review.",
      status: "accepted",
      scope: "conversation",
      sensitivity: "normal",
      tags: ["chatgpt"],
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1"
        }
      ]
    }
  ]
};

describe("vault export validation", () => {
  it("accepts a valid ContextVault export", () => {
    expect(isVaultExport(vault)).toBe(true);
  });

  it("accepts valid optional memory card fields", () => {
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            batchId: "batch-1",
            projectId: "project-1",
            owner: "wyh",
            dueAt: "2026-06-09T00:00:00.000Z",
            confidence: 1
          }
        ]
      })
    ).toBe(true);
  });

  it("accepts valid optional archive and turn fields", () => {
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            archive: {
              ...vault.archives[0]!.archive,
              providerConversationId: "conversation-1",
              title: "ContextVault plan",
              url: "https://chatgpt.com/c/conversation-1"
            },
            turns: [
              {
                ...vault.archives[0]!.turns[0],
                providerTurnId: "turn-provider-1",
                createdAt: "2026-06-07T00:00:01.000Z",
                sourceSelector: "[data-message-author-role]"
              }
            ]
          }
        ]
      })
    ).toBe(true);
  });

  it("requires canonical UTC ISO date-time strings", () => {
    const invalidDates = [
      "2026-06-07",
      "2026-06-07T00:00:00Z",
      "2026-06-07T00:00:00.000+08:00",
      "June 7, 2026",
      "2026-02-30T00:00:00.000Z"
    ];

    for (const exportedAt of invalidDates) {
      expect(
        isVaultExport({
          ...vault,
          exportedAt
        })
      ).toBe(false);
    }
  });

  it("rejects unknown JSON shapes", () => {
    expect(isVaultExport({ schemaVersion: 1, archives: [] })).toBe(false);
    expect(isVaultExport(null)).toBe(false);
  });

  it("reports path-level validation issues for invalid imports", () => {
    const result = validateVaultExport({
      ...vault,
      archives: [
        {
          ...vault.archives[0],
          archive: {
            ...vault.archives[0]?.archive,
            provider: "bard"
          }
        }
      ],
      memoryCards: [
        {
          ...vault.memoryCards[0],
          title: ""
        }
      ]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          {
            path: "$.archives[0].archive.provider",
            message: "must be a supported provider"
          },
          {
            path: "$.memoryCards[0].title",
            message: "must be a non-empty string"
          }
        ])
      );
    }
  });

  it("rejects exports with invalid enum values or malformed warnings", () => {
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              id: ""
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              warnings: [{ code: "   ", message: "Captured from DOM." }]
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              warnings: [{ code: "dom_fallback", message: "A".repeat(1_001) }]
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      validateVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              warnings: Array.from({ length: MAX_CAPTURE_WARNING_COUNT + 1 }, (_, index) => ({
                code: `warning-${index}`,
                message: "Captured with bounded warnings."
              }))
            }
          }
        ]
      })
    ).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          path: "$.archives[0].archive.warnings",
          message: `must contain ${MAX_CAPTURE_WARNING_COUNT} warnings or fewer`
        })
      ]
    });
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              capturedAt: "not-a-date"
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              contentHash: ""
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              schemaVersion: 2
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              provider: "bard"
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              captureMethod: "web_request"
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            archive: {
              ...vault.archives[0]?.archive,
              warnings: [{ code: "dom_fallback" }]
            }
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                role: "developer"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            tags: ["###"]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0],
            type: "note"
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0],
            scope: "workspace"
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0],
            sensitivity: "confidential"
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                id: ""
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                providerTurnId: 42
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                createdAt: "not-a-date"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                orderIndex: 1.5
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                text: "   "
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]?.turns[0],
                contentHash: ""
              }
            ]
          }
        ]
      })
    ).toBe(false);
  });

  it("rejects oversized source archive and turn metadata", () => {
    const result = validateVaultExport({
      ...vault,
      archives: [
        {
          archive: {
            ...vault.archives[0]!.archive,
            id: "a".repeat(MAX_METADATA_ID_LENGTH + 1),
            providerConversationId: "c".repeat(MAX_METADATA_ID_LENGTH + 1),
            title: "t".repeat(MAX_SOURCE_TITLE_LENGTH + 1),
            url: `https://example.test/${"u".repeat(MAX_URL_LENGTH)}`,
            contentHash: "h".repeat(MAX_CONTENT_HASH_LENGTH + 1)
          },
          turns: [
            {
              ...vault.archives[0]!.turns[0]!,
              id: "t".repeat(MAX_METADATA_ID_LENGTH + 1),
              archiveId: "a".repeat(MAX_METADATA_ID_LENGTH + 1),
              providerTurnId: "p".repeat(MAX_METADATA_ID_LENGTH + 1),
              contentHash: "h".repeat(MAX_CONTENT_HASH_LENGTH + 1),
              sourceSelector: "s".repeat(MAX_SOURCE_SELECTOR_LENGTH + 1)
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          {
            path: "$.archives[0].archive.id",
            message: `must be ${MAX_METADATA_ID_LENGTH} characters or fewer`
          },
          {
            path: "$.archives[0].archive.title",
            message: `must be ${MAX_SOURCE_TITLE_LENGTH} characters or fewer`
          },
          {
            path: "$.archives[0].archive.url",
            message: `must be ${MAX_URL_LENGTH} characters or fewer`
          },
          {
            path: "$.archives[0].turns[0].sourceSelector",
            message: `must be ${MAX_SOURCE_SELECTOR_LENGTH} characters or fewer`
          }
        ])
      );
    }
  });
  it("rejects oversized source turns and per-archive turn lists", () => {
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0]!,
            turns: [
              {
                ...vault.archives[0]!.turns[0]!,
                text: "x".repeat(MAX_SOURCE_TURN_TEXT_LENGTH + 1)
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0]!,
            turns: Array.from({ length: MAX_SOURCE_TURNS_PER_ARCHIVE + 1 }, (_, index) => ({
              ...vault.archives[0]!.turns[0]!,
              id: `turn-${index}`,
              orderIndex: index,
              contentHash: `turn-hash-${index}`
            }))
          }
        ]
      })
    ).toBe(false);
  });
  it("rejects vault exports that exceed total import scale limits", () => {
    const tooManyArchivesResult = validateVaultExport({
      ...vault,
      archives: Array.from({ length: MAX_VAULT_IMPORT_ARCHIVE_COUNT + 1 }, (_, index) => ({
        archive: {
          ...vault.archives[0]!.archive,
          id: `archive-${index}`,
          contentHash: `archive-hash-${index}`
        },
        turns: []
      }))
    });

    expect(tooManyArchivesResult.ok).toBe(false);

    if (!tooManyArchivesResult.ok) {
      expect(tooManyArchivesResult.issues).toContainEqual({
        path: "$.archives",
        message: `must contain ${MAX_VAULT_IMPORT_ARCHIVE_COUNT} archives or fewer`
      });
    }

    const tooManyTurnsResult = validateVaultExport({
      ...vault,
      archives: Array.from(
        { length: Math.floor(MAX_VAULT_IMPORT_SOURCE_TURN_COUNT / MAX_SOURCE_TURNS_PER_ARCHIVE) + 1 },
        (_, archiveIndex) => ({
          archive: {
            ...vault.archives[0]!.archive,
            id: `archive-turn-total-${archiveIndex}`,
            contentHash: `archive-turn-total-hash-${archiveIndex}`
          },
          turns: Array.from({ length: MAX_SOURCE_TURNS_PER_ARCHIVE }, (_, turnIndex) => ({
            ...vault.archives[0]!.turns[0]!,
            id: `turn-total-${archiveIndex}-${turnIndex}`,
            archiveId: `archive-turn-total-${archiveIndex}`,
            orderIndex: turnIndex,
            contentHash: `turn-total-hash-${archiveIndex}-${turnIndex}`
          }))
        })
      )
    });

    expect(tooManyTurnsResult.ok).toBe(false);

    if (!tooManyTurnsResult.ok) {
      expect(tooManyTurnsResult.issues).toContainEqual({
        path: "$.archives",
        message: `must contain ${MAX_VAULT_IMPORT_SOURCE_TURN_COUNT} source turns or fewer`
      });
    }

    const tooManyCardsResult = validateVaultExport({
      ...vault,
      memoryCards: Array.from({ length: MAX_VAULT_IMPORT_MEMORY_CARD_COUNT + 1 }, (_, index) => ({
        ...vault.memoryCards[0]!,
        id: `card-${index}`,
        sourceAnchors: [
          {
            ...vault.memoryCards[0]!.sourceAnchors[0]!,
            id: `anchor-${index}`
          }
        ]
      }))
    });

    expect(tooManyCardsResult.ok).toBe(false);

    if (!tooManyCardsResult.ok) {
      expect(tooManyCardsResult.issues).toContainEqual({
        path: "$.memoryCards",
        message: `must contain ${MAX_VAULT_IMPORT_MEMORY_CARD_COUNT} memory cards or fewer`
      });
    }
  });
  it("rejects oversized memory card metadata, tags, anchors, and quotes", () => {
    const sourceAnchors = Array.from({ length: MAX_SOURCE_ANCHORS_PER_MEMORY_CARD + 1 }, (_, index) => ({
      id: `anchor-extra-${index}`,
      archiveId: "archive-1",
      turnId: "turn-1"
    }));

    const result = validateVaultExport({
      ...vault,
      memoryCards: [
        {
          ...vault.memoryCards[0]!,
          id: "c".repeat(MAX_METADATA_ID_LENGTH + 1),
          batchId: "b".repeat(MAX_METADATA_ID_LENGTH + 1),
          projectId: "p".repeat(MAX_METADATA_ID_LENGTH + 1),
          owner: "o".repeat(MAX_MEMORY_CARD_OWNER_LENGTH + 1),
          tags: Array.from({ length: MAX_MEMORY_CARD_TAG_COUNT + 1 }, (_, index) => `tag-${index}`),
          sourceAnchors
        }
      ]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          { path: "$.memoryCards[0].id", message: `must be ${MAX_METADATA_ID_LENGTH} characters or fewer` },
          { path: "$.memoryCards[0].owner", message: `must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer` },
          { path: "$.memoryCards[0].tags", message: `must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer` },
          {
            path: "$.memoryCards[0].sourceAnchors",
            message: `must contain ${MAX_SOURCE_ANCHORS_PER_MEMORY_CARD} source anchors or fewer`
          }
        ])
      );
    }

    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            tags: ["x".repeat(MAX_MEMORY_CARD_TAG_LENGTH + 1)]
          }
        ]
      })
    ).toBe(false);

    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0]!,
            turns: [
              {
                ...vault.archives[0]!.turns[0]!,
                text: "x".repeat(MAX_SOURCE_ANCHOR_QUOTE_LENGTH + 1)
              }
            ]
          }
        ],
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            body: "Use long quote anchors.",
            sourceAnchors: [
              {
                ...vault.memoryCards[0]!.sourceAnchors[0]!,
                quote: "x".repeat(MAX_SOURCE_ANCHOR_QUOTE_LENGTH + 1)
              }
            ]
          }
        ]
      })
    ).toBe(false);
  });
  it("rejects exports with malformed memory card fields", () => {
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            title: ""
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            title: "x".repeat(MAX_MEMORY_CARD_TITLE_LENGTH + 1)
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            body: "   "
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            body: "x".repeat(MAX_MEMORY_CARD_BODY_LENGTH + 1)
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            confidence: 1.2
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            tags: ["#ChatGPT", "chatgpt"]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            owner: 42
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            acceptedAt: "not-a-date"
          }
        ]
      })
    ).toBe(false);
  });

  it("rejects exports with broken source references", () => {
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: []
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              {
                ...vault.archives[0]!.turns[0],
                archiveId: "archive-other"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-broken",
                archiveId: "archive-missing",
                turnId: "turn-1"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-broken",
                archiveId: "archive-1",
                turnId: "turn-missing"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [vault.archives[0], vault.archives[0]]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          vault.archives[0]!,
          {
            ...vault.archives[0]!,
            archive: {
              ...vault.archives[0]!.archive,
              id: "archive-2"
            },
            turns: [
              {
                ...vault.archives[0]!.turns[0],
                id: "turn-2",
                archiveId: "archive-2"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [vault.archives[0]!.turns[0], vault.archives[0]!.turns[0]]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        archives: [
          {
            ...vault.archives[0],
            turns: [
              vault.archives[0]!.turns[0],
              {
                ...vault.archives[0]!.turns[0],
                id: "turn-2",
                contentHash: "turn-hash-2"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [vault.memoryCards[0]!, vault.memoryCards[0]!]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          vault.memoryCards[0]!,
          {
            ...vault.memoryCards[0]!,
            id: "card-2"
          }
        ]
      })
    ).toBe(false);
  });

  it("rejects source anchors with invalid spans or quotes", () => {
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-fractional-span",
                archiveId: "archive-1",
                turnId: "turn-1",
                charStart: 0.5,
                charEnd: 3
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "",
                archiveId: "archive-1",
                turnId: "turn-1"
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-bad-span",
                archiveId: "archive-1",
                turnId: "turn-1",
                charStart: 0
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-bad-span",
                archiveId: "archive-1",
                turnId: "turn-1",
                charStart: 0,
                charEnd: 999
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-bad-quote",
                archiveId: "archive-1",
                turnId: "turn-1",
                quote: "Use popup UI."
              }
            ]
          }
        ]
      })
    ).toBe(false);
    expect(
      isVaultExport({
        ...vault,
        memoryCards: [
          {
            ...vault.memoryCards[0]!,
            sourceAnchors: [
              {
                id: "anchor-mismatch",
                archiveId: "archive-1",
                turnId: "turn-1",
                charStart: 0,
                charEnd: 3,
                quote: "side"
              }
            ]
          }
        ]
      })
    ).toBe(false);
  });
});

describe("runtime message validation", () => {
  it("accepts valid runtime requests", () => {
    expect(isRuntimeRequest({ type: "GET_ACTIVE_TAB_CONTEXT" })).toBe(true);
    expect(isRuntimeRequest({ type: "GET_ARCHIVE", archiveId: "archive-1" })).toBe(true);
    expect(isRuntimeRequest({ type: "AUDIT_VAULT_INTEGRITY" })).toBe(true);
    expect(isRuntimeRequest({ type: "EXPORT_MARKDOWN", status: "accepted", redactSensitive: true })).toBe(true);
    expect(isRuntimeRequest({ type: "SEARCH_MEMORY_CARDS", query: "side panel", status: "accepted" })).toBe(true);
    expect(
      isRuntimeRequest({
        type: "SEARCH_MEMORY_CARDS",
        query: "x".repeat(MAX_SEARCH_QUERY_LENGTH),
        status: "accepted"
      })
    ).toBe(true);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: {
          title: "Manual ContextVault memory",
          body: "Use manual memories when page capture is unavailable.",
          type: "method",
          scope: "project",
          tags: ["manual"]
        }
      })
    ).toBe(true);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: {
          title: "Manual todo",
          body: "Follow up on manual recall UX.",
          type: "todo",
          scope: "project",
          owner: "wyh",
          dueAt: "2026-06-09T00:00:00.000Z"
        }
      })
    ).toBe(true);
    expect(
      isRuntimeRequest({
        type: "SEARCH_MEMORY_CARDS",
        query: "",
        status: "accepted",
        memoryType: "todo",
        memoryScope: "project"
      })
    ).toBe(true);
    expect(isRuntimeRequest({ type: "IMPORT_VAULT", vault })).toBe(true);
    expect(isRuntimeRequest({ type: "IMPORT_CONVERSATION_CAPTURES", captures: [] })).toBe(true);
  });

  it("rejects runtime requests with unexpected fields", () => {
    expect(isRuntimeRequest({ type: "GET_ACTIVE_TAB_CONTEXT", archiveId: "archive-1" })).toBe(false);
    expect(isRuntimeRequest({ type: "AUDIT_VAULT_INTEGRITY", repair: true })).toBe(false);
    expect(isRuntimeRequest({ type: "GET_ARCHIVE", archiveId: "archive-1", cardId: "card-1" })).toBe(false);
    expect(isRuntimeRequest({ type: "LIST_MEMORY_CARDS", status: "accepted", includeSource: true })).toBe(false);
    expect(isRuntimeRequest({ type: "EXPORT_MARKDOWN", status: "accepted", format: "html" })).toBe(false);
    expect(isRuntimeRequest({ type: "SEARCH_MEMORY_CARDS", query: "side panel", includeDrafts: true })).toBe(false);
    expect(isRuntimeRequest({ type: "IMPORT_VAULT", vault, overwrite: true })).toBe(false);
    expect(isRuntimeRequest({ type: "IMPORT_CONVERSATION_CAPTURES", captures: [], provider: "chatgpt" })).toBe(false);
  });

  it("rejects malformed runtime requests before they reach handlers", () => {
    expect(isRuntimeRequest({ type: "UNKNOWN" })).toBe(false);
    expect(isRuntimeRequest({ type: "GET_ARCHIVE" })).toBe(false);
    expect(isRuntimeRequest({ type: "GET_ARCHIVE", archiveId: "x".repeat(MAX_METADATA_ID_LENGTH + 1) })).toBe(false);
    expect(isRuntimeRequest({ type: "DELETE_ARCHIVE", archiveId: "x".repeat(MAX_METADATA_ID_LENGTH + 1) })).toBe(false);
    expect(isRuntimeRequest({ type: "DELETE_MEMORY_CARD", cardId: "" })).toBe(false);
    expect(isRuntimeRequest({ type: "DELETE_MEMORY_CARD", cardId: "x".repeat(MAX_METADATA_ID_LENGTH + 1) })).toBe(false);
    expect(isRuntimeRequest({ type: "LIST_MEMORY_CARDS", status: "all" })).toBe(false);
    expect(isRuntimeRequest({ type: "EXPORT_MARKDOWN", redactSensitive: "yes" })).toBe(false);
    expect(isRuntimeRequest({ type: "SEARCH_MEMORY_CARDS", query: 42 })).toBe(false);
    expect(
      isRuntimeRequest({
        type: "SEARCH_MEMORY_CARDS",
        query: "x".repeat(MAX_SEARCH_QUERY_LENGTH + 1)
      })
    ).toBe(false);
    expect(isRuntimeRequest({ type: "SEARCH_MEMORY_CARDS", query: "", memoryType: "note" })).toBe(false);
    expect(isRuntimeRequest({ type: "SEARCH_MEMORY_CARDS", query: "", memoryScope: "workspace" })).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: { title: "", body: "Body", type: "method", scope: "project" }
      })
    ).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: { title: "Manual", body: "Body", type: "note", scope: "project" }
      })
    ).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: { title: "Manual", body: "Body", type: "todo", scope: "project", dueAt: "tomorrow" }
      })
    ).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: { title: "Manual", body: "Body", type: "decision", scope: "project", owner: "wyh" }
      })
    ).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: {
          title: "Manual",
          body: "A".repeat(MAX_MANUAL_MEMORY_BODY_LENGTH + 1),
          type: "method",
          scope: "project"
        }
      })
    ).toBe(false);
    expect(
      isRuntimeRequest({
        type: "CREATE_MANUAL_MEMORY_CARD",
        input: { title: "Manual", body: "Body", type: "method", scope: "project", tags: ["###"] }
      })
    ).toBe(false);
    expect(isRuntimeRequest({ type: "IMPORT_VAULT" })).toBe(false);
    expect(isRuntimeRequest({ type: "IMPORT_CONVERSATION_CAPTURES" })).toBe(false);
  });

  it("validates content script requests", () => {
    expect(isContentRequest({ type: "CAPTURE_DOM", provider: "chatgpt" })).toBe(true);
    expect(isContentRequest({ type: "CAPTURE_DOM", provider: "chatgpt", tabId: 1 })).toBe(false);
    expect(isContentRequest({ type: "CAPTURE_DOM", provider: "generic" })).toBe(false);
    expect(isContentRequest({ type: "CAPTURE_DOM", provider: "unknown" })).toBe(false);
    expect(isContentRequest({ type: "CAPTURE_DOM", provider: "unknown-site" })).toBe(false);
    expect(isContentRequest({ type: "CAPTURE_NETWORK", provider: "chatgpt" })).toBe(false);
  });

  it("validates MAIN world network bridge messages", () => {
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(true);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://gemini.google.com/app/stream",
          method: "POST",
          status: 200,
          contentType: "text/event-stream",
          text: "data: {}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(true);
    expect(isMainWorldNetworkMessage({ source: "contextvault-main-world", type: "NETWORK_RESPONSE" })).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        },
        secret: "unexpected"
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z",
          requestHeaders: {}
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "other",
        type: "NETWORK_RESPONSE",
        payload: {}
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/assets/app.js",
          method: "GET",
          status: 200,
          contentType: "text/plain",
          text: "console.log('not a conversation response')",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/api/auth/session",
          method: "GET",
          status: 200,
          contentType: "application/json",
          text: '{"user":"alice@example.com"}',
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "javascript:alert(1)",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "post",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "TRACE",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: Number.NaN,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 99,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 600,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200.5,
          contentType: "application/json",
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "a".repeat(201),
          text: "{}",
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "{}",
          capturedAt: "not-a-date"
        }
      })
    ).toBe(false);
    expect(
      isMainWorldNetworkMessage({
        source: "contextvault-main-world",
        type: "NETWORK_RESPONSE",
        payload: {
          url: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          contentType: "application/json",
          text: "x".repeat(MAX_SOURCE_TURN_TEXT_LENGTH + 1),
          capturedAt: "2026-06-08T00:00:00.000Z"
        }
      })
    ).toBe(false);
  });

  it("redacts protected values when formatting validation issue details", () => {
    const result = validateVaultExport({
      ...vault,
      memoryCards: [
        {
          ...vault.memoryCards[0]!,
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-alice@example.com",
              turnId: "turn-1",
              quote: "Use the side panel."
            },
            {
              id: "anchor-2",
              archiveId: "archive-1",
              turnId: "turn-sk-abcdefghijklmnopqrstuvwxyz123456",
              quote: "Use the side panel."
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const formatted = formatValidationIssues(result.issues);

      expect(formatted).toContain("$.memoryCards[0].sourceAnchors[0].archiveId");
      expect(formatted).toContain("[REDACTED_EMAIL]");
      expect(formatted).toContain("[REDACTED_OPENAI_KEY]");
      expect(formatted).not.toContain("alice@example.com");
      expect(formatted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    }
  });
});

describe("conversation capture validation", () => {
  const capture = {
    provider: "chatgpt",
    title: "Capture fixture",
    url: "https://chatgpt.com/c/fixture",
    capturedAt: "2026-06-08T00:00:00.000Z",
    captureMethod: "dom",
    warnings: [{ code: "dom_fallback", message: "Captured from DOM." }],
    turns: [
      {
        role: "assistant",
        text: "Use the side panel review workflow.",
        sourceSelector: "[data-message-author-role]"
      }
    ]
  };

  it("accepts valid conversation captures", () => {
    expect(isConversationCapture(capture)).toBe(true);
  });

  it("rejects oversized conversation capture metadata", () => {
    const result = validateConversationCapture({
      ...capture,
      providerConversationId: "c".repeat(MAX_METADATA_ID_LENGTH + 1),
      title: "t".repeat(MAX_SOURCE_TITLE_LENGTH + 1),
      url: `https://chatgpt.com/c/${"u".repeat(MAX_URL_LENGTH)}`,
      contentHash: "h".repeat(MAX_CONTENT_HASH_LENGTH + 1),
      turns: [
        {
          ...capture.turns[0],
          id: "t".repeat(MAX_METADATA_ID_LENGTH + 1),
          providerTurnId: "p".repeat(MAX_METADATA_ID_LENGTH + 1),
          sourceSelector: "s".repeat(MAX_SOURCE_SELECTOR_LENGTH + 1)
        }
      ]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          { path: "$.providerConversationId", message: `must be ${MAX_METADATA_ID_LENGTH} characters or fewer` },
          { path: "$.title", message: `must be ${MAX_SOURCE_TITLE_LENGTH} characters or fewer` },
          { path: "$.url", message: `must be ${MAX_URL_LENGTH} characters or fewer` },
          { path: "$.turns[0].sourceSelector", message: `must be ${MAX_SOURCE_SELECTOR_LENGTH} characters or fewer` }
        ])
      );
    }
  });
  it("rejects oversized capture turns and per-capture turn lists", () => {
    const oversizedTurnResult = validateConversationCapture({
      ...capture,
      turns: [
        {
          role: "assistant",
          text: "x".repeat(MAX_SOURCE_TURN_TEXT_LENGTH + 1)
        }
      ]
    });

    expect(oversizedTurnResult.ok).toBe(false);

    if (!oversizedTurnResult.ok) {
      expect(oversizedTurnResult.issues).toContainEqual({
        path: "$.turns[0].text",
        message: `must be ${MAX_SOURCE_TURN_TEXT_LENGTH} characters or fewer`
      });
    }

    const oversizedTurnsResult = validateConversationCapture({
      ...capture,
      turns: Array.from({ length: MAX_SOURCE_TURNS_PER_ARCHIVE + 1 }, () => ({
        role: "assistant",
        text: "Use bounded capture imports."
      }))
    });

    expect(oversizedTurnsResult.ok).toBe(false);

    if (!oversizedTurnsResult.ok) {
      expect(oversizedTurnsResult.issues).toContainEqual({
        path: "$.turns",
        message: `must contain ${MAX_SOURCE_TURNS_PER_ARCHIVE} turns or fewer`
      });
    }
  });
  it("rejects conversation captures with too many warnings", () => {
    const result = validateConversationCapture({
      ...capture,
      warnings: Array.from({ length: MAX_CAPTURE_WARNING_COUNT + 1 }, (_, index) => ({
        code: `warning-${index}`,
        message: "Captured with bounded warnings."
      }))
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.warnings",
        message: `must contain ${MAX_CAPTURE_WARNING_COUNT} warnings or fewer`
      });
    }
  });

  it("reports path-level issues for malformed conversation captures", () => {
    const result = validateConversationCapture({
      ...capture,
      provider: "bard",
      capturedAt: "not-a-date",
      turns: [
        {
          role: "developer",
          text: " "
        }
      ],
      warnings: [{ code: "dom_fallback" }]
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          { path: "$.provider", message: "must be a supported provider" },
          { path: "$.capturedAt", message: "must be an ISO date string" },
          { path: "$.turns[0].role", message: "must be a supported source role" },
          { path: "$.turns[0].text", message: "must be a non-empty string" },
          { path: "$.warnings[0].message", message: "must be a non-empty string" }
        ])
      );
    }
  });
});
