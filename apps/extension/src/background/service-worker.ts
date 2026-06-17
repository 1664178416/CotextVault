import {
  detectProviderFromUrl,
  isRuntimeRequest,
  isSupportedProvider,
  type ApiResponse,
  type BrowserTabContext,
  type CaptureResult,
  type ContentRequest,
  type ContentResponseMap,
  type RuntimeRequest,
  type RuntimeResponseMap
} from "@contextvault/shared";
import { assertValidCapturedConversation } from "./capture-guard";
import { formatTabMessageError, sanitizeRuntimeErrorMessage } from "../runtime-errors";
import {
  auditVaultIntegrity,
  deleteArchiveCascade,
  deleteMemoryCard,
  exportVault,
  findArchiveByContentHash,
  getArchiveWithTurns,
  getMemoryCard,
  importVault,
  listArchives,
  listMemoryCards,
  saveArchiveWithTurns,
  saveArchiveWithTurnsAndCards,
  saveMemoryCards,
  updateMemoryCard
} from "../storage/db";
import { createVaultService, type VaultRepository } from "../vault/vault-service";

const repository: VaultRepository = {
  saveArchiveWithTurns,
  saveArchiveWithTurnsAndCards,
  saveMemoryCards,
  findArchiveByContentHash,
  listArchives,
  getArchiveWithTurns,
  getMemoryCard,
  listMemoryCards,
  updateMemoryCard,
  deleteMemoryCard,
  deleteArchiveCascade,
  auditVaultIntegrity,
  exportVault,
  importVault
};
const vault = createVaultService(repository);

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
  if (!isRuntimeRequest(request)) {
    sendResponse({ ok: false, error: "Invalid ContextVault runtime request." });
    return false;
  }

  handleRuntimeRequest(request)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : undefined;
      sendResponse({ ok: false, error: sanitizeRuntimeErrorMessage(message) });
    });

  return true;
});

async function handleRuntimeRequest<T extends RuntimeRequest>(
  request: T
): Promise<RuntimeResponseMap[T["type"]]> {
  switch (request.type) {
    case "GET_ACTIVE_TAB_CONTEXT":
      return getActiveTabContext() as Promise<RuntimeResponseMap[T["type"]]>;
    case "CAPTURE_ACTIVE_CONVERSATION":
      return captureActiveConversation() as Promise<RuntimeResponseMap[T["type"]]>;
    case "LIST_ARCHIVES":
      return vault.listArchives() as Promise<RuntimeResponseMap[T["type"]]>;
    case "GET_ARCHIVE":
      return vault.getArchiveWithTurns(request.archiveId) as Promise<RuntimeResponseMap[T["type"]]>;
    case "LIST_MEMORY_CARDS":
      return vault.listMemoryCards(request.status) as Promise<RuntimeResponseMap[T["type"]]>;
    case "UPDATE_MEMORY_CARD":
      return vault.updateMemoryCard(request.card) as Promise<RuntimeResponseMap[T["type"]]>;
    case "CREATE_MANUAL_MEMORY_CARD":
      return vault.createManualMemoryCard(request.input) as Promise<RuntimeResponseMap[T["type"]]>;
    case "DELETE_MEMORY_CARD":
      return vault.deleteMemoryCard(request.cardId) as Promise<RuntimeResponseMap[T["type"]]>;
    case "DELETE_ARCHIVE":
      return vault.deleteArchiveCascade(request.archiveId) as Promise<RuntimeResponseMap[T["type"]]>;
    case "AUDIT_VAULT_INTEGRITY":
      return vault.auditVaultIntegrity() as Promise<RuntimeResponseMap[T["type"]]>;
    case "EXPORT_VAULT":
      return vault.exportVault() as Promise<RuntimeResponseMap[T["type"]]>;
    case "EXPORT_MARKDOWN":
      return vault.exportMarkdown(request.status, { redactSensitive: request.redactSensitive }) as Promise<
        RuntimeResponseMap[T["type"]]
      >;
    case "IMPORT_VAULT":
      return vault.importVault(request.vault) as Promise<RuntimeResponseMap[T["type"]]>;
    case "IMPORT_CONVERSATION_CAPTURES":
      return vault.importConversationCaptures(request.captures) as Promise<RuntimeResponseMap[T["type"]]>;
    case "SEARCH_MEMORY_CARDS":
      return vault.searchMemoryCards(request.query, request.status, request.memoryType, request.memoryScope) as Promise<
        RuntimeResponseMap[T["type"]]
      >;
    default:
      throw new Error("Unsupported request");
  }
}

async function getActiveTabContext(): Promise<BrowserTabContext> {
  const tab = await getActiveTab();
  const provider = detectProviderFromUrl(tab.url);

  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    provider,
    supported: isSupportedProvider(provider)
  };
}

async function captureActiveConversation(): Promise<CaptureResult> {
  const tab = await getActiveTab();

  if (!tab.id || !tab.url) {
    throw new Error("No active AI conversation tab found.");
  }

  const provider = detectProviderFromUrl(tab.url);

  if (!isSupportedProvider(provider)) {
    throw new Error("Current tab is not a supported AI provider.");
  }

  const capture = await sendTabMessage<"CAPTURE_DOM">(tab.id, {
    type: "CAPTURE_DOM",
    provider
  });
  const validatedCapture = assertValidCapturedConversation(capture, provider);

  return vault.captureConversation(validatedCapture, { tabTitle: tab.title });
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    throw new Error("No active tab found.");
  }

  return tab;
}

function sendTabMessage<T extends keyof ContentResponseMap>(
  tabId: number,
  message: ContentRequest & { type: T }
): Promise<ContentResponseMap[T]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: ApiResponse<ContentResponseMap[T]> | undefined) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(formatTabMessageError(error.message)));
        return;
      }

      if (!response) {
        reject(new Error("No response from content script."));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }

      resolve(response.data);
    });
  });
}
