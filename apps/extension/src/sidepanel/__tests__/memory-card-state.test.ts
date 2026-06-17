import { describe, expect, it } from "vitest";
import type { MemoryCard } from "@contextvault/shared";
import { formatMemoryCardDeleteConfirmation } from "../memory-card-state";

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "Use source-grounded memory",
    body: overrides.body ?? "Keep every memory linked to source turns.",
    status: overrides.status ?? "accepted",
    scope: overrides.scope ?? "conversation",
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

describe("side panel memory card state", () => {
  it("warns when deleting an accepted long-term memory", () => {
    const message = formatMemoryCardDeleteConfirmation(card({ type: "decision", status: "accepted" }));

    expect(message).toContain("Type:");
    expect(message).toContain("Status: accepted");
    expect(message).toContain("Sources: 1 anchor(s) across 1 archive(s)");
    expect(message).toContain("accepted long-term memory");
    expect(message).toContain("Raw source archives and source turns remain unless deleted separately.");
  });

  it("summarizes source anchors and distinct archives in delete confirmations", () => {
    const message = formatMemoryCardDeleteConfirmation(
      card({
        sourceAnchors: [
          { id: "anchor-1", archiveId: "archive-1", turnId: "turn-1" },
          { id: "anchor-2", archiveId: "archive-1", turnId: "turn-2" },
          { id: "anchor-3", archiveId: "archive-2", turnId: "turn-3" }
        ]
      })
    );

    expect(message).toContain("Sources: 3 anchor(s) across 2 archive(s)");
  });

  it("summarizes only valid source anchors when delete confirmations see malformed cards", () => {
    const message = formatMemoryCardDeleteConfirmation(
      {
        ...card(),
        sourceAnchors: [
          { id: "anchor-valid", archiveId: "archive-1", turnId: "turn-1" },
          "not-an-anchor",
          { id: "anchor-bad", archiveId: "archive-2", turnId: 42 }
        ]
      } as unknown as MemoryCard
    );

    expect(message).toContain("Sources: 1 anchor(s) across 1 archive(s)");
  });

  it("formats delete confirmations for malformed local memory cards through safe fallbacks", () => {
    const message = formatMemoryCardDeleteConfirmation(
      {
        ...card(),
        title: 42,
        type: "unknown-type",
        status: "unknown-status",
        sensitivity: "unknown-sensitivity",
        sourceAnchors: "not-anchors"
      } as unknown as MemoryCard
    );

    expect(message).toContain("Title: Untitled memory");
    expect(message).toContain("Status: proposed");
    expect(message).toContain("Sources: 0 anchor(s) across 0 archive(s)");
  });

  it("redacts protected card titles in delete confirmations", () => {
    const message = formatMemoryCardDeleteConfirmation(
      card({
        title: "Credential for alice@example.com",
        sensitivity: "secret"
      })
    );

    expect(message).toContain("Credential for [REDACTED_EMAIL]");
    expect(message).toContain("Sensitivity: secret");
    expect(message).toContain("protected content");
    expect(message).not.toContain("alice@example.com");
  });

  it("masks protected card titles in delete confirmations when patterns are unknown", () => {
    const message = formatMemoryCardDeleteConfirmation(
      card({
        title: "Private Bluebird plan",
        sensitivity: "secret"
      })
    );

    expect(message).toContain("Title: [REDACTED_SECRET_CONTENT]");
    expect(message).toContain("Sensitivity: secret");
    expect(message).not.toContain("Bluebird");
  });

  it("redacts card titles when sensitivity labels are stale", () => {
    const message = formatMemoryCardDeleteConfirmation(
      card({
        title: "Credential for alice@example.com",
        sensitivity: "normal"
      })
    );

    expect(message).toContain("Credential for [REDACTED_EMAIL]");
    expect(message).not.toContain("alice@example.com");
  });

  it("shows effective secret sensitivity in delete confirmations when labels are stale", () => {
    const message = formatMemoryCardDeleteConfirmation(
      card({
        title: "Credential",
        body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
        sensitivity: "normal"
      })
    );

    expect(message).toContain("Sensitivity: secret");
    expect(message).toContain("protected content");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("keeps normal proposed-card delete confirmations concise", () => {
    const message = formatMemoryCardDeleteConfirmation(card({ status: "proposed" }));

    expect(message).toContain("Status: proposed");
    expect(message).toContain("Raw source archives and source turns remain unless deleted separately.");
    expect(message).not.toContain("accepted long-term memory");
    expect(message).not.toContain("protected content");
  });
});
