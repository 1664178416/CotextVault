import { describe, expect, it } from "vitest";
import {
  buildMemoryCardsPromptContext,
  formatMemoryCardsAsMarkdown,
  formatMemoryCardsForPrompt,
  getMemoryScopeLabel,
  truncateText,
  type MemoryCard
} from "@contextvault/shared";

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: "card-1",
    type: "decision",
    title: "Use Side Panel",
    body: "Use Side Panel for capture and review.",
    status: "accepted",
    scope: "conversation",
    sensitivity: "normal",
    tags: ["chatgpt", "Context Vault"],
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    sourceAnchors: [
      {
        id: "anchor-1",
        archiveId: "archive-1",
        turnId: "turn-1",
        charStart: 0,
        charEnd: 15,
        quote: "Use Side Panel"
      }
    ],
    ...overrides
  };
}

describe("markdown formatting", () => {
  it("truncates compact display text within budget without splitting code points", () => {
    const character = String.fromCodePoint(0x1f642);
    const truncated = truncateText(`A${character}BC`, 4);

    expect(truncated).toBe("A...");
    expect(truncated).toHaveLength(4);
  });

  it("labels memory scopes for review UI controls", () => {
    expect(getMemoryScopeLabel("conversation")).toBe("对话");
    expect(getMemoryScopeLabel("project")).toBe("项目");
    expect(getMemoryScopeLabel("global")).toBe("全局");
  });

  it("formats prompt context with source anchors for traceability", () => {
    const prompt = formatMemoryCardsForPrompt([card()]);

    expect(prompt).toContain("Relevant Context:");
    expect(prompt).toContain("[决策记录] Use Side Panel: Use Side Panel for capture and review.");
    expect(prompt).toContain("Meta: scope=conversation tags=#chatgpt #Context-Vault");
    expect(prompt).toContain('Source: archive=archive-1 turn=turn-1 chars=0-15 quote="Use Side Panel"');
  });

  it("includes actionable metadata in prompt context when present", () => {
    const prompt = formatMemoryCardsForPrompt([
      card({
        type: "todo",
        title: "Implement Gemini adapter",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z",
        scope: "project",
        tags: ["adapter"]
      })
    ]);

    expect(prompt).toContain("Meta: scope=project tags=#adapter owner=wyh due=2026-06-09T00:00:00.000Z");
  });

  it("omits stale todo metadata from non-todo prompt context", () => {
    const prompt = formatMemoryCardsForPrompt([
      card({
        type: "decision",
        owner: "wyh",
        dueAt: "2026-06-09T00:00:00.000Z",
        scope: "project",
        tags: ["adapter"]
      })
    ]);

    expect(prompt).toContain("Meta: scope=project tags=#adapter");
    expect(prompt).not.toContain("owner=wyh");
    expect(prompt).not.toContain("due=2026-06-09T00:00:00.000Z");
  });

  it("exports memory cards as source-grounded Markdown", () => {
    const markdown = formatMemoryCardsAsMarkdown(
      [
        card({
          type: "todo",
          owner: "wyh",
          dueAt: "2026-06-09T00:00:00.000Z"
        })
      ],
      {
      exportedAt: "2026-06-08T00:00:00.000Z"
      }
    );

    expect(markdown).toContain("# ContextVault Memory Export");
    expect(markdown).toContain("## 待办事项");
    expect(markdown).toContain("### Use Side Panel");
    expect(markdown).toContain("- Owner: wyh");
    expect(markdown).toContain("- Due: 2026-06-09T00:00:00.000Z");
    expect(markdown).toContain("- Tags: #chatgpt #Context-Vault");
    expect(markdown).toContain('Source: archive=archive-1 turn=turn-1 chars=0-15 quote="Use Side Panel"');
  });

  it("omits stale todo metadata from non-todo Markdown exports", () => {
    const markdown = formatMemoryCardsAsMarkdown(
      [
        card({
          type: "decision",
          owner: "wyh",
          dueAt: "2026-06-09T00:00:00.000Z"
        })
      ],
      {
        exportedAt: "2026-06-08T00:00:00.000Z"
      }
    );

    expect(markdown).not.toContain("- Owner: wyh");
    expect(markdown).not.toContain("- Due: 2026-06-09T00:00:00.000Z");
  });

  it("handles empty exports explicitly", () => {
    expect(formatMemoryCardsAsMarkdown([])).toContain("No memory cards matched this export");
  });

  it("redacts sensitive values in prompt and Markdown exports when requested", () => {
    const sensitiveCard = card({
      title: "Credential for alice@example.com",
      body: "Use api_key = sk-abcdefghijklmnopqrstuvwxyz123456 for the test service.",
      sensitivity: "secret",
      tags: ["alice@example.com", "api_key=sk-abcdefghijklmnopqrstuvwxyz123456"],
      sourceAnchors: [
        {
          id: "anchor-secret",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
        }
      ]
    });
    const prompt = formatMemoryCardsForPrompt([sensitiveCard], { redactSensitive: true });
    const markdown = formatMemoryCardsAsMarkdown([sensitiveCard], { redactSensitive: true });

    expect(prompt).toContain("[REDACTED_EMAIL]");
    expect(prompt).toContain("api_key=[REDACTED_SECRET]");
    expect(prompt).toContain("tags=#REDACTED_EMAIL #api_key-REDACTED_SECRET");
    expect(prompt).not.toContain("alice@example.com");
    expect(prompt).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(markdown).toContain("api_key=[REDACTED_SECRET]");
    expect(markdown).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(markdown).not.toContain("alice@example.com");
  });

  it("redacts protected source anchor identifiers in prompt and Markdown output", () => {
    const sourceIdCard = card({
      sourceAnchors: [
        {
          id: "anchor-sensitive",
          archiveId: "archive-alice@example.com",
          turnId: "turn-sk-abcdefghijklmnopqrstuvwxyz123456",
          quote: "Use Side Panel"
        }
      ]
    });
    const prompt = formatMemoryCardsForPrompt([sourceIdCard]);
    const markdown = formatMemoryCardsAsMarkdown([sourceIdCard], {
      exportedAt: "2026-06-08T00:00:00.000Z"
    });

    expect(prompt).toContain("archive=[REDACTED_EMAIL]");
    expect(prompt).toContain("turn=turn-[REDACTED_OPENAI_KEY]");
    expect(prompt).not.toContain("alice@example.com");
    expect(prompt).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(markdown).toContain("archive=[REDACTED_EMAIL]");
    expect(markdown).toContain("turn=turn-[REDACTED_OPENAI_KEY]");
    expect(markdown).not.toContain("alice@example.com");
    expect(markdown).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("masks protected prompt and Markdown exports when no specific redaction pattern matches", () => {
    const protectedCard = card({
      type: "todo",
      title: "Private launch strategy",
      body: "Codename Bluebird should stay private.",
      sensitivity: "secret",
      owner: "Bluebird owner",
      tags: ["Bluebird"],
      sourceAnchors: [
        {
          id: "anchor-secret",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "Codename Bluebird"
        }
      ]
    });
    const prompt = formatMemoryCardsForPrompt([protectedCard], { redactSensitive: true });
    const markdown = formatMemoryCardsAsMarkdown([protectedCard], { redactSensitive: true });

    expect(prompt).toContain("[REDACTED_SECRET_CONTENT]");
    expect(markdown).toContain("[REDACTED_SECRET_CONTENT]");
    expect(prompt).not.toContain("Bluebird");
    expect(markdown).not.toContain("Bluebird");
    expect(prompt).not.toContain("Bluebird owner");
    expect(markdown).not.toContain("Bluebird owner");
  });

  it("builds prompt context within a copy budget and reports omitted cards", () => {
    const result = buildMemoryCardsPromptContext(
      [
        card({
          id: "recent",
          title: "Short decision",
          body: "Use source anchors."
        }),
        card({
          id: "large",
          title: "Large method",
          body: "A".repeat(500)
        })
      ],
      { maxLength: 260 }
    );

    expect(result.text.length).toBeLessThanOrEqual(260);
    expect(result.includedCards.map((includedCard) => includedCard.id)).toEqual(["recent"]);
    expect(result.omittedCards.map((omittedCard) => omittedCard.id)).toEqual(["large"]);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("Omitted 1 memory card");
  });

  it("keeps prompt budget output on whole-line boundaries when omission text would overflow", () => {
    const result = buildMemoryCardsPromptContext(
      [
        card({
          id: "recent",
          title: "Short decision",
          body: "Use source anchors."
        }),
        card({
          id: "large",
          title: "Large method",
          body: "A".repeat(500)
        })
      ],
      { maxLength: 210 }
    );

    expect(result.text.length).toBeLessThanOrEqual(210);
    expect(result.text).toContain("Relevant Context:");
    expect(result.text).toContain("[决策记录] Short decision: Use source anchors.");
    expect(result.text).not.toContain("prompt context budget was reached");
    expect(result.text).not.toContain("Omitted 1 memory card(s).");
    expect(result.truncated).toBe(true);
  });

  it("skips an oversized leading card and still includes later cards that fit", () => {
    const result = buildMemoryCardsPromptContext(
      [
        card({
          id: "too-large",
          title: "Large method",
          body: "A".repeat(500)
        }),
        card({
          id: "small",
          title: "Short decision",
          body: "Use source anchors."
        })
      ],
      { maxLength: 220 }
    );

    expect(result.includedCards.map((includedCard) => includedCard.id)).toEqual(["small"]);
    expect(result.omittedCards.map((omittedCard) => omittedCard.id)).toEqual(["too-large"]);
    expect(result.text).toContain("[决策记录] Short decision: Use source anchors.");
    expect(result.text).toContain("Omitted 1 memory card");
    expect(result.truncated).toBe(true);
  });

  it("can limit source anchors in prompt context without changing Markdown exports", () => {
    const manySourceCard = card({
      sourceAnchors: [
        {
          id: "anchor-1",
          archiveId: "archive-1",
          turnId: "turn-1",
          quote: "first source"
        },
        {
          id: "anchor-2",
          archiveId: "archive-1",
          turnId: "turn-2",
          quote: "second source"
        },
        {
          id: "anchor-3",
          archiveId: "archive-2",
          turnId: "turn-3",
          quote: "third source"
        }
      ]
    });
    const prompt = buildMemoryCardsPromptContext([manySourceCard], { maxSourceAnchorsPerCard: 2 }).text;
    const defaultPrompt = formatMemoryCardsForPrompt([manySourceCard]);
    const markdown = formatMemoryCardsAsMarkdown([manySourceCard], {
      exportedAt: "2026-06-08T00:00:00.000Z"
    });

    expect(prompt).toContain("turn=turn-1");
    expect(prompt).toContain("turn=turn-2");
    expect(prompt).not.toContain("turn=turn-3");
    expect(prompt).toContain("+1 more source anchor(s)");
    expect(defaultPrompt).toContain("turn=turn-3");
    expect(markdown).toContain("turn=turn-3");
  });

  it("omits malformed source anchors from prompt and Markdown exports", () => {
    const malformedCard = {
      ...card(),
      sourceAnchors: [
        { id: "anchor-valid", archiveId: "archive-1", turnId: "turn-1", quote: "valid source" },
        "not-an-anchor",
        { id: "anchor-bad", archiveId: "archive-2", turnId: 42 }
      ]
    } as unknown as MemoryCard;

    const prompt = formatMemoryCardsForPrompt([malformedCard]);
    const markdown = formatMemoryCardsAsMarkdown([malformedCard], {
      exportedAt: "2026-06-08T00:00:00.000Z"
    });

    expect(prompt).toContain('Source: archive=archive-1 turn=turn-1 quote="valid source"');
    expect(prompt).not.toContain("anchor-bad");
    expect(prompt).not.toContain("archive=archive-2");
    expect(markdown).toContain('Source: archive=archive-1 turn=turn-1 quote="valid source"');
    expect(markdown).not.toContain("anchor-bad");
    expect(markdown).not.toContain("archive=archive-2");
  });

  it("formats malformed local memory cards through safe read fallbacks", () => {
    const malformedCard = {
      ...card(),
      type: "unknown-type",
      title: 42,
      body: "Recoverable local card body.",
      status: "unknown-status",
      scope: "unknown-scope",
      sensitivity: "unknown-sensitivity",
      tags: ["valid", 42, "valid"],
      sourceAnchors: "not-anchors"
    } as unknown as MemoryCard;

    const prompt = formatMemoryCardsForPrompt([malformedCard]);
    const markdown = formatMemoryCardsAsMarkdown([malformedCard], {
      exportedAt: "2026-06-08T00:00:00.000Z"
    });

    expect(prompt).toContain("Untitled memory: Recoverable local card body.");
    expect(prompt).toContain("Meta: scope=conversation tags=#valid");
    expect(markdown).toContain("### Untitled memory");
    expect(markdown).toContain("Recoverable local card body.");
    expect(markdown).toContain("- Status: proposed");
    expect(markdown).toContain("- Scope: conversation");
    expect(markdown).toContain("- Tags: #valid");
  });

  it("uses effective sensitivity labels in Markdown exports when stored labels are stale", () => {
    const markdown = formatMemoryCardsAsMarkdown(
      [
        card({
          sensitivity: "normal",
          body: "Contact alice@example.com before launch."
        })
      ],
      { exportedAt: "2026-06-08T00:00:00.000Z" }
    );

    expect(markdown).toContain("- Sensitivity: sensitive");
  });
});
