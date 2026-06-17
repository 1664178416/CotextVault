import { describe, expect, it } from "vitest";
import { normalizeTag, normalizeTagList, parseTagInput } from "@contextvault/shared";

describe("tag normalization", () => {
  it("normalizes individual tag values", () => {
    expect(normalizeTag("  ##ChatGPT  ")).toBe("ChatGPT");
  });

  it("parses comma, semicolon, fullwidth separators, and newlines", () => {
    expect(parseTagInput(" #ChatGPT, workflow\uFF0Cchatgpt\nreview; method\uFF1B#method ")).toEqual([
      "ChatGPT",
      "workflow",
      "review",
      "method"
    ]);
  });

  it("deduplicates tag lists case-insensitively after hash trimming", () => {
    expect(normalizeTagList(["#Manual", "manual", " fallback ", "Fallback"])).toEqual(["Manual", "fallback"]);
  });
});
