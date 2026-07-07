import {
  MAX_SEARCH_QUERY_LENGTH,
  parseRecallSearchQuery,
  parseRecallSearchTerms,
  type MemoryCardType,
  type MemoryScope
} from "@contextvault/shared";

export type MemoryTypeFilter = MemoryCardType | "all";
export type MemoryScopeFilter = MemoryScope | "all";

export interface MemoryRecallEmptyStateInput {
  query: string;
  memoryTypeFilter: MemoryTypeFilter;
  memoryScopeFilter: MemoryScopeFilter;
  visibleCount: number;
  acceptedCount: number;
}

export interface MemoryRecallEmptyState {
  label: string;
  detail?: string;
}

export interface SearchQueryLimitState {
  level: "warning" | "critical";
  message: string;
  remainingCharacters: number;
  maxLength: number;
}

export interface MemoryRecallFilterState {
  query: string;
  memoryTypeFilter: MemoryTypeFilter;
  memoryScopeFilter: MemoryScopeFilter;
}

export function hasActiveMemoryRecallFilter(
  input: Pick<MemoryRecallEmptyStateInput, "query" | "memoryTypeFilter" | "memoryScopeFilter">
): boolean {
  return input.query.trim().length > 0 || input.memoryTypeFilter !== "all" || input.memoryScopeFilter !== "all";
}

export function getClearedMemoryRecallFilters(): MemoryRecallFilterState {
  return {
    query: "",
    memoryTypeFilter: "all",
    memoryScopeFilter: "all"
  };
}

export function normalizeMemoryRecallQueryInput(query: string, maxLength = MAX_SEARCH_QUERY_LENGTH): string {
  const normalizedMaxLength = Math.max(0, Math.floor(maxLength));

  return query.slice(0, normalizedMaxLength);
}

export function getMemoryRecallEmptyState(input: MemoryRecallEmptyStateInput): MemoryRecallEmptyState | undefined {
  if (input.visibleCount > 0) {
    return undefined;
  }

  if (input.acceptedCount === 0) {
    return {
      label: "No accepted memories yet.",
      detail: "Capture a conversation or create a manual memory to start recall."
    };
  }

  if (!hasActiveMemoryRecallFilter(input)) {
    return {
      label: "No accepted memories are visible.",
      detail: "Refresh the side panel or check local storage if this persists."
    };
  }

  const activeFilters = formatActiveFilters(input);

  return {
    label: "No memories match the current search.",
    detail:
      activeFilters.length > 0
        ? `Active filters: ${activeFilters.join(", ")}. Try clearing the search or filters.`
        : "Try a shorter keyword or clear the search."
  };
}

export function getSearchQueryLimitState(
  query: string,
  maxLength = MAX_SEARCH_QUERY_LENGTH
): SearchQueryLimitState | undefined {
  const normalizedMaxLength = Math.max(0, Math.floor(maxLength));
  const remainingCharacters = Math.max(0, normalizedMaxLength - query.length);

  if (normalizedMaxLength === 0 || query.length >= normalizedMaxLength) {
    return {
      level: "critical",
      message: `Search query reached the ${normalizedMaxLength.toLocaleString()}-character limit. Shorten it before adding more context.`,
      remainingCharacters,
      maxLength: normalizedMaxLength
    };
  }

  if (query.length >= Math.floor(normalizedMaxLength * 0.9)) {
    return {
      level: "warning",
      message: `Search query is ${remainingCharacters.toLocaleString()} character(s) from the ${normalizedMaxLength.toLocaleString()}-character limit.`,
      remainingCharacters,
      maxLength: normalizedMaxLength
    };
  }

  return undefined;
}

function formatActiveFilters(input: MemoryRecallEmptyStateInput): string[] {
  const filters: string[] = [];

  const query = input.query.trim();

  if (query.length > 0) {
    const parsedQuery = parseRecallSearchQuery(query);
    const terms = parseRecallSearchTerms(parsedQuery.text);

    if (terms.length > 0) {
      filters.push("search text");
    }

    if (parsedQuery.fieldQueries.length > 0) {
      filters.push("field query");
    }
  }

  if (input.memoryTypeFilter !== "all") {
    filters.push(`type=${input.memoryTypeFilter}`);
  }

  if (input.memoryScopeFilter !== "all") {
    filters.push(`scope=${input.memoryScopeFilter}`);
  }

  return filters;
}
