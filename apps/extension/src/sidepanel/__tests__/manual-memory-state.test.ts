import { describe, expect, it } from "vitest";
import type { MemoryCard } from "@contextvault/shared";
import {
  classifyManualMemoryDraftSensitivity,
  formatManualMemoryCreatedMessage,
  getManualMemoryConfirmationMessage
} from "../manual-memory-state";

describe("manual memory state", () => {
  it("classifies manual memory draft sensitivity across title, body, owner, and tags", () => {
    expect(
      classifyManualMemoryDraftSensitivity({
        title: "Normal method",
        body: "Use manual memory when page capture is unavailable.",
        type: "method",
        scope: "project",
        tags: ["manual"]
      })
    ).toBe("normal");
    expect(
      classifyManualMemoryDraftSensitivity({
        title: "Follow up",
        body: "Discuss launch prep.",
        type: "todo",
        scope: "project",
        owner: "alice@example.com"
      })
    ).toBe("sensitive");
    expect(
      classifyManualMemoryDraftSensitivity({
        title: "Credential",
        body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
        type: "project_fact",
        scope: "conversation"
      })
    ).toBe("secret");
  });

  it("does not ask for confirmation on normal manual memory drafts", () => {
    expect(
      getManualMemoryConfirmationMessage({
        title: "Normal method",
        body: "Use manual memory when page capture is unavailable.",
        type: "method",
        scope: "project"
      })
    ).toBeUndefined();
  });

  it("asks before creating sensitive or secret manual memories as accepted cards", () => {
    expect(
      getManualMemoryConfirmationMessage({
        title: "Contact owner",
        body: "Contact alice@example.com before launch.",
        type: "todo",
        scope: "project"
      })
    ).toContain("1 sensitive");
    expect(
      getManualMemoryConfirmationMessage({
        title: "Credential",
        body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
        type: "project_fact",
        scope: "conversation"
      })
    ).toContain("1 secret");
  });

  it("formats created messages without leaking protected memory titles", () => {
    expect(formatManualMemoryCreatedMessage(card({ title: "Normal method" }))).toBe(
      "Created manual memory: Normal method"
    );
    expect(
      formatManualMemoryCreatedMessage(
        card({
          title: "Credential for alice@example.com",
          sensitivity: "secret"
        })
      )
    ).toContain("Credential for [REDACTED_EMAIL]");
    expect(
      formatManualMemoryCreatedMessage(
        card({
          title: "Credential for alice@example.com",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
          sensitivity: "normal"
        })
      )
    ).not.toContain("alice@example.com");
  });
});

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "Manual memory",
    body: overrides.body ?? "Use manual memory when page capture is unavailable.",
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
