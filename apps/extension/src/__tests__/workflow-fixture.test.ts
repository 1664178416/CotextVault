/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  formatMemoryCardsForPrompt,
  type ArchiveWithTurns,
  type DeleteArchiveResult,
  type DeleteMemoryCardResult,
  type ImportVaultResult,
  type MemoryCard,
  type MemoryCardStatus,
  type SourceAnchor,
  type SourceArchive,
  type SourceTurn,
  type VaultIntegrityReport,
  type VaultExport
} from "@contextvault/shared";
import { captureConversationFromDom } from "../content/dom-capture";
import { createVaultService, type VaultRepository } from "../vault/vault-service";

class MemoryRepository implements VaultRepository {
  archives = new Map<string, SourceArchive>();
  turns = new Map<string, SourceTurn>();
  cards = new Map<string, MemoryCard>();

  async saveArchiveWithTurns(archive: SourceArchive, turns: SourceTurn[]): Promise<void> {
    this.archives.set(archive.id, archive);

    for (const turn of turns) {
      this.turns.set(turn.id, turn);
    }
  }

  async saveMemoryCards(cards: MemoryCard[]): Promise<void> {
    for (const card of cards) {
      this.cards.set(card.id, card);
    }
  }

  async findArchiveByContentHash(contentHash: string): Promise<SourceArchive | undefined> {
    return [...this.archives.values()].find((archive) => archive.contentHash === contentHash);
  }

  async listArchives(): Promise<SourceArchive[]> {
    return [...this.archives.values()].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  async getArchiveWithTurns(archiveId: string): Promise<ArchiveWithTurns> {
    const archive = this.archives.get(archiveId);

    if (!archive) {
      throw new Error(`Archive not found: ${archiveId}`);
    }

    return {
      archive,
      turns: [...this.turns.values()]
        .filter((turn) => turn.archiveId === archiveId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    };
  }

  async listMemoryCards(status?: MemoryCardStatus): Promise<MemoryCard[]> {
    return [...this.cards.values()]
      .filter((card) => (status ? card.status === status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMemoryCard(cardId: string): Promise<MemoryCard | undefined> {
    return this.cards.get(cardId);
  }

  async updateMemoryCard(card: MemoryCard): Promise<MemoryCard> {
    this.cards.set(card.id, card);
    return card;
  }

  async deleteMemoryCard(cardId: string): Promise<DeleteMemoryCardResult> {
    this.cards.delete(cardId);
    return { cardId };
  }

  async deleteArchiveCascade(archiveId: string): Promise<DeleteArchiveResult> {
    const turns = [...this.turns.values()].filter((turn) => turn.archiveId === archiveId);
    const cards = [...this.cards.values()].filter((card) =>
      card.sourceAnchors.some((anchor) => anchor.archiveId === archiveId)
    );

    this.archives.delete(archiveId);

    for (const turn of turns) {
      this.turns.delete(turn.id);
    }

    for (const card of cards) {
      this.cards.delete(card.id);
    }

    return {
      archiveId,
      deletedTurnCount: turns.length,
      deletedMemoryCardCount: cards.length,
      updatedMemoryCardCount: 0
    };
  }

  async auditVaultIntegrity(): Promise<VaultIntegrityReport> {
    return {
      checkedAt: "2026-06-08T00:00:00.000Z",
      archiveCount: this.archives.size,
      sourceTurnCount: this.turns.size,
      memoryCardCount: this.cards.size,
      issueCount: 0,
      omittedIssueCount: 0,
      issues: []
    };
  }

  async exportVault(): Promise<VaultExport> {
    const archives = await Promise.all([...this.archives.keys()].map((archiveId) => this.getArchiveWithTurns(archiveId)));

    return {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives,
      memoryCards: [...this.cards.values()]
    };
  }

  async importVault(vault: VaultExport): Promise<ImportVaultResult> {
    let turnCount = 0;

    for (const archiveWithTurns of vault.archives) {
      this.archives.set(archiveWithTurns.archive.id, archiveWithTurns.archive);

      for (const turn of archiveWithTurns.turns) {
        this.turns.set(turn.id, turn);
        turnCount += 1;
      }
    }

    for (const card of vault.memoryCards) {
      this.cards.set(card.id, card);
    }

    return {
      archiveCount: vault.archives.length,
      turnCount,
      memoryCardCount: vault.memoryCards.length
    };
  }
}

function resolveAnchorText(archive: ArchiveWithTurns, anchor: SourceAnchor): string {
  const turn = archive.turns.find((candidate) => candidate.id === anchor.turnId);

  if (!turn) {
    throw new Error(`Missing source turn: ${anchor.turnId}`);
  }

  if (typeof anchor.charStart === "number" && typeof anchor.charEnd === "number") {
    return turn.text.slice(anchor.charStart, anchor.charEnd);
  }

  return anchor.quote ?? "";
}

describe("fixture workflow", () => {
  beforeEach(() => {
    document.title = "ContextVault workflow fixture";
    document.body.innerHTML = "";
  });

  it("captures a provider DOM fixture, reviews memory, searches, copies context, and preserves source anchors", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">Design ContextVault as a reviewed AI work memory system.</div>
        <div data-message-author-role="assistant">
          Use Chrome Side Panel as the capture and review surface.
          Next implement the ChatGPT adapter and build fixture tests.
          Workflow checklist: capture raw turns, extract memory cards, accept useful cards, search accepted memory, and copy prompt-ready context.
        </div>
      </main>
    `;
    const capture = captureConversationFromDom("chatgpt");
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    let nextId = 0;

    expect(capture.turns).toHaveLength(2);
    expect(capture.warnings.map((warning) => warning.code)).toEqual(["dom_fallback"]);

    const captureResult = await service.captureConversation(capture, {
      archiveId: "archive-workflow",
      createId: () => `id-${++nextId}`,
      hash: async (text) => `hash:${text.length}:${text.slice(0, 40)}`
    });

    expect(captureResult.archive.warnings.map((warning) => warning.code)).toContain("dom_fallback");
    expect(captureResult.turns.map((turn) => turn.sourceSelector)).toEqual([
      "[data-message-author-role]",
      "[data-message-author-role]"
    ]);

    const proposedCards = await service.listMemoryCards("proposed");
    expect(proposedCards.map((card) => card.type)).toEqual(expect.arrayContaining(["decision", "todo", "method"]));
    expect(proposedCards.some((card) => card.type === "method" && card.body.includes("Workflow checklist"))).toBe(true);

    const acceptedDraft = proposedCards.find((card) => card.type === "decision" && card.body.includes("Side Panel"));

    if (!acceptedDraft) {
      throw new Error("Expected a source-grounded Side Panel decision card.");
    }

    const acceptedCard = await service.updateMemoryCard({
      ...acceptedDraft,
      status: "accepted",
      acceptedAt: "2026-06-08T00:01:00.000Z"
    });
    const [anchor] = acceptedCard.sourceAnchors;

    if (!anchor) {
      throw new Error("Expected an accepted memory card source anchor.");
    }

    const archive = await service.getArchiveWithTurns(anchor.archiveId);
    expect(archive.archive.id).toBe("archive-workflow");
    expect(resolveAnchorText(archive, anchor)).toBe(anchor.quote);

    const searchResults = await service.searchMemoryCards("side panel", "accepted", "decision");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.matchedFields).toContain("body");

    const promptContext = formatMemoryCardsForPrompt(searchResults.map((result) => result.card));
    expect(promptContext).toContain("Relevant Context:");
    expect(promptContext).toContain("Use Chrome Side Panel as the capture and review surface.");
    expect(promptContext).toContain("Source: archive=archive-workflow");
    expect(formatMemoryCardsForPrompt(searchResults.map((result) => result.card), { redactSensitive: true })).toContain(
      "Relevant Context:"
    );

    const markdown = await service.exportMarkdown("accepted");
    expect(markdown).toContain("ContextVault Accepted Memories");
    expect(markdown).toContain("archive=archive-workflow");

    const exportedVault = await service.exportVault();
    const importedService = createVaultService(new MemoryRepository());

    await importedService.importVault(exportedVault);
    expect(await importedService.searchMemoryCards("side panel", "accepted", "decision")).toHaveLength(1);
  });
});
