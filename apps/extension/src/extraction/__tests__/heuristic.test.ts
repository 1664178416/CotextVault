import { describe, expect, it } from "vitest";
import type { ConversationCapture, SourceTurn } from "@contextvault/shared";
import { proposeMemoryCards } from "../heuristic";

const capture: ConversationCapture = {
  provider: "chatgpt",
  title: "ContextVault design",
  url: "https://chatgpt.com/c/example",
  capturedAt: "2026-06-07T00:00:00.000Z",
  captureMethod: "dom",
  turns: [],
  warnings: []
};

function turn(id: string, text: string): SourceTurn {
  return {
    id,
    archiveId: "archive-1",
    role: "assistant",
    text,
    orderIndex: 0,
    contentHash: `hash-${id}`
  };
}

function userTurn(id: string, text: string): SourceTurn {
  return {
    ...turn(id, text),
    role: "user"
  };
}

describe("heuristic memory extraction", () => {
  it("proposes source-grounded cards for reusable decisions and todos", () => {
    const cards = proposeMemoryCards(capture, [
      turn("turn-1", "建议使用 Chrome Side Panel 作为主 UI。下一步实现 ChatGPT adapter 并补齐测试。")
    ]);

    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.map((card) => card.type)).toContain("decision");
    expect(cards.map((card) => card.type)).toContain("todo");
    expect(cards.every((card) => card.sourceAnchors[0]?.archiveId === "archive-1")).toBe(true);
  });

  it("extracts real Chinese project memory and keeps readable generated titles", () => {
    const cards = proposeMemoryCards(capture, [
      turn(
        "turn-1",
        "建议使用 Side Panel 作为沉淀和审核主界面。下一步实现 Gemini adapter 并补齐端到端测试。复用流程：先归档原始对话，再抽取记忆卡，最后由用户确认入库。"
      )
    ]);

    expect(cards.map((card) => card.type)).toEqual(expect.arrayContaining(["decision", "todo", "method"]));
    expect(cards.every((card) => /^(决策|待办|方法)：/.test(card.title))).toBe(true);
    expect(cards.every((card) => !card.title.includes("truncateText"))).toBe(true);
    expect(cards.every((card) => card.sourceAnchors[0]?.quote && card.body.includes(card.sourceAnchors[0].quote))).toBe(
      true
    );
  });

  it("does not propose permanent memory cards from obvious secret snippets", () => {
    const cards = proposeMemoryCards(capture, [
      turn("turn-1", "下一步使用 api_key = sk-abcdefghijklmnopqrstuvwxyz123456 调用服务。")
    ]);

    expect(cards).toEqual([]);
  });

  it("classifies reusable workflows as methods before broad decision matches", () => {
    const cards = proposeMemoryCards(capture, [
      turn(
        "turn-1",
        "Workflow checklist: use raw capture, review source-grounded cards, search accepted memory, and copy prompt-ready context."
      )
    ]);

    expect(cards[0]?.type).toBe("method");
  });

  it("proposes assistant project facts even when the conversation also has decisions", () => {
    const cards = proposeMemoryCards(capture, [
      turn(
        "turn-1",
        "ContextVault is a local-first personal work memory system with reviewed cards and source anchors. Use Chrome Side Panel for review."
      )
    ]);

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project_fact",
          body: "ContextVault is a local-first personal work memory system with reviewed cards and source anchors.",
          sourceAnchors: [expect.objectContaining({ turnId: "turn-1" })]
        }),
        expect.objectContaining({
          type: "decision",
          body: "Use Chrome Side Panel for review."
        })
      ])
    );
  });

  it("classifies explicit user project goals as project facts before broad decisions", () => {
    const cards = proposeMemoryCards(capture, [
      userTurn(
        "turn-1",
        "The project goal is to use local-first storage and source anchors across all imported conversations."
      ),
      turn("turn-2", "I will keep the project goal visible in future memory extraction.")
    ]);

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project_fact",
          body: "The project goal is to use local-first storage and source anchors across all imported conversations.",
          sourceAnchors: [expect.objectContaining({ turnId: "turn-1" })]
        })
      ])
    );
  });

  it("extracts adjacent English sentences split by question and exclamation marks", () => {
    const cards = proposeMemoryCards(capture, [
      turn(
        "turn-1",
        "Use Chrome Side Panel for review!Next implement the Gemini adapter?Workflow checklist: capture, review, search, and copy context."
      )
    ]);

    expect(cards.map((card) => card.type)).toEqual(expect.arrayContaining(["decision", "todo", "method"]));
  });

  it("proposes explicit user preferences even when assistant turns exist", () => {
    const cards = proposeMemoryCards(capture, [
      userTurn("turn-1", "We prefer local-first storage and reviewed memory cards for this project."),
      turn("turn-2", "Acknowledged. I will keep that constraint in mind.")
    ]);

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "preference",
          body: "We prefer local-first storage and reviewed memory cards for this project.",
          sourceAnchors: [expect.objectContaining({ turnId: "turn-1" })]
        })
      ])
    );
  });

  it("does not propose memory cards from ordinary user questions", () => {
    const cards = proposeMemoryCards(capture, [
      userTurn("turn-1", "Can you explain how browser extension storage works for this project?"),
      turn("turn-2", "Use IndexedDB for local storage and keep source anchors.")
    ]);

    expect(cards.map((card) => card.sourceAnchors[0]?.turnId)).not.toContain("turn-1");
  });

  it("does not create fallback project facts from ordinary long chat text", () => {
    const cards = proposeMemoryCards(
      {
        ...capture,
        title: "Casual chat"
      },
      [
        turn(
          "turn-1",
          "This is a friendly general explanation with enough length to look substantial, but it does not include reusable project context or future work."
        )
      ]
    );

    expect(cards).toEqual([]);
  });

  it("keeps fallback project facts when the conversation has project memory signals", () => {
    const cards = proposeMemoryCards(
      {
        ...capture,
        title: "ContextVault MVP"
      },
      [
        turn(
          "turn-1",
          "ContextVault needs a reliable local archive with reviewed cards and source anchors so future sessions can recover the project background."
        )
      ]
    );

    expect(cards).toEqual([
      expect.objectContaining({
        type: "project_fact",
        confidence: 0.35,
        tags: expect.arrayContaining(["fallback"])
      })
    ]);
  });
});
