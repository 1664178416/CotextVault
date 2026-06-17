import {
  MAX_CONVERSATION_CAPTURE_IMPORT_COUNT,
  MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  classifySensitivity,
  redactProtectedText,
  truncateText,
  truncateToCodePointBoundary,
  type ConversationCapture,
  type ConversationTurnCapture,
  type Sensitivity,
  type SourceRole
} from "@contextvault/shared";
import { unzipSync, strFromU8 } from "fflate";

type ChatGptTurnReadResult = {
  turn?: ConversationTurnCapture;
  skippedPartCount: number;
  skippedRoleTurnCount: number;
  truncatedTextCount: number;
};

type ChatGptPathSelection = {
  nodes: unknown[];
  usedCurrentPath: boolean;
};

export const MAX_VAULT_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_CONVERSATION_EXPORT_JSON_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_JSON_TEXT_CHARS = MAX_VAULT_IMPORT_BYTES;
export const IMPORT_STORAGE_HEADROOM_MULTIPLIER = 1.25;

type ConversationCaptureImportOptions = {
  storageEstimate?: Pick<StorageEstimate, "usage" | "quota">;
  maxConversationExportJsonBytes?: number;
};

export function assertVaultImportFileReadable(
  file: Pick<File, "name" | "size">,
  maxBytes = MAX_VAULT_IMPORT_BYTES
): void {
  if (file.size === 0) {
    throw new Error("Import file is empty.");
  }

  if (file.size > maxBytes) {
    throw new Error(
      `Import file is too large (${formatBytes(file.size)}). Maximum supported size is ${formatBytes(maxBytes)}.`
    );
  }
}

export function assertImportFitsAvailableStorage(
  file: Pick<File, "size">,
  estimate: Pick<StorageEstimate, "usage" | "quota"> | undefined,
  headroomMultiplier = IMPORT_STORAGE_HEADROOM_MULTIPLIER
): void {
  if (!isUsableByteValue(estimate?.usage) || !isUsableByteValue(estimate?.quota)) {
    return;
  }

  const remainingBytes = estimate.quota - estimate.usage;
  const requiredBytes = Math.ceil(file.size * Math.max(1, headroomMultiplier));

  if (remainingBytes < requiredBytes) {
    throw new Error(
      `Import may exceed available browser storage. File size is ${formatBytes(file.size)}, estimated free space is ${formatBytes(remainingBytes)}. Export or delete old archives before importing.`
    );
  }
}

export function parseVaultImportText(text: string, maxChars = MAX_IMPORT_JSON_TEXT_CHARS): unknown {
  if (text.length > maxChars) {
    throw new Error(
      `Import JSON text is too large (${formatBytes(text.length)}). Maximum supported size is ${formatBytes(maxChars)}.`
    );
  }

  const normalized = text.replace(/^\uFEFF/, "").trim();

  if (normalized.length === 0) {
    throw new Error("Import file is empty.");
  }

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("Import file is not valid JSON.");
  }
}

export function parseConversationCaptureImportText(text: string, maxChars = MAX_IMPORT_JSON_TEXT_CHARS): unknown {
  const parsed = parseVaultImportText(text, maxChars);

  if (isRecord(parsed) && "captures" in parsed) {
    return parsed.captures;
  }

  const chatGptCaptures = parseChatGptConversationsExport(parsed);

  if (chatGptCaptures) {
    return chatGptCaptures;
  }

  return parsed;
}

export async function parseConversationCaptureImportFile(
  file: File,
  options: ConversationCaptureImportOptions = {}
): Promise<unknown> {
  assertVaultImportFileReadable(file);
  assertImportFitsAvailableStorage(file, options.storageEstimate);

  if (isZipFile(file)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return parseConversationCaptureImportZip(bytes, options);
  }

  return parseConversationCaptureImportText(await file.text());
}

export function parseConversationCaptureImportZip(
  bytes: Uint8Array,
  options: ConversationCaptureImportOptions = {}
): unknown {
  let files: Record<string, Uint8Array>;
  let oversizedConversationsEntryBytes: number | undefined;
  const maxConversationExportJsonBytes =
    options.maxConversationExportJsonBytes ?? MAX_CONVERSATION_EXPORT_JSON_BYTES;

  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        const isConversationsEntry = isConversationExportEntryName(file.name);

        if (isConversationsEntry && file.originalSize > maxConversationExportJsonBytes) {
          oversizedConversationsEntryBytes = file.originalSize;
          return false;
        }

        return isConversationsEntry;
      }
    });
  } catch {
    throw new Error("Import ZIP is not readable.");
  }

  const conversationsEntry = findZipEntry(files, "conversations.json");

  if (!conversationsEntry) {
    if (oversizedConversationsEntryBytes !== undefined) {
      throw new Error(
        formatConversationExportJsonTooLargeError(oversizedConversationsEntryBytes, maxConversationExportJsonBytes)
      );
    }

    throw new Error("Import ZIP does not contain conversations.json.");
  }

  assertConversationExportJsonReadable(conversationsEntry, maxConversationExportJsonBytes);
  assertImportFitsAvailableStorage({ size: conversationsEntry.byteLength }, options.storageEstimate);

  return parseConversationCaptureImportText(strFromU8(conversationsEntry));
}

export function assertConversationExportJsonReadable(
  bytes: Uint8Array,
  maxBytes = MAX_CONVERSATION_EXPORT_JSON_BYTES
): void {
  if (bytes.byteLength === 0) {
    throw new Error("Import ZIP contains an empty conversations.json.");
  }

  if (bytes.byteLength > maxBytes) {
    throw new Error(formatConversationExportJsonTooLargeError(bytes.byteLength, maxBytes));
  }
}

function formatConversationExportJsonTooLargeError(byteLength: number, maxBytes: number): string {
  return `Import ZIP conversations.json is too large (${formatBytes(byteLength)}). Maximum supported size is ${formatBytes(maxBytes)}.`;
}

export function parseChatGptConversationsExport(value: unknown): ConversationCapture[] | undefined {
  const conversations = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.conversations)
      ? value.conversations
      : undefined;

  if (!conversations || !conversations.some(isLikelyChatGptConversation)) {
    return undefined;
  }

  if (conversations.length > MAX_CONVERSATION_CAPTURE_IMPORT_COUNT) {
    throw new Error(
      `ChatGPT export contains too many conversations (${conversations.length}). Maximum supported count is ${MAX_CONVERSATION_CAPTURE_IMPORT_COUNT}.`
    );
  }

  const captures = boundChatGptCaptureTurns(
    conversations.map((conversation, index) => convertChatGptConversation(conversation, index))
  );

  assertChatGptCaptureTurnCountsReadable(captures);

  const importableCaptures = captures.filter((capture): capture is ConversationCapture => capture.turns.length > 0);
  const skippedEmptyCount = captures.length - importableCaptures.length;

  if (importableCaptures.length === 0) {
    throw new Error("ChatGPT export did not contain importable user or assistant text.");
  }

  if (skippedEmptyCount > 0) {
    return withSkippedEmptyConversationWarning(importableCaptures, skippedEmptyCount);
  }

  return importableCaptures;
}

function assertChatGptCaptureTurnCountsReadable(captures: ConversationCapture[]): void {
  let totalTurnCount = 0;

  for (const capture of captures) {
    totalTurnCount += capture.turns.length;

    if (totalTurnCount > MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT) {
      throw new Error(
        `ChatGPT export contains too many visible turns (${totalTurnCount}). Maximum supported count is ${MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT}.`
      );
    }
  }
}

function boundChatGptCaptureTurns(captures: ConversationCapture[]): ConversationCapture[] {
  return captures.map((capture) => {
    if (capture.turns.length <= MAX_SOURCE_TURNS_PER_ARCHIVE) {
      return capture;
    }

    const skippedTurnCount = capture.turns.length - MAX_SOURCE_TURNS_PER_ARCHIVE;

    return {
      ...capture,
      turns: capture.turns.slice(0, MAX_SOURCE_TURNS_PER_ARCHIVE),
      warnings: [
        ...capture.warnings,
        {
          code: "chatgpt_turn_limit_reached",
          message: `Imported the first ${MAX_SOURCE_TURNS_PER_ARCHIVE} ChatGPT export turn(s) from "${formatChatGptConversationLabel(capture)}" and skipped ${skippedTurnCount} additional turn(s).`
        }
      ]
    };
  });
}

function withSkippedEmptyConversationWarning(
  captures: ConversationCapture[],
  skippedEmptyCount: number
): ConversationCapture[] {
  const [firstCapture, ...restCaptures] = captures;

  if (!firstCapture) {
    return captures;
  }

  return [
    {
      ...firstCapture,
      warnings: [
        ...firstCapture.warnings,
        {
          code: "chatgpt_empty_conversations_skipped",
          message: `Skipped ${skippedEmptyCount} ChatGPT conversation(s) without importable user or assistant text.`
        }
      ]
    },
    ...restCaptures
  ];
}

function convertChatGptConversation(value: unknown, index: number): ConversationCapture {
  if (!isRecord(value)) {
    return emptyChatGptCapture(index, "Invalid non-object conversation entry.");
  }

  const mapping = isRecord(value.mapping) ? value.mapping : {};
  const initialPathSelection = selectChatGptConversationPath(mapping, readString(value.current_node));
  const initialReadResults = initialPathSelection.nodes.map(readChatGptMappingNode);
  const initialTurnsFromPath = initialReadResults
    .map((result) => result.turn)
    .filter((turn): turn is ConversationTurnCapture => Boolean(turn));
  const shouldFallbackFromEmptyCurrentPath =
    initialPathSelection.usedCurrentPath && initialTurnsFromPath.length === 0 && Object.keys(mapping).length > 0;
  const pathSelection: ChatGptPathSelection = shouldFallbackFromEmptyCurrentPath
    ? {
        nodes: Object.values(mapping),
        usedCurrentPath: false
      }
    : initialPathSelection;
  const readResults = shouldFallbackFromEmptyCurrentPath
    ? pathSelection.nodes.map(readChatGptMappingNode)
    : initialReadResults;
  const turnsFromPath = shouldFallbackFromEmptyCurrentPath
    ? readResults.map((result) => result.turn).filter((turn): turn is ConversationTurnCapture => Boolean(turn))
    : initialTurnsFromPath;
  const turns = pathSelection.usedCurrentPath ? turnsFromPath : turnsFromPath.sort(sortConversationTurnsByCreatedAt);
  const skippedPartCount = readResults.reduce((count, result) => count + result.skippedPartCount, 0);
  const skippedRoleTurnCount = readResults.reduce((count, result) => count + result.skippedRoleTurnCount, 0);
  const truncatedTextCount = readResults.reduce((count, result) => count + result.truncatedTextCount, 0);
  const createdAt = toIsoDate(readNumber(value.create_time)) ?? new Date().toISOString();
  const id = readString(value.id) ?? `chatgpt-export-${index + 1}`;
  const title = readString(value.title);

  return {
    provider: "chatgpt",
    providerConversationId: id,
    title,
    url: `https://chatgpt.com/c/${id}`,
    capturedAt: createdAt,
    captureMethod: "official_export",
    turns,
    warnings: [
      {
        code: "official_export_import",
        message: "Imported from a ChatGPT conversations.json export and normalized into ContextVault turns."
      },
      {
        code: pathSelection.usedCurrentPath ? "chatgpt_current_path" : "chatgpt_mapping_fallback",
        message: pathSelection.usedCurrentPath
          ? "Imported the active ChatGPT conversation branch by following current_node parent links."
          : shouldFallbackFromEmptyCurrentPath
            ? "ChatGPT current_node path contained no importable user or assistant text; imported mapping messages by timestamp."
          : "ChatGPT current_node path was unavailable; imported mapping messages by timestamp."
      },
      ...(skippedPartCount > 0
        ? [
            {
              code: "chatgpt_non_text_parts_skipped",
              message: `Skipped ${skippedPartCount} non-text ChatGPT export part(s), such as images, files, or structured payloads.`
            }
          ]
        : []),
      ...(skippedRoleTurnCount > 0
        ? [
            {
              code: "chatgpt_non_conversation_roles_skipped",
              message: `Skipped ${skippedRoleTurnCount} ChatGPT export message(s) with system, tool, or unknown roles.`
            }
          ]
        : []),
      ...(truncatedTextCount > 0
        ? [
            {
              code: "chatgpt_turn_text_truncated",
              message: `Truncated ${truncatedTextCount} ChatGPT export turn(s) to ${MAX_SOURCE_TURN_TEXT_LENGTH} characters before import.`
            }
          ]
        : [])
    ]
  };
}

function selectChatGptConversationPath(
  mapping: Record<string, unknown>,
  currentNodeId: string | undefined
): ChatGptPathSelection {
  const currentPath = currentNodeId ? readCurrentNodePath(mapping, currentNodeId) : [];

  if (currentPath.length > 0) {
    return {
      nodes: currentPath,
      usedCurrentPath: true
    };
  }

  return {
    nodes: Object.values(mapping),
    usedCurrentPath: false
  };
}

function readCurrentNodePath(mapping: Record<string, unknown>, currentNodeId: string): unknown[] {
  const path: unknown[] = [];
  const seen = new Set<string>();
  let nodeId: string | undefined = currentNodeId;

  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    const node = mapping[nodeId];

    if (!isRecord(node)) {
      break;
    }

    path.push(node);
    nodeId = readString(node.parent);
  }

  return path.reverse();
}

function sortConversationTurnsByCreatedAt(a: ConversationTurnCapture, b: ConversationTurnCapture): number {
  const aTime = Date.parse(a.createdAt ?? "");
  const bTime = Date.parse(b.createdAt ?? "");

  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }

  return 0;
}

function emptyChatGptCapture(index: number, message: string): ConversationCapture {
  return {
    provider: "chatgpt",
    providerConversationId: `chatgpt-export-${index + 1}`,
    title: `ChatGPT export ${index + 1}`,
    url: `https://chatgpt.com/c/chatgpt-export-${index + 1}`,
    capturedAt: new Date().toISOString(),
    captureMethod: "official_export",
    turns: [],
    warnings: [
      {
        code: "official_export_import",
        message
      }
    ]
  };
}

function readChatGptMappingNode(value: unknown): ChatGptTurnReadResult {
  if (!isRecord(value) || !isRecord(value.message)) {
    return { skippedPartCount: 0, skippedRoleTurnCount: 0, truncatedTextCount: 0 };
  }

  const message = value.message;
  const author = isRecord(message.author) ? message.author : undefined;
  const content = isRecord(message.content) ? message.content : undefined;
  const extracted = extractChatGptMessageText(content);
  const role = mapChatGptRole(readString(author?.role));

  if (!extracted.text) {
    return { skippedPartCount: extracted.skippedPartCount, skippedRoleTurnCount: 0, truncatedTextCount: 0 };
  }

  if (!isVisibleChatGptConversationRole(role)) {
    return { skippedPartCount: extracted.skippedPartCount, skippedRoleTurnCount: 1, truncatedTextCount: 0 };
  }

  const text = truncateChatGptTurnText(extracted.text);

  return {
    turn: {
      id: readString(value.id),
      providerTurnId: readString(message.id),
      role,
      text: text.value,
      createdAt: toIsoDate(readNumber(message.create_time)),
      sourceSelector: "chatgpt_export.mapping"
    },
    skippedPartCount: extracted.skippedPartCount,
    skippedRoleTurnCount: 0,
    truncatedTextCount: text.truncated ? 1 : 0
  };
}

function truncateChatGptTurnText(text: string): { value: string; truncated: boolean } {
  if (text.length <= MAX_SOURCE_TURN_TEXT_LENGTH) {
    return { value: text, truncated: false };
  }

  return {
    value: truncateToCodePointBoundary(text, MAX_SOURCE_TURN_TEXT_LENGTH),
    truncated: true
  };
}

function extractChatGptMessageText(content: Record<string, unknown> | undefined): {
  text?: string;
  skippedPartCount: number;
} {
  if (!content) {
    return {
      skippedPartCount: 0
    };
  }

  const parts = content.parts;
  let skippedPartCount = 0;
  const text = Array.isArray(parts)
    ? parts
        .map((part) => {
          const textPart = readChatGptTextPart(part);

          if (!textPart && part !== null && part !== undefined) {
            skippedPartCount += 1;
          }

          return textPart;
        })
        .filter((part): part is string => Boolean(part?.trim()))
        .join("\n\n")
    : readString(content.text);

  return {
    text: text?.trim() || undefined,
    skippedPartCount
  };
}

function readChatGptTextPart(part: unknown): string | undefined {
  if (typeof part === "string") {
    return part;
  }

  if (!isRecord(part) || hasNonTextPayloadPointer(part)) {
    return undefined;
  }

  const contentType = readString(part.content_type) ?? readString(part.type);
  const text = readString(part.text) ?? readString(part.content);

  if (!text) {
    return undefined;
  }

  if (contentType && !isTextLikeContentType(contentType)) {
    return undefined;
  }

  return text;
}

function hasNonTextPayloadPointer(part: Record<string, unknown>): boolean {
  return (
    "asset_pointer" in part ||
    "file_id" in part ||
    "file_name" in part ||
    "image_url" in part ||
    "image_asset_pointer" in part
  );
}

function isTextLikeContentType(contentType: string): boolean {
  return /^(text|input_text|output_text|multimodal_text)$/i.test(contentType);
}

function mapChatGptRole(role: string | undefined): SourceRole {
  switch (role) {
    case "user":
    case "assistant":
    case "system":
    case "tool":
      return role;
    default:
      return "unknown";
  }
}

function isVisibleChatGptConversationRole(role: SourceRole): boolean {
  return role === "user" || role === "assistant";
}

function isLikelyChatGptConversation(value: unknown): boolean {
  return isRecord(value) && isRecord(value.mapping);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIsoDate(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined) {
    return undefined;
  }

  const date = new Date(epochSeconds * 1000);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function formatChatGptConversationLabel(capture: ConversationCapture): string {
  const label = capture.title ?? capture.providerConversationId ?? "untitled";
  const sensitivity = classifySensitivity(label);

  return truncateText(redactLabel(label, sensitivity), 80);
}

function redactLabel(label: string, sensitivity: Sensitivity): string {
  return sensitivity === "normal" ? label : redactProtectedText(label, sensitivity);
}

function isZipFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "application/zip" || file.type === "application/x-zip-compressed" || /\.zip$/i.test(file.name);
}

function findZipEntry(files: Record<string, Uint8Array>, basename: string): Uint8Array | undefined {
  const exact = files[basename];

  if (exact) {
    return exact;
  }

  const normalizedBasename = `/${basename}`.toLowerCase();
  const entryName = Object.keys(files).find((name) => name.replace(/\\/g, "/").toLowerCase().endsWith(normalizedBasename));

  return entryName ? files[entryName] : undefined;
}

function isConversationExportEntryName(name: string): boolean {
  return name.replace(/\\/g, "/").toLowerCase().endsWith("/conversations.json") || name.toLowerCase() === "conversations.json";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;

  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }

  return `${(kib / 1024).toFixed(1)} MiB`;
}

function isUsableByteValue(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
