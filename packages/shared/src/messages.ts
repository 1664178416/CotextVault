import type {
  ArchiveWithTurns,
  BrowserTabContext,
  CaptureResult,
  ConversationCapture,
  DeleteArchiveResult,
  DeleteMemoryCardResult,
  ImportConversationCapturesResult,
  ImportVaultResult,
  ManualMemoryCardInput,
  MemoryCard,
  MemoryCardStatus,
  MemoryCardType,
  MemoryScope,
  ProviderId,
  SearchResult,
  SourceArchive,
  VaultIntegrityReport,
  VaultExport
} from "./types";

export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export type RuntimeRequest =
  | {
      type: "GET_ACTIVE_TAB_CONTEXT";
    }
  | {
      type: "CAPTURE_ACTIVE_CONVERSATION";
    }
  | {
      type: "LIST_ARCHIVES";
    }
  | {
      type: "GET_ARCHIVE";
      archiveId: string;
    }
  | {
      type: "LIST_MEMORY_CARDS";
      status?: MemoryCardStatus;
    }
  | {
      type: "UPDATE_MEMORY_CARD";
      card: MemoryCard;
    }
  | {
      type: "CREATE_MANUAL_MEMORY_CARD";
      input: ManualMemoryCardInput;
    }
  | {
      type: "DELETE_MEMORY_CARD";
      cardId: string;
    }
  | {
      type: "DELETE_ARCHIVE";
      archiveId: string;
    }
  | {
      type: "EXPORT_VAULT";
    }
  | {
      type: "AUDIT_VAULT_INTEGRITY";
    }
  | {
      type: "EXPORT_MARKDOWN";
      status?: MemoryCardStatus;
      redactSensitive?: boolean;
    }
  | {
      type: "IMPORT_VAULT";
      vault: unknown;
    }
  | {
      type: "IMPORT_CONVERSATION_CAPTURES";
      captures: unknown;
    }
  | {
      type: "SEARCH_MEMORY_CARDS";
      query: string;
      status?: MemoryCardStatus;
      memoryType?: MemoryCardType;
      memoryScope?: MemoryScope;
    };

export type RuntimeResponseMap = {
  GET_ACTIVE_TAB_CONTEXT: BrowserTabContext;
  CAPTURE_ACTIVE_CONVERSATION: CaptureResult;
  LIST_ARCHIVES: SourceArchive[];
  GET_ARCHIVE: ArchiveWithTurns;
  LIST_MEMORY_CARDS: MemoryCard[];
  UPDATE_MEMORY_CARD: MemoryCard;
  CREATE_MANUAL_MEMORY_CARD: MemoryCard;
  DELETE_MEMORY_CARD: DeleteMemoryCardResult;
  DELETE_ARCHIVE: DeleteArchiveResult;
  EXPORT_VAULT: VaultExport;
  AUDIT_VAULT_INTEGRITY: VaultIntegrityReport;
  EXPORT_MARKDOWN: string;
  IMPORT_VAULT: ImportVaultResult;
  IMPORT_CONVERSATION_CAPTURES: ImportConversationCapturesResult;
  SEARCH_MEMORY_CARDS: SearchResult[];
};

export type ContentRequest = {
  type: "CAPTURE_DOM";
  provider: ProviderId;
};

export type ContentResponseMap = {
  CAPTURE_DOM: ConversationCapture;
};

export type MainWorldNetworkMessage = {
  source: "contextvault-main-world";
  type: "NETWORK_RESPONSE";
  payload: {
    url: string;
    method: string;
    status: number;
    contentType: string;
    text: string;
    capturedAt: string;
  };
};
