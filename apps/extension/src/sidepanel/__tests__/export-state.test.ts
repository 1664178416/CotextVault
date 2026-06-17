import { describe, expect, it } from "vitest";
import type { ArchiveWithTurns, MemoryCard, VaultExport } from "@contextvault/shared";
import {
  canExportMarkdownForScope,
  formatArchiveExportDisclosureMessage,
  formatVaultExportDisclosureMessage,
  prepareVaultExportDownload,
  shouldConfirmMemoryDisclosure
} from "../export-state";

function card(overrides: Partial<MemoryCard>): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "ContextVault",
    body: overrides.body ?? "Use source-grounded memories.",
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

function vaultExport(overrides: Partial<VaultExport> = {}): VaultExport {
  const archives: ArchiveWithTurns[] = [
    {
      archive: {
        id: "archive-1",
        provider: "chatgpt",
        title: "ContextVault planning",
        url: "https://chatgpt.com/c/example",
        captureMethod: "official_export",
        capturedAt: "2026-06-08T00:00:00.000Z",
        contentHash: "hash-1",
        schemaVersion: 1,
        warnings: []
      },
      turns: [
        {
          id: "turn-1",
          archiveId: "archive-1",
          role: "assistant",
          text: "Use source-grounded memories.",
          orderIndex: 0,
          contentHash: "turn-hash-1"
        }
      ]
    }
  ];

  return {
    schemaVersion: 1,
    exportedAt: "2026-06-08T00:00:00.000Z",
    archives: overrides.archives ?? archives,
    memoryCards: overrides.memoryCards ?? [card({ id: "card-1" })]
  };
}

describe("side panel export state", () => {
  it("enables Markdown export for the exact requested scope", () => {
    const accepted = [card({ id: "accepted", status: "accepted" })];
    const proposed = [card({ id: "proposed", status: "proposed" })];
    const all = [...accepted, ...proposed];

    expect(canExportMarkdownForScope("accepted", { accepted, proposed, all })).toBe(true);
    expect(canExportMarkdownForScope("proposed", { accepted, proposed, all })).toBe(true);
    expect(canExportMarkdownForScope("all", { accepted, proposed, all })).toBe(true);
  });

  it("keeps all-memory export enabled when only non-visible statuses exist", () => {
    const all = [card({ id: "rejected", status: "rejected" })];

    expect(canExportMarkdownForScope("accepted", { accepted: [], proposed: [], all })).toBe(false);
    expect(canExportMarkdownForScope("proposed", { accepted: [], proposed: [], all })).toBe(false);
    expect(canExportMarkdownForScope("all", { accepted: [], proposed: [], all })).toBe(true);
  });

  it("requires disclosure confirmation only for unredacted sensitive output", () => {
    const normal = card({ id: "normal", sensitivity: "normal" });
    const sensitive = card({ id: "sensitive", sensitivity: "sensitive" });
    const secret = card({ id: "secret", sensitivity: "secret" });

    expect(shouldConfirmMemoryDisclosure([normal])).toBe(false);
    expect(shouldConfirmMemoryDisclosure([sensitive])).toBe(true);
    expect(shouldConfirmMemoryDisclosure([secret])).toBe(true);
    expect(shouldConfirmMemoryDisclosure([sensitive, secret], { redactSensitive: true })).toBe(false);
  });

  it("requires disclosure confirmation when card sensitivity labels are stale", () => {
    expect(
      shouldConfirmMemoryDisclosure([
        card({
          id: "stale",
          sensitivity: "normal",
          body: "Contact alice@example.com before launch."
        })
      ])
    ).toBe(true);
  });

  it("requires disclosure confirmation for malformed cards with currently sensitive content", () => {
    expect(
      shouldConfirmMemoryDisclosure([
        {
          ...card({ id: "malformed" }),
          title: 42,
          body: "Contact alice@example.com before launch.",
          sensitivity: "unknown",
          tags: "not-tags"
        } as unknown as MemoryCard
      ])
    ).toBe(true);
  });

  it("prepares vault export JSON without a large-export warning when under threshold", () => {
    const prepared = prepareVaultExportDownload(vaultExport(), { largeExportBytes: 1024 * 1024 });

    expect(JSON.parse(prepared.text)).toMatchObject({ schemaVersion: 1 });
    expect(prepared.byteLength).toBeGreaterThan(0);
    expect(prepared.largeExportWarning).toBeUndefined();
  });

  it("formats full-vault export disclosure with exact content counts", () => {
    const message = formatVaultExportDisclosureMessage(vaultExport());

    expect(message).toContain("Export full ContextVault JSON with 1 archive(s) and 1 memory card(s).");
    expect(message).toContain("Raw archives can contain complete captured conversation text.");
    expect(message).toContain("Continue exporting?");
    expect(message).not.toContain("Memory cards include");
    expect(message).not.toContain("Archive warnings mark");
  });

  it("formats raw archive export disclosure with exact turn counts", () => {
    const [archiveWithTurns] = vaultExport().archives;
    const message = formatArchiveExportDisclosureMessage(archiveWithTurns!);

    expect(message).toContain("Export raw ContextVault archive JSON with 1 source turn(s).");
    expect(message).toContain("Raw archives can contain complete captured conversation text.");
    expect(message).toContain("Continue exporting?");
    expect(message).not.toContain("Archive warnings mark");
  });

  it("includes archive warning and source-turn sensitivity in raw archive disclosure", () => {
    const [baseArchive] = vaultExport().archives;
    const message = formatArchiveExportDisclosureMessage({
      ...baseArchive!,
      archive: {
        ...baseArchive!.archive,
        warnings: [
          {
            code: "secret_content_detected",
            message: "Captured archive appears to contain secrets."
          }
        ]
      },
      turns: [
        {
          ...baseArchive!.turns[0]!,
          text: "Contact alice@example.com before launch."
        },
        {
          ...baseArchive!.turns[0]!,
          id: "turn-2",
          contentHash: "turn-hash-2",
          orderIndex: 1,
          text: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
        }
      ]
    });

    expect(message).toContain("Archive has 1 capture warning(s).");
    expect(message).toContain("Archive warnings mark this archive as secret.");
    expect(message).toContain("Source turns currently include 1 secret and 1 sensitive turn(s).");
    expect(message).not.toContain("alice@example.com");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("includes sensitive memory and archive warning summaries in full-vault export disclosure", () => {
    const baseVault = vaultExport();
    const [baseArchive] = baseVault.archives;
    const message = formatVaultExportDisclosureMessage(
      vaultExport({
        archives: [
          {
            ...baseArchive!,
            archive: {
              ...baseArchive!.archive,
              warnings: [
                {
                  code: "secret_content_detected",
                  message: "Captured archive appears to contain secrets."
                }
              ]
            }
          },
          {
            ...baseArchive!,
            archive: {
              ...baseArchive!.archive,
              id: "archive-2",
              contentHash: "hash-2",
              warnings: [
                {
                  code: "sensitive_content_detected",
                  message: "Captured archive appears to contain sensitive content."
                }
              ]
            }
          }
        ],
        memoryCards: [
          card({ id: "secret", sensitivity: "secret" }),
          card({ id: "stale", sensitivity: "normal", body: "Contact alice@example.com before launch." })
        ]
      })
    );

    expect(message).toContain("2 archive(s) and 2 memory card(s)");
    expect(message).toContain("Memory cards include 1 secret, 1 sensitive");
    expect(message).toContain("Archive warnings mark 1 secret and 1 sensitive archive(s).");
  });

  it("includes source-turn sensitivity even when archive warnings are missing", () => {
    const baseVault = vaultExport();
    const [baseArchive] = baseVault.archives;
    const message = formatVaultExportDisclosureMessage(
      vaultExport({
        archives: [
          {
            ...baseArchive!,
            turns: [
              {
                ...baseArchive!.turns[0]!,
                text: "Contact alice@example.com before launch."
              },
              {
                ...baseArchive!.turns[0]!,
                id: "turn-2",
                contentHash: "turn-hash-2",
                orderIndex: 1,
                text: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
              }
            ]
          }
        ]
      })
    );

    expect(message).toContain("Source turns currently include 1 secret and 1 sensitive turn(s).");
    expect(message).not.toContain("alice@example.com");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("warns before downloading a large full-vault export", () => {
    const prepared = prepareVaultExportDownload(vaultExport(), { largeExportBytes: 1 });

    expect(prepared.largeExportWarning).toContain("ContextVault export is large");
    expect(prepared.largeExportWarning).toContain("1 archive(s)");
    expect(prepared.largeExportWarning).toContain("1 memory card(s)");
    expect(prepared.largeExportWarning).toContain("1 B");
  });
});
