import { describe, expect, it } from "vitest";
import { formatTabMessageError, sanitizeRuntimeErrorMessage } from "../../runtime-errors";

describe("runtime error formatting", () => {
  it("turns a missing content script runtime error into an actionable capture message", () => {
    expect(formatTabMessageError("Could not establish connection. Receiving end does not exist.")).toBe(
      "ContextVault content script is not available on this tab yet. Reload the AI conversation page and try again."
    );
  });

  it("preserves specific runtime errors and provides a fallback", () => {
    expect(formatTabMessageError("The tab was closed.")).toBe("The tab was closed.");
    expect(formatTabMessageError()).toBe("Unable to reach ContextVault content script.");
  });

  it("redacts protected values before returning runtime errors to extension callers", () => {
    const message = sanitizeRuntimeErrorMessage(
      "Import failed for alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
    );

    expect(message).toContain("[REDACTED_EMAIL]");
    expect(message).toContain("api_key=[REDACTED_SECRET]");
    expect(message).not.toContain("alice@example.com");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("normalizes and truncates long runtime errors", () => {
    const message = sanitizeRuntimeErrorMessage(`First line\n${"x".repeat(420)}`);

    expect(message.startsWith("First line ")).toBe(true);
    expect(message.endsWith("...")).toBe(true);
    expect(message.length).toBe(360);
  });
});
