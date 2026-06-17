import { describe, expect, it } from "vitest";
import { summarizeWarningsForDisplay } from "../warning-state";

describe("side panel warning state", () => {
  it("summarizes identical warnings for display", () => {
    expect(
      summarizeWarningsForDisplay([
        { code: "chatgpt_non_text_parts_skipped", message: "Skipped 1 non-text part." },
        { code: "chatgpt_non_text_parts_skipped", message: "Skipped 1 non-text part." },
        { code: "chatgpt_mapping_fallback", message: "Imported mapping messages by timestamp." }
      ])
    ).toEqual([
      {
        key: "chatgpt_mapping_fallback:1",
        code: "chatgpt_mapping_fallback",
        message: "Imported mapping messages by timestamp.",
        count: 1,
        severity: "medium"
      },
      {
        key: "chatgpt_non_text_parts_skipped:0",
        code: "chatgpt_non_text_parts_skipped",
        message: "Skipped 1 non-text part.",
        count: 2,
        severity: "low"
      }
    ]);
  });

  it("keeps same-code warnings separate when messages differ", () => {
    expect(
      summarizeWarningsForDisplay([
        { code: "chatgpt_non_text_parts_skipped", message: "Skipped 1 non-text part." },
        { code: "chatgpt_non_text_parts_skipped", message: "Skipped 2 non-text parts." }
      ])
    ).toEqual([
      expect.objectContaining({
        code: "chatgpt_non_text_parts_skipped",
        message: "Skipped 1 non-text part.",
        count: 1,
        severity: "low"
      }),
      expect.objectContaining({
        code: "chatgpt_non_text_parts_skipped",
        message: "Skipped 2 non-text parts.",
        count: 1,
        severity: "low"
      })
    ]);
  });

  it("orders higher-risk warnings before lower-risk warnings", () => {
    const warnings = summarizeWarningsForDisplay([
      { code: "chatgpt_non_text_parts_skipped", message: "Skipped non-text parts." },
      { code: "provider_selector_fallback", message: "Used fallback selectors." },
      { code: "secret_content_detected", message: "Captured archive appears to contain secrets." }
    ]);

    expect(warnings.map((warning) => warning.code)).toEqual([
      "secret_content_detected",
      "provider_selector_fallback",
      "chatgpt_non_text_parts_skipped"
    ]);
    expect(warnings.map((warning) => warning.severity)).toEqual(["high", "medium", "low"]);
  });

  it("limits displayed warning types and appends a safe omitted summary", () => {
    const warnings = summarizeWarningsForDisplay(
      [
        { code: "secret_content_detected", message: "Captured archive appears to contain secrets." },
        { code: "missing_user_turn", message: "Missing user turn." },
        { code: "missing_assistant_turn", message: "Missing assistant turn." },
        { code: "chatgpt_non_text_parts_skipped", message: "Skipped non-text parts." }
      ],
      { maxItems: 2 }
    );

    expect(warnings.map((warning) => warning.code)).toEqual([
      "secret_content_detected",
      "missing_assistant_turn",
      "warnings_omitted"
    ]);
    expect(warnings[2]).toMatchObject({
      message: "2 additional warning type(s) hidden.",
      count: 2,
      omittedCount: 2,
      severity: "low"
    });
  });

  it("redacts sensitive warning messages before display", () => {
    const warnings = summarizeWarningsForDisplay([
      {
        code: "provider_selector_fallback",
        message: "Fallback saw alice@example.com and api_key=sk-abcdefghijklmnopqrstuvwxyz123456."
      }
    ]);

    expect(warnings[0]?.message).toContain("[REDACTED_EMAIL]");
    expect(warnings[0]?.message).toContain("api_key=[REDACTED_SECRET]");
    expect(warnings[0]?.message).not.toContain("alice@example.com");
    expect(warnings[0]?.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("masks arbitrary secret warning messages that do not match a known pattern", () => {
    const warnings = summarizeWarningsForDisplay([
      {
        code: "secret_content_detected",
        message: "Private Bluebird archive note"
      }
    ]);

    expect(warnings[0]?.message).toBe("[REDACTED_SECRET_CONTENT]");
    expect(warnings[0]?.message).not.toContain("Bluebird");
  });

  it("truncates long warning messages after sanitizing them", () => {
    const warnings = summarizeWarningsForDisplay([
      {
        code: "chatgpt_non_text_parts_skipped",
        message: `Skipped ${"many ".repeat(80)}parts.`
      }
    ]);

    expect(warnings[0]?.message.length).toBeLessThanOrEqual(240);
    expect(warnings[0]?.message.endsWith("...")).toBe(true);
  });
});
