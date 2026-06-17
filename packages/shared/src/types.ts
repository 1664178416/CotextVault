export type ProviderId = "chatgpt" | "gemini" | "claude" | "generic" | "unknown";

export type CaptureMethod =
  | "official_export"
  | "main_world_network"
  | "devtools_network"
  | "dom"
  | "clipboard";

export type SourceRole = "user" | "assistant" | "system" | "tool" | "unknown";

export type MemoryCardType =
  | "project_fact"
  | "decision"
  | "todo"
  | "preference"
  | "method"
  | "citation_anchor";

export type MemoryCardStatus = "proposed" | "accepted" | "rejected" | "archived" | "superseded";

export type MemoryScope = "global" | "project" | "conversation";

export type Sensitivity = "normal" | "sensitive" | "secret";

export interface BrowserTabContext {
  tabId?: number;
  title?: string;
  url?: string;
  provider: ProviderId;
  supported: boolean;
}

export interface CaptureWarning {
  code: string;
  message: string;
}

export interface CaptureWarningCount {
  code: string;
  count: number;
  message?: string;
}

export interface SourceArchive {
  id: string;
  provider: ProviderId;
  providerConversationId?: string;
  title?: string;
  url?: string;
  captureMethod: CaptureMethod;
  capturedAt: string;
  contentHash: string;
  schemaVersion: number;
  warnings: CaptureWarning[];
}

export interface SourceAnchor {
  id: string;
  archiveId: string;
  turnId: string;
  charStart?: number;
  charEnd?: number;
  quote?: string;
}

export interface SourceTurn {
  id: string;
  archiveId: string;
  providerTurnId?: string;
  role: SourceRole;
  text: string;
  createdAt?: string;
  orderIndex: number;
  contentHash: string;
  sourceSelector?: string;
}

export interface ConversationTurnCapture {
  id?: string;
  providerTurnId?: string;
  role: SourceRole;
  text: string;
  createdAt?: string;
  sourceSelector?: string;
}

export interface ConversationCapture {
  provider: ProviderId;
  providerConversationId?: string;
  title?: string;
  url: string;
  capturedAt: string;
  captureMethod: CaptureMethod;
  turns: ConversationTurnCapture[];
  warnings: CaptureWarning[];
  contentHash?: string;
}

export interface MemoryCard {
  id: string;
  batchId?: string;
  projectId?: string;
  type: MemoryCardType;
  title: string;
  body: string;
  status: MemoryCardStatus;
  scope: MemoryScope;
  sensitivity: Sensitivity;
  confidence?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  dueAt?: string;
  owner?: string;
  sourceAnchors: SourceAnchor[];
}

export interface ManualMemoryCardInput {
  title: string;
  body: string;
  type: MemoryCardType;
  scope: MemoryScope;
  tags?: string[];
  owner?: string;
  dueAt?: string;
}

export interface ArchiveWithTurns {
  archive: SourceArchive;
  turns: SourceTurn[];
}

export interface VaultExport {
  schemaVersion: number;
  exportedAt: string;
  archives: ArchiveWithTurns[];
  memoryCards: MemoryCard[];
}

export type VaultIntegrityIssueCode =
  | "malformed_source_archive"
  | "malformed_source_turn"
  | "malformed_memory_card"
  | "malformed_source_anchor"
  | "orphan_source_turn"
  | "empty_source_archive"
  | "memory_card_without_source_anchor"
  | "source_anchor_missing_archive"
  | "source_anchor_missing_turn"
  | "source_anchor_turn_archive_mismatch"
  | "source_anchor_invalid_span"
  | "source_anchor_quote_mismatch"
  | "source_anchor_quote_missing";

export interface VaultIntegrityIssue {
  code: VaultIntegrityIssueCode;
  archiveId?: string;
  turnId?: string;
  memoryCardId?: string;
  sourceAnchorId?: string;
  message: string;
}

export interface VaultIntegrityReport {
  checkedAt: string;
  archiveCount: number;
  sourceTurnCount: number;
  memoryCardCount: number;
  issueCount: number;
  omittedIssueCount: number;
  issues: VaultIntegrityIssue[];
}

export interface CaptureResult {
  archive: SourceArchive;
  turns: SourceTurn[];
  proposedCards: MemoryCard[];
  deduplicated?: boolean;
}

export interface DeleteArchiveResult {
  archiveId: string;
  deletedTurnCount: number;
  deletedMemoryCardCount: number;
  updatedMemoryCardCount: number;
}

export interface DeleteMemoryCardResult {
  cardId: string;
}

export interface ImportVaultResult {
  archiveCount: number;
  turnCount: number;
  memoryCardCount: number;
}

export interface ImportConversationCapturesResult {
  importedCount: number;
  deduplicatedCount: number;
  archiveCount: number;
  turnCount: number;
  proposedMemoryCardCount: number;
  warningCounts: CaptureWarningCount[];
}

export interface SearchResult {
  card: MemoryCard;
  score: number;
  matchedFields: string[];
  snippets: SearchSnippet[];
}

export interface SearchSnippet {
  field: "title" | "body" | "tags" | "type" | "metadata";
  text: string;
  matchedTerms: string[];
}
