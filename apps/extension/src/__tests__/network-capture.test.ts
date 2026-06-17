import { describe, expect, it } from "vitest";
import { isLikelyCapturableNetworkResponse } from "@contextvault/shared";

describe("MAIN world network capture policy", () => {
  it("allows conversation-like JSON and stream responses", () => {
    expect(
      isLikelyCapturableNetworkResponse("https://chatgpt.com/backend-api/conversation", "application/json")
    ).toBe(true);
    expect(
      isLikelyCapturableNetworkResponse(
        "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
        "application/json; charset=utf-8"
      )
    ).toBe(true);
    expect(
      isLikelyCapturableNetworkResponse("https://claude.ai/api/organizations/abc/chat_conversations/xyz/completion", "text/event-stream")
    ).toBe(true);
  });

  it("rejects ordinary JSON endpoints even on supported AI origins", () => {
    expect(isLikelyCapturableNetworkResponse("https://chatgpt.com/api/auth/session", "application/json")).toBe(false);
    expect(isLikelyCapturableNetworkResponse("https://gemini.google.com/app/user/profile", "application/json")).toBe(false);
    expect(isLikelyCapturableNetworkResponse("https://claude.ai/api/organizations", "application/json")).toBe(false);
  });

  it("rejects route-like URLs without a capturable text response type", () => {
    expect(
      isLikelyCapturableNetworkResponse("https://chatgpt.com/backend-api/conversation", "image/png")
    ).toBe(false);
    expect(
      isLikelyCapturableNetworkResponse("https://chatgpt.com/backend-api/conversation", "")
    ).toBe(false);
  });
});
