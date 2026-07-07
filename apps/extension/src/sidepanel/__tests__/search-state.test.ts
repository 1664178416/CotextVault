import { describe, expect, it } from "vitest";
import {
  getClearedMemoryRecallFilters,
  getMemoryRecallEmptyState,
  getSearchQueryLimitState,
  hasActiveMemoryRecallFilter,
  normalizeMemoryRecallQueryInput
} from "../search-state";

describe("side panel search state", () => {
  it("detects active recall filters", () => {
    expect(hasActiveMemoryRecallFilter({ query: "", memoryTypeFilter: "all", memoryScopeFilter: "all" })).toBe(false);
    expect(hasActiveMemoryRecallFilter({ query: " side panel ", memoryTypeFilter: "all", memoryScopeFilter: "all" })).toBe(true);
    expect(hasActiveMemoryRecallFilter({ query: "", memoryTypeFilter: "decision", memoryScopeFilter: "all" })).toBe(true);
    expect(hasActiveMemoryRecallFilter({ query: "", memoryTypeFilter: "all", memoryScopeFilter: "project" })).toBe(true);
  });

  it("returns a reusable cleared recall filter state", () => {
    const clearedFilters = getClearedMemoryRecallFilters();

    expect(clearedFilters).toEqual({
      query: "",
      memoryTypeFilter: "all",
      memoryScopeFilter: "all"
    });
    expect(hasActiveMemoryRecallFilter(clearedFilters)).toBe(false);
  });

  it("bounds recall search query input before it reaches search state", () => {
    expect(normalizeMemoryRecallQueryInput("abcdef", 3)).toBe("abc");
    expect(normalizeMemoryRecallQueryInput("abcdef", 0)).toBe("");
    expect(normalizeMemoryRecallQueryInput("abcdef", -1)).toBe("");
  });

  it("does not return an empty state when memories are visible", () => {
    expect(
      getMemoryRecallEmptyState({
        query: "capture",
        memoryTypeFilter: "all",
        memoryScopeFilter: "all",
        visibleCount: 1,
        acceptedCount: 4
      })
    ).toBeUndefined();
  });

  it("distinguishes an empty library from an empty filtered result", () => {
    expect(
      getMemoryRecallEmptyState({
        query: "",
        memoryTypeFilter: "all",
        memoryScopeFilter: "all",
        visibleCount: 0,
        acceptedCount: 0
      })
    ).toEqual({
      label: "No accepted memories yet.",
      detail: "Capture a conversation or create a manual memory to start recall."
    });

    expect(
      getMemoryRecallEmptyState({
        query: "gemini",
        memoryTypeFilter: "decision",
        memoryScopeFilter: "project",
        visibleCount: 0,
        acceptedCount: 3
      })
    ).toEqual({
      label: "No memories match the current search.",
      detail: "Active filters: search text, type=decision, scope=project. Try clearing the search or filters."
    });
  });

  it("reports field-query filters in empty search feedback", () => {
    expect(
      getMemoryRecallEmptyState({
        query: "capture,(tag:recall) owner:wyh",
        memoryTypeFilter: "all",
        memoryScopeFilter: "all",
        visibleCount: 0,
        acceptedCount: 3
      })
    ).toEqual({
      label: "No memories match the current search.",
      detail: "Active filters: search text, field query. Try clearing the search or filters."
    });

    expect(
      getMemoryRecallEmptyState({
        query: "tag:recall owner:wyh",
        memoryTypeFilter: "all",
        memoryScopeFilter: "all",
        visibleCount: 0,
        acceptedCount: 3
      })
    ).toEqual({
      label: "No memories match the current search.",
      detail: "Active filters: field query. Try clearing the search or filters."
    });
  });

  it("reports query limit warnings near and at the search limit", () => {
    expect(getSearchQueryLimitState("x".repeat(8), 10)).toBeUndefined();
    expect(getSearchQueryLimitState("x".repeat(9), 10)).toEqual({
      level: "warning",
      message: "Search query is 1 character(s) from the 10-character limit.",
      remainingCharacters: 1,
      maxLength: 10
    });
    expect(getSearchQueryLimitState("x".repeat(10), 10)).toEqual({
      level: "critical",
      message: "Search query reached the 10-character limit. Shorten it before adding more context.",
      remainingCharacters: 0,
      maxLength: 10
    });
  });
});
