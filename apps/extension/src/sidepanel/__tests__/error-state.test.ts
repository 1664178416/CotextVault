import { describe, expect, it } from "vitest";
import { formatDisplayError, sanitizeDisplayErrorMessage } from "../error-state";

describe("side panel error state", () => {
  it("redacts protected values before showing error messages", () => {
    const message = formatDisplayError(
      new Error("Import failed for alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456"),
      "Import failed."
    );

    expect(message).toContain("[REDACTED_EMAIL]");
    expect(message).toContain("api_key=[REDACTED_SECRET]");
    expect(message).not.toContain("alice@example.com");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("keeps ordinary actionable errors readable", () => {
    expect(formatDisplayError(new Error("No active AI conversation tab found."), "Capture failed.")).toBe(
      "No active AI conversation tab found."
    );
  });

  it("uses fallbacks for non-error or blank errors", () => {
    expect(formatDisplayError("bad", "Search failed.")).toBe("Search failed.");
    expect(formatDisplayError(new Error("   "), "Search failed.")).toBe("Search failed.");
  });

  it("normalizes whitespace and truncates very long display errors", () => {
    const message = sanitizeDisplayErrorMessage(`First line\n${"x".repeat(80)}`, 32);

    expect(message).toBe("First line xxxxxxxxxxxxxxxxxx...");
    expect(message).toHaveLength(32);
  });
});
