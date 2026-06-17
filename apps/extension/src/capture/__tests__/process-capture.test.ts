import { describe, expect, it } from "vitest";
import type { ConversationCapture } from "@contextvault/shared";
import { processConversationCapture } from "../process-capture";

function baseCapture(overrides: Partial<ConversationCapture> = {}): ConversationCapture {
  return {
    provider: "chatgpt",
    title: "ContextVault fixture",
    url: "https://chatgpt.com/c/fixture",
    capturedAt: "2026-06-07T00:00:00.000Z",
    captureMethod: "dom",
    turns: [
      {
        role: "user",
        text: "  请继续设计 ContextVault。  ",
        sourceSelector: "[data-message-author-role]"
      },
      {
        role: "assistant",
        text: "建议使用 Chrome Side Panel 作为沉淀和审核主界面。下一步实现 ChatGPT adapter 并补齐测试。",
        sourceSelector: "[data-message-author-role]"
      }
    ],
    warnings: [
      {
        code: "dom_fallback",
        message: "Captured from DOM."
      }
    ],
    ...overrides
  };
}

describe("capture processing pipeline", () => {
  it("turns a DOM capture into an archive, normalized turns, and proposed cards", async () => {
    let nextId = 0;
    const result = await processConversationCapture(baseCapture(), {
      archiveId: "archive-1",
      createId: () => `id-${++nextId}`,
      hash: async (text) => `hash:${text.length}`
    });

    expect(result.archive.id).toBe("archive-1");
    expect(result.archive.title).toBe("ContextVault fixture");
    expect(result.archive.contentHash).toMatch(/^hash:/);
    expect(result.archive.warnings.map((warning) => warning.code)).toContain("dom_fallback");
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]).toMatchObject({
      archiveId: "archive-1",
      role: "user",
      text: "请继续设计 ContextVault。",
      orderIndex: 0,
      sourceSelector: "[data-message-author-role]"
    });
    expect(result.turns[1]?.contentHash).toMatch(/^hash:/);
    expect(result.proposedCards.map((card) => card.type)).toEqual(expect.arrayContaining(["decision", "todo"]));
    expect(result.proposedCards.every((card) => card.sourceAnchors[0]?.archiveId === "archive-1")).toBe(true);
  });

  it("adds sensitivity warnings and avoids proposing obvious secret snippets", async () => {
    const result = await processConversationCapture(
      baseCapture({
        turns: [
          {
            role: "assistant",
            text: "下一步使用 api_key = sk-abcdefghijklmnopqrstuvwxyz123456 调用服务。"
          }
        ]
      }),
      {
        archiveId: "archive-secret",
        createId: () => "id-secret",
        hash: async (text) => `hash:${text.length}`
      }
    );

    expect(result.archive.warnings.map((warning) => warning.code)).toContain("secret_content_detected");
    expect(result.proposedCards).toEqual([]);
  });

  it("does not add a lower sensitivity warning when an upstream secret warning already exists", async () => {
    const result = await processConversationCapture(
      baseCapture({
        turns: [
          {
            role: "assistant",
            text: "Contact alice@example.com before launch."
          }
        ],
        warnings: [
          {
            code: "secret_content_detected",
            message: "Imported archive was already marked secret."
          }
        ]
      }),
      {
        archiveId: "archive-secret-warning",
        createId: () => "id-secret-warning",
        hash: async (text) => `hash:${text.length}`
      }
    );

    expect(result.archive.warnings.map((warning) => warning.code)).toEqual(["secret_content_detected"]);
  });

  it("adds a stronger warning when captured text is more sensitive than upstream warnings", async () => {
    const result = await processConversationCapture(
      baseCapture({
        turns: [
          {
            role: "assistant",
            text: "Use api_key = sk-abcdefghijklmnopqrstuvwxyz123456 only in the test vault."
          }
        ],
        warnings: [
          {
            code: "sensitive_content_detected",
            message: "Imported archive was already marked sensitive."
          }
        ]
      }),
      {
        archiveId: "archive-secret-upgrade",
        createId: () => "id-secret-upgrade",
        hash: async (text) => `hash:${text.length}`
      }
    );

    expect(result.archive.warnings.map((warning) => warning.code)).toEqual([
      "sensitive_content_detected",
      "secret_content_detected"
    ]);
  });

  it("throws when a capture contains no turns", async () => {
    await expect(
      processConversationCapture(
        baseCapture({
          turns: []
        })
      )
    ).rejects.toThrow("No conversation turns");
  });

  it("rejects malformed capture payloads before processing", async () => {
    await expect(
      processConversationCapture(
        baseCapture({
          capturedAt: "not-a-date",
          turns: [
            {
              role: "assistant",
              text: ""
            }
          ]
        })
      )
    ).rejects.toThrow("Invalid conversation capture ($.capturedAt: must be an ISO date string");
  });
});
