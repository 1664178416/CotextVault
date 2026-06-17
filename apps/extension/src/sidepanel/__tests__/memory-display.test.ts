import { describe, expect, it } from "vitest";
import type { CaptureWarning, MemoryCard, SourceTurn } from "@contextvault/shared";
import { getMemoryCardPreview, getSourceTurnPreview, resolveVisibleAnchorSpan } from "../memory-display";

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "ContextVault credential",
    body: overrides.body ?? "Use local-first storage.",
    status: overrides.status ?? "accepted",
    scope: overrides.scope ?? "conversation",
    sensitivity: overrides.sensitivity ?? "normal",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-06-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-08T00:00:00.000Z",
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

describe("side panel memory display", () => {
  it("leaves normal memory previews readable", () => {
    const preview = getMemoryCardPreview(card({ body: "Use source-grounded memory cards." }));

    expect(preview).toMatchObject({
      body: "Use source-grounded memory cards.",
      metadata: ["scope:conversation"],
      isProtected: false
    });
  });

  it("shows card scope and todo metadata in memory previews", () => {
    const preview = getMemoryCardPreview(
      card({
        type: "todo",
        scope: "project",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z"
      })
    );

    expect(preview.metadata).toEqual(["scope:project", "owner:wyh", "due:2026-06-09"]);
  });

  it("hides stale todo metadata from non-todo memory previews", () => {
    const preview = getMemoryCardPreview(
      card({
        type: "decision",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z"
      })
    );

    expect(preview.metadata).toEqual(["scope:conversation"]);
  });

  it("redacts sensitive and secret memory previews by default", () => {
    const preview = getMemoryCardPreview(
      card({
        type: "todo",
        title: "Credential for alice@example.com",
        body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
        owner: "alice@example.com",
        tags: ["alice@example.com"],
        sensitivity: "secret"
      })
    );

    expect(preview.isProtected).toBe(true);
    expect(preview.protectionLabel).toContain("Secret content");
    expect(preview.title).toContain("[REDACTED_EMAIL]");
    expect(preview.body).toContain("api_key=[REDACTED_SECRET]");
    expect(preview.metadata).toContain("owner:[REDACTED_EMAIL]");
    expect(preview.tags[0]).toBe("[REDACTED_EMAIL]");
    expect(JSON.stringify(preview)).not.toContain("alice@example.com");
    expect(JSON.stringify(preview)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("protects stale normal-labeled memory previews when current content is sensitive", () => {
    const preview = getMemoryCardPreview(
      card({
        title: "Contact",
        body: "Contact alice@example.com before launch.",
        sensitivity: "normal"
      })
    );

    expect(preview.isProtected).toBe(true);
    expect(preview.body).toContain("[REDACTED_EMAIL]");
    expect(JSON.stringify(preview)).not.toContain("alice@example.com");
  });

  it("renders malformed local memory cards through safe preview fallbacks", () => {
    const preview = getMemoryCardPreview(
      {
        ...card(),
        title: 42,
        body: "Recoverable local preview.",
        scope: "unknown-scope",
        owner: 42,
        tags: ["valid", 42]
      } as unknown as MemoryCard
    );

    expect(preview).toMatchObject({
      title: "Untitled memory",
      body: "Recoverable local preview.",
      tags: ["valid"],
      metadata: ["scope:conversation"],
      isProtected: false
    });
  });

  it("uses effective secret sensitivity for stale normal-labeled memory preview labels", () => {
    const preview = getMemoryCardPreview(
      card({
        body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
        sensitivity: "normal"
      })
    );

    expect(preview.isProtected).toBe(true);
    expect(preview.protectionLabel).toContain("Secret content");
    expect(preview.body).toContain("api_key=[REDACTED_SECRET]");
    expect(JSON.stringify(preview)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("masks protected memory previews when labels are sensitive but patterns are unknown", () => {
    const preview = getMemoryCardPreview(
      card({
        type: "todo",
        title: "Private launch strategy",
        body: "Codename Bluebird should stay private.",
        owner: "Bluebird owner",
        tags: ["Bluebird"],
        sensitivity: "secret"
      })
    );

    expect(preview.isProtected).toBe(true);
    expect(preview.title).toBe("[REDACTED_SECRET_CONTENT]");
    expect(preview.body).toBe("[REDACTED_SECRET_CONTENT]");
    expect(preview.tags).toEqual(["[REDACTED_SECRET_CONTENT]"]);
    expect(preview.metadata).toContain("owner:[REDACTED_SECRET_CONTENT]");
    expect(JSON.stringify(preview)).not.toContain("Bluebird");
  });

  it("reveals the original preview only after explicit user action", () => {
    const preview = getMemoryCardPreview(
      card({
        body: "Contact alice@example.com before launch.",
        sensitivity: "sensitive"
      }),
      { revealSensitive: true }
    );

    expect(preview.body).toBe("Contact alice@example.com before launch.");
    expect(preview.protectionLabel).toBeUndefined();
  });

  it("redacts source turns by default when an archive contains sensitive content", () => {
    const turn = sourceTurn({
      text: "Contact alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456."
    });
    const warnings: CaptureWarning[] = [
      {
        code: "secret_content_detected",
        message: "Captured archive appears to contain secrets."
      }
    ];
    const preview = getSourceTurnPreview(turn, warnings);

    expect(preview.isProtected).toBe(true);
    expect(preview.protectionLabel).toContain("Secret content");
    expect(preview.text).toContain("[REDACTED_EMAIL]");
    expect(preview.text).toContain("api_key=[REDACTED_SECRET]");
    expect(preview.text).not.toContain("alice@example.com");
    expect(preview.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("uses archive-level secret warnings for source preview labels", () => {
    const turn = sourceTurn({
      text: "This turn is ordinary but belongs to a protected archive."
    });
    const preview = getSourceTurnPreview(turn, [
      {
        code: "secret_content_detected",
        message: "Another turn in this archive appears to contain secrets."
      }
    ]);

    expect(preview.isProtected).toBe(true);
    expect(preview.protectionLabel).toContain("Secret content");
    expect(preview.text).toBe("[REDACTED_SECRET_CONTENT]");
    expect(preview.text).not.toContain("ordinary");
  });

  it("can reveal original source turn text after explicit user action", () => {
    const turn = sourceTurn({
      text: "Contact alice@example.com before launch."
    });
    const preview = getSourceTurnPreview(turn, [], { revealSensitive: true });

    expect(preview.isProtected).toBe(true);
    expect(preview.text).toBe("Contact alice@example.com before launch.");
    expect(preview.protectionLabel).toBeUndefined();
  });

  it("resolves source anchor spans for normal visible source text", () => {
    expect(
      resolveVisibleAnchorSpan(
        "Use local-first storage for ContextVault.",
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "local-first storage"
        },
        { isProtected: false, revealSensitive: false }
      )
    ).toEqual({ start: 4, end: 23 });
  });

  it("does not resolve source anchor spans while protected source text is redacted", () => {
    const anchor = {
      id: "anchor-1",
      archiveId: "archive-1",
      turnId: "turn-1",
      quote: "alice@example.com"
    };

    expect(
      resolveVisibleAnchorSpan("Contact [REDACTED_EMAIL].", anchor, {
        isProtected: true,
        revealSensitive: false
      })
    ).toBeUndefined();
    expect(
      resolveVisibleAnchorSpan("Contact alice@example.com.", anchor, {
        isProtected: true,
        revealSensitive: true
      })
    ).toEqual({ start: 8, end: 25 });
  });
});

function sourceTurn(overrides: Partial<SourceTurn> = {}): SourceTurn {
  return {
    id: overrides.id ?? "turn-1",
    archiveId: overrides.archiveId ?? "archive-1",
    role: overrides.role ?? "assistant",
    text: overrides.text ?? "Use local-first storage.",
    orderIndex: overrides.orderIndex ?? 0,
    contentHash: overrides.contentHash ?? "turn-hash",
    sourceSelector: overrides.sourceSelector
  };
}
