import { describe, expect, it } from "vitest";
import type {
  ArchiveWithTurns,
  ConversationCapture,
  DeleteArchiveResult,
  DeleteMemoryCardResult,
  ImportVaultResult,
  MemoryCard,
  MemoryCardStatus,
  SourceArchive,
  SourceTurn,
  VaultIntegrityReport,
  VaultExport
} from "@contextvault/shared";
import {
  MAX_CONVERSATION_CAPTURE_IMPORT_COUNT,
  MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  MAX_MANUAL_MEMORY_BODY_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  MAX_VAULT_IMPORT_MEMORY_CARD_COUNT
} from "@contextvault/shared";
import { createVaultService, type VaultRepository } from "../vault-service";

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

  async saveArchiveWithTurnsAndCards(archive: SourceArchive, turns: SourceTurn[], cards: MemoryCard[]): Promise<void> {
    this.archives.set(archive.id, archive);

    for (const turn of turns) {
      this.turns.set(turn.id, turn);
    }

    for (const card of cards) {
      this.cards.set(card.id, card);
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

    const turns = [...this.turns.values()]
      .filter((turn) => turn.archiveId === archiveId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return { archive, turns };
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
    const cardsToDelete: MemoryCard[] = [];
    const cardsToUpdate: MemoryCard[] = [];

    this.archives.delete(archiveId);

    for (const card of this.cards.values()) {
      if (!card.sourceAnchors.some((anchor) => anchor.archiveId === archiveId)) {
        continue;
      }

      const remainingSourceAnchors = card.sourceAnchors.filter((anchor) => anchor.archiveId !== archiveId);

      if (remainingSourceAnchors.length === 0) {
        cardsToDelete.push(card);
      } else {
        cardsToUpdate.push({
          ...card,
          updatedAt: new Date().toISOString(),
          sourceAnchors: remainingSourceAnchors
        });
      }
    }

    for (const turn of turns) {
      this.turns.delete(turn.id);
    }

    for (const card of cardsToDelete) {
      this.cards.delete(card.id);
    }

    for (const card of cardsToUpdate) {
      this.cards.set(card.id, card);
    }

    return {
      archiveId,
      deletedTurnCount: turns.length,
      deletedMemoryCardCount: cardsToDelete.length,
      updatedMemoryCardCount: cardsToUpdate.length
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

function capture(): ConversationCapture {
  return {
    provider: "chatgpt",
    title: "Workflow fixture",
    url: "https://chatgpt.com/c/workflow",
    capturedAt: "2026-06-08T00:00:00.000Z",
    captureMethod: "dom",
    warnings: [],
    turns: [
      {
        role: "user",
        text: "Please continue developing ContextVault.",
        sourceSelector: "[data-message-author-role]"
      },
      {
        role: "assistant",
        text: "Use Chrome Side Panel as the main review surface. Implement the ChatGPT adapter with tests.",
        sourceSelector: "[data-message-author-role]"
      }
    ]
  };
}
async function seedSource(
  repository: MemoryRepository,
  options: {
    archiveId?: string;
    turnId?: string;
    text?: string;
  } = {}
): Promise<{ archive: SourceArchive; turn: SourceTurn }> {
  const archiveId = options.archiveId ?? "archive-1";
  const turnId = options.turnId ?? "turn-1";
  const text = options.text ?? "Use the side panel review flow.";
  const archive: SourceArchive = {
    id: archiveId,
    provider: "chatgpt",
    captureMethod: "dom",
    capturedAt: "2026-06-08T00:00:00.000Z",
    contentHash: `hash-${archiveId}`,
    schemaVersion: 1,
    warnings: []
  };
  const turn: SourceTurn = {
    id: turnId,
    archiveId,
    role: "assistant",
    text,
    orderIndex: 0,
    contentHash: `hash-${turnId}`
  };

  await repository.saveArchiveWithTurns(archive, [turn]);

  return { archive, turn };
}

describe("vault service workflow", () => {
  it("captures, stores, accepts, searches, exports, imports, and deletes data", async () => {
    let nextId = 0;
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const captureResult = await service.captureConversation(capture(), {
      archiveId: "archive-1",
      createId: () => `id-${++nextId}`,
      hash: async (text) => `hash:${text.length}`
    });

    expect(captureResult.turns).toHaveLength(2);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards("proposed")).toHaveLength(2);

    const [firstCard] = await service.listMemoryCards("proposed");
    const acceptedCard = await service.updateMemoryCard({
      ...firstCard,
      status: "accepted",
      acceptedAt: "2026-06-08T00:01:00.000Z"
    });

    expect(acceptedCard.updatedAt).not.toBe(firstCard.updatedAt);

    const searchResults = await service.searchMemoryCards("side panel", "accepted");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.card.status).toBe("accepted");

    const markdown = await service.exportMarkdown("accepted");
    expect(markdown).toContain("# ContextVault Accepted Memories");
    expect(markdown).toContain("##");
    expect(markdown).toContain("Source: archive=archive-1");
    expect(markdown).not.toContain("Implement the ChatGPT adapter with tests");

    const allMarkdown = await service.exportMarkdown();
    expect(allMarkdown).toContain("# ContextVault Memory Cards");
    expect(allMarkdown).toContain("Implement the ChatGPT adapter with tests");

    const vault = await service.exportVault();
    expect(vault.archives).toHaveLength(1);
    expect(vault.memoryCards).toHaveLength(2);

    const importedRepository = new MemoryRepository();
    const importedService = createVaultService(importedRepository);
    const importResult = await importedService.importVault(vault);

    expect(importResult).toMatchObject({
      archiveCount: 1,
      turnCount: 2,
      memoryCardCount: 2
    });
    expect(await importedService.searchMemoryCards("side panel", "accepted")).toHaveLength(1);

    const deleteResult = await importedService.deleteArchiveCascade("archive-1");

    expect(deleteResult.deletedTurnCount).toBe(2);
    expect(deleteResult.deletedMemoryCardCount).toBe(2);
    expect(await importedService.listArchives()).toHaveLength(0);
    expect(await importedService.listMemoryCards()).toHaveLength(0);
  });

  it("commits captured archives and proposed cards through the atomic repository hook", async () => {
    const repository = new MemoryRepository();
    const saveArchiveWithTurnsAndCards = repository.saveArchiveWithTurnsAndCards.bind(repository);
    const service = createVaultService(repository);
    let atomicSaveCount = 0;

    repository.saveArchiveWithTurnsAndCards = async (archive, turns, cards) => {
      atomicSaveCount += 1;
      await saveArchiveWithTurnsAndCards(archive, turns, cards);
    };
    repository.saveArchiveWithTurns = async () => {
      throw new Error("Non-atomic archive save should not be used for captured conversations.");
    };
    repository.saveMemoryCards = async () => {
      throw new Error("Non-atomic card save should not be used for captured conversations.");
    };

    const result = await service.captureConversation(capture(), {
      archiveId: "archive-atomic",
      createId: () => crypto.randomUUID(),
      hash: async (text) => `hash:${text.length}`
    });

    expect(atomicSaveCount).toBe(1);
    expect(result.proposedCards.length).toBeGreaterThan(0);
    expect(await service.getArchiveWithTurns("archive-atomic")).toMatchObject({
      archive: { id: "archive-atomic" },
      turns: [{ archiveId: "archive-atomic" }, { archiveId: "archive-atomic" }]
    });
    expect(await service.listMemoryCards("proposed")).toHaveLength(result.proposedCards.length);
  });

  it("rejects invalid vault imports before touching the repository", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await expect(service.importVault({ schemaVersion: 1, archives: [] })).rejects.toThrow(
      "Invalid ContextVault export JSON ($.exportedAt: must be an ISO date string"
    );
    expect(await service.listArchives()).toHaveLength(0);
  });

  it("redacts protected values in vault import validation errors", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
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
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash-1"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Broken source",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-alice@example.com",
              turnId: "turn-sk-abcdefghijklmnopqrstuvwxyz123456",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };

    await expect(service.importVault(vault)).rejects.toThrow("$.memoryCards[0].sourceAnchors[0].archiveId");
    await expect(service.importVault(vault)).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(service.importVault(vault)).rejects.not.toThrow("alice@example.com");
    await expect(service.importVault(vault)).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(await service.listArchives()).toHaveLength(0);
  });

  it("rejects oversized vault imports before repository conflict checks", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    let listArchivesCalls = 0;
    const listArchives = repository.listArchives.bind(repository);
    const oversizedVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-oversized-import",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "archive-oversized-import-hash",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-oversized-import",
              archiveId: "archive-oversized-import",
              role: "assistant",
              text: "Use bounded vault imports.",
              orderIndex: 0,
              contentHash: "turn-oversized-import-hash"
            }
          ]
        }
      ],
      memoryCards: Array.from({ length: MAX_VAULT_IMPORT_MEMORY_CARD_COUNT + 1 }, (_, index) => ({
        id: `card-oversized-import-${index}`,
        type: "project_fact",
        title: `Bounded import ${index}`,
        body: "Use bounded vault imports.",
        status: "accepted",
        scope: "conversation",
        sensitivity: "normal",
        tags: [],
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        sourceAnchors: [
          {
            id: `anchor-oversized-import-${index}`,
            archiveId: "archive-oversized-import",
            turnId: "turn-oversized-import",
            quote: "Use bounded vault imports."
          }
        ]
      }))
    };

    repository.listArchives = async () => {
      listArchivesCalls += 1;
      return listArchives();
    };

    await expect(service.importVault(oversizedVault)).rejects.toThrow(
      `$.memoryCards: must contain ${MAX_VAULT_IMPORT_MEMORY_CARD_COUNT} memory cards or fewer`
    );
    expect(listArchivesCalls).toBe(0);
    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });
  it("rejects oversized search queries before reading memory cards", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    let listMemoryCardsCalls = 0;
    const listMemoryCards = repository.listMemoryCards.bind(repository);

    repository.listMemoryCards = async (status) => {
      listMemoryCardsCalls += 1;
      return listMemoryCards(status);
    };

    await expect(service.searchMemoryCards("x".repeat(MAX_SEARCH_QUERY_LENGTH + 1), "accepted")).rejects.toThrow(
      `Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.`
    );
    expect(listMemoryCardsCalls).toBe(0);
  });

  it("creates source-grounded accepted memory cards from manual input", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const card = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual", "fallback", "manual"]
    });

    expect(card.status).toBe("accepted");
    expect(card.acceptedAt).toBeDefined();
    expect(card.tags).toEqual(["manual", "fallback"]);
    expect(card.sourceAnchors).toHaveLength(1);
    expect(card.sourceAnchors[0]?.quote).toBe("Use manual memories when page capture is unavailable.");

    const [archive] = await service.listArchives();
    const archiveWithTurns = await service.getArchiveWithTurns(archive?.id ?? "");

    expect(archiveWithTurns.archive.provider).toBe("generic");
    expect(archiveWithTurns.archive.captureMethod).toBe("clipboard");
    expect(archiveWithTurns.turns[0]?.text).toBe(card.body);
    expect(await service.searchMemoryCards("manual memories", "accepted")).toHaveLength(1);

    const deleteResult = await service.deleteArchiveCascade(archiveWithTurns.archive.id);

    expect(deleteResult.deletedMemoryCardCount).toBe(1);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });

  it("commits new manual source archives and accepted cards through the atomic repository hook", async () => {
    const repository = new MemoryRepository();
    const saveArchiveWithTurnsAndCards = repository.saveArchiveWithTurnsAndCards.bind(repository);
    const service = createVaultService(repository);
    let atomicSaveCount = 0;

    repository.saveArchiveWithTurnsAndCards = async (archive, turns, cards) => {
      atomicSaveCount += 1;
      await saveArchiveWithTurnsAndCards(archive, turns, cards);
    };
    repository.saveArchiveWithTurns = async () => {
      throw new Error("Non-atomic archive save should not be used for new manual memories.");
    };
    repository.saveMemoryCards = async () => {
      throw new Error("Non-atomic card save should not be used for new manual memories.");
    };

    const card = await service.createManualMemoryCard({
      title: "Manual atomic memory",
      body: "Use one repository commit for new manual memory source data.",
      type: "method",
      scope: "project"
    });

    expect(atomicSaveCount).toBe(1);
    expect(card.status).toBe("accepted");
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards("accepted")).toEqual([card]);
  });

  it("preserves multi-source memory cards when one source archive is deleted", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await repository.saveArchiveWithTurns(
      {
        id: "archive-1",
        provider: "chatgpt",
        captureMethod: "dom",
        capturedAt: "2026-06-08T00:00:00.000Z",
        contentHash: "hash-1",
        schemaVersion: 1,
        warnings: []
      },
      [
        {
          id: "turn-1",
          archiveId: "archive-1",
          role: "assistant",
          text: "First source.",
          orderIndex: 0,
          contentHash: "turn-hash-1"
        }
      ]
    );
    await repository.saveArchiveWithTurns(
      {
        id: "archive-2",
        provider: "claude",
        captureMethod: "dom",
        capturedAt: "2026-06-08T00:01:00.000Z",
        contentHash: "hash-2",
        schemaVersion: 1,
        warnings: []
      },
      [
        {
          id: "turn-2",
          archiveId: "archive-2",
          role: "assistant",
          text: "Second source.",
          orderIndex: 0,
          contentHash: "turn-hash-2"
        }
      ]
    );
    await repository.saveMemoryCards([
      {
        id: "card-1",
        type: "project_fact",
        title: "Multi-source memory",
        body: "Keep memory if another source remains.",
        status: "accepted",
        scope: "project",
        sensitivity: "normal",
        tags: [],
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        sourceAnchors: [
          { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "First source." },
          { id: "anchor-2", archiveId: "archive-2", turnId: "turn-2", quote: "Second source." }
        ]
      }
    ]);

    const result = await service.deleteArchiveCascade("archive-1");
    const [remainingCard] = await service.listMemoryCards();

    expect(result.deletedMemoryCardCount).toBe(0);
    expect(result.updatedMemoryCardCount).toBe(1);
    expect(remainingCard?.id).toBe("card-1");
    expect(remainingCard?.sourceAnchors).toEqual([
      { id: "anchor-2", archiveId: "archive-2", turnId: "turn-2", quote: "Second source." }
    ]);
    await expect(service.getArchiveWithTurns("archive-1")).rejects.toThrow("Archive not found: archive-1");
  });

  it("reuses an exact accepted manual memory instead of creating duplicate data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual", "fallback"]
    });
    const duplicateCard = await service.createManualMemoryCard({
      title: " Manual recall workflow ",
      body: " Use manual memories when page capture is unavailable. ",
      type: "method",
      scope: "project",
      tags: ["fallback", "manual", "manual"]
    });

    expect(duplicateCard.id).toBe(firstCard.id);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(1);
  });

  it("canonicalizes manual memory tags before storing cards", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const card = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: [" #Manual ", "manual", " fallback "]
    });

    expect(card.tags).toEqual(["Manual", "fallback"]);
  });

  it("reuses a manual source archive for distinct cards from the same pasted text", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const methodCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual"]
    });
    const decisionCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "decision",
      scope: "project",
      tags: ["manual", "decision"]
    });

    expect(decisionCard.id).not.toBe(methodCard.id);
    expect(decisionCard.sourceAnchors[0]?.archiveId).toBe(methodCard.sourceAnchors[0]?.archiveId);
    expect(decisionCard.sourceAnchors[0]?.turnId).toBe(methodCard.sourceAnchors[0]?.turnId);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(2);
  });

  it("reuses a manual source archive when only memory-card titles differ", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual"]
    });
    const secondCard = await service.createManualMemoryCard({
      title: "Manual fallback method",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual"]
    });

    expect(secondCard.id).not.toBe(firstCard.id);
    expect(secondCard.sourceAnchors[0]?.archiveId).toBe(firstCard.sourceAnchors[0]?.archiveId);
    expect(secondCard.sourceAnchors[0]?.turnId).toBe(firstCard.sourceAnchors[0]?.turnId);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(2);
  });

  it("reuses legacy manual archives whose content hash included the memory title", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const legacyArchive: SourceArchive = {
      id: "legacy-manual-archive",
      provider: "generic",
      title: "Legacy manual title",
      url: "contextvault://manual/legacy-manual-archive",
      captureMethod: "clipboard",
      capturedAt: "2026-06-08T00:00:00.000Z",
      contentHash: "legacy-title-and-body-hash",
      schemaVersion: 1,
      warnings: []
    };
    const legacyTurn: SourceTurn = {
      id: "legacy-manual-turn",
      archiveId: legacyArchive.id,
      role: "user",
      text: "Use manual memories when page capture is unavailable.",
      createdAt: "2026-06-08T00:00:00.000Z",
      orderIndex: 0,
      contentHash: "legacy-turn-hash"
    };

    await repository.saveArchiveWithTurns(legacyArchive, [legacyTurn]);

    const card = await service.createManualMemoryCard({
      title: "New manual title",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project"
    });

    expect(card.sourceAnchors[0]?.archiveId).toBe(legacyArchive.id);
    expect(card.sourceAnchors[0]?.turnId).toBe(legacyTurn.id);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(1);
  });

  it("allows recreating an accepted manual card after the matching card is archived", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual"]
    });

    await service.updateMemoryCard({
      ...firstCard,
      status: "archived"
    });

    const recreatedCard = await service.createManualMemoryCard({
      title: "Manual recall workflow",
      body: "Use manual memories when page capture is unavailable.",
      type: "method",
      scope: "project",
      tags: ["manual"]
    });

    expect(recreatedCard.id).not.toBe(firstCard.id);
    expect(recreatedCard.status).toBe("accepted");
    expect(recreatedCard.sourceAnchors[0]?.archiveId).toBe(firstCard.sourceAnchors[0]?.archiveId);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(2);
  });

  it("keeps manual todo owner and due date while dropping them from other manual types", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const todo = await service.createManualMemoryCard({
      title: "Follow up with owner",
      body: "Follow up on manual recall UX.",
      type: "todo",
      scope: "project",
      owner: "wyh",
      dueAt: "2026-06-09T00:00:00.000Z"
    });

    expect(todo.owner).toBe("wyh");
    expect(todo.dueAt).toBe("2026-06-09T00:00:00.000Z");

    await expect(
      service.createManualMemoryCard({
        title: "Non todo owner",
        body: "Owner metadata should stay todo-only.",
        type: "decision",
        scope: "project",
        owner: "wyh"
      })
    ).rejects.toThrow("owner is only supported for todo cards");
  });

  it("rejects malformed manual memory fields before storing source data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await expect(
      service.createManualMemoryCard({
        title: "Unsupported type",
        body: "Manual memory should reject unknown types.",
        type: "note",
        scope: "project"
      } as never)
    ).rejects.toThrow("Manual memory type is not supported.");
    await expect(
      service.createManualMemoryCard({
        title: "Unsupported scope",
        body: "Manual memory should reject unknown scopes.",
        type: "method",
        scope: "workspace"
      } as never)
    ).rejects.toThrow("Manual memory scope is not supported.");
    await expect(
      service.createManualMemoryCard({
        title: "Bad due date",
        body: "Manual memory should reject malformed due dates.",
        type: "todo",
        scope: "project",
        dueAt: "tomorrow"
      } as never)
    ).rejects.toThrow("Manual memory due date must be an ISO date string.");
    await expect(
      service.createManualMemoryCard({
        title: "Bad tag",
        body: "Manual memory should reject non-string tags.",
        type: "method",
        scope: "project",
        tags: ["manual", 42]
      } as never)
    ).rejects.toThrow("Manual memory tags must be strings.");

    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });

  it("rejects oversized manual memory metadata before storing source data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await expect(
      service.createManualMemoryCard({
        title: "Manual tag count",
        body: "Manual memory should reject too many tags.",
        type: "method",
        scope: "project",
        tags: Array.from({ length: MAX_MEMORY_CARD_TAG_COUNT + 1 }, (_, index) => `tag-${index}`)
      })
    ).rejects.toThrow(`Manual memory tags must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`);
    await expect(
      service.createManualMemoryCard({
        title: "Manual tag length",
        body: "Manual memory should reject too long tags.",
        type: "method",
        scope: "project",
        tags: ["x".repeat(MAX_MEMORY_CARD_TAG_LENGTH + 1)]
      })
    ).rejects.toThrow(`Manual memory tag must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`);
    await expect(
      service.createManualMemoryCard({
        title: "Manual owner length",
        body: "Manual memory should reject too long owners.",
        type: "todo",
        scope: "project",
        owner: "x".repeat(MAX_MEMORY_CARD_OWNER_LENGTH + 1)
      })
    ).rejects.toThrow(`Manual memory owner must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer.`);
    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });

  it("rejects oversized manual memory bodies before storing source data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await expect(
      service.createManualMemoryCard({
        title: "Oversized manual memory",
        body: "A".repeat(MAX_MANUAL_MEMORY_BODY_LENGTH + 1),
        type: "method",
        scope: "project"
      })
    ).rejects.toThrow(`Manual memory body must be ${MAX_MANUAL_MEMORY_BODY_LENGTH} characters or fewer.`);
    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });

  it("marks manual secret sources as protected archive content", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const card = await service.createManualMemoryCard({
      title: "Manual credential",
      body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
      type: "project_fact",
      scope: "conversation"
    });
    const archive = await service.getArchiveWithTurns(card.sourceAnchors[0]?.archiveId ?? "");

    expect(card.sensitivity).toBe("secret");
    expect(archive.archive.warnings.map((warning) => warning.code)).toContain("secret_content_detected");
  });

  it("includes field paths when rejecting malformed vault imports", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);

    await expect(
      service.importVault({
        schemaVersion: 1,
        exportedAt: "2026-06-08T00:00:00.000Z",
        archives: [
          {
            archive: {
              id: "archive-1",
              provider: "bard",
              captureMethod: "dom",
              capturedAt: "2026-06-08T00:00:00.000Z",
              contentHash: "hash",
              schemaVersion: 1,
              warnings: []
            },
            turns: []
          }
        ],
        memoryCards: []
      })
    ).rejects.toThrow("$.archives[0].archive.provider: must be a supported provider");
    expect(await service.listArchives()).toHaveLength(0);
  });

  it("reclassifies imported memory sensitivity before storing cards", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "hash",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
              orderIndex: 0,
              contentHash: "turn-hash"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Imported credential",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
            }
          ]
        }
      ]
    };

    await service.importVault(vault);

    const [card] = await service.listMemoryCards("accepted");

    expect(card?.sensitivity).toBe("secret");
  });

  it("preserves imported protected sensitivity labels when patterns are unknown", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "hash",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "Codename Bluebird should stay private.",
              orderIndex: 0,
              contentHash: "turn-hash"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Private Bluebird plan",
          body: "Codename Bluebird should stay private.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "secret",
          tags: ["Bluebird"],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "Codename Bluebird should stay private."
            }
          ]
        }
      ]
    };

    await service.importVault(vault);

    const [storedCard] = await service.listMemoryCards("accepted");
    const exportedVault = await service.exportVault();
    const [exportedCard] = exportedVault.memoryCards;

    expect(storedCard?.sensitivity).toBe("secret");
    expect(exportedCard?.sensitivity).toBe("secret");
  });

  it("normalizes acceptedAt lifecycle metadata when importing cards", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "hash",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "accepted-card",
          type: "project_fact",
          title: "Accepted without acceptedAt",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:05:00.000Z",
          sourceAnchors: [{ id: "anchor-1", archiveId: "archive-1", turnId: "turn-1", quote: "Use source anchors." }]
        },
        {
          id: "rejected-card",
          type: "project_fact",
          title: "Rejected with stale acceptedAt",
          body: "Use source anchors.",
          status: "rejected",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:06:00.000Z",
          acceptedAt: "2026-06-08T00:01:00.000Z",
          sourceAnchors: [{ id: "anchor-2", archiveId: "archive-1", turnId: "turn-1", quote: "Use source anchors." }]
        }
      ]
    };

    await service.importVault(vault);

    const cards = await service.listMemoryCards();
    const acceptedCard = cards.find((card) => card.id === "accepted-card");
    const rejectedCard = cards.find((card) => card.id === "rejected-card");

    expect(acceptedCard?.acceptedAt).toBe("2026-06-08T00:05:00.000Z");
    expect(rejectedCard?.acceptedAt).toBeUndefined();
  });

  it("exports canonical memory cards from existing local data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository, {
      text: "Contact alice@example.com before launch."
    });
    await repository.saveMemoryCards([
      {
        id: "card-1",
        type: "decision",
        title: "Contact owner",
        body: "Contact alice@example.com before launch.",
        status: "accepted",
        scope: "project",
        sensitivity: "normal",
        tags: [],
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z",
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            quote: "Contact alice@example.com before launch."
          }
        ]
      }
    ]);

    const vault = await service.exportVault();
    const [card] = vault.memoryCards;

    expect(card?.type).toBe("decision");
    expect(card?.sensitivity).toBe("sensitive");
    expect(card?.acceptedAt).toBe("2026-06-08T00:00:00.000Z");
    expect(card?.owner).toBeUndefined();
    expect(card?.dueAt).toBeUndefined();
  });

  it("rejects imports that would overwrite existing archives or memory cards", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const vault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "hash",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Source anchors",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };

    await service.importVault(vault);

    await expect(service.importVault(vault)).rejects.toThrow("Import would overwrite existing ContextVault data");
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(1);
  });

  it("rejects imports that would overwrite existing source turns", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
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
              text: "Original source turn.",
              orderIndex: 0,
              contentHash: "turn-hash-1"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Original source",
          body: "Original source turn.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "Original source turn."
            }
          ]
        }
      ]
    };
    const conflictingTurnVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:01:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-2",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:01:00.000Z",
            contentHash: "hash-2",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-2",
              role: "assistant",
              text: "Conflicting source turn.",
              orderIndex: 0,
              contentHash: "turn-hash-2"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-2",
          type: "project_fact",
          title: "Conflicting source",
          body: "Conflicting source turn.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:01:00.000Z",
          updatedAt: "2026-06-08T00:01:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-2",
              archiveId: "archive-2",
              turnId: "turn-1",
              quote: "Conflicting source turn."
            }
          ]
        }
      ]
    };

    await service.importVault(firstVault);

    await expect(service.importVault(conflictingTurnVault)).rejects.toThrow("turn ids: 1 conflict(s) (turn-1)");
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(1);
  });

  it("rejects imports that duplicate an existing archive content hash", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: "same-hash-with-private-tail-1234567890",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash-1"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-1",
          type: "project_fact",
          title: "Source anchors",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };
    const duplicateHashVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:01:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-2",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:01:00.000Z",
            contentHash: "same-hash-with-private-tail-1234567890",
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-2",
              archiveId: "archive-2",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash-2"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-2",
          type: "project_fact",
          title: "Duplicate source anchors",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:01:00.000Z",
          updatedAt: "2026-06-08T00:01:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-2",
              archiveId: "archive-2",
              turnId: "turn-2",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };

    await service.importVault(firstVault);

    await expect(service.importVault(duplicateHashVault)).rejects.toThrow(
      "archive content hashes: 1 conflict(s) (same-hash-wi...)"
    );
    await expect(service.importVault(duplicateHashVault)).rejects.not.toThrow("private-tail");
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(1);
  });

  it("redacts sensitive values in import conflict summaries", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const sensitiveHash = "api_key=sk-abcdefghijklmnopqrstuvwxyz123456";
    const firstVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:00:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-1",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:00:00.000Z",
            contentHash: sensitiveHash,
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-1",
              archiveId: "archive-1",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash-1"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-alice@example.com",
          type: "project_fact",
          title: "Source anchors",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-1",
              archiveId: "archive-1",
              turnId: "turn-1",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };
    const conflictingVault: VaultExport = {
      schemaVersion: 1,
      exportedAt: "2026-06-08T00:01:00.000Z",
      archives: [
        {
          archive: {
            id: "archive-2",
            provider: "chatgpt",
            captureMethod: "dom",
            capturedAt: "2026-06-08T00:01:00.000Z",
            contentHash: sensitiveHash,
            schemaVersion: 1,
            warnings: []
          },
          turns: [
            {
              id: "turn-2",
              archiveId: "archive-2",
              role: "assistant",
              text: "Use source anchors.",
              orderIndex: 0,
              contentHash: "turn-hash-2"
            }
          ]
        }
      ],
      memoryCards: [
        {
          id: "card-alice@example.com",
          type: "project_fact",
          title: "Duplicate source anchors",
          body: "Use source anchors.",
          status: "accepted",
          scope: "conversation",
          sensitivity: "normal",
          tags: [],
          createdAt: "2026-06-08T00:01:00.000Z",
          updatedAt: "2026-06-08T00:01:00.000Z",
          sourceAnchors: [
            {
              id: "anchor-2",
              archiveId: "archive-2",
              turnId: "turn-2",
              quote: "Use source anchors."
            }
          ]
        }
      ]
    };

    await service.importVault(firstVault);

    await expect(service.importVault(conflictingVault)).rejects.toThrow("api_key=[REDACTED_SECRET]");
    await expect(service.importVault(conflictingVault)).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(service.importVault(conflictingVault)).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz123456");
    await expect(service.importVault(conflictingVault)).rejects.not.toThrow("alice@example.com");
  });

  it("reclassifies memory sensitivity when a card is edited", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const baseCard: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Launch workflow",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      confidence: 0.8,
      tags: ["workflow"],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      acceptedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([baseCard]);

    const sensitiveCard = await service.updateMemoryCard({
      ...baseCard,
      body: "Contact alice@example.com before launch."
    });

    expect(sensitiveCard.sensitivity).toBe("sensitive");

    const secretCard = await service.updateMemoryCard({
      ...sensitiveCard,
      body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
      sensitivity: "normal"
    });

    expect(secretCard.sensitivity).toBe("secret");

    const ownerSensitiveCard = await service.updateMemoryCard({
      ...baseCard,
      type: "todo",
      owner: "alice@example.com",
      sensitivity: "normal"
    });

    expect(ownerSensitiveCard.sensitivity).toBe("sensitive");

    const labeledSecretCard = await service.updateMemoryCard({
      ...baseCard,
      title: "Private Bluebird plan",
      sensitivity: "secret"
    });

    expect(labeledSecretCard.sensitivity).toBe("secret");
  });

  it("normalizes todo-only metadata before storing non-todo memory card updates", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const baseCard: MemoryCard = {
      id: "card-1",
      type: "todo",
      title: "Launch workflow",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      confidence: 0.8,
      tags: ["workflow"],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      acceptedAt: "2026-06-08T00:00:00.000Z",
      owner: "wyh",
      dueAt: "2026-06-09T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([baseCard]);

    const updatedCard = await service.updateMemoryCard({
      ...baseCard,
      type: "decision"
    });

    expect(updatedCard.type).toBe("decision");
    expect(updatedCard.owner).toBeUndefined();
    expect(updatedCard.dueAt).toBeUndefined();
  });

  it("can export redacted Markdown without leaking sensitive values", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository, {
      text: "Use api_key = sk-abcdefghijklmnopqrstuvwxyz123456 for the test service."
    });
    const card: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Credential for alice@example.com",
      body: "Use api_key = sk-abcdefghijklmnopqrstuvwxyz123456 for the test service.",
      status: "accepted",
      scope: "project",
      sensitivity: "secret",
      tags: ["credentials"],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      acceptedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
        }
      ]
    };

    await repository.saveMemoryCards([card]);
    await service.updateMemoryCard(card);

    const markdown = await service.exportMarkdown("accepted", { redactSensitive: true });

    expect(markdown).toContain("[REDACTED_EMAIL]");
    expect(markdown).toContain("api_key=[REDACTED_SECRET]");
    expect(markdown).not.toContain("alice@example.com");
    expect(markdown).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("rejects memory card updates without source anchors", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const existingCard: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([existingCard]);

    await expect(
      service.updateMemoryCard({
        ...existingCard,
        title: "Ungrounded card",
        body: "This card has no source.",
        sourceAnchors: []
      })
    ).rejects.toThrow("Memory card source anchors must contain at least one source anchor.");
  });

  it("rejects oversized memory card update bodies before loading source archives", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const existingCard: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };
    let getArchiveWithTurnsCalls = 0;
    const getArchiveWithTurns = repository.getArchiveWithTurns.bind(repository);

    repository.getArchiveWithTurns = async (archiveId) => {
      getArchiveWithTurnsCalls += 1;
      return getArchiveWithTurns(archiveId);
    };
    await repository.saveMemoryCards([existingCard]);

    await expect(
      service.updateMemoryCard({
        ...existingCard,
        body: "x".repeat(MAX_MEMORY_CARD_BODY_LENGTH + 1)
      })
    ).rejects.toThrow(`Memory card body must be ${MAX_MEMORY_CARD_BODY_LENGTH} characters or fewer.`);
    expect(getArchiveWithTurnsCalls).toBe(0);
  });

  it("rejects oversized memory card update metadata before loading source archives", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const existingCard: MemoryCard = {
      id: "card-1",
      type: "todo",
      title: "Grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      owner: "wyh",
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };
    let getArchiveWithTurnsCalls = 0;
    const getArchiveWithTurns = repository.getArchiveWithTurns.bind(repository);

    repository.getArchiveWithTurns = async (archiveId) => {
      getArchiveWithTurnsCalls += 1;
      return getArchiveWithTurns(archiveId);
    };
    await repository.saveMemoryCards([existingCard]);

    await expect(
      service.updateMemoryCard({
        ...existingCard,
        tags: Array.from({ length: MAX_MEMORY_CARD_TAG_COUNT + 1 }, (_, index) => `tag-${index}`)
      })
    ).rejects.toThrow(`Memory card tags must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`);
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        tags: ["x".repeat(MAX_MEMORY_CARD_TAG_LENGTH + 1)]
      })
    ).rejects.toThrow(`Memory card tag must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`);
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        owner: "x".repeat(MAX_MEMORY_CARD_OWNER_LENGTH + 1)
      })
    ).rejects.toThrow(`Memory card owner must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer.`);
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        type: "unsupported" as MemoryCard["type"]
      })
    ).rejects.toThrow("Memory card type is not supported.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        status: "pending" as MemoryCard["status"]
      })
    ).rejects.toThrow("Memory card status is not supported.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        scope: "team" as MemoryCard["scope"]
      })
    ).rejects.toThrow("Memory card scope is not supported.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        confidence: 1.5
      })
    ).rejects.toThrow("Memory card confidence must be a number between 0 and 1.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        dueAt: "2026-06-09"
      })
    ).rejects.toThrow("Memory card due date must be an ISO date string.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        sourceAnchors: Array.from({ length: MAX_SOURCE_ANCHORS_PER_MEMORY_CARD + 1 }, (_, index) => ({
          id: `anchor-${index}`,
          archiveId: "archive-1",
          turnId: "turn-1"
        }))
      })
    ).rejects.toThrow(`Memory card source anchors must contain ${MAX_SOURCE_ANCHORS_PER_MEMORY_CARD} source anchors or fewer.`);
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            charStart: 4
          }
        ]
      })
    ).rejects.toThrow("Memory card source anchor charStart and charEnd must be provided together.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            charStart: 10,
            charEnd: 4
          }
        ]
      })
    ).rejects.toThrow("Memory card source anchor charEnd must be greater than charStart.");
    await expect(
      service.updateMemoryCard({
        ...existingCard,
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            quote: ""
          }
        ]
      })
    ).rejects.toThrow("Memory card source anchor quote must be non-empty when present.");
    expect(getArchiveWithTurnsCalls).toBe(0);
  });

  it("rejects memory card updates for cards that do not already exist", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);

    await expect(
      service.updateMemoryCard({
        id: "missing-card",
        type: "project_fact",
        title: "Missing card",
        body: "Use the side panel review flow.",
        status: "accepted",
        scope: "project",
        sensitivity: "normal",
        tags: [],
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            quote: "Use the side panel review flow."
          }
        ]
      })
    ).rejects.toThrow("Memory card not found: missing-card");
  });

  it("redacts protected identifiers in missing memory card errors", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);

    await expect(
      service.deleteMemoryCard("card-alice@example.com-sk-abcdefghijklmnopqrstuvwxyz123456")
    ).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(
      service.deleteMemoryCard("card-alice@example.com-sk-abcdefghijklmnopqrstuvwxyz123456")
    ).rejects.toThrow("[REDACTED_OPENAI_KEY]");
    await expect(
      service.deleteMemoryCard("card-alice@example.com-sk-abcdefghijklmnopqrstuvwxyz123456")
    ).rejects.not.toThrow("alice@example.com");
    await expect(
      service.deleteMemoryCard("card-alice@example.com-sk-abcdefghijklmnopqrstuvwxyz123456")
    ).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("rejects memory card updates with anchors that do not match source text", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository, {
      text: "Use the side panel review flow."
    });
    const existingCard: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([existingCard]);

    await expect(
      service.updateMemoryCard({
        ...existingCard,
        title: "Bad source quote",
        body: "Use popup UI.",
        sourceAnchors: [
          {
            id: "anchor-1",
            archiveId: "archive-1",
            turnId: "turn-1",
            quote: "Use popup UI."
          }
        ]
      })
    ).rejects.toThrow("Memory card update is not source-grounded");
  });

  it("redacts protected source archive identifiers in source-grounding errors", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const existingCard: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([existingCard]);

    const update = service.updateMemoryCard({
      ...existingCard,
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-alice@example.com-sk-abcdefghijklmnopqrstuvwxyz123456",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    });

    await expect(update).rejects.toThrow("Memory card update is not source-grounded");
    await expect(update).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(update).rejects.toThrow("[REDACTED_OPENAI_KEY]");
    await expect(update).rejects.not.toThrow("alice@example.com");
    await expect(update).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("deletes existing memory cards and rejects missing card deletes", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    await seedSource(repository);
    const card: MemoryCard = {
      id: "card-1",
      type: "project_fact",
      title: "Source-grounded card",
      body: "Use the side panel review flow.",
      status: "accepted",
      scope: "project",
      sensitivity: "normal",
      tags: [],
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T00:00:00.000Z",
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Use the side panel review flow."
        }
      ]
    };

    await repository.saveMemoryCards([card]);

    await expect(service.deleteMemoryCard("card-1")).resolves.toEqual({ cardId: "card-1" });
    expect(await service.listMemoryCards()).toHaveLength(0);
    await expect(service.deleteMemoryCard("card-1")).rejects.toThrow("Memory card not found: card-1");
  });

  it("deduplicates exact repeated conversation captures by content hash", async () => {
    let nextId = 0;
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstCapture = await service.captureConversation(capture(), {
      archiveId: "archive-1",
      createId: () => `id-${++nextId}`,
      hash: async (text) => `hash:${text.length}:${text}`
    });

    const [firstCard] = await service.listMemoryCards("proposed");

    if (!firstCard) {
      throw new Error("Expected a proposed card fixture.");
    }

    await service.updateMemoryCard({
      ...firstCard,
      status: "accepted",
      acceptedAt: "2026-06-08T00:01:00.000Z"
    });

    const duplicateCapture = await service.captureConversation(capture(), {
      archiveId: "archive-2",
      createId: () => `id-${++nextId}`,
      hash: async (text) => `hash:${text.length}:${text}`
    });

    expect(duplicateCapture.deduplicated).toBe(true);
    expect(duplicateCapture.archive.id).toBe(firstCapture.archive.id);
    expect(duplicateCapture.turns.map((turn) => turn.archiveId)).toEqual(["archive-1", "archive-1"]);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards()).toHaveLength(firstCapture.proposedCards.length);
    expect(duplicateCapture.proposedCards.every((card) => card.status === "proposed")).toBe(true);
  });

  it("imports external conversation captures through the normal archive and extraction pipeline", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const result = await service.importConversationCaptures([capture(), capture()]);

    expect(result).toMatchObject({
      importedCount: 2,
      deduplicatedCount: 1,
      archiveCount: 1,
      turnCount: 2
    });
    expect(result.proposedMemoryCardCount).toBeGreaterThan(0);
    expect(await service.listArchives()).toHaveLength(1);
    expect(await service.listMemoryCards("proposed")).toHaveLength(result.proposedMemoryCardCount);
  });

  it("rejects external conversation imports with too many conversations before writing data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const captures = Array.from({ length: MAX_CONVERSATION_CAPTURE_IMPORT_COUNT + 1 }, (_, index) => ({
      ...capture(),
      url: `https://chatgpt.com/c/too-many-${index}`
    }));

    await expect(service.importConversationCaptures(captures)).rejects.toThrow(
      `Conversation capture import must contain ${MAX_CONVERSATION_CAPTURE_IMPORT_COUNT} conversations or fewer.`
    );
    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });

  it("rejects external conversation imports with too many total turns before writing data", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const maxTurnCapture: ConversationCapture = {
      ...capture(),
      turns: Array.from({ length: MAX_SOURCE_TURNS_PER_ARCHIVE }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        text: `Bounded import turn ${index}.`
      }))
    };
    const captures = [
      ...Array.from({ length: MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT / MAX_SOURCE_TURNS_PER_ARCHIVE }, (_, index) => ({
        ...maxTurnCapture,
        url: `https://chatgpt.com/c/turn-limit-${index}`
      })),
      {
        ...capture(),
        url: "https://chatgpt.com/c/turn-limit-overflow"
      }
    ];

    await expect(service.importConversationCaptures(captures)).rejects.toThrow(
      `Conversation capture import must contain ${MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT} turns or fewer.`
    );
    expect(await service.listArchives()).toHaveLength(0);
    expect(await service.listMemoryCards()).toHaveLength(0);
  });
  it("summarizes capture warnings after external conversation imports", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const firstCapture: ConversationCapture = {
      ...capture(),
      warnings: [
        {
          code: "official_export_import",
          message: "Imported from a provider export."
        },
        {
          code: "chatgpt_non_text_parts_skipped",
          message: "Skipped non-text parts."
        }
      ]
    };
    const secondCapture: ConversationCapture = {
      ...capture(),
      url: "https://chatgpt.com/c/workflow-2",
      turns: [
        ...capture().turns,
        {
          role: "assistant",
          text: "Follow the reviewed import flow.",
          sourceSelector: "[data-message-author-role]"
        }
      ],
      warnings: [
        {
          code: "official_export_import",
          message: "Imported from a provider export."
        }
      ]
    };
    const result = await service.importConversationCaptures([firstCapture, secondCapture, firstCapture]);

    expect(result).toMatchObject({
      importedCount: 3,
      deduplicatedCount: 1,
      archiveCount: 2
    });
    expect(result.warningCounts).toEqual([
      {
        code: "official_export_import",
        count: 3,
        message: "Imported from a provider export."
      },
      {
        code: "chatgpt_non_text_parts_skipped",
        count: 2,
        message: "Skipped non-text parts."
      }
    ]);
  });

  it("redacts protected warning messages in external conversation import summaries", async () => {
    const repository = new MemoryRepository();
    const service = createVaultService(repository);
    const result = await service.importConversationCaptures([
      {
        ...capture(),
        warnings: [
          {
            code: "provider_selector_fallback",
            message: "Fallback included alice@example.com and api_key=sk-abcdefghijklmnopqrstuvwxyz123456."
          },
          {
            code: "secret_content_detected",
            message: "Private Bluebird archive note"
          }
        ]
      }
    ]);

    expect(result.warningCounts).toEqual([
      {
        code: "provider_selector_fallback",
        count: 1,
        message: "Fallback included [REDACTED_EMAIL] and api_key=[REDACTED_SECRET]"
      },
      {
        code: "secret_content_detected",
        count: 1,
        message: "[REDACTED_SECRET_CONTENT]"
      }
    ]);
    expect(JSON.stringify(result.warningCounts)).not.toContain("alice@example.com");
    expect(JSON.stringify(result.warningCounts)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(JSON.stringify(result.warningCounts)).not.toContain("Bluebird");
  });

  it("rejects malformed external conversation capture imports with field paths", async () => {
    const service = createVaultService(new MemoryRepository());

    await expect(
      service.importConversationCaptures([
        {
          ...capture(),
          turns: [
            {
              role: "assistant",
              text: ""
            }
          ]
        }
      ])
    ).rejects.toThrow("Invalid conversation capture import at $[0] ($.turns[0].text: must be a non-empty string");
  });

  it("does not echo protected invalid payload text in external conversation capture import errors", async () => {
    const service = createVaultService(new MemoryRepository());

    await expect(
      service.importConversationCaptures([
        {
          ...capture(),
          warnings: [
            {
              code: "provider_selector_fallback",
              message: "x".repeat(1001)
            }
          ]
        }
      ])
    ).rejects.toThrow("Invalid conversation capture import at $[0] ($.warnings[0].message");
    await expect(
      service.importConversationCaptures([
        {
          ...capture(),
          warnings: [
            {
              code: "provider_selector_fallback",
              message: "x".repeat(1001)
            }
          ]
        }
      ])
    ).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz123456");
    await expect(
      service.importConversationCaptures([
        {
          ...capture(),
          warnings: [
            {
              code: "provider_selector_fallback",
              message: "x".repeat(1001)
            }
          ]
        }
      ])
    ).rejects.not.toThrow("alice@example.com");
  });
});
