import { describe, expect, it } from "vitest";
import type { ConversationCapture } from "@contextvault/shared";
import { assertValidCapturedConversation } from "../capture-guard";

function capture(overrides: Partial<ConversationCapture> = {}): ConversationCapture {
  return {
    provider: "chatgpt",
    title: "Fixture conversation",
    url: "https://chatgpt.com/c/fixture",
    capturedAt: "2026-06-08T00:00:00.000Z",
    captureMethod: "dom",
    turns: [
      {
        role: "assistant",
        text: "Use reviewed memory cards."
      }
    ],
    warnings: [],
    ...overrides
  };
}

describe("capture guard", () => {
  it("returns validated content script captures for the requested provider", () => {
    expect(assertValidCapturedConversation(capture(), "chatgpt")).toMatchObject({
      provider: "chatgpt",
      captureMethod: "dom"
    });
  });

  it("rejects malformed content script captures with path-level validation details", () => {
    expect(() =>
      assertValidCapturedConversation(
        {
          ...capture(),
          turns: [
            {
              role: "assistant",
              text: ""
            }
          ],
          warnings: [{ code: "dom_fallback" }]
        },
        "chatgpt"
      )
    ).toThrow(
      "Content script returned invalid capture ($.turns[0].text: must be a non-empty string; $.warnings[0].message: must be a non-empty string)."
    );
  });

  it("rejects captures returned for a different provider than the active tab", () => {
    expect(() => assertValidCapturedConversation(capture({ provider: "gemini" }), "chatgpt")).toThrow(
      'Content script returned provider "gemini" for "chatgpt" capture request.'
    );
  });
});
