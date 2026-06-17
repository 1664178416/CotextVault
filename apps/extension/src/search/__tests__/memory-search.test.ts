import { describe, expect, it } from "vitest";
import type { MemoryCard } from "@contextvault/shared";
import { rankMemoryCards } from "../memory-search";

function card(overrides: Partial<MemoryCard>): MemoryCard {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? "project_fact",
    title: overrides.title ?? "Untitled",
    body: overrides.body ?? "No body",
    status: overrides.status ?? "accepted",
    scope: overrides.scope ?? "conversation",
    sensitivity: overrides.sensitivity ?? "normal",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-06-07T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-07T00:00:00.000Z",
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

describe("memory search", () => {
  it("ranks title matches ahead of body-only matches", () => {
    const results = rankMemoryCards(
      [
        card({ id: "body", title: "Storage choice", body: "Use Side Panel for capture review." }),
        card({ id: "title", title: "Side Panel decision", body: "Review UI choice." })
      ],
      "side panel",
      { status: "accepted" }
    );

    expect(results[0]?.card.id).toBe("title");
  });

  it("filters by card status", () => {
    const results = rankMemoryCards(
      [
        card({ id: "accepted", status: "accepted", title: "ChatGPT adapter" }),
        card({ id: "proposed", status: "proposed", title: "ChatGPT adapter" })
      ],
      "chatgpt",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["accepted"]);
  });

  it("filters by memory type even when the query is empty", () => {
    const results = rankMemoryCards(
      [
        card({ id: "decision", type: "decision", title: "Use Side Panel" }),
        card({ id: "todo", type: "todo", title: "Build Gemini adapter" }),
        card({ id: "preference", type: "preference", title: "Prefer local-first capture" })
      ],
      "",
      { status: "accepted", memoryType: "todo" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["todo"]);
  });

  it("filters by memory scope even when the query is empty", () => {
    const results = rankMemoryCards(
      [
        card({ id: "conversation", scope: "conversation", title: "Conversation-only context" }),
        card({ id: "project", scope: "project", title: "Project context" }),
        card({ id: "global", scope: "global", title: "Global preference" })
      ],
      "",
      { status: "accepted", memoryScope: "project" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["project"]);
  });

  it("combines memory type and scope filters", () => {
    const results = rankMemoryCards(
      [
        card({ id: "project-decision", type: "decision", scope: "project", title: "Side Panel decision" }),
        card({ id: "global-decision", type: "decision", scope: "global", title: "Side Panel decision" }),
        card({ id: "project-todo", type: "todo", scope: "project", title: "Side Panel task" })
      ],
      "side panel",
      { status: "accepted", memoryType: "decision", memoryScope: "project" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["project-decision"]);
  });

  it("searches structured metadata such as scope, owner, and due date", () => {
    const [ownerResult] = rankMemoryCards(
      [
        card({
          id: "todo",
          type: "todo",
          scope: "project",
          owner: "wyh",
          dueAt: "2026-06-09T00:00:00.000Z",
          title: "Implement Gemini adapter"
        })
      ],
      "wyh 2026-06-09 project",
      { status: "accepted" }
    );

    expect(ownerResult?.card.id).toBe("todo");
    expect(ownerResult?.matchedFields).toContain("metadata");
    expect(ownerResult?.snippets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "metadata",
          text: "scope=project owner=wyh due=2026-06-09T00:00:00.000Z"
        })
      ])
    );
  });

  it("normalizes common search punctuation for tags, types, and metadata", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "decision",
          type: "decision",
          scope: "project",
          title: "Use Side Panel",
          tags: ["chatgpt", "recall"]
        }),
        card({
          id: "todo",
          type: "todo",
          scope: "conversation",
          title: "Build importer",
          tags: ["import"]
        })
      ],
      "#chatgpt type:decision scope\uFF1Aproject",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["decision"]);
    expect(results[0]?.matchedFields).toContain("metadata");
  });

  it("normalizes full-width recall punctuation between query terms", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "target",
          title: "侧边栏 决策",
          body: "使用 side panel 做记忆审核。",
          tags: ["review"]
        }),
        card({
          id: "other",
          title: "Importer",
          body: "Build export import support.",
          tags: ["import"]
        })
      ],
      "侧边栏、review！",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["target"]);
    expect(results[0]?.matchedFields).toEqual(expect.arrayContaining(["title", "metadata"]));
  });

  it("matches simple English inflections without hiding the original query terms", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "target",
          title: "Adapter roadmap",
          body: "Captured conversations are reviewed before saving reusable memory."
        }),
        card({
          id: "other",
          title: "Importer",
          body: "Build official export support."
        })
      ],
      "adapters capture reviewing memories",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["target"]);
    expect(results[0]?.matchedFields).toEqual(expect.arrayContaining(["title", "body"]));
    expect(results[0]?.snippets.flatMap((snippet) => snippet.matchedTerms)).toEqual(
      expect.arrayContaining(["adapters", "capture", "reviewing", "memories"])
    );
  });

  it("does not index stale todo metadata on non-todo cards", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "decision",
          type: "decision",
          scope: "project",
          owner: "wyh",
          dueAt: "2026-06-09T00:00:00.000Z",
          title: "Use Side Panel"
        })
      ],
      "wyh 2026-06-09",
      { status: "accepted" }
    );

    expect(results).toEqual([]);
  });

  it("keeps sensitive matches discoverable after privacy downranking", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "secret",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
          sensitivity: "secret"
        })
      ],
      "api_key",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["secret"]);
  });

  it("redacts snippets for sensitive and secret cards while keeping them searchable", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "secret",
          type: "todo",
          title: "Credential for alice@example.com",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
          owner: "alice@example.com",
          tags: ["alice@example.com"],
          sensitivity: "secret"
        })
      ],
      "api_key alice@example.com owner",
      { status: "accepted" }
    );

    const snippetText = result?.snippets.map((snippet) => snippet.text).join("\n") ?? "";

    expect(result?.card.id).toBe("secret");
    expect(snippetText).toContain("[REDACTED_EMAIL]");
    expect(snippetText).toContain("api_key=[REDACTED_SECRET]");
    expect(snippetText).toContain("owner=[REDACTED_EMAIL]");
    expect(snippetText).not.toContain("alice@example.com");
    expect(snippetText).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("returns search snippets for matched fields", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "workflow",
          type: "method",
          title: "Workflow checklist",
          body: "Capture raw turns, review source-grounded cards, search accepted memory, and copy prompt-ready context.",
          tags: ["chatgpt", "recall"]
        })
      ],
      "workflow accepted recall method",
      { status: "accepted" }
    );

    expect(result?.snippets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", text: "Workflow checklist" }),
        expect.objectContaining({ field: "body" }),
        expect.objectContaining({ field: "tags", text: "chatgpt, recall" }),
        expect.objectContaining({ field: "type", text: "method" })
      ])
    );
  });

  it("searches malformed local memory cards through safe read fallbacks", () => {
    const results = rankMemoryCards(
      [
        {
          ...card({ id: "malformed" }),
          title: 42,
          body: "Recoverable local card body.",
          status: "unknown-status",
          scope: "unknown-scope",
          tags: ["valid", 42]
        } as unknown as MemoryCard
      ],
      "recoverable valid",
      { status: "proposed", memoryScope: "conversation" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["malformed"]);
    expect(results[0]?.card).toMatchObject({
      title: "Untitled memory",
      status: "proposed",
      scope: "conversation",
      tags: ["valid"]
    });
  });

  it("does not create snippets for empty-query result lists", () => {
    const [result] = rankMemoryCards([card({ id: "decision", title: "Use Side Panel" })], "", {
      status: "accepted"
    });

    expect(result?.snippets).toEqual([]);
  });

  it("treats field-only or punctuation-only queries as recall lists", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "old",
          acceptedAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z"
        }),
        card({
          id: "new",
          acceptedAt: "2026-06-08T01:00:00.000Z",
          updatedAt: "2026-06-08T01:00:00.000Z"
        })
      ],
      "# type: scope: ！！！",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["new", "old"]);
    expect(results.every((result) => result.snippets.length === 0)).toBe(true);
  });

  it("orders empty-query recall results by acceptedAt and updatedAt", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "old-accepted",
          status: "accepted",
          acceptedAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T05:00:00.000Z"
        }),
        card({
          id: "recent-accepted",
          status: "accepted",
          acceptedAt: "2026-06-08T06:00:00.000Z",
          updatedAt: "2026-06-08T01:00:00.000Z"
        }),
        card({
          id: "accepted-without-accepted-at",
          status: "accepted",
          updatedAt: "2026-06-08T03:00:00.000Z"
        })
      ],
      "",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual([
      "recent-accepted",
      "accepted-without-accepted-at",
      "old-accepted"
    ]);
  });

  it("uses recall ordering as a tie-breaker for non-empty search results", () => {
    const results = rankMemoryCards(
      [
        card({
          id: "newer-updated",
          body: "recall context",
          acceptedAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T05:00:00.000Z"
        }),
        card({
          id: "newer-accepted",
          body: "recall context",
          acceptedAt: "2026-06-08T06:00:00.000Z",
          updatedAt: "2026-06-08T01:00:00.000Z"
        })
      ],
      "recall",
      { status: "accepted" }
    );

    expect(results.map((result) => result.card.id)).toEqual(["newer-accepted", "newer-updated"]);
  });

  it("redacts snippets when stored sensitivity labels are stale", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "stale-sensitive",
          sensitivity: "normal",
          body: "Contact alice@example.com before launch."
        })
      ],
      "alice@example.com",
      { status: "accepted" }
    );

    expect(result?.card.id).toBe("stale-sensitive");
    expect(result?.snippets[0]?.text).toContain("[REDACTED_EMAIL]");
    expect(result?.snippets[0]?.text).not.toContain("alice@example.com");
  });

  it("masks snippets for protected cards when no specific redaction pattern matches", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "protected",
          sensitivity: "secret",
          body: "Private launch strategy codename Bluebird."
        })
      ],
      "Bluebird",
      { status: "accepted" }
    );

    expect(result?.card.id).toBe("protected");
    expect(result?.snippets[0]?.text).toBe("[REDACTED_SECRET_CONTENT]");
    expect(result?.snippets[0]?.text).not.toContain("Bluebird");
  });

  it("masks protected owner and tag snippets when no specific redaction pattern matches", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "protected-metadata",
          type: "todo",
          scope: "project",
          owner: "Bluebird owner",
          tags: ["Bluebird"],
          sensitivity: "secret",
          title: "Private launch task",
          body: "Confirm the launch checklist."
        })
      ],
      "Bluebird owner project",
      { status: "accepted" }
    );

    const snippetText = result?.snippets.map((snippet) => snippet.text).join("\n") ?? "";

    expect(result?.card.id).toBe("protected-metadata");
    expect(result?.matchedFields).toContain("metadata");
    expect(snippetText).toContain("scope=project");
    expect(snippetText).toContain("owner=[REDACTED_SECRET_CONTENT]");
    expect(snippetText).toContain("[REDACTED_SECRET_CONTENT]");
    expect(snippetText).not.toContain("Bluebird");
  });

  it("returns visible matched terms for search explainability", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "workflow",
          title: "Workflow checklist",
          body: "Copy prompt-ready recall context.",
          tags: ["recall"]
        })
      ],
      "workflow recall",
      { status: "accepted" }
    );

    expect(result?.snippets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", matchedTerms: ["workflow"] }),
        expect.objectContaining({ field: "tags", matchedTerms: ["recall"] })
      ])
    );
  });

  it("redacts sensitive matched terms before returning snippets", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "secret",
          type: "todo",
          title: "Credential for alice@example.com",
          body: "api_key = sk-abcdefghijklmnopqrstuvwxyz123456",
          owner: "alice@example.com",
          tags: ["alice@example.com"],
          sensitivity: "secret"
        })
      ],
      "alice@example.com sk-abcdefghijklmnopqrstuvwxyz123456",
      { status: "accepted" }
    );

    const matchedTerms = result?.snippets.flatMap((snippet) => snippet.matchedTerms).join("\n") ?? "";

    expect(matchedTerms).toContain("[REDACTED_EMAIL]");
    expect(matchedTerms).toContain("[REDACTED_OPENAI_KEY]");
    expect(matchedTerms).not.toContain("alice@example.com");
    expect(matchedTerms).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("masks matched terms that are hidden by protected snippets", () => {
    const [result] = rankMemoryCards(
      [
        card({
          id: "protected",
          sensitivity: "secret",
          body: "Private launch strategy codename Bluebird."
        })
      ],
      "Bluebird",
      { status: "accepted" }
    );

    expect(result?.snippets[0]?.text).toBe("[REDACTED_SECRET_CONTENT]");
    expect(result?.snippets[0]?.matchedTerms).toEqual(["[REDACTED_SECRET_CONTENT]"]);
  });

  it("limits matched terms per snippet and truncates long visible terms", () => {
    const longTerm = "a".repeat(65);
    const queryTerms = [longTerm, "b", "c", "d", "e"];
    const [result] = rankMemoryCards(
      [
        card({
          id: "dense",
          title: queryTerms.join(" ")
        })
      ],
      queryTerms.join(" "),
      { status: "accepted" }
    );

    expect(result?.snippets[0]?.matchedTerms).toHaveLength(4);
    expect(result?.snippets[0]?.matchedTerms[0]).toHaveLength(64);
    expect(result?.snippets[0]?.matchedTerms[0]).toMatch(/\.\.\.$/);
  });
});
