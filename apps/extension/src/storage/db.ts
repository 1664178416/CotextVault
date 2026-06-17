import type {
  ArchiveWithTurns,
  DeleteArchiveResult,
  DeleteMemoryCardResult,
  ImportVaultResult,
  MemoryCard,
  MemoryCardStatus,
  SourceArchive,
  SourceTurn,
  VaultIntegrityIssue,
  VaultIntegrityIssueCode,
  VaultIntegrityReport,
  VaultExport
} from "@contextvault/shared";
import {
  getSafeSourceAnchors,
  MAX_CAPTURE_WARNING_CODE_LENGTH,
  MAX_CAPTURE_WARNING_COUNT,
  MAX_CAPTURE_WARNING_MESSAGE_LENGTH,
  MAX_CONTENT_HASH_LENGTH,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  MAX_MEMORY_CARD_TITLE_LENGTH,
  MAX_METADATA_ID_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  MAX_SOURCE_SELECTOR_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_URL_LENGTH,
  MAX_VAULT_INTEGRITY_ISSUE_DETAILS
} from "@contextvault/shared";

const MAX_INTEGRITY_IDENTIFIER_LENGTH = 512;

type IntegrityIssueMetadata = Omit<VaultIntegrityIssue, "code" | "message">;

const PROVIDERS = new Set(["chatgpt", "gemini", "claude", "generic", "unknown"]);
const CAPTURE_METHODS = new Set(["official_export", "main_world_network", "devtools_network", "dom", "clipboard"]);
const SOURCE_ROLES = new Set(["user", "assistant", "system", "tool", "unknown"]);
const MEMORY_CARD_TYPES = new Set(["project_fact", "decision", "todo", "preference", "method", "citation_anchor"]);
const MEMORY_CARD_STATUSES = new Set(["proposed", "accepted", "rejected", "archived", "superseded"]);
const MEMORY_SCOPES = new Set(["global", "project", "conversation"]);
const SENSITIVITIES = new Set(["normal", "sensitive", "secret"]);
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const DB_NAME = "contextvault";
const DB_VERSION = 2;

const STORES = {
  archives: "source_archives",
  turns: "source_turns",
  cards: "memory_cards"
} as const;

let dbPromise: Promise<IDBDatabase> | undefined;
let dbInstance: IDBDatabase | undefined;

export function resetDatabaseConnectionForTests(): void {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.archives)) {
        const store = db.createObjectStore(STORES.archives, { keyPath: "id" });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
        store.createIndex("provider", "provider", { unique: false });
        store.createIndex("contentHash", "contentHash", { unique: false });
      } else {
        const store = request.transaction?.objectStore(STORES.archives);

        if (store && !store.indexNames.contains("contentHash")) {
          store.createIndex("contentHash", "contentHash", { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.turns)) {
        const store = db.createObjectStore(STORES.turns, { keyPath: "id" });
        store.createIndex("archiveId", "archiveId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.cards)) {
        const store = db.createObjectStore(STORES.cards, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = undefined;
        dbPromise = undefined;
      };
      resolve(dbInstance);
    };
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.oncomplete = () => resolve();
  });
}

export async function saveArchiveWithTurns(archive: SourceArchive, turns: SourceTurn[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns], "readwrite");
  const archives = transaction.objectStore(STORES.archives);
  const turnsStore = transaction.objectStore(STORES.turns);
  const existingTurns = await requestToPromise(turnsStore.index("archiveId").getAll(archive.id) as IDBRequest<SourceTurn[]>);

  for (const existingTurn of existingTurns) {
    turnsStore.delete(existingTurn.id);
  }

  archives.put(archive);

  for (const turn of turns) {
    turnsStore.put(turn);
  }

  await transactionDone(transaction);
}

export async function saveArchiveWithTurnsAndCards(
  archive: SourceArchive,
  turns: SourceTurn[],
  cards: MemoryCard[]
): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns, STORES.cards], "readwrite");
  const archives = transaction.objectStore(STORES.archives);
  const turnsStore = transaction.objectStore(STORES.turns);
  const cardStore = transaction.objectStore(STORES.cards);
  const existingTurns = await requestToPromise(turnsStore.index("archiveId").getAll(archive.id) as IDBRequest<SourceTurn[]>);

  for (const existingTurn of existingTurns) {
    turnsStore.delete(existingTurn.id);
  }

  archives.put(archive);

  for (const turn of turns) {
    turnsStore.put(turn);
  }

  for (const card of cards) {
    cardStore.put(card);
  }

  await transactionDone(transaction);
}

export async function listArchives(): Promise<SourceArchive[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.archives, "readonly");
  const store = transaction.objectStore(STORES.archives);
  const archives = await requestToPromise(store.getAll() as IDBRequest<SourceArchive[]>);

  return archives.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function findArchiveByContentHash(contentHash: string): Promise<SourceArchive | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.archives, "readonly");
  const store = transaction.objectStore(STORES.archives);

  if (!store.indexNames.contains("contentHash")) {
    const archives = await requestToPromise(store.getAll() as IDBRequest<SourceArchive[]>);
    return archives.find((archive) => archive.contentHash === contentHash);
  }

  return requestToPromise(
    store.index("contentHash").get(contentHash) as IDBRequest<SourceArchive | undefined>
  );
}

export async function getArchiveWithTurns(archiveId: string): Promise<ArchiveWithTurns> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns], "readonly");
  const archive = await requestToPromise(
    transaction.objectStore(STORES.archives).get(archiveId) as IDBRequest<SourceArchive | undefined>
  );

  if (!archive) {
    throw new Error(`Archive not found: ${archiveId}`);
  }

  const index = transaction.objectStore(STORES.turns).index("archiveId");
  const turns = await requestToPromise(index.getAll(archiveId) as IDBRequest<SourceTurn[]>);

  turns.sort((a, b) => a.orderIndex - b.orderIndex);

  return { archive, turns };
}

export async function saveMemoryCards(cards: MemoryCard[]): Promise<void> {
  if (cards.length === 0) {
    return;
  }

  const db = await openDatabase();
  const transaction = db.transaction(STORES.cards, "readwrite");
  const store = transaction.objectStore(STORES.cards);

  for (const card of cards) {
    store.put(card);
  }

  await transactionDone(transaction);
}

export async function listMemoryCards(status?: MemoryCardStatus): Promise<MemoryCard[]> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.cards, "readonly");
  const store = transaction.objectStore(STORES.cards);
  const cards = status
    ? await requestToPromise(store.index("status").getAll(status) as IDBRequest<MemoryCard[]>)
    : await requestToPromise(store.getAll() as IDBRequest<MemoryCard[]>);

  return cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMemoryCard(cardId: string): Promise<MemoryCard | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.cards, "readonly");

  return requestToPromise(
    transaction.objectStore(STORES.cards).get(cardId) as IDBRequest<MemoryCard | undefined>
  );
}

export async function updateMemoryCard(card: MemoryCard): Promise<MemoryCard> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.cards, "readwrite");
  transaction.objectStore(STORES.cards).put(card);
  await transactionDone(transaction);
  return card;
}

export async function deleteMemoryCard(cardId: string): Promise<DeleteMemoryCardResult> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES.cards, "readwrite");
  transaction.objectStore(STORES.cards).delete(cardId);
  await transactionDone(transaction);

  return { cardId };
}

export async function deleteArchiveCascade(archiveId: string): Promise<DeleteArchiveResult> {
  const archiveWithTurns = await getArchiveWithTurns(archiveId);
  const cards = await listMemoryCards();
  const turns = archiveWithTurns.turns;
  const cardsToDelete: MemoryCard[] = [];
  const cardsToUpdate: MemoryCard[] = [];
  const now = new Date().toISOString();

  for (const card of cards) {
    const sourceAnchors = getSafeSourceAnchors(card);

    if (!sourceAnchors.some((anchor) => anchor.archiveId === archiveId)) {
      continue;
    }

    const remainingSourceAnchors = sourceAnchors.filter((anchor) => anchor.archiveId !== archiveId);

    if (remainingSourceAnchors.length === 0) {
      cardsToDelete.push(card);
    } else {
      cardsToUpdate.push({
        ...card,
        updatedAt: now,
        sourceAnchors: remainingSourceAnchors
      });
    }
  }
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns, STORES.cards], "readwrite");
  const archiveStore = transaction.objectStore(STORES.archives);
  const turnStore = transaction.objectStore(STORES.turns);
  const cardStore = transaction.objectStore(STORES.cards);

  archiveStore.delete(archiveId);

  for (const turn of turns) {
    turnStore.delete(turn.id);
  }

  for (const card of cardsToDelete) {
    cardStore.delete(card.id);
  }

  for (const card of cardsToUpdate) {
    cardStore.put(card);
  }

  await transactionDone(transaction);

  return {
    archiveId,
    deletedTurnCount: turns.length,
    deletedMemoryCardCount: cardsToDelete.length,
    updatedMemoryCardCount: cardsToUpdate.length
  };
}

export async function auditVaultIntegrity(): Promise<VaultIntegrityReport> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns, STORES.cards], "readonly");
  const archiveRequest = transaction.objectStore(STORES.archives).getAll() as IDBRequest<SourceArchive[]>;
  const turnRequest = transaction.objectStore(STORES.turns).getAll() as IDBRequest<SourceTurn[]>;
  const cardRequest = transaction.objectStore(STORES.cards).getAll() as IDBRequest<MemoryCard[]>;
  const [archives, turns, memoryCards] = await Promise.all([
    requestToPromise(archiveRequest),
    requestToPromise(turnRequest),
    requestToPromise(cardRequest)
  ]);

  await transactionDone(transaction);

  return buildVaultIntegrityReport(archives, turns, memoryCards, new Date().toISOString());
}

function buildVaultIntegrityReport(
  archives: SourceArchive[],
  turns: SourceTurn[],
  memoryCards: MemoryCard[],
  checkedAt: string
): VaultIntegrityReport {
  const archiveIds = new Set<string>();
  const turnById = new Map<string, SourceTurn>();
  const turnCountsByArchive = countTurnsByArchive(turns);
  const issues: VaultIntegrityIssue[] = [];
  let issueCount = 0;
  const addIssue = (issue: VaultIntegrityIssue) => {
    issueCount += 1;

    if (issues.length < MAX_VAULT_INTEGRITY_ISSUE_DETAILS) {
      issues.push(issue);
    }
  };

  for (const archive of archives) {
    const rawArchive = archive as unknown;
    const archiveId = getIntegrityIdentifier(isRecord(rawArchive) ? rawArchive.id : undefined, "unknown-archive");

    auditSourceArchiveShape(archive, archiveId, addIssue);

    if (isRecord(rawArchive) && isBoundedNonEmptyString(rawArchive.id, MAX_METADATA_ID_LENGTH)) {
      archiveIds.add(rawArchive.id);
    }
  }

  for (const turn of turns) {
    const rawTurn = turn as unknown;
    const archiveId = getIntegrityIdentifier(isRecord(rawTurn) ? rawTurn.archiveId : undefined, "unknown-archive");
    const turnId = getIntegrityIdentifier(isRecord(rawTurn) ? rawTurn.id : undefined, "unknown-turn");

    auditSourceTurnShape(turn, turnId, archiveId, addIssue);

    if (isRecord(rawTurn) && isBoundedNonEmptyString(rawTurn.id, MAX_METADATA_ID_LENGTH)) {
      turnById.set(rawTurn.id, turn);
    }

    if (
      isRecord(rawTurn) &&
      isBoundedNonEmptyString(rawTurn.archiveId, MAX_METADATA_ID_LENGTH) &&
      !archiveIds.has(rawTurn.archiveId)
    ) {
      addIssue(integrityIssue("orphan_source_turn", `Source turn references missing archive "${formatIntegrityIdentifier(rawTurn.archiveId)}".`, {
        archiveId: rawTurn.archiveId,
        turnId
      }));
    }
  }

  for (const archive of archives) {
    const rawArchive = archive as unknown;

    if (
      isRecord(rawArchive) &&
      isBoundedNonEmptyString(rawArchive.id, MAX_METADATA_ID_LENGTH) &&
      (turnCountsByArchive.get(rawArchive.id) ?? 0) === 0
    ) {
      addIssue(integrityIssue("empty_source_archive", `Source archive "${formatIntegrityIdentifier(rawArchive.id)}" has no source turns.`, {
        archiveId: rawArchive.id
      }));
    }
  }

  for (const card of memoryCards) {
    const cardId = getIntegrityIdentifier(card.id, "unknown-card");

    auditMemoryCardShape(card, cardId, addIssue);

    if (!Array.isArray(card.sourceAnchors)) {
      addIssue(integrityIssue("malformed_memory_card", "Memory card sourceAnchors must be an array.", {
        memoryCardId: cardId
      }));
      continue;
    }

    if (card.sourceAnchors.length === 0) {
      addIssue(integrityIssue("memory_card_without_source_anchor", `Memory card "${formatIntegrityIdentifier(cardId)}" has no source anchors.`, {
        memoryCardId: cardId
      }));
      continue;
    }

    for (const anchor of card.sourceAnchors) {
      if (!isRecord(anchor)) {
        addIssue(integrityIssue("malformed_source_anchor", "Memory card source anchor must be an object.", {
          memoryCardId: cardId
        }));
        continue;
      }

      const anchorId = getIntegrityIdentifier(anchor.id, "unknown-anchor");
      const archiveId = getIntegrityIdentifier(anchor.archiveId, "unknown-archive");
      const turnId = getIntegrityIdentifier(anchor.turnId, "unknown-turn");

      if (
        typeof anchor.id !== "string" ||
        typeof anchor.archiveId !== "string" ||
        typeof anchor.turnId !== "string" ||
        anchor.id.trim().length === 0 ||
        anchor.archiveId.trim().length === 0 ||
        anchor.turnId.trim().length === 0
      ) {
        addIssue(integrityIssue("malformed_source_anchor", "Source anchor id, archiveId, and turnId are required strings.", {
          archiveId,
          turnId,
          memoryCardId: cardId,
          sourceAnchorId: anchorId
        }));
        continue;
      }

      if (!archiveIds.has(anchor.archiveId)) {
        addIssue(
          integrityIssue("source_anchor_missing_archive", `Source anchor references missing archive "${formatIntegrityIdentifier(anchor.archiveId)}".`, {
            archiveId: anchor.archiveId,
            turnId: anchor.turnId,
            memoryCardId: cardId,
            sourceAnchorId: anchor.id
          })
        );
        continue;
      }

      const turn = turnById.get(anchor.turnId);

      if (!turn) {
        addIssue(integrityIssue("source_anchor_missing_turn", `Source anchor references missing turn "${formatIntegrityIdentifier(anchor.turnId)}".`, {
          archiveId: anchor.archiveId,
          turnId: anchor.turnId,
          memoryCardId: cardId,
          sourceAnchorId: anchor.id
        }));
        continue;
      }

      if (!sourceTurnHasValidArchiveId(turn)) {
        continue;
      }

      if (turn.archiveId !== anchor.archiveId) {
        addIssue(
          integrityIssue(
            "source_anchor_turn_archive_mismatch",
            `Source anchor turn "${formatIntegrityIdentifier(anchor.turnId)}" belongs to archive "${formatIntegrityIdentifier(turn.archiveId)}", not "${formatIntegrityIdentifier(anchor.archiveId)}".`,
            {
              archiveId: anchor.archiveId,
              turnId: anchor.turnId,
              memoryCardId: cardId,
              sourceAnchorId: anchor.id
            }
          )
        );
        continue;
      }

      if (!sourceTurnHasValidText(turn)) {
        continue;
      }

      auditSourceAnchorEvidence(cardId, anchor, turn, addIssue);
    }
  }

  return {
    checkedAt,
    archiveCount: archives.length,
    sourceTurnCount: turns.length,
    memoryCardCount: memoryCards.length,
    issueCount,
    omittedIssueCount: Math.max(0, issueCount - issues.length),
    issues
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getIntegrityIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function auditSourceArchiveShape(
  archive: SourceArchive,
  archiveId: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  const value = archive as unknown;

  if (!isRecord(value)) {
    addSourceArchiveShapeIssue(archiveId, "Source archive must be an object.", addIssue);
    return;
  }

  auditSourceArchiveRequiredStringField(value.id, archiveId, "id", MAX_METADATA_ID_LENGTH, addIssue);
  auditSourceArchiveSupportedStringField(value.provider, archiveId, "provider", PROVIDERS, addIssue);
  auditSourceArchiveOptionalStringField(
    value.providerConversationId,
    archiveId,
    "providerConversationId",
    MAX_METADATA_ID_LENGTH,
    addIssue
  );
  auditSourceArchiveOptionalStringField(value.title, archiveId, "title", MAX_SOURCE_TITLE_LENGTH, addIssue);
  auditSourceArchiveOptionalStringField(value.url, archiveId, "url", MAX_URL_LENGTH, addIssue);
  auditSourceArchiveSupportedStringField(value.captureMethod, archiveId, "captureMethod", CAPTURE_METHODS, addIssue);
  auditSourceArchiveRequiredIsoDateField(value.capturedAt, archiveId, "capturedAt", addIssue);
  auditSourceArchiveRequiredStringField(value.contentHash, archiveId, "contentHash", MAX_CONTENT_HASH_LENGTH, addIssue);

  if (value.schemaVersion !== 1) {
    addSourceArchiveShapeIssue(archiveId, "Source archive schemaVersion must be 1.", addIssue);
  }

  auditSourceArchiveWarnings(value.warnings, archiveId, addIssue);
}

function auditSourceArchiveRequiredStringField(
  value: unknown,
  archiveId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be a non-empty string.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditSourceArchiveOptionalStringField(
  value: unknown,
  archiveId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be a string when present.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditSourceArchiveSupportedStringField(
  value: unknown,
  archiveId: string,
  fieldName: string,
  supportedValues: Set<string>,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || !supportedValues.has(value)) {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be supported.`, addIssue);
  }
}

function auditSourceArchiveRequiredIsoDateField(
  value: unknown,
  archiveId: string,
  fieldName: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (!isIsoDateString(value)) {
    addSourceArchiveShapeIssue(archiveId, `Source archive ${fieldName} must be an ISO date string.`, addIssue);
  }
}

function auditSourceArchiveWarnings(
  warnings: unknown,
  archiveId: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (!Array.isArray(warnings)) {
    addSourceArchiveShapeIssue(archiveId, "Source archive warnings must be an array.", addIssue);
    return;
  }

  if (warnings.length > MAX_CAPTURE_WARNING_COUNT) {
    addSourceArchiveShapeIssue(
      archiveId,
      `Source archive warnings must contain ${MAX_CAPTURE_WARNING_COUNT} warnings or fewer.`,
      addIssue
    );
  }

  for (const warning of warnings.slice(0, MAX_CAPTURE_WARNING_COUNT)) {
    if (!isRecord(warning)) {
      addSourceArchiveShapeIssue(archiveId, "Source archive warnings must be objects.", addIssue);
      continue;
    }

    auditSourceArchiveWarningStringField(warning.code, archiveId, "code", MAX_CAPTURE_WARNING_CODE_LENGTH, addIssue);
    auditSourceArchiveWarningStringField(
      warning.message,
      archiveId,
      "message",
      MAX_CAPTURE_WARNING_MESSAGE_LENGTH,
      addIssue
    );
  }
}

function auditSourceArchiveWarningStringField(
  value: unknown,
  archiveId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    addSourceArchiveShapeIssue(archiveId, `Source archive warning ${fieldName} must be a non-empty string.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addSourceArchiveShapeIssue(
      archiveId,
      `Source archive warning ${fieldName} must be ${maxLength} characters or fewer.`,
      addIssue
    );
  }
}

function addSourceArchiveShapeIssue(
  archiveId: string,
  message: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  addIssue(integrityIssue("malformed_source_archive", message, { archiveId }));
}

function auditSourceTurnShape(
  turn: SourceTurn,
  turnId: string,
  archiveId: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  const value = turn as unknown;

  if (!isRecord(value)) {
    addSourceTurnShapeIssue(turnId, archiveId, "Source turn must be an object.", addIssue);
    return;
  }

  auditSourceTurnRequiredStringField(value.id, turnId, archiveId, "id", MAX_METADATA_ID_LENGTH, addIssue);
  auditSourceTurnRequiredStringField(value.archiveId, turnId, archiveId, "archiveId", MAX_METADATA_ID_LENGTH, addIssue);
  auditSourceTurnOptionalStringField(
    value.providerTurnId,
    turnId,
    archiveId,
    "providerTurnId",
    MAX_METADATA_ID_LENGTH,
    addIssue
  );
  auditSourceTurnSupportedStringField(value.role, turnId, archiveId, "role", SOURCE_ROLES, addIssue);
  auditSourceTurnRequiredStringField(value.text, turnId, archiveId, "text", MAX_SOURCE_TURN_TEXT_LENGTH, addIssue);
  auditSourceTurnOptionalIsoDateField(value.createdAt, turnId, archiveId, "createdAt", addIssue);

  if (!isNonNegativeInteger(value.orderIndex)) {
    addSourceTurnShapeIssue(turnId, archiveId, "Source turn orderIndex must be a non-negative integer.", addIssue);
  }

  auditSourceTurnRequiredStringField(value.contentHash, turnId, archiveId, "contentHash", MAX_CONTENT_HASH_LENGTH, addIssue);
  auditSourceTurnOptionalStringField(
    value.sourceSelector,
    turnId,
    archiveId,
    "sourceSelector",
    MAX_SOURCE_SELECTOR_LENGTH,
    addIssue
  );
}

function auditSourceTurnRequiredStringField(
  value: unknown,
  turnId: string,
  archiveId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be a non-empty string.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditSourceTurnOptionalStringField(
  value: unknown,
  turnId: string,
  archiveId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be a string when present.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditSourceTurnSupportedStringField(
  value: unknown,
  turnId: string,
  archiveId: string,
  fieldName: string,
  supportedValues: Set<string>,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || !supportedValues.has(value)) {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be supported.`, addIssue);
  }
}

function auditSourceTurnOptionalIsoDateField(
  value: unknown,
  turnId: string,
  archiveId: string,
  fieldName: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (value !== undefined && !isIsoDateString(value)) {
    addSourceTurnShapeIssue(turnId, archiveId, `Source turn ${fieldName} must be an ISO date string when present.`, addIssue);
  }
}

function addSourceTurnShapeIssue(
  turnId: string,
  archiveId: string,
  message: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  addIssue(integrityIssue("malformed_source_turn", message, { archiveId, turnId }));
}

function auditMemoryCardShape(
  card: MemoryCard,
  memoryCardId: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  const value = card as unknown;

  if (!isRecord(value)) {
    addMemoryCardShapeIssue(memoryCardId, "Memory card must be an object.", addIssue);
    return;
  }

  auditRequiredStringField(value.id, memoryCardId, "id", MAX_METADATA_ID_LENGTH, addIssue);
  auditSupportedStringField(value.type, memoryCardId, "type", MEMORY_CARD_TYPES, addIssue);
  auditRequiredStringField(value.title, memoryCardId, "title", MAX_MEMORY_CARD_TITLE_LENGTH, addIssue);
  auditRequiredStringField(value.body, memoryCardId, "body", MAX_MEMORY_CARD_BODY_LENGTH, addIssue);
  auditSupportedStringField(value.status, memoryCardId, "status", MEMORY_CARD_STATUSES, addIssue);
  auditSupportedStringField(value.scope, memoryCardId, "scope", MEMORY_SCOPES, addIssue);
  auditSupportedStringField(value.sensitivity, memoryCardId, "sensitivity", SENSITIVITIES, addIssue);
  auditOptionalStringField(value.batchId, memoryCardId, "batchId", MAX_METADATA_ID_LENGTH, addIssue);
  auditOptionalStringField(value.projectId, memoryCardId, "projectId", MAX_METADATA_ID_LENGTH, addIssue);
  auditOptionalStringField(value.owner, memoryCardId, "owner", MAX_MEMORY_CARD_OWNER_LENGTH, addIssue);
  auditOptionalIsoDateField(value.acceptedAt, memoryCardId, "acceptedAt", addIssue);
  auditOptionalIsoDateField(value.dueAt, memoryCardId, "dueAt", addIssue);
  auditRequiredIsoDateField(value.createdAt, memoryCardId, "createdAt", addIssue);
  auditRequiredIsoDateField(value.updatedAt, memoryCardId, "updatedAt", addIssue);

  if (value.confidence !== undefined && (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    addMemoryCardShapeIssue(memoryCardId, "Memory card confidence must be a number between 0 and 1.", addIssue);
  }

  auditMemoryCardTags(value.tags, memoryCardId, addIssue);

  if (Array.isArray(value.sourceAnchors) && value.sourceAnchors.length > MAX_SOURCE_ANCHORS_PER_MEMORY_CARD) {
    addMemoryCardShapeIssue(
      memoryCardId,
      `Memory card sourceAnchors must contain ${MAX_SOURCE_ANCHORS_PER_MEMORY_CARD} anchors or fewer.`,
      addIssue
    );
  }
}

function auditRequiredStringField(
  value: unknown,
  memoryCardId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be a non-empty string.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditOptionalStringField(
  value: unknown,
  memoryCardId: string,
  fieldName: string,
  maxLength: number,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be a string when present.`, addIssue);
    return;
  }

  if (value.length > maxLength) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be ${maxLength} characters or fewer.`, addIssue);
  }
}

function auditSupportedStringField(
  value: unknown,
  memoryCardId: string,
  fieldName: string,
  supportedValues: Set<string>,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (typeof value !== "string" || !supportedValues.has(value)) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be supported.`, addIssue);
  }
}

function auditRequiredIsoDateField(
  value: unknown,
  memoryCardId: string,
  fieldName: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (!isIsoDateString(value)) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be an ISO date string.`, addIssue);
  }
}

function auditOptionalIsoDateField(
  value: unknown,
  memoryCardId: string,
  fieldName: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (value !== undefined && !isIsoDateString(value)) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card ${fieldName} must be an ISO date string when present.`, addIssue);
  }
}

function auditMemoryCardTags(
  tags: unknown,
  memoryCardId: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  if (!Array.isArray(tags)) {
    addMemoryCardShapeIssue(memoryCardId, "Memory card tags must be an array.", addIssue);
    return;
  }

  if (tags.length > MAX_MEMORY_CARD_TAG_COUNT) {
    addMemoryCardShapeIssue(memoryCardId, `Memory card tags must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`, addIssue);
  }

  for (const tag of tags.slice(0, MAX_MEMORY_CARD_TAG_COUNT)) {
    if (typeof tag !== "string" || tag.trim().length === 0) {
      addMemoryCardShapeIssue(memoryCardId, "Memory card tags must be non-empty strings.", addIssue);
      continue;
    }

    if (tag.length > MAX_MEMORY_CARD_TAG_LENGTH || tag.trim().replace(/^#+/, "").trim().length > MAX_MEMORY_CARD_TAG_LENGTH) {
      addMemoryCardShapeIssue(memoryCardId, `Memory card tags must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`, addIssue);
    }
  }
}

function addMemoryCardShapeIssue(
  memoryCardId: string,
  message: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  addIssue(integrityIssue("malformed_memory_card", message, { memoryCardId }));
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function auditSourceAnchorEvidence(
  memoryCardId: string,
  anchor: MemoryCard["sourceAnchors"][number],
  turn: SourceTurn,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  const rawAnchor = anchor as unknown as Record<string, unknown>;
  let hasMalformedOptionalField = false;

  if (rawAnchor.charStart !== undefined && !isNonNegativeInteger(rawAnchor.charStart)) {
    addSourceAnchorShapeIssue(memoryCardId, anchor, "Source anchor charStart must be a non-negative integer.", addIssue);
    hasMalformedOptionalField = true;
  }

  if (rawAnchor.charEnd !== undefined && !isNonNegativeInteger(rawAnchor.charEnd)) {
    addSourceAnchorShapeIssue(memoryCardId, anchor, "Source anchor charEnd must be a non-negative integer.", addIssue);
    hasMalformedOptionalField = true;
  }

  if (rawAnchor.quote !== undefined) {
    if (typeof rawAnchor.quote !== "string") {
      addSourceAnchorShapeIssue(memoryCardId, anchor, "Source anchor quote must be a string when present.", addIssue);
      hasMalformedOptionalField = true;
    } else if (rawAnchor.quote.length === 0) {
      addSourceAnchorShapeIssue(memoryCardId, anchor, "Source anchor quote must be non-empty when present.", addIssue);
      hasMalformedOptionalField = true;
    } else if (rawAnchor.quote.length > MAX_SOURCE_ANCHOR_QUOTE_LENGTH) {
      addSourceAnchorShapeIssue(
        memoryCardId,
        anchor,
        `Source anchor quote must be ${MAX_SOURCE_ANCHOR_QUOTE_LENGTH} characters or fewer.`,
        addIssue
      );
      hasMalformedOptionalField = true;
    }
  }

  if (hasMalformedOptionalField) {
    return;
  }

  const hasStart = rawAnchor.charStart !== undefined;
  const hasEnd = rawAnchor.charEnd !== undefined;

  if (hasStart !== hasEnd) {
    addIssue(
      integrityIssue("source_anchor_invalid_span", "Source anchor charStart and charEnd must be provided together.", {
        archiveId: anchor.archiveId,
        turnId: anchor.turnId,
        memoryCardId,
        sourceAnchorId: anchor.id
      })
    );
    return;
  }

  if (hasStart && hasEnd) {
    const start = rawAnchor.charStart as number;
    const end = rawAnchor.charEnd as number;

    if (end <= start || end > turn.text.length) {
      addIssue(
        integrityIssue("source_anchor_invalid_span", "Source anchor character span is outside the referenced source turn.", {
          archiveId: anchor.archiveId,
          turnId: anchor.turnId,
          memoryCardId,
          sourceAnchorId: anchor.id
        })
      );
      return;
    }

    if (typeof rawAnchor.quote === "string" && turn.text.slice(start, end) !== rawAnchor.quote) {
      addIssue(
        integrityIssue("source_anchor_quote_mismatch", "Source anchor quote does not match the referenced character span.", {
          archiveId: anchor.archiveId,
          turnId: anchor.turnId,
          memoryCardId,
          sourceAnchorId: anchor.id
        })
      );
    }

    return;
  }

  if (typeof rawAnchor.quote === "string" && !turn.text.includes(rawAnchor.quote)) {
    addIssue(
      integrityIssue("source_anchor_quote_missing", "Source anchor quote does not exist in the referenced source turn.", {
        archiveId: anchor.archiveId,
        turnId: anchor.turnId,
        memoryCardId,
        sourceAnchorId: anchor.id
      })
    );
  }
}

function addSourceAnchorShapeIssue(
  memoryCardId: string,
  anchor: Pick<MemoryCard["sourceAnchors"][number], "archiveId" | "turnId" | "id">,
  message: string,
  addIssue: (issue: VaultIntegrityIssue) => void
): void {
  addIssue(
    integrityIssue("malformed_source_anchor", message, {
      archiveId: anchor.archiveId,
      turnId: anchor.turnId,
      memoryCardId,
      sourceAnchorId: anchor.id
    })
  );
}

function sourceTurnHasValidArchiveId(turn: SourceTurn): boolean {
  return isBoundedNonEmptyString((turn as unknown as Record<string, unknown>).archiveId, MAX_METADATA_ID_LENGTH);
}

function sourceTurnHasValidText(turn: SourceTurn): boolean {
  return isBoundedNonEmptyString((turn as unknown as Record<string, unknown>).text, MAX_SOURCE_TURN_TEXT_LENGTH);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function countTurnsByArchive(turns: SourceTurn[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const turn of turns) {
    const rawTurn = turn as unknown;

    if (isRecord(rawTurn) && isBoundedNonEmptyString(rawTurn.archiveId, MAX_METADATA_ID_LENGTH)) {
      counts.set(rawTurn.archiveId, (counts.get(rawTurn.archiveId) ?? 0) + 1);
    }
  }

  return counts;
}

function integrityIssue(
  code: VaultIntegrityIssueCode,
  message: string,
  metadata: IntegrityIssueMetadata
): VaultIntegrityIssue {
  return {
    code,
    message,
    ...(metadata.archiveId ? { archiveId: formatIntegrityIdentifier(metadata.archiveId) } : {}),
    ...(metadata.turnId ? { turnId: formatIntegrityIdentifier(metadata.turnId) } : {}),
    ...(metadata.memoryCardId ? { memoryCardId: formatIntegrityIdentifier(metadata.memoryCardId) } : {}),
    ...(metadata.sourceAnchorId ? { sourceAnchorId: formatIntegrityIdentifier(metadata.sourceAnchorId) } : {})
  };
}

function formatIntegrityIdentifier(value: string): string {
  return value.length > MAX_INTEGRITY_IDENTIFIER_LENGTH
    ? `${value.slice(0, MAX_INTEGRITY_IDENTIFIER_LENGTH - 3)}...`
    : value;
}

export async function exportVault(): Promise<VaultExport> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns, STORES.cards], "readonly");
  const archiveRequest = transaction.objectStore(STORES.archives).getAll() as IDBRequest<SourceArchive[]>;
  const turnRequest = transaction.objectStore(STORES.turns).getAll() as IDBRequest<SourceTurn[]>;
  const cardRequest = transaction.objectStore(STORES.cards).getAll() as IDBRequest<MemoryCard[]>;
  const [archives, turns, memoryCards] = await Promise.all([
    requestToPromise(archiveRequest),
    requestToPromise(turnRequest),
    requestToPromise(cardRequest)
  ]);

  await transactionDone(transaction);

  const turnsByArchive = groupTurnsByArchiveId(turns);
  const archiveExports = archives
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .map((archive) => ({
      archive,
      turns: (turnsByArchive.get(archive.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex)
    }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    archives: archiveExports,
    memoryCards: memoryCards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  };
}

function groupTurnsByArchiveId(turns: SourceTurn[]): Map<string, SourceTurn[]> {
  const groups = new Map<string, SourceTurn[]>();

  for (const turn of turns) {
    groups.set(turn.archiveId, [...(groups.get(turn.archiveId) ?? []), turn]);
  }

  return groups;
}

export async function importVault(vault: VaultExport): Promise<ImportVaultResult> {
  const db = await openDatabase();
  const transaction = db.transaction([STORES.archives, STORES.turns, STORES.cards], "readwrite");
  const archiveStore = transaction.objectStore(STORES.archives);
  const turnStore = transaction.objectStore(STORES.turns);
  const cardStore = transaction.objectStore(STORES.cards);
  let turnCount = 0;

  try {
    for (const archiveWithTurns of vault.archives) {
      archiveStore.add(archiveWithTurns.archive);

      for (const turn of archiveWithTurns.turns) {
        turnStore.add(turn);
        turnCount += 1;
      }
    }

    for (const card of vault.memoryCards) {
      cardStore.add(card);
    }

    await transactionDone(transaction);
  } catch (error) {
    throw new Error(`Import would overwrite existing ContextVault data (${formatIndexedDbError(error)}).`);
  }

  return {
    archiveCount: vault.archives.length,
    turnCount,
    memoryCardCount: vault.memoryCards.length
  };
}

function formatIndexedDbError(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "IndexedDB transaction failed";
}
