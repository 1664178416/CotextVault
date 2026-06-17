import type {
  ArchiveWithTurns,
  CaptureMethod,
  CaptureWarning,
  ConversationCapture,
  MemoryCard,
  MemoryScope,
  MemoryCardStatus,
  MemoryCardType,
  ProviderId,
  Sensitivity,
  SourceAnchor,
  SourceArchive,
  SourceRole,
  SourceTurn,
  VaultExport
} from "./types";
import type { ContentRequest, MainWorldNetworkMessage, RuntimeRequest } from "./messages";
import {
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
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  MAX_SOURCE_SELECTOR_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_URL_LENGTH,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  MAX_VAULT_IMPORT_ARCHIVE_COUNT,
  MAX_VAULT_IMPORT_MEMORY_CARD_COUNT,
  MAX_VAULT_IMPORT_SOURCE_TURN_COUNT
} from "./limits";
import { classifySensitivity, redactProtectedText } from "./privacy";
import { isLikelyCapturableNetworkResponse } from "./network-capture";
import { isSupportedProvider } from "./provider";
import { normalizeTag } from "./tags";

export interface VaultValidationIssue {
  path: string;
  message: string;
}

export type VaultValidationResult =
  | {
      ok: true;
      value: VaultExport;
    }
  | {
      ok: false;
      issues: VaultValidationIssue[];
    };

export type ConversationCaptureValidationResult =
  | {
      ok: true;
      value: ConversationCapture;
    }
  | {
      ok: false;
      issues: VaultValidationIssue[];
    };

export interface FormatValidationIssuesOptions {
  limit?: number;
  maxMessageLength?: number;
  redactSensitive?: boolean;
}

const DEFAULT_FORMAT_VALIDATION_ISSUE_LIMIT = 5;
const DEFAULT_FORMAT_VALIDATION_ISSUE_MESSAGE_LENGTH = 240;

export function formatValidationIssues(
  issues: VaultValidationIssue[],
  optionsOrLimit: FormatValidationIssuesOptions | number = {}
): string {
  const options = typeof optionsOrLimit === "number" ? { limit: optionsOrLimit } : optionsOrLimit;
  const limit = options.limit ?? DEFAULT_FORMAT_VALIDATION_ISSUE_LIMIT;
  const visibleIssues = issues
    .slice(0, limit)
    .map((issue) => `${issue.path}: ${formatValidationIssueMessage(issue.message, options)}`);
  const remainingCount = issues.length - visibleIssues.length;
  const suffix = remainingCount > 0 ? `; +${remainingCount} more` : "";

  return `${visibleIssues.join("; ")}${suffix}`;
}

export function formatValidationIssueMessage(
  message: string,
  options: Pick<FormatValidationIssuesOptions, "maxMessageLength" | "redactSensitive"> = {}
): string {
  const redactSensitive = options.redactSensitive ?? true;
  const maxMessageLength = options.maxMessageLength ?? DEFAULT_FORMAT_VALIDATION_ISSUE_MESSAGE_LENGTH;
  const sensitivity = redactSensitive ? classifySensitivity(message) : "normal";
  const formatted = sensitivity === "normal" ? message : redactProtectedText(message, sensitivity);

  return formatted.length > maxMessageLength ? `${formatted.slice(0, Math.max(0, maxMessageLength - 3)).trim()}...` : formatted;
}

const MEMORY_CARD_STATUSES = new Set<MemoryCardStatus>([
  "proposed",
  "accepted",
  "rejected",
  "archived",
  "superseded"
]);

const MEMORY_CARD_TYPES = new Set<MemoryCardType>([
  "project_fact",
  "decision",
  "todo",
  "preference",
  "method",
  "citation_anchor"
]);

const PROVIDERS = new Set<ProviderId>(["chatgpt", "gemini", "claude", "generic", "unknown"]);
const CAPTURE_METHODS = new Set<CaptureMethod>([
  "official_export",
  "main_world_network",
  "devtools_network",
  "dom",
  "clipboard"
]);
const SOURCE_ROLES = new Set<SourceRole>(["user", "assistant", "system", "tool", "unknown"]);
const MEMORY_SCOPES = new Set<MemoryScope>(["global", "project", "conversation"]);
const SENSITIVITIES = new Set<Sensitivity>(["normal", "sensitive", "secret"]);
const NETWORK_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MAX_MAIN_WORLD_NETWORK_URL_LENGTH = MAX_URL_LENGTH;
const MAX_MAIN_WORLD_NETWORK_CONTENT_TYPE_LENGTH = 200;

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateVaultExport(value: unknown): VaultValidationResult {
  const issues: VaultValidationIssue[] = [];

  if (!isRecord(value)) {
    addIssue(issues, "$", "must be an object");
    return { ok: false, issues };
  }

  if (value.schemaVersion !== 1) {
    addIssue(issues, "$.schemaVersion", "must be 1");
  }

  if (!isIsoDateString(value.exportedAt)) {
    addIssue(issues, "$.exportedAt", "must be an ISO date string");
  }

  if (!Array.isArray(value.archives)) {
    addIssue(issues, "$.archives", "must be an array");
  } else {
    if (value.archives.length > MAX_VAULT_IMPORT_ARCHIVE_COUNT) {
      addIssue(issues, "$.archives", `must contain ${MAX_VAULT_IMPORT_ARCHIVE_COUNT} archives or fewer`);
    }

    let totalSourceTurnCount = 0;

    for (const [index, archiveWithTurns] of value.archives.slice(0, MAX_VAULT_IMPORT_ARCHIVE_COUNT).entries()) {
      totalSourceTurnCount += countArrayItemsIfPresent(archiveWithTurns, "turns");

      if (totalSourceTurnCount > MAX_VAULT_IMPORT_SOURCE_TURN_COUNT) {
        addIssue(issues, "$.archives", `must contain ${MAX_VAULT_IMPORT_SOURCE_TURN_COUNT} source turns or fewer`);
        break;
      }

      validateArchiveWithTurns(archiveWithTurns, `$.archives[${index}]`, issues);
    }
  }

  if (!Array.isArray(value.memoryCards)) {
    addIssue(issues, "$.memoryCards", "must be an array");
  } else {
    if (value.memoryCards.length > MAX_VAULT_IMPORT_MEMORY_CARD_COUNT) {
      addIssue(issues, "$.memoryCards", `must contain ${MAX_VAULT_IMPORT_MEMORY_CARD_COUNT} memory cards or fewer`);
    }

    value.memoryCards.slice(0, MAX_VAULT_IMPORT_MEMORY_CARD_COUNT).forEach((card, index) => {
      validateMemoryCard(card, `$.memoryCards[${index}]`, issues);
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const vault: VaultExport = {
    schemaVersion: 1,
    exportedAt: value.exportedAt as string,
    archives: value.archives as ArchiveWithTurns[],
    memoryCards: value.memoryCards as MemoryCard[]
  };

  validateSourceReferences(vault, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: vault };
}

export function isVaultExport(value: unknown): value is VaultExport {
  return validateVaultExport(value).ok;
}

export function validateConversationCapture(value: unknown): ConversationCaptureValidationResult {
  const issues: VaultValidationIssue[] = [];

  if (!isRecord(value)) {
    addIssue(issues, "$", "must be an object");
    return { ok: false, issues };
  }

  if (!isProviderId(value.provider)) {
    addIssue(issues, "$.provider", "must be a supported provider");
  }

  validateOptionalString(value.providerConversationId, "$.providerConversationId", issues, MAX_METADATA_ID_LENGTH);
  validateOptionalString(value.title, "$.title", issues, MAX_SOURCE_TITLE_LENGTH);
  validateNonEmptyString(value.url, "$.url", issues, MAX_URL_LENGTH);

  if (!isIsoDateString(value.capturedAt)) {
    addIssue(issues, "$.capturedAt", "must be an ISO date string");
  }

  if (typeof value.captureMethod !== "string" || !CAPTURE_METHODS.has(value.captureMethod as CaptureMethod)) {
    addIssue(issues, "$.captureMethod", "must be a supported capture method");
  }

  if (!Array.isArray(value.turns)) {
    addIssue(issues, "$.turns", "must be an array");
  } else {
    if (value.turns.length > MAX_SOURCE_TURNS_PER_ARCHIVE) {
      addIssue(issues, "$.turns", `must contain ${MAX_SOURCE_TURNS_PER_ARCHIVE} turns or fewer`);
    }

    value.turns
      .slice(0, MAX_SOURCE_TURNS_PER_ARCHIVE)
      .forEach((turn, index) => validateConversationTurnCapture(turn, `$.turns[${index}]`, issues));
  }

  if (!Array.isArray(value.warnings)) {
    addIssue(issues, "$.warnings", "must be an array");
  } else {
    validateCaptureWarnings(value.warnings, "$.warnings", issues);
  }

  validateOptionalString(value.contentHash, "$.contentHash", issues, MAX_CONTENT_HASH_LENGTH);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: value as unknown as ConversationCapture };
}

export function isConversationCapture(value: unknown): value is ConversationCapture {
  return validateConversationCapture(value).ok;
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "GET_ACTIVE_TAB_CONTEXT":
    case "CAPTURE_ACTIVE_CONVERSATION":
    case "LIST_ARCHIVES":
    case "EXPORT_VAULT":
    case "AUDIT_VAULT_INTEGRITY":
      return hasOnlyKeys(value, ["type"]);
    case "GET_ARCHIVE":
    case "DELETE_ARCHIVE":
      return hasOnlyKeys(value, ["type", "archiveId"]) && isBoundedNonEmptyString(value.archiveId, MAX_METADATA_ID_LENGTH);
    case "LIST_MEMORY_CARDS":
      return hasOnlyKeys(value, ["type", "status"]) && isOptionalMemoryCardStatus(value.status);
    case "EXPORT_MARKDOWN":
      return (
        hasOnlyKeys(value, ["type", "status", "redactSensitive"]) &&
        isOptionalMemoryCardStatus(value.status) &&
        isOptionalBoolean(value.redactSensitive)
      );
    case "UPDATE_MEMORY_CARD":
      return hasOnlyKeys(value, ["type", "card"]) && isMemoryCard(value.card);
    case "CREATE_MANUAL_MEMORY_CARD":
      return hasOnlyKeys(value, ["type", "input"]) && isManualMemoryCardInput(value.input);
    case "DELETE_MEMORY_CARD":
      return hasOnlyKeys(value, ["type", "cardId"]) && isBoundedNonEmptyString(value.cardId, MAX_METADATA_ID_LENGTH);
    case "IMPORT_VAULT":
      return hasOnlyKeys(value, ["type", "vault"]) && "vault" in value;
    case "IMPORT_CONVERSATION_CAPTURES":
      return hasOnlyKeys(value, ["type", "captures"]) && "captures" in value;
    case "SEARCH_MEMORY_CARDS":
      return (
        hasOnlyKeys(value, ["type", "query", "status", "memoryType", "memoryScope"]) &&
        typeof value.query === "string" &&
        value.query.length <= MAX_SEARCH_QUERY_LENGTH &&
        isOptionalMemoryCardStatus(value.status) &&
        isOptionalMemoryCardType(value.memoryType) &&
        isOptionalMemoryScope(value.memoryScope)
      );
    default:
      return false;
  }
}

export function isContentRequest(value: unknown): value is ContentRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["type", "provider"]) &&
    value.type === "CAPTURE_DOM" &&
    isProviderId(value.provider) &&
    isSupportedProvider(value.provider)
  );
}

export function isMainWorldNetworkMessage(value: unknown): value is MainWorldNetworkMessage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["source", "type", "payload"]) ||
    value.source !== "contextvault-main-world" ||
    value.type !== "NETWORK_RESPONSE"
  ) {
    return false;
  }

  const payload = value.payload;

  if (!isRecord(payload) || !hasOnlyKeys(payload, ["url", "method", "status", "contentType", "text", "capturedAt"])) {
    return false;
  }

  const { url, method, status, contentType, text, capturedAt } = payload;

  return (
    isHttpUrl(url) &&
    url.length <= MAX_MAIN_WORLD_NETWORK_URL_LENGTH &&
    isNetworkMethod(method) &&
    isHttpStatus(status) &&
    isNonEmptyString(contentType) &&
    contentType.length <= MAX_MAIN_WORLD_NETWORK_CONTENT_TYPE_LENGTH &&
    isLikelyCapturableNetworkResponse(url, contentType) &&
    typeof text === "string" &&
    text.length <= MAX_SOURCE_TURN_TEXT_LENGTH &&
    isIsoDateString(capturedAt)
  );
}

function validateArchiveWithTurns(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateSourceArchive(value.archive, `${path}.archive`, issues);

  if (!Array.isArray(value.turns)) {
    addIssue(issues, `${path}.turns`, "must be an array");
    return;
  }

  if (value.turns.length > MAX_SOURCE_TURNS_PER_ARCHIVE) {
    addIssue(issues, `${path}.turns`, `must contain ${MAX_SOURCE_TURNS_PER_ARCHIVE} turns or fewer`);
  }

  value.turns.slice(0, MAX_SOURCE_TURNS_PER_ARCHIVE).forEach((turn, index) => {
    validateSourceTurn(turn, `${path}.turns[${index}]`, issues);
  });
}

function validateSourceArchive(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateNonEmptyString(value.id, `${path}.id`, issues, MAX_METADATA_ID_LENGTH);

  if (!isProviderId(value.provider)) {
    addIssue(issues, `${path}.provider`, "must be a supported provider");
  }

  validateOptionalString(value.providerConversationId, `${path}.providerConversationId`, issues, MAX_METADATA_ID_LENGTH);
  validateOptionalString(value.title, `${path}.title`, issues, MAX_SOURCE_TITLE_LENGTH);
  validateOptionalString(value.url, `${path}.url`, issues, MAX_URL_LENGTH);

  if (typeof value.captureMethod !== "string" || !CAPTURE_METHODS.has(value.captureMethod as CaptureMethod)) {
    addIssue(issues, `${path}.captureMethod`, "must be a supported capture method");
  }

  if (!isIsoDateString(value.capturedAt)) {
    addIssue(issues, `${path}.capturedAt`, "must be an ISO date string");
  }

  validateNonEmptyString(value.contentHash, `${path}.contentHash`, issues, MAX_CONTENT_HASH_LENGTH);

  if (value.schemaVersion !== 1) {
    addIssue(issues, `${path}.schemaVersion`, "must be 1");
  }

  if (!Array.isArray(value.warnings)) {
    addIssue(issues, `${path}.warnings`, "must be an array");
    return;
  }

  validateCaptureWarnings(value.warnings, `${path}.warnings`, issues);
}

function validateSourceTurn(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateNonEmptyString(value.id, `${path}.id`, issues, MAX_METADATA_ID_LENGTH);

  validateNonEmptyString(value.archiveId, `${path}.archiveId`, issues, MAX_METADATA_ID_LENGTH);

  validateOptionalString(value.providerTurnId, `${path}.providerTurnId`, issues, MAX_METADATA_ID_LENGTH);

  if (typeof value.role !== "string" || !SOURCE_ROLES.has(value.role as SourceRole)) {
    addIssue(issues, `${path}.role`, "must be a supported source role");
  }

  if (!isNonEmptyString(value.text)) {
    addIssue(issues, `${path}.text`, "must be a non-empty string");
  } else if (value.text.length > MAX_SOURCE_TURN_TEXT_LENGTH) {
    addIssue(issues, `${path}.text`, `must be ${MAX_SOURCE_TURN_TEXT_LENGTH} characters or fewer`);
  }

  if (value.createdAt !== undefined && !isIsoDateString(value.createdAt)) {
    addIssue(issues, `${path}.createdAt`, "must be an ISO date string");
  }

  if (!isNonNegativeInteger(value.orderIndex)) {
    addIssue(issues, `${path}.orderIndex`, "must be a non-negative integer");
  }

  validateNonEmptyString(value.contentHash, `${path}.contentHash`, issues, MAX_CONTENT_HASH_LENGTH);

  validateOptionalString(value.sourceSelector, `${path}.sourceSelector`, issues, MAX_SOURCE_SELECTOR_LENGTH);
}

function validateConversationTurnCapture(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateOptionalString(value.id, `${path}.id`, issues, MAX_METADATA_ID_LENGTH);
  validateOptionalString(value.providerTurnId, `${path}.providerTurnId`, issues, MAX_METADATA_ID_LENGTH);

  if (typeof value.role !== "string" || !SOURCE_ROLES.has(value.role as SourceRole)) {
    addIssue(issues, `${path}.role`, "must be a supported source role");
  }

  if (!isNonEmptyString(value.text)) {
    addIssue(issues, `${path}.text`, "must be a non-empty string");
  } else if (value.text.length > MAX_SOURCE_TURN_TEXT_LENGTH) {
    addIssue(issues, `${path}.text`, `must be ${MAX_SOURCE_TURN_TEXT_LENGTH} characters or fewer`);
  }

  if (value.createdAt !== undefined && !isIsoDateString(value.createdAt)) {
    addIssue(issues, `${path}.createdAt`, "must be an ISO date string");
  }

  validateOptionalString(value.sourceSelector, `${path}.sourceSelector`, issues, MAX_SOURCE_SELECTOR_LENGTH);
}

function isMemoryCard(value: unknown): value is MemoryCard {
  const issues: VaultValidationIssue[] = [];

  validateMemoryCard(value, "$.card", issues);

  return issues.length === 0;
}

function validateMemoryCard(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateNonEmptyString(value.id, `${path}.id`, issues, MAX_METADATA_ID_LENGTH);

  if (typeof value.type !== "string" || !MEMORY_CARD_TYPES.has(value.type as MemoryCardType)) {
    addIssue(issues, `${path}.type`, "must be a supported memory card type");
  }

  if (!isNonEmptyString(value.title)) {
    addIssue(issues, `${path}.title`, "must be a non-empty string");
  } else if (value.title.length > MAX_MEMORY_CARD_TITLE_LENGTH) {
    addIssue(issues, `${path}.title`, `must be ${MAX_MEMORY_CARD_TITLE_LENGTH} characters or fewer`);
  }

  if (!isNonEmptyString(value.body)) {
    addIssue(issues, `${path}.body`, "must be a non-empty string");
  } else if (value.body.length > MAX_MEMORY_CARD_BODY_LENGTH) {
    addIssue(issues, `${path}.body`, `must be ${MAX_MEMORY_CARD_BODY_LENGTH} characters or fewer`);
  }

  if (typeof value.status !== "string" || !MEMORY_CARD_STATUSES.has(value.status as MemoryCardStatus)) {
    addIssue(issues, `${path}.status`, "must be a supported memory card status");
  }

  if (typeof value.scope !== "string" || !MEMORY_SCOPES.has(value.scope as MemoryScope)) {
    addIssue(issues, `${path}.scope`, "must be a supported memory scope");
  }

  if (typeof value.sensitivity !== "string" || !SENSITIVITIES.has(value.sensitivity as Sensitivity)) {
    addIssue(issues, `${path}.sensitivity`, "must be a supported sensitivity");
  }

  validateOptionalString(value.batchId, `${path}.batchId`, issues, MAX_METADATA_ID_LENGTH);
  validateOptionalString(value.projectId, `${path}.projectId`, issues, MAX_METADATA_ID_LENGTH);
  validateOptionalString(value.owner, `${path}.owner`, issues, MAX_MEMORY_CARD_OWNER_LENGTH);

  if (!isOptionalNumberInRange(value.confidence, 0, 1)) {
    addIssue(issues, `${path}.confidence`, "must be a number between 0 and 1");
  }

  if (value.dueAt !== undefined && !isIsoDateString(value.dueAt)) {
    addIssue(issues, `${path}.dueAt`, "must be an ISO date string");
  }

  if (value.acceptedAt !== undefined && !isIsoDateString(value.acceptedAt)) {
    addIssue(issues, `${path}.acceptedAt`, "must be an ISO date string");
  }

  if (!isIsoDateString(value.createdAt)) {
    addIssue(issues, `${path}.createdAt`, "must be an ISO date string");
  }

  if (!isIsoDateString(value.updatedAt)) {
    addIssue(issues, `${path}.updatedAt`, "must be an ISO date string");
  }

  if (!Array.isArray(value.tags)) {
    addIssue(issues, `${path}.tags`, "must be an array");
  } else {
    if (value.tags.length > MAX_MEMORY_CARD_TAG_COUNT) {
      addIssue(issues, `${path}.tags`, `must contain ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer`);
    }

    const tagsToValidate = value.tags.slice(0, MAX_MEMORY_CARD_TAG_COUNT);

    tagsToValidate.forEach((tag, index) => {
      if (!isNonEmptyString(tag)) {
        addIssue(issues, `${path}.tags[${index}]`, "must be a non-empty string");
        return;
      }

      const normalizedTag = normalizeTag(tag);

      if (!normalizedTag) {
        addIssue(issues, `${path}.tags[${index}]`, "must contain a tag value after removing leading # markers");
      } else if (tag.length > MAX_MEMORY_CARD_TAG_LENGTH || normalizedTag.length > MAX_MEMORY_CARD_TAG_LENGTH) {
        addIssue(issues, `${path}.tags[${index}]`, `must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer`);
      }
    });

    if (
      value.tags.length <= MAX_MEMORY_CARD_TAG_COUNT &&
      tagsToValidate.every((tag) =>
        isNonEmptyString(tag) &&
        Boolean(normalizeTag(tag)) &&
        tag.length <= MAX_MEMORY_CARD_TAG_LENGTH &&
        normalizeTag(tag).length <= MAX_MEMORY_CARD_TAG_LENGTH
      ) &&
      new Set(tagsToValidate.map((tag) => normalizeTag(tag).toLowerCase())).size !== tagsToValidate.length
    ) {
      addIssue(issues, `${path}.tags`, "must not contain duplicate tags");
    }
  }

  if (!Array.isArray(value.sourceAnchors)) {
    addIssue(issues, `${path}.sourceAnchors`, "must be an array");
  } else if (value.sourceAnchors.length === 0) {
    addIssue(issues, `${path}.sourceAnchors`, "must contain at least one source anchor");
  } else {
    if (value.sourceAnchors.length > MAX_SOURCE_ANCHORS_PER_MEMORY_CARD) {
      addIssue(
        issues,
        `${path}.sourceAnchors`,
        `must contain ${MAX_SOURCE_ANCHORS_PER_MEMORY_CARD} source anchors or fewer`
      );
    }

    value.sourceAnchors.slice(0, MAX_SOURCE_ANCHORS_PER_MEMORY_CARD).forEach((anchor, index) => {
      validateSourceAnchor(anchor, `${path}.sourceAnchors[${index}]`, issues);
    });
  }
}

function validateCaptureWarnings(warnings: unknown[], path: string, issues: VaultValidationIssue[]): void {
  if (warnings.length > MAX_CAPTURE_WARNING_COUNT) {
    addIssue(issues, path, `must contain ${MAX_CAPTURE_WARNING_COUNT} warnings or fewer`);
  }

  warnings.slice(0, MAX_CAPTURE_WARNING_COUNT).forEach((warning, index) => {
    validateCaptureWarning(warning, `${path}[${index}]`, issues);
  });
}

function validateCaptureWarning(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  if (!isNonEmptyString(value.code)) {
    addIssue(issues, `${path}.code`, "must be a non-empty string");
  } else if (value.code.length > MAX_CAPTURE_WARNING_CODE_LENGTH) {
    addIssue(issues, `${path}.code`, `must be ${MAX_CAPTURE_WARNING_CODE_LENGTH} characters or fewer`);
  }

  if (!isNonEmptyString(value.message)) {
    addIssue(issues, `${path}.message`, "must be a non-empty string");
  } else if (value.message.length > MAX_CAPTURE_WARNING_MESSAGE_LENGTH) {
    addIssue(issues, `${path}.message`, `must be ${MAX_CAPTURE_WARNING_MESSAGE_LENGTH} characters or fewer`);
  }
}

function validateSourceAnchor(value: unknown, path: string, issues: VaultValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }

  validateNonEmptyString(value.id, `${path}.id`, issues, MAX_METADATA_ID_LENGTH);

  validateNonEmptyString(value.archiveId, `${path}.archiveId`, issues, MAX_METADATA_ID_LENGTH);

  validateNonEmptyString(value.turnId, `${path}.turnId`, issues, MAX_METADATA_ID_LENGTH);

  if (value.charStart !== undefined && !isNonNegativeInteger(value.charStart)) {
    addIssue(issues, `${path}.charStart`, "must be a non-negative integer");
  }

  if (value.charEnd !== undefined && !isNonNegativeInteger(value.charEnd)) {
    addIssue(issues, `${path}.charEnd`, "must be a non-negative integer");
  }

  validateOptionalString(value.quote, `${path}.quote`, issues, MAX_SOURCE_ANCHOR_QUOTE_LENGTH);
}

function isOptionalMemoryCardStatus(value: unknown): value is MemoryCardStatus | undefined {
  return value === undefined || (typeof value === "string" && MEMORY_CARD_STATUSES.has(value as MemoryCardStatus));
}

function isOptionalMemoryCardType(value: unknown): value is MemoryCardType | undefined {
  return value === undefined || (typeof value === "string" && MEMORY_CARD_TYPES.has(value as MemoryCardType));
}

function isOptionalMemoryScope(value: unknown): value is MemoryScope | undefined {
  return value === undefined || (typeof value === "string" && MEMORY_SCOPES.has(value as MemoryScope));
}

function isManualMemoryCardInput(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const type = value.type;

  return (
    isNonEmptyString(value.title) &&
    value.title.length <= MAX_MEMORY_CARD_TITLE_LENGTH &&
    isNonEmptyString(value.body) &&
    value.body.length <= MAX_MEMORY_CARD_BODY_LENGTH &&
    typeof type === "string" &&
    MEMORY_CARD_TYPES.has(type as MemoryCardType) &&
    typeof value.scope === "string" &&
    MEMORY_SCOPES.has(value.scope as MemoryScope) &&
    isOptionalStringArray(value.tags) &&
    (value.owner === undefined || (isNonEmptyString(value.owner) && value.owner.length <= MAX_MEMORY_CARD_OWNER_LENGTH)) &&
    (value.dueAt === undefined || isIsoDateString(value.dueAt)) &&
    ((value.owner === undefined && value.dueAt === undefined) || type === "todo")
  );
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isNetworkMethod(value: unknown): value is string {
  return typeof value === "string" && NETWORK_METHODS.has(value);
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isOptionalStringArray(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (!Array.isArray(value) || value.length > MAX_MEMORY_CARD_TAG_COUNT) {
    return false;
  }

  return value.every((item) => {
    if (!isNonEmptyString(item)) {
      return false;
    }

    const normalizedTag = normalizeTag(item);

    return Boolean(normalizedTag) && item.length <= MAX_MEMORY_CARD_TAG_LENGTH && normalizedTag.length <= MAX_MEMORY_CARD_TAG_LENGTH;
  });
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  const allowed = new Set(allowedKeys);

  return Object.keys(value).every((key) => allowed.has(key));
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDERS.has(value as ProviderId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return isNonEmptyString(value) && value.length <= maxLength;
}

function validateOptionalString(
  value: unknown,
  path: string,
  issues: VaultValidationIssue[],
  maxLength?: number
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    addIssue(issues, path, "must be a string when present");
    return;
  }

  if (maxLength !== undefined && value.length > maxLength) {
    addIssue(issues, path, `must be ${maxLength} characters or fewer`);
  }
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: VaultValidationIssue[],
  maxLength?: number
): void {
  if (!isNonEmptyString(value)) {
    addIssue(issues, path, "must be a non-empty string");
    return;
  }

  if (maxLength !== undefined && value.length > maxLength) {
    addIssue(issues, path, `must be ${maxLength} characters or fewer`);
  }
}

function isOptionalNumberInRange(value: unknown, min: number, max: number): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateSourceReferences(vault: VaultExport, issues: VaultValidationIssue[]): void {
  const archiveIds = new Map<string, string>();
  const archiveContentHashes = new Map<string, string>();
  const turnsByArchive = new Map<string, Map<string, SourceTurn>>();
  const sourceTurnIds = new Map<string, string>();
  const memoryCardIds = new Map<string, string>();
  const sourceAnchorIds = new Map<string, string>();

  vault.archives.forEach((archiveWithTurns, archiveIndex) => {
    const archiveId = archiveWithTurns.archive.id;
    const archivePath = `$.archives[${archiveIndex}].archive`;
    const archiveContentHash = archiveWithTurns.archive.contentHash;

    validateUniqueValue(archiveIds, archiveId, `${archivePath}.id`, issues, "archive id");
    validateUniqueValue(
      archiveContentHashes,
      archiveContentHash,
      `${archivePath}.contentHash`,
      issues,
      "archive content hash"
    );

    if (!turnsByArchive.has(archiveId)) {
      turnsByArchive.set(archiveId, new Map());
    }

    const turns = turnsByArchive.get(archiveId)!;
    const orderIndexes = new Map<number, string>();

    archiveWithTurns.turns.forEach((turn, turnIndex) => {
      const turnPath = `$.archives[${archiveIndex}].turns[${turnIndex}]`;

      if (turn.archiveId !== archiveId) {
        addIssue(issues, `${turnPath}.archiveId`, `must match parent archive id "${archiveId}"`);
      }

      validateUniqueValue(sourceTurnIds, turn.id, `${turnPath}.id`, issues, "source turn id");
      validateUniqueValue(orderIndexes, turn.orderIndex, `${turnPath}.orderIndex`, issues, "turn orderIndex");
      turns.set(turn.id, turn);
    });
  });

  vault.memoryCards.forEach((card, cardIndex) => {
    const cardPath = `$.memoryCards[${cardIndex}]`;

    validateUniqueValue(memoryCardIds, card.id, `${cardPath}.id`, issues, "memory card id");

    card.sourceAnchors.forEach((anchor, anchorIndex) => {
      const anchorPath = `${cardPath}.sourceAnchors[${anchorIndex}]`;

      validateUniqueValue(sourceAnchorIds, anchor.id, `${anchorPath}.id`, issues, "source anchor id");

      if (!archiveIds.has(anchor.archiveId)) {
        addIssue(issues, `${anchorPath}.archiveId`, `references missing archive "${anchor.archiveId}"`);
        return;
      }

      const turn = turnsByArchive.get(anchor.archiveId)?.get(anchor.turnId);

      if (!turn) {
        addIssue(issues, `${anchorPath}.turnId`, `references missing source turn "${anchor.turnId}"`);
        return;
      }

      validateAnchorSpan(anchor, turn.text, anchorPath, issues);
    });
  });
}

function validateUniqueValue<T>(
  seen: Map<T, string>,
  value: T,
  path: string,
  issues: VaultValidationIssue[],
  label: string
): void {
  const firstPath = seen.get(value);

  if (firstPath) {
    addIssue(issues, path, `duplicates ${label} already used at ${firstPath}`);
    return;
  }

  seen.set(value, path);
}

function validateAnchorSpan(
  anchor: SourceAnchor,
  turnText: string,
  path: string,
  issues: VaultValidationIssue[]
): void {
  const hasStart = typeof anchor.charStart === "number";
  const hasEnd = typeof anchor.charEnd === "number";
  let spanIsValid = false;

  if (hasStart !== hasEnd) {
    addIssue(issues, path, "charStart and charEnd must be provided together");
  }

  if (hasStart && hasEnd) {
    const start = anchor.charStart!;
    const end = anchor.charEnd!;

    if (end <= start) {
      addIssue(issues, `${path}.charEnd`, "must be greater than charStart");
    } else if (end > turnText.length) {
      addIssue(issues, `${path}.charEnd`, "must be within the source turn text");
    } else {
      spanIsValid = true;
    }

    if (spanIsValid && anchor.quote !== undefined && turnText.slice(start, end) !== anchor.quote) {
      addIssue(issues, `${path}.quote`, "must match the source text at charStart/charEnd");
    }
  }

  if (anchor.quote !== undefined) {
    if (anchor.quote.length === 0) {
      addIssue(issues, `${path}.quote`, "must be non-empty when present");
    } else if (!turnText.includes(anchor.quote)) {
      addIssue(issues, `${path}.quote`, "must exist in the referenced source turn text");
    }
  }
}

function addIssue(issues: VaultValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function countArrayItemsIfPresent(value: unknown, key: string): number {
  if (!isRecord(value)) {
    return 0;
  }

  const candidate = value[key];

  return Array.isArray(candidate) ? candidate.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
