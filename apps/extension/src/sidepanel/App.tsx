import {
  AlertTriangle,
  Archive,
  Check,
  Clipboard,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Inbox,
  ListFilter,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMemoryCardsPromptContext,
  formatSensitivitySummary,
  getEffectiveMemorySensitivity,
  getMemoryScopeLabel,
  getMemoryTypeLabel,
  getSafeMemoryCardForRead,
  getSafeSourceAnchors,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_TITLE_LENGTH,
  MAX_MANUAL_MEMORY_BODY_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  getProviderLabel,
  sortMemoryCardsForRecall,
  summarizeMemorySensitivity,
  type ArchiveWithTurns,
  type BrowserTabContext,
  type CaptureWarning,
  type CaptureWarningCount,
  type ManualMemoryCardInput,
  type MemoryCard,
  type MemoryCardType,
  type MemoryScope,
  type SearchResult,
  type Sensitivity,
  type SourceAnchor,
  type SourceArchive,
  type SourceTurn,
  type VaultIntegrityReport
} from "@contextvault/shared";
import { sendRuntimeMessage } from "./api";
import {
  formatArchiveDeleteConfirmation,
  formatArchiveDeleteResultMessage,
  formatArchiveTitleForDisplay,
  getArchiveReferencedCards
} from "./archive-state";
import { copyTextToClipboard } from "./clipboard-state";
import { formatDisplayError } from "./error-state";
import {
  canExportMarkdownForScope,
  formatArchiveExportDisclosureMessage,
  formatVaultExportDisclosureMessage,
  prepareVaultExportDownload,
  shouldConfirmMemoryDisclosure,
  type MarkdownExportScope
} from "./export-state";
import {
  assertImportFitsAvailableStorage,
  assertVaultImportFileReadable,
  parseConversationCaptureImportFile,
  parseVaultImportText
} from "./import-state";
import {
  formatManualMemoryCreatedMessage,
  getManualMemoryConfirmationMessage,
  type ManualMemoryCreateResult
} from "./manual-memory-state";
import { formatMemoryCardDeleteConfirmation } from "./memory-card-state";
import { getMemoryCardPreview, getSourceTurnPreview, resolveVisibleAnchorSpan } from "./memory-display";
import { formatPromptCopyBudgetConfirmation, formatPromptCopyResultMessage } from "./prompt-copy-state";
import {
  applyMemoryCardTypeDraft,
  applyReviewStatus,
  classifyMemoryCardDraftSensitivity,
  dateInputToIsoDate,
  getMemoryTagDraftStatus,
  getMemoryTagListStatus,
  getReviewConfirmationMessage,
  getTodoOwnerDraftStatus,
  isoDateToDateInput,
  parseMemoryTagInput,
  type ReviewStatus
} from "./review-state";
import {
  getClearedMemoryRecallFilters,
  getMemoryRecallEmptyState,
  getSearchQueryLimitState,
  hasActiveMemoryRecallFilter,
  normalizeMemoryRecallQueryInput,
  type MemoryScopeFilter,
  type MemoryTypeFilter
} from "./search-state";
import { pruneSelectedMemoryIds, selectVisibleMemoryIds } from "./selection-state";
import { summarizeStorageEstimate, type StorageHealth } from "./storage-state";
import {
  formatVaultIntegrityIssue,
  formatVaultIntegrityResultMessage,
  formatVaultIntegritySummary,
  getVaultIntegrityLevel
} from "./vault-integrity-state";
import { summarizeWarningsForDisplay } from "./warning-state";
import { runExclusiveAction } from "./action-state";
import "./styles.css";

type ViewKey = "capture" | "memory" | "archives";

const MEMORY_TYPES: MemoryCardType[] = [
  "project_fact",
  "decision",
  "todo",
  "preference",
  "method",
  "citation_anchor"
];
const MEMORY_SCOPES: MemoryScope[] = ["conversation", "project", "global"];
const PROMPT_COPY_MAX_LENGTH = 12000;
const PROMPT_COPY_MAX_SOURCE_ANCHORS_PER_CARD = 2;

export function App() {
  const [activeView, setActiveView] = useState<ViewKey>("capture");
  const [tabContext, setTabContext] = useState<BrowserTabContext>();
  const [archives, setArchives] = useState<SourceArchive[]>([]);
  const [allMemoryCards, setAllMemoryCards] = useState<MemoryCard[]>([]);
  const [proposedCards, setProposedCards] = useState<MemoryCard[]>([]);
  const [acceptedCards, setAcceptedCards] = useState<MemoryCard[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveWithTurns>();
  const [selectedSourceTurnId, setSelectedSourceTurnId] = useState<string>();
  const [selectedSourceAnchor, setSelectedSourceAnchor] = useState<SourceAnchor>();
  const [latestCaptureArchive, setLatestCaptureArchive] = useState<SourceArchive>();
  const [latestCaptureTurnCount, setLatestCaptureTurnCount] = useState<number>();
  const [latestCaptureCardCount, setLatestCaptureCardCount] = useState<number>();
  const [searchQuery, setSearchQuery] = useState("");
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<MemoryTypeFilter>("all");
  const [memoryScopeFilter, setMemoryScopeFilter] = useState<MemoryScopeFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markdownExportScope, setMarkdownExportScope] = useState<MarkdownExportScope>("accepted");
  const actionInFlight = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [storageHealth, setStorageHealth] = useState<StorageHealth>(() => summarizeStorageEstimate(undefined));
  const [vaultIntegrityReport, setVaultIntegrityReport] = useState<VaultIntegrityReport>();

  const refreshAll = useCallback(async () => {
    setError(undefined);

    const [context, archiveList, allCards, proposed, accepted] = await Promise.all([
      sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" }),
      sendRuntimeMessage({ type: "LIST_ARCHIVES" }),
      sendRuntimeMessage({ type: "LIST_MEMORY_CARDS" }),
      sendRuntimeMessage({ type: "LIST_MEMORY_CARDS", status: "proposed" }),
      sendRuntimeMessage({ type: "LIST_MEMORY_CARDS", status: "accepted" })
    ]);

    setTabContext(context);
    setArchives(archiveList);
    setAllMemoryCards(allCards.map(getSafeMemoryCardForRead));
    setProposedCards(proposed.map(getSafeMemoryCardForRead));
    setAcceptedCards(accepted.map(getSafeMemoryCardForRead));
    setVaultIntegrityReport(undefined);
  }, []);

  useEffect(() => {
    refreshAll().catch((refreshError: unknown) => {
      setError(formatDisplayError(refreshError, "Failed to load ContextVault."));
    });
  }, [refreshAll]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStorageHealth() {
      const estimate = await navigator.storage?.estimate?.();

      if (!cancelled) {
        setStorageHealth(summarizeStorageEstimate(estimate));
      }
    }

    refreshStorageHealth().catch(() => {
      if (!cancelled) {
        setStorageHealth(summarizeStorageEstimate(undefined));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [archives.length, allMemoryCards.length]);

  useEffect(() => {
    let cancelled = false;

    sendRuntimeMessage({
      type: "SEARCH_MEMORY_CARDS",
      query: searchQuery,
      status: "accepted",
      memoryType: memoryTypeFilter === "all" ? undefined : memoryTypeFilter,
      memoryScope: memoryScopeFilter === "all" ? undefined : memoryScopeFilter
    })
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results);
        }
      })
      .catch((searchError: unknown) => {
        if (!cancelled) {
          setError(formatDisplayError(searchError, "Search failed."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [acceptedCards, memoryScopeFilter, memoryTypeFilter, searchQuery]);

  const runAction = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    return runExclusiveAction(actionInFlight, setActionBusy, action);
  };

  const captureConversation = async () => {
    setError(undefined);
    setMessage(undefined);

    try {
      const result = await sendRuntimeMessage({ type: "CAPTURE_ACTIVE_CONVERSATION" });
      setLatestCaptureArchive(result.archive);
      setLatestCaptureTurnCount(result.turns.length);
      setLatestCaptureCardCount(result.proposedCards.length);
      setMessage(
        result.deduplicated
          ? `这段对话已沉淀过，已复用 ${result.turns.length} 个 turn 和 ${result.proposedCards.length} 张候选记忆卡。`
          : `已捕获 ${result.turns.length} 个 turn，生成 ${result.proposedCards.length} 张候选记忆卡。`
      );
      await refreshAll();
      setActiveView("capture");
    } catch (captureError) {
      setError(formatDisplayError(captureError, "Capture failed."));
    }
  };

  const saveCards = async (cards: MemoryCard[]) => {
    if (cards.length === 0) {
      return;
    }

    await Promise.all(cards.map((card) => sendRuntimeMessage({ type: "UPDATE_MEMORY_CARD", card })));
    await refreshAll();
  };

  const updateCard = async (card: MemoryCard) => {
    await saveCards([
      {
        ...card,
        updatedAt: new Date().toISOString()
      }
    ]);
    setMessage("已保存候选记忆。");
  };

  const createManualMemoryCard = async (input: ManualMemoryCardInput): Promise<ManualMemoryCreateResult> => {
    try {
      setError(undefined);
      const confirmation = getManualMemoryConfirmationMessage(input);

      if (confirmation && !window.confirm(confirmation)) {
        return {
          ok: false,
          error: ""
        };
      }

      const card = await sendRuntimeMessage({ type: "CREATE_MANUAL_MEMORY_CARD", input });
      setMessage(formatManualMemoryCreatedMessage(card));
      await refreshAll();
      setActiveView("memory");
      return {
        ok: true,
        card
      };
    } catch (manualError) {
      const error = formatDisplayError(manualError, "Failed to create manual memory.");
      setError(error);
      return {
        ok: false,
        error
      };
    }
  };

  const reviewCards = async (cards: MemoryCard[], status: ReviewStatus) => {
    const now = new Date().toISOString();

    await saveCards(cards.map((card) => applyReviewStatus(card, status, now)));
    setMessage(status === "accepted" ? `已入库 ${cards.length} 张记忆卡。` : `已丢弃 ${cards.length} 张候选记忆。`);
  };

  const copyCards = async (cards: MemoryCard[], options: { redactSensitive?: boolean } = {}) => {
    if (cards.length === 0) {
      return;
    }

    const promptContext = buildMemoryCardsPromptContext(sortMemoryCardsForRecall(cards), {
      ...options,
      maxLength: PROMPT_COPY_MAX_LENGTH,
      maxSourceAnchorsPerCard: PROMPT_COPY_MAX_SOURCE_ANCHORS_PER_CARD
    });

    if (promptContext.includedCards.length === 0) {
      setError("No memory cards fit within the prompt copy budget.");
      return;
    }

    if (!confirmMemoryDisclosure(promptContext.includedCards, "复制", options)) {
      return;
    }

    const budgetConfirmation = formatPromptCopyBudgetConfirmation(promptContext, {
      selectedCount: cards.length,
      maxSourceAnchorsPerCard: PROMPT_COPY_MAX_SOURCE_ANCHORS_PER_CARD
    });

    if (budgetConfirmation && !window.confirm(budgetConfirmation)) {
      return;
    }

    const copyResult = await copyTextToClipboard(promptContext.text);

    if (!copyResult.ok) {
      setError(copyResult.error);
      return;
    }

    setMessage(
      formatPromptCopyResultMessage(promptContext, {
        maxSourceAnchorsPerCard: PROMPT_COPY_MAX_SOURCE_ANCHORS_PER_CARD
      })
    );
  };

  const openArchive = async (archiveId: string, sourceAnchor?: SourceAnchor) => {
    setError(undefined);
    const archive = await sendRuntimeMessage({ type: "GET_ARCHIVE", archiveId });
    setSelectedArchive(archive);
    setSelectedSourceTurnId(sourceAnchor?.turnId);
    setSelectedSourceAnchor(sourceAnchor);
  };

  const openCardSource = async (card: MemoryCard) => {
    const anchor = getSafeSourceAnchors(card)[0];

    if (!anchor) {
      setError("这张记忆卡没有可追溯的来源锚点。");
      return;
    }

    try {
      await openArchive(anchor.archiveId, anchor);
      setActiveView("archives");
      setMessage(`已打开来源：${anchor.turnId}。`);
    } catch (sourceError) {
      setError(`无法打开来源：${formatDisplayError(sourceError, "来源不存在。")}`);
    }
  };

  const deleteArchive = async (archive: SourceArchive) => {
    const referencedCards = getArchiveReferencedCards(allMemoryCards, archive.id);
    const ok = window.confirm(formatArchiveDeleteConfirmation(archive, referencedCards));

    if (!ok) {
      return;
    }

    setError(undefined);
    const result = await sendRuntimeMessage({ type: "DELETE_ARCHIVE", archiveId: archive.id });
    setSelectedArchive(undefined);
    setSelectedSourceTurnId(undefined);
    setSelectedSourceAnchor(undefined);
    setMessage(formatArchiveDeleteResultMessage(result));
    await refreshAll();
  };

  const exportVaultData = async () => {
    setError(undefined);
    const vault = await sendRuntimeMessage({ type: "EXPORT_VAULT" });

    if (!window.confirm(formatVaultExportDisclosureMessage(vault))) {
      return;
    }

    const preparedExport = prepareVaultExportDownload(vault);

    if (preparedExport.largeExportWarning && !window.confirm(preparedExport.largeExportWarning)) {
      return;
    }

    downloadText(preparedExport.text, `contextvault-export-${timestampStamp()}.json`, "application/json");
    setMessage("已导出 ContextVault JSON。");
  };

  const exportMarkdownData = async (scope: MarkdownExportScope, options: { redactSensitive?: boolean } = {}) => {
    setError(undefined);
    const cardsToExport = await listCardsForMarkdownScope(scope);

    if (!confirmMemoryDisclosure(cardsToExport, "导出", options)) {
      return;
    }

    const markdown = await sendRuntimeMessage({
      type: "EXPORT_MARKDOWN",
      status: scope === "all" ? undefined : scope,
      redactSensitive: options.redactSensitive
    });
    const safetyLabel = options.redactSensitive ? "redacted-" : "";
    downloadText(markdown, `contextvault-${safetyLabel}memories-${scope}-${timestampStamp()}.md`, "text/markdown");
    setMessage(`已导出 ${markdownScopeLabel(scope)} Markdown。`);
  };

  const exportArchiveData = async (archiveId: string) => {
    setError(undefined);
    const archive = await sendRuntimeMessage({ type: "GET_ARCHIVE", archiveId });

    if (!window.confirm(formatArchiveExportDisclosureMessage(archive))) {
      return;
    }

    downloadJson(archive, `contextvault-archive-${safeFilenamePart(archive.archive.id)}-${timestampStamp()}.json`);
    setMessage("已导出原始存档 JSON。");
  };

  const checkVaultIntegrity = async () => {
    setError(undefined);

    try {
      const report = await sendRuntimeMessage({ type: "AUDIT_VAULT_INTEGRITY" });

      setVaultIntegrityReport(report);
      setMessage(formatVaultIntegrityResultMessage(report));
    } catch (integrityError) {
      setError(formatDisplayError(integrityError, "Vault integrity check failed."));
    }
  };

  const importVaultData = async (file: File) => {
    try {
      setError(undefined);
      setMessage(undefined);
      assertVaultImportFileReadable(file);
      const storageEstimate = await navigator.storage?.estimate?.();
      assertImportFitsAvailableStorage(file, storageEstimate);
      const text = await file.text();
      const vault = parseVaultImportText(text);
      const result = await sendRuntimeMessage({ type: "IMPORT_VAULT", vault });
      setMessage(`已导入 ${result.archiveCount} 个存档、${result.turnCount} 个 turn、${result.memoryCardCount} 张记忆卡。`);
      await refreshAll();
    } catch (importError) {
      setError(`导入失败：${formatDisplayError(importError, "无法读取该文件。")}`);
    }
  };

  const importConversationCaptureData = async (file: File) => {
    try {
      setError(undefined);
      setMessage(undefined);
      assertVaultImportFileReadable(file);
      const storageEstimate = await navigator.storage?.estimate?.();
      const captures = await parseConversationCaptureImportFile(file, { storageEstimate });
      const result = await sendRuntimeMessage({ type: "IMPORT_CONVERSATION_CAPTURES", captures });
      setMessage(
        `已导入 ${result.importedCount} 段对话、${result.archiveCount} 个新存档、${result.turnCount} 个 turn、${result.proposedMemoryCardCount} 张候选记忆卡。` +
          (result.deduplicatedCount > 0 ? ` 已跳过 ${result.deduplicatedCount} 段重复对话。` : "") +
          formatImportWarningSummary(result.warningCounts)
      );
      await refreshAll();
      setActiveView("capture");
    } catch (importError) {
      setError(`对话导入失败：${formatDisplayError(importError, "无法读取该文件。")}`);
    }
  };

  const deleteMemoryCard = async (card: MemoryCard) => {
    const ok = window.confirm(formatMemoryCardDeleteConfirmation(card));

    if (!ok) {
      return;
    }

    setError(undefined);
    await sendRuntimeMessage({ type: "DELETE_MEMORY_CARD", cardId: card.id });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(card.id);
      return next;
    });
    setMessage("已删除记忆卡。");
    await refreshAll();
  };

  const hasActiveMemoryFilter = hasActiveMemoryRecallFilter({
    query: searchQuery,
    memoryTypeFilter,
    memoryScopeFilter
  });
  const visibleAcceptedCards = useMemo(
    () =>
      hasActiveMemoryFilter
        ? searchResults.map((result) => result.card)
        : sortMemoryCardsForRecall(acceptedCards).slice(0, 30),
    [acceptedCards, hasActiveMemoryFilter, searchResults]
  );
  const visibleAcceptedCardIds = useMemo(() => selectVisibleMemoryIds(visibleAcceptedCards), [visibleAcceptedCards]);
  const searchSnippetsByCardId = useMemo(
    () => new Map(searchResults.map((result) => [result.card.id, result.snippets])),
    [searchResults]
  );
  const selectedCards = useMemo(
    () => visibleAcceptedCards.filter((card) => selectedIds.has(card.id)),
    [selectedIds, visibleAcceptedCards]
  );

  useEffect(() => {
    setSelectedIds((current) => pruneSelectedMemoryIds(current, visibleAcceptedCardIds));
  }, [visibleAcceptedCardIds]);

  const canExportMarkdown = canExportMarkdownForScope(markdownExportScope, {
    accepted: acceptedCards,
    proposed: proposedCards,
    all: allMemoryCards
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-row">
            <Database size={18} aria-hidden="true" />
            <h1>ContextVault</h1>
          </div>
          <div className="provider-row">
            <span className={`status-dot ${tabContext?.supported ? "is-supported" : ""}`} />
            <span>{tabContext ? getProviderLabel(tabContext.provider) : "Loading"}</span>
            <StorageHealthBadge storageHealth={storageHealth} />
          </div>
        </div>
        <button className="icon-button" title="刷新" onClick={() => void runAction(refreshAll)} disabled={actionBusy}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </header>

      <nav className="segmented" aria-label="ContextVault views">
        <button className={activeView === "capture" ? "is-active" : ""} onClick={() => setActiveView("capture")}>
          <Sparkles size={15} aria-hidden="true" />
          沉淀
        </button>
        <button className={activeView === "memory" ? "is-active" : ""} onClick={() => setActiveView("memory")}>
          <Search size={15} aria-hidden="true" />
          记忆
        </button>
        <button className={activeView === "archives" ? "is-active" : ""} onClick={() => setActiveView("archives")}>
          <Archive size={15} aria-hidden="true" />
          存档
        </button>
      </nav>

      {message ? <div className="notice">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      {activeView === "capture" ? (
        <CaptureView
          busy={actionBusy}
          tabContext={tabContext}
          latestArchive={latestCaptureArchive}
          latestTurnCount={latestCaptureTurnCount}
          latestCardCount={latestCaptureCardCount}
          proposedCards={proposedCards}
          onCapture={() => void runAction(captureConversation)}
          onUpdateCard={(card) => void runAction(() => updateCard(card))}
          onReviewCards={(cards, status) => void runAction(() => reviewCards(cards, status))}
          onOpenSource={(card) => void runAction(() => openCardSource(card))}
        />
      ) : null}

      {activeView === "memory" ? (
        <MemoryView
          query={searchQuery}
          onQueryChange={setSearchQuery}
          memoryTypeFilter={memoryTypeFilter}
          onMemoryTypeFilterChange={setMemoryTypeFilter}
          memoryScopeFilter={memoryScopeFilter}
          onMemoryScopeFilterChange={setMemoryScopeFilter}
          cards={visibleAcceptedCards}
          actionBusy={actionBusy}
          onCreateManualCard={async (input) =>
            (await runAction(() => createManualMemoryCard(input))) ?? {
              ok: false,
              error: ""
            }
          }
          selectedIds={selectedIds}
          onToggleSelected={(cardId) => {
            setSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(cardId)) {
                next.delete(cardId);
              } else {
                next.add(cardId);
              }
              return next;
            });
          }}
          onCopyCard={(card) => void runAction(() => copyCards([card]))}
          onCopyRedactedCard={(card) => void runAction(() => copyCards([card], { redactSensitive: true }))}
          onCopySelected={() => void runAction(() => copyCards(selectedCards))}
          onCopyRedactedSelected={() => void runAction(() => copyCards(selectedCards, { redactSensitive: true }))}
          onSelectVisible={() => setSelectedIds(visibleAcceptedCardIds)}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteCard={(card) => void runAction(() => deleteMemoryCard(card))}
          onOpenSource={(card) => void runAction(() => openCardSource(card))}
          markdownExportScope={markdownExportScope}
          onMarkdownExportScopeChange={setMarkdownExportScope}
          onExportMarkdown={() => void runAction(() => exportMarkdownData(markdownExportScope))}
          onExportRedactedMarkdown={() =>
            void runAction(() => exportMarkdownData(markdownExportScope, { redactSensitive: true }))
          }
          canExportMarkdown={canExportMarkdown}
          selectedVisibleCount={selectedCards.length}
          visibleCount={visibleAcceptedCards.length}
          acceptedCount={acceptedCards.length}
          searchSnippetsByCardId={searchQuery.trim().length > 0 ? searchSnippetsByCardId : new Map()}
        />
      ) : null}

      {activeView === "archives" ? (
        <ArchiveView
          archives={archives}
          selectedArchive={selectedArchive}
          selectedSourceTurnId={selectedSourceTurnId}
          selectedSourceAnchor={selectedSourceAnchor}
          onOpenArchive={(archiveId) => void runAction(() => openArchive(archiveId))}
          onDeleteArchive={(archive) => void runAction(() => deleteArchive(archive))}
          onExportArchive={(archiveId) => void runAction(() => exportArchiveData(archiveId))}
          onExportVault={() => void runAction(exportVaultData)}
          onImportVault={(file) => void runAction(() => importVaultData(file))}
          onImportConversations={(file) => void runAction(() => importConversationCaptureData(file))}
          vaultIntegrityReport={vaultIntegrityReport}
          archiveActionBusy={actionBusy}
          onCheckVaultIntegrity={() => void runAction(checkVaultIntegrity)}
        />
      ) : null}
    </main>
  );
}

function CaptureView({
  busy,
  tabContext,
  latestArchive,
  latestTurnCount,
  latestCardCount,
  proposedCards,
  onCapture,
  onUpdateCard,
  onReviewCards,
  onOpenSource
}: {
  busy: boolean;
  tabContext?: BrowserTabContext;
  latestArchive?: SourceArchive;
  latestTurnCount?: number;
  latestCardCount?: number;
  proposedCards: MemoryCard[];
  onCapture: () => void;
  onUpdateCard: (card: MemoryCard) => void;
  onReviewCards: (cards: MemoryCard[], status: ReviewStatus) => void;
  onOpenSource: (card: MemoryCard) => void;
}) {
  const [draftsById, setDraftsById] = useState<Map<string, MemoryCard>>(new Map());

  useEffect(() => {
    setDraftsById((current) => {
      const next = new Map<string, MemoryCard>();

      for (const card of proposedCards) {
        next.set(card.id, current.get(card.id) ?? card);
      }

      return next;
    });
  }, [proposedCards]);

  const draftCards = proposedCards.map((card) => draftsById.get(card.id) ?? card);
  const updateDraft = (card: MemoryCard) => {
    setDraftsById((current) => {
      const next = new Map(current);
      next.set(card.id, card);
      return next;
    });
  };
  const confirmAndReviewCards = (cards: MemoryCard[], status: ReviewStatus) => {
    const confirmation = getReviewConfirmationMessage(cards, status);

    if (confirmation && !window.confirm(confirmation)) {
      return;
    }

    onReviewCards(cards, status);
  };

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <div className="section-label">当前会话</div>
          <div className="tab-title">{tabContext?.title ?? "Unknown tab"}</div>
        </div>
        <button className="primary-button" onClick={onCapture} disabled={busy || !tabContext?.supported}>
          <Sparkles size={16} aria-hidden="true" />
          {busy ? "捕获中" : "沉淀当前对话"}
        </button>
      </div>

      {latestArchive ? (
        <CaptureQualityPanel archive={latestArchive} turnCount={latestTurnCount} cardCount={latestCardCount} />
      ) : null}

      <section>
        <div className="section-head">
          <h2>候选记忆</h2>
          <div className="inline-actions">
            <span>{proposedCards.length}</span>
            {proposedCards.length > 0 ? (
              <>
                <button className="ghost-button" onClick={() => confirmAndReviewCards(draftCards, "accepted")} disabled={busy}>
                  <Check size={15} aria-hidden="true" />
                  全部入库
                </button>
                <button
                  className="ghost-button danger-text"
                  onClick={() => confirmAndReviewCards(draftCards, "rejected")}
                  disabled={busy}
                >
                  <X size={15} aria-hidden="true" />
                  全部丢弃
                </button>
              </>
            ) : null}
          </div>
        </div>
        {proposedCards.length === 0 ? (
          <EmptyState icon={<Inbox size={18} />} label="暂无候选记忆" />
        ) : (
          <div className="card-list">
            {proposedCards.map((card) => (
              <EditableCard
                key={card.id}
                card={draftsById.get(card.id) ?? card}
                busy={busy}
                onDraftChange={updateDraft}
                onUpdate={onUpdateCard}
                onAccept={(draft) => confirmAndReviewCards([draft], "accepted")}
                onReject={(draft) => confirmAndReviewCards([draft], "rejected")}
                onOpenSource={onOpenSource}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function CaptureQualityPanel({
  archive,
  turnCount,
  cardCount
}: {
  archive: SourceArchive;
  turnCount?: number;
  cardCount?: number;
}) {
  return (
    <section className="capture-quality">
      <div className="section-head">
        <h2>最近捕获质量</h2>
        <span>{new Date(archive.capturedAt).toLocaleTimeString()}</span>
      </div>
      <div className="quality-grid">
        <div>
          <span>来源</span>
          <strong>{getProviderLabel(archive.provider)}</strong>
        </div>
        <div>
          <span>Turn</span>
          <strong>{turnCount ?? 0}</strong>
        </div>
        <div>
          <span>候选</span>
          <strong>{cardCount ?? 0}</strong>
        </div>
      </div>
      {archive.warnings.length > 0 ? (
        <WarningList warnings={archive.warnings} />
      ) : (
        <div className="quality-ok">
          <Check size={14} aria-hidden="true" />
          <span>未发现捕获质量告警</span>
        </div>
      )}
    </section>
  );
}

function MemoryView({
  query,
  onQueryChange,
  memoryTypeFilter,
  onMemoryTypeFilterChange,
  memoryScopeFilter,
  onMemoryScopeFilterChange,
  cards,
  actionBusy,
  onCreateManualCard,
  selectedIds,
  onToggleSelected,
  onCopyCard,
  onCopyRedactedCard,
  onCopySelected,
  onCopyRedactedSelected,
  onSelectVisible,
  onClearSelection,
  onDeleteCard,
  onOpenSource,
  markdownExportScope,
  onMarkdownExportScopeChange,
  onExportMarkdown,
  onExportRedactedMarkdown,
  canExportMarkdown,
  selectedVisibleCount,
  visibleCount,
  acceptedCount,
  searchSnippetsByCardId
}: {
  query: string;
  onQueryChange: (value: string) => void;
  memoryTypeFilter: MemoryTypeFilter;
  onMemoryTypeFilterChange: (value: MemoryTypeFilter) => void;
  memoryScopeFilter: MemoryScopeFilter;
  onMemoryScopeFilterChange: (value: MemoryScopeFilter) => void;
  cards: MemoryCard[];
  actionBusy: boolean;
  onCreateManualCard: (input: ManualMemoryCardInput) => Promise<ManualMemoryCreateResult>;
  selectedIds: Set<string>;
  onToggleSelected: (cardId: string) => void;
  onCopyCard: (card: MemoryCard) => void;
  onCopyRedactedCard: (card: MemoryCard) => void;
  onCopySelected: () => void;
  onCopyRedactedSelected: () => void;
  onSelectVisible: () => void;
  onClearSelection: () => void;
  onDeleteCard: (card: MemoryCard) => void;
  onOpenSource: (card: MemoryCard) => void;
  markdownExportScope: MarkdownExportScope;
  onMarkdownExportScopeChange: (scope: MarkdownExportScope) => void;
  onExportMarkdown: () => void;
  onExportRedactedMarkdown: () => void;
  canExportMarkdown: boolean;
  selectedVisibleCount: number;
  visibleCount: number;
  acceptedCount: number;
  searchSnippetsByCardId: Map<string, SearchResult["snippets"]>;
}) {
  const [revealedSensitiveCardIds, setRevealedSensitiveCardIds] = useState<Set<string>>(new Set());
  const queryLimitState = getSearchQueryLimitState(query);
  const emptyState = getMemoryRecallEmptyState({
    query,
    memoryTypeFilter,
    memoryScopeFilter,
    visibleCount,
    acceptedCount
  });
  const hasActiveRecallFilter = hasActiveMemoryRecallFilter({
    query,
    memoryTypeFilter,
    memoryScopeFilter
  });
  const clearRecallFilters = () => {
    const clearedFilters = getClearedMemoryRecallFilters();

    onQueryChange(clearedFilters.query);
    onMemoryTypeFilterChange(clearedFilters.memoryTypeFilter);
    onMemoryScopeFilterChange(clearedFilters.memoryScopeFilter);
  };

  return (
    <section className="view-stack">
      <div className="memory-filter-stack">
        <div className="search-row">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(normalizeMemoryRecallQueryInput(event.target.value))}
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            aria-describedby={queryLimitState ? "memory-search-limit" : undefined}
            aria-label="搜索记忆，支持 type:fact、类型:事实、scope:chat、范围:对话、tag:recall 等字段查询"
            title="支持字段查询：type:decision 或 类型:决策，type:fact 或 类型:事实，scope:chat 或 范围:对话，tag:recall 或 标签:召回，status:saved 或 状态:已保存"
            placeholder="搜索记忆，例如 类型:事实 标签:召回"
          />
        </div>
        {queryLimitState ? (
          <div className={`search-limit-note is-${queryLimitState.level}`} id="memory-search-limit">
            {queryLimitState.message}
          </div>
        ) : null}
        <div className="filter-row">
          <ListFilter size={15} aria-hidden="true" />
          <div className="filter-select-grid">
            <select
              value={memoryTypeFilter}
              onChange={(event) => onMemoryTypeFilterChange(event.target.value as MemoryTypeFilter)}
              aria-label="记忆类型"
            >
              <option value="all">全部类型</option>
              {MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getMemoryTypeLabel(type)}
                </option>
              ))}
            </select>
            <select
              value={memoryScopeFilter}
              onChange={(event) => onMemoryScopeFilterChange(event.target.value as MemoryScopeFilter)}
              aria-label="记忆范围"
            >
              <option value="all">全部范围</option>
              {MEMORY_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {getMemoryScopeLabel(scope)}
                </option>
              ))}
            </select>
          </div>
          <button
            className="icon-button mini"
            type="button"
            title="清除搜索和筛选"
            aria-label="清除搜索和筛选"
            onClick={clearRecallFilters}
            disabled={!hasActiveRecallFilter}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ManualMemoryComposer onCreate={onCreateManualCard} busy={actionBusy} />

      <div className="section-head">
        <h2>已入库记忆</h2>
        <fieldset className="inline-actions memory-card-actions" disabled={actionBusy}>
          <select
            className="compact-select"
            value={markdownExportScope}
            onChange={(event) => onMarkdownExportScopeChange(event.target.value as MarkdownExportScope)}
            title="Markdown 导出范围"
          >
            <option value="accepted">已入库</option>
            <option value="proposed">候选</option>
            <option value="all">全部</option>
          </select>
          <button className="ghost-button" onClick={onExportMarkdown} disabled={actionBusy || !canExportMarkdown}>
            <Download size={15} aria-hidden="true" />
            Markdown
          </button>
          <button className="ghost-button" onClick={onExportRedactedMarkdown} disabled={actionBusy || !canExportMarkdown}>
            <Shield size={15} aria-hidden="true" />
            Redact
          </button>
          <button
            className="ghost-button"
            onClick={onSelectVisible}
            disabled={actionBusy || visibleCount === 0 || selectedVisibleCount === visibleCount}
          >
            <Check size={15} aria-hidden="true" />
            Select visible
          </button>
          <button className="ghost-button" onClick={onClearSelection} disabled={actionBusy || selectedVisibleCount === 0}>
            <X size={15} aria-hidden="true" />
            Clear
          </button>
          <button className="ghost-button" onClick={onCopyRedactedSelected} disabled={actionBusy || selectedVisibleCount === 0}>
            <Shield size={15} aria-hidden="true" />
            Redact Copy
          </button>
          <button className="ghost-button" onClick={onCopySelected} disabled={actionBusy || selectedVisibleCount === 0}>
            <Clipboard size={15} aria-hidden="true" />
            复制所选
          </button>
        </fieldset>
      </div>

      {emptyState ? (
        <EmptyState icon={<Shield size={18} />} label={emptyState.label} detail={emptyState.detail} />
      ) : (
        <div className="card-list">
          {cards.map((card) => (
            <MemoryCardView
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              onToggleSelected={() => onToggleSelected(card.id)}
              onOpenSource={() => onOpenSource(card)}
              onCopy={() => onCopyCard(card)}
              onCopyRedacted={() => onCopyRedactedCard(card)}
              onDelete={() => onDeleteCard(card)}
              actionBusy={actionBusy}
              sensitivePreviewRevealed={revealedSensitiveCardIds.has(card.id)}
              onToggleSensitivePreview={() =>
                setRevealedSensitiveCardIds((current) => {
                  const next = new Set(current);

                  if (next.has(card.id)) {
                    next.delete(card.id);
                  } else {
                    next.add(card.id);
                  }

                  return next;
                })
              }
              snippets={searchSnippetsByCardId.get(card.id) ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManualMemoryComposer({
  onCreate,
  busy
}: {
  onCreate: (input: ManualMemoryCardInput) => Promise<ManualMemoryCreateResult>;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<MemoryCardType>("project_fact");
  const [scope, setScope] = useState<MemoryScope>("project");
  const [tags, setTags] = useState("manual");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const trimmedBodyLength = body.trim().length;
  const bodyTooLong = trimmedBodyLength > MAX_MANUAL_MEMORY_BODY_LENGTH;
  const tagStatus = getMemoryTagDraftStatus(tags);
  const ownerStatus = getTodoOwnerDraftStatus(owner);
  const formBusy = busy || creating;
  const canCreate =
    !formBusy &&
    title.trim().length > 0 &&
    trimmedBodyLength > 0 &&
    !bodyTooLong &&
    !tagStatus.hasTooManyTags &&
    !tagStatus.hasOversizedTag &&
    (type !== "todo" || !ownerStatus.isTooLong);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    setCreating(true);

    try {
      const result = await onCreate({
        title: title.trim(),
        body: body.trim(),
        type,
        scope,
        tags: parseMemoryTagInput(tags),
        ...(type === "todo" && owner.trim() ? { owner: owner.trim() } : {}),
        ...(type === "todo" ? { dueAt: dateInputToIsoDate(dueDate) } : {})
      });

      if (result.ok) {
        setTitle("");
        setBody("");
        setOwner("");
        setDueDate("");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="manual-memory-composer" onSubmit={submit}>
      <div className="section-head compact">
        <h2>Manual Memory</h2>
        <button className="ghost-button" type="submit" disabled={!canCreate}>
          <Check size={15} aria-hidden="true" />
          {creating || busy ? "Adding" : "Add"}
        </button>
      </div>
      <div className="metadata-row">
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value as MemoryCardType;
            setType(nextType);

            if (nextType !== "todo") {
              setOwner("");
              setDueDate("");
            }
          }}
          aria-label="Memory type"
          disabled={formBusy}
        >
          {MEMORY_TYPES.map((memoryType) => (
            <option key={memoryType} value={memoryType}>
              {getMemoryTypeLabel(memoryType)}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as MemoryScope)}
          aria-label="Memory scope"
          disabled={formBusy}
        >
          {MEMORY_SCOPES.map((memoryScope) => (
            <option key={memoryScope} value={memoryScope}>
              {getMemoryScopeLabel(memoryScope)}
            </option>
          ))}
        </select>
      </div>
      {type === "todo" ? (
        <div className="todo-meta-row">
          <input
            className="card-meta-input"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="Owner"
            aria-label="Manual todo owner"
            aria-describedby="manual-memory-owner-limit"
            disabled={formBusy}
          />
          <input
            className="card-meta-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            aria-label="Manual todo due date"
            disabled={formBusy}
          />
        </div>
      ) : null}
      {type === "todo" && ownerStatus.isTooLong ? (
        <div className="field-footnote is-error" id="manual-memory-owner-limit">
          {ownerStatus.message}
        </div>
      ) : null}
      <input
        className="card-title-input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        maxLength={MAX_MEMORY_CARD_TITLE_LENGTH}
        disabled={formBusy}
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Paste or write the reusable memory here"
        maxLength={MAX_MANUAL_MEMORY_BODY_LENGTH + 1}
        aria-describedby="manual-memory-body-limit"
        disabled={formBusy}
      />
      <div className={`field-footnote${bodyTooLong ? " is-error" : ""}`} id="manual-memory-body-limit">
        {trimmedBodyLength} / {MAX_MANUAL_MEMORY_BODY_LENGTH} characters
      </div>
      <input
        className="card-tags-input"
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="Tags, separated by commas"
        aria-describedby="manual-memory-tags-limit"
        disabled={formBusy}
      />
      <div
        className={`field-footnote${tagStatus.message ? " is-error" : ""}`}
        id="manual-memory-tags-limit"
      >
        {tagStatus.message ?? `${tagStatus.tagCount} tag(s)`}
      </div>
    </form>
  );
}

function ArchiveView({
  archives,
  selectedArchive,
  selectedSourceTurnId,
  selectedSourceAnchor,
  onOpenArchive,
  onDeleteArchive,
  onExportArchive,
  onExportVault,
  onImportVault,
  onImportConversations,
  vaultIntegrityReport,
  archiveActionBusy,
  onCheckVaultIntegrity
}: {
  archives: SourceArchive[];
  selectedArchive?: ArchiveWithTurns;
  selectedSourceTurnId?: string;
  selectedSourceAnchor?: SourceAnchor;
  onOpenArchive: (archiveId: string) => void;
  onDeleteArchive: (archive: SourceArchive) => void;
  onExportArchive: (archiveId: string) => void;
  onExportVault: () => void;
  onImportVault: (file: File) => void;
  onImportConversations: (file: File) => void;
  vaultIntegrityReport?: VaultIntegrityReport;
  archiveActionBusy: boolean;
  onCheckVaultIntegrity: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const conversationImportInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="view-stack">
      <div className="section-head">
        <h2>原始存档</h2>
        <div className="inline-actions">
          <button className="ghost-button" onClick={() => importInputRef.current?.click()} disabled={archiveActionBusy}>
            <Upload size={15} aria-hidden="true" />
            导入
          </button>
          <button className="ghost-button" onClick={() => conversationImportInputRef.current?.click()} disabled={archiveActionBusy}>
            <Upload size={15} aria-hidden="true" />
            导入对话
          </button>
          <button className="ghost-button" onClick={onCheckVaultIntegrity} disabled={archiveActionBusy}>
            <Shield size={15} aria-hidden="true" />
            {archiveActionBusy ? "Working" : "Health"}
          </button>
          <button className="ghost-button" onClick={onExportVault} disabled={archiveActionBusy || archives.length === 0}>
            <Download size={15} aria-hidden="true" />
            导出全库
          </button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";

              if (file && !archiveActionBusy) {
                onImportVault(file);
              }
            }}
          />
          <input
            ref={conversationImportInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,application/zip,.json,.zip"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";

              if (file && !archiveActionBusy) {
                onImportConversations(file);
              }
            }}
          />
        </div>
      </div>
      {vaultIntegrityReport ? <VaultIntegrityPanel report={vaultIntegrityReport} /> : null}
      {archives.length === 0 ? (
        <EmptyState icon={<Archive size={18} />} label="暂无存档" />
      ) : (
        <div className="card-list">
          {archives.map((archive) => (
            <article key={archive.id} className="memory-card">
              <div className="card-meta">
                <span>{getProviderLabel(archive.provider)}</span>
                <span>{new Date(archive.capturedAt).toLocaleString()}</span>
              </div>
              <h3>{formatArchiveTitleForDisplay(archive)}</h3>
              <div className="archive-footer">
                <span>{archive.captureMethod}</span>
                <div className="archive-actions">
                  <button
                    className="icon-button mini"
                    title="查看存档"
                    onClick={() => onOpenArchive(archive.id)}
                    disabled={archiveActionBusy}
                  >
                    <Eye size={14} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button mini"
                    title="导出存档"
                    onClick={() => onExportArchive(archive.id)}
                    disabled={archiveActionBusy}
                  >
                    <Download size={14} aria-hidden="true" />
                  </button>
                  {archive.url ? (
                    <a href={archive.url} target="_blank" rel="noreferrer" title="打开来源">
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                  <button
                    className="icon-button mini danger"
                    title="删除存档"
                    onClick={() => onDeleteArchive(archive)}
                    disabled={archiveActionBusy}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedArchive ? (
        <SourceViewer
          archive={selectedArchive}
          highlightedTurnId={selectedSourceTurnId}
          highlightedAnchor={selectedSourceAnchor}
        />
      ) : null}
    </section>
  );
}

function VaultIntegrityPanel({ report }: { report: VaultIntegrityReport }) {
  const level = getVaultIntegrityLevel(report);
  const visibleIssues = report.issues.slice(0, 5);

  return (
    <section className={`vault-integrity is-${level}`}>
      <div className="section-head compact">
        <h2>Vault health</h2>
        <span>{new Date(report.checkedAt).toLocaleString()}</span>
      </div>
      <p>{formatVaultIntegritySummary(report)}</p>
      {visibleIssues.length > 0 ? (
        <div className="vault-integrity-issues">
          {visibleIssues.map((issue, index) => (
            <div key={`${issue.code}-${issue.sourceAnchorId ?? issue.turnId ?? issue.archiveId ?? index}`}>
              {formatVaultIntegrityIssue(issue)}
            </div>
          ))}
          {report.omittedIssueCount > 0 ? <div>{report.omittedIssueCount} more issue detail(s) omitted.</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function SourceViewer({
  archive,
  highlightedTurnId,
  highlightedAnchor
}: {
  archive: ArchiveWithTurns;
  highlightedTurnId?: string;
  highlightedAnchor?: SourceAnchor;
}) {
  const highlightedTurnRef = useRef<HTMLElement | null>(null);
  const [sourceTextRevealed, setSourceTextRevealed] = useState(false);
  const hasProtectedTurns = archive.turns.some(
    (turn) => getSourceTurnPreview(turn, archive.archive.warnings).isProtected
  );

  useEffect(() => {
    setSourceTextRevealed(false);
  }, [archive.archive.id]);

  useEffect(() => {
    highlightedTurnRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }, [archive.archive.id, highlightedTurnId]);

  return (
    <section className="source-viewer">
      <div className="section-head">
        <h2>来源详情</h2>
        <div className="inline-actions">
          <span>{archive.turns.length} turns</span>
          {hasProtectedTurns ? (
            <button
              className="icon-button mini"
              title={sourceTextRevealed ? "隐藏原始来源" : "显示原始来源"}
              onClick={() => setSourceTextRevealed((current) => !current)}
            >
              {sourceTextRevealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            </button>
          ) : null}
        </div>
      </div>
      <div className="source-meta">
        <span>{getProviderLabel(archive.archive.provider)}</span>
        <span>{new Date(archive.archive.capturedAt).toLocaleString()}</span>
      </div>
      {archive.archive.warnings.length > 0 ? (
        <WarningList warnings={archive.archive.warnings} compact />
      ) : null}
      <div className="turn-list">
        {archive.turns.map((turn) => (
          <article
            key={turn.id}
            ref={turn.id === highlightedTurnId ? highlightedTurnRef : undefined}
            className={`turn-card ${turn.id === highlightedTurnId ? "is-highlighted" : ""}`}
          >
            <div className="turn-head">
              <span className="turn-role">{turn.role}</span>
              {turn.sourceSelector ? <span className="turn-selector">{turn.sourceSelector}</span> : null}
            </div>
            <TurnText
              turn={turn}
              warnings={archive.archive.warnings}
              revealSensitive={sourceTextRevealed}
              anchor={turn.id === highlightedAnchor?.turnId ? highlightedAnchor : undefined}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function WarningList({ warnings, compact = false }: { warnings: CaptureWarning[]; compact?: boolean }) {
  const displayWarnings = summarizeWarningsForDisplay(warnings);

  return (
    <div className={`warning-list ${compact ? "is-compact" : ""}`}>
      {displayWarnings.map((warning) => (
        <div key={warning.key} className={`warning-item is-${warning.severity}`} title={warning.message}>
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <strong>
              {warning.omittedCount ? "More warnings" : captureWarningLabel(warning.code)}
              {warning.count > 1 ? ` x${warning.count}` : ""}
            </strong>
            {!compact ? <span>{warning.message}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function TurnText({
  turn,
  warnings,
  revealSensitive,
  anchor
}: {
  turn: SourceTurn;
  warnings: CaptureWarning[];
  revealSensitive: boolean;
  anchor?: SourceAnchor;
}) {
  const preview = getSourceTurnPreview(turn, warnings, { revealSensitive });
  const span = resolveVisibleAnchorSpan(preview.text, anchor, {
    isProtected: preview.isProtected,
    revealSensitive
  });

  if (!span) {
    return (
      <>
        {preview.protectionLabel ? <div className="privacy-note">{preview.protectionLabel}</div> : null}
        <p>{preview.text}</p>
      </>
    );
  }

  return (
    <>
      {preview.protectionLabel ? <div className="privacy-note">{preview.protectionLabel}</div> : null}
      <p>
        {preview.text.slice(0, span.start)}
        <mark className="source-quote">{preview.text.slice(span.start, span.end)}</mark>
        {preview.text.slice(span.end)}
      </p>
    </>
  );
}

function EditableCard({
  card,
  busy,
  onDraftChange,
  onUpdate,
  onAccept,
  onReject,
  onOpenSource
}: {
  card: MemoryCard;
  busy: boolean;
  onDraftChange: (card: MemoryCard) => void;
  onUpdate: (card: MemoryCard) => void;
  onAccept: (card: MemoryCard) => void;
  onReject: (card: MemoryCard) => void;
  onOpenSource: (card: MemoryCard) => void;
}) {
  const draftSensitivity = classifyMemoryCardDraftSensitivity(card);
  const trimmedBodyLength = card.body.trim().length;
  const bodyTooLong = trimmedBodyLength > MAX_MEMORY_CARD_BODY_LENGTH;
  const tagStatus = getMemoryTagListStatus(card.tags);
  const ownerStatus = getTodoOwnerDraftStatus(card.owner);
  const cannotStoreDraft =
    card.title.trim().length === 0 ||
    trimmedBodyLength === 0 ||
    bodyTooLong ||
    tagStatus.hasTooManyTags ||
    tagStatus.hasOversizedTag ||
    (card.type === "todo" && ownerStatus.isTooLong);
  const updateDraft = (next: MemoryCard) => {
    onDraftChange(next);
  };

  return (
    <article className="memory-card">
      <div className="card-meta">
        <div className="metadata-row">
          <select
            value={card.type}
            onChange={(event) => updateDraft(applyMemoryCardTypeDraft(card, event.target.value as MemoryCardType))}
            aria-label="记忆类型"
            disabled={busy}
          >
            {MEMORY_TYPES.map((type) => (
              <option key={type} value={type}>
                {getMemoryTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            value={card.scope}
            onChange={(event) => updateDraft({ ...card, scope: event.target.value as MemoryScope })}
            aria-label="记忆范围"
            disabled={busy}
          >
            {MEMORY_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {getMemoryScopeLabel(scope)}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-actions">
          <SensitivityBadge sensitivity={draftSensitivity} />
          <span>{Math.round((card.confidence ?? 0) * 100)}%</span>
          <button
            className="icon-button mini"
            title="查看来源"
            onClick={() => onOpenSource(card)}
            disabled={busy || getSafeSourceAnchors(card).length === 0}
          >
            <Eye size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <input
        className="card-title-input"
        value={card.title}
        onChange={(event) => updateDraft({ ...card, title: event.target.value })}
        maxLength={MAX_MEMORY_CARD_TITLE_LENGTH}
        disabled={busy}
      />
      <textarea
        value={card.body}
        onChange={(event) => updateDraft({ ...card, body: event.target.value })}
        maxLength={MAX_MEMORY_CARD_BODY_LENGTH + 1}
        aria-describedby={`memory-card-body-limit-${card.id}`}
        disabled={busy}
      />
      <div className={`field-footnote${bodyTooLong ? " is-error" : ""}`} id={`memory-card-body-limit-${card.id}`}>
        {trimmedBodyLength} / {MAX_MEMORY_CARD_BODY_LENGTH} characters
      </div>
      {card.type === "todo" ? (
        <div className="todo-meta-row">
          <input
            className="card-meta-input"
            value={card.owner ?? ""}
            onChange={(event) => updateDraft({ ...card, owner: event.target.value || undefined })}
            placeholder="负责人"
            aria-label="待办负责人"
            aria-describedby={`memory-card-owner-limit-${card.id}`}
            disabled={busy}
          />
          <input
            className="card-meta-input"
            type="date"
            value={isoDateToDateInput(card.dueAt)}
            onChange={(event) => updateDraft({ ...card, dueAt: dateInputToIsoDate(event.target.value) })}
            aria-label="待办截止日期"
            disabled={busy}
          />
        </div>
      ) : null}
      {card.type === "todo" && ownerStatus.isTooLong ? (
        <div className="field-footnote is-error" id={`memory-card-owner-limit-${card.id}`}>
          {ownerStatus.message}
        </div>
      ) : null}
      <input
        className="card-tags-input"
        value={card.tags.join(", ")}
        onChange={(event) => updateDraft({ ...card, tags: parseMemoryTagInput(event.target.value) })}
        placeholder="标签，用逗号分隔"
        aria-describedby={`memory-card-tags-limit-${card.id}`}
        disabled={busy}
      />
      <div
        className={`field-footnote${tagStatus.message ? " is-error" : ""}`}
        id={`memory-card-tags-limit-${card.id}`}
      >
        {tagStatus.message ?? `${tagStatus.tagCount} tag(s)`}
      </div>
      <div className="button-row">
        <button className="ghost-button" onClick={() => onUpdate(card)} disabled={busy || cannotStoreDraft}>
          <RefreshCw size={15} aria-hidden="true" />
          保存
        </button>
        <button className="accept-button" onClick={() => onAccept(card)} disabled={busy || cannotStoreDraft}>
          <Check size={15} aria-hidden="true" />
          入库
        </button>
        <button className="reject-button" onClick={() => onReject(card)} disabled={busy}>
          <X size={15} aria-hidden="true" />
          丢弃
        </button>
      </div>
    </article>
  );
}

function MemoryCardView({
  card,
  selected,
  actionBusy,
  onToggleSelected,
  onOpenSource,
  onCopy,
  onCopyRedacted,
  onDelete,
  sensitivePreviewRevealed,
  onToggleSensitivePreview,
  snippets
}: {
  card: MemoryCard;
  selected: boolean;
  actionBusy: boolean;
  onToggleSelected: () => void;
  onOpenSource: () => void;
  onCopy: () => void;
  onCopyRedacted: () => void;
  onDelete: () => void;
  sensitivePreviewRevealed: boolean;
  onToggleSensitivePreview: () => void;
  snippets: SearchResult["snippets"];
}) {
  const preview = getMemoryCardPreview(card, { revealSensitive: sensitivePreviewRevealed });

  return (
    <article className={`memory-card ${selected ? "is-selected" : ""}`}>
      <div className="card-meta">
        <label className="select-row">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} disabled={actionBusy} />
          <span>{getMemoryTypeLabel(card.type)}</span>
        </label>
        <div className="inline-actions">
          <SensitivityBadge sensitivity={getEffectiveMemorySensitivity(card)} />
          {preview.isProtected ? (
            <button
              className="icon-button mini"
              title={sensitivePreviewRevealed ? "隐藏敏感预览" : "显示敏感预览"}
              onClick={onToggleSensitivePreview}
            >
              {sensitivePreviewRevealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            </button>
          ) : null}
          <button
            className="icon-button mini"
            title="查看来源"
            onClick={onOpenSource}
            disabled={actionBusy || getSafeSourceAnchors(card).length === 0}
          >
            <Eye size={14} aria-hidden="true" />
          </button>
          <button className="icon-button mini" title="复制" onClick={onCopy} disabled={actionBusy}>
            <Copy size={14} aria-hidden="true" />
          </button>
          <button className="icon-button mini" title="Redact copy" onClick={onCopyRedacted} disabled={actionBusy}>
            <Shield size={14} aria-hidden="true" />
          </button>
          <button className="icon-button mini danger" title="删除" onClick={onDelete} disabled={actionBusy}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {preview.protectionLabel ? <div className="privacy-note">{preview.protectionLabel}</div> : null}
      <h3>{preview.title}</h3>
      <p>{preview.body}</p>
      {preview.metadata.length > 0 ? (
        <div className="metadata-chip-row">
          {preview.metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      {snippets.length > 0 ? (
        <div className="snippet-list">
          {snippets.map((snippet, index) => (
            <div key={`${snippet.field}-${index}`} className="search-snippet">
              <div className="search-snippet-head">
                <span className="snippet-field-label">{snippetLabel(snippet.field)}</span>
                {snippet.matchedTerms.length > 0 ? (
                  <div className="snippet-term-row" aria-label="Matched terms">
                    {snippet.matchedTerms.map((term) => (
                      <span key={term}>{term}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <p>{snippet.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="tag-row">
        {preview.tags.slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}

function snippetLabel(field: SearchResult["snippets"][number]["field"]): string {
  switch (field) {
    case "title":
      return "标题";
    case "body":
      return "正文";
    case "tags":
      return "标签";
    case "type":
      return "类型";
    case "metadata":
      return "元数据";
  }
}

function SensitivityBadge({ sensitivity }: { sensitivity: Sensitivity }) {
  return (
    <span className={`sensitivity-badge is-${sensitivity}`} title={`敏感度：${sensitivityLabel(sensitivity)}`}>
      {sensitivityLabel(sensitivity)}
    </span>
  );
}

function StorageHealthBadge({ storageHealth }: { storageHealth: StorageHealth }) {
  return (
    <span
      className={`storage-health is-${storageHealth.level}`}
      title={storageHealth.level === "unknown" ? storageHealth.detail : `Local browser storage: ${storageHealth.label}. ${storageHealth.detail}`}
    >
      Storage {storageHealth.level === "unknown" ? "unknown" : storageHealth.label}
    </span>
  );
}

function sensitivityLabel(sensitivity: Sensitivity): string {
  switch (sensitivity) {
    case "normal":
      return "普通";
    case "sensitive":
      return "敏感";
    case "secret":
      return "密钥";
  }
}

function EmptyState({ icon, label, detail }: { icon: React.ReactNode; label: string; detail?: string }) {
  return (
    <div className="empty-state">
      {icon}
      <div>
        <span>{label}</span>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

function downloadJson(data: unknown, filename: string): void {
  downloadText(JSON.stringify(data, null, 2), filename, "application/json");
}

function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function timestampStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function confirmMemoryDisclosure(
  cards: MemoryCard[],
  actionLabel: string,
  options: { redactSensitive?: boolean } = {}
): boolean {
  const summary = summarizeMemorySensitivity(cards);

  if (!shouldConfirmMemoryDisclosure(cards, options)) {
    return true;
  }

  return window.confirm(
    `${actionLabel}内容包含 ${formatSensitivitySummary(summary)} 记忆卡，可能暴露敏感信息。继续？`
  );
}

async function listCardsForMarkdownScope(scope: MarkdownExportScope): Promise<MemoryCard[]> {
  if (scope === "all") {
    return sendRuntimeMessage({ type: "LIST_MEMORY_CARDS" });
  }

  return sendRuntimeMessage({
    type: "LIST_MEMORY_CARDS",
    status: scope
  });
}

function markdownScopeLabel(scope: MarkdownExportScope): string {
  switch (scope) {
    case "accepted":
      return "已入库记忆";
    case "proposed":
      return "候选记忆";
    case "all":
      return "全部记忆";
  }
}

function formatImportWarningSummary(warningCounts: CaptureWarningCount[]): string {
  if (warningCounts.length === 0) {
    return "";
  }

  const visibleWarnings = warningCounts
    .slice(0, 4)
    .map((warning) => `${captureWarningLabel(warning.code)} ${warning.count} 次`)
    .join("、");
  const suffix = warningCounts.length > 4 ? ` 等 ${warningCounts.length} 类` : "";

  return ` 导入提示：${visibleWarnings}${suffix}。`;
}

function captureWarningLabel(code: string): string {
  switch (code) {
    case "dom_fallback":
      return "DOM 捕获";
    case "provider_selector_fallback":
      return "选择器回退";
    case "generic_dom_adapter":
      return "通用适配器";
    case "no_dom_turns":
      return "未捕获到 turn";
    case "duplicate_dom_turns_removed":
      return "已移除重复 turn";
    case "sparse_dom_capture":
      return "捕获偏少";
    case "missing_user_turn":
      return "缺少用户 turn";
    case "missing_assistant_turn":
      return "缺少助手 turn";
    case "unknown_role_detected":
      return "存在未知角色";
    case "sensitive_content_detected":
      return "含敏感内容";
    case "secret_content_detected":
      return "含密钥内容";
    case "official_export_import":
      return "官方导出";
    case "chatgpt_current_path":
      return "ChatGPT 当前分支";
    case "chatgpt_mapping_fallback":
      return "ChatGPT 时间排序回退";
    case "chatgpt_non_text_parts_skipped":
      return "跳过非文本内容";
    case "chatgpt_non_conversation_roles_skipped":
      return "跳过系统/工具消息";
    case "chatgpt_empty_conversations_skipped":
      return "跳过空对话";
    default:
      return code;
  }
}
