import { describe, expect, it } from "vitest";
import { MAX_MEMORY_CARD_OWNER_LENGTH, MAX_MEMORY_CARD_TAG_COUNT, MAX_MEMORY_CARD_TAG_LENGTH, type MemoryCard } from "@contextvault/shared";
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
  parseMemoryTagInput
} from "../review-state";

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "ContextVault",
    body: overrides.body ?? "Use source-grounded memories.",
    status: overrides.status ?? "proposed",
    scope: overrides.scope ?? "conversation",
    sensitivity: overrides.sensitivity ?? "normal",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-06-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-08T00:00:00.000Z",
    acceptedAt: overrides.acceptedAt,
    dueAt: overrides.dueAt,
    owner: overrides.owner,
    sourceAnchors: overrides.sourceAnchors ?? [
      {
        id: "anchor-1",
        archiveId: "archive-1",
        turnId: "turn-1"
      }
    ]
  };
}

describe("side panel review state", () => {
  it("applies accepted and rejected review statuses with a single timestamp", () => {
    const now = "2026-06-08T00:01:00.000Z";
    const accepted = applyReviewStatus(card(), "accepted", now);
    const rejected = applyReviewStatus(card(), "rejected", now);

    expect(accepted).toMatchObject({
      status: "accepted",
      acceptedAt: now,
      updatedAt: now
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      updatedAt: now
    });
    expect(rejected.acceptedAt).toBeUndefined();
  });

  it("clears acceptedAt when a previously accepted draft is rejected", () => {
    const rejected = applyReviewStatus(
      card({
        status: "accepted",
        acceptedAt: "2026-06-08T00:00:00.000Z"
      }),
      "rejected",
      "2026-06-08T00:01:00.000Z"
    );

    expect(rejected.status).toBe("rejected");
    expect(rejected.acceptedAt).toBeUndefined();
  });

  it("classifies edited drafts instead of trusting stale sensitivity labels", () => {
    expect(
      classifyMemoryCardDraftSensitivity(
        card({
          sensitivity: "normal",
          owner: "alice@example.com"
        })
      )
    ).toBe("sensitive");
    expect(
      classifyMemoryCardDraftSensitivity(
        card({
          sensitivity: "normal",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
        })
      )
    ).toBe("secret");
  });

  it("preserves explicit protected draft sensitivity labels when patterns are unknown", () => {
    expect(
      classifyMemoryCardDraftSensitivity(
        card({
          title: "Private Bluebird plan",
          sensitivity: "secret"
        })
      )
    ).toBe("secret");
  });

  it("keeps owner and due date when the draft remains a todo", () => {
    const draft = applyMemoryCardTypeDraft(
      card({
        type: "todo",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z"
      }),
      "todo"
    );

    expect(draft.owner).toBe("wyh");
    expect(draft.dueAt).toBe("2026-06-09T00:00:00.000Z");
  });

  it("clears todo-only metadata when switching the draft to a non-todo type", () => {
    const draft = applyMemoryCardTypeDraft(
      card({
        type: "todo",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z"
      }),
      "decision"
    );

    expect(draft.type).toBe("decision");
    expect(draft.owner).toBeUndefined();
    expect(draft.dueAt).toBeUndefined();
  });

  it("parses comma separated tag drafts and deduplicates them case-insensitively", () => {
    expect(parseMemoryTagInput(" #ChatGPT, workflow\uFF0Cchatgpt\nreview; method\uFF1B#method ,,  ")).toEqual([
      "ChatGPT",
      "workflow",
      "review",
      "method"
    ]);
  });

  it("reports tag draft limits for manual and edited memory cards", () => {
    const tooManyTagText = Array.from({ length: MAX_MEMORY_CARD_TAG_COUNT + 1 }, (_, index) => `tag-${index}`).join(",");
    const tooManyTags = getMemoryTagDraftStatus(tooManyTagText);
    const oversizedTag = getMemoryTagDraftStatus("manual, " + "x".repeat(MAX_MEMORY_CARD_TAG_LENGTH + 1));
    const editedTags = getMemoryTagListStatus(["manual", "workflow"]);

    expect(tooManyTags).toMatchObject({
      hasTooManyTags: true,
      message: `Use ${MAX_MEMORY_CARD_TAG_COUNT} tags or fewer.`
    });
    expect(oversizedTag).toMatchObject({
      hasOversizedTag: true,
      message: `Tags must be ${MAX_MEMORY_CARD_TAG_LENGTH} characters or fewer.`
    });
    expect(editedTags).toMatchObject({
      tagCount: 2,
      hasTooManyTags: false,
      hasOversizedTag: false
    });
  });

  it("reports todo owner draft limits", () => {
    expect(getTodoOwnerDraftStatus(" wyh ")).toMatchObject({
      owner: "wyh",
      ownerLength: 3,
      isTooLong: false
    });
    expect(getTodoOwnerDraftStatus("x".repeat(MAX_MEMORY_CARD_OWNER_LENGTH + 1))).toMatchObject({
      ownerLength: MAX_MEMORY_CARD_OWNER_LENGTH + 1,
      isTooLong: true,
      message: `Owner must be ${MAX_MEMORY_CARD_OWNER_LENGTH} characters or fewer.`
    });
  });

  it("converts date input values to ISO dates used by memory cards", () => {
    expect(dateInputToIsoDate("2026-06-09")).toBe("2026-06-09T00:00:00.000Z");
    expect(dateInputToIsoDate("")).toBeUndefined();
    expect(isoDateToDateInput("2026-06-09T00:00:00.000Z")).toBe("2026-06-09");
    expect(isoDateToDateInput(undefined)).toBe("");
  });

  it("asks before accepting sensitive or secret draft cards", () => {
    const message = getReviewConfirmationMessage(
      [
        card({ id: "normal" }),
        card({ id: "sensitive", body: "Contact alice@example.com before launch." }),
        card({ id: "secret", body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456" }),
        card({ id: "unknown-secret", title: "Private Bluebird plan", sensitivity: "secret" })
      ],
      "accepted"
    );

    expect(message).toContain("Accept 4 proposed memory cards");
    expect(message).toContain("2 secret");
    expect(message).toContain("1 sensitive");
  });

  it("does not ask before accepting only normal drafts", () => {
    expect(getReviewConfirmationMessage([card()], "accepted")).toBeUndefined();
  });

  it("asks before rejecting multiple candidates but not a single candidate", () => {
    expect(getReviewConfirmationMessage([card()], "rejected")).toBeUndefined();
    expect(getReviewConfirmationMessage([card({ id: "one" }), card({ id: "two" })], "rejected")).toBe(
      "Reject 2 proposed memory cards?"
    );
  });
});
