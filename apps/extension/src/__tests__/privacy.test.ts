import { describe, expect, it } from "vitest";
import {
  classifySensitivity,
  containsSecret,
  formatSensitivitySummary,
  redactProtectedText,
  redactSensitiveText,
  summarizeMemorySensitivity,
  type MemoryCard
} from "@contextvault/shared";

function card(overrides: Partial<MemoryCard>): MemoryCard {
  return {
    id: overrides.id ?? "card-1",
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "ContextVault",
    body: overrides.body ?? "Use local-first storage.",
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

describe("privacy classification", () => {
  it("detects obvious API keys and credentials as secrets", () => {
    expect(classifySensitivity("api_key = sk-abcdefghijklmnopqrstuvwxyz123456")).toBe("secret");
    expect(containsSecret("password: correct-horse-battery-staple")).toBe(true);
  });

  it("detects personal contact data as sensitive", () => {
    expect(classifySensitivity("Contact alice@example.com before launch.")).toBe("sensitive");
  });

  it("keeps ordinary project context normal", () => {
    expect(classifySensitivity("Use the side panel for the review workflow.")).toBe("normal");
  });

  it("summarizes memory card sensitivity before disclosure", () => {
    const summary = summarizeMemorySensitivity([
      card({ id: "normal", sensitivity: "normal" }),
      card({ id: "sensitive", sensitivity: "sensitive" }),
      card({ id: "secret", sensitivity: "secret" })
    ]);

    expect(summary).toEqual({
      normal: 1,
      sensitive: 1,
      secret: 1
    });
    expect(formatSensitivitySummary(summary)).toBe("1 secret, 1 sensitive, 1 normal");
  });

  it("summarizes current card content when sensitivity labels are stale", () => {
    const summary = summarizeMemorySensitivity([
      card({ id: "stale-sensitive", sensitivity: "normal", body: "Contact alice@example.com before launch." }),
      card({ id: "stale-secret", sensitivity: "normal", body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456" })
    ]);

    expect(summary).toEqual({
      normal: 0,
      sensitive: 1,
      secret: 1
    });
  });

  it("summarizes malformed local memory cards without throwing", () => {
    const summary = summarizeMemorySensitivity([
      {
        ...card({ id: "malformed" }),
        title: 42,
        body: "Contact alice@example.com before launch.",
        sensitivity: "unknown",
        tags: "not-tags"
      } as unknown as MemoryCard
    ]);

    expect(summary).toEqual({
      normal: 0,
      sensitive: 1,
      secret: 0
    });
  });

  it("redacts common secret and sensitive values for safer exports", () => {
    const redacted = redactSensitiveText(
      "Contact alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456 and card 1234567812345678."
    );

    expect(redacted).toContain("[REDACTED_EMAIL]");
    expect(redacted).toContain("api_key=[REDACTED_SECRET]");
    expect(redacted).toContain("[REDACTED_CARD]");
    expect(redacted).not.toContain("alice@example.com");
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(redacted).not.toContain("1234567812345678");
  });

  it("uses a generic placeholder when protected text has no recognizable secret pattern", () => {
    expect(redactProtectedText("Private launch strategy codename Bluebird", "secret")).toBe(
      "[REDACTED_SECRET_CONTENT]"
    );
    expect(redactProtectedText("Private launch strategy codename Bluebird", "sensitive")).toBe(
      "[REDACTED_SENSITIVE_CONTENT]"
    );
    expect(redactProtectedText("Contact alice@example.com", "sensitive")).toBe("Contact [REDACTED_EMAIL]");
  });
});
