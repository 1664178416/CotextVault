import { describe, expect, it } from "vitest";
import type { MemoryCard, PromptContextBuildResult } from "@contextvault/shared";
import {
  formatPromptCopyBudgetConfirmation,
  formatPromptCopyResultMessage,
  summarizePromptCopyOmissions
} from "../prompt-copy-state";

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "decision",
    title: overrides.title ?? "Use Side Panel",
    body: overrides.body ?? "Use Side Panel for review.",
    status: overrides.status ?? "accepted",
    scope: overrides.scope ?? "project",
    sensitivity: overrides.sensitivity ?? "normal",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-06-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-08T00:00:00.000Z",
    sourceAnchors: overrides.sourceAnchors ?? [
      {
        id: "anchor-1",
        archiveId: "archive-1",
        turnId: "turn-1"
      }
    ]
  };
}

function promptContext(overrides: Partial<PromptContextBuildResult> = {}): PromptContextBuildResult {
  return {
    text: overrides.text ?? "Relevant Context",
    includedCards: overrides.includedCards ?? [card({ id: "included" })],
    omittedCards: overrides.omittedCards ?? [],
    truncated: overrides.truncated ?? false,
    length: overrides.length ?? 120,
    maxLength: overrides.maxLength ?? 12000
  };
}

describe("prompt copy state", () => {
  it("does not require budget confirmation when nothing is omitted", () => {
    const context = promptContext();

    expect(formatPromptCopyBudgetConfirmation(context, { selectedCount: 1, maxSourceAnchorsPerCard: 2 })).toBeUndefined();
    expect(summarizePromptCopyOmissions(context, { maxSourceAnchorsPerCard: 2 })).toEqual({
      omittedCardCount: 0,
      omittedSourceAnchorCount: 0
    });
  });

  it("formats a safe confirmation for omitted cards and source anchors", () => {
    const context = promptContext({
      includedCards: [
        card({
          id: "included",
          title: "Secret title should not appear",
          sourceAnchors: [
            { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" },
            { id: "anchor-2", archiveId: "archive-1", turnId: "turn-2" },
            { id: "anchor-3", archiveId: "archive-1", turnId: "turn-3" }
          ]
        })
      ],
      omittedCards: [card({ id: "omitted", title: "Omitted private strategy" })],
      truncated: true,
      length: 500,
      maxLength: 500
    });

    const message = formatPromptCopyBudgetConfirmation(context, {
      selectedCount: 2,
      maxSourceAnchorsPerCard: 2
    });

    expect(message).toContain("include 1 of 2 selected memory cards");
    expect(message).toContain("Prompt budget: 500/500 characters");
    expect(message).toContain("omit 1 memory card");
    expect(message).toContain("omit 1 extra source anchor");
    expect(message).toContain("Continue copying?");
    expect(message).not.toContain("Secret title should not appear");
    expect(message).not.toContain("Omitted private strategy");
  });

  it("reports prompt copy result omissions without leaking card content", () => {
    const context = promptContext({
      includedCards: [
        card({
          id: "included",
          sourceAnchors: [
            { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" },
            { id: "anchor-2", archiveId: "archive-1", turnId: "turn-2" },
            { id: "anchor-3", archiveId: "archive-1", turnId: "turn-3" }
          ]
        })
      ],
      omittedCards: [card({ id: "omitted", body: "Private omitted text." })]
    });

    const message = formatPromptCopyResultMessage(context, { maxSourceAnchorsPerCard: 1 });

    expect(message).toBe("Copied 1 memory card; omitted 1 card to stay within the prompt budget; omitted 2 extra source anchors.");
    expect(message).not.toContain("Private omitted text");
  });

  it("reports when copied prompt text was trimmed without leaking content", () => {
    const context = promptContext({
      text: "Relevant Context\nSecret launch note should not appear in feedback...",
      includedCards: [card({ id: "included", body: "Secret launch note should not appear in feedback." })],
      omittedCards: [],
      truncated: true,
      length: 80,
      maxLength: 80
    });

    const message = formatPromptCopyResultMessage(context, { maxSourceAnchorsPerCard: 2 });

    expect(message).toBe("Copied 1 memory card; trimmed text to fit the prompt budget.");
    expect(message).not.toContain("Secret launch note");
  });

  it("counts only valid source anchors when summarizing prompt copy omissions", () => {
    const context = promptContext({
      includedCards: [
        {
          ...card({ id: "included" }),
          sourceAnchors: [
            { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" },
            "not-an-anchor",
            { id: "anchor-2", archiveId: "archive-1", turnId: "turn-2" }
          ]
        } as unknown as MemoryCard
      ]
    });

    expect(summarizePromptCopyOmissions(context, { maxSourceAnchorsPerCard: 1 })).toEqual({
      omittedCardCount: 0,
      omittedSourceAnchorCount: 1
    });
  });
});
