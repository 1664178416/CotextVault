import { describe, expect, it } from "vitest";
import type { MemoryCard, SourceArchive } from "@contextvault/shared";
import {
  formatArchiveDeleteConfirmation,
  formatArchiveDeleteResultMessage,
  formatArchiveTitleForDisplay,
  getArchiveReferencedCards
} from "../archive-state";

function archive(overrides: Partial<SourceArchive> = {}): SourceArchive {
  return {
    id: overrides.id ?? "archive-1",
    provider: overrides.provider ?? "chatgpt",
    title: overrides.title ?? "ContextVault design",
    captureMethod: overrides.captureMethod ?? "dom",
    capturedAt: overrides.capturedAt ?? "2026-06-08T00:00:00.000Z",
    contentHash: overrides.contentHash ?? "archive-hash",
    schemaVersion: overrides.schemaVersion ?? 1,
    warnings: overrides.warnings ?? []
  };
}

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "ContextVault",
    body: overrides.body ?? "Use source-grounded memory cards.",
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

describe("side panel archive state", () => {
  it("formats archive delete results with updated multi-source card counts", () => {
    expect(
      formatArchiveDeleteResultMessage({
        archiveId: "archive-1",
        deletedTurnCount: 2,
        deletedMemoryCardCount: 1,
        updatedMemoryCardCount: 3
      })
    ).toBe(
      "Deleted 1 archive and 2 source turns. Deleted 1 memory card. Updated 3 multi-source memory cards by removing stale anchors."
    );
  });

  it("omits updated card counts when archive deletion only removes cards", () => {
    expect(
      formatArchiveDeleteResultMessage({
        archiveId: "archive-1",
        deletedTurnCount: 1,
        deletedMemoryCardCount: 2,
        updatedMemoryCardCount: 0
      })
    ).toBe("Deleted 1 archive and 1 source turn. Deleted 2 memory cards.");
  });

  it("finds cards that reference an archive through any source anchor", () => {
    const cards = [
      card({ id: "same" }),
      card({
        id: "other",
        sourceAnchors: [
          {
            id: "anchor-2",
            archiveId: "archive-2",
            turnId: "turn-2"
          }
        ]
      }),
      card({
        id: "multi",
        sourceAnchors: [
          {
            id: "anchor-3",
            archiveId: "archive-2",
            turnId: "turn-3"
          },
          {
            id: "anchor-4",
            archiveId: "archive-1",
            turnId: "turn-4"
          }
        ]
      })
    ];

    expect(getArchiveReferencedCards(cards, "archive-1").map((item) => item.id)).toEqual(["same", "multi"]);
  });

  it("formats archive titles for list display without leaking protected values", () => {
    const { title: _title, ...untitledArchive } = archive();

    expect(formatArchiveTitleForDisplay(untitledArchive)).toBe("Untitled conversation");
    expect(formatArchiveTitleForDisplay(archive({ title: "Credential review alice@example.com" }))).toBe(
      "Credential review [REDACTED_EMAIL]"
    );
    expect(
      formatArchiveTitleForDisplay(
        archive({
          title: "Private Bluebird archive",
          warnings: [
            {
              code: "secret_content_detected",
              message: "Captured archive appears to contain secrets."
            }
          ]
        })
      )
    ).toBe("[REDACTED_SECRET_CONTENT]");
  });

  it("ignores malformed source anchors when finding referenced cards", () => {
    const cards = [
      { ...card({ id: "bad-array" }), sourceAnchors: "not-an-array" } as unknown as MemoryCard,
      {
        ...card({ id: "bad-anchor" }),
        sourceAnchors: [{ id: "anchor-bad", archiveId: "archive-1", turnId: 42 }]
      } as unknown as MemoryCard,
      card({ id: "valid" })
    ];

    expect(getArchiveReferencedCards(cards, "archive-1").map((item) => item.id)).toEqual(["valid"]);
  });

  it("formats delete confirmation with referenced memory status counts", () => {
    const message = formatArchiveDeleteConfirmation(archive(), [
      card({ id: "accepted", status: "accepted" }),
      card({ id: "proposed", status: "proposed" }),
      card({ id: "rejected", status: "rejected" })
    ]);

    expect(message).toContain("This affects 3 memory cards: accepted 1, proposed 1, rejected 1.");
    expect(message).toContain("3 memory cards reference only this archive and will be deleted.");
    expect(message).toContain("Accepted long-term memories are affected.");
    expect(message).toContain("Archive: ContextVault design");
  });

  it("formats delete confirmation for multi-source cards that will be preserved", () => {
    const message = formatArchiveDeleteConfirmation(archive(), [
      card({ id: "accepted", status: "accepted" }),
      card({
        id: "multi",
        status: "accepted",
        sourceAnchors: [
          { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" },
          { id: "anchor-2", archiveId: "archive-2", turnId: "turn-2" }
        ]
      })
    ]);

    expect(message).toContain("1 memory card references only this archive and will be deleted.");
    expect(message).toContain(
      "1 memory card also references other archives and will be kept with this archive's anchors removed."
    );
  });

  it("formats delete confirmations without counting malformed anchors as deletable sources", () => {
    const message = formatArchiveDeleteConfirmation(archive(), [
      { ...card({ id: "bad-array" }), sourceAnchors: "not-an-array" } as unknown as MemoryCard,
      card({ id: "valid" })
    ]);

    expect(message).toContain("This affects 1 memory card: accepted 1.");
    expect(message).toContain("1 memory card references only this archive and will be deleted.");
    expect(message).not.toContain("also reference other archives");
  });

  it("omits accepted-memory warning when no permanent memories are referenced", () => {
    const message = formatArchiveDeleteConfirmation(archive({ title: "" }), [
      card({ id: "proposed", status: "proposed" })
    ]);

    expect(message).toContain("proposed 1");
    expect(message).not.toContain("Accepted long-term memories");
    expect(message).not.toContain("Archive:");
  });

  it("redacts sensitive archive titles in delete confirmations", () => {
    const message = formatArchiveDeleteConfirmation(archive({ title: "Credential review alice@example.com" }), []);

    expect(message).toContain("Credential review [REDACTED_EMAIL]");
    expect(message).not.toContain("alice@example.com");
  });

  it("masks archive titles in delete confirmations when warnings mark unknown protected content", () => {
    const message = formatArchiveDeleteConfirmation(
      archive({
        title: "Private Bluebird archive",
        warnings: [
          {
            code: "secret_content_detected",
            message: "Captured archive appears to contain secrets."
          }
        ]
      }),
      []
    );

    expect(message).toContain("[REDACTED_SECRET_CONTENT]");
    expect(message).not.toContain("Bluebird");
  });
});
