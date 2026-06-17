import {
  formatMemoryCardsAsMarkdown,
  classifySensitivity,
  redactProtectedText,
  getSafeMemoryCardForRead,
  getSafeSourceAnchors,
  getEffectiveMemorySensitivity,
  isVaultExport,
  MAX_CONVERSATION_CAPTURE_IMPORT_COUNT,
  MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT,
  MAX_MANUAL_MEMORY_BODY_LENGTH,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  MAX_MEMORY_CARD_TITLE_LENGTH,
  MAX_METADATA_ID_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  normalizeMemoryCard,
  normalizeTag,
  normalizeTagList,
  validateVaultExport,
  validateConversationCapture,
  formatValidationIssues,
  type ArchiveWithTurns,
  type CaptureResult,
  type CaptureWarningCount,
  type ConversationCapture,
  type DeleteArchiveResult,
  type DeleteMemoryCardResult,
  type ImportConversationCapturesResult,
  type ImportVaultResult,
  type ManualMemoryCardInput,
  type MemoryCard,
  type MemoryCardStatus,
  type MemoryCardType,
  type MemoryScope,
  type SearchResult,
  type Sensitivity,
  type SourceArchive,
  type SourceTurn,
  type VaultIntegrityReport,
  type VaultExport
} from "@contextvault/shared";
import { processConversationCapture, type ProcessCaptureOptions } from "../capture/process-capture";
import { rankMemoryCards } from "../search/memory-search";
import { sha256 } from "../storage/hash";

type NormalizedManualMemoryCardInput = Omit<ManualMemoryCardInput, "tags" | "owner" | "dueAt"> & {
  tags: string[];
  owner?: string;
  dueAt?: string;
};

const MANUAL_MEMORY_TYPES = new Set<MemoryCardType>([
  "project_fact",
  "decision",
  "todo",
  "preference",
  "method",
  "citation_anchor"
]);
const MEMORY_CARD_STATUSES = new Set<MemoryCardStatus>([
  "proposed",
  "accepted",
  "rejected",
  "archived",
  "superseded"
]);
const MEMORY_SCOPES = new Set<MemoryScope>(["global", "project", "conversation"]);
const SENSITIVITIES = new Set<Sensitivity>(["normal", "sensitive", "secret"]);
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface VaultRepository {
  saveArchiveWithTurns(archive: SourceArchive, turns: SourceTurn[]): Promise<void>;
  saveArchiveWithTurnsAndCards?(
    archive: SourceArchive,
    turns: SourceTurn[],
    cards: MemoryCard[]
  ): Promise<void>;
  saveMemoryCards(cards: MemoryCard[]): Promise<void>;
  findArchiveByContentHash(contentHash: string): Promise<SourceArchive | undefined>;
  listArchives(): Promise<SourceArchive[]>;
  getArchiveWithTurns(archiveId: string): Promise<ArchiveWithTurns>;
  listMemoryCards(status?: MemoryCardStatus): Promise<MemoryCard[]>;
  getMemoryCard(cardId: string): Promise<MemoryCard | undefined>;
  updateMemoryCard(card: MemoryCard): Promise<MemoryCard>;
  deleteMemoryCard(cardId: string): Promise<DeleteMemoryCardResult>;
  deleteArchiveCascade(archiveId: string): Promise<DeleteArchiveResult>;
  auditVaultIntegrity(): Promise<VaultIntegrityReport>;
  exportVault(): Promise<VaultExport>;
  importVault(vault: VaultExport): Promise<ImportVaultResult>;
}

export interface VaultService {
  captureConversation(capture: ConversationCapture, options?: ProcessCaptureOptions): Promise<CaptureResult>;
  listArchives(): Promise<SourceArchive[]>;
  getArchiveWithTurns(archiveId: string): Promise<ArchiveWithTurns>;
  listMemoryCards(status?: MemoryCardStatus): Promise<MemoryCard[]>;
  createManualMemoryCard(input: ManualMemoryCardInput): Promise<MemoryCard>;
  updateMemoryCard(card: MemoryCard): Promise<MemoryCard>;
  deleteMemoryCard(cardId: string): Promise<DeleteMemoryCardResult>;
  deleteArchiveCascade(archiveId: string): Promise<DeleteArchiveResult>;
  auditVaultIntegrity(): Promise<VaultIntegrityReport>;
  exportVault(): Promise<VaultExport>;
  exportMarkdown(status?: MemoryCardStatus, options?: { redactSensitive?: boolean }): Promise<string>;
  importVault(vault: unknown): Promise<ImportVaultResult>;
  importConversationCaptures(captures: unknown): Promise<ImportConversationCapturesResult>;
  searchMemoryCards(
    query: string,
    status?: MemoryCardStatus,
    memoryType?: MemoryCardType,
    memoryScope?: MemoryScope
  ): Promise<SearchResult[]>;
}

export function createVaultService(repository: VaultRepository): VaultService {
  return {
    async captureConversation(capture, options) {
      const result = await processConversationCapture(capture, options);
      const existingArchive = await repository.findArchiveByContentHash(result.archive.contentHash);

      if (existingArchive) {
        const existingArchiveWithTurns = await repository.getArchiveWithTurns(existingArchive.id);
        const existingCards = (await repository.listMemoryCards()).filter((card) =>
          getSafeSourceAnchors(getSafeMemoryCardForRead(card)).some((anchor) => anchor.archiveId === existingArchive.id)
        );

        return {
          archive: existingArchiveWithTurns.archive,
          turns: existingArchiveWithTurns.turns,
          proposedCards: existingCards.filter((card) => getSafeMemoryCardForRead(card).status === "proposed"),
          deduplicated: true
        };
      }

      await saveArchiveWithTurnsAndCards(repository, result.archive, result.turns, result.proposedCards);

      return result;
    },

    listArchives() {
      return repository.listArchives();
    },

    getArchiveWithTurns(archiveId) {
      return repository.getArchiveWithTurns(archiveId);
    },

    listMemoryCards(status) {
      return repository.listMemoryCards(status);
    },

    async createManualMemoryCard(input) {
      const now = new Date().toISOString();
      const normalizedInput = normalizeManualMemoryCardInput(input);
      const archiveContentHash = await sha256(manualArchiveHashInput(normalizedInput));
      const existingArchive =
        (await repository.findArchiveByContentHash(archiveContentHash)) ??
        (await findManualSourceArchiveByBody(repository, normalizedInput.body));

      if (existingArchive) {
        const existingCard = await findMatchingManualMemoryCard(repository, existingArchive.id, normalizedInput);

        if (existingCard) {
          return existingCard;
        }

        return createManualMemoryCardForArchive(repository, existingArchive.id, normalizedInput, now);
      }

      const archiveId = crypto.randomUUID();
      const turnId = crypto.randomUUID();
      const turn: SourceTurn = {
        id: turnId,
        archiveId,
        role: "user",
        text: normalizedInput.body,
        createdAt: now,
        orderIndex: 0,
        contentHash: await sha256(`manual\n${normalizedInput.body}`)
      };
      const archive: SourceArchive = {
        id: archiveId,
        provider: "generic",
        title: normalizedInput.title,
        url: `contextvault://manual/${archiveId}`,
        captureMethod: "clipboard",
        capturedAt: now,
        contentHash: archiveContentHash,
        schemaVersion: 1,
        warnings: manualCaptureWarnings(normalizedInput.body)
      };

      const card = buildManualMemoryCard(archiveId, turn, normalizedInput, now);
      await saveArchiveWithTurnsAndCards(repository, archive, [turn], [card]);

      return card;
    },

    async updateMemoryCard(card) {
      assertMemoryCardCanBeStored(card);
      const normalizedCard = normalizeMemoryCard(card);

      await assertMemoryCardExists(repository, card.id);
      assertMemoryCardCanBeStored(normalizedCard);
      await assertMemoryCardUpdateIsSourceGrounded(repository, normalizedCard);

      return repository.updateMemoryCard({
        ...normalizedCard,
        sensitivity: classifyMemoryCardSensitivity(normalizedCard),
        updatedAt: new Date().toISOString()
      });
    },

    async deleteMemoryCard(cardId) {
      await assertMemoryCardExists(repository, cardId);

      return repository.deleteMemoryCard(cardId);
    },

    deleteArchiveCascade(archiveId) {
      return repository.deleteArchiveCascade(archiveId);
    },

    auditVaultIntegrity() {
      return repository.auditVaultIntegrity();
    },

    async exportVault() {
      const vault = await repository.exportVault();

      return {
        ...vault,
        memoryCards: vault.memoryCards.map(withClassifiedMemorySensitivity)
      };
    },

    async exportMarkdown(status, options = {}) {
      const cards = await repository.listMemoryCards(status);
      return formatMemoryCardsAsMarkdown(cards, {
        title: markdownExportTitle(status),
        redactSensitive: options.redactSensitive
      });
    },

    async importVault(vault) {
      const validation = validateVaultExport(vault);

      if (!validation.ok) {
        throw new Error(formatVaultImportValidationError(validation.issues));
      }

      await assertNoImportConflicts(repository, validation.value);

      return repository.importVault({
        ...validation.value,
        memoryCards: validation.value.memoryCards.map(withClassifiedMemorySensitivity)
      });
    },

    async importConversationCaptures(captures) {
      const parsedCaptures = parseConversationCapturesImport(captures);
      const results: CaptureResult[] = [];

      for (const capture of parsedCaptures) {
        results.push(await this.captureConversation(capture));
      }

      return summarizeCaptureImportResults(results);
    },

    async searchMemoryCards(query, status = "accepted", memoryType, memoryScope) {
      assertSearchQueryIsAllowed(query);
      const cards = await repository.listMemoryCards(status);
      return rankMemoryCards(cards, query, { status, memoryType, memoryScope, limit: 30 });
    }
  };
}

async function saveArchiveWithTurnsAndCards(
  repository: VaultRepository,
  archive: SourceArchive,
  turns: SourceTurn[],
  cards: MemoryCard[]
): Promise<void> {
  if (repository.saveArchiveWithTurnsAndCards) {
    await repository.saveArchiveWithTurnsAndCards(archive, turns, cards);
    return;
  }

  await repository.saveArchiveWithTurns(archive, turns);
  await repository.saveMemoryCards(cards);
}

function assertSearchQueryIsAllowed(query: string): void {
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new Error(`Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.`);
  }
}

function assertMemoryCardCanBeStored(card: MemoryCard): void {
  assertBoundedRequiredString(card.id, "Memory card id", MAX_METADATA_ID_LENGTH);
  assertSupportedString(card.type, "Memory card type", MANUAL_MEMORY_TYPES);
  assertSupportedString(card.status, "Memory card status", MEMORY_CARD_STATUSES);
  assertSupportedString(card.scope, "Memory card scope", MEMORY_SCOPES);
  assertSupportedString(card.sensitivity, "Memory card sensitivity", SENSITIVITIES);
  assertIsoDateString(card.createdAt, "Memory card createdAt");
  assertIsoDateString(card.updatedAt, "Memory card updatedAt");
  assertOptionalIsoDateString(card.acceptedAt, "Memory card acceptedAt");
  assertOptionalNumberInRange(card.confidence, "Memory card confidence", 0, 1);
  assertOptionalBoundedString(card.batchId, "Memory card batch id", MAX_METADATA_ID_LENGTH);
  assertOptionalBoundedString(card.projectId, "Memory card project id", MAX_METADATA_ID_LENGTH);
  if (card.type === "todo") {
    assertOptionalBoundedString(card.owner, "Memory card owner", MAX_MEMORY_CARD_OWNER_LENGTH);
    assertOptionalIsoDateString(card.dueAt, "Memory card due date");
  }
  assertBoundedRequiredString(card.title, "Memory card title", MAX_MEMORY_CARD_TITLE_LENGTH);
  assertBoundedRequiredString(card.body, "Memory card body", MAX_MEMORY_CARD_BODY_LENGTH);
  assertTagListCanBeStored(card.tags, "Memory card");
  assertSourceAnchorsCanBeStored(card.sourceAnchors, "Memory card");
}

function assertBoundedRequiredString(value: unknown, label: string, maxLength: number): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
}

function assertOptionalBoundedString(value: unknown, label: string, maxLength: number): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
}

function assertSupportedString<T extends string>(value: unknown, label: string, supportedValues: Set<T>): void {
  if (typeof value !== "string" || !supportedValues.has(value as T)) {
    throw new Error(`${label} is not supported.`);
  }
}

function assertIsoDateString(value: unknown, label: string): void {
  if (!isIsoDateString(value)) {
    throw new Error(`${label} must be an ISO date string.`);
  }
}

function assertOptionalIsoDateString(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  assertIsoDateString(value, label);
}

function assertOptionalNumberInRange(value: unknown, label: string, min: number, max: number): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
}

function assertTagListCanBeStored(tags: unknown, label: string): void {
  if (!Array.isArray(tags)) {
    throw new Error(`${label} tags must be an array.`);
  }

  if (tags.length > MAX_MEMORY_CARD_TAG_COUNT) {
    throw new Error(`${label} tags must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`);
  }

  for (const tag of tags) {
    if (typeof tag !== "string") {
      throw new Error(`${label} tags must be strings.`);
    }

    const normalizedTag = normalizeTag(tag);

    if (!normalizedTag) {
      throw new Error(`${label} tags must contain values after removing leading # markers.`);
    }

    if (tag.length > MAX_MEMORY_CARD_TAG_LENGTH || normalizedTag.length > MAX_MEMORY_CARD_TAG_LENGTH) {
      throw new Error(`${label} tag must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`);
    }
  }
}

function assertSourceAnchorsCanBeStored(sourceAnchors: unknown, label: string): void {
  if (!Array.isArray(sourceAnchors)) {
    throw new Error(`${label} source anchors must be an array.`);
  }

  if (sourceAnchors.length === 0) {
    throw new Error(`${label} source anchors must contain at least one source anchor.`);
  }

  if (sourceAnchors.length > MAX_SOURCE_ANCHORS_PER_MEMORY_CARD) {
    throw new Error(
      `${label} source anchors must contain ${MAX_SOURCE_ANCHORS_PER_MEMORY_CARD} source anchors or fewer.`
    );
  }

  for (const sourceAnchor of sourceAnchors) {
    if (!isRecord(sourceAnchor)) {
      throw new Error(`${label} source anchors must be objects.`);
    }

    assertBoundedRequiredString(sourceAnchor.id, `${label} source anchor id`, MAX_METADATA_ID_LENGTH);
    assertBoundedRequiredString(sourceAnchor.archiveId, `${label} source anchor archive id`, MAX_METADATA_ID_LENGTH);
    assertBoundedRequiredString(sourceAnchor.turnId, `${label} source anchor turn id`, MAX_METADATA_ID_LENGTH);
    assertOptionalBoundedString(sourceAnchor.quote, `${label} source anchor quote`, MAX_SOURCE_ANCHOR_QUOTE_LENGTH);
    assertSourceAnchorSpanCanBeStored(sourceAnchor, label);
  }
}

function assertSourceAnchorSpanCanBeStored(sourceAnchor: Record<string, unknown>, label: string): void {
  const hasStart = sourceAnchor.charStart !== undefined;
  const hasEnd = sourceAnchor.charEnd !== undefined;

  if (hasStart !== hasEnd) {
    throw new Error(`${label} source anchor charStart and charEnd must be provided together.`);
  }

  if (hasStart && !isNonNegativeInteger(sourceAnchor.charStart)) {
    throw new Error(`${label} source anchor charStart must be a non-negative integer.`);
  }

  if (hasEnd && !isNonNegativeInteger(sourceAnchor.charEnd)) {
    throw new Error(`${label} source anchor charEnd must be a non-negative integer.`);
  }

  if (
    typeof sourceAnchor.charStart === "number" &&
    typeof sourceAnchor.charEnd === "number" &&
    sourceAnchor.charEnd <= sourceAnchor.charStart
  ) {
    throw new Error(`${label} source anchor charEnd must be greater than charStart.`);
  }

  if (sourceAnchor.quote === "") {
    throw new Error(`${label} source anchor quote must be non-empty when present.`);
  }
}

function parseConversationCapturesImport(value: unknown): ConversationCapture[] {
  const values = Array.isArray(value) ? value : [value];

  if (values.length === 0) {
    throw new Error("Conversation capture import is empty.");
  }

  if (values.length > MAX_CONVERSATION_CAPTURE_IMPORT_COUNT) {
    throw new Error(
      `Conversation capture import must contain ${MAX_CONVERSATION_CAPTURE_IMPORT_COUNT} conversations or fewer.`
    );
  }

  let totalTurnCount = 0;

  return values.map((capture, index) => {
    const validation = validateConversationCapture(capture);

    if (!validation.ok) {
      throw new Error(
        `Invalid conversation capture import at $[${index}] (${formatValidationIssues(validation.issues)}).`
      );
    }

    if (validation.value.turns.length === 0) {
      throw new Error(`Invalid conversation capture import at $[${index}] ($.turns: must contain at least one turn).`);
    }

    totalTurnCount += validation.value.turns.length;

    if (totalTurnCount > MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT) {
      throw new Error(
        `Conversation capture import must contain ${MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT} turns or fewer.`
      );
    }

    return validation.value;
  });
}

function summarizeCaptureImportResults(results: CaptureResult[]): ImportConversationCapturesResult {
  const summary = results.reduce<ImportConversationCapturesResult>(
    (summary, result) => {
      summary.importedCount += 1;

      if (result.deduplicated) {
        summary.deduplicatedCount += 1;
      } else {
        summary.archiveCount += 1;
        summary.turnCount += result.turns.length;
        summary.proposedMemoryCardCount += result.proposedCards.length;
      }

      return summary;
    },
    {
      importedCount: 0,
      deduplicatedCount: 0,
      archiveCount: 0,
      turnCount: 0,
      proposedMemoryCardCount: 0,
      warningCounts: []
    }
  );

  summary.warningCounts = summarizeCaptureWarnings(results);

  return summary;
}

function summarizeCaptureWarnings(results: CaptureResult[]): CaptureWarningCount[] {
  const warningCounts = new Map<string, CaptureWarningCount>();

  for (const result of results) {
    for (const warning of result.archive.warnings) {
      const current = warningCounts.get(warning.code);

      if (current) {
        current.count += 1;
      } else {
        warningCounts.set(warning.code, {
          code: warning.code,
          count: 1,
          message: sanitizeCaptureWarningMessage(warning)
        });
      }
    }
  }

  return [...warningCounts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function sanitizeCaptureWarningMessage(warning: { code: string; message: string }): string {
  const sensitivity = maxSensitivity(classifySensitivity(warning.message), warningCodeSensitivity(warning.code));

  return sensitivity === "normal" ? warning.message : redactProtectedText(warning.message, sensitivity);
}

function warningCodeSensitivity(code: string): Sensitivity {
  switch (code) {
    case "secret_content_detected":
      return "secret";
    case "sensitive_content_detected":
      return "sensitive";
    default:
      return "normal";
  }
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

async function assertMemoryCardExists(repository: VaultRepository, cardId: string): Promise<void> {
  const existingCard = await repository.getMemoryCard(cardId);

  if (!existingCard) {
    throw new Error(`Memory card not found: ${formatErrorIdentifier(cardId)}`);
  }
}

async function assertMemoryCardUpdateIsSourceGrounded(repository: VaultRepository, card: MemoryCard): Promise<void> {
  const vault: VaultExport = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    archives: [],
    memoryCards: [card]
  };
  const archiveIds = [...new Set(getSafeSourceAnchors(getSafeMemoryCardForRead(card)).map((anchor) => anchor.archiveId))];

  try {
    vault.archives = await Promise.all(archiveIds.map((archiveId) => repository.getArchiveWithTurns(archiveId)));
  } catch (error) {
    const message = error instanceof Error ? sanitizeErrorMessage(error.message) : "source archive does not exist";
    throw new Error(`Memory card update is not source-grounded (${message}).`);
  }

  if (!isVaultExport(vault)) {
    throw new Error("Memory card update is not source-grounded or has invalid fields.");
  }
}

function classifyMemoryCardSensitivity(card: MemoryCard) {
  return getEffectiveMemorySensitivity(card);
}

async function createManualMemoryCardForArchive(
  repository: VaultRepository,
  archiveId: string,
  input: NormalizedManualMemoryCardInput,
  now: string,
  preferredTurnId?: string
): Promise<MemoryCard> {
  const archiveWithTurns = await repository.getArchiveWithTurns(archiveId);
  const sourceTurn = preferredTurnId
    ? archiveWithTurns.turns.find((turn) => turn.id === preferredTurnId)
    : archiveWithTurns.turns.find((turn) => turn.text === input.body);

  if (!sourceTurn) {
    throw new Error(`Manual memory source turn not found for archive: ${formatErrorIdentifier(archiveId)}`);
  }

  const card = buildManualMemoryCard(archiveId, sourceTurn, input, now);

  await repository.saveMemoryCards([card]);

  return card;
}

function buildManualMemoryCard(
  archiveId: string,
  sourceTurn: SourceTurn,
  input: NormalizedManualMemoryCardInput,
  now: string
): MemoryCard {
  const cardId = crypto.randomUUID();
  const cardDraft: MemoryCard = {
    id: cardId,
    type: input.type,
    title: input.title,
    body: input.body,
    status: "accepted",
    scope: input.scope,
    sensitivity: classifyMemoryCardSensitivity({
      id: cardId,
      type: input.type,
      title: input.title,
      body: input.body,
      status: "accepted",
      scope: input.scope,
      sensitivity: "normal",
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      sourceAnchors: []
    }),
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    sourceAnchors: [
      {
        id: crypto.randomUUID(),
        archiveId,
        turnId: sourceTurn.id,
        charStart: 0,
        charEnd: input.body.length,
        quote: input.body
      }
    ]
  };

  return normalizeMemoryCard({
    ...cardDraft,
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {})
  });
}

async function findMatchingManualMemoryCard(
  repository: VaultRepository,
  archiveId: string,
  input: NormalizedManualMemoryCardInput
): Promise<MemoryCard | undefined> {
  const cards = await repository.listMemoryCards();

  return cards.find((card) => {
    const normalizedCard = normalizeMemoryCard(getSafeMemoryCardForRead(card));

    return (
      getSafeSourceAnchors(normalizedCard).some((anchor) => anchor.archiveId === archiveId) &&
      normalizedCard.status === "accepted" &&
      normalizedCard.type === input.type &&
      normalizedCard.scope === input.scope &&
      normalizedCard.title === input.title &&
      normalizedCard.body === input.body &&
      areStringArraysEqual(normalizedCard.tags, input.tags) &&
      (normalizedCard.owner ?? "") === (input.owner ?? "") &&
      (normalizedCard.dueAt ?? "") === (input.dueAt ?? "")
    );
  });
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function manualArchiveHashInput(input: NormalizedManualMemoryCardInput): string {
  return `manual\n${input.body}`;
}

async function findManualSourceArchiveByBody(
  repository: VaultRepository,
  body: string
): Promise<SourceArchive | undefined> {
  const archives = await repository.listArchives();

  for (const archive of archives) {
    if (archive.provider !== "generic" || archive.captureMethod !== "clipboard") {
      continue;
    }

    const archiveWithTurns = await repository.getArchiveWithTurns(archive.id);

    if (archiveWithTurns.turns.some((turn) => turn.role === "user" && turn.text === body)) {
      return archive;
    }
  }

  return undefined;
}

function normalizeManualMemoryCardInput(input: ManualMemoryCardInput): NormalizedManualMemoryCardInput {
  if (!isRecord(input)) {
    throw new Error("Manual memory input must be an object.");
  }

  if (typeof input.title !== "string") {
    throw new Error("Manual memory title is required.");
  }

  if (typeof input.body !== "string") {
    throw new Error("Manual memory body is required.");
  }

  if (typeof input.type !== "string" || !MANUAL_MEMORY_TYPES.has(input.type as MemoryCardType)) {
    throw new Error("Manual memory type is not supported.");
  }

  if (typeof input.scope !== "string" || !MEMORY_SCOPES.has(input.scope as MemoryScope)) {
    throw new Error("Manual memory scope is not supported.");
  }

  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    throw new Error("Manual memory tags must be strings.");
  }

  if (input.tags !== undefined) {
    assertTagListCanBeStored(input.tags, "Manual memory");
  }

  if (input.owner !== undefined && typeof input.owner !== "string") {
    throw new Error("Manual memory owner must be a string.");
  }

  if (input.dueAt !== undefined && typeof input.dueAt !== "string") {
    throw new Error("Manual memory due date must be an ISO date string.");
  }

  const title = input.title.trim();
  const body = input.body.trim();
  const tags = normalizeTagList(input.tags ?? []);
  const owner = input.owner?.trim();
  const dueAt = input.dueAt?.trim();

  if (!title) {
    throw new Error("Manual memory title is required.");
  }

  if (title.length > MAX_MEMORY_CARD_TITLE_LENGTH) {
    throw new Error(`Manual memory title must be ${MAX_MEMORY_CARD_TITLE_LENGTH} characters or fewer.`);
  }

  if (!body) {
    throw new Error("Manual memory body is required.");
  }

  if (body.length > MAX_MANUAL_MEMORY_BODY_LENGTH) {
    throw new Error(`Manual memory body must be ${MAX_MANUAL_MEMORY_BODY_LENGTH} characters or fewer.`);
  }

  assertTagListCanBeStored(tags, "Manual memory");

  if (owner && owner.length > MAX_MEMORY_CARD_OWNER_LENGTH) {
    throw new Error(`Manual memory owner must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer.`);
  }

  if (dueAt && !isIsoDateString(dueAt)) {
    throw new Error("Manual memory due date must be an ISO date string.");
  }

  if (dueAt && input.type !== "todo") {
    throw new Error("Manual memory due date is only supported for todo cards.");
  }

  if (owner && input.type !== "todo") {
    throw new Error("Manual memory owner is only supported for todo cards.");
  }

  return {
    title,
    body,
    type: input.type,
    scope: input.scope,
    tags,
    ...(owner ? { owner } : {}),
    ...(dueAt ? { dueAt } : {})
  };
}

function manualCaptureWarnings(text: string) {
  const sensitivity = classifySensitivity(text);

  if (sensitivity === "normal") {
    return [];
  }

  return [
    {
      code: `${sensitivity}_content_detected`,
      message:
        sensitivity === "secret"
          ? "Manual memory source appears to contain secrets."
          : "Manual memory source appears to contain sensitive content."
    }
  ];
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  if (!ISO_DATE_TIME_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function withClassifiedMemorySensitivity(card: MemoryCard): MemoryCard {
  const normalizedCard = normalizeMemoryCard(card);

  return {
    ...normalizedCard,
    sensitivity: classifyMemoryCardSensitivity(normalizedCard)
  };
}

function formatVaultImportValidationError(issues: { path: string; message: string }[]): string {
  return `Invalid ContextVault export JSON (${formatValidationIssues(issues)}).`;
}

async function assertNoImportConflicts(repository: VaultRepository, vault: VaultExport): Promise<void> {
  const existingArchives = await repository.listArchives();
  const existingCards = await repository.listMemoryCards();
  const existingArchiveIds = new Set(existingArchives.map((archive) => archive.id));
  const existingArchiveContentHashes = new Set(existingArchives.map((archive) => archive.contentHash));
  const existingCardIds = new Set(existingCards.map((card) => card.id));
  const existingTurnIds = new Set<string>();
  const conflictingArchiveIds = vault.archives
    .map((archiveWithTurns) => archiveWithTurns.archive.id)
    .filter((archiveId) => existingArchiveIds.has(archiveId));
  const conflictingArchiveContentHashes = vault.archives
    .map((archiveWithTurns) => archiveWithTurns.archive.contentHash)
    .filter((contentHash) => existingArchiveContentHashes.has(contentHash));
  const importedTurnIds = vault.archives.flatMap((archiveWithTurns) => archiveWithTurns.turns.map((turn) => turn.id));
  const conflictingCardIds = vault.memoryCards
    .map((card) => card.id)
    .filter((cardId) => existingCardIds.has(cardId));

  await Promise.all(
    existingArchives.map(async (archive) => {
      const archiveWithTurns = await repository.getArchiveWithTurns(archive.id);

      for (const turn of archiveWithTurns.turns) {
        existingTurnIds.add(turn.id);
      }
    })
  );

  const conflictingTurnIds = importedTurnIds.filter((turnId) => existingTurnIds.has(turnId));

  if (
    conflictingArchiveIds.length > 0 ||
    conflictingArchiveContentHashes.length > 0 ||
    conflictingTurnIds.length > 0 ||
    conflictingCardIds.length > 0
  ) {
    const parts: string[] = [];

    if (conflictingArchiveIds.length > 0) {
      parts.push(formatImportConflictSummary("archive ids", conflictingArchiveIds));
    }

    if (conflictingArchiveContentHashes.length > 0) {
      parts.push(formatImportConflictSummary("archive content hashes", conflictingArchiveContentHashes, { hash: true }));
    }

    if (conflictingTurnIds.length > 0) {
      parts.push(formatImportConflictSummary("turn ids", conflictingTurnIds));
    }

    if (conflictingCardIds.length > 0) {
      parts.push(formatImportConflictSummary("memory card ids", conflictingCardIds));
    }

    throw new Error(`Import would overwrite existing ContextVault data (${parts.join("; ")}).`);
  }
}

function formatImportConflictSummary(label: string, values: string[], options: { hash?: boolean } = {}): string {
  const sample = values.slice(0, 3).map((value) => formatImportConflictValue(value, options));
  const suffix = values.length > sample.length ? `, +${values.length - sample.length} more` : "";

  return `${label}: ${values.length} conflict(s) (${sample.join(", ")}${suffix})`;
}

function formatImportConflictValue(value: string, options: { hash?: boolean } = {}): string {
  const redacted = redactIdentifier(value);

  if (options.hash && !redacted.didRedact) {
    return redacted.value.length > 12 ? `${redacted.value.slice(0, 12)}...` : redacted.value;
  }

  return redacted.value.length > 48 ? `${redacted.value.slice(0, 45)}...` : redacted.value;
}

function formatErrorIdentifier(value: string): string {
  const redacted = redactIdentifier(value);

  return redacted.value.length > 48 ? `${redacted.value.slice(0, 45)}...` : redacted.value;
}

function sanitizeErrorMessage(message: string): string {
  const sensitivity = classifySensitivity(message);
  const sanitized = sensitivity === "normal" ? message : redactProtectedText(message, sensitivity);

  return sanitized.length > 240 ? `${sanitized.slice(0, 237).trim()}...` : sanitized;
}

function redactIdentifier(value: string): { value: string; didRedact: boolean } {
  const sensitivity = classifySensitivity(value);

  if (sensitivity === "normal") {
    return { value, didRedact: false };
  }

  return { value: redactProtectedText(value, sensitivity), didRedact: true };
}

function markdownExportTitle(status?: MemoryCardStatus): string {
  switch (status) {
    case "accepted":
      return "ContextVault Accepted Memories";
    case "proposed":
      return "ContextVault Proposed Memories";
    case "rejected":
      return "ContextVault Rejected Memories";
    case "archived":
      return "ContextVault Archived Memories";
    case "superseded":
      return "ContextVault Superseded Memories";
    default:
      return "ContextVault Memory Cards";
  }
}
